const crypto = require('crypto');
const { getEquipmentMap } = require('./equipmentService');

const CUSTOM_ITEM_PREFIX = 'custom:';

function isCustomItemId(id) {
  return typeof id === 'string' && id.startsWith(CUSTOM_ITEM_PREFIX);
}

function getCustomId(id) {
  if (!isCustomItemId(id)) return null;
  return id.slice(CUSTOM_ITEM_PREFIX.length);
}

function ensureCustomContainer(characterDoc) {
  if (!characterDoc) return;
  if (!characterDoc.customItems) {
    characterDoc.customItems = {};
    return;
  }
  if (
    !(characterDoc.customItems instanceof Map)
    && typeof characterDoc.customItems !== 'object'
  ) {
    characterDoc.customItems = {};
  }
}

function generateCustomItemId(characterDoc) {
  const base = crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  let id = base;
  const container = characterDoc && characterDoc.customItems;
  const hasId = candidate => {
    if (!container) return false;
    if (container instanceof Map) {
      return container.has(candidate);
    }
    return !!container[candidate];
  };
  while (hasId(id)) {
    id = `${base}-${Math.random().toString(36).slice(2, 8)}`;
  }
  return `${CUSTOM_ITEM_PREFIX}${id}`;
}

function getCustomDefinition(characterDoc, itemId) {
  if (!characterDoc) return null;
  const key = getCustomId(itemId);
  if (!key) return null;
  if (characterDoc.customItems instanceof Map) {
    return characterDoc.customItems.get(key) || null;
  }
  const container = characterDoc.customItems || {};
  const entry = container[key];
  if (!entry || typeof entry !== 'object') return null;
  return entry;
}

function storeCustomDefinition(characterDoc, customId, definition) {
  ensureCustomContainer(characterDoc);
  if (characterDoc.customItems instanceof Map) {
    characterDoc.customItems.set(customId.slice(CUSTOM_ITEM_PREFIX.length), definition);
  } else {
    characterDoc.customItems[customId.slice(CUSTOM_ITEM_PREFIX.length)] = definition;
  }
}

function deleteCustomDefinition(characterDoc, itemId) {
  if (!characterDoc) return;
  const key = getCustomId(itemId);
  if (!key) return;
  if (characterDoc.customItems instanceof Map) {
    characterDoc.customItems.delete(key);
  } else if (characterDoc.customItems && typeof characterDoc.customItems === 'object') {
    delete characterDoc.customItems[key];
  }
}

function applyCustomBonuses(baseItem, definition, itemId) {
  if (!baseItem) return null;
  const clone = JSON.parse(JSON.stringify(baseItem));
  clone.id = itemId || baseItem.id;
  if (definition && definition.attributeBonuses) {
    const bonuses = definition.attributeBonuses;
    clone.attributeBonuses = { ...(clone.attributeBonuses || {}) };
    Object.entries(bonuses).forEach(([stat, value]) => {
      const numeric = Number(value);
      if (Number.isFinite(numeric) && numeric !== 0) {
        clone.attributeBonuses[stat] = (clone.attributeBonuses[stat] || 0) + numeric;
      }
    });
  }
  if (definition && definition.nameSuffix && clone.name) {
    clone.name = `${clone.name} ${definition.nameSuffix}`;
  }
  return clone;
}

async function resolveItem(character, itemId, equipmentMap = null) {
  if (!itemId) return null;
  if (!isCustomItemId(itemId)) {
    const map = equipmentMap || (await getEquipmentMap());
    return map.get(itemId) || null;
  }
  const definition = getCustomDefinition(character, itemId);
  if (!definition) {
    return null;
  }
  const map = equipmentMap || (await getEquipmentMap());
  const base = map.get(definition.baseItemId);
  if (!base) {
    return null;
  }
  return applyCustomBonuses(base, definition, itemId);
}

function resolveItemSync(character, itemId, equipmentMap) {
  if (!itemId) return null;
  if (!isCustomItemId(itemId)) {
    return equipmentMap && equipmentMap.get ? equipmentMap.get(itemId) || null : null;
  }
  const definition = getCustomDefinition(character, itemId);
  if (!definition || !equipmentMap) {
    return null;
  }
  const base = equipmentMap.get(definition.baseItemId);
  if (!base) {
    return null;
  }
  return applyCustomBonuses(base, definition, itemId);
}

module.exports = {
  CUSTOM_ITEM_PREFIX,
  isCustomItemId,
  getCustomDefinition,
  storeCustomDefinition,
  deleteCustomDefinition,
  applyCustomBonuses,
  generateCustomItemId,
  resolveItem,
  resolveItemSync,
};
