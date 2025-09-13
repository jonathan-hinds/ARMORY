const path = require('path');
const { readJSON, writeJSON } = require('../store/jsonStore');
const { getAbilities } = require('./abilityService');

const DATA_DIR = path.join(__dirname, '..', 'data');
const CHARACTERS_FILE = path.join(DATA_DIR, 'characters.json');

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

module.exports = { updateRotation };
