const EQUIPMENT_SLOTS = ['weapon', 'helmet', 'chest', 'legs', 'feet', 'hands'];
const USEABLE_SLOTS = ['useable1', 'useable2'];
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

function ensureUseableShape(useables = {}) {
  const shaped = {};
  USEABLE_SLOTS.forEach(slot => {
    shaped[slot] = useables[slot] != null ? useables[slot] : null;
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
  };
}

module.exports = {
  EQUIPMENT_SLOTS,
  USEABLE_SLOTS,
  STATS,
  ensureEquipmentShape,
  ensureUseableShape,
  ensureAttributesShape,
  serializeCharacter,
  serializePlayer,
  toPlainObject,
};
