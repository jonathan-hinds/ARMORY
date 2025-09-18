const CharacterModel = require('../models/Character');
const { serializeCharacter } = require('../models/utils');
const { getItemById } = require('./equipmentService');

async function purchaseItem(playerId, characterId, itemId) {
  if (!playerId || !characterId || !itemId) {
    throw new Error('playerId, characterId and itemId required');
  }
  const [characterDoc, item] = await Promise.all([
    CharacterModel.findOne({ characterId, playerId }),
    getItemById(itemId),
  ]);
  if (!characterDoc) {
    throw new Error('character not found');
  }
  if (!item) {
    throw new Error('item not found');
  }
  const cost = typeof item.cost === 'number' ? item.cost : 0;
  const gold = typeof characterDoc.gold === 'number' ? characterDoc.gold : 0;
  if (gold < cost) {
    throw new Error('not enough gold');
  }
  characterDoc.gold = gold - cost;
  if (!Array.isArray(characterDoc.items)) {
    characterDoc.items = [];
  }
  characterDoc.items.push(item.id);
  await characterDoc.save();
  return {
    character: serializeCharacter(characterDoc),
  };
}

module.exports = { purchaseItem };
