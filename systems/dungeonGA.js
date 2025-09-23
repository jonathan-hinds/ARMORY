const fs = require('fs').promises;
const path = require('path');
const { ensureEquipmentShape, EQUIPMENT_SLOTS, STATS } = require('../models/utils');
const { compute } = require('./derivedStats');
const { runDungeonCombat } = require('./combatEngine');

const CONFIG_FILE = path.join(__dirname, '..', 'data', 'dungeonConfig.json');

const DEFAULT_CONFIG = {
  generations: 4,
  generationsPerExtraMember: 0,
  scaling: {
    attributePointScale: { base: 1.2, perExtraMember: 0.08, minTotal: 30 },
    gearBudgetScale: { base: 1.3, perExtraMember: 0.18, minTotal: 80 },
  },
  targetDuration: { base: 40, perMember: 12 },
  population: {
    baseSize: 18,
    sizePerPartyMember: 0,
    maxSize: 60,
    generationGrowth: 0,
    randomInjectionRate: 0.25,
    mutateParentRate: 0.2625,
    mutatePartnerRate: 0.170625,
    mutateSingleParentRate: 0.6,
  },
  evaluationWeights: {
    damageToParty: 1.8,
    bossHealthRemaining: 1.1,
    partyMembersDowned: 140,
    duration: 6,
    threatSwaps: 4,
    winBonus: 450,
    lossPenalty: 120,
    bossDamagePenalty: 0.6,
  },
  bossNegation: {
    enabled: true,
    melee: {
      base: 0.05,
      min: 0,
      max: 0.6,
      primaryScale: 0.0007,
      secondaryScale: 0.00035,
    },
    magic: {
      base: 0.05,
      min: 0,
      max: 0.6,
      primaryScale: 0.0007,
      secondaryScale: 0.00035,
    },
  },
};

let configCache = null;

function clampNumber(value, min, max, fallback) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function normalizeScale(raw = {}, defaults) {
  const base = Number.isFinite(raw.base) ? Math.max(0, raw.base) : defaults.base;
  const perExtraMember = Number.isFinite(raw.perExtraMember)
    ? Math.max(0, raw.perExtraMember)
    : defaults.perExtraMember;
  const minTotal = Number.isFinite(raw.minTotal)
    ? Math.max(0, Math.round(raw.minTotal))
    : defaults.minTotal;
  return { base, perExtraMember, minTotal };
}

function normalizePopulationConfig(raw = {}) {
  const defaults = DEFAULT_CONFIG.population;
  const baseSize = Number.isFinite(raw.baseSize)
    ? Math.max(2, Math.round(raw.baseSize))
    : defaults.baseSize;
  const sizePerPartyMember = Number.isFinite(raw.sizePerPartyMember)
    ? Math.max(0, raw.sizePerPartyMember)
    : defaults.sizePerPartyMember;
  const maxSize = Number.isFinite(raw.maxSize) && raw.maxSize > 0
    ? Math.max(baseSize, Math.round(raw.maxSize))
    : defaults.maxSize;
  const generationGrowth = Number.isFinite(raw.generationGrowth)
    ? Math.max(0, raw.generationGrowth)
    : defaults.generationGrowth;
  let randomInjectionRate = clampNumber(
    raw.randomInjectionRate,
    0,
    1,
    defaults.randomInjectionRate,
  );
  let mutateParentRate = clampNumber(raw.mutateParentRate, 0, 1, defaults.mutateParentRate);
  let mutatePartnerRate = clampNumber(raw.mutatePartnerRate, 0, 1, defaults.mutatePartnerRate);
  const total = randomInjectionRate + mutateParentRate + mutatePartnerRate;
  if (total > 0.999) {
    const scale = 0.999 / total;
    randomInjectionRate *= scale;
    mutateParentRate *= scale;
    mutatePartnerRate *= scale;
  }
  const mutateSingleParentRate = clampNumber(
    raw.mutateSingleParentRate,
    0,
    1,
    defaults.mutateSingleParentRate,
  );
  return {
    baseSize,
    sizePerPartyMember,
    maxSize,
    generationGrowth,
    randomInjectionRate,
    mutateParentRate,
    mutatePartnerRate,
    mutateSingleParentRate,
  };
}

function normalizeEvaluationWeights(raw = {}) {
  const defaults = DEFAULT_CONFIG.evaluationWeights;
  return {
    damageToParty: Number.isFinite(raw.damageToParty) ? raw.damageToParty : defaults.damageToParty,
    bossHealthRemaining: Number.isFinite(raw.bossHealthRemaining)
      ? raw.bossHealthRemaining
      : defaults.bossHealthRemaining,
    partyMembersDowned: Number.isFinite(raw.partyMembersDowned)
      ? raw.partyMembersDowned
      : defaults.partyMembersDowned,
    duration: Number.isFinite(raw.duration) ? raw.duration : defaults.duration,
    threatSwaps: Number.isFinite(raw.threatSwaps) ? raw.threatSwaps : defaults.threatSwaps,
    winBonus: Number.isFinite(raw.winBonus) ? raw.winBonus : defaults.winBonus,
    lossPenalty: Number.isFinite(raw.lossPenalty) ? raw.lossPenalty : defaults.lossPenalty,
    bossDamagePenalty: Number.isFinite(raw.bossDamagePenalty)
      ? raw.bossDamagePenalty
      : defaults.bossDamagePenalty,
  };
}

function normalizeNegationType(raw = {}, defaults) {
  const base = Number.isFinite(raw.base) ? Math.max(0, raw.base) : defaults.base;
  const min = Number.isFinite(raw.min) ? Math.max(0, Math.min(raw.min, 0.75)) : defaults.min;
  const maxCandidate = Number.isFinite(raw.max) ? Math.max(min, Math.min(raw.max, 0.9)) : defaults.max;
  const max = Math.max(min, maxCandidate);
  const primaryScale = Number.isFinite(raw.primaryScale)
    ? Math.max(0, raw.primaryScale)
    : defaults.primaryScale;
  const secondaryScale = Number.isFinite(raw.secondaryScale)
    ? Math.max(0, raw.secondaryScale)
    : defaults.secondaryScale;
  return { base, min, max, primaryScale, secondaryScale };
}

function normalizeBossNegation(raw = {}) {
  const defaults = DEFAULT_CONFIG.bossNegation;
  const enabled = raw.enabled === false ? false : defaults.enabled !== false;
  return {
    enabled,
    melee: normalizeNegationType(raw.melee || {}, defaults.melee),
    magic: normalizeNegationType(raw.magic || {}, defaults.magic),
  };
}

function normalizeDungeonConfig(raw = {}) {
  const config = raw && typeof raw === 'object' ? raw : {};
  const generations = Number.isFinite(config.generations)
    ? Math.max(1, Math.round(config.generations))
    : DEFAULT_CONFIG.generations;
  const generationsPerExtraMember = Number.isFinite(config.generationsPerExtraMember)
    ? Math.max(0, config.generationsPerExtraMember)
    : DEFAULT_CONFIG.generationsPerExtraMember;
  const scaling = {
    attributePointScale: normalizeScale(
      config.scaling && config.scaling.attributePointScale,
      DEFAULT_CONFIG.scaling.attributePointScale,
    ),
    gearBudgetScale: normalizeScale(
      config.scaling && config.scaling.gearBudgetScale,
      DEFAULT_CONFIG.scaling.gearBudgetScale,
    ),
  };
  const targetDurationRaw = config.targetDuration && typeof config.targetDuration === 'object'
    ? config.targetDuration
    : {};
  const targetDuration = {
    base: Number.isFinite(targetDurationRaw.base)
      ? Math.max(1, targetDurationRaw.base)
      : DEFAULT_CONFIG.targetDuration.base,
    perMember: Number.isFinite(targetDurationRaw.perMember)
      ? Math.max(0, targetDurationRaw.perMember)
      : DEFAULT_CONFIG.targetDuration.perMember,
  };
  return {
    generations,
    generationsPerExtraMember,
    scaling,
    targetDuration,
    population: normalizePopulationConfig(config.population),
    evaluationWeights: normalizeEvaluationWeights(config.evaluationWeights),
    bossNegation: normalizeBossNegation(config.bossNegation),
  };
}

async function loadDungeonConfig() {
  if (configCache) {
    return configCache;
  }
  try {
    const data = await fs.readFile(CONFIG_FILE, 'utf8');
    const parsed = JSON.parse(data);
    configCache = normalizeDungeonConfig(parsed);
  } catch (err) {
    if (err && err.code !== 'ENOENT') {
      throw err;
    }
    configCache = normalizeDungeonConfig(DEFAULT_CONFIG);
  }
  return configCache;
}

const NAME_POOL = [
  'Cataclysm',
  'Obsidian Warden',
  'Grim Herald',
  'Abyssal Sovereign',
  'Void Reaver',
  'Storm Tyrant',
  'Iron Colossus',
  'Soulbinder',
  'Crimson Seraph',
  'Nightfall Regent',
];

function clone(value) {
  return JSON.parse(JSON.stringify(value || null));
}

function randomInt(max) {
  return Math.floor(Math.random() * max);
}

function shuffle(list) {
  const arr = Array.isArray(list) ? list.slice() : [];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

function buildStatFocus(attributes = {}) {
  const focus = {};
  let maxValue = 0;
  let total = 0;
  STATS.forEach(stat => {
    const value = Math.max(0, Number(attributes[stat]) || 0);
    focus[stat] = value;
    if (value > maxValue) maxValue = value;
    total += value;
  });
  if (maxValue <= 0 || !Number.isFinite(maxValue)) {
    const baseline = 1 / Math.max(1, STATS.length);
    STATS.forEach(stat => {
      focus[stat] = baseline;
    });
    return focus;
  }
  const divisor = total > 0 ? total : maxValue * Math.max(1, STATS.length);
  STATS.forEach(stat => {
    const raw = focus[stat] || 0;
    const share = raw / divisor;
    const emphasis = raw / maxValue;
    focus[stat] = 0.35 * share + 0.65 * emphasis;
  });
  return focus;
}

function abilityWeight(ability, focus) {
  if (!ability) {
    return 0;
  }
  let weight = ability.isBasicAttack ? 0.6 : 0.2;
  const scaling = Array.isArray(ability.scaling) ? ability.scaling : [];
  if (scaling.length) {
    let matched = 0;
    let totalFocus = 0;
    scaling.forEach(stat => {
      const key = typeof stat === 'string' ? stat : null;
      if (key && Object.prototype.hasOwnProperty.call(focus, key)) {
        matched += 1;
        totalFocus += focus[key] || 0;
      }
    });
    if (matched > 0) {
      const avgFocus = totalFocus / matched;
      weight += 2.5 * avgFocus;
    } else {
      weight *= 0.45;
    }
  } else if (!ability.isBasicAttack) {
    weight *= 0.6;
  }
  const cooldown = Number(ability.cooldown);
  if (Number.isFinite(cooldown) && cooldown > 12) {
    weight *= 0.85;
  }
  return Math.max(weight, 0.05);
}

function cooldownSpacingMultiplier(ability, options = {}) {
  if (!ability) {
    return 0;
  }
  const cooldown = Number(ability.cooldown);
  if (!Number.isFinite(cooldown) || cooldown <= 0) {
    return 1;
  }
  const attackInterval = Number.isFinite(options.attackInterval) && options.attackInterval > 0
    ? options.attackInterval
    : null;
  if (!attackInterval) {
    return 1;
  }
  const rotation = Array.isArray(options.rotation) ? options.rotation : [];
  const ignoreIndex = Number.isInteger(options.ignoreIndex) ? options.ignoreIndex : null;
  const slotIndex = Number.isInteger(options.slotIndex) ? options.slotIndex : rotation.length;
  const abilityId = options.abilityId != null ? options.abilityId : ability.id;
  const rawTarget = Number.isInteger(options.targetLength) ? options.targetLength : null;
  const cycleSlots = Math.max(1, rawTarget != null ? rawTarget : Math.max(rotation.length + 1, 1));
  const cycleTime = cycleSlots * attackInterval;

  const existingPositions = [];
  for (let i = 0; i < rotation.length; i += 1) {
    if (i === ignoreIndex) continue;
    if (rotation[i] === abilityId) {
      existingPositions.push(i);
    }
  }

  if (!existingPositions.length) {
    if (cooldown <= attackInterval) {
      return ability.isBasicAttack ? 1.2 : 1.05;
    }
    const ratio = cycleTime / cooldown;
    if (!Number.isFinite(ratio) || ratio >= 1) {
      return 1;
    }
    const baseline = ability.isBasicAttack ? 0.8 : 0.6;
    const bonus = ability.isBasicAttack ? 0.3 : 0.4;
    return Math.max(0.3, Math.min(1.1, baseline + bonus * ratio));
  }

  let minGap = Infinity;
  existingPositions.forEach(idx => {
    const forwardSlots = slotIndex >= idx ? slotIndex - idx : slotIndex + cycleSlots - idx;
    if (forwardSlots <= 0) {
      return;
    }
    const separation = forwardSlots * attackInterval;
    if (separation < minGap) {
      minGap = separation;
    }
  });

  if (!Number.isFinite(minGap) || minGap === Infinity) {
    minGap = cycleTime;
  }

  const ratio = minGap / cooldown;
  if (ratio >= 1.2) {
    return 1.05;
  }
  if (ratio >= 1) {
    return 1;
  }
  if (ratio >= 0.8) {
    return 0.65;
  }
  if (ratio >= 0.6) {
    return 0.4;
  }
  if (ratio >= 0.4) {
    return 0.2;
  }
  return 0.08;
}

function pickAbilityId(abilityIds, abilityMap, focus, options = {}) {
  const pool = Array.isArray(abilityIds) ? abilityIds : [];
  if (!pool.length) {
    return null;
  }
  const excludeId = options.excludeId != null ? options.excludeId : null;
  const rotation = Array.isArray(options.rotation) ? options.rotation : [];
  const slotIndex = Number.isInteger(options.slotIndex) ? options.slotIndex : rotation.length;
  const targetLength = Number.isInteger(options.targetLength)
    ? Math.max(1, options.targetLength)
    : Math.max(1, rotation.length + 1);
  const attackInterval = Number.isFinite(options.attackInterval) && options.attackInterval > 0
    ? options.attackInterval
    : null;
  const ignoreIndex = Number.isInteger(options.ignoreIndex) ? options.ignoreIndex : null;
  const preferId = options.preferId != null ? options.preferId : null;

  let totalWeight = 0;
  const weights = pool.map(id => {
    if (excludeId != null && id === excludeId) {
      return 0;
    }
    const ability = abilityMap && typeof abilityMap.get === 'function' ? abilityMap.get(id) : null;
    if (!ability) {
      return 0;
    }
    let weight = abilityWeight(ability, focus);
    if (preferId != null && id === preferId) {
      weight *= 1.1;
    }
    if (attackInterval) {
      weight *= cooldownSpacingMultiplier(ability, {
        rotation,
        slotIndex,
        targetLength,
        attackInterval,
        ignoreIndex,
        abilityId: id,
      });
    }
    totalWeight += weight;
    return weight;
  });

  if (totalWeight <= 0) {
    const filtered = excludeId == null ? pool : pool.filter(id => id !== excludeId);
    if (!filtered.length) {
      return pool[randomInt(pool.length)];
    }
    return filtered[randomInt(filtered.length)];
  }

  let roll = Math.random() * totalWeight;
  for (let i = 0; i < pool.length; i += 1) {
    const weight = weights[i];
    if (weight <= 0) continue;
    if (roll < weight) {
      return pool[i];
    }
    roll -= weight;
  }
  return pool[pool.length - 1];
}

function totalAttributePoints(attributes = {}) {
  return STATS.reduce((acc, stat) => acc + (attributes[stat] || 0), 0);
}

function adjustAttributes(attributes, total) {
  const adjusted = {};
  STATS.forEach(stat => {
    const value = attributes && typeof attributes[stat] === 'number' ? attributes[stat] : 0;
    adjusted[stat] = Math.max(0, Math.round(value));
  });
  let sum = STATS.reduce((acc, stat) => acc + adjusted[stat], 0);
  if (sum === 0 && total > 0) {
    adjusted.strength = total;
    sum = total;
  }
  while (sum > total) {
    const candidates = STATS.filter(stat => adjusted[stat] > 0);
    if (!candidates.length) break;
    const stat = candidates[randomInt(candidates.length)];
    adjusted[stat] -= 1;
    sum -= 1;
  }
  while (sum < total) {
    const stat = STATS[randomInt(STATS.length)];
    adjusted[stat] += 1;
    sum += 1;
  }
  return adjusted;
}

function randomAttributes(total) {
  if (total <= 0) {
    return adjustAttributes({}, 0);
  }
  const weights = STATS.map(() => Math.pow(Math.random(), 1.4));
  const weightSum = weights.reduce((acc, value) => acc + value, 0) || 1;
  const provisional = {};
  let assigned = 0;
  STATS.forEach((stat, idx) => {
    const share = Math.round((weights[idx] / weightSum) * total);
    provisional[stat] = share;
    assigned += share;
  });
  if (assigned !== total) {
    provisional.strength = (provisional.strength || 0) + (total - assigned);
  }
  return adjustAttributes(provisional, total);
}

function ensureRotation(rotation, abilityIds, attributes, context, options = {}) {
  const sourceIds = Array.isArray(abilityIds) ? abilityIds : [];
  const validIds = new Set(sourceIds);
  const initial = Array.isArray(rotation) ? rotation.filter(id => validIds.has(id)) : [];
  const abilityMap = context && context.abilityMap && typeof context.abilityMap.get === 'function'
    ? context.abilityMap
    : null;
  const focus = buildStatFocus(attributes);
  const minLen = 3;
  const maxLen = 6;
  const attackInterval = Number.isFinite(options.attackInterval) && options.attackInterval > 0
    ? options.attackInterval
    : null;
  const desiredLength = Number.isInteger(options.targetLength) ? options.targetLength : initial.length;
  const targetLength = Math.max(minLen, Math.min(maxLen, desiredLength || minLen));
  const result = [];

  for (let i = 0; i < initial.length && result.length < maxLen; i += 1) {
    const preferId = initial[i];
    const chosen = pickAbilityId(sourceIds, abilityMap, focus, {
      rotation: result,
      slotIndex: result.length,
      targetLength,
      attackInterval,
      preferId,
    });
    if (chosen != null) {
      result.push(chosen);
    }
  }

  while (result.length < minLen && sourceIds.length) {
    const chosen = pickAbilityId(sourceIds, abilityMap, focus, {
      rotation: result,
      slotIndex: result.length,
      targetLength: Math.max(targetLength, result.length + 1),
      attackInterval,
    });
    if (chosen == null) {
      break;
    }
    result.push(chosen);
  }

  if (result.length > maxLen) {
    result.length = maxLen;
  }

  if (!result.length && sourceIds.length) {
    const fallback = pickAbilityId(sourceIds, abilityMap, focus, {
      rotation: result,
      slotIndex: 0,
      targetLength: Math.max(minLen, 1),
      attackInterval,
    });
    if (fallback != null) {
      result.push(fallback);
    }
  }

  return result;
}

function randomRotation(abilityIds, attributes, context, options = {}) {
  const minLen = 3;
  const maxLen = 6;
  const length = minLen + randomInt(Math.max(1, maxLen - minLen + 1));
  const abilityMap = context && context.abilityMap && typeof context.abilityMap.get === 'function'
    ? context.abilityMap
    : null;
  const focus = buildStatFocus(attributes);
  const attackInterval = Number.isFinite(options.attackInterval) && options.attackInterval > 0
    ? options.attackInterval
    : null;
  const rotation = [];
  for (let i = 0; i < length; i += 1) {
    const abilityId = pickAbilityId(abilityIds, abilityMap, focus, {
      rotation,
      slotIndex: i,
      targetLength: length,
      attackInterval,
    });
    if (abilityId == null) {
      break;
    }
    rotation.push(abilityId);
  }
  return ensureRotation(rotation, abilityIds, attributes, context, {
    attackInterval,
    targetLength: length,
  });
}

function mutateRotation(rotation, abilityIds, attributes, context, options = {}) {
  const next = Array.isArray(rotation) ? rotation.slice() : [];
  const attackInterval = Number.isFinite(options.attackInterval) && options.attackInterval > 0
    ? options.attackInterval
    : null;
  if (!next.length) return randomRotation(abilityIds, attributes, context, { attackInterval });
  const abilityMap = context && context.abilityMap && typeof context.abilityMap.get === 'function'
    ? context.abilityMap
    : null;
  const focus = buildStatFocus(attributes);
  if (Math.random() < 0.4 && next.length < 6 && abilityIds && abilityIds.length) {
    const candidate = pickAbilityId(abilityIds, abilityMap, focus, {
      rotation: next,
      slotIndex: next.length,
      targetLength: Math.min(6, next.length + 1),
      attackInterval,
    });
    if (candidate != null) {
      next.push(candidate);
    }
  } else if (abilityIds && abilityIds.length) {
    const idx = randomInt(next.length);
    const replacement = pickAbilityId(abilityIds, abilityMap, focus, {
      rotation: next,
      slotIndex: idx,
      targetLength: next.length,
      attackInterval,
      ignoreIndex: idx,
      preferId: next[idx],
    });
    if (replacement != null) {
      next[idx] = replacement;
    }
  }
  return ensureRotation(next, abilityIds, attributes, context, {
    attackInterval,
    targetLength: next.length,
  });
}

function breedRotation(rotA = [], rotB = [], abilityIds, attributes, context, options = {}) {
  const minLen = 3;
  const maxLen = 6;
  const avgLength = Math.round((rotA.length + rotB.length) / 2) || minLen;
  const length = Math.max(minLen, Math.min(maxLen, avgLength + (randomInt(3) - 1)));
  const abilityMap = context && context.abilityMap && typeof context.abilityMap.get === 'function'
    ? context.abilityMap
    : null;
  const focus = buildStatFocus(attributes);
  const attackInterval = Number.isFinite(options.attackInterval) && options.attackInterval > 0
    ? options.attackInterval
    : null;
  const validIds = new Set(Array.isArray(abilityIds) ? abilityIds : []);
  const rotation = [];
  for (let i = 0; i < length; i += 1) {
    let abilityId = null;
    if (rotA.length && Math.random() < 0.5) {
      abilityId = rotA[i % rotA.length];
    }
    if ((abilityId == null) && rotB.length && Math.random() < 0.7) {
      abilityId = rotB[i % rotB.length];
    }
    if (abilityId == null || !validIds.has(abilityId)) {
      abilityId = null;
    }
    const chosen = pickAbilityId(abilityIds, abilityMap, focus, {
      rotation,
      slotIndex: rotation.length,
      targetLength: length,
      attackInterval,
      preferId: abilityId,
    });
    if (chosen != null) {
      rotation.push(chosen);
    }
  }
  return ensureRotation(rotation, abilityIds, attributes, context, {
    attackInterval,
    targetLength: length,
  });
}

function buildItemsBySlot(equipmentMap) {
  const map = new Map();
  equipmentMap.forEach(item => {
    if (!item || !item.slot) return;
    if (!map.has(item.slot)) map.set(item.slot, []);
    map.get(item.slot).push(item);
  });
  map.forEach(list => {
    list.sort((a, b) => {
      const costA = typeof a.cost === 'number' ? a.cost : 0;
      const costB = typeof b.cost === 'number' ? b.cost : 0;
      return costA - costB;
    });
  });
  return map;
}

function sanitizeEquipment(equipment, gearBudget, equipmentMap) {
  const sanitized = {};
  let total = 0;
  EQUIPMENT_SLOTS.forEach(slot => {
    const id = equipment && equipment[slot] ? equipment[slot] : null;
    const item = id ? equipmentMap.get(id) : null;
    if (item && item.slot === slot) {
      sanitized[slot] = item.id;
      total += typeof item.cost === 'number' ? item.cost : 0;
    } else {
      sanitized[slot] = null;
    }
  });
  const budget = typeof gearBudget === 'number' ? Math.max(0, gearBudget) : null;
  if (budget != null && total > budget) {
    const sorted = EQUIPMENT_SLOTS.filter(slot => sanitized[slot]).map(slot => ({
      slot,
      cost: (equipmentMap.get(sanitized[slot]) && equipmentMap.get(sanitized[slot]).cost) || 0,
    }));
    sorted.sort((a, b) => b.cost - a.cost);
    for (const entry of sorted) {
      if (total <= budget) break;
      total -= entry.cost;
      sanitized[entry.slot] = null;
    }
  }
  return sanitized;
}

function resolveEquipmentForCompute(equipment, equipmentMap) {
  const resolved = {};
  EQUIPMENT_SLOTS.forEach(slot => {
    const id = equipment && equipment[slot] ? equipment[slot] : null;
    if (id && equipmentMap && equipmentMap.has(id)) {
      resolved[slot] = equipmentMap.get(id);
    } else {
      resolved[slot] = null;
    }
  });
  return resolved;
}

function resolveAttackInterval(attributes, equipment, basicType, context) {
  try {
    if (!context || !context.equipmentMap) {
      return null;
    }
    const shaped = ensureEquipmentShape(equipment || {});
    const resolved = resolveEquipmentForCompute(shaped, context.equipmentMap);
    const character = {
      attributes: { ...attributes },
      basicType: basicType === 'magic' ? 'magic' : 'melee',
      level: (context.baseCharacter && context.baseCharacter.level) || 1,
      rotation: [],
      equipment: shaped,
    };
    const derived = compute(character, resolved);
    const value = derived && Number.isFinite(derived.attackIntervalSeconds)
      ? derived.attackIntervalSeconds
      : null;
    if (Number.isFinite(value) && value > 0) {
      return Math.max(0.5, value);
    }
  } catch (err) {
    // ignore
  }
  return null;
}

function randomEquipment(gearBudget, itemsBySlot, playerCosts, equipmentMap, options = {}) {
  const forceEmpty = options && options.forceEmpty;
  if (forceEmpty) {
    return sanitizeEquipment({}, gearBudget, equipmentMap);
  }

  const result = {};
  let remaining = typeof gearBudget === 'number' ? Math.max(0, gearBudget) : 0;
  const slotOrder = shuffle(EQUIPMENT_SLOTS);
  slotOrder.forEach(slot => {
    const slotItems = itemsBySlot.get(slot) || [];
    if (!slotItems.length) {
      result[slot] = null;
      return;
    }
    const playerCost = (playerCosts && playerCosts[slot]) || 0;
    const biasFromPlayer = playerCost > 0 && Math.random() < 0.6;
    const baseTarget = biasFromPlayer
      ? playerCost * (0.5 + Math.random() * 0.9)
      : remaining * (0.15 + Math.random() * 0.5);
    const cap = Math.max(0, Math.min(remaining, baseTarget));
    const affordabilityThreshold = Math.max(cap, remaining * 0.15);
    const affordable = slotItems.filter(item => typeof item.cost === 'number' && item.cost <= affordabilityThreshold);
    const equipChanceBase = playerCost > 0 ? 0.35 : 0.2;
    const equipChance = Math.min(0.85, equipChanceBase + Math.random() * 0.4);
    if (!affordable.length || Math.random() > equipChance) {
      result[slot] = null;
      return;
    }
    const choice = affordable[randomInt(affordable.length)];
    result[slot] = choice.id;
    remaining = Math.max(0, remaining - (choice.cost || 0));
  });
  return sanitizeEquipment(result, gearBudget, equipmentMap);
}

function mutateEquipment(equipment, gearBudget, itemsBySlot, playerCosts, equipmentMap) {
  const current = { ...equipment };
  const slot = EQUIPMENT_SLOTS[randomInt(EQUIPMENT_SLOTS.length)];
  const slotItems = itemsBySlot.get(slot) || [];
  if (Math.random() < 0.45 || !slotItems.length) {
    current[slot] = null;
  } else {
    const playerCost = (playerCosts && playerCosts[slot]) || 0;
    const budget = typeof gearBudget === 'number' ? Math.max(0, gearBudget) : 0;
    const biasFromPlayer = playerCost > 0 && Math.random() < 0.55;
    const baseTarget = biasFromPlayer
      ? playerCost * (0.5 + Math.random() * 0.9)
      : budget * (0.1 + Math.random() * 0.6) || 0;
    const cap = Math.max(0, Math.min(budget, baseTarget));
    const affordabilityThreshold = Math.max(cap, budget * 0.15);
    const candidates = slotItems.filter(item => typeof item.cost === 'number' && item.cost <= affordabilityThreshold);
    if (candidates.length) {
      current[slot] = candidates[randomInt(candidates.length)].id;
    } else {
      current[slot] = null;
    }
  }
  return sanitizeEquipment(current, gearBudget, equipmentMap);
}

function breedEquipment(eqA, eqB, gearBudget, itemsBySlot, playerCosts, equipmentMap) {
  const inherited = {};
  EQUIPMENT_SLOTS.forEach(slot => {
    const pick = Math.random() < 0.5 ? eqA : eqB;
    inherited[slot] = pick && pick[slot] ? pick[slot] : null;
  });
  let result = sanitizeEquipment(inherited, gearBudget, equipmentMap);
  if (Math.random() < 0.25) {
    result = mutateEquipment(result, gearBudget, itemsBySlot, playerCosts, equipmentMap);
  }
  return result;
}

function randomBasicType(attributes) {
  const strength = attributes.strength || 0;
  const intellect = attributes.intellect || 0;
  if (strength === intellect) {
    return Math.random() < 0.5 ? 'melee' : 'magic';
  }
  return strength > intellect ? 'melee' : 'magic';
}

function resolveBasicType(preferred, attributes) {
  if (preferred === 'magic' || preferred === 'melee') {
    return preferred;
  }
  return randomBasicType(attributes);
}

function normalizeGenome(genome, context) {
  const { totalPoints, abilityIds, gearBudget, itemsBySlot, playerCosts, equipmentMap } = context;
  const attributes = adjustAttributes(genome && genome.attributes ? genome.attributes : {}, totalPoints);
  const equipment = sanitizeEquipment(genome && genome.equipment ? genome.equipment : {}, gearBudget, equipmentMap);
  const basicType = resolveBasicType(genome && genome.basicType, attributes);
  const attackInterval = resolveAttackInterval(attributes, equipment, basicType, context);
  const requestedLength = Array.isArray(genome && genome.rotation) ? genome.rotation.length : null;
  const rotation = ensureRotation(
    genome && genome.rotation ? genome.rotation : [],
    abilityIds,
    attributes,
    context,
    { attackInterval, targetLength: requestedLength },
  );
  const named = genome && typeof genome.name === 'string' ? genome.name : null;
  return {
    basicType,
    attributes,
    rotation,
    equipment,
    name: named,
  };
}

function randomGenome(context, options = {}) {
  const { totalPoints, abilityIds, gearBudget, itemsBySlot, playerCosts, equipmentMap } = context;
  const attributes = randomAttributes(totalPoints);
  const equipment = randomEquipment(gearBudget, itemsBySlot, playerCosts, equipmentMap, options);
  const basicType = randomBasicType(attributes);
  const attackInterval = resolveAttackInterval(attributes, equipment, basicType, context);
  const rotation = randomRotation(abilityIds, attributes, context, { attackInterval });
  return normalizeGenome({ attributes, rotation, equipment, basicType }, context);
}

function mutateGenome(genome, context) {
  const attributes = { ...genome.attributes };
  const stat = STATS[randomInt(STATS.length)];
  attributes[stat] = (attributes[stat] || 0) + (Math.random() < 0.5 ? -1 : 1);
  const equipment = mutateEquipment(
    genome.equipment || {},
    context.gearBudget,
    context.itemsBySlot,
    context.playerCosts,
    context.equipmentMap,
  );
  const baseType = resolveBasicType(genome && genome.basicType, attributes);
  const basicType = Math.random() < 0.3 ? (baseType === 'magic' ? 'melee' : 'magic') : baseType;
  const attackInterval = resolveAttackInterval(attributes, equipment, basicType, context);
  const rotation = mutateRotation(
    genome.rotation || [],
    context.abilityIds,
    attributes,
    context,
    { attackInterval },
  );
  return normalizeGenome({ basicType, attributes, rotation, equipment, name: genome.name }, context);
}

function breedGenomes(parentA, parentB, context) {
  if (!parentA || !parentB) {
    return randomGenome(context);
  }
  const attributes = {};
  STATS.forEach(stat => {
    const a = parentA.attributes ? parentA.attributes[stat] || 0 : 0;
    const b = parentB.attributes ? parentB.attributes[stat] || 0 : 0;
    let value = Math.random() < 0.5 ? a : b;
    if (Math.random() < 0.2) {
      value += Math.round((Math.random() - 0.5) * 2);
    }
    attributes[stat] = value;
  });
  let equipment = breedEquipment(
    parentA.equipment || {},
    parentB.equipment || {},
    context.gearBudget,
    context.itemsBySlot,
    context.playerCosts,
    context.equipmentMap,
  );
  if (Math.random() < 0.25) {
    equipment = mutateEquipment(
      equipment,
      context.gearBudget,
      context.itemsBySlot,
      context.playerCosts,
      context.equipmentMap,
    );
  }
  let basicType;
  if (Math.random() < 0.45) {
    basicType = resolveBasicType(parentA.basicType, attributes);
  } else if (Math.random() < 0.5) {
    basicType = resolveBasicType(parentB.basicType, attributes);
  } else {
    basicType = randomBasicType(attributes);
  }
  const attackInterval = resolveAttackInterval(attributes, equipment, basicType, context);
  const rotation = breedRotation(
    parentA.rotation || [],
    parentB.rotation || [],
    context.abilityIds,
    attributes,
    context,
    { attackInterval },
  );
  return normalizeGenome({ basicType, attributes, rotation, equipment }, context);
}

function computePartyProfile(party, equipmentMap) {
  if (!Array.isArray(party) || !party.length) {
    return {
      avgPoints: 0,
      avgLevel: 1,
      avgGear: 0,
      avgSlotCosts: {},
      offense: {
        totalMeleeDps: 0,
        totalMagicDps: 0,
        totalPrimaryDps: 0,
        avgMeleeDps: 0,
        avgMagicDps: 0,
        avgPrimaryDps: 0,
      },
    };
  }
  let totalPoints = 0;
  let totalLevel = 0;
  let totalGear = 0;
  const slotTotals = {};
  const offenseTotals = {
    totalMeleeDps: 0,
    totalMagicDps: 0,
    totalPrimaryDps: 0,
  };
  party.forEach(character => {
    totalPoints += totalAttributePoints(character.attributes || {});
    totalLevel += character.level || 1;
    const equipment = ensureEquipmentShape(character.equipment || {});
    const resolved = {};
    EQUIPMENT_SLOTS.forEach(slot => {
      const id = equipment[slot];
      const item = id ? equipmentMap.get(id) : null;
      const cost = item && typeof item.cost === 'number' ? item.cost : 0;
      resolved[slot] = item || null;
      totalGear += cost;
      slotTotals[slot] = (slotTotals[slot] || 0) + cost;
    });
    const derived = compute(character, resolved);
    const attackInterval = Number.isFinite(derived.attackIntervalSeconds)
      ? Math.max(0.5, derived.attackIntervalSeconds)
      : 2;
    const meleeDamage = Math.max(
      Number.isFinite(derived.maxMeleeAttack) ? derived.maxMeleeAttack : 0,
      Number.isFinite(derived.minMeleeAttack) ? derived.minMeleeAttack : 0,
    );
    const magicDamage = Math.max(
      Number.isFinite(derived.maxMagicAttack) ? derived.maxMagicAttack : 0,
      Number.isFinite(derived.minMagicAttack) ? derived.minMagicAttack : 0,
    );
    const meleeDps = meleeDamage / Math.max(0.5, attackInterval);
    const magicDps = magicDamage / Math.max(0.5, attackInterval);
    offenseTotals.totalMeleeDps += meleeDps;
    offenseTotals.totalMagicDps += magicDps;
    const primaryType =
      character.basicType === 'magic'
        ? 'magic'
        : character.basicType === 'melee'
        ? 'melee'
        : meleeDps >= magicDps
        ? 'melee'
        : 'magic';
    offenseTotals.totalPrimaryDps += primaryType === 'magic' ? magicDps : meleeDps;
  });
  const avgSlotCosts = {};
  EQUIPMENT_SLOTS.forEach(slot => {
    avgSlotCosts[slot] = Math.round((slotTotals[slot] || 0) / Math.max(1, party.length));
  });
  const divisor = Math.max(1, party.length);
  return {
    avgPoints: totalPoints / party.length,
    avgLevel: totalLevel / party.length,
    avgGear: totalGear / party.length,
    avgSlotCosts,
    offense: {
      totalMeleeDps: offenseTotals.totalMeleeDps,
      totalMagicDps: offenseTotals.totalMagicDps,
      totalPrimaryDps: offenseTotals.totalPrimaryDps,
      avgMeleeDps: offenseTotals.totalMeleeDps / divisor,
      avgMagicDps: offenseTotals.totalMagicDps / divisor,
      avgPrimaryDps: offenseTotals.totalPrimaryDps / divisor,
    },
  };
}

function buildDungeonContext(party, abilityMap, equipmentMap, options = {}, config) {
  const profile = computePartyProfile(party, equipmentMap);
  const partySize = Math.max(1, party.length || 1);
  const abilityIds = Array.from(abilityMap.keys());
  const itemsBySlot = buildItemsBySlot(equipmentMap);
  const extraMembers = Math.max(0, partySize - 2);
  const attributeScale = config.scaling.attributePointScale.base
    + extraMembers * config.scaling.attributePointScale.perExtraMember;
  const gearScale = config.scaling.gearBudgetScale.base
    + extraMembers * config.scaling.gearBudgetScale.perExtraMember;
  const totalPoints = Math.max(
    config.scaling.attributePointScale.minTotal,
    Math.round(profile.avgPoints * attributeScale),
  );
  const gearBudget = Math.max(
    config.scaling.gearBudgetScale.minTotal,
    Math.round(profile.avgGear * gearScale),
  );
  const targetDuration = config.targetDuration.base + partySize * config.targetDuration.perMember;
  const generationOverride = Number.isFinite(options.generations)
    ? Math.max(1, Math.round(options.generations))
    : null;
  const generations =
    generationOverride || Math.max(1, Math.round(config.generations + extraMembers * config.generationsPerExtraMember));

  return {
    party,
    abilityIds,
    abilityMap,
    equipmentMap,
    itemsBySlot,
    totalPoints,
    gearBudget,
    playerCosts: profile.avgSlotCosts,
    partyLevelAvg: profile.avgLevel,
    partySize,
    targetDuration,
    generations,
    config,
    partyOffense: profile.offense,
  };
}

function randomName(index) {
  const base = NAME_POOL[index % NAME_POOL.length];
  return `${base} ${Math.floor(Math.random() * 900 + 100)}`;
}

function computeNegationValue(primaryPower, secondaryPower, settings) {
  if (!settings) return 0;
  const base = Number.isFinite(settings.base) ? Math.max(0, settings.base) : 0;
  const min = Number.isFinite(settings.min) ? Math.max(0, settings.min) : 0;
  const max = Number.isFinite(settings.max) ? Math.max(min, settings.max) : 0.75;
  const primaryScale = Number.isFinite(settings.primaryScale) ? Math.max(0, settings.primaryScale) : 0;
  const secondaryScale = Number.isFinite(settings.secondaryScale) ? Math.max(0, settings.secondaryScale) : 0;
  const primary = Number.isFinite(primaryPower) ? Math.max(0, primaryPower) : 0;
  const secondary = Number.isFinite(secondaryPower) ? Math.max(0, secondaryPower) : 0;
  const raw = base + primary * primaryScale + secondary * secondaryScale;
  const value = Number.isFinite(raw) ? raw : 0;
  return Math.max(min, Math.min(max, value));
}

function computeBossNegation(context) {
  if (!context || !context.config || !context.config.bossNegation) {
    return null;
  }
  const { bossNegation } = context.config;
  if (bossNegation.enabled === false) {
    return null;
  }
  const offense = context.partyOffense || {};
  const totalMelee = Number.isFinite(offense.totalMeleeDps) ? Math.max(0, offense.totalMeleeDps) : 0;
  const totalMagic = Number.isFinite(offense.totalMagicDps) ? Math.max(0, offense.totalMagicDps) : 0;
  const melee = computeNegationValue(totalMelee, totalMagic, bossNegation.melee);
  const magic = computeNegationValue(totalMagic, totalMelee, bossNegation.magic);
  if (melee <= 0 && magic <= 0) {
    return null;
  }
  return { melee, magic };
}

function applyBossNegationToDerived(derived, negation) {
  if (!derived || !negation) return null;
  const meleeTarget = Number.isFinite(negation.melee) ? Math.max(0, negation.melee) : 0;
  const magicTarget = Number.isFinite(negation.magic) ? Math.max(0, negation.magic) : 0;
  if (meleeTarget <= 0 && magicTarget <= 0) {
    return null;
  }
  const clamp = value => {
    if (!Number.isFinite(value)) return 0;
    return Math.min(0.75, Math.max(0, value));
  };
  const beforeMelee = clamp(derived.meleeResist);
  const beforeMagic = clamp(derived.magicResist);
  const meleeResist = clamp(beforeMelee + meleeTarget);
  const magicResist = clamp(beforeMagic + magicTarget);
  derived.meleeResist = meleeResist;
  derived.magicResist = magicResist;
  return {
    meleeBonus: Math.max(0, meleeResist - beforeMelee),
    magicBonus: Math.max(0, magicResist - beforeMagic),
    meleeResist,
    magicResist,
    targetMeleeBonus: meleeTarget,
    targetMagicBonus: magicTarget,
  };
}

function applyBossNegationToCharacter(character, context) {
  if (!character) return null;
  const negation = computeBossNegation(context);
  if (!negation) {
    delete character.bossNegation;
    return null;
  }
  character.bossNegation = negation;
  return negation;
}

function buildBossCharacter(genome, context, index) {
  const level = Math.max(1, Math.round(context.partyLevelAvg + 1 + Math.random() * context.partySize));
  const stableId = `dungeon-boss-${Date.now()}-${index}-${Math.floor(Math.random() * 1000)}`;
  const name = genome.name || randomName(index);
  return {
    id: stableId,
    name,
    attributes: clone(genome.attributes),
    basicType: genome.basicType || 'melee',
    rotation: clone(genome.rotation),
    equipment: ensureEquipmentShape(genome.equipment || {}),
    level,
    xp: 0,
  };
}

function buildBossPreview(character, equipmentMap, metrics) {
  if (!character) return null;
  const equipment = ensureEquipmentShape(character.equipment || {});
  const resolved = {};
  EQUIPMENT_SLOTS.forEach(slot => {
    const id = equipment[slot];
    resolved[slot] = id && equipmentMap.has(id) ? equipmentMap.get(id) : null;
  });
  const derived = compute(character, resolved);
  const negationDetails = character && character.bossNegation ? applyBossNegationToDerived(derived, character.bossNegation) : null;
  const preview = {
    id: character.id,
    name: character.name,
    level: character.level,
    basicType: character.basicType,
    attributes: clone(character.attributes || {}),
    rotation: Array.isArray(character.rotation) ? character.rotation.slice() : [],
    equipment,
    derived: {
      attackIntervalSeconds: derived.attackIntervalSeconds,
      minMeleeAttack: derived.minMeleeAttack,
      maxMeleeAttack: derived.maxMeleeAttack,
      minMagicAttack: derived.minMagicAttack,
      maxMagicAttack: derived.maxMagicAttack,
      health: derived.health,
      mana: derived.mana,
      stamina: derived.stamina,
      meleeResist: derived.meleeResist,
      magicResist: derived.magicResist,
      weaponDamageType: derived.weaponDamageType,
    },
  };
  if (metrics) {
    preview.metrics = { ...metrics };
  }
  if (negationDetails) {
    preview.negation = {
      meleeBonus: negationDetails.meleeBonus,
      magicBonus: negationDetails.magicBonus,
      targetMeleeBonus: negationDetails.targetMeleeBonus,
      targetMagicBonus: negationDetails.targetMagicBonus,
      meleeResist: negationDetails.meleeResist,
      magicResist: negationDetails.magicResist,
    };
    preview.derived.meleeResist = negationDetails.meleeResist;
    preview.derived.magicResist = negationDetails.magicResist;
  }
  return preview;
}

function evaluateFitness(metrics, context, result) {
  const weights = context.config.evaluationWeights;
  const damageScore = (metrics.damageToParty || 0) * weights.damageToParty;
  const survivalScore = (metrics.bossHealthRemaining || 0) * weights.bossHealthRemaining;
  const downedScore = (metrics.partyMembersDowned || 0) * weights.partyMembersDowned;
  const durationScore = Math.min(metrics.duration || 0, context.targetDuration) * weights.duration;
  const threatScoreValue = (metrics.threatSwaps || 0) * weights.threatSwaps;
  const bossDamagePenalty = (metrics.damageToBoss || 0) * weights.bossDamagePenalty;
  const winBonus = result.winnerSide === 'boss' ? weights.winBonus : 0;
  const lossPenalty = result.winnerSide === 'party' ? weights.lossPenalty : 0;
  return damageScore + survivalScore + downedScore + durationScore + threatScoreValue + winBonus - bossDamagePenalty - lossPenalty;
}

async function evaluateGenome(genome, index, context) {
  const bossCharacter = buildBossCharacter(genome, context, index);
  const partyClones = context.party.map(character => clone(character));
  const bossClone = clone(bossCharacter);
  const result = await runDungeonCombat(partyClones, bossClone, context.abilityMap, context.equipmentMap, {
    fastForward: true,
    collectLog: false,
  });
  const metrics = result.metrics || {};
  metrics.duration = result.duration || metrics.duration || 0;
  const fitness = evaluateFitness(metrics, context, result);
  return {
    genome: normalizeGenome(genome, context),
    fitness,
    metrics,
    result,
    character: bossCharacter,
  };
}

async function generatePopulation(context, parentA, parentB, generationIndex = 0) {
  const population = [];
  if (parentA) population.push(normalizeGenome(parentA, context));
  if (parentB) population.push(normalizeGenome(parentB, context));
  const popConfig = context.config.population;
  const baseTarget = popConfig.baseSize + Math.max(0, context.partySize - 1) * popConfig.sizePerPartyMember;
  const growth = Math.max(0, generationIndex) * popConfig.generationGrowth;
  let targetSize = Math.round(baseTarget + growth);
  if (popConfig.maxSize) {
    targetSize = Math.min(popConfig.maxSize, targetSize);
  }
  targetSize = Math.max(population.length || 0, targetSize);
  while (population.length < targetSize) {
    if (parentA && parentB) {
      const roll = Math.random();
      if (roll < popConfig.randomInjectionRate) {
        population.push(randomGenome(context));
      } else if (roll < popConfig.randomInjectionRate + popConfig.mutateParentRate) {
        population.push(mutateGenome(parentA, context));
      } else if (
        roll
        < popConfig.randomInjectionRate + popConfig.mutateParentRate + popConfig.mutatePartnerRate
      ) {
        population.push(mutateGenome(parentB, context));
      } else {
        population.push(breedGenomes(parentA, parentB, context));
      }
    } else if (parentA || parentB) {
      const seed = parentA || parentB;
      if (Math.random() < popConfig.mutateSingleParentRate) {
        population.push(mutateGenome(seed, context));
      } else {
        population.push(randomGenome(context));
      }
    } else {
      population.push(randomGenome(context));
    }
  }
  return population;
}

async function findChampion(context, parentA, parentB, generationIndex = 0) {
  const population = await generatePopulation(context, parentA, parentB, generationIndex);
  const evaluations = [];
  for (let i = 0; i < population.length; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const evaluation = await evaluateGenome(population[i], i, context);
    evaluations.push(evaluation);
  }
  evaluations.sort((a, b) => b.fitness - a.fitness);
  const champion = evaluations[0];
  const partner = evaluations[1] || champion;
  return { champion, partner };
}

async function generateDungeonBoss(party, abilityMap, equipmentMap, options = {}) {
  if (options.reloadConfig) {
    configCache = null;
  }
  const config = await loadDungeonConfig();
  const context = buildDungeonContext(party, abilityMap, equipmentMap, options, config);
  context.party = party;
  const seeds = Array.isArray(options.seedGenomes)
    ? options.seedGenomes.filter(Boolean)
    : options.seedGenome
    ? [options.seedGenome]
    : [];
  let parentA = seeds[0] ? normalizeGenome(seeds[0], context) : null;
  let parentB = seeds[1] ? normalizeGenome(seeds[1], context) : null;
  let finalChampion = null;
  let finalPartner = null;
  for (let gen = 0; gen < context.generations; gen += 1) {
    const { champion, partner } = await findChampion(context, parentA, parentB, gen);
    finalChampion = champion;
    parentA = champion.genome;
    parentB = partner.genome;
    finalPartner = partner;
  }
  const bossCharacter = buildBossCharacter(finalChampion.genome, context, 0);
  finalChampion.genome.name = bossCharacter.name;
  const negation = applyBossNegationToCharacter(bossCharacter, context);
  const metrics = { ...(finalChampion.metrics || {}) };
  if (context.partyOffense) {
    metrics.partyOffense = {
      totalMeleeDps: context.partyOffense.totalMeleeDps,
      totalMagicDps: context.partyOffense.totalMagicDps,
      totalPrimaryDps: context.partyOffense.totalPrimaryDps,
      avgMeleeDps: context.partyOffense.avgMeleeDps,
      avgMagicDps: context.partyOffense.avgMagicDps,
      avgPrimaryDps: context.partyOffense.avgPrimaryDps,
      partySize: context.partySize,
    };
  }
  if (negation) {
    metrics.bossNegation = { ...negation };
  }
  const preview = buildBossPreview(bossCharacter, context.equipmentMap, metrics);
  return {
    character: bossCharacter,
    preview,
    metrics,
    genome: normalizeGenome(finalChampion.genome, context),
    partnerGenome:
      finalPartner && finalPartner.genome
        ? normalizeGenome(finalPartner.genome, context)
        : null,
  };
}

module.exports = { generateDungeonBoss };
