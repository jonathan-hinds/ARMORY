const path = require('path');
const { readJSON, writeJSON } = require('../store/jsonStore');
const { getAbilities } = require('./abilityService');

const DATA_DIR = path.join(__dirname, '..', 'data');
const CHARACTERS_FILE = path.join(DATA_DIR, 'characters.json');

const STATS = ['strength', 'stamina', 'agility', 'intellect', 'wisdom'];

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
  const characters = await readJSON(CHARACTERS_FILE);
  const idx = characters.findIndex(c => c.id === characterId);
  if (idx === -1) {
    throw new Error('character not found');
  }
  characters[idx].rotation = rotation;
  await writeJSON(CHARACTERS_FILE, characters);
  return characters[idx];
}

async function levelUp(characterId, allocations) {
  const characters = await readJSON(CHARACTERS_FILE);
  const idx = characters.findIndex(c => c.id === characterId);
  if (idx === -1) {
    throw new Error('character not found');
  }
  const character = characters[idx];
  const needed = xpForNextLevel(character.level || 1);
  if ((character.xp || 0) < needed) {
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
    character.attributes[stat] = (character.attributes[stat] || 0) + add;
  });
  character.level = (character.level || 1) + 1;
  character.xp = (character.xp || 0) - needed;
  characters[idx] = character;
  await writeJSON(CHARACTERS_FILE, characters);
  return character;
}

module.exports = { updateRotation, levelUp, xpForNextLevel };
