const CharacterModel = require('../models/Character');
const { serializeCharacter, findItemIndex, countItems, matchesItemId } = require('../models/utils');
const { getAbilities } = require('./abilityService');
const { getEquipmentMap } = require('./equipmentService');
const { generateDungeonBoss } = require('./dungeonGA');
const { runDungeonCombat } = require('./combatEngine');
const { xpForNextLevel } = require('./characterService');
const { processJobForCharacter, ensureJobIdleForDoc } = require('./jobService');

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

function summarizeParty(entries) {
  return entries.map(item => ({
    id: item.character.id,
    name: item.character.name,
    level: item.character.level,
    basicType: item.character.basicType,
  }));
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
    match.entries.forEach(entry => {
      sendSafe(entry, {
        ...event,
        matchId: match.id,
        youId: entry.character.id,
      });
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
    return { ready: match.ready.size, total: match.entries.length };
  }
  entry.ready = true;
  match.ready.add(characterId);
  const payload = {
    type: 'ready',
    matchId: match.id,
    ready: match.ready.size,
    total: match.entries.length,
  };
  match.entries.forEach(item => sendSafe(item, payload));
  if (match.ready.size >= match.entries.length) {
    await startBattle(match);
  }
  return { ready: match.ready.size, total: match.entries.length };
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
  };
  activeMatches.set(matchId, match);
  entries.forEach(entry => {
    entry.status = 'matched';
    entry.matchId = matchId;
    participantMatches.set(entry.character.id, matchId);
  });
  const summary = summarizeParty(entries);
  entries.forEach(entry => {
    sendSafe(entry, {
      type: 'preview',
      matchId,
      boss: match.preview,
      party: summary,
      size: entries.length,
      ready: 0,
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

async function queueDungeon(characterId, size, send) {
  const groupSize = Number.isFinite(size) ? Math.min(5, Math.max(2, size)) : 2;
  const character = await loadCharacter(characterId);
  if (!character) {
    throw new Error('character not found');
  }
  if (!character.rotation || character.rotation.length < 3) {
    throw new Error('character rotation invalid');
  }
  if (waitingEntries.has(character.id) || participantMatches.has(character.id)) {
    throw new Error('character already queued');
  }

  let cancel;
  const promise = new Promise(resolve => {
    const entry = {
      character,
      send,
      resolve,
      size: groupSize,
      status: 'queued',
      ready: false,
      completed: false,
    };
    cancel = reason => cancelEntry(entry, reason || 'dungeon cancelled');
    queues[groupSize].push(entry);
    waitingEntries.set(character.id, entry);
    tryStartMatch(groupSize);
  });

  return { promise, cancel };
}

function cancelDungeon(characterId, reason) {
  if (waitingEntries.has(characterId)) {
    const entry = waitingEntries.get(characterId);
    cancelEntry(entry, reason || 'connection closed');
    return true;
  }
  if (participantMatches.has(characterId)) {
    const matchId = participantMatches.get(characterId);
    const match = activeMatches.get(matchId);
    if (match) {
      const entry = match.entries.find(item => item.character.id === characterId);
      if (entry && !match.started) {
        match.entries.forEach(item => {
          if (item.character.id !== characterId) {
            cancelEntry(item, 'party disbanded');
          } else {
            cancelEntry(item, reason || 'connection closed');
          }
        });
        activeMatches.delete(matchId);
        return true;
      }
    }
  }
  return false;
}

module.exports = { queueDungeon, cancelDungeon, readyForDungeon };
