const path = require('path');
const { readJSON, writeJSON } = require('../store/jsonStore');
const { getEquipmentMap } = require('./equipmentService');
const { compute } = require('./derivedStats');

const DATA_DIR = path.join(__dirname, '..', 'data');
const PLAYERS_FILE = path.join(DATA_DIR, 'players.json');
const CHARACTERS_FILE = path.join(DATA_DIR, 'characters.json');

const EQUIPMENT_SLOTS = ['weapon', 'helmet', 'chest', 'legs', 'feet', 'hands'];

function ensureEquipmentShape(equipment) {
  const result = {};
  EQUIPMENT_SLOTS.forEach(slot => {
    result[slot] = equipment && equipment[slot] ? equipment[slot] : null;
  });
  return result;
}

function slotOrder(slot) {
  const idx = EQUIPMENT_SLOTS.indexOf(slot);
  return idx === -1 ? EQUIPMENT_SLOTS.length : idx;
}

async function getInventory(playerId, characterId) {
  if (!playerId || !characterId) {
    throw new Error('playerId and characterId required');
  }
  const [players, characters, equipmentMap] = await Promise.all([
    readJSON(PLAYERS_FILE),
    readJSON(CHARACTERS_FILE),
    getEquipmentMap(),
  ]);
  const player = players.find(p => p.id === playerId);
  if (!player) {
    throw new Error('player not found');
  }
  const character = characters.find(c => c.id === characterId);
  if (!character || character.playerId !== player.id) {
    throw new Error('character not found');
  }

  const equipmentIds = ensureEquipmentShape(character.equipment || {});
  const equippedItems = {};
  const equippedForCompute = {};
  EQUIPMENT_SLOTS.forEach(slot => {
    const id = equipmentIds[slot];
    const item = id ? equipmentMap.get(id) : null;
    equippedItems[slot] = item ? JSON.parse(JSON.stringify(item)) : null;
    equippedForCompute[slot] = item || null;
  });

  const derived = compute(character, equippedForCompute);

  const counts = new Map();
  (Array.isArray(player.items) ? player.items : []).forEach(id => {
    if (!counts.has(id)) counts.set(id, 0);
    counts.set(id, counts.get(id) + 1);
  });

  const inventory = [];
  counts.forEach((count, id) => {
    const item = equipmentMap.get(id);
    if (!item) return;
    const plain = JSON.parse(JSON.stringify(item));
    inventory.push({ item: plain, count });
  });

  inventory.sort((a, b) => {
    const sa = slotOrder(a.item.slot);
    const sb = slotOrder(b.item.slot);
    if (sa !== sb) return sa - sb;
    const costA = typeof a.item.cost === 'number' ? a.item.cost : 0;
    const costB = typeof b.item.cost === 'number' ? b.item.cost : 0;
    if (costA !== costB) return costA - costB;
    return a.item.name.localeCompare(b.item.name);
  });

  const ownedCounts = {};
  counts.forEach((count, id) => {
    ownedCounts[id] = count;
  });

  const sanitizedCharacter = JSON.parse(
    JSON.stringify({ ...character, equipment: equipmentIds })
  );

  return {
    gold: typeof player.gold === 'number' ? player.gold : 0,
    character: sanitizedCharacter,
    equipped: equippedItems,
    derived,
    inventory,
    ownedCounts,
  };
}

async function setEquipment(playerId, characterId, slot, itemId) {
  if (!playerId || !characterId || !slot) {
    throw new Error('playerId, characterId, and slot required');
  }
  if (!EQUIPMENT_SLOTS.includes(slot)) {
    throw new Error('invalid equipment slot');
  }
  const [players, characters, equipmentMap] = await Promise.all([
    readJSON(PLAYERS_FILE),
    readJSON(CHARACTERS_FILE),
    getEquipmentMap(),
  ]);
  const playerIdx = players.findIndex(p => p.id === playerId);
  if (playerIdx === -1) {
    throw new Error('player not found');
  }
  const characterIdx = characters.findIndex(c => c.id === characterId);
  if (characterIdx === -1) {
    throw new Error('character not found');
  }
  const character = characters[characterIdx];
  if (character.playerId !== playerId) {
    throw new Error('character not owned by player');
  }

  if (!character.equipment) {
    character.equipment = {};
  }
  EQUIPMENT_SLOTS.forEach(s => {
    if (character.equipment[s] === undefined) {
      character.equipment[s] = null;
    }
  });

  if (itemId) {
    const item = equipmentMap.get(itemId);
    if (!item) {
      throw new Error('item not found');
    }
    if (item.slot !== slot) {
      throw new Error('item cannot be equipped in this slot');
    }
    const player = players[playerIdx];
    const owned = (Array.isArray(player.items) ? player.items : []).filter(id => id === itemId).length;
    if (owned <= 0) {
      throw new Error('item not owned');
    }
  }

  character.equipment[slot] = itemId || null;
  characters[characterIdx] = character;
  await writeJSON(CHARACTERS_FILE, characters);

  return getInventory(playerId, characterId);
}

module.exports = { getInventory, setEquipment };
