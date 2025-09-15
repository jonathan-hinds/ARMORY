const path = require('path');
const { readJSON, writeJSON } = require('../store/jsonStore');
const { getAbilities } = require('./abilityService');
const { runCombat } = require('./combatEngine');
const { xpForNextLevel } = require('./characterService');

const DATA_DIR = path.join(__dirname, '..', 'data');
const CHARACTERS_FILE = path.join(DATA_DIR, 'characters.json');
const PLAYERS_FILE = path.join(DATA_DIR, 'players.json');

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
        .then(async result => {
          const players = await readJSON(PLAYERS_FILE);
          const characters = await readJSON(CHARACTERS_FILE);
          function reward(charWrapper, won) {
            const char = characters.find(c => c.id === charWrapper.character.id);
            const player = players.find(p => p.id === char.playerId);
            const pct = won ? 0.05 + Math.random() * 0.05 : 0.01 + Math.random() * 0.01;
            const xpGain = Math.round(xpForNextLevel(char.level || 1) * pct);
            char.xp = (char.xp || 0) + xpGain;
            const gpGain = won ? 10 : 2;
            player.gold = (player.gold || 0) + gpGain;
            return { xpGain, gpGain, character: char, gold: player.gold };
          }
          const rewardA = reward(a, result.winnerId === a.character.id);
          const rewardB = reward(b, result.winnerId === b.character.id);
          await writeJSON(CHARACTERS_FILE, characters);
          await writeJSON(PLAYERS_FILE, players);
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
