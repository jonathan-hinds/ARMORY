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

async function queueMatch(characterId, send) {
  const character = await loadCharacter(characterId);
  if (!character) throw new Error('character not found');
  if (!character.rotation || character.rotation.length < 3) {
    throw new Error('character rotation invalid');
  }
  const abilities = await getAbilities();
  const abilityMap = new Map(abilities.map(a => [a.id, a]));
  return new Promise(resolve => {
    queue.push({ character, send, resolve });
    if (queue.length >= 2) {
      const a = queue.shift();
      const b = queue.shift();
      runCombat(a.character, b.character, abilityMap, event => {
        if (event.type === 'start') {
          a.send({ type: 'start', you: event.a, opponent: event.b });
          b.send({ type: 'start', you: event.b, opponent: event.a });
        } else if (event.type === 'update') {
          a.send({ type: 'update', you: event.a, opponent: event.b, log: event.log });
          b.send({ type: 'update', you: event.b, opponent: event.a, log: event.log });
        }
      })
        .then(result => {
          a.send({ type: 'end', winnerId: result.winnerId });
          b.send({ type: 'end', winnerId: result.winnerId });
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
