const CharacterModel = require('../models/Character');
const PlayerModel = require('../models/Player');
const {
  ensureEquipmentShape,
  ensureUseableShape,
  serializeCharacter,
  EQUIPMENT_SLOTS,
  USEABLE_SLOTS,
  ensureMaterialShape,
} = require('../models/utils');
const { getEquipmentMap } = require('./equipmentService');
const { getMaterialMap } = require('./materialService');
const { compute } = require('./derivedStats');
const { processJobForCharacter } = require('./jobService');
const { buildStashView } = require('./stashService');

function slotOrder(slot) {
  const order = [...EQUIPMENT_SLOTS, 'useable'];
  const idx = order.indexOf(slot);
  return idx === -1 ? order.length : idx;
}

async function getInventory(playerId, characterId) {
  if (!playerId || !characterId) {
    throw new Error('playerId and characterId required');
  }
  const [characterDoc, playerDoc] = await Promise.all([
    CharacterModel.findOne({ characterId, playerId }),
    PlayerModel.findOne({ playerId }),
  ]);
  if (!characterDoc) {
    throw new Error('character not found');
  }

  const { changed } = await processJobForCharacter(characterDoc);
  if (changed) {
    await characterDoc.save();
  }

  const [equipmentMap, materialMap] = await Promise.all([
    getEquipmentMap(),
    getMaterialMap(),
  ]);
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
  (Array.isArray(character.items) ? character.items : []).forEach(id => {
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

  const materialCounts = ensureMaterialShape(character.materials || {});
  const materials = [];
  Object.entries(materialCounts).forEach(([id, count]) => {
    if (!count) return;
    const material = materialMap.get(id);
    if (!material) return;
    const plain = JSON.parse(JSON.stringify(material));
    materials.push({ material: plain, count });
  });

  const rarityRank = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];
  materials.sort((a, b) => {
    const rarityA = a.material.rarity || 'Common';
    const rarityB = b.material.rarity || 'Common';
    const indexA = rarityRank.indexOf(rarityA);
    const indexB = rarityRank.indexOf(rarityB);
    if (indexA !== indexB) {
      return (indexA === -1 ? rarityRank.length : indexA) - (indexB === -1 ? rarityRank.length : indexB);
    }
    const costA = typeof a.material.cost === 'number' ? a.material.cost : 0;
    const costB = typeof b.material.cost === 'number' ? b.material.cost : 0;
    if (costA !== costB) return costA - costB;
    return a.material.name.localeCompare(b.material.name);
  });

  const ownedMaterialCounts = {};
  Object.entries(materialCounts).forEach(([id, count]) => {
    ownedMaterialCounts[id] = count;
  });

  const sanitizedCharacter = JSON.parse(
    JSON.stringify({
      ...character,
      equipment: equipmentIds,
      useables: useableIds,
      materials: materialCounts,
    })
  );

  const stash = playerDoc ? buildStashView(playerDoc.stash || {}, equipmentMap, materialMap) : null;

  return {
    gold: typeof character.gold === 'number' ? character.gold : 0,
    character: sanitizedCharacter,
    equipped: equippedItems,
    useables: equippedUseables,
    derived,
    inventory,
    ownedCounts,
    materials,
    ownedMaterials: ownedMaterialCounts,
    stash,
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
  const [characterDoc, equipmentMap] = await Promise.all([
    CharacterModel.findOne({ characterId, playerId }),
    getEquipmentMap(),
  ]);
  if (!characterDoc) {
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
    const owned = (Array.isArray(character.items) ? character.items : []).filter(id => id === itemId).length;
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
