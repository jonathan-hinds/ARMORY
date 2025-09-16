const CharacterModel = require('../models/Character');
const { serializeCharacter, STATS } = require('../models/utils');
const { getAbilities } = require('./abilityService');

function xpForNextLevel(level) {
  return level * 100;
}

async function updateRotation(characterId, rotation) {
  if (!Array.isArray(rotation) || rotation.length < 3) {
    throw new Error('rotation must have at least 3 abilities');
  }
  const abilities = await getAbilities();
  const validIds = new Set(abilities.map(a => a.id));
  if (rotation.some(id => !validIds.has(id))) {
    throw new Error('invalid ability id');
  }
  const characterDoc = await CharacterModel.findOne({ characterId });
  if (!characterDoc) {
    throw new Error('character not found');
  }
  characterDoc.rotation = rotation;
  await characterDoc.save();
  return serializeCharacter(characterDoc);
}

async function levelUp(characterId, allocations) {
  const characterDoc = await CharacterModel.findOne({ characterId });
  if (!characterDoc) {
    throw new Error('character not found');
  }
  const needed = xpForNextLevel(characterDoc.level || 1);
  if ((characterDoc.xp || 0) < needed) {
    throw new Error('not enough xp');
  }
  let spent = 0;
  STATS.forEach(stat => {
    const v = allocations && allocations[stat] ? allocations[stat] : 0;
    if (v < 0) throw new Error('invalid allocation');
    spent += v;
  });
  if (spent !== 2) {
    throw new Error('must allocate exactly 2 points');
  }
  STATS.forEach(stat => {
    const add = allocations[stat] || 0;
    if (!characterDoc.attributes) {
      characterDoc.attributes = {};
    }
    characterDoc.attributes[stat] = (characterDoc.attributes[stat] || 0) + add;
  });
  characterDoc.level = (characterDoc.level || 1) + 1;
  characterDoc.xp = (characterDoc.xp || 0) - needed;
  await characterDoc.save();
  return serializeCharacter(characterDoc);
}

module.exports = { updateRotation, levelUp, xpForNextLevel };
