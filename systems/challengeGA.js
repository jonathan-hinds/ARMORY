const ChallengeStateModel = require('../models/ChallengeState');
const CharacterModel = require('../models/Character');
const {
  serializeCharacter,
  ensureEquipmentShape,
  EQUIPMENT_SLOTS,
  STATS,
} = require('../models/utils');
const { getAbilities } = require('./abilityService');
const { getEquipmentMap } = require('./equipmentService');
const { runCombat } = require('./combatEngine');
const { compute } = require('./derivedStats');
const { xpForNextLevel } = require('./characterService');

const MIN_POPULATION_SIZE = 10;
const POPULATION_STEP = 10;
const MAX_POPULATION_SIZE = 100;
const MUTATION_RATE = 0.2;
const GEAR_MUTATION_RATE = 0.25;
const MAX_ROTATION_LENGTH = 6;
const BASE_REWARD_XP_PCT = 0.04;
const REWARD_MULTIPLIER_STEP = 0.15;
const BASE_GOLD_REWARD = 12;

const NAME_POOL = [
  'Nemesis',
  'Specter',
  'Warden',
  'Revenant',
  'Apex',
  'Ravager',
  'Shade',
  'Arbiter',
  'Phantom',
  'Harbinger',
];

function clone(value) {
  return JSON.parse(JSON.stringify(value || null));
}

function createNewState(characterId) {
  return {
    characterId,
    round: 1,
    parentA: null,
    parentB: null,
    lastOutcome: null,
    lastReward: null,
    lastMetrics: null,
    updatedAt: Date.now(),
  };
}

async function getState(characterId) {
  const doc = await ChallengeStateModel.findOne({ characterId }).lean();
  if (doc) {
    return doc;
  }
  const fresh = createNewState(characterId);
  await ChallengeStateModel.create(fresh);
  return fresh;
}

async function persistState(state) {
  if (!state || typeof state.characterId !== 'number') {
    throw new Error('invalid challenge state');
  }
  const payload = JSON.parse(JSON.stringify(state));
  payload.characterId = state.characterId;
  await ChallengeStateModel.updateOne(
    { characterId: state.characterId },
    { $set: payload },
    { upsert: true }
  );
  return payload;
}

function totalAttributePoints(attributes = {}) {
  return STATS.reduce((acc, stat) => acc + (attributes[stat] || 0), 0);
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

function populationSizeForRound(round) {
  const baseRound = typeof round === 'number' && round > 0 ? round : 1;
  const increments = Math.floor((baseRound - 1) / 3);
  const target = MIN_POPULATION_SIZE + increments * POPULATION_STEP;
  return Math.max(MIN_POPULATION_SIZE, Math.min(MAX_POPULATION_SIZE, target));
}

function randomName(round, index) {
  const base = NAME_POOL[(round + index) % NAME_POOL.length];
  return `${base} ${round}.${index + 1}`;
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
  const maxLen = MAX_ROTATION_LENGTH;
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
  const maxLen = MAX_ROTATION_LENGTH;
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
  if (Math.random() < 0.4 && next.length < MAX_ROTATION_LENGTH) {
    next.push(abilityIds[randomInt(abilityIds.length)]);
  } else {
    const idx = randomInt(next.length);
    next[idx] = abilityIds[randomInt(abilityIds.length)];
  }
  return ensureRotation(next, abilityIds);
}

function breedRotation(rotA = [], rotB = [], abilityIds) {
  const minLen = 3;
  const maxLen = MAX_ROTATION_LENGTH;
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
  if (Math.random() < GEAR_MUTATION_RATE) {
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
  const attributes = randomAttributes(context.totalPoints);
  const rotation = randomRotation(context.abilityIds);
  const equipment = randomEquipment(
    context.gearBudget,
    context.itemsBySlot,
    context.playerCosts,
    context.equipmentMap,
    options,
  );
  const basicType = randomBasicType(attributes);
  return normalizeGenome(
    {
      basicType,
      attributes,
      rotation,
      equipment,
    },
    context,
  );
}

function mutateGenome(genome, context) {
  const attributes = { ...genome.attributes };
  const stat = STATS[randomInt(STATS.length)];
  attributes[stat] = (attributes[stat] || 0) + (Math.random() < 0.5 ? -1 : 1);
  const rotation = mutateRotation(genome.rotation || [], context.abilityIds);
  const equipment = mutateEquipment(genome.equipment || {}, context.gearBudget, context.itemsBySlot, context.playerCosts, context.equipmentMap);
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
    if (Math.random() < MUTATION_RATE) {
      value += Math.round((Math.random() - 0.5) * 2);
    }
    attributes[stat] = value;
  });
  const rotation = breedRotation(parentA.rotation || [], parentB.rotation || [], context.abilityIds);
  let equipment = breedEquipment(parentA.equipment || {}, parentB.equipment || {}, context.gearBudget, context.itemsBySlot, context.playerCosts, context.equipmentMap);
  if (Math.random() < MUTATION_RATE) {
    equipment = mutateEquipment(equipment, context.gearBudget, context.itemsBySlot, context.playerCosts, context.equipmentMap);
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

function computePlayerGear(character, equipmentMap) {
  const equipment = ensureEquipmentShape(character.equipment || {});
  const playerCosts = {};
  let gearScore = 0;
  EQUIPMENT_SLOTS.forEach(slot => {
    const id = equipment[slot];
    const item = id ? equipmentMap.get(id) : null;
    const cost = item && typeof item.cost === 'number' ? item.cost : 0;
    playerCosts[slot] = cost;
    gearScore += cost;
  });
  return { gearScore, playerCosts };
}

function buildAICharacter(genome, baseCharacter, index, round, options = {}) {
  const name = options.nameOverride || genome.name || randomName(round, index);
  const stableId =
    options.stableId ||
    (genome && genome.id
      ? genome.id
      : `challenge-${baseCharacter.id}-${Date.now()}-${index}-${Math.floor(Math.random() * 1000)}`);
  return {
    id: stableId,
    name,
    attributes: clone(genome.attributes),
    basicType: genome.basicType || 'melee',
    level: baseCharacter.level || 1,
    xp: 0,
    rotation: clone(genome.rotation),
    equipment: ensureEquipmentShape(genome.equipment || {}),
  };
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

function buildOpponentPreview(character, equipmentMap, metrics) {
  if (!character) return null;
  const equipment = ensureEquipmentShape(character.equipment || {});
  const resolved = resolveEquipmentForCompute(equipment, equipmentMap);
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
    preview.metrics = {
      damageToPlayer: metrics.damageToPlayer || 0,
      duration: metrics.duration || 0,
      win: !!metrics.win,
      fitness: metrics.fitness || 0,
    };
  }
  return preview;
}

async function buildChallengeContext(characterId) {
  const characterDoc = await CharacterModel.findOne({ characterId });
  if (!characterDoc) {
    throw new Error('character not found');
  }
  if (!Array.isArray(characterDoc.rotation) || characterDoc.rotation.length < 3) {
    throw new Error('character rotation invalid');
  }

  const [abilities, equipmentMap] = await Promise.all([
    getAbilities(),
    getEquipmentMap(),
  ]);

  const abilityIds = abilities.map(a => a.id);
  const abilityMap = new Map(abilities.map(ability => [ability.id, ability]));
  const itemsBySlot = buildItemsBySlot(equipmentMap);
  const character = serializeCharacter(characterDoc);
  const playerGear = computePlayerGear(character, equipmentMap);
  const context = {
    baseCharacter: character,
    playerCharacter: character,
    abilityIds,
    abilityMap,
    equipmentMap,
    itemsBySlot,
    totalPoints: totalAttributePoints(character.attributes || {}),
    gearBudget: playerGear.gearScore,
    playerCosts: playerGear.playerCosts,
    round: 1,
  };

  return {
    characterDoc,
    character,
    abilityIds,
    abilityMap,
    equipmentMap,
    itemsBySlot,
    playerGear,
    context,
  };
}

async function prepareChallenge(characterId) {
  const [state, contextBundle] = await Promise.all([
    getState(characterId),
    buildChallengeContext(characterId),
  ]);

  const context = {
    ...contextBundle.context,
    round: state.round || 1,
  };

  return {
    ...contextBundle,
    context,
    state,
  };
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
  return { champion, partner, evaluations };
}

function buildChallengePayload(state, level) {
  const round = state && state.round ? state.round : 1;
  return {
    round,
    rewards: rewardForRound(round, level || 1),
    nextRewards: rewardForRound(round + 1, level || 1),
    lastOutcome: state ? state.lastOutcome || null : null,
    lastReward: state ? state.lastReward || null : null,
    lastMetrics: state ? state.lastMetrics || null : null,
    opponent: state && state.currentOpponent ? state.currentOpponent.preview || null : null,
  };
}

function sumDamage(log, predicate) {
  if (!Array.isArray(log)) return 0;
  return log.reduce((acc, entry) => {
    if (!entry || entry.kind !== 'damage') return acc;
    if (!predicate(entry)) return acc;
    return acc + (entry.amount || 0);
  }, 0);
}

function evaluateFitness({ damageToPlayer, duration, win, remainingHealth }) {
  let score = damageToPlayer * 2 + duration * 8;
  if (win) score += 400;
  if (remainingHealth) score += remainingHealth * 0.5;
  return score;
}

async function evaluateGenome(genome, index, context) {
  const aiCharacter = buildAICharacter(genome, context.baseCharacter, index, context.round);
  const playerClone = clone(context.playerCharacter);
  const aiClone = clone(aiCharacter);
  const result = await runCombat(playerClone, aiClone, context.abilityMap, context.equipmentMap, { fastForward: true });
  const playerId = context.playerCharacter.id;
  const aiId = aiCharacter.id;
  const damageToPlayer = sumDamage(result.log, entry => String(entry.targetId) === String(playerId));
  const remainingHealth =
    result.finalA && String(result.finalA.id) === String(aiId)
      ? result.finalA.health
      : result.finalB && String(result.finalB.id) === String(aiId)
      ? result.finalB.health
      : 0;
  const fitness = evaluateFitness({
    damageToPlayer,
    duration: result.duration || 0,
    win: result.winnerId === aiId,
    remainingHealth,
  });
  return {
    genome,
    fitness,
    damageToPlayer,
    duration: result.duration || 0,
    win: result.winnerId === aiId,
    character: aiCharacter,
  };
}

async function generatePopulation(context, parentA, parentB) {
  const population = [];
  if (parentA) population.push(normalizeGenome(parentA, context));
  if (parentB) population.push(normalizeGenome(parentB, context));
  const targetSize = Math.max(populationSizeForRound(context.round), population.length || 0);
  while (population.length < targetSize) {
    if (parentA && parentB) {
      if (Math.random() < 0.2) {
        population.push(randomGenome(context));
      } else if (Math.random() < 0.3) {
        population.push(mutateGenome(parentA, context));
      } else if (Math.random() < 0.3) {
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
      population.push(randomGenome(context, { forceEmpty: true }));
    }
  }
  return population;
}

function rewardForRound(round, level) {
  const multiplier = 1 + (Math.max(1, round) - 1) * REWARD_MULTIPLIER_STEP;
  const xpBase = xpForNextLevel(level || 1) * BASE_REWARD_XP_PCT;
  const xpGain = Math.max(5, Math.round(xpBase * multiplier));
  const goldGain = Math.max(3, Math.round(BASE_GOLD_REWARD * multiplier));
  return { multiplier, xpGain, goldGain };
}

async function getChallengeStatus(characterId) {
  const prep = await prepareChallenge(characterId);
  let state = prep.state;
  if (state.currentOpponent && state.currentOpponent.character && !state.currentOpponent.preview) {
    const preview = buildOpponentPreview(
      state.currentOpponent.character,
      prep.equipmentMap,
      state.currentOpponent.metrics || null,
    );
    const nextState = {
      ...state,
      currentOpponent: {
        ...state.currentOpponent,
        preview,
      },
      updatedAt: Date.now(),
    };
    await persistState(nextState);
    state = nextState;
  }
  return buildChallengePayload(state, prep.characterDoc.level || 1);
}

async function startChallenge(characterId, options = {}) {
  const prep = await prepareChallenge(characterId);
  const state = prep.state;
  const force = !!options.force;

  if (state.currentOpponent && state.currentOpponent.character && !force) {
    return buildChallengePayload(state, prep.characterDoc.level || 1);
  }

  const parentA = state.parentA ? normalizeGenome(state.parentA, prep.context) : null;
  const parentB = state.parentB ? normalizeGenome(state.parentB, prep.context) : null;
  const { champion, partner } = await findChampion(prep.context, parentA, parentB);

  const stableId = `challenge-${prep.character.id}-${prep.context.round}-${Date.now()}`;
  const opponent = buildAICharacter(champion.genome, prep.character, 0, prep.context.round, { stableId });
  champion.genome.name = opponent.name;

  const metrics = {
    damageToPlayer: champion.damageToPlayer,
    duration: champion.duration,
    win: champion.win,
    fitness: champion.fitness,
  };

  const preview = buildOpponentPreview(opponent, prep.equipmentMap, metrics);

  const nextState = {
    ...state,
    currentOpponent: {
      character: clone(opponent),
      genome: clone(champion.genome),
      partnerGenome: clone((partner && partner.genome) || champion.genome),
      metrics,
      preview,
    },
    updatedAt: Date.now(),
  };

  await persistState(nextState);
  return buildChallengePayload(nextState, prep.characterDoc.level || 1);
}

async function runChallengeFight(characterId, send) {
  const prep = await prepareChallenge(characterId);

  if (!prep.state.currentOpponent || !prep.state.currentOpponent.character) {
    throw new Error('no active opponent');
  }

  const opponentCharacter = clone(prep.state.currentOpponent.character);
  const rewards = rewardForRound(prep.state.round || 1, prep.character.level || 1);

  const result = await runCombat(
    clone(prep.character),
    opponentCharacter,
    prep.abilityMap,
    prep.equipmentMap,
    update => {
      if (!update) return;
      if (update.type === 'start') {
        send({ type: 'start', you: update.a, opponent: update.b, log: [] });
      } else if (update.type === 'update') {
        send({ type: 'update', you: update.a, opponent: update.b, log: update.log || [] });
      }
    },
  );

  const playerWon = String(result.winnerId) === String(prep.character.id);
  let xpGain = 0;
  let gpGain = 0;

  const consumed = result.consumedUseables || {};
  const consumedByPlayer = consumed[prep.character.id] || [];
  if (consumedByPlayer.length) {
    if (!Array.isArray(prep.characterDoc.items)) {
      prep.characterDoc.items = [];
    }
    if (!prep.characterDoc.useables) {
      prep.characterDoc.useables = { useable1: null, useable2: null };
    }
    let modifiedUseables = false;
    let itemsModified = false;
    consumedByPlayer.forEach(entry => {
      const idx = prep.characterDoc.items.indexOf(entry.itemId);
      if (idx !== -1) {
        prep.characterDoc.items.splice(idx, 1);
        itemsModified = true;
      }
      if (prep.characterDoc.useables[entry.slot] === entry.itemId) {
        const remaining = prep.characterDoc.items.filter(id => id === entry.itemId).length;
        if (remaining <= 0) {
          prep.characterDoc.useables[entry.slot] = null;
          modifiedUseables = true;
        }
      }
    });
    if (itemsModified && typeof prep.characterDoc.markModified === 'function') {
      prep.characterDoc.markModified('items');
    }
    if (modifiedUseables && typeof prep.characterDoc.markModified === 'function') {
      prep.characterDoc.markModified('useables');
    }
  }

  if (playerWon) {
    xpGain = rewards.xpGain;
    gpGain = rewards.goldGain;
    prep.characterDoc.xp = (prep.characterDoc.xp || 0) + xpGain;
    prep.characterDoc.gold = (prep.characterDoc.gold || 0) + gpGain;
  }

  await prep.characterDoc.save();

  const updatedCharacter = serializeCharacter(prep.characterDoc);

  const lastMetrics = prep.state.currentOpponent && prep.state.currentOpponent.metrics
    ? {
        damageToPlayer: prep.state.currentOpponent.metrics.damageToPlayer || 0,
        duration: prep.state.currentOpponent.metrics.duration || 0,
        win: !!prep.state.currentOpponent.metrics.win,
        fitness: prep.state.currentOpponent.metrics.fitness || 0,
      }
    : null;

  let nextState = {
    ...prep.state,
    lastOutcome: playerWon ? 'win' : 'loss',
    lastReward: playerWon ? { xp: xpGain, gold: gpGain } : null,
    lastMetrics,
    updatedAt: Date.now(),
  };

  if (playerWon) {
    nextState = {
      ...nextState,
      round: (prep.state.round || 1) + 1,
      parentA: prep.state.currentOpponent && prep.state.currentOpponent.genome
        ? clone(prep.state.currentOpponent.genome)
        : null,
      parentB: prep.state.currentOpponent && prep.state.currentOpponent.partnerGenome
        ? clone(prep.state.currentOpponent.partnerGenome)
        : prep.state.currentOpponent && prep.state.currentOpponent.genome
        ? clone(prep.state.currentOpponent.genome)
        : null,
    };

    const updatedGear = computePlayerGear(updatedCharacter, prep.equipmentMap);
    const nextContext = {
      ...prep.context,
      baseCharacter: updatedCharacter,
      playerCharacter: updatedCharacter,
      totalPoints: totalAttributePoints(updatedCharacter.attributes || {}),
      gearBudget: updatedGear.gearScore,
      playerCosts: updatedGear.playerCosts,
      round: nextState.round,
    };

    const normalizedA = nextState.parentA ? normalizeGenome(nextState.parentA, nextContext) : null;
    const normalizedB = nextState.parentB ? normalizeGenome(nextState.parentB, nextContext) : null;
    const { champion: nextChampion, partner: nextPartner } = await findChampion(nextContext, normalizedA, normalizedB);

    const nextStableId = `challenge-${updatedCharacter.id}-${nextContext.round}-${Date.now()}`;
    const nextOpponent = buildAICharacter(nextChampion.genome, updatedCharacter, 0, nextContext.round, {
      stableId: nextStableId,
    });
    nextChampion.genome.name = nextOpponent.name;

    const nextMetrics = {
      damageToPlayer: nextChampion.damageToPlayer,
      duration: nextChampion.duration,
      win: nextChampion.win,
      fitness: nextChampion.fitness,
    };
    const nextPreview = buildOpponentPreview(nextOpponent, prep.equipmentMap, nextMetrics);

    nextState.currentOpponent = {
      character: clone(nextOpponent),
      genome: clone(nextChampion.genome),
      partnerGenome: clone((nextPartner && nextPartner.genome) || nextChampion.genome),
      metrics: nextMetrics,
      preview: nextPreview,
    };
  } else {
    nextState = {
      ...nextState,
      round: 1,
      parentA: null,
      parentB: null,
      currentOpponent: null,
    };
  }

  await persistState(nextState);

  send({
    type: 'end',
    winnerId: result.winnerId,
    xpGain,
    gpGain,
    character: updatedCharacter,
    gold: updatedCharacter.gold,
    challenge: buildChallengePayload(nextState, updatedCharacter.level || 1),
  });
}

module.exports = {
  getChallengeStatus,
  startChallenge,
  runChallengeFight,
  rewardForRound,
  buildChallengeContext,
  findChampion,
  buildAICharacter,
  buildOpponentPreview,
  normalizeGenome,
  computePlayerGear,
};
