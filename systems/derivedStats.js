const SCALING = { S: 1.5, A: 1.3, B: 1.1, C: 1.0, D: 0.8, E: 0.6 };

function attackInterval(agility) {
  const A = 3.0;
  const k = 0.1;
  return 2.0 + A * Math.exp(-k * agility);
}

function computeWeaponDamage(statVal, weapon, statName) {
  if (!weapon) return { min: 1 + statVal * 0.5, max: 3 + statVal * 0.5 };
  const letter = weapon.scaling[statName] || 'E';
  const scale = SCALING[letter] || 0;
  const bonus = statVal * scale;
  return { min: weapon.baseMin + bonus, max: weapon.baseMax + bonus };
}

function computeDerived(character, itemsById = {}) {
  const base = character.attributes;
  const equipment = character.equipment || {};
  const weapon = equipment.weapon ? itemsById[equipment.weapon] : null;
  const armorSlots = ['helmet','chest','legs','feet','hands'];
  let meleeResist = 0, magicResist = 0, bonuses = { strength:0, stamina:0, agility:0, intellect:0, wisdom:0 };

  armorSlots.forEach(slot => {
    const item = equipment[slot] ? itemsById[equipment[slot]] : null;
    if (item) {
      meleeResist += item.meleeResist || 0;
      magicResist += item.magicResist || 0;
      Object.keys(item.bonuses || {}).forEach(stat => {
        bonuses[stat] = (bonuses[stat] || 0) + item.bonuses[stat];
      });
    }
  });

  const stats = {
    strength: base.strength + (bonuses.strength || 0),
    stamina: base.stamina + (bonuses.stamina || 0),
    agility: base.agility + (bonuses.agility || 0),
    intellect: base.intellect + (bonuses.intellect || 0),
    wisdom: base.wisdom + (bonuses.wisdom || 0)
  };

  const melee = computeWeaponDamage(stats.strength, weapon, 'strength');
  const magic = computeWeaponDamage(stats.intellect, weapon, 'intellect');
  const interval = attackInterval(stats.agility);

  const derived = {
    minMeleeAttack: melee.min,
    maxMeleeAttack: melee.max,
    minMagicAttack: magic.min,
    maxMagicAttack: magic.max,
    attackIntervalSeconds: interval,
    healthMax: 50 + stats.stamina * 10,
    manaMax: 30 + stats.intellect * 10,
    staminaMax: 30 + stats.stamina * 5,
    meleeResist,
    magicResist
  };

  return { stats, derived };
}

module.exports = { computeDerived, attackInterval };
