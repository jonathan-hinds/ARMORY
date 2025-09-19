const CharacterModel = require('../models/Character');
const { serializeCharacter, readMaterialCount, writeMaterialCount } = require('../models/utils');
const { getItemById } = require('./equipmentService');
const { getMaterialById } = require('./materialService');

async function purchaseItem(playerId, characterId, itemId) {
  if (!playerId || !characterId || !itemId) {
    throw new Error('playerId, characterId and itemId required');
  }
  const characterDoc = await CharacterModel.findOne({ characterId, playerId });
  if (!characterDoc) {
    throw new Error('character not found');
  }

  const [item, material] = await Promise.all([getItemById(itemId), getMaterialById(itemId)]);
  const purchasable = item || material;
  if (!purchasable) {
    throw new Error('item not found');
  }
  const cost = typeof purchasable.cost === 'number' ? purchasable.cost : 0;
  const gold = typeof characterDoc.gold === 'number' ? characterDoc.gold : 0;
  if (gold < cost) {
    throw new Error('not enough gold');
  }
  characterDoc.gold = gold - cost;
  if (material) {
    if (!characterDoc.materials || typeof characterDoc.materials !== 'object') {
      characterDoc.materials = {};
    }
    const current = readMaterialCount(characterDoc.materials, material.id);
    writeMaterialCount(characterDoc.materials, material.id, current + 1);
    if (typeof characterDoc.markModified === 'function') {
      characterDoc.markModified('materials');
    }
  } else {
    if (!Array.isArray(characterDoc.items)) {
      characterDoc.items = [];
    }
    characterDoc.items.push(item.id);
    if (typeof characterDoc.markModified === 'function') {
      characterDoc.markModified('items');
    }
  }
  await characterDoc.save();
  return {
    character: serializeCharacter(characterDoc),
  };
}

module.exports = { purchaseItem };
