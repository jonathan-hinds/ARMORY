const path = require('path');
const CharacterModel = require('../models/Character');
const {
  serializeCharacter,
  readMaterialCount,
  formatItemInstanceId,
  parseItemInstanceId,
} = require('../models/utils');
const { readJSON } = require('../store/jsonStore');
const { getEquipmentMap } = require('./equipmentService');
const { getMaterialCatalog } = require('./materialService');

const DATA_DIR = path.join(__dirname, '..', 'data');
const JOB_CONFIG_FILE = path.join(DATA_DIR, 'jobConfig.json');
const JOB_RECIPE_FILE = path.join(DATA_DIR, 'jobRecipes.json');

const DEFAULT_CONFIG = {
  hourSeconds: 3600,
  craftsPerHour: 3,
  statGainChance: 0.05,
  statGainAmount: 1,
  logLimit: 30,
  materialRecoveryEnabled: true,
  materialRecoveryChanceMultiplier: 1,
  rarityWeights: {
    Common: 6,
    Uncommon: 3,
    Rare: 1,
    Epic: 1,
    Legendary: 1,
  },
};

let configCache = null;
let recipeCache = null;

function clone(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function normalizeDateValue(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

function sanitizePositiveInteger(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return 0;
  }
  const rounded = Math.round(num);
  return rounded > 0 ? rounded : 0;
}

function normalizeMaterials(materials) {
  const result = {};
  if (!materials || typeof materials !== 'object') {
    return result;
  }
  Object.entries(materials).forEach(([id, qty]) => {
    if (!id) return;
    const count = sanitizePositiveInteger(qty);
    if (count > 0) {
      result[id] = count;
    }
  });
  return result;
}

function normalizeAttributeMap(attributes) {
  const result = {};
  if (!attributes || typeof attributes !== 'object') {
    return result;
  }
  let source = attributes;
  if (typeof source.toObject === 'function') {
    source = source.toObject();
  } else if (source._doc && typeof source._doc === 'object') {
    source = source._doc;
  }
  if (!source || typeof source !== 'object') {
    return result;
  }
  Object.entries(source).forEach(([key, value]) => {
    if (!key) {
      return;
    }
    const normalizedKey = typeof key === 'string' ? key.trim().toLowerCase() : null;
    if (!normalizedKey) {
      return;
    }
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) {
      result[normalizedKey] = numeric;
    }
  });
  return result;
}

function normalizeRarityWeights(source, fallback = {}) {
  const result = { ...fallback };
  if (!source || typeof source !== 'object') {
    return result;
  }
  Object.entries(source).forEach(([rarity, weight]) => {
    const numeric = Number(weight);
    if (Number.isFinite(numeric) && numeric > 0) {
      result[rarity] = numeric;
    }
  });
  return result;
}

function normalizeJobItem(entry) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }
  const itemId = typeof entry.itemId === 'string' ? entry.itemId.trim() : '';
  if (!itemId) {
    return null;
  }
  const materials = normalizeMaterials(entry.materials);
  const weightValue = Number(entry.weight);
  const weight = Number.isFinite(weightValue) && weightValue > 0 ? weightValue : null;
  return {
    itemId,
    materials,
    weight,
  };
}

function normalizeJob(entry, baseConfig) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }
  const idRaw = typeof entry.id === 'string' ? entry.id.trim().toLowerCase() : '';
  if (!idRaw) {
    return null;
  }
  const name = typeof entry.name === 'string' && entry.name.trim() ? entry.name.trim() : null;
  const attributeRaw = typeof entry.attribute === 'string' ? entry.attribute.trim().toLowerCase() : '';
  const attribute = attributeRaw || null;
  const description = typeof entry.description === 'string' ? entry.description : '';
  const category = typeof entry.category === 'string' ? entry.category : null;
  const craftsPerHourValue = Number(entry.craftsPerHour);
  const craftsPerHour = Number.isFinite(craftsPerHourValue) && craftsPerHourValue > 0
    ? Math.round(craftsPerHourValue)
    : baseConfig.craftsPerHour;
  const statGainChanceValue = Number(entry.statGainChance);
  const statGainChance = Number.isFinite(statGainChanceValue)
    ? Math.max(0, Math.min(1, statGainChanceValue))
    : baseConfig.statGainChance;
  const statGainAmountValue = Number(entry.statGainAmount);
  const statGainAmount = Number.isFinite(statGainAmountValue) && statGainAmountValue > 0
    ? Math.round(statGainAmountValue)
    : baseConfig.statGainAmount;
  const rarityWeights = normalizeRarityWeights(entry.rarityWeights, baseConfig.rarityWeights);
  const materialRecoveryEnabled = entry.materialRecoveryEnabled != null
    ? !!entry.materialRecoveryEnabled
    : baseConfig.materialRecoveryEnabled;
  const materialRecoveryChanceMultiplierValue = Number(entry.materialRecoveryChanceMultiplier);
  const materialRecoveryChanceMultiplier = Number.isFinite(materialRecoveryChanceMultiplierValue)
    && materialRecoveryChanceMultiplierValue >= 0
    ? materialRecoveryChanceMultiplierValue
    : baseConfig.materialRecoveryChanceMultiplier;
  const typeRaw = typeof entry.type === 'string' ? entry.type.trim().toLowerCase() : null;
  const itemsRaw = Array.isArray(entry.items) ? entry.items : [];
  const items = itemsRaw.map(normalizeJobItem).filter(Boolean);
  const hourSeconds = baseConfig.hourSeconds > 0 ? baseConfig.hourSeconds : DEFAULT_CONFIG.hourSeconds;
  const effectiveCraftsPerHour = craftsPerHour > 0 ? craftsPerHour : DEFAULT_CONFIG.craftsPerHour;
  const craftIntervalSeconds = hourSeconds / effectiveCraftsPerHour;
  return {
    id: idRaw,
    name: name || idRaw,
    attribute,
    description,
    category,
    type: typeRaw || 'standard',
    items,
    rarityWeights,
    materialRecoveryEnabled,
    materialRecoveryChanceMultiplier,
    craftsPerHour: effectiveCraftsPerHour,
    statGainChance,
    statGainAmount,
    craftIntervalSeconds,
  };
}

function normalizeConfig(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const hourSecondsValue = Number(source.hourSeconds);
  const hourSeconds = Number.isFinite(hourSecondsValue) && hourSecondsValue > 0
    ? hourSecondsValue
    : DEFAULT_CONFIG.hourSeconds;
  const craftsPerHourValue = Number(source.craftsPerHour);
  const craftsPerHour = Number.isFinite(craftsPerHourValue) && craftsPerHourValue > 0
    ? Math.round(craftsPerHourValue)
    : DEFAULT_CONFIG.craftsPerHour;
  const statGainChanceValue = Number(source.statGainChance);
  const statGainChance = Number.isFinite(statGainChanceValue)
    ? Math.max(0, Math.min(1, statGainChanceValue))
    : DEFAULT_CONFIG.statGainChance;
  const statGainAmountValue = Number(source.statGainAmount);
  const statGainAmount = Number.isFinite(statGainAmountValue) && statGainAmountValue > 0
    ? Math.round(statGainAmountValue)
    : DEFAULT_CONFIG.statGainAmount;
  const logLimitValue = Number(source.logLimit);
  const logLimit = Number.isFinite(logLimitValue) && logLimitValue >= 5
    ? Math.round(logLimitValue)
    : DEFAULT_CONFIG.logLimit;
  const materialRecoveryEnabled = source.materialRecoveryEnabled != null
    ? !!source.materialRecoveryEnabled
    : DEFAULT_CONFIG.materialRecoveryEnabled;
  const materialRecoveryChanceMultiplierValue = Number(source.materialRecoveryChanceMultiplier);
  const materialRecoveryChanceMultiplier = Number.isFinite(materialRecoveryChanceMultiplierValue)
    && materialRecoveryChanceMultiplierValue >= 0
    ? materialRecoveryChanceMultiplierValue
    : DEFAULT_CONFIG.materialRecoveryChanceMultiplier;
  const rarityWeights = normalizeRarityWeights(source.rarityWeights, DEFAULT_CONFIG.rarityWeights);
  const base = {
    hourSeconds,
    craftsPerHour,
    statGainChance,
    statGainAmount,
    logLimit,
    materialRecoveryEnabled,
    materialRecoveryChanceMultiplier,
    rarityWeights,
  };
  const jobsRaw = Array.isArray(source.jobs) ? source.jobs : [];
  const seen = new Set();
  const jobs = [];
  jobsRaw.forEach(entry => {
    const job = normalizeJob(entry, base);
    if (job && !seen.has(job.id)) {
      seen.add(job.id);
      jobs.push(job);
    }
  });
  return { ...base, jobs };
}

function normalizeRecipeMap(raw) {
  const map = new Map();
  if (!raw || typeof raw !== 'object') {
    return map;
  }
  const source = raw.recipes && typeof raw.recipes === 'object' ? raw.recipes : raw;
  Object.entries(source).forEach(([jobId, entries]) => {
    if (!jobId || !Array.isArray(entries)) {
      return;
    }
    const key = String(jobId).trim().toLowerCase();
    if (!key) {
      return;
    }
    const list = entries.map(normalizeJobItem).filter(Boolean);
    map.set(key, list);
  });
  return map;
}

async function loadJobRecipes() {
  if (!recipeCache) {
    let raw;
    try {
      raw = await readJSON(JOB_RECIPE_FILE);
    } catch (err) {
      raw = {};
    }
    recipeCache = normalizeRecipeMap(raw);
  }
  return recipeCache;
}

async function loadJobConfig() {
  if (!configCache) {
    let raw;
    try {
      raw = await readJSON(JOB_CONFIG_FILE);
    } catch (err) {
      raw = {};
    }
    const normalized = normalizeConfig(raw);
    const recipes = await loadJobRecipes();
    const mergedJobs = normalized.jobs
      .map(job => {
        const recipeList = recipes.get(job.id) || job.items || [];
        const items = Array.isArray(recipeList) ? recipeList.map(normalizeJobItem).filter(Boolean) : [];
        if (!items.length) {
          return null;
        }
        return { ...job, items };
      })
      .filter(Boolean);
    const jobsById = new Map(mergedJobs.map(job => [job.id, job]));
    configCache = { ...normalized, jobs: mergedJobs, jobsById };
  }
  return configCache;
}

function ensureJobState(characterDoc) {
  if (!characterDoc.job || typeof characterDoc.job !== 'object') {
    characterDoc.job = {};
  }
  const jobState = characterDoc.job;
  if (typeof jobState.isWorking !== 'boolean') {
    jobState.isWorking = !!(jobState.jobId && jobState.startedAt);
  }
  const startedAt = normalizeDateValue(jobState.startedAt);
  if (startedAt && jobState.startedAt !== startedAt) {
    jobState.startedAt = startedAt;
  }
  const lastProcessedAt = normalizeDateValue(jobState.lastProcessedAt);
  if (lastProcessedAt && jobState.lastProcessedAt !== lastProcessedAt) {
    jobState.lastProcessedAt = lastProcessedAt;
  }
  const workingSince = normalizeDateValue(jobState.workingSince);
  if (jobState.isWorking) {
    if (!workingSince && (startedAt || lastProcessedAt)) {
      jobState.workingSince = lastProcessedAt || startedAt;
    } else if (workingSince && jobState.workingSince !== workingSince) {
      jobState.workingSince = workingSince;
    }
  } else if (jobState.workingSince) {
    jobState.workingSince = null;
  }
  if (!jobState.statGains || typeof jobState.statGains !== 'object') {
    jobState.statGains = {};
  }
  if (!jobState.totalsByItem || typeof jobState.totalsByItem !== 'object') {
    jobState.totalsByItem = {};
  }
  if (!Array.isArray(jobState.log)) {
    jobState.log = [];
  }
  if (!Number.isFinite(jobState.totalAttempts)) {
    jobState.totalAttempts = 0;
  }
  if (!Number.isFinite(jobState.totalCrafted)) {
    jobState.totalCrafted = 0;
  }
  if (!Number.isFinite(jobState.totalStatGain)) {
    jobState.totalStatGain = 0;
  }
  if (!jobState.blacksmith || typeof jobState.blacksmith !== 'object') {
    jobState.blacksmith = { mode: 'craft', salvageQueue: [] };
  }
  if (jobState.blacksmith.mode !== 'salvage') {
    jobState.blacksmith.mode = 'craft';
  }
  if (!Array.isArray(jobState.blacksmith.salvageQueue)) {
    jobState.blacksmith.salvageQueue = [];
  } else {
    jobState.blacksmith.salvageQueue = jobState.blacksmith.salvageQueue
      .map(entry => (typeof entry === 'string' ? entry : null))
      .filter(Boolean);
  }
  return jobState;
}

function isBlacksmithJob(jobDef) {
  return jobDef && jobDef.type === 'blacksmith';
}

function getBlacksmithState(jobState) {
  return jobState && typeof jobState === 'object' && jobState.blacksmith
    ? jobState.blacksmith
    : { mode: 'craft', salvageQueue: [] };
}

function setMaterialCount(container, id, value) {
  if (!container || !id) {
    return;
  }
  const numeric = Math.max(0, Math.round(Number(value) || 0));
  if (typeof container.set === 'function') {
    if (numeric > 0) {
      container.set(id, numeric);
    } else if (typeof container.delete === 'function') {
      container.delete(id);
    } else {
      delete container[id];
    }
  } else if (numeric > 0) {
    container[id] = numeric;
  } else {
    delete container[id];
  }
}

function calculateMaterialRecoveryChance(characterDoc, jobDef, config) {
  if (!characterDoc || !jobDef || !config) {
    return { allowed: false, chance: null, share: 0, multiplier: 0 };
  }
  const enabled = jobDef.materialRecoveryEnabled != null
    ? !!jobDef.materialRecoveryEnabled
    : !!config.materialRecoveryEnabled;
  if (!enabled) {
    return { allowed: false, chance: null, share: 0, multiplier: 0 };
  }
  const attribute = jobDef.attribute;
  if (!attribute) {
    return { allowed: false, chance: null, share: 0, multiplier: 0 };
  }
  const attributes = normalizeAttributeMap(characterDoc.attributes);
  const totalAttributes = Object.values(attributes).reduce((sum, value) => sum + value, 0);
  const multiplierSource = jobDef.materialRecoveryChanceMultiplier != null
    ? jobDef.materialRecoveryChanceMultiplier
    : config.materialRecoveryChanceMultiplier;
  const multiplierNumeric = Number(multiplierSource);
  const multiplier = Number.isFinite(multiplierNumeric) && multiplierNumeric >= 0
    ? multiplierNumeric
    : 0;
  const statValue = Number.isFinite(attributes[attribute]) ? attributes[attribute] : 0;
  const rawShare = totalAttributes > 0 ? statValue / totalAttributes : 0;
  const share = Math.max(0, Math.min(1, rawShare));
  if (!(totalAttributes > 0) || !(statValue > 0)) {
    return {
      allowed: true,
      chance: 0,
      share,
      multiplier,
    };
  }
  const chance = Math.max(0, Math.min(1, share * multiplier));
  return {
    allowed: true,
    chance,
    share,
    multiplier,
  };
}

function recordJobEvent(jobState, event, logLimit) {
  const entry = {
    ...event,
    timestamp: event.timestamp ? new Date(event.timestamp) : new Date(),
    materials: normalizeMaterials(event.materials),
    missing: Array.isArray(event.missing)
      ? event.missing.map(m => ({
          materialId: typeof m.materialId === 'string' ? m.materialId : null,
          required: sanitizePositiveInteger(m.required),
          available: sanitizePositiveInteger(m.available),
        })).filter(m => m.materialId)
      : undefined,
    generatedMaterials: Array.isArray(event.generatedMaterials)
      ? event.generatedMaterials
          .map(m => ({
            materialId: typeof m.materialId === 'string' ? m.materialId : null,
            amount: sanitizePositiveInteger(m.amount),
          }))
          .filter(m => m.materialId && m.amount > 0)
      : undefined,
    recoveredMaterials: Array.isArray(event.recoveredMaterials)
      ? event.recoveredMaterials
          .map(m => ({
            materialId: typeof m.materialId === 'string' ? m.materialId : null,
            amount: sanitizePositiveInteger(m.amount),
          }))
          .filter(m => m.materialId && m.amount > 0)
      : undefined,
    variantId: typeof event.variantId === 'string' ? event.variantId : null,
    bonusAttributes: event.bonusAttributes ? sanitizeNumberMap(event.bonusAttributes) : undefined,
  };
  const chanceValue = Number(event.generationChance);
  if (Number.isFinite(chanceValue) && chanceValue >= 0) {
    entry.generationChance = Math.max(0, Math.min(1, chanceValue));
  }
  const rollValue = Number(event.generationRoll);
  if (Number.isFinite(rollValue) && rollValue >= 0) {
    entry.generationRoll = Math.max(0, Math.min(1, rollValue));
  }
  if (event.generationShare != null) {
    const shareValue = Number(event.generationShare);
    if (Number.isFinite(shareValue) && shareValue >= 0) {
      entry.generationShare = Math.max(0, Math.min(1, shareValue));
    }
  }
  if (event.generationMultiplier != null) {
    const multiplierValue = Number(event.generationMultiplier);
    if (Number.isFinite(multiplierValue) && multiplierValue >= 0) {
      entry.generationMultiplier = multiplierValue;
    }
  }
  if (event.generationAttribute != null) {
    entry.generationAttribute = event.generationAttribute;
  }
  if (event.generationAttempted != null) {
    entry.generationAttempted = !!event.generationAttempted;
  } else if (entry.generationChance != null) {
    entry.generationAttempted = true;
  }
  if (event.generationSucceeded != null) {
    entry.generationSucceeded = !!event.generationSucceeded;
  }
  jobState.log.push(entry);
  if (jobState.log.length > logLimit) {
    jobState.log.splice(0, jobState.log.length - logLimit);
  }
}

function pickJobItem(job, equipmentMap, config) {
  const entries = [];
  job.items.forEach(jobItem => {
    const item = equipmentMap.get(jobItem.itemId) || null;
    const rarity = item && item.rarity ? item.rarity : null;
    let weight = jobItem.weight;
    if (weight == null) {
      if (rarity && job.rarityWeights[rarity] != null) {
        weight = job.rarityWeights[rarity];
      } else if (rarity && config.rarityWeights[rarity] != null) {
        weight = config.rarityWeights[rarity];
      } else {
        weight = 1;
      }
    }
    const numericWeight = Number(weight);
    if (!Number.isFinite(numericWeight) || numericWeight <= 0) {
      return;
    }
    entries.push({ jobItem, item, weight: numericWeight });
  });
  if (!entries.length) {
    return null;
  }
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  if (!(total > 0)) {
    return null;
  }
  let roll = Math.random() * total;
  for (const entry of entries) {
    roll -= entry.weight;
    if (roll <= 0) {
      return entry;
    }
  }
  return entries[entries.length - 1];
}

function pickWeightedEntry(entries) {
  if (!Array.isArray(entries) || !entries.length) {
    return null;
  }
  const total = entries.reduce((sum, entry) => sum + (Number(entry.weight) || 0), 0);
  if (!(total > 0)) {
    return null;
  }
  let roll = Math.random() * total;
  for (const entry of entries) {
    const weight = Number(entry.weight) || 0;
    roll -= weight;
    if (roll <= 0) {
      return entry;
    }
  }
  return entries[entries.length - 1];
}

async function processJobForCharacter(characterDoc, options = {}) {
  if (!characterDoc) {
    return { changed: false, job: null, attempts: 0 };
  }
  const config = options.config || (await loadJobConfig());
  const jobState = ensureJobState(characterDoc);
  const jobId = typeof jobState.jobId === 'string' ? jobState.jobId : null;
  if (!jobId) {
    return { changed: false, job: null, attempts: 0 };
  }
  const jobDef = config.jobsById.get(jobId);
  if (!jobDef) {
    return { changed: false, job: null, attempts: 0 };
  }
  const jobAttribute = jobDef.attribute && jobDef.attribute.trim ? jobDef.attribute.trim() : null;
  const now = options.now ? new Date(options.now) : new Date();
  let jobChanged = false;
  if (!jobState.isWorking) {
    return { changed: false, job: jobDef, attempts: 0 };
  }
  if (!jobState.startedAt) {
    jobState.startedAt = now;
    jobChanged = true;
  }
  if (!jobState.workingSince) {
    jobState.workingSince = now;
    jobChanged = true;
  }
  if (!jobState.lastProcessedAt) {
    jobState.lastProcessedAt = jobState.startedAt;
    jobChanged = true;
  }
  let lastProcessed = jobState.lastProcessedAt ? new Date(jobState.lastProcessedAt) : now;
  if (Number.isNaN(lastProcessed.getTime())) {
    lastProcessed = now;
    jobState.lastProcessedAt = now;
    jobChanged = true;
  }
  const interval = jobDef.craftIntervalSeconds > 0
    ? jobDef.craftIntervalSeconds
    : config.hourSeconds / config.craftsPerHour;
  if (!(interval > 0)) {
    return { changed: jobChanged, job: jobDef, attempts: 0 };
  }
  let baseTime = lastProcessed && !Number.isNaN(lastProcessed.getTime()) ? lastProcessed : null;
  if (!baseTime) {
    const startedAt = jobState.startedAt ? new Date(jobState.startedAt) : null;
    baseTime = startedAt && !Number.isNaN(startedAt.getTime()) ? startedAt : now;
  }
  const elapsedSeconds = Math.max(0, (now.getTime() - baseTime.getTime()) / 1000);
  const attempts = Math.floor(elapsedSeconds / interval);
  if (attempts <= 0) {
    return { changed: jobChanged, job: jobDef, attempts: 0 };
  }
  const equipmentMap = await getEquipmentMap();
  if (!characterDoc.materials || typeof characterDoc.materials !== 'object') {
    characterDoc.materials = {};
  }
  if (!Array.isArray(characterDoc.items)) {
    characterDoc.items = [];
  }
  const logLimit = config.logLimit;
  let materialsChanged = false;
  let itemsChanged = false;
  let attributesChanged = false;
  let attemptsPerformed = 0;
  let lastProcessedTime = baseTime;
  const blacksmithJob = isBlacksmithJob(jobDef);
  const blacksmithState = blacksmithJob ? getBlacksmithState(jobState) : null;
  let salvagePool = null;

  for (let i = 0; i < attempts; i += 1) {
    const attemptTime = new Date(baseTime.getTime() + (i + 1) * interval * 1000);

    if (blacksmithJob && blacksmithState.mode === 'salvage') {
      if (!blacksmithState.salvageQueue.length) {
        jobState.isWorking = false;
        jobState.workingSince = null;
        jobState.lastProcessedAt = attemptTime;
        jobChanged = true;
        lastProcessedTime = attemptTime;
        break;
      }
      attemptsPerformed += 1;
      if (!salvagePool) {
        const materialCatalog = await getMaterialCatalog();
        const weightSource = {
          ...(config.rarityWeights || {}),
          ...(jobDef.rarityWeights || {}),
        };
        salvagePool = (Array.isArray(materialCatalog) ? materialCatalog : [])
          .map(material => {
            const rarity = material.rarity || 'Common';
            const weight = weightSource[rarity] != null
              ? Number(weightSource[rarity])
              : 1;
            if (!Number.isFinite(weight) || weight <= 0) {
              return null;
            }
            return { material, weight };
          })
          .filter(Boolean);
      }
      const queueIndex = Math.floor(Math.random() * blacksmithState.salvageQueue.length);
      const queuedId = blacksmithState.salvageQueue.splice(queueIndex, 1)[0];
      const parsedQueued = parseItemInstanceId(queuedId);
      const baseItemId = parsedQueued.itemId || queuedId;
      const itemForLog = equipmentMap.get(queuedId) || equipmentMap.get(baseItemId) || null;
      const event = {
        timestamp: attemptTime,
        type: 'salvaged',
        itemId: baseItemId,
        variantId: queuedId,
        itemName: itemForLog ? itemForLog.name : null,
        rarity: itemForLog ? itemForLog.rarity || null : null,
        materials: {},
      };
      const recoveredCounts = new Map();
      const drops = 2 + Math.floor(Math.random() * 3);
      for (let drop = 0; drop < drops; drop += 1) {
        const pick = pickWeightedEntry(salvagePool);
        if (!pick || !pick.material || !pick.material.id) {
          continue;
        }
        const materialId = pick.material.id;
        const current = readMaterialCount(characterDoc.materials, materialId);
        setMaterialCount(characterDoc.materials, materialId, current + 1);
        materialsChanged = true;
        recoveredCounts.set(materialId, (recoveredCounts.get(materialId) || 0) + 1);
      }
      if (recoveredCounts.size) {
        event.recoveredMaterials = Array.from(recoveredCounts.entries()).map(([materialId, amount]) => ({ materialId, amount }));
      }
      const gainChance = jobDef.statGainChance != null ? jobDef.statGainChance : config.statGainChance;
      const gainAmount = jobDef.statGainAmount != null ? jobDef.statGainAmount : config.statGainAmount;
      if (jobAttribute && gainAmount > 0 && gainChance > 0 && Math.random() < gainChance) {
        if (!characterDoc.attributes || typeof characterDoc.attributes !== 'object') {
          characterDoc.attributes = {};
        }
        const current = Number.isFinite(characterDoc.attributes[jobAttribute]) ? characterDoc.attributes[jobAttribute] : 0;
        characterDoc.attributes[jobAttribute] = current + gainAmount;
        const statTotals = jobState.statGains;
        const prevGain = Number.isFinite(statTotals[jobAttribute]) ? statTotals[jobAttribute] : 0;
        statTotals[jobAttribute] = prevGain + gainAmount;
        jobState.totalStatGain += gainAmount;
        event.stat = jobAttribute;
        event.statAmount = gainAmount;
        attributesChanged = true;
      }
      recordJobEvent(jobState, event, logLimit);
      jobChanged = true;
      lastProcessedTime = attemptTime;
      continue;
    }

    jobState.totalAttempts += 1;
    attemptsPerformed += 1;
    const selection = pickJobItem(jobDef, equipmentMap, config);
    if (!selection) {
      recordJobEvent(
        jobState,
        { timestamp: attemptTime, type: 'failed', reason: 'no-recipe' },
        logLimit
      );
      jobChanged = true;
      lastProcessedTime = attemptTime;
      continue;
    }
    const { jobItem, item } = selection;
    const recipe = jobItem.materials || {};
    const missing = [];
    let canCraft = true;
    Object.entries(recipe).forEach(([materialId, qty]) => {
      const required = sanitizePositiveInteger(qty);
      if (!required) return;
      const available = readMaterialCount(characterDoc.materials, materialId);
      if (available < required) {
        canCraft = false;
        missing.push({ materialId, required, available });
      }
    });
    let generatedMaterials = null;
    let generationChance = null;
    let generationAttempted = false;
    let generationSucceeded = false;
    let generationRoll = null;
    let generationShare = null;
    let generationMultiplier = null;
    if (!canCraft && missing.length) {
      const recovery = calculateMaterialRecoveryChance(characterDoc, jobDef, config);
      if (recovery.allowed) {
        generationAttempted = true;
        const chanceValue = Number(recovery.chance);
        generationChance = Number.isFinite(chanceValue) ? Math.max(0, Math.min(1, chanceValue)) : 0;
        const shareValue = Number(recovery.share);
        generationShare = Number.isFinite(shareValue) ? Math.max(0, Math.min(1, shareValue)) : null;
        const multiplierValue = Number(recovery.multiplier);
        generationMultiplier = Number.isFinite(multiplierValue) && multiplierValue >= 0
          ? multiplierValue
          : null;
        const roll = Math.random();
        generationRoll = roll;
        if (generationChance > 0 && roll < generationChance) {
          const recoverable = missing
            .map(entry => ({
              materialId: entry.materialId,
              deficit: entry.required - entry.available,
            }))
            .filter(entry => entry.materialId && entry.deficit > 0);
          if (recoverable.length) {
            const target = recoverable[Math.floor(Math.random() * recoverable.length)];
            const amount = 1;
            const current = readMaterialCount(characterDoc.materials, target.materialId);
            setMaterialCount(characterDoc.materials, target.materialId, current + amount);
            generatedMaterials = [{ materialId: target.materialId, amount }];
            generationSucceeded = true;
            materialsChanged = true;
          }
        }
      }
    }
    const event = {
      timestamp: attemptTime,
      type: canCraft ? 'crafted' : 'failed',
      itemId: jobItem.itemId,
      itemName: item ? item.name : null,
      rarity: item ? item.rarity || null : null,
      materials: recipe,
    };
    if (generationAttempted) {
      event.generationAttempted = true;
      if (jobAttribute) {
        event.generationAttribute = jobAttribute;
      }
    }
    if (generationChance != null) {
      event.generationChance = generationChance;
    }
    if (generationShare != null) {
      event.generationShare = generationShare;
    }
    if (generationMultiplier != null) {
      event.generationMultiplier = generationMultiplier;
    }
    if (generationRoll != null) {
      event.generationRoll = generationRoll;
    }
    if (!canCraft) {
      event.reason = 'insufficient-materials';
      event.missing = missing;
      if (generationAttempted) {
        event.generationSucceeded = !!generationSucceeded;
        if (generatedMaterials) {
          event.generatedMaterials = generatedMaterials;
        }
      }
      recordJobEvent(jobState, event, logLimit);
      jobChanged = true;
      lastProcessedTime = attemptTime;
      continue;
    }
    if (generatedMaterials) {
      event.generationSucceeded = true;
      event.generatedMaterials = generatedMaterials;
    }
    Object.entries(recipe).forEach(([materialId, qty]) => {
      const required = sanitizePositiveInteger(qty);
      if (!required) return;
      const available = readMaterialCount(characterDoc.materials, materialId);
      const remaining = Math.max(0, available - required);
      setMaterialCount(characterDoc.materials, materialId, remaining);
    });
    materialsChanged = true;
    const craftedBaseId = jobItem.itemId;
    let craftedId = craftedBaseId;
    jobState.totalCrafted += 1;
    const totals = jobState.totalsByItem;
    const prevTotal = Number.isFinite(totals[craftedBaseId]) ? totals[craftedBaseId] : 0;
    totals[craftedBaseId] = prevTotal + 1;
    const gainChance = jobDef.statGainChance != null ? jobDef.statGainChance : config.statGainChance;
    const gainAmount = jobDef.statGainAmount != null ? jobDef.statGainAmount : config.statGainAmount;
    let gainedStat = false;
    if (gainAmount > 0 && gainChance > 0 && Math.random() < gainChance) {
      const stat = jobAttribute;
      if (stat) {
        if (!characterDoc.attributes || typeof characterDoc.attributes !== 'object') {
          characterDoc.attributes = {};
        }
        const current = Number.isFinite(characterDoc.attributes[stat]) ? characterDoc.attributes[stat] : 0;
        characterDoc.attributes[stat] = current + gainAmount;
        const statTotals = jobState.statGains;
        const prevGain = Number.isFinite(statTotals[stat]) ? statTotals[stat] : 0;
        statTotals[stat] = prevGain + gainAmount;
        jobState.totalStatGain += gainAmount;
        event.stat = stat;
        event.statAmount = gainAmount;
        attributesChanged = true;
        gainedStat = true;
      }
    }
    if (blacksmithJob && gainedStat && item && item.attributeBonuses) {
      const attributeOptions = Object.entries(item.attributeBonuses || {})
        .filter(([, value]) => Number.isFinite(value) && value > 0)
        .map(([key]) => key.toLowerCase());
      if (attributeOptions.length) {
        const chosen = attributeOptions[Math.floor(Math.random() * attributeOptions.length)];
        const bonusAmount = 1 + Math.floor(Math.random() * 2);
        const bonusAttributes = { [chosen]: bonusAmount };
        const encoded = formatItemInstanceId(craftedBaseId, bonusAttributes);
        if (encoded) {
          craftedId = encoded;
        }
        event.bonusAttributes = bonusAttributes;
        if (craftedId !== craftedBaseId) {
          event.variantId = craftedId;
        }
      }
    }
    if (craftedId !== craftedBaseId && !event.variantId) {
      event.variantId = craftedId;
    }
    characterDoc.items.push(craftedId);
    itemsChanged = true;
    recordJobEvent(jobState, event, logLimit);
    jobChanged = true;
    lastProcessedTime = attemptTime;
  }

  if (lastProcessedTime) {
    jobState.lastProcessedAt = lastProcessedTime;
    jobChanged = true;
  }
  if (typeof characterDoc.markModified === 'function') {
    if (materialsChanged) characterDoc.markModified('materials');
    if (itemsChanged) characterDoc.markModified('items');
    if (attributesChanged) characterDoc.markModified('attributes');
    if (jobChanged) characterDoc.markModified('job');
  }
  return {
    changed: materialsChanged || itemsChanged || attributesChanged || jobChanged,
    job: jobDef,
    attempts: attemptsPerformed,
  };
}

function sanitizeNumberMap(map) {
  const result = {};
  if (!map || typeof map !== 'object') {
    return result;
  }
  Object.entries(map).forEach(([key, value]) => {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric !== 0) {
      result[key] = numeric;
    }
  });
  return result;
}

function sanitizeLogEntry(entry, equipmentMap) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }
  const timestamp = entry.timestamp ? new Date(entry.timestamp) : null;
  const item = entry.itemId ? equipmentMap.get(entry.itemId) : null;
  const type = entry.type === 'failed'
    ? 'failed'
    : entry.type === 'salvaged'
    ? 'salvaged'
    : 'crafted';
  return {
    timestamp: timestamp && !Number.isNaN(timestamp.getTime()) ? timestamp.toISOString() : null,
    type,
    itemId: entry.itemId || null,
    variantId: entry.variantId || null,
    itemName: entry.itemName || (item ? item.name : null),
    rarity: entry.rarity || (item ? item.rarity || null : null),
    stat: entry.stat || null,
    statAmount: Number.isFinite(entry.statAmount) ? entry.statAmount : 0,
    reason: entry.reason || null,
    materials: sanitizeNumberMap(entry.materials),
    missing: Array.isArray(entry.missing)
      ? entry.missing.map(m => ({
          materialId: typeof m.materialId === 'string' ? m.materialId : null,
          required: Number.isFinite(m.required) ? m.required : 0,
          available: Number.isFinite(m.available) ? m.available : 0,
        })).filter(m => m.materialId)
      : [],
    generatedMaterials: Array.isArray(entry.generatedMaterials)
      ? entry.generatedMaterials
          .map(m => ({
            materialId: typeof m.materialId === 'string' ? m.materialId : null,
            amount: Number.isFinite(m.amount) ? m.amount : 0,
          }))
          .filter(m => m.materialId && m.amount > 0)
      : [],
    generationAttempted: !!entry.generationAttempted,
    generationSucceeded: !!entry.generationSucceeded,
    generationChance: Number.isFinite(entry.generationChance)
      ? Math.max(0, Math.min(1, entry.generationChance))
      : null,
    generationShare: Number.isFinite(entry.generationShare)
      ? Math.max(0, Math.min(1, entry.generationShare))
      : null,
    generationMultiplier: Number.isFinite(entry.generationMultiplier) && entry.generationMultiplier >= 0
      ? entry.generationMultiplier
      : null,
    generationRoll: Number.isFinite(entry.generationRoll)
      ? Math.max(0, Math.min(1, entry.generationRoll))
      : null,
    generationAttribute: entry.generationAttribute || null,
    recoveredMaterials: Array.isArray(entry.recoveredMaterials)
      ? entry.recoveredMaterials
          .map(m => ({
            materialId: typeof m.materialId === 'string' ? m.materialId : null,
            amount: Number.isFinite(m.amount) ? m.amount : 0,
          }))
          .filter(m => m.materialId && m.amount > 0)
      : [],
    bonusAttributes: sanitizeNumberMap(entry.bonusAttributes),
  };
}

function buildPublicJob(job, equipmentMap) {
  const items = job.items.map(jobItem => {
    const item = equipmentMap.get(jobItem.itemId) || null;
    return {
      itemId: jobItem.itemId,
      name: item ? item.name : jobItem.itemId,
      rarity: item ? item.rarity || null : null,
      slot: item ? item.slot || null : null,
      category: item ? item.category || null : job.category || null,
      materials: clone(jobItem.materials || {}),
    };
  });
  return {
    id: job.id,
    name: job.name,
    attribute: job.attribute,
    description: job.description,
    category: job.category,
    type: job.type || 'standard',
    craftsPerHour: job.craftsPerHour,
    statGainChance: job.statGainChance,
    statGainAmount: job.statGainAmount,
    materialRecoveryEnabled: job.materialRecoveryEnabled,
    materialRecoveryChanceMultiplier: job.materialRecoveryChanceMultiplier,
    items,
  };
}

function countEquippedItems(characterDoc) {
  const counts = new Map();
  if (!characterDoc) {
    return counts;
  }
  const record = rawId => {
    if (!rawId || typeof rawId !== 'string') return;
    const parsed = parseItemInstanceId(rawId);
    const baseId = parsed.itemId || rawId;
    if (!baseId) return;
    counts.set(baseId, (counts.get(baseId) || 0) + 1);
  };
  const equipment = characterDoc.equipment || {};
  Object.values(equipment).forEach(record);
  const useables = characterDoc.useables || {};
  Object.values(useables).forEach(record);
  return counts;
}

function summarizeBlacksmithResources(characterDoc, blacksmithState, equipmentMap) {
  const summary = { inventory: [], queue: [] };
  if (!characterDoc) {
    return summary;
  }
  const equippedCounts = countEquippedItems(characterDoc);
  const items = Array.isArray(characterDoc.items) ? characterDoc.items : [];
  const inventoryGroups = new Map();
  const queueGroups = new Map();

  const addToGroup = (map, rawId) => {
    if (!rawId || typeof rawId !== 'string') return;
    const parsed = parseItemInstanceId(rawId);
    const baseId = parsed.itemId || rawId;
    if (!baseId) return;
    let group = map.get(baseId);
    if (!group) {
      group = {
        count: 0,
        augmented: false,
        bonusTags: new Set(),
        sampleId: rawId,
      };
      map.set(baseId, group);
    }
    group.count += 1;
    if (parsed.isAugmented) {
      group.augmented = true;
      Object.entries(parsed.bonuses || {}).forEach(([stat, amount]) => {
        const numeric = Number(amount);
        if (!stat || !Number.isFinite(numeric) || numeric <= 0) {
          return;
        }
        const label = stat.charAt(0).toUpperCase() + stat.slice(1);
        group.bonusTags.add(`+${numeric} ${label}`.trim());
      });
    }
  };

  items.forEach(id => addToGroup(inventoryGroups, id));
  const queueItems = Array.isArray(blacksmithState && blacksmithState.salvageQueue)
    ? blacksmithState.salvageQueue
    : [];
  queueItems.forEach(id => addToGroup(queueGroups, id));

  inventoryGroups.forEach((group, baseId) => {
    const available = group.count - (equippedCounts.get(baseId) || 0);
    if (!(available > 0)) {
      return;
    }
    const item = equipmentMap.get(baseId) || equipmentMap.get(group.sampleId) || null;
    if (!item || item.slot === 'useable' || item.slot === 'material') {
      return;
    }
    const tags = new Set(group.bonusTags);
    if (group.augmented) {
      tags.add('Augmented');
    }
    summary.inventory.push({
      itemId: baseId,
      name: item ? item.name : baseId,
      rarity: item ? item.rarity || null : null,
      slot: item ? item.slot || null : null,
      available,
      total: group.count,
      augmented: !!group.augmented,
      tags: Array.from(tags),
    });
  });

  queueGroups.forEach((group, baseId) => {
    const item = equipmentMap.get(baseId) || equipmentMap.get(group.sampleId) || null;
    if (!item || item.slot === 'useable' || item.slot === 'material') {
      return;
    }
    const tags = new Set(group.bonusTags);
    if (group.augmented) {
      tags.add('Augmented');
    }
    summary.queue.push({
      itemId: baseId,
      name: item ? item.name : baseId,
      rarity: item ? item.rarity || null : null,
      slot: item ? item.slot || null : null,
      count: group.count,
      augmented: !!group.augmented,
      tags: Array.from(tags),
    });
  });

  summary.inventory.sort((a, b) => a.name.localeCompare(b.name));
  summary.queue.sort((a, b) => a.name.localeCompare(b.name));
  return summary;
}

function buildBlacksmithStatus(jobState, jobDef, characterDoc, equipmentMap) {
  if (!isBlacksmithJob(jobDef)) {
    return null;
  }
  const blacksmithState = getBlacksmithState(jobState);
  const resources = summarizeBlacksmithResources(characterDoc, blacksmithState, equipmentMap);
  return {
    mode: blacksmithState.mode || 'craft',
    inventory: resources.inventory,
    salvageQueue: resources.queue,
  };
}

function buildActiveJobStatus(jobState, jobDef, now, equipmentMap, config, characterDoc) {
  const isWorking = !!jobState.isWorking;
  const lastProcessed = jobState.lastProcessedAt ? new Date(jobState.lastProcessedAt) : null;
  const startedAt = jobState.startedAt ? new Date(jobState.startedAt) : null;
  const workingSince = jobState.workingSince ? new Date(jobState.workingSince) : null;
  const interval = jobDef.craftIntervalSeconds;
  let secondsUntilNext = null;
  let nextAttemptAt = null;
  if (isWorking && interval > 0) {
    const anchor = lastProcessed && !Number.isNaN(lastProcessed.getTime())
      ? lastProcessed
      : startedAt && !Number.isNaN(startedAt.getTime())
      ? startedAt
      : now;
    const elapsed = Math.max(0, (now.getTime() - anchor.getTime()) / 1000);
    const remainder = elapsed % interval;
    const wait = remainder === 0 ? interval : interval - remainder;
    secondsUntilNext = Math.round(wait);
    nextAttemptAt = new Date(now.getTime() + wait * 1000);
  }
  const totalsByItem = jobState.totalsByItem && typeof jobState.totalsByItem === 'object' ? jobState.totalsByItem : {};
  const itemTotals = Object.entries(totalsByItem)
    .map(([itemId, count]) => {
      const numeric = Number(count);
      if (!Number.isFinite(numeric) || numeric <= 0) {
        return null;
      }
      const item = equipmentMap.get(itemId) || null;
      return {
        itemId,
        count: numeric,
        name: item ? item.name : itemId,
        rarity: item ? item.rarity || null : null,
      };
    })
    .filter(Boolean);
  const statGains = jobState.statGains && typeof jobState.statGains === 'object' ? jobState.statGains : {};
  const totalStatGain = Number.isFinite(jobState.totalStatGain)
    ? jobState.totalStatGain
    : Object.values(statGains).reduce((sum, value) => sum + (Number(value) || 0), 0);
  const totalAttempts = Number.isFinite(jobState.totalAttempts) ? jobState.totalAttempts : 0;
  const totalCrafted = Number.isFinite(jobState.totalCrafted) ? jobState.totalCrafted : 0;
  const logEntries = Array.isArray(jobState.log) ? [...jobState.log] : [];
  logEntries.sort((a, b) => {
    const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return tb - ta;
  });
  const log = logEntries.slice(0, config.logLimit)
    .map(entry => sanitizeLogEntry(entry, equipmentMap))
    .filter(Boolean);
  const blacksmith = buildBlacksmithStatus(jobState, jobDef, characterDoc, equipmentMap);
  return {
    id: jobDef.id,
    name: jobDef.name,
    attribute: jobDef.attribute,
    description: jobDef.description,
    category: jobDef.category,
    type: jobDef.type || 'standard',
    startedAt: startedAt && !Number.isNaN(startedAt.getTime()) ? startedAt.toISOString() : null,
    lastProcessedAt: lastProcessed && !Number.isNaN(lastProcessed.getTime()) ? lastProcessed.toISOString() : null,
    craftsPerHour: jobDef.craftsPerHour,
    craftIntervalSeconds: jobDef.craftIntervalSeconds,
    statGainChance: jobDef.statGainChance,
    statGainAmount: jobDef.statGainAmount,
    materialRecoveryEnabled: jobDef.materialRecoveryEnabled,
    materialRecoveryChanceMultiplier: jobDef.materialRecoveryChanceMultiplier,
    totalAttempts,
    totalCrafted,
    totalFailed: Math.max(0, totalAttempts - totalCrafted),
    totalStatGain,
    statGainBreakdown: sanitizeNumberMap(statGains),
    totalsByItem: itemTotals,
    nextAttemptAt: nextAttemptAt ? nextAttemptAt.toISOString() : null,
    secondsUntilNext,
    isWorking,
    workingSince: workingSince && !Number.isNaN(workingSince.getTime()) ? workingSince.toISOString() : null,
    log,
    blacksmith,
  };
}

async function buildStatusForDoc(characterDoc, config) {
  const equipmentMap = await getEquipmentMap();
  const now = new Date();
  const jobState = ensureJobState(characterDoc);
  const activeJobDef = jobState.jobId ? config.jobsById.get(jobState.jobId) : null;
  const jobs = config.jobs.map(job => buildPublicJob(job, equipmentMap));
  const activeJob = activeJobDef
    ? buildActiveJobStatus(jobState, activeJobDef, now, equipmentMap, config, characterDoc)
    : null;
  return {
    character: serializeCharacter(characterDoc),
    jobs,
    activeJob,
    config: {
      hourSeconds: config.hourSeconds,
      craftsPerHour: config.craftsPerHour,
      statGainChance: config.statGainChance,
      statGainAmount: config.statGainAmount,
      logLimit: config.logLimit,
      materialRecoveryEnabled: config.materialRecoveryEnabled,
      materialRecoveryChanceMultiplier: config.materialRecoveryChanceMultiplier,
    },
  };
}

async function getJobStatus(playerId, characterId) {
  const pid = Number(playerId);
  const cid = Number(characterId);
  if (!Number.isFinite(pid) || !Number.isFinite(cid)) {
    throw new Error('playerId and characterId required');
  }
  const characterDoc = await CharacterModel.findOne({ playerId: pid, characterId: cid });
  if (!characterDoc) {
    throw new Error('character not found');
  }
  const config = await loadJobConfig();
  const { changed } = await processJobForCharacter(characterDoc, { config });
  if (changed) {
    await characterDoc.save();
  }
  return buildStatusForDoc(characterDoc, config);
}

async function selectJob(playerId, characterId, jobId) {
  const pid = Number(playerId);
  const cid = Number(characterId);
  const jobKey = typeof jobId === 'string' ? jobId.trim().toLowerCase() : '';
  if (!Number.isFinite(pid) || !Number.isFinite(cid) || !jobKey) {
    throw new Error('playerId and jobId required');
  }
  const config = await loadJobConfig();
  const jobDef = config.jobsById.get(jobKey);
  if (!jobDef) {
    throw new Error('job not found');
  }
  const characterDoc = await CharacterModel.findOne({ playerId: pid, characterId: cid });
  if (!characterDoc) {
    throw new Error('character not found');
  }
  const jobState = ensureJobState(characterDoc);
  if (jobState.jobId && jobState.jobId !== jobKey) {
    throw new Error('job already selected');
  }
  if (jobState.jobId === jobKey) {
    return buildStatusForDoc(characterDoc, config);
  }
  characterDoc.job = {
    jobId: jobKey,
    startedAt: null,
    lastProcessedAt: null,
    workingSince: null,
    isWorking: false,
    totalAttempts: 0,
    totalCrafted: 0,
    totalStatGain: 0,
    statGains: {},
    totalsByItem: {},
    log: [],
    blacksmith: { mode: 'craft', salvageQueue: [] },
  };
  if (typeof characterDoc.markModified === 'function') {
    characterDoc.markModified('job');
  }
  await characterDoc.save();
  return buildStatusForDoc(characterDoc, config);
}

function ensureJobIdleForDoc(characterDoc) {
  if (!characterDoc) {
    return;
  }
  const jobState = ensureJobState(characterDoc);
  if (jobState.jobId && jobState.isWorking) {
    throw new Error('character is currently working');
  }
}

async function ensureJobIdle(characterId) {
  const cid = Number(characterId);
  if (!Number.isFinite(cid)) {
    throw new Error('characterId required');
  }
  const characterDoc = await CharacterModel.findOne({ characterId: cid });
  if (!characterDoc) {
    throw new Error('character not found');
  }
  ensureJobIdleForDoc(characterDoc);
}

async function setJobWorkingState(playerId, characterId, shouldWork) {
  const pid = Number(playerId);
  const cid = Number(characterId);
  if (!Number.isFinite(pid) || !Number.isFinite(cid)) {
    throw new Error('playerId and characterId required');
  }
  const config = await loadJobConfig();
  const now = new Date();
  const characterDoc = await CharacterModel.findOne({ playerId: pid, characterId: cid });
  if (!characterDoc) {
    throw new Error('character not found');
  }
  const jobState = ensureJobState(characterDoc);
  if (!jobState.jobId) {
    throw new Error('profession not selected');
  }
  const { changed: processedChanges } = await processJobForCharacter(characterDoc, { config, now });
  let jobChanged = false;
  if (shouldWork) {
    if (!jobState.isWorking) {
      jobState.isWorking = true;
      jobState.workingSince = now;
      if (!jobState.startedAt) {
        jobState.startedAt = now;
      }
      jobState.lastProcessedAt = now;
      jobChanged = true;
    }
  } else if (jobState.isWorking) {
    jobState.isWorking = false;
    jobState.workingSince = null;
    jobState.lastProcessedAt = now;
    jobChanged = true;
  }
  if (jobChanged && typeof characterDoc.markModified === 'function') {
    characterDoc.markModified('job');
  }
  if (jobChanged || processedChanges) {
    await characterDoc.save();
  }
  return buildStatusForDoc(characterDoc, config);
}

async function startJobWork(playerId, characterId) {
  return setJobWorkingState(playerId, characterId, true);
}

async function stopJobWork(playerId, characterId) {
  return setJobWorkingState(playerId, characterId, false);
}

async function setJobMode(playerId, characterId, mode) {
  const pid = Number(playerId);
  const cid = Number(characterId);
  const normalizedMode = mode === 'salvage' ? 'salvage' : 'craft';
  if (!Number.isFinite(pid) || !Number.isFinite(cid)) {
    throw new Error('playerId and characterId required');
  }
  const config = await loadJobConfig();
  const characterDoc = await CharacterModel.findOne({ playerId: pid, characterId: cid });
  if (!characterDoc) {
    throw new Error('character not found');
  }
  const { changed: processed } = await processJobForCharacter(characterDoc, { config });
  const jobState = ensureJobState(characterDoc);
  if (!jobState.jobId) {
    throw new Error('profession not selected');
  }
  const jobDef = config.jobsById.get(jobState.jobId);
  if (!isBlacksmithJob(jobDef)) {
    throw new Error('profession cannot change modes');
  }
  const state = getBlacksmithState(jobState);
  const modeChanged = state.mode !== normalizedMode;
  if (modeChanged) {
    state.mode = normalizedMode;
    jobState.blacksmith = state;
  }
  if (modeChanged || processed) {
    if (typeof characterDoc.markModified === 'function') {
      if (modeChanged) characterDoc.markModified('job');
    }
    await characterDoc.save();
  }
  return buildStatusForDoc(characterDoc, config);
}

function findInventoryIndexForItem(characterDoc, baseItemId, { preferAugmented = false } = {}) {
  if (!Array.isArray(characterDoc.items)) {
    return -1;
  }
  const matches = [];
  characterDoc.items.forEach((rawId, index) => {
    if (typeof rawId !== 'string') return;
    const parsed = parseItemInstanceId(rawId);
    const baseId = parsed.itemId || rawId;
    if (baseId === baseItemId) {
      matches.push({ index, parsed, rawId });
    }
  });
  if (!matches.length) {
    return -1;
  }
  if (preferAugmented) {
    const augmented = matches.find(match => match.parsed.isAugmented);
    if (augmented) {
      return augmented.index;
    }
  }
  const normal = matches.find(match => !match.parsed.isAugmented);
  return (normal || matches[0]).index;
}

function findQueueIndexForItem(queue, baseItemId, { preferAugmented = false } = {}) {
  if (!Array.isArray(queue)) {
    return -1;
  }
  let fallback = -1;
  for (let i = queue.length - 1; i >= 0; i -= 1) {
    const rawId = queue[i];
    if (typeof rawId !== 'string') continue;
    const parsed = parseItemInstanceId(rawId);
    const baseId = parsed.itemId || rawId;
    if (baseId !== baseItemId) {
      continue;
    }
    if (preferAugmented && parsed.isAugmented) {
      return i;
    }
    if (fallback === -1) {
      fallback = i;
    }
  }
  return fallback;
}

async function addToSalvageQueue(playerId, characterId, itemId) {
  const pid = Number(playerId);
  const cid = Number(characterId);
  const baseItemId = typeof itemId === 'string' ? itemId.trim() : '';
  if (!Number.isFinite(pid) || !Number.isFinite(cid) || !baseItemId) {
    throw new Error('playerId, characterId and itemId required');
  }
  const config = await loadJobConfig();
  const characterDoc = await CharacterModel.findOne({ playerId: pid, characterId: cid });
  if (!characterDoc) {
    throw new Error('character not found');
  }
  const { changed: processed } = await processJobForCharacter(characterDoc, { config });
  const jobState = ensureJobState(characterDoc);
  if (!jobState.jobId) {
    throw new Error('profession not selected');
  }
  const jobDef = config.jobsById.get(jobState.jobId);
  if (!isBlacksmithJob(jobDef)) {
    throw new Error('profession cannot salvage equipment');
  }
  const blacksmithState = getBlacksmithState(jobState);
  const inventory = Array.isArray(characterDoc.items) ? characterDoc.items : [];
  const equippedCounts = countEquippedItems(characterDoc);
  const ownedMatches = inventory.filter(rawId => {
    const parsed = parseItemInstanceId(rawId);
    const baseId = parsed.itemId || rawId;
    return baseId === baseItemId;
  });
  const available = ownedMatches.length - (equippedCounts.get(baseItemId) || 0);
  if (!(available > 0)) {
    throw new Error('no unequipped copies available');
  }
  const index = findInventoryIndexForItem(characterDoc, baseItemId, { preferAugmented: false });
  if (index === -1) {
    throw new Error('item not available');
  }
  const [rawId] = characterDoc.items.splice(index, 1);
  blacksmithState.salvageQueue.push(rawId);
  jobState.blacksmith = blacksmithState;
  if (typeof characterDoc.markModified === 'function') {
    characterDoc.markModified('items');
    characterDoc.markModified('job');
  }
  if (processed || rawId) {
    await characterDoc.save();
  }
  return buildStatusForDoc(characterDoc, config);
}

async function removeFromSalvageQueue(playerId, characterId, itemId) {
  const pid = Number(playerId);
  const cid = Number(characterId);
  const baseItemId = typeof itemId === 'string' ? itemId.trim() : '';
  if (!Number.isFinite(pid) || !Number.isFinite(cid) || !baseItemId) {
    throw new Error('playerId, characterId and itemId required');
  }
  const config = await loadJobConfig();
  const characterDoc = await CharacterModel.findOne({ playerId: pid, characterId: cid });
  if (!characterDoc) {
    throw new Error('character not found');
  }
  const { changed: processed } = await processJobForCharacter(characterDoc, { config });
  const jobState = ensureJobState(characterDoc);
  if (!jobState.jobId) {
    throw new Error('profession not selected');
  }
  const jobDef = config.jobsById.get(jobState.jobId);
  if (!isBlacksmithJob(jobDef)) {
    throw new Error('profession cannot salvage equipment');
  }
  const blacksmithState = getBlacksmithState(jobState);
  const queue = blacksmithState.salvageQueue;
  const index = findQueueIndexForItem(queue, baseItemId, { preferAugmented: true });
  if (index === -1) {
    throw new Error('item not in salvage queue');
  }
  const [rawId] = queue.splice(index, 1);
  characterDoc.items.push(rawId);
  jobState.blacksmith = blacksmithState;
  if (typeof characterDoc.markModified === 'function') {
    characterDoc.markModified('items');
    characterDoc.markModified('job');
  }
  if (processed || rawId) {
    await characterDoc.save();
  }
  return buildStatusForDoc(characterDoc, config);
}

async function clearJobLog(playerId, characterId) {
  const pid = Number(playerId);
  const cid = Number(characterId);
  if (!Number.isFinite(pid) || !Number.isFinite(cid)) {
    throw new Error('playerId and characterId required');
  }
  const config = await loadJobConfig();
  const characterDoc = await CharacterModel.findOne({ playerId: pid, characterId: cid });
  if (!characterDoc) {
    throw new Error('character not found');
  }
  const jobState = ensureJobState(characterDoc);
  const hadEntries = Array.isArray(jobState.log) && jobState.log.length > 0;
  if (hadEntries) {
    jobState.log.splice(0, jobState.log.length);
    if (typeof characterDoc.markModified === 'function') {
      characterDoc.markModified('job');
    }
  }
  const { changed: processedChanges } = await processJobForCharacter(characterDoc, { config });
  if (hadEntries || processedChanges) {
    await characterDoc.save();
  }
  return buildStatusForDoc(characterDoc, config);
}

module.exports = {
  getJobStatus,
  selectJob,
  processJobForCharacter,
  loadJobConfig,
  startJobWork,
  stopJobWork,
  clearJobLog,
  ensureJobIdle,
  ensureJobIdleForDoc,
  setJobMode,
  addToSalvageQueue,
  removeFromSalvageQueue,
};
