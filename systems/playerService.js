const PlayerModel = require('../models/Player');
const CharacterModel = require('../models/Character');
const {
  ensureEquipmentShape,
  serializeCharacter,
  serializePlayer,
} = require('../models/utils');

async function getNextId(Model, field) {
  const latest = await Model.findOne().sort({ [field]: -1 }).select(field).lean();
  if (!latest || typeof latest[field] !== 'number') {
    return 1;
  }
  return latest[field] + 1;
}

async function findPlayerByName(name) {
  return PlayerModel.findOne({ name })
    .collation({ locale: 'en', strength: 2 })
    .lean();
}

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
  const existing = await findPlayerByName(name);
  if (existing) {
    throw new Error('name taken');
  }
  const playerId = await getNextId(PlayerModel, 'playerId');
  const playerDoc = await PlayerModel.create({
    playerId,
    name,
    gold: 0,
    items: [],
    characterId: null,
  });
  return { player: serializePlayer(playerDoc) };
}

async function loginPlayer(name) {
  const playerDoc = await findPlayerByName(name);
  if (!playerDoc) {
    throw new Error('player not found');
  }
  const characters = await getPlayerCharacters(playerDoc.playerId);
  return { player: serializePlayer(playerDoc), characters };
}

async function getPlayerCharacters(playerId) {
  const characterDocs = await CharacterModel.find({ playerId }).lean();
  return characterDocs.map(serializeCharacter);
}

async function createCharacter(playerId, name) {
  const playerDoc = await PlayerModel.findOne({ playerId }).lean();
  if (!playerDoc) {
    throw new Error('player not found');
  }
  const characterId = await getNextId(CharacterModel, 'characterId');
  const characterDoc = await CharacterModel.create({
    characterId,
    playerId,
    name,
    attributes: rollAttributes(),
    basicType: rollBasicType(),
    rotation: [],
    equipment: ensureEquipmentShape({}),
  });
  return serializeCharacter(characterDoc);
}

module.exports = { registerPlayer, loginPlayer, createCharacter, getPlayerCharacters };
