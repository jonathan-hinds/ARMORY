const PlayerModel = require('../models/Player');
const CharacterModel = require('../models/Character');
const {
  EQUIPMENT_SLOTS,
  ensureMaterialShape,
  ensureStashShape,
  ensureStashEquipmentShape,
  DEFAULT_STASH_EQUIPMENT_SLOTS,
  matchesItemId,
  countItems,
} = require('../models/utils');
const { getEquipmentMap } = require('./equipmentService');
const { getMaterialMap } = require('./materialService');

const BASE_SLOT_COST = 250;
const RARITY_ORDER = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];

function slotOrder(slot) {
  const order = [...EQUIPMENT_SLOTS, 'useable'];
  const idx = order.indexOf(slot);
  return idx === -1 ? order.length : idx;
}

function sanitizeStashDocument(stashDoc) {
  const shaped = ensureStashShape(stashDoc);
  if (!shaped.equipmentSlots || shaped.equipmentSlots < DEFAULT_STASH_EQUIPMENT_SLOTS) {
    shaped.equipmentSlots = DEFAULT_STASH_EQUIPMENT_SLOTS;
  }
  return shaped;
}

function ensureStash(playerDoc) {
  if (!playerDoc.stash) {
    playerDoc.stash = sanitizeStashDocument({});
    playerDoc.markModified('stash');
    return playerDoc.stash;
  }
  const sanitized = sanitizeStashDocument(playerDoc.stash);
  playerDoc.stash.gold = sanitized.gold;
  playerDoc.stash.equipmentSlots = sanitized.equipmentSlots;
  playerDoc.stash.equipment = sanitized.equipment;
  playerDoc.stash.materials = sanitized.materials;
  playerDoc.markModified('stash');
  return playerDoc.stash;
}

function getUniqueEquipmentCount(equipmentMap = {}) {
  return Object.values(equipmentMap).filter(count => Number.isFinite(count) && count > 0).length;
}

function computeNextSlotCost(stash) {
  const slots = Math.max(DEFAULT_STASH_EQUIPMENT_SLOTS, Math.floor(stash.equipmentSlots || DEFAULT_STASH_EQUIPMENT_SLOTS));
  const purchased = Math.max(0, slots - DEFAULT_STASH_EQUIPMENT_SLOTS);
  return BASE_SLOT_COST * Math.pow(2, purchased);
}

async function loadPlayerAndCharacter(playerId, characterId) {
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
  return { playerDoc, characterDoc };
}

function removeCharacterItems(characterDoc, itemId, count) {
  if (!Number.isFinite(count) || count <= 0) {
    return;
  }
  const available = countItems(characterDoc.items, itemId);
  if (available < count) {
    throw new Error('not enough copies of item');
  }
  let remaining = count;
  const nextItems = [];
  (Array.isArray(characterDoc.items) ? characterDoc.items : []).forEach(rawId => {
    if (remaining > 0 && matchesItemId(rawId, itemId)) {
      remaining -= 1;
      return;
    }
    nextItems.push(rawId);
  });
  characterDoc.items = nextItems;
  characterDoc.markModified('items');
}

function removeCharacterMaterials(characterDoc, materialId, amount) {
  if (!Number.isFinite(amount) || amount <= 0) {
    return;
  }
  const shaped = ensureMaterialShape(characterDoc.materials || {});
  const current = shaped[materialId] || 0;
  if (current < amount) {
    throw new Error('not enough materials');
  }
  const next = current - amount;
  if (next > 0) {
    characterDoc.materials[materialId] = next;
  } else {
    delete characterDoc.materials[materialId];
  }
  characterDoc.markModified('materials');
}

function applyDepositToStash(stash, { items = [], materials = {}, gold = 0 }) {
  if (!stash.equipment) {
    stash.equipment = {};
  }
  if (!stash.materials) {
    stash.materials = {};
  }
  if (Array.isArray(items)) {
    items.forEach(({ itemId, count }) => {
      if (!itemId) return;
      const numeric = Number(count);
      if (!Number.isFinite(numeric) || numeric <= 0) {
        return;
      }
      const key = String(itemId);
      stash.equipment[key] = (stash.equipment[key] || 0) + Math.floor(numeric);
    });
  }
  const shapedMaterials = ensureMaterialShape(materials);
  Object.entries(shapedMaterials).forEach(([materialId, amount]) => {
    stash.materials[materialId] = (stash.materials[materialId] || 0) + amount;
  });
  const numericGold = Number(gold);
  if (Number.isFinite(numericGold) && numericGold > 0) {
    stash.gold = (stash.gold || 0) + numericGold;
  }
}

async function depositToStash(playerId, characterId, payload = {}) {
  if (!playerId || !characterId) {
    throw new Error('playerId and characterId required');
  }
  const { playerDoc, characterDoc } = await loadPlayerAndCharacter(playerId, characterId);
  const stash = ensureStash(playerDoc);

  const normalizedItems = Array.isArray(payload.items) ? payload.items : [];
  const normalizedMaterials = ensureMaterialShape(payload.materials || {});
  const goldAmount = Number(payload.gold) || 0;

  const pendingItems = normalizedItems
    .map(entry => {
      if (!entry || entry.itemId == null) return null;
      const count = Number(entry.count);
      if (!Number.isFinite(count) || count <= 0) return null;
      return { itemId: String(entry.itemId), count: Math.floor(count) };
    })
    .filter(Boolean);

  const equipmentAfter = { ...ensureStashEquipmentShape(stash.equipment) };
  const uniqueBefore = getUniqueEquipmentCount(equipmentAfter);
  let uniqueAfter = uniqueBefore;
  pendingItems.forEach(({ itemId, count }) => {
    if (!equipmentAfter[itemId]) {
      uniqueAfter += 1;
    }
    equipmentAfter[itemId] = (equipmentAfter[itemId] || 0) + count;
  });
  if (uniqueAfter > stash.equipmentSlots) {
    throw new Error('not enough stash equipment slots');
  }

  if (!characterDoc.materials) {
    characterDoc.materials = {};
  }

  pendingItems.forEach(({ itemId, count }) => removeCharacterItems(characterDoc, itemId, count));
  Object.entries(normalizedMaterials).forEach(([materialId, amount]) => {
    removeCharacterMaterials(characterDoc, materialId, amount);
  });

  const numericGold = Number(goldAmount);
  if (Number.isFinite(numericGold) && numericGold > 0) {
    const availableGold = Number(characterDoc.gold) || 0;
    if (availableGold < numericGold) {
      throw new Error('not enough gold');
    }
    characterDoc.gold = availableGold - numericGold;
  }

  applyDepositToStash(stash, {
    items: pendingItems,
    materials: normalizedMaterials,
    gold: numericGold,
  });

  playerDoc.markModified('stash');
  await Promise.all([playerDoc.save(), characterDoc.save()]);
}

function buildStashView(stash, equipmentMap, materialMap) {
  const normalized = sanitizeStashDocument(stash);
  const equipmentEntries = [];
  Object.entries(normalized.equipment).forEach(([itemId, count]) => {
    if (!(count > 0)) return;
    const item = equipmentMap.get(itemId);
    if (!item) return;
    const plain = JSON.parse(JSON.stringify(item));
    equipmentEntries.push({ item: plain, count });
  });
  equipmentEntries.sort((a, b) => {
    const slotA = a.item ? a.item.slot : null;
    const slotB = b.item ? b.item.slot : null;
    const orderA = slotOrder(slotA);
    const orderB = slotOrder(slotB);
    if (orderA !== orderB) return orderA - orderB;
    const nameA = a.item && a.item.name ? a.item.name : '';
    const nameB = b.item && b.item.name ? b.item.name : '';
    return nameA.localeCompare(nameB);
  });

  const materialEntries = [];
  Object.entries(normalized.materials).forEach(([materialId, amount]) => {
    if (!(amount > 0)) return;
    const material = materialMap.get(materialId);
    if (!material) return;
    const plain = JSON.parse(JSON.stringify(material));
    materialEntries.push({ material: plain, count: amount });
  });
  materialEntries.sort((a, b) => {
    const rarityA = a.material?.rarity || 'Common';
    const rarityB = b.material?.rarity || 'Common';
    const indexA = RARITY_ORDER.indexOf(rarityA);
    const indexB = RARITY_ORDER.indexOf(rarityB);
    if (indexA !== indexB) {
      const safeA = indexA === -1 ? RARITY_ORDER.length : indexA;
      const safeB = indexB === -1 ? RARITY_ORDER.length : indexB;
      return safeA - safeB;
    }
    const nameA = a.material?.name || '';
    const nameB = b.material?.name || '';
    return nameA.localeCompare(nameB);
  });

  const equipmentCounts = ensureStashEquipmentShape(normalized.equipment);
  const materialCounts = ensureMaterialShape(normalized.materials);

  return {
    gold: normalized.gold || 0,
    equipmentSlots: normalized.equipmentSlots || DEFAULT_STASH_EQUIPMENT_SLOTS,
    equipmentUsed: equipmentEntries.length,
    nextSlotCost: computeNextSlotCost(normalized),
    equipment: equipmentEntries,
    equipmentCounts,
    materials: materialEntries,
    materialCounts,
  };
}

async function getStash(playerId) {
  const playerDoc = await PlayerModel.findOne({ playerId });
  if (!playerDoc) {
    throw new Error('player not found');
  }
  const stash = ensureStash(playerDoc);
  const [equipmentMap, materialMap] = await Promise.all([getEquipmentMap(), getMaterialMap()]);
  return buildStashView(stash, equipmentMap, materialMap);
}

async function expandStash(playerId) {
  if (!playerId) {
    throw new Error('playerId required');
  }
  const playerDoc = await PlayerModel.findOne({ playerId });
  if (!playerDoc) {
    throw new Error('player not found');
  }
  const stash = ensureStash(playerDoc);
  const cost = computeNextSlotCost(stash);
  if ((stash.gold || 0) < cost) {
    throw new Error('not enough stash gold');
  }
  stash.gold -= cost;
  stash.equipmentSlots = Math.max(DEFAULT_STASH_EQUIPMENT_SLOTS, Math.floor(stash.equipmentSlots || DEFAULT_STASH_EQUIPMENT_SLOTS)) + 1;
  playerDoc.markModified('stash');
  await playerDoc.save();
  const [equipmentMap, materialMap] = await Promise.all([getEquipmentMap(), getMaterialMap()]);
  return buildStashView(stash, equipmentMap, materialMap);
}

module.exports = {
  depositToStash,
  getStash,
  expandStash,
  buildStashView,
  ensureStash,
  computeNextSlotCost,
};
