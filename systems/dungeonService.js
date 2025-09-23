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
const continuations = new Map();

const FORGING_STATUS_MESSAGE = 'Match found! The dungeon core is forging your foe...';
const FORGING_STATUS_DETAIL = 'Calibrating encounter parameters.';

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

  const continuation = buildContinuation(match, result);
  const continuationToken = continuation ? continuation.token : null;
  const continuationSize = continuation ? continuation.size : null;
  const canAdvance = continuation ? continuation.canAdvance : false;

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
      continuationToken,
      canAdvance,
      partyIds,
      partySize: continuationSize,
    });
    finalizeEntry(entry);
  });
}

function cloneParentGenomes(parents) {
  if (!parents || typeof parents !== 'object') {
    return null;
  }
  return {
    champion: parents.champion ? clone(parents.champion) : null,
    partner: parents.partner ? clone(parents.partner) : null,
  };
}

function normalizePartyIds(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return [];
  }
  const unique = [];
  const seen = new Set();
  entries.forEach(entry => {
    if (!entry || !entry.character) return;
    const rawId = entry.character.id;
    const numericId = Number.isFinite(rawId)
      ? rawId
      : Number.parseInt(rawId, 10);
    if (!Number.isFinite(numericId) || seen.has(numericId)) {
      return;
    }
    seen.add(numericId);
    unique.push(numericId);
  });
  return unique;
}

function countContinuationVotes(continuation) {
  if (
    !continuation
    || !Array.isArray(continuation.partyIds)
    || !(continuation.votes instanceof Map)
  ) {
    return 0;
  }
  if (continuation.partyIds.length === continuation.votes.size) {
    return continuation.votes.size;
  }
  let count = 0;
  continuation.partyIds.forEach(id => {
    if (continuation.votes.has(id)) {
      count += 1;
    }
  });
  return count;
}

function buildContinuation(match, result) {
  if (!match || !Array.isArray(match.entries) || match.entries.length === 0) {
    return null;
  }
  const partyIds = normalizePartyIds(match.entries);
  if (!partyIds.length) {
    return null;
  }
  const token = `${match.id}-${Math.random().toString(36).slice(2, 10)}`;
  const continuation = {
    token,
    partyIds,
    size: partyIds.length,
    canAdvance: result && result.winnerSide === 'party',
    lastBoss: match.boss ? clone(match.boss) : null,
    lastPreview: match.preview ? clone(match.preview) : null,
    parentGenomes: match.parentGenomes ? cloneParentGenomes(match.parentGenomes) : null,
    votes: new Map(),
    status: 'awaiting-choice',
    mode: null,
    entries: new Map(),
    matchPromise: null,
    started: false,
    waiters: new Map(),
  };
  continuations.set(token, continuation);
  return continuation;
}

function buildContinuationResponse(continuation, status, { action, conflict = false } = {}) {
  const payload = {
    status,
    partySize: continuation.size,
    canAdvance: continuation.canAdvance,
  };
  if (status === 'ready') {
    payload.action = continuation.mode;
    payload.token = continuation.token;
  } else {
    payload.action = action;
    const votes = countContinuationVotes(continuation);
    payload.waitingFor = Math.max(0, continuation.partyIds.length - votes);
    payload.conflict = conflict;
  }
  return payload;
}

function createResolvedContinuationHandle(payload) {
  return {
    promise: Promise.resolve(payload),
    cancel: () => {},
  };
}

function ensureContinuationWaiters(continuation) {
  if (!continuation.waiters || !(continuation.waiters instanceof Map)) {
    continuation.waiters = new Map();
  }
  return continuation.waiters;
}

function resolveContinuationWaiters(continuation, payload) {
  if (!continuation.waiters || continuation.waiters.size === 0) {
    return;
  }
  const waiters = Array.from(continuation.waiters.values());
  continuation.waiters.clear();
  waiters.forEach(waiter => {
    if (!waiter || typeof waiter.resolve !== 'function') return;
    try {
      waiter.resolve(payload);
    } catch (err) {
      // Ignore waiter resolution failures.
    }
  });
}

function createContinuationWaitHandle(continuation, characterId) {
  const waiters = ensureContinuationWaiters(continuation);
  if (waiters.has(characterId)) {
    const existing = waiters.get(characterId);
    if (existing && existing.handle) {
      return existing.handle;
    }
    waiters.delete(characterId);
  }
  let externalResolve;
  let externalReject;
  const promise = new Promise((resolve, reject) => {
    externalResolve = resolve;
    externalReject = reject;
  });
  const waiter = {
    settled: false,
    resolve(payload) {
      if (this.settled) return;
      this.settled = true;
      externalResolve(payload);
    },
    reject(reason) {
      if (this.settled) return;
      this.settled = true;
      externalReject(reason instanceof Error ? reason : new Error(String(reason || 'continuation failed')));
    },
    handle: null,
  };
  const handle = {
    promise,
    cancel: reason => {
      if (waiter.settled) {
        return;
      }
      waiter.settled = true;
      waiters.delete(characterId);
      if (continuation.status !== 'ready') {
        continuation.votes.delete(characterId);
      }
      externalReject(new Error(reason || 'continuation request cancelled'));
    },
  };
  waiter.handle = handle;
  waiters.set(characterId, waiter);
  return handle;
}

function continueDungeon(token, characterId, action = 'retry') {
  const normalizedToken = typeof token === 'string' ? token.trim() : '';
  if (!normalizedToken) {
    throw new Error('continuation token required');
  }
  if (!continuations.has(normalizedToken)) {
    throw new Error('continuation expired');
  }
  const continuation = continuations.get(normalizedToken);
  if (!continuation.partyIds.includes(characterId)) {
    throw new Error('character not part of this encounter');
  }
  if (continuation.status === 'consumed') {
    throw new Error('continuation consumed');
  }
  const normalizedAction = action === 'advance' ? 'advance' : 'retry';
  if (normalizedAction === 'advance' && !continuation.canAdvance) {
    throw new Error('advance unavailable');
  }
  if (continuation.status === 'ready') {
    if (continuation.mode && continuation.mode !== normalizedAction) {
      throw new Error('party chose a different path');
    }
    return createResolvedContinuationHandle(buildContinuationResponse(continuation, 'ready'));
  }
  continuation.votes.set(characterId, normalizedAction);
  const total = continuation.partyIds.length;

  if (countContinuationVotes(continuation) < total) {
    const waitHandle = createContinuationWaitHandle(continuation, characterId);
    return waitHandle;
  }

  const voteSet = new Set(continuation.votes.values());
  if (voteSet.size > 1) {
    const payload = buildContinuationResponse(continuation, 'pending', {
      action: normalizedAction,
      conflict: true,
    });
    continuation.mode = null;
    continuation.status = 'awaiting-choice';
    continuation.votes.clear();
    resolveContinuationWaiters(continuation, payload);
    return createResolvedContinuationHandle(payload);
  }

  continuation.mode = normalizedAction;
  continuation.status = 'ready';
  const payload = buildContinuationResponse(continuation, 'ready');
  resolveContinuationWaiters(continuation, payload);
  return createResolvedContinuationHandle(payload);
}

function buildContinuationMatchOptions(continuation) {
  const options = {};
  if (continuation.mode === 'retry' && continuation.lastBoss) {
    options.fixedBoss = continuation.lastBoss;
    options.fixedPreview = continuation.lastPreview;
  }
  if (continuation.parentGenomes) {
    options.parentGenomes = cloneParentGenomes(continuation.parentGenomes);
  }
  return options;
}

async function startContinuationMatch(continuation) {
  if (!continuation || continuation.started) {
    return continuation && continuation.matchPromise;
  }
  continuation.started = true;
  const entries = Array.from(continuation.entries.values());
  const options = buildContinuationMatchOptions(continuation);
  try {
    const promise = createMatch(entries, options);
    continuation.matchPromise = promise;
    await promise;
  } finally {
    continuation.status = 'consumed';
    continuations.delete(continuation.token);
  }
  return continuation.matchPromise;
}

async function joinContinuation(characterId, token, send) {
  const normalizedToken = typeof token === 'string' ? token.trim() : '';
  if (!normalizedToken) {
    throw new Error('continuation token required');
  }
  if (!continuations.has(normalizedToken)) {
    throw new Error('continuation expired');
  }
  const continuation = continuations.get(normalizedToken);
  if (!continuation.partyIds.includes(characterId)) {
    throw new Error('character not part of this encounter');
  }
  if (continuation.status !== 'ready' || !continuation.mode) {
    throw new Error('continuation not ready');
  }
  if (continuation.entries.has(characterId)) {
    return attachExistingEntry(continuation.entries.get(characterId), send);
  }

  const character = await loadCharacter(characterId);
  if (!character) {
    throw new Error('character not found');
  }
  if (!character.rotation || character.rotation.length < 3) {
    throw new Error('character rotation invalid');
  }

  let resolveEntry;
  const promise = new Promise(resolve => {
    resolveEntry = resolve;
  });
  const entry = {
    character,
    send,
    resolve: resolveEntry,
    size: continuation.size,
    status: 'queued',
    ready: false,
    completed: false,
    continuationToken: normalizedToken,
    promise,
  };
  continuation.entries.set(characterId, entry);
  waitingEntries.set(character.id, entry);
  sendQueued(entry);

  if (
    continuation.entries.size >= continuation.partyIds.length
    && (!continuation.matchPromise || continuation.started === false)
  ) {
    const startPromise = startContinuationMatch(continuation);
    if (startPromise && typeof startPromise.catch === 'function') {
      startPromise.catch(err => {
        continuation.entries.forEach(item => {
          cancelEntry(item, err.message || 'failed to start dungeon');
        });
      });
    }
  }

  return {
    promise,
    cancel: reason => cancelDungeon(character.id, reason || 'dungeon cancelled'),
  };
}

async function startBattle(match) {
  if (!match || match.started) return;
  match.started = true;
  match.phase = 'encounter';
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

async function createMatch(entries, options = {}) {
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
    parentGenomes: null,
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

    if (options.fixedBoss) {
      match.boss = clone(options.fixedBoss);
      match.preview = options.fixedPreview ? clone(options.fixedPreview) : clone(match.boss);
      if (options.parentGenomes) {
        match.parentGenomes = {
          champion: options.parentGenomes.champion
            ? clone(options.parentGenomes.champion)
            : null,
          partner: options.parentGenomes.partner
            ? clone(options.parentGenomes.partner)
            : null,
        };
      }
    } else {
      const bossOptions = {};
      if (options.parentGenomes) {
        bossOptions.parentGenomes = options.parentGenomes;
      }
      const bossData = await generateDungeonBoss(
        entries.map(entry => entry.character),
        abilityMap,
        equipmentMap,
        bossOptions,
      );
      match.boss = bossData.character;
      match.preview = bossData.preview;
      match.parentGenomes = bossData.genomes
        ? {
            champion: bossData.genomes.champion ? clone(bossData.genomes.champion) : null,
            partner: bossData.genomes.partner ? clone(bossData.genomes.partner) : null,
          }
        : null;
    }
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

async function queueDungeon(characterId, size, send, options = {}) {
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

  const continuationToken = options && options.continuationToken ? String(options.continuationToken).trim() : '';
  if (continuationToken) {
    return joinContinuation(characterId, continuationToken, send);
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
    phase,
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

module.exports = {
  queueDungeon,
  cancelDungeon,
  readyForDungeon,
  getDungeonStatus,
  continueDungeon,
};
