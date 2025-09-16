const MIN_ATTACK_INTERVAL = 2.0;
const A = 3;
const K = 0.1;

const SCALING_VALUES = {
  S: 1.9,
  A: 1.6,
  B: 1.3,
  C: 1.0,
  D: 0.7,
  E: 0.4,
};

const STATS = ['strength', 'stamina', 'agility', 'intellect', 'wisdom'];
const EQUIPMENT_SLOTS = ['weapon', 'helmet', 'chest', 'legs', 'feet', 'hands'];

function attackInterval(agi) {
  return MIN_ATTACK_INTERVAL + A * Math.exp(-K * agi);
}

function computeWeaponDamage(weapon, attributes) {
  const baseMin = weapon.baseDamage && typeof weapon.baseDamage.min === 'number' ? weapon.baseDamage.min : 0;
  const baseMax = weapon.baseDamage && typeof weapon.baseDamage.max === 'number' ? weapon.baseDamage.max : baseMin;
  const scaling = weapon.scaling || {};
  let scalingScore = 0;
  Object.entries(scaling).forEach(([stat, letter]) => {
    const key = String(letter || '').toUpperCase();
    const multiplier = SCALING_VALUES[key] || 0;
    scalingScore += (attributes[stat] || 0) * multiplier;
  });
  const minBonus = Math.round(scalingScore * 0.5);
  const maxBonus = Math.round(scalingScore * 0.8);
  const minDamage = baseMin + minBonus;
  const maxDamage = Math.max(minDamage, baseMax + maxBonus);
  return { minDamage, maxDamage };
}

function clampResist(value) {
  if (Number.isNaN(value)) return 0;
  return Math.min(0.75, Math.max(0, value));
}

function cloneEffect(effect) {
  return JSON.parse(JSON.stringify(effect));
}

function compute(character, equipped = {}) {
  const baseAttributes = {};
  STATS.forEach(stat => {
    baseAttributes[stat] = character.attributes && typeof character.attributes[stat] === 'number' ? character.attributes[stat] : 0;
  });

  const attributeBonuses = STATS.reduce((acc, stat) => ({ ...acc, [stat]: 0 }), {});
  const resourceBonuses = { health: 0, mana: 0, stamina: 0 };
  let meleeResistBonus = 0;
  let magicResistBonus = 0;
  let attackIntervalModifier = 0;
  const onHitEffects = [];

  EQUIPMENT_SLOTS.forEach(slot => {
    const item = equipped && equipped[slot];
    if (!item) return;
    const bonuses = item.attributeBonuses || {};
    STATS.forEach(stat => {
      attributeBonuses[stat] += bonuses[stat] || 0;
    });
    if (item.resourceBonuses) {
      resourceBonuses.health += item.resourceBonuses.health || 0;
      resourceBonuses.mana += item.resourceBonuses.mana || 0;
      resourceBonuses.stamina += item.resourceBonuses.stamina || 0;
    }
    if (item.resistances) {
      meleeResistBonus += item.resistances.melee || 0;
      magicResistBonus += item.resistances.magic || 0;
    }
    if (typeof item.attackIntervalModifier === 'number') {
      attackIntervalModifier += item.attackIntervalModifier;
    }
    if (Array.isArray(item.onHitEffects)) {
      item.onHitEffects.forEach(entry => {
        if (!entry || !entry.effect) return;
        onHitEffects.push({
          itemId: item.id,
          itemName: item.name,
          trigger: entry.trigger || 'any',
          chance: typeof entry.chance === 'number' ? entry.chance : 1,
          effect: cloneEffect(entry.effect),
          conditions: entry.conditions ? { ...entry.conditions } : undefined,
        });
      });
    }
  });

  const attributes = {};
  STATS.forEach(stat => {
    attributes[stat] = baseAttributes[stat] + attributeBonuses[stat];
  });

  let attackIntervalSeconds = attackInterval(attributes.agility) + attackIntervalModifier;
  attackIntervalSeconds = Math.max(MIN_ATTACK_INTERVAL, attackIntervalSeconds);

  const staminaValue = attributes.stamina;
  const wisdomValue = attributes.wisdom;

  const health = 100 + staminaValue * 10 + resourceBonuses.health;
  const mana = 50 + wisdomValue * 8 + resourceBonuses.mana;
  const stamina = 50 + staminaValue * 8 + resourceBonuses.stamina;

  const weapon = equipped ? equipped.weapon : null;
  let minMeleeAttack = attributes.strength * 2;
  let maxMeleeAttack = attributes.strength * 2 + 4;
  let minMagicAttack = attributes.intellect * 2;
  let maxMagicAttack = attributes.intellect * 2 + 4;
  let basicAttackEffectType = character.basicType === 'melee' ? 'PhysicalDamage' : 'MagicDamage';
  let weaponDamageType = null;

  if (weapon) {
    const { minDamage, maxDamage } = computeWeaponDamage(weapon, attributes);
    if (weapon.damageType === 'magical') {
      minMagicAttack = minDamage;
      maxMagicAttack = maxDamage;
      basicAttackEffectType = 'MagicDamage';
      weaponDamageType = 'magical';
    } else {
      minMeleeAttack = minDamage;
      maxMeleeAttack = maxDamage;
      basicAttackEffectType = 'PhysicalDamage';
      weaponDamageType = 'physical';
    }
  }

  const meleeResist = clampResist(meleeResistBonus);
  const magicResist = clampResist(magicResistBonus);

  return {
    baseAttributes,
    attributes,
    attributeBonuses,
    resourceBonuses,
    minMeleeAttack,
    maxMeleeAttack,
    minMagicAttack,
    maxMagicAttack,
    attackIntervalSeconds,
    health,
    mana,
    stamina,
    meleeResist,
    magicResist,
    onHitEffects,
    basicAttackEffectType,
    weaponDamageType: weaponDamageType || (basicAttackEffectType === 'MagicDamage' ? 'magical' : 'physical'),
  };
}

module.exports = { compute };
