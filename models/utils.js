const EQUIPMENT_SLOTS = ['weapon', 'helmet', 'chest', 'legs', 'feet', 'hands'];
const USEABLE_SLOTS = ['useable1', 'useable2'];
const STATS = ['strength', 'stamina', 'agility', 'intellect', 'wisdom'];
const ITEM_AUGMENT_SEPARATOR = '::bs::';

function normalizeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function toPlainObject(doc) {
  if (!doc) return null;
  const plain = doc.toObject ? doc.toObject({ depopulate: true }) : { ...doc };
  delete plain._id;
  delete plain.__v;
  return plain;
}

function ensureEquipmentShape(equipment = {}) {
  const shaped = {};
  EQUIPMENT_SLOTS.forEach(slot => {
    shaped[slot] = equipment[slot] != null ? equipment[slot] : null;
  });
  return shaped;
}

function ensureUseableShape(useables = {}) {
  const shaped = {};
  USEABLE_SLOTS.forEach(slot => {
    shaped[slot] = useables[slot] != null ? useables[slot] : null;
  });
  return shaped;
}

function ensureMaterialShape(materials = {}) {
  if (!materials || typeof materials !== 'object') {
    return {};
  }
  const shaped = {};
  const assignIfValid = (id, value) => {
    if (id == null) return;
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) {
      shaped[id] = numeric;
    }
  };
  if (materials instanceof Map) {
    materials.forEach((value, key) => {
      assignIfValid(key, value);
    });
  } else {
    Object.entries(materials).forEach(([id, value]) => {
      assignIfValid(id, value);
    });
  }
  return shaped;
}

function readMaterialCount(materials, id) {
  if (!materials || id == null) {
    return 0;
  }
  if (typeof materials.get === 'function') {
    const value = materials.get(id);
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
  }
  const value = materials[id];
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function writeMaterialCount(materials, id, value) {
  if (!materials || id == null) {
    return;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return;
  }
  if (typeof materials.set === 'function') {
    materials.set(id, numeric);
  } else {
    materials[id] = numeric;
  }
}

function ensureAttributesShape(attributes = {}) {
  const shaped = {};
  STATS.forEach(stat => {
    const value = attributes[stat];
    shaped[stat] = typeof value === 'number' ? value : 0;
  });
  return shaped;
}

function serializePlayer(doc) {
  const plain = toPlainObject(doc);
  if (!plain) return null;
  const { playerId, name, characterId } = plain;
  return {
    id: typeof playerId === 'number' ? playerId : null,
    name,
    characterId: characterId != null ? characterId : null,
  };
}

function serializeCharacter(doc) {
  const plain = toPlainObject(doc);
  if (!plain) return null;
  const {
    characterId,
    playerId,
    name,
    attributes,
    basicType,
    level,
    xp,
    rotation,
    equipment,
    useables,
    gold,
    items,
    materials,
    job,
  } = plain;
  return {
    id: typeof characterId === 'number' ? characterId : null,
    playerId,
    name,
    attributes: ensureAttributesShape(attributes),
    basicType,
    level: typeof level === 'number' ? level : 1,
    xp: typeof xp === 'number' ? xp : 0,
    rotation: Array.isArray(rotation) ? [...rotation] : [],
    equipment: ensureEquipmentShape(equipment),
    useables: ensureUseableShape(useables),
    gold: typeof gold === 'number' ? gold : 0,
    items: Array.isArray(items) ? [...items] : [],
    materials: ensureMaterialShape(materials),
    job: serializeJobSummary(job),
  };
}

function parseItemInstanceId(raw) {
  if (!raw || typeof raw !== 'string') {
    return { rawId: raw || null, itemId: null, bonuses: {}, isAugmented: false };
  }
  const idx = raw.indexOf(ITEM_AUGMENT_SEPARATOR);
  if (idx === -1) {
    return { rawId: raw, itemId: raw, bonuses: {}, isAugmented: false };
  }
  const itemId = raw.slice(0, idx) || null;
  const bonusPart = raw.slice(idx + ITEM_AUGMENT_SEPARATOR.length);
  const bonuses = {};
  if (bonusPart) {
    bonusPart.split(',').forEach(segment => {
      const trimmed = segment.trim();
      if (!trimmed) return;
      const match = trimmed.match(/^([a-zA-Z]+)\+(\d+)$/);
      if (!match) return;
      const stat = match[1].toLowerCase();
      const amount = parseInt(match[2], 10);
      if (STATS.includes(stat) && Number.isFinite(amount) && amount > 0) {
        bonuses[stat] = (bonuses[stat] || 0) + amount;
      }
    });
  }
  return {
    rawId: raw,
    itemId,
    bonuses,
    isAugmented: Object.keys(bonuses).length > 0,
  };
}

function formatItemInstanceId(itemId, bonuses) {
  if (!itemId) return null;
  const entries = Object.entries(bonuses || {})
    .map(([stat, amount]) => {
      const normalizedStat = stat ? stat.toLowerCase() : null;
      const numeric = Number(amount);
      if (!normalizedStat || !Number.isFinite(numeric) || numeric <= 0) {
        return null;
      }
      return `${normalizedStat}+${Math.round(numeric)}`;
    })
    .filter(Boolean);
  if (!entries.length) {
    return itemId;
  }
  return `${itemId}${ITEM_AUGMENT_SEPARATOR}${entries.join(',')}`;
}

function combineAttributeBonuses(base = {}, addition = {}) {
  const merged = { ...base };
  Object.entries(addition).forEach(([stat, amount]) => {
    const normalizedStat = stat ? stat.toLowerCase() : null;
    const numeric = Number(amount);
    if (!normalizedStat || !Number.isFinite(numeric) || numeric === 0) {
      return;
    }
    merged[normalizedStat] = (merged[normalizedStat] || 0) + numeric;
  });
  return merged;
}

function matchesItemId(rawId, itemId) {
  if (!rawId || !itemId) {
    return false;
  }
  const parsed = parseItemInstanceId(rawId);
  const base = parsed.itemId || rawId;
  return base === itemId;
}

function findItemIndex(items, itemId) {
  if (!Array.isArray(items)) {
    return -1;
  }
  for (let i = 0; i < items.length; i += 1) {
    if (matchesItemId(items[i], itemId)) {
      return i;
    }
  }
  return -1;
}

function countItems(items, itemId) {
  if (!Array.isArray(items)) {
    return 0;
  }
  return items.reduce((count, rawId) => (matchesItemId(rawId, itemId) ? count + 1 : count), 0);
}

function serializeJobSummary(job) {
  if (!job || typeof job !== 'object') {
    return { jobId: null, startedAt: null, lastProcessedAt: null, isWorking: false, workingSince: null };
  }
  const jobId = typeof job.jobId === 'string' ? job.jobId : null;
  return {
    jobId,
    startedAt: normalizeDate(job.startedAt),
    lastProcessedAt: normalizeDate(job.lastProcessedAt),
    workingSince: normalizeDate(job.workingSince),
    isWorking: !!job.isWorking,
  };
}

module.exports = {
  EQUIPMENT_SLOTS,
  USEABLE_SLOTS,
  STATS,
  ensureEquipmentShape,
  ensureUseableShape,
  ensureMaterialShape,
  readMaterialCount,
  writeMaterialCount,
  ensureAttributesShape,
  serializeCharacter,
  serializePlayer,
  serializeJobSummary,
  toPlainObject,
  parseItemInstanceId,
  formatItemInstanceId,
  combineAttributeBonuses,
  matchesItemId,
  findItemIndex,
  countItems,
};
