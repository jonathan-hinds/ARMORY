const path = require('path');
const { readJSON, writeJSON } = require('../store/jsonStore');
const { getItemById } = require('./equipmentService');

const DATA_DIR = path.join(__dirname, '..', 'data');
const PLAYERS_FILE = path.join(DATA_DIR, 'players.json');

async function purchaseItem(playerId, itemId) {
  if (!playerId || !itemId) {
    throw new Error('playerId and itemId required');
  }
  const [players, item] = await Promise.all([
    readJSON(PLAYERS_FILE),
    getItemById(itemId),
  ]);
  const idx = players.findIndex(p => p.id === playerId);
  if (idx === -1) {
    throw new Error('player not found');
  }
  if (!item) {
    throw new Error('item not found');
  }
  const player = players[idx];
  const cost = typeof item.cost === 'number' ? item.cost : 0;
  const gold = typeof player.gold === 'number' ? player.gold : 0;
  if (gold < cost) {
    throw new Error('not enough gold');
  }
  player.gold = gold - cost;
  if (!Array.isArray(player.items)) {
    player.items = [];
  }
  player.items.push(item.id);
  players[idx] = player;
  await writeJSON(PLAYERS_FILE, players);
  return {
    player: {
      ...player,
      items: [...player.items],
    },
  };
}

module.exports = { purchaseItem };
