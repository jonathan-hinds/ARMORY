const EQUIPMENT_SLOTS = ['weapon', 'helmet', 'chest', 'legs', 'feet', 'hands'];
const STATS = ['strength', 'stamina', 'agility', 'intellect', 'wisdom'];

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
  const { playerId, name, gold, items, characterId } = plain;
  return {
    id: typeof playerId === 'number' ? playerId : null,
    name,
    gold: typeof gold === 'number' ? gold : 0,
    items: Array.isArray(items) ? [...items] : [],
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
  };
}

module.exports = {
  EQUIPMENT_SLOTS,
  STATS,
  ensureEquipmentShape,
  ensureAttributesShape,
  serializeCharacter,
  serializePlayer,
  toPlainObject,
};
