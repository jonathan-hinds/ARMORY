const { pushLog } = require('./log');

function randBetween(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

const CRIT_MULTIPLIER = 1.75;
const BLOCK_DAMAGE_MULTIPLIER = 0.4;
const MIN_HIT_CHANCE = 0.05;
const MAX_HIT_CHANCE = 1;

function clampProbability(value, min = 0, max = 1) {
  if (!Number.isFinite(value)) return min;
  const clamped = Math.min(Math.max(value, min), max);
  return clamped;
}

function chanceRoll(probability) {
  return Math.random() < probability;
}

function getDamageType(source, effectType) {
  if (effectType === 'MagicDamage') return 'magical';
  if (effectType === 'PhysicalDamage') return 'physical';
  if (source && source.derived && source.derived.weaponDamageType) {
    return source.derived.weaponDamageType;
  }
  if (source && source.basicAttackEffectType === 'MagicDamage') return 'magical';
  if (source && source.character && source.character.basicType === 'magic') return 'magical';
  return 'physical';
}

function resolveAttack(source, target, type, log, existingResolution) {
  if (existingResolution && typeof existingResolution === 'object') {
    return {
      hit: !!existingResolution.hit,
      outcome: existingResolution.outcome || (existingResolution.hit ? 'hit' : 'miss'),
      damageType: existingResolution.damageType || type,
      hitChance: existingResolution.hitChance,
      dodgeChance: existingResolution.dodgeChance,
    };
  }

  const hitChance = clampProbability((source.derived.hitChance || 0) / 100, MIN_HIT_CHANCE, MAX_HIT_CHANCE);
  const dodgeChance = clampProbability((target.derived.dodgeChance || 0) / 100);

  if (Math.random() > hitChance) {
    pushLog(log, `${source.character.name}'s attack misses ${target.character.name}`, {
      sourceId: source.character.id,
      targetId: target.character.id,
      kind: 'miss',
      damageType: type,
    });
    return { hit: false, outcome: 'miss', damageType: type, hitChance, dodgeChance };
  }

  if (chanceRoll(dodgeChance)) {
    pushLog(log, `${target.character.name} dodges ${source.character.name}'s attack`, {
      sourceId: target.character.id,
      targetId: source.character.id,
      kind: 'dodge',
      damageType: type,
    });
    return { hit: false, outcome: 'dodge', damageType: type, hitChance, dodgeChance };
  }

  return { hit: true, outcome: 'hit', damageType: type, hitChance, dodgeChance };
}

function applyDamage(source, target, amount, type, log, context = {}) {
  const resolution = resolveAttack(source, target, type, log, context.resolution);
  const resolvedType = resolution.damageType || type;
  if (!resolution.hit) {
    return { hit: false, amount: 0, damageType: resolvedType, resolution };
  }

  const critChance = clampProbability((source.derived.critChance || 0) / 100);
  const blockChance = clampProbability((target.derived.blockChance || 0) / 100);
  const crit = chanceRoll(critChance);
  const blocked = chanceRoll(blockChance);

  const damageBuff = Number.isFinite(source.damageBuff) ? source.damageBuff : 0;
  let dmg = amount;
  if (crit) {
    dmg *= CRIT_MULTIPLIER;
  }
  dmg *= 1 + damageBuff;
  if (blocked) {
    dmg *= BLOCK_DAMAGE_MULTIPLIER;
  }

  const resist = resolvedType === 'physical' ? target.derived.meleeResist : target.derived.magicResist;
  const finalDamage = Math.max(1, Math.round(dmg * (1 - resist)));
  target.health -= finalDamage;

  let message;
  if (crit && blocked) {
    message = `${source.character.name} critically hits ${target.character.name} for ${finalDamage} ${resolvedType} (blocked)`;
  } else if (crit) {
    message = `${source.character.name} critically hits ${target.character.name} for ${finalDamage} ${resolvedType}`;
  } else if (blocked) {
    message = `${source.character.name} hits ${target.character.name} for ${finalDamage} ${resolvedType} (blocked)`;
  } else {
    message = `${source.character.name} hits ${target.character.name} for ${finalDamage} ${resolvedType}`;
  }

  pushLog(log, message, {
    sourceId: source.character.id,
    targetId: target.character.id,
    kind: 'damage',
    damageType: resolvedType,
    amount: finalDamage,
    crit,
    blocked,
  });

  const resultResolution = { ...resolution, damageType: resolvedType, crit, blocked };
  return { hit: true, amount: finalDamage, crit, blocked, damageType: resolvedType, resolution: resultResolution };
}

function applyEffect(source, target, effect, now, log, context = {}) {
  switch (effect.type) {
    case 'PhysicalDamage': {
      const bonus = typeof effect.value === 'number' ? effect.value : 0;
      const base = bonus + randBetween(source.derived.minMeleeAttack, source.derived.maxMeleeAttack);
      return applyDamage(source, target, base, 'physical', log, context);
    }
    case 'MagicDamage': {
      const bonus = typeof effect.value === 'number' ? effect.value : 0;
      const base = bonus + randBetween(source.derived.minMagicAttack, source.derived.maxMagicAttack);
      return applyDamage(source, target, base, 'magical', log, context);
    }
    case 'Heal': {
      const amount = typeof effect.value === 'number' ? effect.value : 0;
      const before = source.health;
      source.health = Math.min(source.health + amount, source.derived.health);
      const healed = source.health - before;
      pushLog(log, `${source.character.name} heals ${healed}`, {
        sourceId: source.character.id,
        targetId: source.character.id,
        kind: 'heal',
        amount: healed,
      });
      return null;
    }
    case 'BuffDamagePct': {
      const amount = typeof effect.amount === 'number' ? effect.amount : 0;
      const duration = typeof effect.duration === 'number' ? effect.duration : 0;
      source.damageBuff += amount;
      source.buffs.push({ amount, expires: now + duration });
      pushLog(log, `${source.character.name} gains +${Math.round(amount * 100)}% damage`, {
        sourceId: source.character.id,
        targetId: source.character.id,
        kind: 'buff',
        amount,
        duration,
      });
      return null;
    }
    case 'Stun': {
      const type = getDamageType(source, effect.type);
      const resolution = resolveAttack(source, target, type, log, context.resolution);
      if (!resolution.hit) {
        return { hit: false, amount: 0, damageType: resolution.damageType, resolution };
      }
      const duration = typeof effect.duration === 'number' ? effect.duration : 0;
      target.stunnedUntil = Math.max(target.stunnedUntil, now + duration);
      pushLog(log, `${target.character.name} is stunned`, {
        sourceId: target.character.id,
        targetId: source.character.id,
        kind: 'stun',
        duration,
      });
      const resultResolution = { ...resolution, damageType: resolution.damageType };
      return { hit: true, amount: 0, damageType: resultResolution.damageType, resolution: resultResolution };
    }
    case 'Poison': {
      const type = getDamageType(source, effect.type);
      const resolution = resolveAttack(source, target, type, log, context.resolution);
      if (!resolution.hit) {
        return { hit: false, amount: 0, damageType: resolution.damageType, resolution };
      }
      const damage = typeof effect.damage === 'number' ? effect.damage : 0;
      const interval = typeof effect.interval === 'number' ? effect.interval : 1;
      const duration = typeof effect.duration === 'number' ? effect.duration : 0;
      target.dots.push({
        damage,
        interval,
        nextTick: now + interval,
        expires: now + duration,
      });
      pushLog(log, `${target.character.name} is poisoned`, {
        sourceId: target.character.id,
        targetId: source.character.id,
        kind: 'poison',
        interval,
        duration,
        damage,
      });
      const resultResolution = { ...resolution, damageType: resolution.damageType };
      return {
        hit: true,
        amount: 0,
        damageType: resultResolution.damageType,
        resolution: resultResolution,
        appliedEffect: 'Poison',
      };
    }
    default:
      return null;
  }
}

function tick(combatant, now, log) {
  combatant.buffs = combatant.buffs.filter(b => {
    if (now >= b.expires) {
      combatant.damageBuff -= b.amount;
      pushLog(log, `${combatant.character.name}'s buff fades`, {
        sourceId: combatant.character.id,
        targetId: combatant.character.id,
        kind: 'buffEnd',
        amount: b.amount,
      });
      return false;
    }
    return true;
  });
  combatant.dots = combatant.dots.filter(d => {
    while (now >= d.nextTick && now < d.expires) {
      const dmg = Math.max(1, Math.round(d.damage * (1 - combatant.derived.meleeResist)));
      combatant.health -= dmg;
      pushLog(log, `${combatant.character.name} takes ${dmg} poison damage`, {
        sourceId: combatant.character.id,
        targetId: combatant.character.id,
        kind: 'damage',
        damageType: 'poison',
        amount: dmg,
      });
      d.nextTick += d.interval;
    }
    return now < d.expires;
  });
}

module.exports = { applyEffect, tick };
