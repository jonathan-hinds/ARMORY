const CharacterModel = require('../models/Character');
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
const { resolveItem, getCustomDefinition } = require('./customItemService');

function slotOrder(slot) {
  const order = [...EQUIPMENT_SLOTS, 'useable'];
  const idx = order.indexOf(slot);
  return idx === -1 ? order.length : idx;
}

async function getInventory(playerId, characterId) {
  if (!playerId || !characterId) {
    throw new Error('playerId and characterId required');
  }
  const characterDoc = await CharacterModel.findOne({ characterId, playerId });
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
  for (const slot of EQUIPMENT_SLOTS) {
    const id = equipmentIds[slot];
    const resolved = id ? await resolveItem(characterDoc, id, equipmentMap) : null;
    if (resolved) {
      const clone = JSON.parse(JSON.stringify(resolved));
      const definition = getCustomDefinition(characterDoc, id);
      const baseItemId = definition && definition.baseItemId ? definition.baseItemId : id;
      clone.instanceId = id;
      clone.baseItemId = baseItemId;
      equippedItems[slot] = clone;
      equippedForCompute[slot] = resolved;
    } else {
      equippedItems[slot] = null;
      equippedForCompute[slot] = null;
    }
  }

  const equippedUseables = {};
  for (const slot of USEABLE_SLOTS) {
    const id = useableIds[slot];
    const resolved = id ? await resolveItem(characterDoc, id, equipmentMap) : null;
    if (resolved) {
      const clone = JSON.parse(JSON.stringify(resolved));
      const definition = getCustomDefinition(characterDoc, id);
      const baseItemId = definition && definition.baseItemId ? definition.baseItemId : id;
      clone.instanceId = id;
      clone.baseItemId = baseItemId;
      equippedUseables[slot] = clone;
    } else {
      equippedUseables[slot] = null;
    }
  }

  const derived = compute(character, equippedForCompute);

  const counts = new Map();
  const aggregateItems = new Map();
  const customEntries = [];
  const rawItems = Array.isArray(characterDoc.items) ? characterDoc.items : [];
  for (const storedId of rawItems) {
    if (!storedId) continue;
    const resolved = await resolveItem(characterDoc, storedId, equipmentMap);
    if (!resolved) continue;
    const definition = getCustomDefinition(characterDoc, storedId);
    const baseItemId = definition && definition.baseItemId ? definition.baseItemId : storedId;
    if (definition) {
      const clone = JSON.parse(JSON.stringify(resolved));
      clone.instanceId = storedId;
      clone.baseItemId = baseItemId;
      customEntries.push({ item: clone, count: 1 });
    } else {
      const current = counts.get(baseItemId) || 0;
      counts.set(baseItemId, current + 1);
      if (!aggregateItems.has(baseItemId)) {
        const clone = JSON.parse(JSON.stringify(resolved));
        clone.baseItemId = baseItemId;
        aggregateItems.set(baseItemId, clone);
      }
    }
  }

  const inventory = [];
  counts.forEach((count, id) => {
    const item = aggregateItems.get(id);
    if (!item) return;
    inventory.push({ item, count });
  });

  customEntries.forEach(entry => {
    inventory.push(entry);
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
  customEntries.forEach(entry => {
    if (entry && entry.item && entry.item.instanceId) {
      ownedCounts[entry.item.instanceId] = 1;
    }
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
  let equipmentChanged = false;

  if (itemId) {
    const resolved = await resolveItem(characterDoc, itemId, equipmentMap);
    if (!resolved) {
      throw new Error('item not found');
    }
    if (USEABLE_SLOTS.includes(slot)) {
      if (resolved.slot !== 'useable') {
        throw new Error('item cannot be equipped in this slot');
      }
      USEABLE_SLOTS.forEach(other => {
        if (other !== slot && character.useables[other] === itemId) {
          character.useables[other] = null;
          useablesChanged = true;
        }
      });
    } else if (resolved.slot !== slot) {
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
  } else if (character.equipment[slot] !== (itemId || null)) {
    character.equipment[slot] = itemId || null;
    equipmentChanged = true;
  }
  if (useablesChanged && typeof character.markModified === 'function') {
    character.markModified('useables');
  }
  if (equipmentChanged && typeof character.markModified === 'function') {
    character.markModified('equipment');
  }
  await character.save();

  return getInventory(playerId, characterId);
}

module.exports = { getInventory, setEquipment };
