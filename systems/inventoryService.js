const PlayerModel = require('../models/Player');
const CharacterModel = require('../models/Character');
const {
  ensureEquipmentShape,
  ensureUseableShape,
  serializeCharacter,
  serializePlayer,
  EQUIPMENT_SLOTS,
  USEABLE_SLOTS,
} = require('../models/utils');
const { getEquipmentMap } = require('./equipmentService');
const { compute } = require('./derivedStats');

function slotOrder(slot) {
  const order = [...EQUIPMENT_SLOTS, 'useable'];
  const idx = order.indexOf(slot);
  return idx === -1 ? order.length : idx;
}

async function getInventory(playerId, characterId) {
  if (!playerId || !characterId) {
    throw new Error('playerId and characterId required');
  }
  const [playerDoc, characterDoc, equipmentMap] = await Promise.all([
    PlayerModel.findOne({ playerId }).lean(),
    CharacterModel.findOne({ characterId }).lean(),
    getEquipmentMap(),
  ]);
  if (!playerDoc) {
    throw new Error('player not found');
  }
  if (!characterDoc || characterDoc.playerId !== playerId) {
    throw new Error('character not found');
  }

  const player = serializePlayer(playerDoc);
  const character = serializeCharacter(characterDoc);

  const equipmentIds = ensureEquipmentShape(character.equipment || {});
  const useableIds = ensureUseableShape(character.useables || {});
  const equippedItems = {};
  const equippedForCompute = {};
  EQUIPMENT_SLOTS.forEach(slot => {
    const id = equipmentIds[slot];
    const item = id ? equipmentMap.get(id) : null;
    equippedItems[slot] = item ? JSON.parse(JSON.stringify(item)) : null;
    equippedForCompute[slot] = item || null;
  });

  const equippedUseables = {};
  USEABLE_SLOTS.forEach(slot => {
    const id = useableIds[slot];
    const item = id ? equipmentMap.get(id) : null;
    equippedUseables[slot] = item ? JSON.parse(JSON.stringify(item)) : null;
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
    JSON.stringify({ ...character, equipment: equipmentIds, useables: useableIds })
  );

  return {
    gold: typeof player.gold === 'number' ? player.gold : 0,
    character: sanitizedCharacter,
    equipped: equippedItems,
    useables: equippedUseables,
    derived,
    inventory,
    ownedCounts,
  };
}

async function setEquipment(playerId, characterId, slot, itemId) {
  if (!playerId || !characterId || !slot) {
    throw new Error('playerId, characterId, and slot required');
  }
  const allSlots = [...EQUIPMENT_SLOTS, ...USEABLE_SLOTS];
  if (!allSlots.includes(slot)) {
    throw new Error('invalid equipment slot');
  }
  const [playerDoc, characterDoc, equipmentMap] = await Promise.all([
    PlayerModel.findOne({ playerId }).lean(),
    CharacterModel.findOne({ characterId }),
    getEquipmentMap(),
  ]);
  if (!playerDoc) {
    throw new Error('player not found');
  }
  if (!characterDoc || characterDoc.playerId !== playerId) {
    throw new Error('character not found');
  }

  const character = characterDoc;
  if (!character.equipment) {
    character.equipment = {};
  }
  if (!character.useables) {
    character.useables = {};
  }
  EQUIPMENT_SLOTS.forEach(s => {
    if (character.equipment[s] === undefined) {
      character.equipment[s] = null;
    }
  });
  USEABLE_SLOTS.forEach(s => {
    if (character.useables[s] === undefined) {
      character.useables[s] = null;
    }
  });

  let useablesChanged = false;

  if (itemId) {
    const item = equipmentMap.get(itemId);
    if (!item) {
      throw new Error('item not found');
    }
    if (USEABLE_SLOTS.includes(slot)) {
      if (item.slot !== 'useable') {
        throw new Error('item cannot be equipped in this slot');
      }
      USEABLE_SLOTS.forEach(other => {
        if (other !== slot && character.useables[other] === itemId) {
          character.useables[other] = null;
          useablesChanged = true;
        }
      });
    } else if (item.slot !== slot) {
      throw new Error('item cannot be equipped in this slot');
    }
    const owned = (Array.isArray(playerDoc.items) ? playerDoc.items : []).filter(id => id === itemId).length;
    if (owned <= 0) {
      throw new Error('item not owned');
    }
  }

  if (USEABLE_SLOTS.includes(slot)) {
    if (character.useables[slot] !== (itemId || null)) {
      character.useables[slot] = itemId || null;
      useablesChanged = true;
    }
  } else {
    character.equipment[slot] = itemId || null;
  }
  if (useablesChanged) {
    character.markModified('useables');
  }
  await character.save();

  return getInventory(playerId, characterId);
}

module.exports = { getInventory, setEquipment };
