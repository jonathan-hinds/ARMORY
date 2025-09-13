const path = require('path');
const { readJSON, writeJSON } = require('../store/jsonStore');
const Player = require('../domain/player');
const Character = require('../domain/character');

const DATA_DIR = path.join(__dirname, '..', 'data');
const PLAYERS_FILE = path.join(DATA_DIR, 'players.json');
const CHARACTERS_FILE = path.join(DATA_DIR, 'characters.json');

function rollAttributes() {
  const stats = ['strength', 'stamina', 'agility', 'intellect', 'wisdom'];
  const attributes = {
    strength: 0,
    stamina: 0,
    agility: 0,
    intellect: 0,
    wisdom: 0,
  };
  for (let i = 0; i < 15; i++) {
    const stat = stats[Math.floor(Math.random() * stats.length)];
    attributes[stat]++;
  }
  return attributes;
}

function rollBasicType() {
  return Math.random() < 0.5 ? 'melee' : 'magic';
}

async function registerPlayer(name) {
  const players = await readJSON(PLAYERS_FILE);
  const characters = await readJSON(CHARACTERS_FILE);

  const playerId = players.length + 1;
  const characterId = characters.length + 1;

  const player = new Player({ id: playerId, name, gold: 0, items: [], characterId });

  const character = new Character({
    id: characterId,
    playerId,
    attributes: rollAttributes(),
    basicType: rollBasicType(),
    rotation: [],
    equipment: {
      weapon: null,
      helmet: null,
      chest: null,
      legs: null,
      feet: null,
      hands: null,
    },
  });

  players.push(player);
  characters.push(character);

  await writeJSON(PLAYERS_FILE, players);
  await writeJSON(CHARACTERS_FILE, characters);

  return { player, character };
}

module.exports = { registerPlayer };
