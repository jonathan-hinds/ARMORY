const { ensureEquipmentShape, EQUIPMENT_SLOTS, STATS } = require('../models/utils');
const { compute } = require('./derivedStats');
const { runDungeonCombat } = require('./combatEngine');

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

function ensureRotation(rotation, abilityIds) {
  const validIds = new Set(abilityIds || []);
  const cleaned = Array.isArray(rotation) ? rotation.filter(id => validIds.has(id)) : [];
  const minLen = 3;
  const maxLen = 6;
  while (cleaned.length < minLen && abilityIds.length) {
    cleaned.push(abilityIds[randomInt(abilityIds.length)]);
  }
  if (cleaned.length > maxLen) {
    cleaned.length = maxLen;
  }
  return cleaned;
}

function randomRotation(abilityIds) {
  const minLen = 3;
  const maxLen = 6;
  const length = minLen + randomInt(Math.max(1, maxLen - minLen + 1));
  const rotation = [];
  for (let i = 0; i < length; i += 1) {
    rotation.push(abilityIds[randomInt(abilityIds.length)]);
  }
  return ensureRotation(rotation, abilityIds);
}

function mutateRotation(rotation, abilityIds) {
  const next = Array.isArray(rotation) ? rotation.slice() : [];
  if (!next.length) return randomRotation(abilityIds);
  if (Math.random() < 0.4 && next.length < 6) {
    next.push(abilityIds[randomInt(abilityIds.length)]);
  } else {
    const idx = randomInt(next.length);
    next[idx] = abilityIds[randomInt(abilityIds.length)];
  }
  return ensureRotation(next, abilityIds);
}

function breedRotation(rotA = [], rotB = [], abilityIds) {
  const minLen = 3;
  const maxLen = 6;
  const avgLength = Math.round((rotA.length + rotB.length) / 2) || minLen;
  const length = Math.max(minLen, Math.min(maxLen, avgLength + (randomInt(3) - 1)));
  const rotation = [];
  for (let i = 0; i < length; i += 1) {
    let abilityId = null;
    if (rotA.length && Math.random() < 0.5) {
      abilityId = rotA[i % rotA.length];
    }
    if (!abilityId && rotB.length && Math.random() < 0.7) {
      abilityId = rotB[i % rotB.length];
    }
    if (!abilityId) {
      abilityId = abilityIds[randomInt(abilityIds.length)];
    }
    rotation.push(abilityId);
  }
  return ensureRotation(rotation, abilityIds);
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

function normalizeGenome(genome, context) {
  const { totalPoints, abilityIds, gearBudget, itemsBySlot, playerCosts, equipmentMap } = context;
  const attributes = adjustAttributes(genome && genome.attributes ? genome.attributes : {}, totalPoints);
  const rotation = ensureRotation(genome && genome.rotation ? genome.rotation : [], abilityIds);
  const equipment = sanitizeEquipment(genome && genome.equipment ? genome.equipment : {}, gearBudget, equipmentMap);
  let basicType = genome && genome.basicType === 'magic' ? 'magic' : 'melee';
  if (!genome || !genome.basicType) {
    basicType = randomBasicType(attributes);
  }
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
  const rotation = randomRotation(abilityIds);
  const equipment = randomEquipment(gearBudget, itemsBySlot, playerCosts, equipmentMap, options);
  const basicType = randomBasicType(attributes);
  return normalizeGenome({ attributes, rotation, equipment, basicType }, context);
}

function mutateGenome(genome, context) {
  const attributes = { ...genome.attributes };
  const stat = STATS[randomInt(STATS.length)];
  attributes[stat] = (attributes[stat] || 0) + (Math.random() < 0.5 ? -1 : 1);
  const rotation = mutateRotation(genome.rotation || [], context.abilityIds);
  const equipment = mutateEquipment(
    genome.equipment || {},
    context.gearBudget,
    context.itemsBySlot,
    context.playerCosts,
    context.equipmentMap,
  );
  const basicType = Math.random() < 0.3 ? (genome.basicType === 'magic' ? 'melee' : 'magic') : genome.basicType;
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
  const rotation = breedRotation(parentA.rotation || [], parentB.rotation || [], context.abilityIds);
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
    basicType = parentA.basicType;
  } else if (Math.random() < 0.5) {
    basicType = parentB.basicType;
  } else {
    basicType = randomBasicType(attributes);
  }
  return normalizeGenome({ basicType, attributes, rotation, equipment }, context);
}

function computePartyProfile(party, equipmentMap) {
  if (!Array.isArray(party) || !party.length) {
    return {
      avgPoints: 0,
      avgLevel: 1,
      avgGear: 0,
      avgSlotCosts: {},
    };
  }
  let totalPoints = 0;
  let totalLevel = 0;
  let totalGear = 0;
  const slotTotals = {};
  party.forEach(character => {
    totalPoints += totalAttributePoints(character.attributes || {});
    totalLevel += character.level || 1;
    const equipment = ensureEquipmentShape(character.equipment || {});
    EQUIPMENT_SLOTS.forEach(slot => {
      const id = equipment[slot];
      const item = id ? equipmentMap.get(id) : null;
      const cost = item && typeof item.cost === 'number' ? item.cost : 0;
      totalGear += cost;
      slotTotals[slot] = (slotTotals[slot] || 0) + cost;
    });
  });
  const avgSlotCosts = {};
  EQUIPMENT_SLOTS.forEach(slot => {
    avgSlotCosts[slot] = Math.round((slotTotals[slot] || 0) / Math.max(1, party.length));
  });
  return {
    avgPoints: totalPoints / party.length,
    avgLevel: totalLevel / party.length,
    avgGear: totalGear / party.length,
    avgSlotCosts,
  };
}

function buildDungeonContext(party, abilityMap, equipmentMap, options = {}) {
  const profile = computePartyProfile(party, equipmentMap);
  const partySize = Math.max(1, party.length || 1);
  const abilityIds = Array.from(abilityMap.keys());
  const itemsBySlot = buildItemsBySlot(equipmentMap);
  const pointScale = 1.2 + Math.max(0, partySize - 2) * 0.08;
  const gearScale = 1.3 + Math.max(0, partySize - 2) * 0.18;
  const totalPoints = Math.max(30, Math.round(profile.avgPoints * pointScale));
  const gearBudget = Math.max(80, Math.round(profile.avgGear * gearScale));
  const targetDuration = 40 + partySize * 12;

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
    generations: options.generations || 4,
  };
}

function randomName(index) {
  const base = NAME_POOL[index % NAME_POOL.length];
  return `${base} ${Math.floor(Math.random() * 900 + 100)}`;
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
  return preview;
}

function evaluateFitness(metrics, context, result) {
  const damageScore = (metrics.damageToParty || 0) * 1.8;
  const survivalScore = (metrics.bossHealthRemaining || 0) * 1.1;
  const downedScore = (metrics.partyMembersDowned || 0) * 140;
  const durationScore = Math.min(metrics.duration || 0, context.targetDuration) * 6;
  const threatScoreValue = (metrics.threatSwaps || 0) * 4;
  const bossDamagePenalty = (metrics.damageToBoss || 0) * 0.6;
  const winBonus = result.winnerSide === 'boss' ? 450 : 0;
  const lossPenalty = result.winnerSide === 'party' ? 120 : 0;
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

async function generatePopulation(context, parentA, parentB) {
  const population = [];
  if (parentA) population.push(normalizeGenome(parentA, context));
  if (parentB) population.push(normalizeGenome(parentB, context));
  const targetSize = Math.max(18, population.length || 0);
  while (population.length < targetSize) {
    if (parentA && parentB) {
      if (Math.random() < 0.25) {
        population.push(randomGenome(context));
      } else if (Math.random() < 0.35) {
        population.push(mutateGenome(parentA, context));
      } else if (Math.random() < 0.35) {
        population.push(mutateGenome(parentB, context));
      } else {
        population.push(breedGenomes(parentA, parentB, context));
      }
    } else if (parentA || parentB) {
      const seed = parentA || parentB;
      if (Math.random() < 0.6) {
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

async function findChampion(context, parentA, parentB) {
  const population = await generatePopulation(context, parentA, parentB);
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
  const context = buildDungeonContext(party, abilityMap, equipmentMap, options);
  context.party = party;
  let parentA = null;
  let parentB = null;
  let finalChampion = null;
  for (let gen = 0; gen < context.generations; gen += 1) {
    const { champion, partner } = await findChampion(context, parentA, parentB);
    finalChampion = champion;
    parentA = champion.genome;
    parentB = partner.genome;
  }
  const bossCharacter = buildBossCharacter(finalChampion.genome, context, 0);
  finalChampion.genome.name = bossCharacter.name;
  const preview = buildBossPreview(bossCharacter, context.equipmentMap, finalChampion.metrics);
  return {
    character: bossCharacter,
    preview,
    metrics: finalChampion.metrics,
  };
}

module.exports = { generateDungeonBoss };
