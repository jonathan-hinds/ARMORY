const path = require('path');
const { readJSON } = require('../store/jsonStore');
const { getAbilities } = require('./abilityService');
const { runCombat } = require('./combatEngine');

const DATA_DIR = path.join(__dirname, '..', 'data');
const CHARACTERS_FILE = path.join(DATA_DIR, 'characters.json');

const queue = [];

async function loadCharacter(id) {
  const characters = await readJSON(CHARACTERS_FILE);
  return characters.find(c => c.id === id);
}

async function queueMatch(characterId) {
  const character = await loadCharacter(characterId);
  if (!character) throw new Error('character not found');
  if (!character.rotation || character.rotation.length < 3) {
    throw new Error('character rotation invalid');
  }
  const abilities = await getAbilities();
  const abilityMap = new Map(abilities.map(a => [a.id, a]));
  return new Promise(resolve => {
    queue.push({ character, resolve });
    if (queue.length >= 2) {
      const a = queue.shift();
      const b = queue.shift();
      runCombat(a.character, b.character, abilityMap).then(result => {
        a.resolve({ you: a.character.id, winnerId: result.winnerId, log: result.log });
        b.resolve({ you: b.character.id, winnerId: result.winnerId, log: result.log });
      });
    }
  });
}

module.exports = { queueMatch };
