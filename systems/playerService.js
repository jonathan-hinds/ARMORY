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
  const playerId = players.length + 1;
  const player = new Player({ id: playerId, name, gold: 0, items: [], characterId: null });
  players.push(player);
  await writeJSON(PLAYERS_FILE, players);
  return { player };
}

async function loginPlayer(name) {
  const players = await readJSON(PLAYERS_FILE);
  const player = players.find(p => p.name === name);
  if (!player) {
    throw new Error('player not found');
  }
  const characters = await getPlayerCharacters(player.id);
  return { player, characters };
}

async function getPlayerCharacters(playerId) {
  const characters = await readJSON(CHARACTERS_FILE);
  return characters.filter(c => c.playerId === playerId);
}

async function createCharacter(playerId) {
  const characters = await readJSON(CHARACTERS_FILE);
  const characterId = characters.length + 1;
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
  characters.push(character);
  await writeJSON(CHARACTERS_FILE, characters);
  return character;
}

module.exports = { registerPlayer, loginPlayer, createCharacter, getPlayerCharacters };
