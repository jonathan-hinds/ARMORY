const CharacterModel = require('../models/Character');
const { serializeCharacter } = require('../models/utils');
const { getAbilities } = require('./abilityService');
const { getEquipmentMap } = require('./equipmentService');
const { runCombat } = require('./combatEngine');
const { xpForNextLevel } = require('./characterService');

const queue = [];

async function loadCharacter(id) {
  const characterDoc = await CharacterModel.findOne({ characterId: id }).lean();
  return characterDoc ? serializeCharacter(characterDoc) : null;
}

async function queueMatch(characterId, send) {
  const character = await loadCharacter(characterId);
  if (!character) throw new Error('character not found');
  if (!character.rotation || character.rotation.length < 3) {
    throw new Error('character rotation invalid');
  }
  const abilities = await getAbilities();
  const abilityMap = new Map(abilities.map(a => [a.id, a]));
  const equipmentMap = await getEquipmentMap();
  return new Promise(resolve => {
    queue.push({ character, send, resolve });
    if (queue.length >= 2) {
      const a = queue.shift();
      const b = queue.shift();
      runCombat(a.character, b.character, abilityMap, equipmentMap, event => {
        if (event.type === 'start') {
          a.send({ type: 'start', you: event.a, opponent: event.b });
          b.send({ type: 'start', you: event.b, opponent: event.a });
        } else if (event.type === 'update') {
          a.send({ type: 'update', you: event.a, opponent: event.b, log: event.log });
          b.send({ type: 'update', you: event.b, opponent: event.a, log: event.log });
        }
      })
        .then(async result => {
          const participantIds = [a.character.id, b.character.id];
          const characterDocs = await CharacterModel.find({
            characterId: { $in: participantIds },
          });
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
              const idx = characterDoc.items.indexOf(entry.itemId);
              if (idx !== -1) {
                characterDoc.items.splice(idx, 1);
                itemsModified = true;
              }
              if (characterDoc.useables[entry.slot] === entry.itemId) {
                const remaining = characterDoc.items.filter(id => id === entry.itemId).length;
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

          a.send({
            type: 'end',
            winnerId: result.winnerId,
            xpGain: rewardA.xpGain,
            gpGain: rewardA.gpGain,
            character: rewardA.character,
            gold: rewardA.gold,
          });
          b.send({
            type: 'end',
            winnerId: result.winnerId,
            xpGain: rewardB.xpGain,
            gpGain: rewardB.gpGain,
            character: rewardB.character,
            gold: rewardB.gold,
          });
          a.resolve();
          b.resolve();
        })
        .catch(err => {
          const error = { type: 'error', message: err.message };
          a.send(error);
          b.send(error);
          a.resolve();
          b.resolve();
        });
    }
  });
}

module.exports = { queueMatch };
