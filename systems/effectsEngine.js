const { pushLog } = require('./log');

function randBetween(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

const CRIT_MULTIPLIER = 1.75;
const BLOCK_DAMAGE_MULTIPLIER = 0.4;
const MIN_HIT_CHANCE = 0.05;
const MAX_HIT_CHANCE = 1;

const CHANCE_STATS = ['critChance', 'blockChance', 'dodgeChance', 'hitChance'];

const MAX_TEMP_RESIST = 0.75;

function normalizeDamageChannel(value) {
  if (typeof value !== 'string') return 'any';
  const lowered = value.trim().toLowerCase();
  if (lowered === 'magical' || lowered === 'magic') return 'magical';
  if (lowered === 'physical' || lowered === 'melee') return 'physical';
  if (lowered === 'any' || lowered === 'all') return 'any';
  return 'any';
}

function matchesDamageChannel(entryType, damageType) {
  if (!entryType) return true;
  if (entryType === 'any') return true;
  return entryType === damageType;
}

function consumeResistBonuses(target, damageType, now) {
  if (!target) return { total: 0, entries: [] };
  if (!Array.isArray(target.resistShields) || target.resistShields.length === 0) {
    return { total: 0, entries: [] };
  }
  const normalizedType = normalizeDamageChannel(damageType);
  const currentTime = Number.isFinite(now) ? now : null;
  const remaining = [];
  const consumedEntries = [];
  let total = 0;
  target.resistShields.forEach(entry => {
    if (!entry) return;
    const expiresAt = Number.isFinite(entry.expiresAt) ? entry.expiresAt : null;
    if (expiresAt != null && currentTime != null && currentTime >= expiresAt) {
      return;
    }
    const entryType = normalizeDamageChannel(entry.damageType);
    if (!matchesDamageChannel(entryType, normalizedType)) {
      remaining.push(entry);
      return;
    }
    const amount = Number(entry.amount);
    if (Number.isFinite(amount) && amount > 0) {
      total += amount;
      consumedEntries.push({ amount, entry });
    }
    const uses = Number.isFinite(entry.remainingAttacks) ? entry.remainingAttacks : 1;
    const nextUses = uses - 1;
    if (nextUses > 0) {
      remaining.push({ ...entry, remainingAttacks: nextUses });
    }
  });
  target.resistShields = remaining;
  return { total, entries: consumedEntries };
}

function applyResistRetaliations(source, target, damageType, baseDamage, consumedEntries, now, log) {
  if (!consumedEntries || consumedEntries.length === 0) {
    return;
  }
  const normalizedType = normalizeDamageChannel(damageType);
  consumedEntries.forEach(item => {
    if (!item || !item.entry || !item.entry.retaliate) return;
    const retaliateType = normalizeDamageChannel(item.entry.retaliateDamageType || 'any');
    if (!matchesDamageChannel(retaliateType, normalizedType)) return;
    const percent = Number(item.amount);
    if (!Number.isFinite(percent) || percent <= 0) return;
    const retaliationDamage = Math.max(0, Math.round(baseDamage * percent));
    if (retaliationDamage <= 0) return;
    if (source) {
      const before = Number.isFinite(source.health) ? source.health : 0;
      source.health = Math.max(0, before - retaliationDamage);
    }
    if (target && target.character && source && source.character) {
      const label = item.entry.retaliateLogLabel || 'shield';
      pushLog(log, `${target.character.name}'s ${label} retaliates for ${retaliationDamage} damage`, {
        sourceId: target.character.id,
        targetId: source.character.id,
        kind: 'damage',
        damageType,
        amount: retaliationDamage,
        retaliate: true,
      });
    }
  });
}

function applyDamageReflections(source, target, damage, damageType, now, log) {
  if (!target) {
    return { damageTaken: damage, reflected: 0 };
  }
  if (!Array.isArray(target.damageReflections) || target.damageReflections.length === 0) {
    return { damageTaken: damage, reflected: 0 };
  }
  const normalizedType = normalizeDamageChannel(damageType);
  const currentTime = Number.isFinite(now) ? now : null;
  const remaining = [];
  let totalPercent = 0;
  let negatePortion = false;
  target.damageReflections.forEach(entry => {
    if (!entry) return;
    const expiresAt = Number.isFinite(entry.expiresAt) ? entry.expiresAt : null;
    if (expiresAt != null && currentTime != null && currentTime >= expiresAt) {
      return;
    }
    const entryType = normalizeDamageChannel(entry.damageType);
    if (!matchesDamageChannel(entryType, normalizedType)) {
      remaining.push(entry);
      return;
    }
    const percent = Number(entry.percent != null ? entry.percent : entry.amount);
    if (Number.isFinite(percent) && percent > 0) {
      totalPercent += percent;
    }
    if (entry.negateDamage !== false) {
      negatePortion = true;
    }
    const uses = Number.isFinite(entry.remainingAttacks) ? entry.remainingAttacks : 1;
    const nextUses = uses - 1;
    if (nextUses > 0) {
      remaining.push({ ...entry, remainingAttacks: nextUses });
    }
  });
  target.damageReflections = remaining;
  if (!Number.isFinite(damage) || damage <= 0 || totalPercent <= 0) {
    return { damageTaken: Math.max(0, Math.round(damage || 0)), reflected: 0 };
  }
  const clampedPercent = Math.max(0, Math.min(0.95, totalPercent));
  const reflectAmount = Math.round(damage * clampedPercent);
  if (reflectAmount <= 0) {
    return { damageTaken: Math.max(0, Math.round(damage)), reflected: 0 };
  }
  let damageTaken = damage;
  if (negatePortion) {
    damageTaken = Math.max(0, damage - reflectAmount);
  }
  if (source) {
    const before = Number.isFinite(source.health) ? source.health : 0;
    const updated = Math.max(0, before - reflectAmount);
    source.health = updated;
  }
  if (target && target.character && source && source.character) {
    pushLog(log, `${target.character.name} retaliates for ${reflectAmount} damage`, {
      sourceId: target.character.id,
      targetId: source.character.id,
      kind: 'damage',
      damageType,
      amount: reflectAmount,
      retaliate: true,
    });
  }
  return { damageTaken: Math.max(0, Math.round(damageTaken)), reflected: reflectAmount };
}

function clampPercent(value, max = 0.95) {
  if (!Number.isFinite(value)) return 0;
  const clamped = Math.max(0, Math.min(max, value));
  return clamped;
}

function applyDamageGuards(target, beforeHealth, maxHealth, damage, now, log) {
  if (!target) {
    return { damageTaken: Math.max(0, Math.round(damage || 0)), prevented: 0 };
  }
  if (!Array.isArray(target.damageGuards) || target.damageGuards.length === 0) {
    return { damageTaken: Math.max(0, Math.round(damage || 0)), prevented: 0 };
  }
  const currentTime = Number.isFinite(now) ? now : null;
  const remaining = [];
  let thresholdPercent = 0;
  target.damageGuards.forEach(entry => {
    if (!entry) return;
    const expiresAt = Number.isFinite(entry.expiresAt) ? entry.expiresAt : null;
    if (expiresAt != null && currentTime != null && currentTime >= expiresAt) {
      return;
    }
    const percent = Number(entry.percent != null ? entry.percent : entry.value);
    thresholdPercent = Math.max(thresholdPercent, clampPercent(percent));
    const uses = Number.isFinite(entry.remainingAttacks) ? entry.remainingAttacks : 1;
    const nextUses = uses - 1;
    if (nextUses > 0) {
      remaining.push({ ...entry, remainingAttacks: nextUses });
    }
  });
  target.damageGuards = remaining;
  const normalizedDamage = Math.max(0, Math.round(damage || 0));
  if (thresholdPercent <= 0 || normalizedDamage <= 0) {
    return { damageTaken: normalizedDamage, prevented: 0 };
  }
  if (!Number.isFinite(beforeHealth) || !Number.isFinite(maxHealth) || maxHealth <= 0) {
    return { damageTaken: normalizedDamage, prevented: 0 };
  }
  const minHealthAllowed = maxHealth * thresholdPercent;
  if (beforeHealth <= minHealthAllowed) {
    return { damageTaken: normalizedDamage, prevented: 0 };
  }
  const projectedHealth = beforeHealth - normalizedDamage;
  if (projectedHealth >= minHealthAllowed) {
    return { damageTaken: normalizedDamage, prevented: 0 };
  }
  const finalHealth = Math.max(minHealthAllowed, projectedHealth);
  const adjustedDamage = Math.max(0, Math.round(beforeHealth - finalHealth));
  const prevented = normalizedDamage - adjustedDamage;
  if (prevented > 0 && target.character) {
    pushLog(log, `${target.character.name} endures, preventing ${prevented} damage`, {
      sourceId: target.character.id,
      targetId: target.character.id,
      kind: 'buff',
      amount: prevented,
    });
  }
  return { damageTaken: adjustedDamage, prevented };
}

function applyDamageHealEffects(target, damageTaken, now, log) {
  if (!target) {
    return { healed: 0 };
  }
  if (!Array.isArray(target.damageHealShields) || target.damageHealShields.length === 0) {
    return { healed: 0 };
  }
  const currentTime = Number.isFinite(now) ? now : null;
  const remaining = [];
  let totalPercent = 0;
  target.damageHealShields.forEach(entry => {
    if (!entry) return;
    const expiresAt = Number.isFinite(entry.expiresAt) ? entry.expiresAt : null;
    if (expiresAt != null && currentTime != null && currentTime >= expiresAt) {
      return;
    }
    const percent = Number(entry.percent != null ? entry.percent : entry.value);
    if (Number.isFinite(percent) && percent > 0) {
      totalPercent += percent;
    }
    const uses = Number.isFinite(entry.remainingAttacks) ? entry.remainingAttacks : 1;
    const nextUses = uses - 1;
    if (nextUses > 0) {
      remaining.push({ ...entry, remainingAttacks: nextUses });
    }
  });
  target.damageHealShields = remaining;
  if (!Number.isFinite(damageTaken) || damageTaken <= 0 || totalPercent <= 0) {
    return { healed: 0 };
  }
  const clampedPercent = Math.max(0, Math.min(0.95, totalPercent));
  const healAmount = Math.round(damageTaken * clampedPercent);
  if (healAmount <= 0) {
    return { healed: 0 };
  }
  const before = Number.isFinite(target.health) ? target.health : 0;
  const maxHealth =
    target.derived && Number.isFinite(target.derived.health) ? target.derived.health : before;
  const updated = Math.min(maxHealth, before + healAmount);
  const healed = Math.max(0, Math.round(updated - before));
  target.health = updated;
  if (healed > 0 && target.character) {
    pushLog(log, `${target.character.name} is blessed, recovering ${healed} health`, {
      sourceId: target.character.id,
      targetId: target.character.id,
      kind: 'heal',
      amount: healed,
    });
  }
  return { healed };
}

function isChanceStat(stat) {
  return CHANCE_STATS.includes(stat);
}

function resolveStatValue(source, stat) {
  if (!source || !stat) return 0;
  const normalized = String(stat).trim().toLowerCase();
  if (!normalized) return 0;
  const attributes = source.derived && source.derived.attributes ? source.derived.attributes : null;
  if (!attributes) return 0;
  const value = attributes[normalized];
  return Number.isFinite(value) ? value : 0;
}

function resolveScalingBonus(source, scaling) {
  if (!scaling || typeof scaling !== 'object') return 0;
  let total = 0;
  Object.entries(scaling).forEach(([stat, multiplier]) => {
    const coeff = Number(multiplier);
    if (!Number.isFinite(coeff) || coeff === 0) return;
    const statValue = resolveStatValue(source, stat);
    total += statValue * coeff;
  });
  return total;
}

function computeScaledValue(baseValue, source, scaling) {
  const base = Number.isFinite(baseValue) ? baseValue : 0;
  const bonus = resolveScalingBonus(source, scaling);
  return base + bonus;
}

function resolveEffectTarget(effect, source, target) {
  if (!effect || typeof effect !== 'object') return target;
  const hint = typeof effect.target === 'string' ? effect.target.trim().toLowerCase() : null;
  if (hint === 'self' || hint === 'ally' || hint === 'source') {
    return source;
  }
  if (hint === 'enemy' || hint === 'target') {
    return target;
  }
  return target;
}

function formatChanceStat(stat) {
  switch (stat) {
    case 'critChance':
      return 'critical chance';
    case 'blockChance':
      return 'block chance';
    case 'dodgeChance':
      return 'dodge chance';
    case 'hitChance':
      return 'hit chance';
    default:
      return 'chance';
  }
}

function formatChanceAmount(amount) {
  if (!Number.isFinite(amount)) return '0';
  const abs = Math.abs(amount);
  return Number.isInteger(abs) ? String(abs) : abs.toFixed(1);
}

function normalizeActionType(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'ability' || normalized === 'basic' || normalized === 'any') {
    return normalized;
  }
  return null;
}

function ensurePendingDamageBonuses(entity) {
  if (!entity) return [];
  if (!Array.isArray(entity.pendingDamageBonuses)) {
    entity.pendingDamageBonuses = [];
  }
  return entity.pendingDamageBonuses;
}

function cloneEffectDescriptor(effect) {
  if (!effect || typeof effect !== 'object') return null;
  return JSON.parse(JSON.stringify(effect));
}

function processConsumedBonusEffects(source, target, details, baseOutcome, effectContext, now, log) {
  if (!source || !Array.isArray(details) || details.length === 0) {
    return { stunApplied: false };
  }
  let stunApplied = false;
  details.forEach(detail => {
    if (!detail) return;
    const bonusEffects = Array.isArray(detail.bonusEffects) ? detail.bonusEffects : [];
    if (!bonusEffects.length) return;
    if (detail.triggerLabel && source.character) {
      const targetId = target && target.character ? target.character.id : null;
      pushLog(
        log,
        `${source.character.name}'s ${detail.triggerLabel}`,
        {
          sourceId: source.character.id,
          targetId,
          kind: 'ability',
          abilityId: detail.sourceAbility ? detail.sourceAbility.id : undefined,
        },
      );
    }
    let lastResolution =
      (baseOutcome && baseOutcome.resolution ? { ...baseOutcome.resolution } : null) ||
      (effectContext && effectContext.resolution ? { ...effectContext.resolution } : null);
    let lastResult = baseOutcome || (effectContext && effectContext.lastResult ? effectContext.lastResult : null);
    bonusEffects.forEach((bonusEffect, idx) => {
      if (!bonusEffect || typeof bonusEffect !== 'object') return;
      const descriptor = cloneEffectDescriptor(bonusEffect);
      if (!descriptor || !descriptor.type) return;
      const bonusContext = {
        ...effectContext,
        resolution: lastResolution,
        lastResult,
        consumeDamageBonus: false,
        effectIndex: idx,
        ability: detail.sourceAbility || (effectContext && effectContext.ability) || null,
      };
      const result = applyEffect(source, target, descriptor, now, log, bonusContext);
      if (result && result.resolution) {
        lastResolution = result.resolution;
      }
      if (result) {
        lastResult = result;
      }
      if (descriptor.type === 'Stun' && result && result.hit) {
        stunApplied = true;
      }
    });
  });
  return { stunApplied };
}

function prunePendingDamageBonuses(entity, now) {
  if (!entity) return [];
  const list = ensurePendingDamageBonuses(entity);
  const currentTime = Number.isFinite(now) ? now : null;
  const filtered = list.filter(entry => {
    if (!entry) return false;
    const expiresAt = Number.isFinite(entry.expiresAt) ? entry.expiresAt : null;
    if (expiresAt != null && currentTime != null && currentTime >= expiresAt) {
      return false;
    }
    const uses = Number.isFinite(entry.remainingUses) ? entry.remainingUses : 1;
    return uses > 0;
  });
  entity.pendingDamageBonuses = filtered;
  return filtered;
}

function consumePendingDamageBonus(source, context = {}, now, damageType) {
  if (!source) {
    return { amount: 0, consumed: false };
  }
  prunePendingDamageBonuses(source, now);
  const shouldConsume = context && context.consumeDamageBonus !== false;
  if (!shouldConsume) {
    return { amount: 0, consumed: false };
  }
  const actionType = normalizeActionType(context.actionType);
  const list = ensurePendingDamageBonuses(source);
  if (!list.length) {
    return { amount: 0, consumed: false };
  }
  const remaining = [];
  let total = 0;
  let consumed = false;
  const details = [];
  list.forEach(entry => {
    if (!entry) return;
    const appliesTo = normalizeActionType(entry.appliesTo) || 'ability';
    if (
      actionType &&
      appliesTo &&
      appliesTo !== 'any' &&
      actionType !== appliesTo
    ) {
      remaining.push(entry);
      return;
    }
    if (entry.damageType && damageType && entry.damageType !== damageType) {
      remaining.push(entry);
      return;
    }
    const uses = Number.isFinite(entry.remainingUses) ? entry.remainingUses : 1;
    if (uses <= 0) {
      return;
    }
    const bonusValue = Number(entry.amount);
    let entryTriggered = false;
    if (Number.isFinite(bonusValue) && bonusValue !== 0) {
      total += bonusValue;
      if (bonusValue > 0) {
        consumed = true;
      }
      entryTriggered = true;
    }
    const nextUses = uses - 1;
    if (nextUses > 0) {
      remaining.push({ ...entry, remainingUses: nextUses });
    }
    if (entryTriggered || (Array.isArray(entry.bonusEffects) && entry.bonusEffects.length)) {
      const bonusEffects = Array.isArray(entry.bonusEffects)
        ? entry.bonusEffects
            .map(cloneEffectDescriptor)
            .filter(descriptor => descriptor && descriptor.type)
        : [];
      details.push({
        bonusEffects,
        triggerLabel: entry.triggerLabel,
        sourceAbility: entry.sourceAbility ? { ...entry.sourceAbility } : null,
      });
    }
  });
  source.pendingDamageBonuses = remaining;
  return { amount: total, consumed, details };
}

function resolveDurationSeconds(effect, context = {}) {
  if (!effect || typeof effect !== 'object') return 0;
  if (typeof effect.durationSeconds === 'number') {
    return Math.max(0, effect.durationSeconds);
  }
  if (typeof effect.duration === 'number') {
    return Math.max(0, effect.duration);
  }
  const resolveCount = defaultCount => {
    const minValue = Number.isFinite(effect.durationCountMin) ? effect.durationCountMin : null;
    const maxValue = Number.isFinite(effect.durationCountMax) ? effect.durationCountMax : null;
    if (minValue == null && maxValue == null) {
      return defaultCount;
    }
    let low = minValue != null ? minValue : maxValue;
    let high = maxValue != null ? maxValue : minValue;
    if (low == null && high == null) {
      return defaultCount;
    }
    if (low == null) {
      low = high;
    }
    if (high == null) {
      high = low;
    }
    if (high < low) {
      const tmp = high;
      high = low;
      low = tmp;
    }
    if (Number.isInteger(low) && Number.isInteger(high)) {
      return randBetween(low, high);
    }
    const span = high - low;
    if (!Number.isFinite(span) || span <= 0) {
      return low;
    }
    return low + Math.random() * span;
  };
  if (effect.durationType === 'enemyAttackIntervals') {
    const baseCount = typeof effect.durationCount === 'number' ? effect.durationCount : 1;
    const count = resolveCount(baseCount);
    const enemy = context.enemy;
    const interval =
      enemy && enemy.derived && typeof enemy.derived.attackIntervalSeconds === 'number'
        ? enemy.derived.attackIntervalSeconds
        : 0;
    return Math.max(0, interval * count);
  }
  if (effect.durationType === 'userAttackIntervals' || effect.durationType === 'selfAttackIntervals') {
    const baseCount = typeof effect.durationCount === 'number' ? effect.durationCount : 1;
    const count = resolveCount(baseCount);
    const actor = context.source || context.actor || context.user;
    const interval =
      actor && actor.derived && typeof actor.derived.attackIntervalSeconds === 'number'
        ? actor.derived.attackIntervalSeconds
        : 0;
    return Math.max(0, interval * count);
  }
  return 0;
}

function resolveAttackInterval(entity) {
  if (!entity || !entity.derived) return null;
  const value = entity.derived.attackIntervalSeconds;
  return Number.isFinite(value) && value > 0 ? value : null;
}

function resolveStunAttackCount(effect, source, target, context = {}) {
  if (!effect || typeof effect !== 'object') return 0;

  if (Number.isFinite(effect.attacks)) {
    return Math.max(0, effect.attacks);
  }

  if (Number.isFinite(effect.attackCount)) {
    return Math.max(0, effect.attackCount);
  }

  if (Number.isFinite(effect.durationCount) && effect.durationType) {
    return Math.max(0, effect.durationCount);
  }

  const seconds = Number.isFinite(effect.durationSeconds)
    ? effect.durationSeconds
    : Number.isFinite(effect.duration)
    ? effect.duration
    : 0;

  if (seconds <= 0) return 0;

  const targetInterval = resolveAttackInterval(target);
  const sourceInterval = resolveAttackInterval(source);
  const contextEnemyInterval = resolveAttackInterval(context.enemy);

  let interval = null;
  if (effect.durationType === 'userAttackIntervals' || effect.durationType === 'selfAttackIntervals') {
    interval = sourceInterval;
  } else if (effect.durationType === 'enemyAttackIntervals') {
    interval = targetInterval || contextEnemyInterval;
  } else {
    interval = targetInterval || contextEnemyInterval || sourceInterval;
  }

  if (interval && interval > 0) {
    return Math.max(0, seconds / interval);
  }

  if (seconds > 0) {
    return 1;
  }

  return 0;
}

function formatAttackCount(count, label = 'attack') {
  if (!Number.isFinite(count) || count <= 0) return '';
  const rounded = Math.round(count * 10) / 10;
  const normalized = Math.abs(rounded - Math.round(rounded)) < 1e-6 ? Math.round(rounded) : rounded;
  const pluralLabel = label.endsWith('s') ? label : `${label}s`;
  if (normalized === 1) {
    return `1 ${label}`;
  }
  return `${normalized} ${pluralLabel}`;
}

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
  if (effectType === 'Ignite') return 'magical';
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

  const effectDetails = context && context.effect ? context.effect : null;
  const normalizedDamageType = resolvedType === 'magical' ? 'magical' : 'physical';
  let resistIgnored = false;
  if (crit && effectDetails && effectDetails.ignoreResistOnCrit) {
    const flag = effectDetails.ignoreResistOnCrit;
    if (flag === true) {
      resistIgnored = normalizedDamageType === 'physical';
    } else if (typeof flag === 'string') {
      const lowered = flag.toLowerCase();
      resistIgnored = lowered === 'any' || lowered === normalizedDamageType;
    } else if (Array.isArray(flag)) {
      const loweredList = flag
        .filter(value => typeof value === 'string')
        .map(value => value.toLowerCase());
      resistIgnored = loweredList.includes('any') || loweredList.includes(normalizedDamageType);
    }
  }

  let resist =
    resolvedType === 'physical' ? target.derived.meleeResist : target.derived.magicResist;
  if (!Number.isFinite(resist)) {
    resist = 0;
  }
  const currentTime = Number.isFinite(context.now) ? context.now : null;
  const resistBonusInfo = consumeResistBonuses(target, resolvedType, currentTime);
  const resistBonus =
    resistBonusInfo && Number.isFinite(resistBonusInfo.total) ? resistBonusInfo.total : resistBonusInfo;
  if (Number.isFinite(resistBonus) && resistBonus > 0) {
    resist += resistBonus;
  }
  resist = Math.max(0, Math.min(MAX_TEMP_RESIST, resist));
  if (resistIgnored) {
    resist = 0;
  }
  const baseDamage = Math.max(1, Math.round(dmg * (1 - resist)));
  const beforeHealth = Number.isFinite(target.health) ? target.health : 0;
  const maxHealth =
    target.derived && Number.isFinite(target.derived.health) ? target.derived.health : beforeHealth;
  let damageToApply = baseDamage;
  const reflectionResult = applyDamageReflections(source, target, damageToApply, resolvedType, currentTime, log);
  damageToApply = reflectionResult.damageTaken;
  const guardResult = applyDamageGuards(target, beforeHealth, maxHealth, damageToApply, currentTime, log);
  damageToApply = guardResult.damageTaken;
  const appliedDamage = Math.max(0, Math.min(beforeHealth, Math.round(damageToApply)));
  const updatedHealth = Math.max(0, beforeHealth - appliedDamage);
  target.health = updatedHealth;
  const actualDamage = beforeHealth - updatedHealth;
  const healResult = applyDamageHealEffects(target, actualDamage, currentTime, log);
  const healedAmount = healResult.healed || 0;

  const consumedResistEntries = resistBonusInfo && Array.isArray(resistBonusInfo.entries)
    ? resistBonusInfo.entries
    : [];
  if (consumedResistEntries.length) {
    applyResistRetaliations(source, target, resolvedType, dmg, consumedResistEntries, currentTime, log);
  }

  let message;
  if (crit && blocked) {
    message = `${source.character.name} critically hits ${target.character.name} for ${actualDamage} ${resolvedType} (blocked)`;
  } else if (crit) {
    message = `${source.character.name} critically hits ${target.character.name} for ${actualDamage} ${resolvedType}`;
  } else if (blocked) {
    message = `${source.character.name} hits ${target.character.name} for ${actualDamage} ${resolvedType} (blocked)`;
  } else {
    message = `${source.character.name} hits ${target.character.name} for ${actualDamage} ${resolvedType}`;
  }
  if (resistIgnored) {
    message += ' (resistance ignored)';
  }

  const bonusDamageApplied = Number.isFinite(context.bonusDamageApplied)
    ? context.bonusDamageApplied
    : 0;
  pushLog(log, message, {
    sourceId: source.character.id,
    targetId: target.character.id,
    kind: 'damage',
    damageType: resolvedType,
    amount: actualDamage,
    crit,
    blocked,
    resistIgnored,
    bonusDamageApplied: bonusDamageApplied > 0 ? bonusDamageApplied : undefined,
  });

  const resultResolution = { ...resolution, damageType: resolvedType, crit, blocked, resistIgnored };
  const outcome = {
    hit: true,
    amount: actualDamage,
    crit,
    blocked,
    damageType: resolvedType,
    resolution: resultResolution,
  };
  if (bonusDamageApplied > 0) {
    outcome.bonusDamageApplied = bonusDamageApplied;
    if (!outcome.bonusDamageAmount) {
      outcome.bonusDamageAmount = bonusDamageApplied;
    }
  }
  if (reflectionResult.reflected > 0) {
    outcome.reflectedDamage = reflectionResult.reflected;
  }
  if (guardResult.prevented > 0) {
    outcome.preventedDamage = guardResult.prevented;
  }
  if (healedAmount > 0) {
    outcome.healedAmount = healedAmount;
  }
  outcome.resistIgnored = resistIgnored;
  return outcome;
}

function applyEffect(source, target, effect, now, log, context = {}) {
  switch (effect.type) {
    case 'PhysicalDamage': {
      const baseBonus = typeof effect.value === 'number' ? effect.value : 0;
      const scaledBonus = computeScaledValue(baseBonus, source, effect.scaling || effect.valueScaling);
      let base = scaledBonus + randBetween(source.derived.minMeleeAttack, source.derived.maxMeleeAttack);
      const bonusResult = consumePendingDamageBonus(source, context, now, 'physical');
      const bonusDamage = bonusResult.amount;
      const bonusDetails = bonusResult.details || [];
      if (bonusDamage > 0) {
        base += bonusDamage;
        pushLog(log, `${source.character.name} unleashes stored power for ${Math.round(bonusDamage)} bonus damage`, {
          sourceId: source.character.id,
          targetId: target.character.id,
          kind: 'buff',
          amount: Math.round(bonusDamage),
        });
      }
      const damageContext = { ...context, effect, bonusDamageApplied: bonusDamage, now };
      const outcome = applyDamage(source, target, base, 'physical', log, damageContext);
      if (outcome && bonusResult.consumed && bonusDamage > 0) {
        outcome.bonusDamageConsumed = true;
        outcome.bonusDamageAmount = bonusDamage;
      }
      if (outcome && bonusDetails.length) {
        const bonusOutcome = processConsumedBonusEffects(source, target, bonusDetails, outcome, context, now, log);
        if (bonusOutcome && bonusOutcome.stunApplied) {
          outcome.additionalStun = true;
        }
      }
      return outcome;
    }
    case 'MagicDamage': {
      const baseBonus = typeof effect.value === 'number' ? effect.value : 0;
      const scaledBonus = computeScaledValue(baseBonus, source, effect.scaling || effect.valueScaling);
      let base = scaledBonus + randBetween(source.derived.minMagicAttack, source.derived.maxMagicAttack);
      const bonusResult = consumePendingDamageBonus(source, context, now, 'magical');
      const bonusDamage = bonusResult.amount;
      const bonusDetails = bonusResult.details || [];
      if (bonusDamage > 0) {
        base += bonusDamage;
        pushLog(log, `${source.character.name} unleashes stored power for ${Math.round(bonusDamage)} bonus damage`, {
          sourceId: source.character.id,
          targetId: target.character.id,
          kind: 'buff',
          amount: Math.round(bonusDamage),
        });
      }
      const damageContext = { ...context, effect, bonusDamageApplied: bonusDamage, now };
      const outcome = applyDamage(source, target, base, 'magical', log, damageContext);
      if (outcome && bonusResult.consumed && bonusDamage > 0) {
        outcome.bonusDamageConsumed = true;
        outcome.bonusDamageAmount = bonusDamage;
      }
      if (outcome && bonusDetails.length) {
        const bonusOutcome = processConsumedBonusEffects(source, target, bonusDetails, outcome, context, now, log);
        if (bonusOutcome && bonusOutcome.stunApplied) {
          outcome.additionalStun = true;
        }
      }
      return outcome;
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
    case 'RestoreResource': {
      const resolvedTarget = resolveEffectTarget(effect, source, target);
      const recipient = resolvedTarget || source;
      if (!recipient) return null;
      const resource = typeof effect.resource === 'string' ? effect.resource.toLowerCase() : null;
      const amount = computeScaledValue(effect.value, source, effect.scaling || effect.valueScaling);
      if (!resource || !Number.isFinite(amount) || amount <= 0) {
        return null;
      }
      const derivedMax =
        recipient.derived && Number.isFinite(recipient.derived[resource]) ? recipient.derived[resource] : null;
      const before = Number.isFinite(recipient[resource]) ? recipient[resource] : 0;
      const max = derivedMax != null && derivedMax > 0 ? derivedMax : before + amount;
      const updated = Math.min(before + amount, max);
      recipient[resource] = updated;
      const restored = updated - before;
      if (restored > 0 && recipient.character) {
        const logged = Math.round(restored);
        if (logged > 0) {
          const label = resource.charAt(0).toUpperCase() + resource.slice(1);
          pushLog(log, `${recipient.character.name} restores ${logged} ${label}`, {
            sourceId: recipient.character.id,
            targetId: recipient.character.id,
            kind: 'resource',
            resource,
            amount: logged,
          });
        }
      }
      return null;
    }
    case 'ResourceOverTime': {
      const resolvedTarget = resolveEffectTarget(effect, source, target);
      const recipient = resolvedTarget || source;
      if (!recipient) return null;
      const resource = typeof effect.resource === 'string' ? effect.resource.toLowerCase() : null;
      const scaledAmount = computeScaledValue(effect.value, source, effect.scaling || effect.valueScaling);
      if (!resource || !Number.isFinite(scaledAmount) || scaledAmount <= 0) {
        return null;
      }
      const amountPerTick = Math.max(0, Math.round(scaledAmount));
      if (amountPerTick <= 0) {
        return null;
      }
      const interval = Number.isFinite(effect.interval) && effect.interval > 0 ? effect.interval : 1;
      const rawDuration = Number.isFinite(effect.duration) && effect.duration >= 0 ? effect.duration : null;
      const explicitTicks =
        Number.isFinite(effect.ticks) && effect.ticks > 0 ? Math.floor(effect.ticks) : null;
      let totalDuration = rawDuration;
      if (totalDuration == null && explicitTicks != null) {
        totalDuration = interval * explicitTicks;
      }
      let ticksRemaining = explicitTicks;
      if (ticksRemaining == null && totalDuration != null && interval > 0) {
        ticksRemaining = Math.max(1, Math.round(totalDuration / interval));
      }
      const expires = totalDuration != null ? now + totalDuration : Infinity;
      if (!Array.isArray(recipient.resourceOverTime)) {
        recipient.resourceOverTime = [];
      }
      recipient.resourceOverTime.push({
        resource,
        amountPerTick,
        interval,
        nextTick: now + interval,
        expires,
        ticksRemaining,
        sourceId: source && source.character ? source.character.id : null,
      });
      if (recipient.character) {
        const label = resource.charAt(0).toUpperCase() + resource.slice(1);
        const durationSeconds = totalDuration != null ? totalDuration : null;
        pushLog(log, `${recipient.character.name} begins regenerating ${label.toLowerCase()}`, {
          sourceId: recipient.character.id,
          targetId: recipient.character.id,
          kind: 'buff',
          resource,
          amount: amountPerTick,
          duration: durationSeconds,
        });
      }
      return null;
    }
    case 'ResistShield': {
      const recipient = resolveEffectTarget(effect, source, target) || source;
      if (!recipient) return null;
      const baseAmount =
        effect.amount != null ? Number(effect.amount) : effect.value != null ? Number(effect.value) : 0;
      const scaledAmount = computeScaledValue(
        baseAmount,
        source,
        effect.scaling || effect.amountScaling || effect.valueScaling,
      );
      const normalizedAmount = Math.max(0, Math.min(MAX_TEMP_RESIST, scaledAmount));
      if (normalizedAmount <= 0) {
        return null;
      }
      let attackCount = null;
      if (Number.isFinite(effect.attackCount)) {
        attackCount = effect.attackCount;
      } else if (Number.isFinite(effect.attacks)) {
        attackCount = effect.attacks;
      }
      const uses = Math.max(1, Math.round(Number.isFinite(attackCount) && attackCount > 0 ? attackCount : 1));
      const durationSeconds = resolveDurationSeconds(effect, {
        ...context,
        source: recipient,
        actor: recipient,
        user: recipient,
      });
      const expiresAt = Number.isFinite(durationSeconds) && durationSeconds > 0 ? now + durationSeconds : null;
      const damageType = normalizeDamageChannel(effect.damageType);
      if (!Array.isArray(recipient.resistShields)) {
        recipient.resistShields = [];
      }
      const shieldEntry = {
        amount: normalizedAmount,
        damageType,
        remainingAttacks: uses,
        expiresAt,
      };
      if (effect.reflectNegatedDamage) {
        shieldEntry.retaliate = true;
        shieldEntry.retaliateDamageType = normalizeDamageChannel(effect.retaliateDamageType || 'physical');
        shieldEntry.retaliateLogLabel = effect.retaliateLogLabel || 'shield';
      }
      recipient.resistShields.push(shieldEntry);
      if (recipient.character) {
        const typeLabel =
          damageType === 'magical'
            ? 'magical'
            : damageType === 'physical'
            ? 'physical'
            : 'all';
        const attackText = formatAttackCount(uses) || 'attacks';
        let message = `${recipient.character.name} gains +${Math.round(normalizedAmount * 100)}% ${typeLabel} resistance for ${attackText}`;
        if (shieldEntry.retaliate) {
          const retaliateTypeLabel =
            shieldEntry.retaliateDamageType === 'magical'
              ? 'magical attackers'
              : shieldEntry.retaliateDamageType === 'physical'
              ? 'physical attackers'
              : 'attackers';
          message += ` and retaliates against ${retaliateTypeLabel}`;
        }
        pushLog(log, message, {
          sourceId: recipient.character.id,
          targetId: recipient.character.id,
          kind: 'buff',
        });
      }
      return null;
    }
    case 'AttackIntervalDebuff': {
      const resolvedTarget = resolveEffectTarget(effect, source, target) || target;
      if (!resolvedTarget) {
        return null;
      }
      const priorResult = context && context.lastResult;
      if (priorResult && priorResult.hit === false) {
        const failedResolution = priorResult.resolution || context.resolution || { hit: false };
        return { hit: false, amount: 0, damageType: failedResolution.damageType, resolution: failedResolution };
      }
      const baseAmount =
        effect.amount != null ? Number(effect.amount) : effect.value != null ? Number(effect.value) : 0;
      const scaledAmount = computeScaledValue(
        baseAmount,
        source,
        effect.scaling || effect.amountScaling || effect.valueScaling,
      );
      const normalizedAmount = Number.isFinite(scaledAmount) ? Math.max(0, scaledAmount) : 0;
      if (normalizedAmount <= 0) {
        const passthroughResolution =
          (priorResult && priorResult.resolution) || context.resolution || { hit: true };
        return { hit: true, amount: 0, resolution: passthroughResolution };
      }
      let attackUses = null;
      if (Number.isFinite(effect.attacks)) {
        attackUses = effect.attacks;
      } else if (Number.isFinite(effect.attackCount)) {
        attackUses = effect.attackCount;
      }
      const uses = Math.max(1, Math.round(Number.isFinite(attackUses) && attackUses > 0 ? attackUses : 1));
      const durationSeconds = resolveDurationSeconds(effect, {
        ...context,
        source: resolvedTarget,
        actor: resolvedTarget,
        enemy: source,
      });
      const expiresAt = Number.isFinite(durationSeconds) && durationSeconds > 0 ? now + durationSeconds : null;
      if (!Array.isArray(resolvedTarget.attackIntervalAdjustments)) {
        resolvedTarget.attackIntervalAdjustments = [];
      }
      resolvedTarget.attackIntervalAdjustments.push({
        amount: normalizedAmount,
        remainingAttacks: uses,
        expiresAt,
      });
      if (resolvedTarget.character) {
        const attackText = formatAttackCount(uses, 'enemy attack') || 'enemy attacks';
        const amountText = Math.round(normalizedAmount * 100) / 100;
        pushLog(
          log,
          `${resolvedTarget.character.name}'s attacks slow by ${amountText}s for ${attackText}`,
          {
            sourceId: resolvedTarget.character.id,
            targetId: resolvedTarget.character.id,
            kind: 'debuff',
          },
        );
      }
      const appliedResolution =
        (priorResult && priorResult.resolution) || context.resolution || { hit: true, damageType: null };
      return { hit: true, amount: 0, resolution: appliedResolution };
    }
    case 'DamageFloor': {
      const recipient = resolveEffectTarget(effect, source, target) || source;
      if (!recipient) return null;
      const basePercent =
        effect.percent != null ? Number(effect.percent) : effect.value != null ? Number(effect.value) : 0;
      const scaledPercent = computeScaledValue(
        basePercent,
        source,
        effect.scaling || effect.percentScaling || effect.valueScaling,
      );
      const percent = clampPercent(scaledPercent, 0.95);
      if (percent <= 0) {
        return null;
      }
      let attackCount = null;
      if (Number.isFinite(effect.attackCount)) {
        attackCount = effect.attackCount;
      } else if (Number.isFinite(effect.attacks)) {
        attackCount = effect.attacks;
      }
      const uses = Math.max(1, Math.round(Number.isFinite(attackCount) && attackCount > 0 ? attackCount : 1));
      const durationSeconds = resolveDurationSeconds(effect, {
        ...context,
        source: recipient,
        actor: recipient,
        user: recipient,
      });
      const expiresAt = Number.isFinite(durationSeconds) && durationSeconds > 0 ? now + durationSeconds : null;
      if (!Array.isArray(recipient.damageGuards)) {
        recipient.damageGuards = [];
      }
      recipient.damageGuards.push({
        percent,
        remainingAttacks: uses,
        expiresAt,
      });
      if (recipient.character) {
        const attackText = formatAttackCount(uses) || 'attacks';
        pushLog(log, `${recipient.character.name} braces to stay above ${Math.round(percent * 100)}% health for ${attackText}`, {
          sourceId: recipient.character.id,
          targetId: recipient.character.id,
          kind: 'buff',
        });
      }
      return null;
    }
    case 'DamageReflect': {
      const recipient = resolveEffectTarget(effect, source, target) || source;
      if (!recipient) return null;
      const basePercent =
        effect.percent != null ? Number(effect.percent) : effect.value != null ? Number(effect.value) : 0;
      const scaledPercent = computeScaledValue(
        basePercent,
        source,
        effect.scaling || effect.percentScaling || effect.valueScaling,
      );
      const percent = clampPercent(scaledPercent, 0.95);
      if (percent <= 0) {
        return null;
      }
      let attackCount = null;
      if (Number.isFinite(effect.attackCount)) {
        attackCount = effect.attackCount;
      } else if (Number.isFinite(effect.attacks)) {
        attackCount = effect.attacks;
      }
      const uses = Math.max(1, Math.round(Number.isFinite(attackCount) && attackCount > 0 ? attackCount : 1));
      const durationSeconds = resolveDurationSeconds(effect, {
        ...context,
        source: recipient,
        actor: recipient,
        user: recipient,
      });
      const expiresAt = Number.isFinite(durationSeconds) && durationSeconds > 0 ? now + durationSeconds : null;
      if (!Array.isArray(recipient.damageReflections)) {
        recipient.damageReflections = [];
      }
      recipient.damageReflections.push({
        percent,
        remainingAttacks: uses,
        damageType: normalizeDamageChannel(effect.damageType),
        negateDamage: effect.negateDamage !== false,
        expiresAt,
      });
      if (recipient.character) {
        const attackText = formatAttackCount(uses) || 'attacks';
        pushLog(log, `${recipient.character.name} prepares to retaliate ${Math.round(percent * 100)}% damage for ${attackText}`, {
          sourceId: recipient.character.id,
          targetId: recipient.character.id,
          kind: 'buff',
        });
      }
      return null;
    }
    case 'DamageHeal': {
      const recipient = resolveEffectTarget(effect, source, target) || source;
      if (!recipient) return null;
      const basePercent =
        effect.percent != null ? Number(effect.percent) : effect.value != null ? Number(effect.value) : 0;
      const scaledPercent = computeScaledValue(
        basePercent,
        source,
        effect.scaling || effect.percentScaling || effect.valueScaling,
      );
      const percent = clampPercent(scaledPercent, 0.95);
      if (percent <= 0) {
        return null;
      }
      let attackCount = null;
      if (Number.isFinite(effect.attackCount)) {
        attackCount = effect.attackCount;
      } else if (Number.isFinite(effect.attacks)) {
        attackCount = effect.attacks;
      }
      const uses = Math.max(1, Math.round(Number.isFinite(attackCount) && attackCount > 0 ? attackCount : 1));
      const durationSeconds = resolveDurationSeconds(effect, {
        ...context,
        source: recipient,
        actor: recipient,
        user: recipient,
      });
      const expiresAt = Number.isFinite(durationSeconds) && durationSeconds > 0 ? now + durationSeconds : null;
      if (!Array.isArray(recipient.damageHealShields)) {
        recipient.damageHealShields = [];
      }
      recipient.damageHealShields.push({
        percent,
        remainingAttacks: uses,
        expiresAt,
      });
      if (recipient.character) {
        const attackText = formatAttackCount(uses) || 'attacks';
        pushLog(log, `${recipient.character.name} is blessed to heal ${Math.round(percent * 100)}% of damage for ${attackText}`, {
          sourceId: recipient.character.id,
          targetId: recipient.character.id,
          kind: 'buff',
        });
      }
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
      const chance = Number(effect.chance);
      if (Number.isFinite(chance) && chance >= 0 && chance < 1) {
        if (Math.random() > chance) {
          return { hit: false, amount: 0, damageType: resolution.damageType, resolution };
        }
      }
      const stunContext = { ...context, enemy: context.enemy || target };
      const attackCount = resolveStunAttackCount(effect, source, target, stunContext);
      const normalizedCount = Number.isFinite(attackCount) ? Math.max(0, attackCount) : 0;
      const prior = Number.isFinite(target.stunnedAttacksRemaining) ? target.stunnedAttacksRemaining : 0;
      if (normalizedCount > 0) {
        target.stunnedAttacksRemaining = Math.max(prior, normalizedCount);
      }
      const labelBase =
        effect.durationType === 'enemyAttackIntervals'
          ? 'enemy attack'
          : effect.durationType === 'userAttackIntervals' || effect.durationType === 'selfAttackIntervals'
          ? 'own attack'
          : 'attack';
      const countText = formatAttackCount(normalizedCount, labelBase);
      const message =
        countText && normalizedCount > 0
          ? `${target.character.name} is stunned for ${countText}`
          : `${target.character.name} is stunned`;
      const logDetails = {
        sourceId: target.character.id,
        targetId: source.character.id,
        kind: 'stun',
      };
      if (normalizedCount > 0) {
        logDetails.attacks = normalizedCount;
      }
      pushLog(log, message, logDetails);
      const resultResolution = { ...resolution, damageType: resolution.damageType };
      return { hit: true, amount: 0, damageType: resultResolution.damageType, resolution: resultResolution };
    }
    case 'Poison': {
      const type = getDamageType(source, effect.type);
      const resolution = resolveAttack(source, target, type, log, context.resolution);
      if (!resolution.hit) {
        return { hit: false, amount: 0, damageType: resolution.damageType, resolution };
      }
      const chance = Number(effect.chance);
      if (Number.isFinite(chance) && chance >= 0 && chance < 1) {
        if (Math.random() > chance) {
          return { hit: true, amount: 0, damageType: resolution.damageType, resolution };
        }
      }
      const baseDamage = typeof effect.damage === 'number' ? effect.damage : 0;
      const scaledDamage = computeScaledValue(baseDamage, source, effect.damageScaling || effect.scaling);
      const damage = Math.max(0, scaledDamage);
      const interval = typeof effect.interval === 'number' && effect.interval > 0 ? effect.interval : 1;
      const duration = typeof effect.duration === 'number' && effect.duration >= 0 ? effect.duration : 0;
      target.dots.push({
        damage,
        interval,
        nextTick: now + interval,
        expires: now + duration,
        resistType: 'melee',
        damageType: 'poison',
        logLabel: 'poison damage',
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
    case 'Ignite': {
      const type = getDamageType(source, effect.type);
      const resolution = resolveAttack(source, target, type, log, context.resolution);
      if (!resolution.hit) {
        return { hit: false, amount: 0, damageType: resolution.damageType, resolution };
      }
      const chance = Number(effect.chance);
      if (Number.isFinite(chance) && chance >= 0 && chance < 1) {
        if (Math.random() > chance) {
          return { hit: true, amount: 0, damageType: resolution.damageType, resolution };
        }
      }
      const baseDamage = typeof effect.damage === 'number' ? effect.damage : 0;
      const scaledDamage = computeScaledValue(baseDamage, source, effect.damageScaling || effect.scaling);
      const damage = Math.max(0, scaledDamage);
      const interval = typeof effect.interval === 'number' && effect.interval > 0 ? effect.interval : 1;
      const duration = typeof effect.duration === 'number' && effect.duration >= 0 ? effect.duration : 0;
      target.dots.push({
        damage,
        interval,
        nextTick: now + interval,
        expires: now + duration,
        resistType: 'magic',
        damageType: 'fire',
        logLabel: 'fire damage',
      });
      pushLog(log, `${target.character.name} is ignited`, {
        sourceId: target.character.id,
        targetId: source.character.id,
        kind: 'ignite',
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
        appliedEffect: 'Ignite',
      };
    }
    case 'BuffChance': {
      const stat = typeof effect.stat === 'string' ? effect.stat : null;
      const baseAmount = typeof effect.amount === 'number' ? effect.amount : 0;
      const scaledAmount = computeScaledValue(
        baseAmount,
        source,
        effect.amountScaling || effect.scaling || effect.valueScaling,
      );
      if (!stat || !isChanceStat(stat) || !Number.isFinite(scaledAmount) || scaledAmount === 0) {
        return null;
      }
      if (!target.chanceBuffs) {
        target.chanceBuffs = [];
      }
      const current = Number.isFinite(target.derived && target.derived[stat])
        ? target.derived[stat]
        : 0;
      const newValue = current + scaledAmount;
      if (!target.derived) {
        target.derived = {};
      }
      target.derived[stat] = Number.isFinite(newValue) ? newValue : current;
      const durationSeconds = resolveDurationSeconds(effect, { ...context, source });
      let expires = Infinity;
      if (Number.isFinite(durationSeconds)) {
        if (durationSeconds > 0) {
          expires = now + durationSeconds;
        } else if (durationSeconds === 0) {
          expires = now;
        }
      }
      target.chanceBuffs.push({ stat, amount: scaledAmount, expires });
      const amountText = formatChanceAmount(scaledAmount);
      const sign = scaledAmount > 0 ? '+' : scaledAmount < 0 ? '-' : '';
      pushLog(log, `${target.character.name} gains ${sign}${amountText}% ${formatChanceStat(stat)}`, {
        sourceId: target.character.id,
        targetId: target.character.id,
        kind: 'buff',
        stat,
        amount: scaledAmount,
        duration: durationSeconds,
      });
      return null;
    }
    case 'NextAbilityDamage': {
      const recipient = resolveEffectTarget(effect, source, target) || source;
      if (!recipient) {
        return null;
      }
      prunePendingDamageBonuses(recipient, now);
      let amount = 0;
      if (
        effect.matchLastResult &&
        context &&
        context.lastResult &&
        context.lastResult.hit &&
        Number.isFinite(context.lastResult.amount) &&
        context.lastResult.amount > 0
      ) {
        amount = context.lastResult.amount;
      } else {
        const baseValue = typeof effect.value === 'number' ? effect.value : 0;
        amount = computeScaledValue(
          baseValue,
          source,
          effect.scaling || effect.valueScaling || effect.amountScaling,
        );
      }
      if (!Number.isFinite(amount) || amount <= 0) {
        return null;
      }
      const rounded = Math.round(amount);
      if (rounded <= 0) {
        return null;
      }
      const appliesTo = normalizeActionType(effect.appliesTo) || 'ability';
      const uses = Number.isFinite(effect.uses) && effect.uses > 0 ? Math.floor(effect.uses) : 1;
      const inheritDamageType =
        effect.matchLastDamageType !== false &&
        context &&
        context.lastResult &&
        context.lastResult.damageType;
      const resolvedDamageType = effect.damageType || inheritDamageType || null;
      const durationSeconds = resolveDurationSeconds(effect, {
        ...context,
        source: recipient,
        actor: recipient,
        user: recipient,
      });
      let expiresAt = null;
      if (Number.isFinite(durationSeconds) && durationSeconds > 0) {
        expiresAt = now + durationSeconds;
      }
      const bonusEffects = Array.isArray(effect.bonusEffects)
        ? effect.bonusEffects
            .map(cloneEffectDescriptor)
            .filter(descriptor => descriptor && descriptor.type)
        : [];
      const triggerLabel = typeof effect.triggerLabel === 'string' ? effect.triggerLabel : null;
      const sourceAbilityInfo =
        context && context.ability
          ? {
              id: context.ability.id,
              name: context.ability.name,
            }
          : null;
      const entry = {
        amount: rounded,
        appliesTo,
        damageType: resolvedDamageType,
        remainingUses: uses,
        expiresAt,
      };
      if (bonusEffects.length) {
        entry.bonusEffects = bonusEffects;
      }
      if (triggerLabel) {
        entry.triggerLabel = triggerLabel;
      }
      if (sourceAbilityInfo) {
        entry.sourceAbility = sourceAbilityInfo;
      }
      ensurePendingDamageBonuses(recipient).push(entry);
      const label = appliesTo === 'basic' ? 'basic attack' : 'ability';
      pushLog(log, `${recipient.character.name} stores ${rounded} bonus ${label} damage`, {
        sourceId: recipient.character.id,
        targetId: recipient.character.id,
        kind: 'buff',
        amount: rounded,
        appliesTo: label,
      });
      return {
        hit: false,
        amount: 0,
        bonusStored: rounded,
        resolution: context && context.resolution ? { ...context.resolution } : null,
      };
    }
    case 'HealOverTime': {
      const total = typeof effect.value === 'number' ? effect.value : 0;
      if (!target || !Number.isFinite(total) || total <= 0) {
        return null;
      }
      if (!Array.isArray(target.hots)) {
        target.hots = [];
      }
      const durationSeconds = resolveDurationSeconds(effect, { ...context, source });
      const explicitInterval =
        typeof effect.interval === 'number' && effect.interval > 0 ? effect.interval : null;
      const explicitTicks =
        typeof effect.ticks === 'number' && effect.ticks > 0
          ? Math.floor(effect.ticks)
          : typeof effect.durationCount === 'number' && effect.durationCount > 0
          ? Math.floor(effect.durationCount)
          : null;
      const ownerInterval =
        source && source.derived && typeof source.derived.attackIntervalSeconds === 'number'
          ? source.derived.attackIntervalSeconds
          : null;
      let interval = explicitInterval;
      let totalDuration = Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : null;
      if (!Number.isFinite(interval) || interval <= 0) {
        if (Number.isFinite(totalDuration) && explicitTicks) {
          interval = totalDuration / explicitTicks;
        } else if (explicitTicks && Number.isFinite(ownerInterval) && ownerInterval > 0) {
          interval = ownerInterval;
          totalDuration = ownerInterval * explicitTicks;
        } else if (Number.isFinite(totalDuration) && Number.isFinite(ownerInterval) && ownerInterval > 0) {
          const derivedTicks = Math.max(1, Math.round(totalDuration / ownerInterval));
          interval = totalDuration / derivedTicks;
        } else if (Number.isFinite(ownerInterval) && ownerInterval > 0) {
          interval = ownerInterval;
        } else {
          interval = 1;
        }
      }
      if (!Number.isFinite(totalDuration) && explicitTicks && Number.isFinite(interval) && interval > 0) {
        totalDuration = interval * explicitTicks;
      }
      if (!Number.isFinite(totalDuration) && Number.isFinite(interval) && interval > 0) {
        totalDuration = interval * Math.max(1, explicitTicks || 1);
      }
      const clampedInterval = interval > 0 ? interval : 1;
      const tickCount = Math.max(
        1,
        explicitTicks || (Number.isFinite(totalDuration) ? Math.round(totalDuration / clampedInterval) : 1),
      );
      const perTick = Number.isFinite(effect.tickValue) ? effect.tickValue : total / tickCount;
      const expires = Number.isFinite(totalDuration) ? now + totalDuration : Infinity;
      target.hots.push({
        amountPerTick: perTick,
        interval: clampedInterval,
        nextTick: now + clampedInterval,
        expires,
        remaining: total,
        ticksRemaining: tickCount,
        sourceId: source && source.character ? source.character.id : null,
      });
      pushLog(log, `${target.character.name} begins recovering health over time`, {
        sourceId: target.character.id,
        targetId: target.character.id,
        kind: 'buff',
        amount: perTick,
        duration: Number.isFinite(totalDuration) ? totalDuration : null,
      });
      return null;
    }
    case 'ResourceCostModifier': {
      const resource = typeof effect.resource === 'string' ? effect.resource.toLowerCase() : null;
      const amount = Number.isFinite(effect.amount) ? effect.amount : 0;
      if (!resource || amount === 0) {
        return null;
      }
      if (!target.resourceCostModifiers) {
        target.resourceCostModifiers = {};
      }
      if (!Array.isArray(target.resourceCostBuffs)) {
        target.resourceCostBuffs = [];
      }
      const current = Number.isFinite(target.resourceCostModifiers[resource])
        ? target.resourceCostModifiers[resource]
        : 0;
      const updated = Math.min(1, Math.max(0, current + amount));
      target.resourceCostModifiers[resource] = updated;
      const durationSeconds = resolveDurationSeconds(effect, { ...context, source });
      let expires = Infinity;
      if (Number.isFinite(durationSeconds)) {
        expires = durationSeconds > 0 ? now + durationSeconds : now;
      }
      target.resourceCostBuffs.push({ resource, amount, expires });
      const percent = Math.round(amount * 100);
      const label = resource.charAt(0).toUpperCase() + resource.slice(1);
      const message =
        amount >= 0
          ? `${target.character.name} reduces ${label.toLowerCase()} costs by ${Math.abs(percent)}%`
          : `${target.character.name}'s ${label.toLowerCase()} costs increase by ${Math.abs(percent)}%`;
      pushLog(log, message, {
        sourceId: target.character.id,
        targetId: target.character.id,
        kind: 'buff',
        resource,
        amount,
        duration: Number.isFinite(durationSeconds) ? durationSeconds : null,
      });
      return null;
    }
    case 'StealResource': {
      const resource = typeof effect.resource === 'string' ? effect.resource.toLowerCase() : null;
      const amount = Number.isFinite(effect.value) ? effect.value : 0;
      if (!resource || amount <= 0 || !target || !source) {
        return null;
      }
      const available = Number.isFinite(target[resource]) ? Math.max(0, target[resource]) : 0;
      if (available <= 0) {
        return null;
      }
      const stolen = Math.min(amount, available);
      target[resource] = available - stolen;
      const sourceMax =
        source.derived && Number.isFinite(source.derived[resource]) ? source.derived[resource] : null;
      const sourceBefore = Number.isFinite(source[resource]) ? source[resource] : 0;
      const sourceCap = sourceMax != null && sourceMax > 0 ? sourceMax : sourceBefore + stolen;
      const newSourceValue = Math.min(sourceBefore + stolen, sourceCap);
      source[resource] = newSourceValue;
      const gained = newSourceValue - sourceBefore;
      const label = resource.charAt(0).toUpperCase() + resource.slice(1);
      pushLog(log, `${source.character.name} steals ${stolen} ${label} from ${target.character.name}`, {
        sourceId: source.character.id,
        targetId: target.character.id,
        kind: 'resourceSteal',
        resource,
        amount: stolen,
      });
      if (gained < stolen) {
        const wasted = stolen - gained;
        if (wasted > 0) {
          pushLog(log, `${source.character.name} cannot hold ${wasted} additional ${label.toLowerCase()}`, {
            sourceId: source.character.id,
            targetId: source.character.id,
            kind: 'resourceOverflow',
            resource,
            amount: wasted,
          });
        }
      }
      return null;
    }
    case 'RemoveUseable': {
      if (!target || !Array.isArray(target.useables) || target.useables.length === 0) {
        return null;
      }
      const candidates = target.useables.filter(entry => entry && entry.item && !entry.used && !entry.disabled);
      if (candidates.length === 0) {
        return null;
      }
      const index = Math.floor(Math.random() * candidates.length);
      const entry = candidates[index];
      if (!entry || !entry.item) {
        return null;
      }
      entry.used = true;
      entry.disabled = true;
      if (target.usedUseableIds) {
        target.usedUseableIds.add(entry.item.id);
      }
      const alreadyConsumed = target.consumedUseables.some(used => used && used.itemId === entry.item.id);
      if (!alreadyConsumed) {
        target.consumedUseables.push({ slot: entry.slot, itemId: entry.item.id });
      }
      pushLog(log, `${target.character.name}'s ${entry.item.name} is stolen!`, {
        sourceId: source && source.character ? source.character.id : null,
        targetId: target.character.id,
        kind: 'useableRemoved',
        itemId: entry.item.id,
      });
      return null;
    }
    default:
      return null;
  }
}

function tick(combatant, now, log) {
  prunePendingDamageBonuses(combatant, now);
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
  if (!Array.isArray(combatant.chanceBuffs)) {
    combatant.chanceBuffs = [];
  }
  combatant.chanceBuffs = combatant.chanceBuffs.filter(buff => {
    if (!buff) return false;
    const expires = buff.expires;
    if (!Number.isFinite(expires) || now < expires) {
      return true;
    }
    if (buff.stat && Number.isFinite(buff.amount)) {
      const current = Number.isFinite(combatant.derived && combatant.derived[buff.stat])
        ? combatant.derived[buff.stat]
        : 0;
      const updated = current - buff.amount;
      if (!combatant.derived) {
        combatant.derived = {};
      }
      combatant.derived[buff.stat] = Number.isFinite(updated) ? Math.max(0, updated) : current;
    }
    const amountText = formatChanceAmount(buff.amount);
    pushLog(log, `${combatant.character.name}'s ${formatChanceStat(buff.stat)} bonus (${amountText}%) fades`, {
      sourceId: combatant.character.id,
      targetId: combatant.character.id,
      kind: 'buffEnd',
      stat: buff.stat,
      amount: buff.amount,
    });
    return false;
  });
  if (!combatant.resourceCostModifiers || typeof combatant.resourceCostModifiers !== 'object') {
    combatant.resourceCostModifiers = {};
  }
  if (!Array.isArray(combatant.resourceCostBuffs)) {
    combatant.resourceCostBuffs = [];
  }
  combatant.resourceCostBuffs = combatant.resourceCostBuffs.filter(buff => {
    if (!buff) return false;
    const expires = buff.expires;
    if (!Number.isFinite(expires) || now < expires) {
      return true;
    }
    const resource = typeof buff.resource === 'string' ? buff.resource : null;
    if (resource) {
      const current = Number.isFinite(combatant.resourceCostModifiers[resource])
        ? combatant.resourceCostModifiers[resource]
        : 0;
      const updated = Number.isFinite(current - buff.amount) ? current - buff.amount : current;
      combatant.resourceCostModifiers[resource] = Math.max(0, Math.min(1, updated));
      const label = resource.charAt(0).toUpperCase() + resource.slice(1);
      const percent = Math.round(Math.abs(buff.amount * 100));
      const message =
        buff.amount >= 0
          ? `${combatant.character.name}'s ${label.toLowerCase()} cost reduction fades (${percent}%)`
          : `${combatant.character.name}'s ${label.toLowerCase()} cost penalty ends (${percent}%)`;
      pushLog(log, message, {
        sourceId: combatant.character.id,
        targetId: combatant.character.id,
        kind: 'buffEnd',
        resource,
        amount: buff.amount,
      });
    }
    return false;
  });
  if (!Array.isArray(combatant.hots)) {
    combatant.hots = [];
  }
  combatant.hots = combatant.hots.filter(h => {
    if (!h) return false;
    const interval = Number.isFinite(h.interval) && h.interval > 0 ? h.interval : 1;
    const expires = Number.isFinite(h.expires) ? h.expires : Infinity;
    if (!Number.isFinite(h.nextTick)) {
      h.nextTick = now + interval;
    }
    let remainingTicks = Number.isFinite(h.ticksRemaining) ? h.ticksRemaining : null;
    let remainingAmount = Number.isFinite(h.remaining) ? h.remaining : null;
    while (now >= h.nextTick && now < expires) {
      const plannedAmount = Number.isFinite(h.amountPerTick) ? h.amountPerTick : 0;
      if (plannedAmount <= 0) {
        h.nextTick += interval;
      } else {
        const healAmount =
          remainingAmount != null && remainingAmount < plannedAmount ? remainingAmount : plannedAmount;
        const before = combatant.health;
        const maxHealth =
          combatant.derived && Number.isFinite(combatant.derived.health) ? combatant.derived.health : before;
        const cappedMax = maxHealth > 0 ? maxHealth : before;
        const updatedHealth = Math.min(before + healAmount, cappedMax);
        combatant.health = updatedHealth;
        const healed = updatedHealth - before;
        if (healed > 0) {
          pushLog(log, `${combatant.character.name} regenerates ${Math.round(healed)} health`, {
            sourceId: combatant.character.id,
            targetId: combatant.character.id,
            kind: 'heal',
            amount: healed,
          });
        }
        if (remainingAmount != null) {
          remainingAmount = Math.max(0, remainingAmount - healAmount);
        }
      }
      if (remainingTicks != null) {
        remainingTicks -= 1;
      }
      h.nextTick += interval;
      if (remainingTicks != null && remainingTicks <= 0) {
        break;
      }
      if (remainingAmount != null && remainingAmount <= 0) {
        break;
      }
    }
    h.ticksRemaining = remainingTicks;
    h.remaining = remainingAmount;
    const stillTicks = remainingTicks == null || remainingTicks > 0;
    const stillAmount = remainingAmount == null || remainingAmount > 0;
    const stillTime = now < expires;
    const keep = stillTicks && stillAmount && stillTime;
    if (!keep) {
      pushLog(log, `${combatant.character.name}'s healing over time fades`, {
        sourceId: combatant.character.id,
        targetId: combatant.character.id,
        kind: 'buffEnd',
      });
    }
    return keep;
  });
  if (!Array.isArray(combatant.resourceOverTime)) {
    combatant.resourceOverTime = [];
  }
  combatant.resourceOverTime = combatant.resourceOverTime.filter(rot => {
    if (!rot) return false;
    const resource = typeof rot.resource === 'string' ? rot.resource : null;
    if (!resource) return false;
    const interval = Number.isFinite(rot.interval) && rot.interval > 0 ? rot.interval : 1;
    const expires = Number.isFinite(rot.expires) ? rot.expires : Infinity;
    if (!Number.isFinite(rot.nextTick)) {
      rot.nextTick = now + interval;
    }
    let ticksRemaining = Number.isFinite(rot.ticksRemaining) ? rot.ticksRemaining : null;
    while (now >= rot.nextTick && now < expires) {
      const amount = Number.isFinite(rot.amountPerTick) ? rot.amountPerTick : 0;
      if (amount > 0) {
        const before = Number.isFinite(combatant[resource]) ? combatant[resource] : 0;
        const derivedMax =
          combatant.derived && Number.isFinite(combatant.derived[resource])
            ? combatant.derived[resource]
            : null;
        const cap = derivedMax != null && derivedMax > 0 ? derivedMax : before + amount;
        const updated = Math.min(before + amount, cap);
        combatant[resource] = updated;
        const restored = updated - before;
        if (restored > 0 && combatant.character) {
          const label = resource.charAt(0).toUpperCase() + resource.slice(1);
          pushLog(log, `${combatant.character.name} regenerates ${Math.round(restored)} ${label}`, {
            sourceId: combatant.character.id,
            targetId: combatant.character.id,
            kind: 'resource',
            resource,
            amount: restored,
          });
        }
      }
      if (ticksRemaining != null) {
        ticksRemaining -= 1;
      }
      rot.nextTick += interval;
      if (ticksRemaining != null && ticksRemaining <= 0) {
        break;
      }
    }
    rot.ticksRemaining = ticksRemaining;
    const stillTicks = ticksRemaining == null || ticksRemaining > 0;
    const keep = stillTicks && now < expires;
    if (!keep && combatant.character) {
      const label = resource.charAt(0).toUpperCase() + resource.slice(1);
      pushLog(log, `${combatant.character.name}'s ${label.toLowerCase()} regeneration fades`, {
        sourceId: combatant.character.id,
        targetId: combatant.character.id,
        kind: 'buffEnd',
        resource,
      });
    }
    return keep;
  });
  if (!Array.isArray(combatant.resistShields)) {
    combatant.resistShields = [];
  }
  combatant.resistShields = combatant.resistShields.filter(entry => {
    if (!entry) return false;
    const expires = Number.isFinite(entry.expiresAt) ? entry.expiresAt : Infinity;
    if (now < expires) {
      return true;
    }
    if (combatant.character) {
      const typeLabel =
        entry.damageType === 'magical'
          ? 'magical resistance'
          : entry.damageType === 'physical'
          ? 'physical resistance'
          : 'resistance';
      pushLog(log, `${combatant.character.name}'s ${typeLabel} ward fades`, {
        sourceId: combatant.character.id,
        targetId: combatant.character.id,
        kind: 'buffEnd',
      });
    }
    return false;
  });
  if (!Array.isArray(combatant.damageGuards)) {
    combatant.damageGuards = [];
  }
  combatant.damageGuards = combatant.damageGuards.filter(entry => {
    if (!entry) return false;
    const expires = Number.isFinite(entry.expiresAt) ? entry.expiresAt : Infinity;
    if (now < expires) {
      return true;
    }
    if (combatant.character) {
      pushLog(log, `${combatant.character.name}'s endurance fades`, {
        sourceId: combatant.character.id,
        targetId: combatant.character.id,
        kind: 'buffEnd',
      });
    }
    return false;
  });
  if (!Array.isArray(combatant.damageReflections)) {
    combatant.damageReflections = [];
  }
  combatant.damageReflections = combatant.damageReflections.filter(entry => {
    if (!entry) return false;
    const expires = Number.isFinite(entry.expiresAt) ? entry.expiresAt : Infinity;
    if (now < expires) {
      return true;
    }
    if (combatant.character) {
      pushLog(log, `${combatant.character.name}'s retaliation fades`, {
        sourceId: combatant.character.id,
        targetId: combatant.character.id,
        kind: 'buffEnd',
      });
    }
    return false;
  });
  if (!Array.isArray(combatant.damageHealShields)) {
    combatant.damageHealShields = [];
  }
  combatant.damageHealShields = combatant.damageHealShields.filter(entry => {
    if (!entry) return false;
    const expires = Number.isFinite(entry.expiresAt) ? entry.expiresAt : Infinity;
    if (now < expires) {
      return true;
    }
    if (combatant.character) {
      pushLog(log, `${combatant.character.name}'s blessing fades`, {
        sourceId: combatant.character.id,
        targetId: combatant.character.id,
        kind: 'buffEnd',
      });
    }
    return false;
  });
  combatant.dots = combatant.dots.filter(d => {
    if (!d) return false;
    const interval = Number.isFinite(d.interval) && d.interval > 0 ? d.interval : 1;
    const expires = Number.isFinite(d.expires) ? d.expires : Infinity;
    if (!Number.isFinite(d.nextTick)) {
      d.nextTick = now + interval;
    }
    while (now >= d.nextTick && now < expires) {
      const resistType = d.resistType === 'magic' ? 'magic' : d.resistType === 'none' ? null : 'melee';
      let resist = 0;
      if (resistType === 'magic') {
        resist = Number.isFinite(combatant.derived.magicResist) ? combatant.derived.magicResist : 0;
      } else if (resistType === 'melee') {
        resist = Number.isFinite(combatant.derived.meleeResist) ? combatant.derived.meleeResist : 0;
      }
      const baseDamage = Number.isFinite(d.damage) ? d.damage : 0;
      const dmg = Math.max(1, Math.round(baseDamage * (1 - resist)));
      combatant.health -= dmg;
      const label = d.logLabel || `${d.damageType || 'damage'} damage`;
      pushLog(log, `${combatant.character.name} takes ${dmg} ${label}`, {
        sourceId: combatant.character.id,
        targetId: combatant.character.id,
        kind: 'damage',
        damageType: d.damageType || 'damage',
        amount: dmg,
      });
      d.nextTick += interval;
      if (!Number.isFinite(d.nextTick)) {
        break;
      }
    }
    return now < expires;
  });
}

module.exports = { applyEffect, tick };
