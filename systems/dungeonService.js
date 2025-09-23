const CharacterModel = require('../models/Character');
const {
  serializeCharacter,
  findItemIndex,
  countItems,
  matchesItemId,
  ensureEquipmentShape,
} = require('../models/utils');
const { getAbilities } = require('./abilityService');
const { getEquipmentMap } = require('./equipmentService');
const { generateDungeonBoss } = require('./dungeonGA');
const { runDungeonCombat } = require('./combatEngine');
const { xpForNextLevel } = require('./characterService');
const { processJobForCharacter, ensureJobIdleForDoc } = require('./jobService');
const { compute } = require('./derivedStats');

const queues = {
  2: [],
  3: [],
  4: [],
  5: [],
};

const waitingEntries = new Map();
const activeMatches = new Map();
const participantMatches = new Map();

const FORGING_STATUS_MESSAGE = 'Match found! The dungeon core is forging your foe...';
const FORGING_STATUS_DETAIL = 'Calibrating encounter parameters.';
const ADVANCE_FORGING_MESSAGE = 'The dungeon core reforges its champion...';
const ADVANCE_FORGING_DETAIL = 'Binding echoes of the fallen into a fiercer form.';

async function loadCharacter(characterId) {
  const characterDoc = await CharacterModel.findOne({ characterId });
  if (!characterDoc) return null;
  const { changed } = await processJobForCharacter(characterDoc);
  if (changed) {
    await characterDoc.save();
  }
  ensureJobIdleForDoc(characterDoc);
  return serializeCharacter(characterDoc);
}

function dequeueEntry(entry) {
  if (!entry || !queues[entry.size]) return;
  const queue = queues[entry.size];
  const idx = queue.indexOf(entry);
  if (idx !== -1) {
    queue.splice(idx, 1);
  }
}

function cleanupWaiting(entry) {
  if (!entry) return;
  waitingEntries.delete(entry.character.id);
  participantMatches.delete(entry.character.id);
}

function sendSafe(entry, payload) {
  try {
    entry.send(payload);
  } catch (err) {
    // Ignore send failures; the SSE stream may already be closed.
  }
}

function sendQueued(entry) {
  if (!entry) return;
  sendSafe(entry, {
    type: 'queued',
    size: entry.size || null,
  });
}

function replayMatchState(entry, match) {
  if (!entry || !match) return;
  entry.matchId = match.id;
  const readyIds = Array.from(match.ready.values()).sort((a, b) => a - b);
  if (match.phase === 'decision' && match.decisionState) {
    const state = match.decisionState;
    const rewards =
      (state.rewards && state.rewards[entry.character.id]) || { xpGain: 0, gpGain: 0 };
    sendSafe(entry, {
      type: 'decision',
      mode: 'dungeon',
      matchId: match.id,
      action: state.action,
      outcome: state.outcome,
      ready: match.ready.size,
      total: match.entries.length,
      readyIds,
      party: match.partyPreview || [],
      boss: state.boss || match.preview || null,
      xpGain: rewards.xpGain,
      gpGain: rewards.gpGain,
      character: entry.character,
      gold: typeof entry.character.gold === 'number' ? entry.character.gold : 0,
      metrics: state.metrics || null,
      finalParty: state.finalParty || null,
      finalBoss: state.finalBoss || null,
      round: state.round || match.round || 1,
    });
    if (match.lastReady) {
      sendSafe(entry, {
        type: 'ready',
        matchId: match.id,
        ready: match.lastReady.ready,
        total: match.lastReady.total,
        readyIds: Array.isArray(match.lastReady.readyIds)
          ? match.lastReady.readyIds.slice()
          : readyIds,
        phase: match.phase,
        action: state.action,
      });
    }
    return;
  }
  if (!match.started && (!match.preview || match.phase === 'forging')) {
    sendSafe(entry, {
      type: 'matched',
      matchId: match.id,
      size: match.entries.length,
      message: FORGING_STATUS_MESSAGE,
      detail: FORGING_STATUS_DETAIL,
      phase: 'forging',
    });
  }
  if (match.partyPreview || match.preview) {
    sendSafe(entry, {
      type: 'preview',
      matchId: match.id,
      boss: match.preview || null,
      party: match.partyPreview || [],
      size: match.entries.length,
      ready: match.ready.size,
      readyIds,
      phase: match.phase,
    });
  }
  if (match.lastReady) {
    sendSafe(entry, {
      type: 'ready',
      matchId: match.id,
      ready: match.lastReady.ready,
      total: match.lastReady.total,
      readyIds: Array.isArray(match.lastReady.readyIds)
        ? match.lastReady.readyIds.slice()
        : readyIds,
      phase: match.lastReady.phase || match.phase,
      action: match.pendingAction || null,
    });
  }
  if (match.started && match.lastEvent) {
    const resumeEvent = clone(match.lastEvent);
    if (resumeEvent && typeof resumeEvent === 'object') {
      resumeEvent.matchId = match.id;
      resumeEvent.youId = entry.character.id;
      sendSafe(entry, resumeEvent);
    }
  }
}

function finalizeEntry(entry) {
  if (!entry || entry.completed) return;
  entry.completed = true;
  cleanupWaiting(entry);
  if (typeof entry.resolve === 'function') {
    entry.resolve();
  }
}

function cancelEntry(entry, message = 'dungeon cancelled') {
  if (!entry || entry.completed) return;
  if (entry.status === 'queued') {
    dequeueEntry(entry);
  }
  sendSafe(entry, { type: 'error', message });
  finalizeEntry(entry);
}

function resolveEquipmentForPreview(equipment, equipmentMap) {
  const resolved = {};
  const source = ensureEquipmentShape(equipment || {});
  Object.entries(source).forEach(([slot, id]) => {
    if (id && equipmentMap && equipmentMap.has(id)) {
      resolved[slot] = equipmentMap.get(id);
    } else {
      resolved[slot] = null;
    }
  });
  return resolved;
}

function buildPartyMemberPreview(character, equipmentMap) {
  if (!character) return null;
  const equipment = ensureEquipmentShape(character.equipment || {});
  const resolved = resolveEquipmentForPreview(equipment, equipmentMap);
  const derived = compute(character, resolved);
  const attributes = { ...(character.attributes || {}) };
  const preview = {
    id: character.id,
    name: character.name,
    level: character.level,
    basicType: character.basicType,
    attributes,
    equipment,
    rotation: Array.isArray(character.rotation) ? character.rotation.slice() : [],
  };
  if (derived && typeof derived === 'object') {
    preview.derived = {
      attackIntervalSeconds: derived.attackIntervalSeconds,
      minMeleeAttack: derived.minMeleeAttack,
      maxMeleeAttack: derived.maxMeleeAttack,
      minMagicAttack: derived.minMagicAttack,
      maxMagicAttack: derived.maxMagicAttack,
      health: derived.health,
      mana: derived.mana,
      stamina: derived.stamina,
      meleeResist: derived.meleeResist,
      magicResist: derived.magicResist,
      critChance: derived.critChance,
      blockChance: derived.blockChance,
      dodgeChance: derived.dodgeChance,
      hitChance: derived.hitChance,
    };
  }
  return preview;
}

function summarizeParty(entries, equipmentMap) {
  if (!Array.isArray(entries)) return [];
  return entries
    .map(item => (item && item.character ? buildPartyMemberPreview(item.character, equipmentMap) : null))
    .filter(Boolean);
}

function applyUseableConsumption(entry, consumedMap, characterDoc) {
  if (!entry || !characterDoc) return;
  const consumed = consumedMap[entry.character.id] || [];
  if (!consumed.length) return;
  if (!characterDoc.useables) {
    characterDoc.useables = { useable1: null, useable2: null };
  }
  let modifiedUseables = false;
  let itemsModified = false;
  if (!Array.isArray(characterDoc.items)) {
    characterDoc.items = [];
  }
  consumed.forEach(useable => {
    const idx = findItemIndex(characterDoc.items, useable.itemId);
    if (idx !== -1) {
      characterDoc.items.splice(idx, 1);
      itemsModified = true;
    }
    if (matchesItemId(characterDoc.useables[useable.slot], useable.itemId)) {
      const remaining = countItems(characterDoc.items, useable.itemId);
      if (remaining <= 0) {
        characterDoc.useables[useable.slot] = null;
        modifiedUseables = true;
      }
    }
  });
  if (itemsModified && typeof characterDoc.markModified === 'function') {
    characterDoc.markModified('items');
  }
  if (modifiedUseables && typeof characterDoc.markModified === 'function') {
    characterDoc.markModified('useables');
  }
}

function computeRewards(doc, won, partySize, metrics) {
  const level = doc.level || 1;
  const basePct = won ? 0.07 : 0.035;
  const sizeBonus = Math.max(0, partySize - 2) * 0.01;
  const pressureBonus = Math.min(0.03, (metrics.damageToParty || 0) / Math.max(1, metrics.damageToBoss || 1) * 0.01);
  const pct = basePct + sizeBonus + pressureBonus;
  const xpGain = Math.max(30, Math.round(xpForNextLevel(level) * pct));
  const gpBase = won ? 18 + partySize * 4 : 8 + partySize * 2;
  return { xpGain, gpGain: gpBase };
}

async function finalizeMatch(match, result) {
  if (!match) return;
  const entries = match.entries || [];
  const partyIds = entries.map(entry => entry.character.id);
  const characterDocs = await CharacterModel.find({ characterId: { $in: partyIds } });
  const docMap = new Map();
  characterDocs.forEach(doc => {
    docMap.set(doc.characterId, doc);
  });
  const consumedMap = result.consumedUseables || {};

  const updates = [];
  entries.forEach(entry => {
    const doc = docMap.get(entry.character.id);
    if (!doc) return;
    applyUseableConsumption(entry, consumedMap, doc);
    const won = result.winnerSide === 'party';
    const rewards = computeRewards(doc, won, entries.length, result.metrics || {});
    doc.xp = (doc.xp || 0) + rewards.xpGain;
    doc.gold = (doc.gold || 0) + rewards.gpGain;
    updates.push({ entry, doc, rewards });
  });

  await Promise.all(characterDocs.map(doc => doc.save()));

  if (!match.ready) {
    match.ready = new Set();
  } else {
    match.ready.clear();
  }
  match.entries.forEach(entry => {
    entry.ready = false;
  });
  match.lastReady = { ready: 0, total: entries.length, readyIds: [], phase: match.phase };

  const rewardMap = new Map();
  updates.forEach(update => {
    const { entry, doc, rewards } = update;
    const serialized = serializeCharacter(doc);
    rewardMap.set(serialized.id, rewards);
    entry.character = serialized;
  });

  match.partyPreview = summarizeParty(entries, match.equipmentMap);

  const bossPreview = match.preview ? clone(match.preview) : null;
  const outcome = result.winnerSide === 'party' ? 'victory' : 'defeat';
  const pendingAction = result.winnerSide === 'party' ? 'advance' : 'retry';

  let nextBossCharacter = null;
  let nextBossPreview = null;
  let nextBossGenome = null;
  let nextPartnerGenome = null;
  if (pendingAction === 'advance') {
    try {
      const seeds = [];
      if (match.bossGenome) seeds.push(match.bossGenome);
      if (match.partnerGenome) seeds.push(match.partnerGenome);
      const options = seeds.length ? { seedGenomes: seeds } : {};
      const bossData = await generateDungeonBoss(
        match.entries.map(entry => entry.character),
        match.abilityMap,
        match.equipmentMap,
        options,
      );
      nextBossCharacter = clone(bossData.character || null);
      nextBossPreview = clone(bossData.preview || null);
      nextBossGenome = bossData.genome || null;
      nextPartnerGenome = bossData.partnerGenome || null;
    } catch (err) {
      console.warn('Failed to prepare next dungeon boss preview', err);
      nextBossCharacter = null;
      nextBossPreview = null;
      nextBossGenome = null;
      nextPartnerGenome = null;
    }
  }

  match.nextBoss = nextBossCharacter;
  match.nextBossPreview = nextBossPreview;
  match.nextBossGenome = nextBossGenome;
  match.nextPartnerGenome = nextPartnerGenome;

  match.pendingAction = pendingAction;
  match.decisionState = {
    action: pendingAction,
    outcome,
    boss: nextBossPreview || bossPreview,
    metrics: result.metrics ? clone(result.metrics) : null,
    finalParty: Array.isArray(result.finalParty) ? result.finalParty : null,
    finalBoss: result.finalBoss || null,
    rewards: {},
    round: match.round || 1,
  };
  rewardMap.forEach((rewards, id) => {
    match.decisionState.rewards[id] = {
      xpGain: rewards.xpGain,
      gpGain: rewards.gpGain,
    };
  });

  match.phase = 'decision';
  if (match.lastReady) {
    match.lastReady.phase = match.phase;
  }
  match.started = false;
  match.lastEvent = null;

  entries.forEach(entry => {
    const rewards =
      match.decisionState.rewards[entry.character.id] || { xpGain: 0, gpGain: 0 };
    sendSafe(entry, {
      type: 'decision',
      mode: 'dungeon',
      matchId: match.id,
      action: pendingAction,
      outcome,
      ready: 0,
      total: entries.length,
      readyIds: [],
      party: match.partyPreview,
      boss: nextBossPreview || bossPreview,
      partyIds: match.entries.map(item => (item && item.character ? item.character.id : null)).filter(
        id => id != null,
      ),
      bossId:
        (nextBossCharacter && nextBossCharacter.id != null ? nextBossCharacter.id : null) ||
        (nextBossPreview && nextBossPreview.id != null ? nextBossPreview.id : null) ||
        (match.boss && match.boss.id != null ? match.boss.id : null) ||
        (bossPreview && bossPreview.id != null ? bossPreview.id : null),
      xpGain: rewards.xpGain,
      gpGain: rewards.gpGain,
      character: entry.character,
      gold: typeof entry.character.gold === 'number' ? entry.character.gold : 0,
      metrics: result.metrics || null,
      finalParty: Array.isArray(result.finalParty) ? result.finalParty : null,
      finalBoss: result.finalBoss || null,
      round: match.round || 1,
    });
  });
}

async function startBattle(match) {
  if (!match || match.started) return;
  match.started = true;
  match.phase = 'encounter';
  match.pendingAction = null;
  match.decisionState = null;
  if (!match.ready) {
    match.ready = new Set();
  } else {
    match.ready.clear();
  }
  match.entries.forEach(entry => {
    entry.ready = false;
  });
  match.lastReady = { ready: 0, total: match.entries.length, readyIds: [], phase: match.phase };
  match.lastEvent = null;
  match.partyPreview = summarizeParty(match.entries, match.equipmentMap);

  const party = match.entries.map(entry => clone(entry.character));
  const boss = clone(match.boss);
  const onUpdate = event => {
    const baseEvent = clone(event);
    match.lastEvent = baseEvent;
    match.entries.forEach(entry => {
      const payload = clone(baseEvent);
      payload.matchId = match.id;
      payload.youId = entry.character.id;
      sendSafe(entry, payload);
    });
  };
  const result = await runDungeonCombat(party, boss, match.abilityMap, match.equipmentMap, onUpdate);
  match.started = false;
  match.lastEvent = null;
  await finalizeMatch(match, result);
}

async function readyForDungeon(matchId, characterId) {
  if (!activeMatches.has(matchId)) {
    throw new Error('match not found');
  }
  const match = activeMatches.get(matchId);
  const entry = match.entries.find(item => item.character.id === characterId);
  if (!entry) {
    throw new Error('participant not found');
  }
  if (entry.ready) {
    const readyMembers = Array.from(match.ready.values()).sort((a, b) => a - b);
    return { ready: match.ready.size, total: match.entries.length, readyIds: readyMembers };
  }
  entry.ready = true;
  match.ready.add(characterId);
  const readyMembers = Array.from(match.ready.values()).sort((a, b) => a - b);
  const payload = {
    type: 'ready',
    matchId: match.id,
    ready: match.ready.size,
    total: match.entries.length,
    readyIds: readyMembers,
    phase: match.phase || 'preview',
  };
  match.lastReady = {
    ready: match.ready.size,
    total: match.entries.length,
    readyIds: readyMembers,
    phase: match.phase || 'preview',
  };
  match.entries.forEach(item => sendSafe(item, payload));
  if (match.ready.size >= match.entries.length) {
    await startBattle(match);
  }
  return { ready: match.ready.size, total: match.entries.length, readyIds: readyMembers };
}

async function proceedAfterDecision(match) {
  if (!match) return;
  const action = match.pendingAction;
  match.pendingAction = null;
  match.decisionState = null;
  if (!match.ready) {
    match.ready = new Set();
  } else {
    match.ready.clear();
  }
  match.entries.forEach(entry => {
    entry.ready = false;
  });
  match.lastReady = { ready: 0, total: match.entries.length, readyIds: [] };

  if (action === 'advance') {
    match.phase = 'forging';
    const forgingPayload = {
      type: 'matched',
      matchId: match.id,
      size: match.entries.length,
      message: ADVANCE_FORGING_MESSAGE,
      detail: ADVANCE_FORGING_DETAIL,
      phase: 'forging',
    };
    match.entries.forEach(entry => sendSafe(entry, forgingPayload));
    const preparedBoss = match.nextBoss ? clone(match.nextBoss) : null;
    const preparedPreview = match.nextBossPreview ? clone(match.nextBossPreview) : null;
    const preparedGenome = match.nextBossGenome || null;
    const preparedPartnerGenome = match.nextPartnerGenome || null;
    match.nextBoss = null;
    match.nextBossPreview = null;
    match.nextBossGenome = null;
    match.nextPartnerGenome = null;
    if (preparedBoss && preparedPreview) {
      match.boss = preparedBoss;
      match.preview = preparedPreview;
      match.bossGenome = preparedGenome;
      match.partnerGenome = preparedPartnerGenome;
      match.round = (match.round || 1) + 1;
      match.partyPreview = summarizeParty(match.entries, match.equipmentMap);
      await startBattle(match);
      return;
    }
    try {
      const seeds = [];
      if (match.bossGenome) seeds.push(match.bossGenome);
      if (match.partnerGenome) seeds.push(match.partnerGenome);
      const options = seeds.length ? { seedGenomes: seeds } : {};
      const bossData = await generateDungeonBoss(
        match.entries.map(entry => entry.character),
        match.abilityMap,
        match.equipmentMap,
        options,
      );
      match.boss = bossData.character;
      match.preview = bossData.preview;
      match.bossGenome = bossData.genome || null;
      match.partnerGenome = bossData.partnerGenome || null;
      match.round = (match.round || 1) + 1;
      match.partyPreview = summarizeParty(match.entries, match.equipmentMap);
      await startBattle(match);
    } catch (err) {
      const message = err && err.message ? err.message : 'Failed to advance dungeon.';
      match.entries.forEach(entry => cancelEntry(entry, message));
      activeMatches.delete(match.id);
    }
    return;
  }

  if (action === 'retry') {
    await startBattle(match);
  }
}

async function readyForDungeonDecision(matchId, characterId) {
  if (!activeMatches.has(matchId)) {
    throw new Error('match not found');
  }
  const match = activeMatches.get(matchId);
  if (!match || match.phase !== 'decision') {
    throw new Error('continuation unavailable');
  }
  const entry = match.entries.find(item => item.character.id === characterId);
  if (!entry) {
    throw new Error('participant not found');
  }
  if (entry.ready) {
    const readyMembers = Array.from(match.ready.values()).sort((a, b) => a - b);
    return { ready: match.ready.size, total: match.entries.length, readyIds: readyMembers };
  }
  entry.ready = true;
  match.ready.add(characterId);
  const readyMembers = Array.from(match.ready.values()).sort((a, b) => a - b);
  const payload = {
    type: 'ready',
    matchId: match.id,
    ready: match.ready.size,
    total: match.entries.length,
    readyIds: readyMembers,
    phase: match.phase || 'decision',
    action: match.pendingAction || null,
  };
  match.lastReady = {
    ready: match.ready.size,
    total: match.entries.length,
    readyIds: readyMembers,
    phase: match.phase || 'decision',
  };
  match.entries.forEach(item => sendSafe(item, payload));
  if (match.ready.size >= match.entries.length) {
    await proceedAfterDecision(match);
  }
  return { ready: match.ready.size, total: match.entries.length, readyIds: readyMembers };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value || null));
}

async function createMatch(entries) {
  const matchId = `dungeon-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const match = {
    id: matchId,
    entries,
    abilityMap: null,
    equipmentMap: null,
    boss: null,
    preview: null,
    ready: new Set(),
    started: false,
    lastEvent: null,
    lastReady: { ready: 0, total: entries.length, readyIds: [] },
    phase: 'forging',
    bossGenome: null,
    partnerGenome: null,
    nextBoss: null,
    nextBossPreview: null,
    nextBossGenome: null,
    nextPartnerGenome: null,
    pendingAction: null,
    decisionState: null,
    round: 1,
  };
  activeMatches.set(matchId, match);
  entries.forEach(entry => {
    entry.status = 'matched';
    entry.matchId = matchId;
    participantMatches.set(entry.character.id, matchId);
    sendSafe(entry, {
      type: 'matched',
      matchId,
      size: entries.length,
      message: FORGING_STATUS_MESSAGE,
      detail: FORGING_STATUS_DETAIL,
      phase: 'forging',
    });
  });

  try {
    const [abilities, equipmentMap] = await Promise.all([getAbilities(), getEquipmentMap()]);
    const abilityMap = new Map(abilities.map(ability => [ability.id, ability]));
    match.abilityMap = abilityMap;
    match.equipmentMap = equipmentMap;
    const summary = summarizeParty(entries, equipmentMap);
    match.partyPreview = summary;

    const bossData = await generateDungeonBoss(
      entries.map(entry => entry.character),
      abilityMap,
      equipmentMap,
    );
    match.boss = bossData.character;
    match.preview = bossData.preview;
    match.bossGenome = bossData.genome || null;
    match.partnerGenome = bossData.partnerGenome || null;
    match.phase = 'preview';
    entries.forEach(entry => {
      sendSafe(entry, {
        type: 'preview',
        matchId,
        boss: match.preview,
        party: summary,
        size: entries.length,
        ready: 0,
        readyIds: [],
        phase: 'preview',
      });
    });
    return match;
  } catch (err) {
    activeMatches.delete(matchId);
    entries.forEach(entry => {
      participantMatches.delete(entry.character.id);
    });
    throw err;
  }
}

function tryStartMatch(size) {
  const queue = queues[size];
  if (!queue || queue.length < size) {
    return;
  }
  const entries = queue.splice(0, size);
  createMatch(entries).catch(err => {
    entries.forEach(entry => {
      cancelEntry(entry, err.message || 'failed to start dungeon');
    });
  });
}

function attachExistingEntry(entry, send) {
  if (!entry) {
    return { promise: Promise.resolve(), cancel: () => {} };
  }
  entry.send = send;
  if (!entry.promise) {
    entry.promise = new Promise(resolve => {
      entry.resolve = resolve;
    });
  }
  if (entry.status === 'queued') {
    sendQueued(entry);
  }
  const matchId = participantMatches.get(entry.character.id) || entry.matchId;
  if (matchId && activeMatches.has(matchId)) {
    const match = activeMatches.get(matchId);
    if (match) {
      replayMatchState(entry, match);
    }
  }
  return {
    promise: entry.promise,
    cancel: reason => cancelDungeon(entry.character.id, reason || 'dungeon cancelled'),
  };
}

async function queueDungeon(characterId, size, send) {
  const groupSize = Number.isFinite(size) ? Math.min(5, Math.max(2, size)) : 2;
  if (waitingEntries.has(characterId)) {
    return attachExistingEntry(waitingEntries.get(characterId), send);
  }
  if (participantMatches.has(characterId)) {
    const matchId = participantMatches.get(characterId);
    const match = activeMatches.get(matchId);
    if (match) {
      const entry = match.entries.find(item => item.character.id === characterId);
      if (entry) {
        if (!waitingEntries.has(characterId)) {
          waitingEntries.set(characterId, entry);
        }
        return attachExistingEntry(entry, send);
      }
    }
    throw new Error('character already queued');
  }

  const character = await loadCharacter(characterId);
  if (!character) {
    throw new Error('character not found');
  }
  if (!character.rotation || character.rotation.length < 3) {
    throw new Error('character rotation invalid');
  }

  let entry;
  const promise = new Promise(resolve => {
    entry = {
      character,
      send,
      resolve,
      size: groupSize,
      status: 'queued',
      ready: false,
      completed: false,
    };
    queues[groupSize].push(entry);
    waitingEntries.set(character.id, entry);
    sendQueued(entry);
    tryStartMatch(groupSize);
  });
  if (entry) {
    entry.promise = promise;
  }

  return {
    promise,
    cancel: reason => cancelDungeon(character.id, reason || 'dungeon cancelled'),
  };
}

function cancelDungeon(characterId, reason) {
  if (waitingEntries.has(characterId)) {
    const entry = waitingEntries.get(characterId);
    if (entry && entry.matchId && activeMatches.has(entry.matchId)) {
      const match = activeMatches.get(entry.matchId);
      if (match && disbandMatch(match, characterId, reason)) {
        return true;
      }
    }
    cancelEntry(entry, reason || 'connection closed');
    return true;
  }
  if (participantMatches.has(characterId)) {
    const matchId = participantMatches.get(characterId);
    const match = activeMatches.get(matchId);
    if (match && disbandMatch(match, characterId, reason)) {
      return true;
    }
  }
  return false;
}

function disbandMatch(match, leavingId, reason) {
  if (!match || match.started) {
    return false;
  }
  match.entries.forEach(item => {
    if (!item || !item.character) return;
    if (item.character.id !== leavingId) {
      cancelEntry(item, 'party disbanded');
    } else {
      cancelEntry(item, reason || 'connection closed');
    }
  });
  activeMatches.delete(match.id);
  return true;
}

function buildMatchStatus(entry, match) {
  if (!entry || !match) {
    return {
      state: entry && entry.status === 'matched' ? 'matched' : 'queued',
      size: entry && entry.size ? entry.size : null,
      phase: entry && entry.status === 'matched' ? 'forging' : 'queued',
    };
  }
  const readyIds = Array.from(match.ready.values()).sort((a, b) => a - b);
  const phase = match.started
    ? 'encounter'
    : match.phase
    ? match.phase
    : match.preview
    ? 'preview'
    : 'forging';
  const status = {
    state: match.started ? 'in-progress' : 'matched',
    size: match.entries.length,
    matchId: match.id,
    ready: match.ready.size,
    readyTotal: match.entries.length,
    readyIds,
    youReady: !!entry.ready,
    party: Array.isArray(match.partyPreview) ? clone(match.partyPreview) : [],
    boss: match.preview ? clone(match.preview) : null,
    partyIds: match.entries.map(item => (item && item.character ? item.character.id : null)).filter(
      id => id != null
    ),
    bossId:
      match.boss && match.boss.id != null
        ? match.boss.id
        : match.preview && match.preview.id != null
        ? match.preview.id
        : null,
    phase,
    round: match.round || 1,
  };
  if (phase === 'decision' && match.decisionState) {
    const state = match.decisionState;
    const rewards = state.rewards && state.rewards[entry.character.id];
    status.decision = {
      action: state.action,
      outcome: state.outcome,
      round: state.round || match.round || 1,
    };
    if (state.metrics) {
      status.metrics = clone(state.metrics);
    }
    if (state.finalParty) {
      status.finalParty = clone(state.finalParty);
    }
    if (state.finalBoss) {
      status.finalBoss = clone(state.finalBoss);
    }
    if (rewards) {
      status.xpGain = rewards.xpGain;
      status.gpGain = rewards.gpGain;
    }
    if (state.boss) {
      status.boss = clone(state.boss);
    }
    status.pendingAction = match.pendingAction || state.action;
  }
  return status;
}

function getDungeonStatus(characterId) {
  if (!Number.isFinite(characterId)) {
    return { state: 'idle' };
  }
  if (waitingEntries.has(characterId)) {
    const entry = waitingEntries.get(characterId);
    if (entry && entry.matchId && activeMatches.has(entry.matchId)) {
      return buildMatchStatus(entry, activeMatches.get(entry.matchId));
    }
    return {
      state: entry && entry.status === 'matched' ? 'matched' : 'queued',
      size: entry ? entry.size : null,
    };
  }
  if (participantMatches.has(characterId)) {
    const matchId = participantMatches.get(characterId);
    const match = activeMatches.get(matchId);
    if (match) {
      const entry = match.entries.find(item => item.character.id === characterId);
      if (entry) {
        return buildMatchStatus(entry, match);
      }
    }
  }
  return { state: 'idle' };
}

module.exports = {
  queueDungeon,
  cancelDungeon,
  readyForDungeon,
  readyForDungeonDecision,
  getDungeonStatus,
};
