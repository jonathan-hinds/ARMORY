const PlayerModel = require('../models/Player');
const { serializePlayer } = require('../models/utils');
const { getItemById } = require('./equipmentService');

async function purchaseItem(playerId, itemId) {
  if (!playerId || !itemId) {
    throw new Error('playerId and itemId required');
  }
  const [playerDoc, item] = await Promise.all([
    PlayerModel.findOne({ playerId }),
    getItemById(itemId),
  ]);
  if (!playerDoc) {
    throw new Error('player not found');
  }
  if (!item) {
    throw new Error('item not found');
  }
  const cost = typeof item.cost === 'number' ? item.cost : 0;
  const gold = typeof playerDoc.gold === 'number' ? playerDoc.gold : 0;
  if (gold < cost) {
    throw new Error('not enough gold');
  }
  playerDoc.gold = gold - cost;
  if (!Array.isArray(playerDoc.items)) {
    playerDoc.items = [];
  }
  playerDoc.items.push(item.id);
  await playerDoc.save();
  return {
    player: serializePlayer(playerDoc),
  };
}

module.exports = { purchaseItem };
