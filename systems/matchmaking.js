const CharacterModel = require('../models/Character');
const { serializeCharacter, findItemIndex, countItems, matchesItemId } = require('../models/utils');
const { getAbilities } = require('./abilityService');
const { getEquipmentMap } = require('./equipmentService');
const { runCombat } = require('./combatEngine');
const { xpForNextLevel } = require('./characterService');
const { processJobForCharacter, ensureJobIdleForDoc } = require('./jobService');

const queue = [];
const waitingEntries = new Map();

function sendSafe(entry, payload) {
  try {
    entry.send(payload);
  } catch (err) {
    // Ignore send failures; the SSE stream may already be closed.
  }
}

function removeFromQueue(entry) {
  if (!entry) return;
  const idx = queue.indexOf(entry);
  if (idx !== -1) {
    queue.splice(idx, 1);
  }
}

function finalizeEntry(entry) {
  if (!entry || entry.completed) return;
  entry.completed = true;
  if (entry.character && typeof entry.character.id === 'number') {
    waitingEntries.delete(entry.character.id);
  }
  if (typeof entry.resolve === 'function') {
    entry.resolve();
  }
}

function cancelEntry(entry, reason = 'matchmaking cancelled') {
  if (!entry || entry.completed || entry.status !== 'queued') {
    return false;
  }
  entry.status = 'cancelled';
  removeFromQueue(entry);
  if (entry.character && typeof entry.character.id === 'number') {
    waitingEntries.delete(entry.character.id);
  }
  sendSafe(entry, { type: 'cancelled', message: reason });
  finalizeEntry(entry);
  return true;
}

function nextQueuedEntry() {
  while (queue.length > 0) {
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

function tryStartMatch() {
  while (queue.length >= 2) {
    const a = nextQueuedEntry();
    if (!a) {
      return;
    }
    const b = nextQueuedEntry();
    if (!b) {
      queue.unshift(a);
      return;
    }
    if (a.character && b.character && a.character.id === b.character.id) {
      // Should not happen due to waitingEntries guard, but place the second back just in case.
      queue.unshift(b);
      queue.unshift(a);
      return;
    }
    startMatch(a, b);
    // Only start one match at a time to avoid deep recursion and to respect async execution.
    return;
  }
}

function startMatch(a, b) {
  if (!a || !b) return;
  a.status = 'matched';
  b.status = 'matched';
  if (a.character && typeof a.character.id === 'number') {
    waitingEntries.delete(a.character.id);
  }
  if (b.character && typeof b.character.id === 'number') {
    waitingEntries.delete(b.character.id);
  }

  getAbilities()
    .then(abilities => {
      const abilityMap = new Map(abilities.map(ability => [ability.id, ability]));
      return getEquipmentMap().then(equipmentMap => ({ abilityMap, equipmentMap }));
    })
    .then(({ abilityMap, equipmentMap }) => {
      return runCombat(a.character, b.character, abilityMap, equipmentMap, event => {
        if (event.type === 'start') {
          sendSafe(a, { type: 'start', you: event.a, opponent: event.b });
          sendSafe(b, { type: 'start', you: event.b, opponent: event.a });
        } else if (event.type === 'update') {
          const payloadA = { type: 'update', you: event.a, opponent: event.b, log: event.log };
          const payloadB = { type: 'update', you: event.b, opponent: event.a, log: event.log };
          sendSafe(a, payloadA);
          sendSafe(b, payloadB);
        }
      });
    })
    .then(async result => {
      const participantIds = [a.character.id, b.character.id];
      const characterDocs = await CharacterModel.find({
        characterId: { $in: participantIds },
      });
      for (const doc of characterDocs) {
        await processJobForCharacter(doc);
      }
      const characterMap = new Map();
      characterDocs.forEach(doc => {
        characterMap.set(doc.characterId, doc);
      });
      const consumedMap = result.consumedUseables || {};

      function consumeUseables(charWrapper) {
        const consumed = consumedMap[charWrapper.character.id] || [];
        if (!consumed.length) return;
        const characterDoc = characterMap.get(charWrapper.character.id);
        if (!characterDoc) return;
        if (!characterDoc.useables) {
          characterDoc.useables = { useable1: null, useable2: null };
        }
        let modifiedUseables = false;
        let itemsModified = false;
        if (!Array.isArray(characterDoc.items)) {
          characterDoc.items = [];
        }
        consumed.forEach(entry => {
          const idx = findItemIndex(characterDoc.items, entry.itemId);
          if (idx !== -1) {
            characterDoc.items.splice(idx, 1);
            itemsModified = true;
          }
          if (matchesItemId(characterDoc.useables[entry.slot], entry.itemId)) {
            const remaining = countItems(characterDoc.items, entry.itemId);
            if (remaining <= 0) {
              characterDoc.useables[entry.slot] = null;
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

      function reward(charWrapper, won) {
        const characterDoc = characterMap.get(charWrapper.character.id);
        if (!characterDoc) {
          throw new Error('character not found for rewards');
        }
        const pct = won ? 0.05 + Math.random() * 0.05 : 0.01 + Math.random() * 0.01;
        const xpGain = Math.round(xpForNextLevel(characterDoc.level || 1) * pct);
        characterDoc.xp = (characterDoc.xp || 0) + xpGain;
        const gpGain = won ? 10 : 2;
        characterDoc.gold = (characterDoc.gold || 0) + gpGain;
        return {
          xpGain,
          gpGain,
          character: serializeCharacter(characterDoc),
          gold: typeof characterDoc.gold === 'number' ? characterDoc.gold : 0,
        };
      }

      consumeUseables(a);
      consumeUseables(b);

      const rewardA = reward(a, result.winnerId === a.character.id);
      const rewardB = reward(b, result.winnerId === b.character.id);

      await Promise.all(characterDocs.map(doc => doc.save()));

      sendSafe(a, {
        type: 'end',
        winnerId: result.winnerId,
        xpGain: rewardA.xpGain,
        gpGain: rewardA.gpGain,
        character: rewardA.character,
        gold: rewardA.gold,
      });
      sendSafe(b, {
        type: 'end',
        winnerId: result.winnerId,
        xpGain: rewardB.xpGain,
        gpGain: rewardB.gpGain,
        character: rewardB.character,
        gold: rewardB.gold,
      });
    })
    .catch(err => {
      const error = { type: 'error', message: err.message };
      sendSafe(a, error);
      sendSafe(b, error);
    })
    .finally(() => {
      finalizeEntry(a);
      finalizeEntry(b);
      // Attempt to start another match if there are enough queued entries remaining.
      tryStartMatch();
    });
}

async function loadCharacter(id) {
  const characterDoc = await CharacterModel.findOne({ characterId: id });
  if (!characterDoc) return null;
  const { changed } = await processJobForCharacter(characterDoc);
  if (changed) {
    await characterDoc.save();
  }
  ensureJobIdleForDoc(characterDoc);
  return serializeCharacter(characterDoc);
}

async function queueMatch(characterId, send) {
  const character = await loadCharacter(characterId);
  if (!character) throw new Error('character not found');
  if (!character.rotation || character.rotation.length < 3) {
    throw new Error('character rotation invalid');
  }
  if (waitingEntries.has(character.id)) {
    throw new Error('character already queued');
  }

  let resolveFn;
  const promise = new Promise(resolve => {
    resolveFn = resolve;
  });

  const entry = {
    character,
    send,
    resolve: resolveFn,
    promise,
    status: 'queued',
    completed: false,
  };

  entry.cancel = reason => cancelEntry(entry, reason);

  queue.push(entry);
  waitingEntries.set(character.id, entry);
  tryStartMatch();

  return { promise, cancel: entry.cancel };
}

function cancelMatchmaking(characterId, reason) {
  const entry = waitingEntries.get(characterId);
  if (!entry) {
    return false;
  }
  return cancelEntry(entry, reason);
}

module.exports = { queueMatch, cancelMatchmaking };
