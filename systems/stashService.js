const PlayerModel = require('../models/Player');
const CharacterModel = require('../models/Character');
const {
  EQUIPMENT_SLOTS,
  USEABLE_SLOTS,
  ensureEquipmentShape,
  ensureUseableShape,
  ensureMaterialShape,
  countItems,
  findItemIndex,
  matchesItemId,
} = require('../models/utils');
const { getEquipmentMap } = require('./equipmentService');
const { getMaterialMap } = require('./materialService');
const { getInventory } = require('./inventoryService');
const { processJobForCharacter } = require('./jobService');

const BASE_EQUIPMENT_SLOTS = 5;
const SLOT_COST_BASE = 100;
const SLOT_COST_GROWTH = 2;

function ensurePlainObject(value) {
  if (!value || typeof value !== 'object') {
    return {};
  }
  if (value._doc && typeof value._doc === 'object') {
    return ensurePlainObject(value._doc);
  }
  if (typeof value.toObject === 'function') {
    try {
      const plain = value.toObject({ depopulate: true, flattenMaps: true });
      if (plain && typeof plain === 'object') {
        return plain;
      }
    } catch (err) {
      // ignore conversion failure and fall back to shallow copy
    }
  }
  return { ...value };
}

function ensureStash(playerDoc) {
  let stash = playerDoc.stash;
  if (!stash || typeof stash !== 'object') {
    stash = { gold: 0, equipmentSlots: BASE_EQUIPMENT_SLOTS, equipment: {}, materials: {} };
  }
  stash = ensurePlainObject(stash);
  if (!Number.isFinite(stash.gold)) {
    stash.gold = 0;
  }
  if (!Number.isFinite(stash.equipmentSlots) || stash.equipmentSlots < BASE_EQUIPMENT_SLOTS) {
    stash.equipmentSlots = BASE_EQUIPMENT_SLOTS;
  }
  stash.equipment = ensurePlainObject(stash.equipment);
  stash.materials = ensurePlainObject(stash.materials);
  if (playerDoc.stash !== stash) {
    playerDoc.stash = stash;
  }
  return playerDoc.stash;
}

function cleanupStashEquipment(stash) {
  if (!stash || typeof stash !== 'object') return;
  const equipment = ensurePlainObject(stash.equipment);
  let modified = false;
  Object.keys(equipment).forEach(id => {
    const numeric = Number(equipment[id]);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      delete equipment[id];
      modified = true;
    } else {
      const floored = Math.floor(numeric);
      if (floored !== equipment[id]) {
        equipment[id] = floored;
        modified = true;
      }
    }
  });
  if (stash.equipment !== equipment || modified) {
    stash.equipment = equipment;
    if (typeof stash.markModified === 'function') {
      stash.markModified('equipment');
    }
  }
}

function countStashSlots(stash) {
  if (!stash || typeof stash !== 'object') return 0;
  const equipment = ensurePlainObject(stash.equipment);
  return Object.values(equipment).reduce((total, value) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? total + 1 : total;
  }, 0);
}

function slotOrder(slot) {
  const order = [...EQUIPMENT_SLOTS, 'useable'];
  const idx = order.indexOf(slot);
  return idx === -1 ? order.length : idx;
}

function computeNextSlotCost(stash) {
  const slots = stash && Number.isFinite(stash.equipmentSlots) ? Math.max(stash.equipmentSlots, BASE_EQUIPMENT_SLOTS) : BASE_EQUIPMENT_SLOTS;
  const purchased = Math.max(0, slots - BASE_EQUIPMENT_SLOTS);
  return SLOT_COST_BASE * Math.pow(SLOT_COST_GROWTH, purchased);
}

function countEquippedCopies(characterDoc, itemId) {
  if (!characterDoc || !itemId) return 0;
  let total = 0;
  const equipment = ensureEquipmentShape(characterDoc.equipment || {});
  EQUIPMENT_SLOTS.forEach(slot => {
    const equipped = equipment[slot];
    if (equipped && matchesItemId(equipped, itemId)) {
      total += 1;
    }
  });
  const useables = ensureUseableShape(characterDoc.useables || {});
  USEABLE_SLOTS.forEach(slot => {
    const equipped = useables[slot];
    if (equipped && matchesItemId(equipped, itemId)) {
      total += 1;
    }
  });
  return total;
}

function removeItems(items, itemId, count) {
  if (!Array.isArray(items)) return [];
  const nextItems = [...items];
  let remaining = count;
  while (remaining > 0) {
    const index = findItemIndex(nextItems, itemId);
    if (index === -1) break;
    nextItems.splice(index, 1);
    remaining -= 1;
  }
  if (remaining > 0) {
    throw new Error('insufficient copies of item');
  }
  return nextItems;
}

async function serializeStash(playerDoc) {
  if (!playerDoc) return null;
  const stashDoc = ensureStash(playerDoc);
  cleanupStashEquipment(stashDoc);
  const stash = ensurePlainObject(stashDoc);
  stash.equipment = ensurePlainObject(stashDoc.equipment);
  stash.materials = ensurePlainObject(stashDoc.materials);
  const [equipmentMap, materialMap] = await Promise.all([getEquipmentMap(), getMaterialMap()]);
  const equipment = [];
  Object.entries(stash.equipment).forEach(([id, value]) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return;
    const item = equipmentMap.get(id);
    if (!item) return;
    equipment.push({ item: JSON.parse(JSON.stringify(item)), count: Math.floor(numeric) });
  });
  equipment.sort((a, b) => {
    const sa = slotOrder(a.item.slot);
    const sb = slotOrder(b.item.slot);
    if (sa !== sb) return sa - sb;
    const costA = typeof a.item.cost === 'number' ? a.item.cost : 0;
    const costB = typeof b.item.cost === 'number' ? b.item.cost : 0;
    if (costA !== costB) return costA - costB;
    return a.item.name.localeCompare(b.item.name);
  });

  const materialCounts = ensureMaterialShape(stash.materials || {});
  const materials = [];
  Object.entries(materialCounts).forEach(([id, amount]) => {
    const numeric = Number(amount);
    if (!Number.isFinite(numeric) || numeric <= 0) return;
    const material = materialMap.get(id);
    if (!material) return;
    materials.push({ material: JSON.parse(JSON.stringify(material)), count: Math.floor(numeric) });
  });
  const rarityRank = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];
  materials.sort((a, b) => {
    const rarityA = a.material.rarity || 'Common';
    const rarityB = b.material.rarity || 'Common';
    const indexA = rarityRank.indexOf(rarityA);
    const indexB = rarityRank.indexOf(rarityB);
    if (indexA !== indexB) {
      const safeA = indexA === -1 ? rarityRank.length : indexA;
      const safeB = indexB === -1 ? rarityRank.length : indexB;
      return safeA - safeB;
    }
    const costA = typeof a.material.cost === 'number' ? a.material.cost : 0;
    const costB = typeof b.material.cost === 'number' ? b.material.cost : 0;
    if (costA !== costB) return costA - costB;
    return a.material.name.localeCompare(b.material.name);
  });

  return {
    gold: Number.isFinite(stash.gold) ? Math.floor(stash.gold) : 0,
    equipmentSlots: stash.equipmentSlots,
    slotsUsed: countStashSlots(stash),
    nextSlotCost: computeNextSlotCost(stash),
    equipment,
    materials,
  };
}

async function ensurePlayerAndCharacter(playerId, characterId) {
  const [playerDoc, characterDoc] = await Promise.all([
    PlayerModel.findOne({ playerId }),
    CharacterModel.findOne({ playerId, characterId }),
  ]);
  if (!playerDoc) {
    throw new Error('player not found');
  }
  if (!characterDoc) {
    throw new Error('character not found');
  }
  const { changed } = await processJobForCharacter(characterDoc);
  if (changed) {
    await characterDoc.save();
  }
  ensureStash(playerDoc);
  cleanupStashEquipment(playerDoc.stash);
  return { playerDoc, characterDoc };
}

function normalizeCount(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.floor(numeric);
}

async function getStash(playerId, characterId) {
  if (!playerId || !characterId) {
    throw new Error('playerId and characterId required');
  }
  const { playerDoc } = await ensurePlayerAndCharacter(playerId, characterId);
  return serializeStash(playerDoc);
}

async function depositEquipment(playerDoc, characterDoc, itemId, count) {
  if (!itemId) {
    throw new Error('itemId required');
  }
  if (count <= 0) {
    throw new Error('quantity must be at least 1');
  }
  const owned = countItems(characterDoc.items, itemId);
  if (owned < count) {
    throw new Error('not enough copies to stash');
  }
  const equippedCopies = countEquippedCopies(characterDoc, itemId);
  if (owned - count < equippedCopies) {
    throw new Error('cannot stash equipped items');
  }
  const stash = ensureStash(playerDoc);
  cleanupStashEquipment(stash);
  const current = Number(stash.equipment[itemId]) || 0;
  const slotsUsed = countStashSlots(stash);
  const addingNew = current <= 0;
  if (addingNew && slotsUsed >= stash.equipmentSlots) {
    throw new Error('stash has no free equipment slots');
  }
  characterDoc.items = removeItems(characterDoc.items || [], itemId, count);
  stash.equipment[itemId] = current + count;
  playerDoc.markModified('stash.equipment');
}

async function withdrawEquipment(playerDoc, characterDoc, itemId, count) {
  if (!itemId) {
    throw new Error('itemId required');
  }
  if (count <= 0) {
    throw new Error('quantity must be at least 1');
  }
  const stash = ensureStash(playerDoc);
  cleanupStashEquipment(stash);
  const current = Number(stash.equipment[itemId]) || 0;
  if (current < count) {
    throw new Error('not enough items in stash');
  }
  const next = current - count;
  if (next > 0) {
    stash.equipment[itemId] = next;
  } else {
    delete stash.equipment[itemId];
  }
  const items = Array.isArray(characterDoc.items) ? [...characterDoc.items] : [];
  for (let i = 0; i < count; i += 1) {
    items.push(itemId);
  }
  characterDoc.items = items;
  playerDoc.markModified('stash.equipment');
}

function depositMaterials(playerDoc, characterDoc, materialId, count) {
  if (!materialId) {
    throw new Error('materialId required');
  }
  if (count <= 0) {
    throw new Error('quantity must be at least 1');
  }
  const characterMaterials = ensureMaterialShape(characterDoc.materials || {});
  const owned = Number(characterMaterials[materialId]) || 0;
  if (owned < count) {
    throw new Error('not enough materials to stash');
  }
  const nextCharacterAmount = owned - count;
  if (nextCharacterAmount > 0) {
    characterMaterials[materialId] = nextCharacterAmount;
  } else {
    delete characterMaterials[materialId];
  }
  characterDoc.materials = characterMaterials;
  characterDoc.markModified('materials');

  const stash = ensureStash(playerDoc);
  const stashMaterials = ensureMaterialShape(stash.materials || {});
  const stashOwned = Number(stashMaterials[materialId]) || 0;
  stashMaterials[materialId] = stashOwned + count;
  stash.materials = stashMaterials;
  playerDoc.markModified('stash.materials');
}

function withdrawMaterials(playerDoc, characterDoc, materialId, count) {
  if (!materialId) {
    throw new Error('materialId required');
  }
  if (count <= 0) {
    throw new Error('quantity must be at least 1');
  }
  const stash = ensureStash(playerDoc);
  const stashMaterials = ensureMaterialShape(stash.materials || {});
  const owned = Number(stashMaterials[materialId]) || 0;
  if (owned < count) {
    throw new Error('not enough materials in stash');
  }
  const nextStashAmount = owned - count;
  if (nextStashAmount > 0) {
    stashMaterials[materialId] = nextStashAmount;
  } else {
    delete stashMaterials[materialId];
  }
  stash.materials = stashMaterials;
  playerDoc.markModified('stash.materials');

  const characterMaterials = ensureMaterialShape(characterDoc.materials || {});
  const characterOwned = Number(characterMaterials[materialId]) || 0;
  characterMaterials[materialId] = characterOwned + count;
  characterDoc.materials = characterMaterials;
  characterDoc.markModified('materials');
}

function depositGold(playerDoc, characterDoc, amount) {
  if (amount <= 0) {
    throw new Error('amount must be at least 1');
  }
  const currentGold = Number(characterDoc.gold) || 0;
  if (currentGold < amount) {
    throw new Error('not enough gold to stash');
  }
  characterDoc.gold = currentGold - amount;
  const stash = ensureStash(playerDoc);
  stash.gold = (Number(stash.gold) || 0) + amount;
  playerDoc.markModified('stash.gold');
}

function withdrawGold(playerDoc, characterDoc, amount) {
  if (amount <= 0) {
    throw new Error('amount must be at least 1');
  }
  const stash = ensureStash(playerDoc);
  const stashGold = Number(stash.gold) || 0;
  if (stashGold < amount) {
    throw new Error('not enough gold in stash');
  }
  stash.gold = stashGold - amount;
  characterDoc.gold = (Number(characterDoc.gold) || 0) + amount;
  playerDoc.markModified('stash.gold');
}

async function applyAndReturn(playerDoc, characterDoc, playerId, characterId) {
  cleanupStashEquipment(playerDoc.stash);
  await Promise.all([playerDoc.save(), characterDoc.save()]);
  const [stashData, inventoryData] = await Promise.all([
    serializeStash(playerDoc),
    getInventory(playerId, characterId),
  ]);
  return { stash: stashData, inventory: inventoryData };
}

async function depositToStash(playerId, characterId, payload = {}) {
  if (!playerId || !characterId) {
    throw new Error('playerId and characterId required');
  }
  const kind = typeof payload.kind === 'string' ? payload.kind.toLowerCase() : '';
  const count = normalizeCount(payload.count);
  const amount = normalizeCount(payload.amount);
  const itemId = payload.itemId;
  const materialId = payload.materialId;
  const { playerDoc, characterDoc } = await ensurePlayerAndCharacter(playerId, characterId);
  if (kind === 'equipment') {
    await depositEquipment(playerDoc, characterDoc, itemId, count);
  } else if (kind === 'material') {
    depositMaterials(playerDoc, characterDoc, materialId, count);
  } else if (kind === 'gold') {
    depositGold(playerDoc, characterDoc, amount);
  } else {
    throw new Error('invalid stash operation');
  }
  return applyAndReturn(playerDoc, characterDoc, playerId, characterId);
}

async function withdrawFromStash(playerId, characterId, payload = {}) {
  if (!playerId || !characterId) {
    throw new Error('playerId and characterId required');
  }
  const kind = typeof payload.kind === 'string' ? payload.kind.toLowerCase() : '';
  const count = normalizeCount(payload.count);
  const amount = normalizeCount(payload.amount);
  const itemId = payload.itemId;
  const materialId = payload.materialId;
  const { playerDoc, characterDoc } = await ensurePlayerAndCharacter(playerId, characterId);
  if (kind === 'equipment') {
    await withdrawEquipment(playerDoc, characterDoc, itemId, count);
  } else if (kind === 'material') {
    withdrawMaterials(playerDoc, characterDoc, materialId, count);
  } else if (kind === 'gold') {
    withdrawGold(playerDoc, characterDoc, amount);
  } else {
    throw new Error('invalid stash operation');
  }
  return applyAndReturn(playerDoc, characterDoc, playerId, characterId);
}

async function purchaseStashEquipmentSlot(playerId, characterId) {
  if (!playerId || !characterId) {
    throw new Error('playerId and characterId required');
  }
  const { playerDoc, characterDoc } = await ensurePlayerAndCharacter(playerId, characterId);
  const stash = ensureStash(playerDoc);
  cleanupStashEquipment(stash);
  const cost = computeNextSlotCost(stash);
  if (!Number.isFinite(cost) || cost <= 0) {
    throw new Error('unable to compute slot cost');
  }
  const stashGold = Number(stash.gold) || 0;
  if (stashGold < cost) {
    throw new Error('not enough stash gold');
  }
  stash.gold = stashGold - cost;
  stash.equipmentSlots += 1;
  playerDoc.markModified('stash.gold');
  playerDoc.markModified('stash.equipmentSlots');
  return applyAndReturn(playerDoc, characterDoc, playerId, characterId);
}

module.exports = {
  getStash,
  depositToStash,
  withdrawFromStash,
  purchaseStashEquipmentSlot,
};
