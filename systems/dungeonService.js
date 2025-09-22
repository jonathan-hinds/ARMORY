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
  if (match.partyPreview || match.preview) {
    sendSafe(entry, {
      type: 'preview',
      matchId: match.id,
      boss: match.preview || null,
      party: match.partyPreview || [],
      size: match.entries.length,
      ready: match.ready.size,
      readyIds,
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

  updates.forEach(update => {
    const { entry, doc, rewards } = update;
    sendSafe(entry, {
      type: 'end',
      mode: 'dungeon',
      matchId: match.id,
      winnerSide: result.winnerSide,
      xpGain: rewards.xpGain,
      gpGain: rewards.gpGain,
      character: serializeCharacter(doc),
      gold: typeof doc.gold === 'number' ? doc.gold : 0,
      metrics: result.metrics || null,
      finalParty: Array.isArray(result.finalParty) ? result.finalParty : null,
      finalBoss: result.finalBoss || null,
    });
    finalizeEntry(entry);
  });
}

async function startBattle(match) {
  if (!match || match.started) return;
  match.started = true;
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
  activeMatches.delete(match.id);
  match.entries.forEach(entry => {
    participantMatches.delete(entry.character.id);
  });
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
  };
  match.lastReady = {
    ready: match.ready.size,
    total: match.entries.length,
    readyIds: readyMembers,
  };
  match.entries.forEach(item => sendSafe(item, payload));
  if (match.ready.size >= match.entries.length) {
    await startBattle(match);
  }
  return { ready: match.ready.size, total: match.entries.length, readyIds: readyMembers };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value || null));
}

async function createMatch(entries) {
  const [abilities, equipmentMap] = await Promise.all([getAbilities(), getEquipmentMap()]);
  const abilityMap = new Map(abilities.map(ability => [ability.id, ability]));
  const bossData = await generateDungeonBoss(entries.map(entry => entry.character), abilityMap, equipmentMap);
  const matchId = `dungeon-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const match = {
    id: matchId,
    entries,
    abilityMap,
    equipmentMap,
    boss: bossData.character,
    preview: bossData.preview,
    ready: new Set(),
    started: false,
    lastEvent: null,
    lastReady: { ready: 0, total: entries.length, readyIds: [] },
  };
  activeMatches.set(matchId, match);
  entries.forEach(entry => {
    entry.status = 'matched';
    entry.matchId = matchId;
    participantMatches.set(entry.character.id, matchId);
  });
  const summary = summarizeParty(entries, equipmentMap);
  match.partyPreview = summary;
  entries.forEach(entry => {
    sendSafe(entry, {
      type: 'preview',
      matchId,
      boss: match.preview,
      party: summary,
      size: entries.length,
      ready: 0,
      readyIds: [],
    });
  });
  return match;
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
    };
  }
  const readyIds = Array.from(match.ready.values()).sort((a, b) => a - b);
  return {
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
  };
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

module.exports = { queueDungeon, cancelDungeon, readyForDungeon, getDungeonStatus };
