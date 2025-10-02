const CharacterModel = require('../models/Character');
const { serializeCharacter } = require('../models/utils');
const { processJobForCharacter, ensureJobIdleForDoc } = require('./jobService');
const { ensureBattlefieldIdle } = require('./battlefieldService');
const { ensureAdventureIdle } = require('./adventureService');
const { listWorlds, createWorldInstance } = require('./worldService');

function uuid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

const worldQueueCache = new Map();
const waitingEntries = new Map();
const activeMatches = new Map();
const participantMatches = new Map();
const worldInfoCache = new Map();

function getQueuesForWorld(worldId) {
  if (!worldQueueCache.has(worldId)) {
    worldQueueCache.set(worldId, {
      1: [],
      2: [],
      3: [],
      4: [],
      5: [],
    });
  }
  return worldQueueCache.get(worldId);
}

function sendSafe(entry, payload) {
  if (!entry || typeof entry.send !== 'function') return;
  try {
    entry.send(payload);
  } catch (err) {
    /* ignore send failures */
  }
}

function removeFromQueue(entry) {
  if (!entry) return;
  const queues = getQueuesForWorld(entry.worldId);
  const queue = queues[entry.size];
  if (!queue) return;
  const idx = queue.indexOf(entry);
  if (idx !== -1) {
    queue.splice(idx, 1);
  }
}

function finalizeEntry(entry) {
  if (!entry || entry.completed) return;
  entry.completed = true;
  waitingEntries.delete(entry.character.id);
  participantMatches.delete(entry.character.id);
}

function cancelEntry(entry, reason = 'World queue cancelled.') {
  if (!entry || entry.completed) return;
  if (entry.status === 'queued') {
    removeFromQueue(entry);
    sendSafe(entry, { type: 'cancelled', message: reason });
    finalizeEntry(entry);
    return;
  }
  if (entry.status === 'matched') {
    const match = participantMatches.get(entry.character.id);
    if (match) {
      cancelMatch(match, reason);
    } else {
      sendSafe(entry, { type: 'cancelled', message: reason });
      finalizeEntry(entry);
    }
  }
}

function buildPartyPreview(entries) {
  return entries
    .map(item => {
      if (!item || !item.character) return null;
      return {
        id: item.character.id,
        name: item.character.name,
        level: item.character.level,
        basicType: item.character.basicType,
      };
    })
    .filter(Boolean);
}

function readySnapshot(match) {
  return Array.from(match.ready.values()).sort((a, b) => a - b);
}

function sendMatchState(match) {
  if (!match) return;
  const party = buildPartyPreview(match.entries);
  const readyIds = readySnapshot(match);
  const payload = {
    type: 'matched',
    matchId: match.id,
    worldId: match.worldId,
    worldName: match.worldName || null,
    size: match.entries.length,
    party,
    ready: match.ready.size,
    readyIds,
    phase: match.started ? 'starting' : 'ready',
  };
  match.entries.forEach(entry => sendSafe(entry, payload));
}

function sendReadyUpdate(match) {
  if (!match) return;
  const readyIds = readySnapshot(match);
  const payload = {
    type: 'ready',
    matchId: match.id,
    ready: match.ready.size,
    total: match.entries.length,
    readyIds,
  };
  match.entries.forEach(entry => sendSafe(entry, payload));
}

function cancelMatch(match, reason = 'World queue cancelled.') {
  if (!match || match.cancelled) return;
  match.cancelled = true;
  match.entries.forEach(entry => {
    if (!entry || entry.completed) return;
    sendSafe(entry, { type: 'cancelled', message: reason });
    finalizeEntry(entry);
  });
  activeMatches.delete(match.id);
}

async function loadCharacter(characterId) {
  const doc = await CharacterModel.findOne({ characterId });
  if (!doc) {
    throw new Error('character not found');
  }
  const { changed } = await processJobForCharacter(doc);
  if (changed) {
    await doc.save();
  }
  ensureJobIdleForDoc(doc);
  if (!Array.isArray(doc.rotation) || doc.rotation.length < 3) {
    throw new Error('character rotation invalid');
  }
  return serializeCharacter(doc);
}

async function resolveWorldInfo(worldId) {
  if (worldInfoCache.has(worldId)) {
    return worldInfoCache.get(worldId);
  }
  const worlds = await listWorlds();
  const info = worlds.find(item => item && item.id === worldId);
  if (!info) {
    throw new Error('world not found');
  }
  worldInfoCache.set(worldId, info);
  return info;
}

function takeNextQueuedEntry(queue) {
  while (queue.length) {
    const entry = queue.shift();
    if (!entry || entry.completed) {
      continue;
    }
    if (entry.status === 'queued') {
      return entry;
    }
  }
  return null;
}

async function startWorldForMatch(match) {
  if (!match || match.started || match.cancelled) return;
  match.started = true;
  let instanceInfo = null;
  try {
    const participantIds = match.entries.map(entry => entry.character.id);
    instanceInfo = await createWorldInstance(match.worldId, participantIds);
    match.instanceId = instanceInfo.instanceId;
  } catch (err) {
    console.error('world instance creation failed', err);
    cancelMatch(match, err.message || 'Failed to create world instance.');
    return;
  }
  const startPayload = {
    type: 'start',
    matchId: match.id,
    worldId: match.worldId,
    worldName: match.worldName || null,
    instanceId: instanceInfo.instanceId,
    world: instanceInfo.world || null,
    party: buildPartyPreview(match.entries),
  };
  match.entries.forEach(entry => {
    sendSafe(entry, startPayload);
    finalizeEntry(entry);
  });
  activeMatches.delete(match.id);
}

function tryStartMatch(worldId, size) {
  const queues = getQueuesForWorld(worldId);
  const queue = queues[size];
  if (!Array.isArray(queue) || queue.length < size) {
    return;
  }
  while (true) {
    const group = [];
    while (group.length < size) {
      const next = takeNextQueuedEntry(queue);
      if (!next) {
        group.length = 0;
        return;
      }
      group.push(next);
    }
    const matchId = uuid();
    const match = {
      id: matchId,
      worldId,
      worldName: group[0] && group[0].worldName ? group[0].worldName : null,
      entries: group,
      ready: new Set(),
      started: false,
    };
    group.forEach(entry => {
      entry.status = 'matched';
      entry.matchId = matchId;
      participantMatches.set(entry.character.id, match);
    });
    activeMatches.set(matchId, match);
    sendMatchState(match);
    sendReadyUpdate(match);
    if (queue.length < size) {
      return;
    }
  }
}

function resumeExistingEntry(entry, send, sizeOverride = null) {
  if (!entry || entry.completed) {
    return false;
  }
  entry.send = send;
  const sizeNormalized = Number.isFinite(sizeOverride) ? Math.max(1, Math.min(5, Math.round(sizeOverride))) : null;
  if (sizeNormalized && entry.size !== sizeNormalized) {
    if (entry.status === 'queued') {
      removeFromQueue(entry);
      entry.size = sizeNormalized;
      const queues = getQueuesForWorld(entry.worldId);
      queues[entry.size].push(entry);
    } else {
      entry.size = sizeNormalized;
    }
  }
  const payloadBase = {
    worldId: entry.worldId,
    worldName: entry.worldName || null,
    size: entry.size,
  };
  if (entry.status === 'queued') {
    sendSafe(entry, { type: 'queued', ...payloadBase });
    return true;
  }
  if (entry.status === 'matched') {
    const match = participantMatches.get(entry.character.id);
    if (match) {
      sendMatchState(match);
      sendReadyUpdate(match);
      return true;
    }
    // Match is no longer active; treat as queued so player can try again.
    entry.status = 'queued';
    removeFromQueue(entry);
    const queues = getQueuesForWorld(entry.worldId);
    queues[entry.size].push(entry);
    sendSafe(entry, { type: 'queued', ...payloadBase });
    return true;
  }
  return false;
}

async function queueForWorld(worldId, size, characterId, send) {
  const normalizedSize = Number.isFinite(size) ? Math.max(1, Math.min(5, Math.round(size))) : 1;
  await ensureBattlefieldIdle(characterId);
  await ensureAdventureIdle(characterId);
  const character = await loadCharacter(characterId);
  const existingEntry = waitingEntries.get(character.id);
  if (existingEntry) {
    if (existingEntry.completed) {
      waitingEntries.delete(character.id);
    } else if (existingEntry.worldId !== worldId) {
      throw new Error('character already queued');
    } else {
      existingEntry.character = character;
      if (resumeExistingEntry(existingEntry, send, normalizedSize)) {
        return existingEntry;
      }
      // If resume failed for some reason, fall through to create a fresh entry.
      waitingEntries.delete(character.id);
    }
  }
  const info = await resolveWorldInfo(worldId);
  const entry = {
    id: uuid(),
    worldId,
    worldName: info.name,
    size: normalizedSize,
    character,
    status: 'queued',
    send,
    completed: false,
  };
  waitingEntries.set(character.id, entry);
  const queues = getQueuesForWorld(worldId);
  queues[normalizedSize].push(entry);
  sendSafe(entry, {
    type: 'queued',
    worldId,
    worldName: info.name,
    size: normalizedSize,
  });
  tryStartMatch(worldId, normalizedSize);
  return entry;
}

async function readyWorldMatch(matchId, characterId) {
  const match = activeMatches.get(matchId);
  if (!match || match.cancelled) {
    throw new Error('match not found');
  }
  const entry = match.entries.find(item => item.character.id === characterId);
  if (!entry) {
    throw new Error('participant not found');
  }
  if (entry.ready) {
    return { ready: match.ready.size, total: match.entries.length, readyIds: readySnapshot(match) };
  }
  entry.ready = true;
  match.ready.add(characterId);
  sendReadyUpdate(match);
  if (match.ready.size >= match.entries.length) {
    await startWorldForMatch(match);
  }
  return { ready: match.ready.size, total: match.entries.length, readyIds: readySnapshot(match) };
}

function cancelWorldQueue(characterId) {
  const entry = waitingEntries.get(characterId);
  if (!entry) {
    return false;
  }
  cancelEntry(entry, 'World queue left.');
  return true;
}

function getWorldQueueStatus(characterId) {
  const entry = waitingEntries.get(characterId);
  if (!entry || entry.completed) {
    return null;
  }
  if (entry.status === 'queued') {
    return {
      status: 'queued',
      worldId: entry.worldId,
      worldName: entry.worldName || null,
      size: entry.size,
    };
  }
  const match = participantMatches.get(characterId);
  if (!match) {
    return null;
  }
  return {
    status: match.started ? 'starting' : 'matched',
    matchId: match.id,
    worldId: match.worldId,
    worldName: match.worldName || null,
    size: match.entries.length,
    ready: match.ready.size,
    readyIds: readySnapshot(match),
    party: buildPartyPreview(match.entries),
    instanceId: match.instanceId || null,
  };
}

module.exports = {
  queueForWorld,
  cancelWorldQueue,
  readyWorldMatch,
  getWorldQueueStatus,
};
