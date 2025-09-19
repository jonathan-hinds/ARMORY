const EQUIPMENT_SLOTS = ['weapon', 'helmet', 'chest', 'legs', 'feet', 'hands'];
const USEABLE_SLOTS = ['useable1', 'useable2'];
const STATS = ['strength', 'stamina', 'agility', 'intellect', 'wisdom'];

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

function serializeJobSummary(job) {
  if (!job || typeof job !== 'object') {
    return { jobId: null, startedAt: null, lastProcessedAt: null };
  }
  const jobId = typeof job.jobId === 'string' ? job.jobId : null;
  return {
    jobId,
    startedAt: normalizeDate(job.startedAt),
    lastProcessedAt: normalizeDate(job.lastProcessedAt),
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
};
