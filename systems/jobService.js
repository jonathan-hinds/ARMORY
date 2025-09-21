const path = require('path');
const CharacterModel = require('../models/Character');
const { serializeCharacter, readMaterialCount } = require('../models/utils');
const { readJSON } = require('../store/jsonStore');
const { getEquipmentMap } = require('./equipmentService');
const { getMaterialCatalog, getMaterialMap } = require('./materialService');
const {
  storeCustomDefinition,
  generateCustomItemId,
  resolveItem,
  getCustomDefinition,
  deleteCustomDefinition,
} = require('./customItemService');

const DATA_DIR = path.join(__dirname, '..', 'data');
const JOB_CONFIG_FILE = path.join(DATA_DIR, 'jobConfig.json');
const JOB_RECIPES_FILE = path.join(DATA_DIR, 'jobRecipes.json');

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

function normalizeShiftMode(entry) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }
  const idRaw = typeof entry.id === 'string' ? entry.id.trim().toLowerCase() : '';
  if (!idRaw) {
    return null;
  }
  const label = typeof entry.label === 'string' && entry.label.trim() ? entry.label.trim() : null;
  const description = typeof entry.description === 'string' ? entry.description : '';
  const taskRaw = typeof entry.task === 'string' ? entry.task.trim().toLowerCase() : '';
  const task = taskRaw || null;
  const requiresQueue = entry.requiresQueue != null ? !!entry.requiresQueue : false;
  const autoStopSet = new Set();
  if (Array.isArray(entry.autoStopConditions)) {
    entry.autoStopConditions.forEach(condition => {
      if (typeof condition === 'string' && condition.trim()) {
        autoStopSet.add(condition.trim().toLowerCase());
      }
    });
  }
  if (entry.autoStopOnQueueEmpty) {
    autoStopSet.add('queue-empty');
  }
  if (requiresQueue) {
    autoStopSet.add('queue-empty');
  }
  const autoStopConditions = Array.from(autoStopSet);
  const isDefault = !!entry.default;
  return {
    id: idRaw,
    label: label || idRaw,
    description,
    task,
    requiresQueue: !!requiresQueue,
    autoStopConditions,
    isDefault,
  };
}

function normalizeBlacksmithModeId(value) {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return raw === 'salvage' ? 'salvage' : 'forge';
}

async function loadJobRecipes() {
  if (!recipeCache) {
    let raw;
    try {
      raw = await readJSON(JOB_RECIPES_FILE);
    } catch (err) {
      raw = {};
    }
    const jobs = raw && typeof raw === 'object' ? raw.jobs : null;
    const recipesById = new Map();
    if (jobs && typeof jobs === 'object') {
      Object.entries(jobs).forEach(([jobId, value]) => {
        if (!jobId) return;
        const key = jobId.trim().toLowerCase();
        if (!key) return;
        let entries = [];
        if (Array.isArray(value)) {
          entries = value;
        } else if (value && typeof value === 'object') {
          if (Array.isArray(value.craft)) {
            entries = value.craft;
          }
        }
        const normalized = entries.map(normalizeJobItem).filter(Boolean);
        recipesById.set(key, normalized);
      });
    }
    recipeCache = { recipesById };
  }
  return recipeCache;
}

function normalizeJob(entry, baseConfig, recipeItems = []) {
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
  const behaviorRaw = typeof entry.behavior === 'string' ? entry.behavior.trim().toLowerCase() : '';
  const behavior = behaviorRaw || 'standard';
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
  let itemsRaw = Array.isArray(entry.items) ? entry.items : [];
  if (!itemsRaw.length && Array.isArray(recipeItems)) {
    itemsRaw = recipeItems;
  }
  const items = itemsRaw.map(normalizeJobItem).filter(Boolean);
  const shiftModesRaw = Array.isArray(entry.shiftModes) ? entry.shiftModes : [];
  const shiftModes = shiftModesRaw.map(normalizeShiftMode).filter(Boolean);
  let defaultShiftModeId = null;
  shiftModes.forEach(mode => {
    if (mode.isDefault && !defaultShiftModeId) {
      defaultShiftModeId = mode.id;
    }
  });
  if (!defaultShiftModeId && shiftModes.length) {
    defaultShiftModeId = shiftModes[0].id;
  }
  const normalizedShiftModes = shiftModes.map(mode => ({
    ...mode,
    isDefault: mode.id === defaultShiftModeId,
  }));
  const hourSeconds = baseConfig.hourSeconds > 0 ? baseConfig.hourSeconds : DEFAULT_CONFIG.hourSeconds;
  const effectiveCraftsPerHour = craftsPerHour > 0 ? craftsPerHour : DEFAULT_CONFIG.craftsPerHour;
  const craftIntervalSeconds = hourSeconds / effectiveCraftsPerHour;
  return {
    id: idRaw,
    name: name || idRaw,
    attribute,
    description,
    category,
    items,
    behavior,
    isBlacksmith: behavior === 'blacksmith',
    rarityWeights,
    materialRecoveryEnabled,
    materialRecoveryChanceMultiplier,
    craftsPerHour: effectiveCraftsPerHour,
    statGainChance,
    statGainAmount,
    craftIntervalSeconds,
    shiftModes: normalizedShiftModes,
    defaultShiftModeId,
  };
}

function sanitizeShiftSelectionMap(map) {
  const result = {};
  if (!map || typeof map !== 'object') {
    return result;
  }
  Object.entries(map).forEach(([jobId, modeId]) => {
    if (typeof jobId !== 'string' || typeof modeId !== 'string') {
      return;
    }
    const jobKey = jobId.trim().toLowerCase();
    const modeKey = modeId.trim().toLowerCase();
    if (!jobKey || !modeKey) {
      return;
    }
    result[jobKey] = modeKey;
  });
  return result;
}

function applyJobModeState(jobState, jobDef, mode) {
  if (!jobState || !jobDef || !mode) {
    return false;
  }
  let changed = false;
  if (jobDef.id === 'blacksmith' || jobDef.behavior === 'blacksmith' || jobDef.isBlacksmith) {
    if (!jobState.blacksmith || typeof jobState.blacksmith !== 'object') {
      jobState.blacksmith = { task: 'craft', salvageQueue: [], modeId: 'forge' };
      changed = true;
    }
    if (!Array.isArray(jobState.blacksmith.salvageQueue)) {
      jobState.blacksmith.salvageQueue = [];
      changed = true;
    } else {
      const filtered = jobState.blacksmith.salvageQueue
        .filter(id => typeof id === 'string' && id);
      if (filtered.length !== jobState.blacksmith.salvageQueue.length) {
        jobState.blacksmith.salvageQueue = filtered;
        changed = true;
      }
    }
    const desiredTask = mode.task === 'salvage' ? 'salvage' : 'craft';
    if (jobState.blacksmith.task !== desiredTask) {
      jobState.blacksmith.task = desiredTask;
      changed = true;
    }
    const desiredModeId = typeof mode.id === 'string' && mode.id ? mode.id : desiredTask === 'salvage' ? 'salvage' : 'forge';
    if (jobState.blacksmith.modeId !== desiredModeId) {
      jobState.blacksmith.modeId = desiredModeId;
      changed = true;
    }
  }
  return changed;
}

function ensureShiftModeSelection(jobState, jobDef, options = {}) {
  const requestedRaw = options && typeof options.requestedModeId === 'string'
    ? options.requestedModeId.trim().toLowerCase()
    : '';
  const strict = options && options.strict ? !!options.strict : false;
  if (!jobState || !jobDef || !Array.isArray(jobDef.shiftModes) || !jobDef.shiftModes.length) {
    return { mode: null, changed: false };
  }
  if (!jobState.shiftSelections || typeof jobState.shiftSelections !== 'object') {
    jobState.shiftSelections = {};
  }
  const map = jobState.shiftSelections;
  let selection = null;
  if (requestedRaw) {
    selection = jobDef.shiftModes.find(mode => mode.id === requestedRaw) || null;
    if (!selection && strict) {
      throw new Error('invalid shift mode');
    }
  }
  if (!selection) {
    const storedRaw = typeof map[jobDef.id] === 'string' ? map[jobDef.id] : '';
    const stored = storedRaw ? storedRaw.trim().toLowerCase() : '';
    selection = jobDef.shiftModes.find(mode => mode.id === stored) || null;
  }
  if (!selection) {
    const fallbackId = jobDef.defaultShiftModeId || (jobDef.shiftModes[0] && jobDef.shiftModes[0].id);
    selection = jobDef.shiftModes.find(mode => mode.id === fallbackId) || jobDef.shiftModes[0] || null;
  }
  if (!selection) {
    return { mode: null, changed: false };
  }
  let changed = false;
  if (map[jobDef.id] !== selection.id) {
    map[jobDef.id] = selection.id;
    changed = true;
  }
  if (applyJobModeState(jobState, jobDef, selection)) {
    changed = true;
  }
  return { mode: selection, changed };
}

function autoStopJob(jobState, timestamp) {
  if (!jobState) {
    return false;
  }
  const stopTime = timestamp ? new Date(timestamp) : new Date();
  let changed = false;
  if (jobState.isWorking) {
    jobState.isWorking = false;
    changed = true;
  }
  if (jobState.workingSince) {
    jobState.workingSince = null;
    changed = true;
  }
  jobState.lastProcessedAt = stopTime;
  return changed;
}

function normalizeConfig(raw, recipesById = new Map()) {
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
    const recipeItems = entry && entry.id ? recipesById.get(String(entry.id).trim().toLowerCase()) : undefined;
    const job = normalizeJob(entry, base, recipeItems);
    if (job && !seen.has(job.id)) {
      seen.add(job.id);
      jobs.push(job);
    }
  });
  return { ...base, jobs };
}

async function loadJobConfig() {
  if (!configCache) {
    let raw;
    try {
      raw = await readJSON(JOB_CONFIG_FILE);
    } catch (err) {
      raw = {};
    }
    const { recipesById } = await loadJobRecipes();
    const normalized = normalizeConfig(raw, recipesById);
    const jobsById = new Map(normalized.jobs.map(job => [job.id, job]));
    configCache = { ...normalized, jobsById, recipesById };
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
  jobState.shiftSelections = sanitizeShiftSelectionMap(jobState.shiftSelections);
  if (!jobState.blacksmith || typeof jobState.blacksmith !== 'object') {
    jobState.blacksmith = { task: 'craft', salvageQueue: [], modeId: 'forge' };
  }
  const blacksmithState = jobState.blacksmith;
  if (!Array.isArray(blacksmithState.salvageQueue)) {
    blacksmithState.salvageQueue = [];
  } else {
    blacksmithState.salvageQueue = blacksmithState.salvageQueue
      .filter(id => typeof id === 'string' && id);
  }
  let modeId = normalizeBlacksmithModeId(blacksmithState.modeId);
  blacksmithState.modeId = modeId;
  if (blacksmithState.task === 'salvage' || modeId === 'salvage') {
    blacksmithState.task = 'salvage';
    modeId = 'salvage';
  } else {
    blacksmithState.task = 'craft';
    modeId = 'forge';
    blacksmithState.modeId = modeId;
  }
  const jobKey = typeof jobState.jobId === 'string' ? jobState.jobId.trim().toLowerCase() : '';
  if (jobKey === 'blacksmith') {
    const map = jobState.shiftSelections || {};
    const storedRaw = typeof map[jobKey] === 'string' ? map[jobKey] : '';
    const stored = storedRaw ? normalizeBlacksmithModeId(storedRaw) : '';
    if (!stored) {
      map[jobKey] = modeId;
    } else {
      if (map[jobKey] !== stored) {
        map[jobKey] = stored;
      }
      if (modeId !== stored) {
        blacksmithState.modeId = stored;
        blacksmithState.task = stored === 'salvage' ? 'salvage' : 'craft';
        modeId = stored;
      }
    }
    jobState.shiftSelections = map;
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
  return jobState;
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
  if (Array.isArray(event.producedMaterials)) {
    entry.producedMaterials = event.producedMaterials
      .map(m => ({
        materialId: typeof m.materialId === 'string' ? m.materialId : null,
        amount: sanitizePositiveInteger(m.amount),
      }))
      .filter(m => m.materialId && m.amount > 0);
  }
  if (event.itemBonus && typeof event.itemBonus === 'object') {
    const stat = typeof event.itemBonus.stat === 'string' ? event.itemBonus.stat : null;
    const amount = Number(event.itemBonus.amount);
    const instanceId = typeof event.itemBonus.instanceId === 'string' ? event.itemBonus.instanceId : null;
    if (stat && Number.isFinite(amount) && amount !== 0) {
      entry.itemBonus = { stat, amount, instanceId };
    }
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
  const isBlacksmith = !!jobDef.isBlacksmith;
  const jobAttribute = jobDef.attribute && jobDef.attribute.trim ? jobDef.attribute.trim() : null;
  const now = options.now ? new Date(options.now) : new Date();
  let jobChanged = false;
  const selectionResult = ensureShiftModeSelection(jobState, jobDef);
  const activeShiftMode = selectionResult.mode;
  const shiftModeChanged = !!selectionResult.changed;
  if (shiftModeChanged) {
    jobChanged = true;
  }
  let blacksmithChanged = isBlacksmith && shiftModeChanged;
  if (!jobState.isWorking) {
    return { changed: jobChanged, job: jobDef, attempts: 0 };
  }
  const autoStopOnQueueEmpty = activeShiftMode && Array.isArray(activeShiftMode.autoStopConditions)
    ? activeShiftMode.autoStopConditions.includes('queue-empty')
    : false;
  const activeTask = activeShiftMode && activeShiftMode.task ? activeShiftMode.task : null;
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
  let customItemsChanged = false;
  const gainChanceBase = jobDef.statGainChance != null ? jobDef.statGainChance : config.statGainChance;
  const gainAmountBase = jobDef.statGainAmount != null ? jobDef.statGainAmount : config.statGainAmount;
  let salvageEntries = null;
  let salvageTotalWeight = 0;
  if (isBlacksmith) {
    const materialCatalog = await getMaterialCatalog();
    salvageEntries = materialCatalog
      .map(material => {
        const rarity = material.rarity || 'Common';
        let weight = null;
        if (jobDef.rarityWeights && jobDef.rarityWeights[rarity] != null) {
          weight = jobDef.rarityWeights[rarity];
        } else if (config.rarityWeights && config.rarityWeights[rarity] != null) {
          weight = config.rarityWeights[rarity];
        }
        const numeric = Number(weight != null ? weight : 1);
        if (!Number.isFinite(numeric) || numeric <= 0) {
          return null;
        }
        return { material, weight: numeric };
      })
      .filter(Boolean);
    salvageTotalWeight = salvageEntries.reduce((sum, entry) => sum + entry.weight, 0);
  }

  const pickSalvageMaterial = () => {
    if (!salvageEntries || !salvageEntries.length || !(salvageTotalWeight > 0)) {
      return null;
    }
    let roll = Math.random() * salvageTotalWeight;
    for (const entry of salvageEntries) {
      roll -= entry.weight;
      if (roll <= 0) {
        return entry.material;
      }
    }
    return salvageEntries[salvageEntries.length - 1].material;
  };

  let attemptsProcessed = 0;
  for (let i = 0; i < attempts; i += 1) {
    jobState.totalAttempts += 1;
    attemptsProcessed += 1;
    const attemptTime = new Date(baseTime.getTime() + (i + 1) * interval * 1000);
    const blacksmithState = jobState.blacksmith || null;
    const currentTask = isBlacksmith && (activeTask === 'salvage' || (blacksmithState && blacksmithState.task === 'salvage'))
      ? 'salvage'
      : 'craft';

    if (isBlacksmith && currentTask === 'salvage') {
      const queue = blacksmithState ? blacksmithState.salvageQueue : [];
      if (!queue || !queue.length) {
        recordJobEvent(
          jobState,
          { timestamp: attemptTime, type: 'failed', reason: 'no-salvage-items' },
          logLimit
        );
        jobChanged = true;
        if (autoStopOnQueueEmpty && jobState.isWorking) {
          if (autoStopJob(jobState, attemptTime)) {
            jobChanged = true;
          }
          break;
        }
        continue;
      }
      const index = Math.floor(Math.random() * queue.length);
      const queuedId = queue.splice(index, 1)[0];
      jobChanged = true;
      blacksmithChanged = true;
      let baseItemId = queuedId;
      const customDefinition = getCustomDefinition(characterDoc, queuedId);
      if (customDefinition && customDefinition.baseItemId) {
        baseItemId = customDefinition.baseItemId;
        deleteCustomDefinition(characterDoc, queuedId);
        customItemsChanged = true;
      }
      const item = baseItemId ? equipmentMap.get(baseItemId) : null;
      const producedMap = new Map();
      const produceCount = 2 + Math.floor(Math.random() * 3);
      for (let r = 0; r < produceCount; r += 1) {
        const material = pickSalvageMaterial();
        if (!material) {
          continue;
        }
        const currentAmount = producedMap.get(material.id) || 0;
        producedMap.set(material.id, currentAmount + 1);
      }
      const produced = Array.from(producedMap.entries()).map(([materialId, amount]) => ({ materialId, amount }));
      produced.forEach(entry => {
        const current = readMaterialCount(characterDoc.materials, entry.materialId);
        setMaterialCount(characterDoc.materials, entry.materialId, current + entry.amount);
      });
      if (produced.length) {
        materialsChanged = true;
        jobState.totalCrafted += 1;
        const totals = jobState.totalsByItem;
        const prev = Number.isFinite(totals[baseItemId]) ? totals[baseItemId] : 0;
        totals[baseItemId] = prev + 1;
      }
      const event = {
        timestamp: attemptTime,
        type: produced.length ? 'salvaged' : 'failed',
        itemId: baseItemId,
        itemName: item ? item.name : null,
        rarity: item ? item.rarity || null : null,
        producedMaterials: produced,
      };
      if (!produced.length) {
        event.reason = 'salvage-empty';
      }
      if (produced.length && gainAmountBase > 0 && gainChanceBase > 0 && Math.random() < gainChanceBase) {
        if (jobAttribute) {
          if (!characterDoc.attributes || typeof characterDoc.attributes !== 'object') {
            characterDoc.attributes = {};
          }
          const currentValue = Number.isFinite(characterDoc.attributes[jobAttribute])
            ? characterDoc.attributes[jobAttribute]
            : 0;
          characterDoc.attributes[jobAttribute] = currentValue + gainAmountBase;
          const statTotals = jobState.statGains;
          const prevGain = Number.isFinite(statTotals[jobAttribute]) ? statTotals[jobAttribute] : 0;
          statTotals[jobAttribute] = prevGain + gainAmountBase;
          jobState.totalStatGain += gainAmountBase;
          event.stat = jobAttribute;
          event.statAmount = gainAmountBase;
          attributesChanged = true;
        }
      }
      recordJobEvent(jobState, event, logLimit);
      if (autoStopOnQueueEmpty && (!queue || !queue.length) && jobState.isWorking) {
        if (autoStopJob(jobState, attemptTime)) {
          jobChanged = true;
        }
        break;
      }
      continue;
    }

    const selection = pickJobItem(jobDef, equipmentMap, config);
    if (!selection) {
      recordJobEvent(
        jobState,
        { timestamp: attemptTime, type: 'failed', reason: 'no-recipe' },
        logLimit
      );
      jobChanged = true;
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
            const total = current + amount;
            setMaterialCount(characterDoc.materials, target.materialId, total);
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
    jobState.totalCrafted += 1;
    const totals = jobState.totalsByItem;
    const prevTotal = Number.isFinite(totals[jobItem.itemId]) ? totals[jobItem.itemId] : 0;
    totals[jobItem.itemId] = prevTotal + 1;

    let storedItemId = jobItem.itemId;
    let statGainApplied = false;
    if (gainAmountBase > 0 && gainChanceBase > 0 && Math.random() < gainChanceBase) {
      const stat = jobAttribute;
      if (stat) {
        if (!characterDoc.attributes || typeof characterDoc.attributes !== 'object') {
          characterDoc.attributes = {};
        }
        const current = Number.isFinite(characterDoc.attributes[stat]) ? characterDoc.attributes[stat] : 0;
        characterDoc.attributes[stat] = current + gainAmountBase;
        const statTotals = jobState.statGains;
        const prevGain = Number.isFinite(statTotals[stat]) ? statTotals[stat] : 0;
        statTotals[stat] = prevGain + gainAmountBase;
        jobState.totalStatGain += gainAmountBase;
        event.stat = stat;
        event.statAmount = gainAmountBase;
        attributesChanged = true;
        statGainApplied = true;
      }
    }

    if (isBlacksmith && statGainApplied) {
      const bonuses = item && item.attributeBonuses ? Object.entries(item.attributeBonuses) : [];
      const eligible = bonuses.filter(([, value]) => Number.isFinite(value) && value > 0);
      if (eligible.length) {
        const [statKey] = eligible[Math.floor(Math.random() * eligible.length)];
        const bonusAmount = 1 + Math.floor(Math.random() * 2);
        const customId = generateCustomItemId(characterDoc);
        storeCustomDefinition(characterDoc, customId, {
          baseItemId: jobItem.itemId,
          attributeBonuses: { [statKey]: bonusAmount },
        });
        storedItemId = customId;
        event.itemBonus = { stat: statKey, amount: bonusAmount, instanceId: customId };
        customItemsChanged = true;
      }
    }

    characterDoc.items.push(storedItemId);
    itemsChanged = true;
    recordJobEvent(jobState, event, logLimit);
    jobChanged = true;
  }
  jobState.lastProcessedAt = new Date(baseTime.getTime() + attemptsProcessed * interval * 1000);
  jobChanged = true;
  if (typeof characterDoc.markModified === 'function') {
    if (materialsChanged) characterDoc.markModified('materials');
    if (itemsChanged) characterDoc.markModified('items');
    if (attributesChanged) characterDoc.markModified('attributes');
    if (customItemsChanged) characterDoc.markModified('customItems');
    if (jobChanged) {
      characterDoc.markModified('job');
      if (shiftModeChanged) {
        characterDoc.markModified('job.shiftSelections');
      }
      if (blacksmithChanged) {
        characterDoc.markModified('job.blacksmith');
      }
    }
  }
  return {
    changed: materialsChanged || itemsChanged || attributesChanged || customItemsChanged || jobChanged,
    job: jobDef,
    attempts: attemptsProcessed,
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
  const type = entry.type === 'crafted'
    ? 'crafted'
    : entry.type === 'salvaged'
      ? 'salvaged'
      : 'failed';
  return {
    timestamp: timestamp && !Number.isNaN(timestamp.getTime()) ? timestamp.toISOString() : null,
    type,
    itemId: entry.itemId || null,
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
    producedMaterials: Array.isArray(entry.producedMaterials)
      ? entry.producedMaterials
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
    itemBonus: entry.itemBonus && typeof entry.itemBonus === 'object'
      ? {
          stat: entry.itemBonus.stat || null,
          amount: Number.isFinite(entry.itemBonus.amount) ? entry.itemBonus.amount : 0,
          instanceId: entry.itemBonus.instanceId || null,
        }
      : null,
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
    behavior: job.behavior,
    craftsPerHour: job.craftsPerHour,
    statGainChance: job.statGainChance,
    statGainAmount: job.statGainAmount,
    materialRecoveryEnabled: job.materialRecoveryEnabled,
    materialRecoveryChanceMultiplier: job.materialRecoveryChanceMultiplier,
    items,
  };
}

async function buildActiveJobStatus(jobState, jobDef, now, equipmentMap, config, characterDoc) {
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
  const shiftSelections = jobState.shiftSelections && typeof jobState.shiftSelections === 'object'
    ? jobState.shiftSelections
    : {};
  const storedShiftModeId = typeof shiftSelections[jobDef.id] === 'string'
    ? shiftSelections[jobDef.id]
    : null;
  let effectiveShiftModeId = storedShiftModeId;
  const shiftModes = Array.isArray(jobDef.shiftModes)
    ? jobDef.shiftModes.map(mode => ({
        id: mode.id,
        label: mode.label,
        description: mode.description || '',
        requiresQueue: !!mode.requiresQueue,
        autoStopConditions: Array.isArray(mode.autoStopConditions)
          ? mode.autoStopConditions.slice()
          : [],
        task: mode.task || null,
        isSelected: mode.id === effectiveShiftModeId,
      }))
    : [];
  let blacksmith = null;
  if (jobDef.isBlacksmith) {
    const state = jobState.blacksmith || {};
    const queueItems = [];
    const inventoryItems = [];
    const queueSource = Array.isArray(state.salvageQueue) ? state.salvageQueue : [];
    for (const queuedId of queueSource) {
      if (!queuedId) continue;
      const resolved = await resolveItem(characterDoc, queuedId, equipmentMap);
      if (!resolved) continue;
      const cloneItem = JSON.parse(JSON.stringify(resolved));
      const definition = getCustomDefinition(characterDoc, queuedId);
      const baseItemId = definition && definition.baseItemId ? definition.baseItemId : queuedId;
      cloneItem.instanceId = queuedId;
      cloneItem.baseItemId = baseItemId;
      queueItems.push({ instanceId: queuedId, baseItemId, item: cloneItem });
    }
    const equippedIds = new Set();
    if (characterDoc.equipment && typeof characterDoc.equipment === 'object') {
      Object.values(characterDoc.equipment).forEach(id => {
        if (typeof id === 'string' && id) {
          equippedIds.add(id);
        }
      });
    }
    if (characterDoc.useables && typeof characterDoc.useables === 'object') {
      Object.values(characterDoc.useables).forEach(id => {
        if (typeof id === 'string' && id) {
          equippedIds.add(id);
        }
      });
    }

    if (Array.isArray(characterDoc.items)) {
      for (const storedId of characterDoc.items) {
        if (!storedId) continue;
        if (equippedIds.has(storedId)) {
          continue;
        }
        const resolved = await resolveItem(characterDoc, storedId, equipmentMap);
        if (!resolved || resolved.slot === 'useable') continue;
        const cloneItem = JSON.parse(JSON.stringify(resolved));
        const definition = getCustomDefinition(characterDoc, storedId);
        const baseItemId = definition && definition.baseItemId ? definition.baseItemId : storedId;
        cloneItem.instanceId = storedId;
        cloneItem.baseItemId = baseItemId;
        inventoryItems.push({ instanceId: storedId, baseItemId, item: cloneItem });
      }
    }
    const stateModeId = normalizeBlacksmithModeId(state.modeId);
    if (!effectiveShiftModeId || !shiftModes.some(mode => mode.id === effectiveShiftModeId)) {
      effectiveShiftModeId = stateModeId || effectiveShiftModeId;
    }
    shiftModes.forEach(mode => {
      mode.isSelected = mode.id === effectiveShiftModeId;
    });
    const effectiveModeId = effectiveShiftModeId || stateModeId || null;
    const effectiveTask = state.task === 'salvage' || effectiveModeId === 'salvage' ? 'salvage' : 'craft';
    blacksmith = {
      task: effectiveTask,
      salvageQueue: queueItems,
      inventory: inventoryItems,
      modeId: effectiveModeId,
    };
  }
  const activeShiftModeId = effectiveShiftModeId;
  return {
    id: jobDef.id,
    name: jobDef.name,
    attribute: jobDef.attribute,
    description: jobDef.description,
    category: jobDef.category,
    behavior: jobDef.behavior,
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
    shiftModes,
    activeShiftModeId,
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
    ? await buildActiveJobStatus(jobState, activeJobDef, now, equipmentMap, config, characterDoc)
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

function ensureBlacksmithJob(jobState) {
  if (!jobState || jobState.jobId !== 'blacksmith') {
    throw new Error('blacksmith profession required');
  }
  let stateChanged = false;
  let selectionChanged = false;
  if (!jobState.blacksmith || typeof jobState.blacksmith !== 'object') {
    jobState.blacksmith = { task: 'craft', salvageQueue: [], modeId: 'forge' };
    stateChanged = true;
  }
  const state = jobState.blacksmith;
  if (!Array.isArray(state.salvageQueue)) {
    state.salvageQueue = [];
    stateChanged = true;
  }
  if (!jobState.shiftSelections || typeof jobState.shiftSelections !== 'object') {
    jobState.shiftSelections = {};
  }
  const rawSelection = jobState.shiftSelections[jobState.jobId];
  const normalizedSelection = rawSelection ? normalizeBlacksmithModeId(rawSelection) : null;
  if (rawSelection && normalizedSelection !== rawSelection) {
    jobState.shiftSelections[jobState.jobId] = normalizedSelection;
    selectionChanged = true;
  }
  const expectedMode = normalizedSelection
    ? normalizedSelection
    : state.modeId === 'salvage'
      ? 'salvage'
      : 'forge';
  const expectedTask = expectedMode === 'salvage' ? 'salvage' : 'craft';
  if (!normalizedSelection && jobState.shiftSelections[jobState.jobId] !== expectedMode) {
    jobState.shiftSelections[jobState.jobId] = expectedMode;
    selectionChanged = true;
  }
  if (state.modeId !== expectedMode) {
    state.modeId = expectedMode;
    stateChanged = true;
  }
  if (state.task !== expectedTask) {
    state.task = expectedTask;
    stateChanged = true;
  }
  return { state, changed: stateChanged, selectionChanged };
}

async function setBlacksmithTask(playerId, characterId, task) {
  const pid = Number(playerId);
  const cid = Number(characterId);
  const requestedRaw = typeof task === 'string' ? task.trim().toLowerCase() : '';
  const modeId = requestedRaw === 'salvage'
    ? 'salvage'
    : requestedRaw === 'forge' || requestedRaw === 'craft' || requestedRaw === 'forging'
      ? 'forge'
      : null;
  if (!Number.isFinite(pid) || !Number.isFinite(cid) || !modeId) {
    throw new Error('playerId, characterId and valid task required');
  }
  const config = await loadJobConfig();
  const characterDoc = await CharacterModel.findOne({ playerId: pid, characterId: cid });
  if (!characterDoc) {
    throw new Error('character not found');
  }
  const jobState = ensureJobState(characterDoc);
  if (!jobState.jobId) {
    throw new Error('profession not selected');
  }
  if (jobState.jobId !== 'blacksmith') {
    throw new Error('blacksmith profession required');
  }
  if (jobState.isWorking) {
    throw new Error('clock out before changing modes');
  }
  const jobDef = config.jobsById.get('blacksmith');
  if (!jobDef) {
    throw new Error('blacksmith configuration missing');
  }
  const { changed: processedChanges } = await processJobForCharacter(characterDoc, { config });
  let jobChanged = processedChanges;
  let blacksmithChanged = false;
  const selectionResult = ensureShiftModeSelection(jobState, jobDef, {
    requestedModeId: modeId,
    strict: true,
  });
  const shiftSelectionChanged = !!selectionResult.changed;
  if (shiftSelectionChanged) {
    jobChanged = true;
  }
  if (jobState.blacksmith && typeof jobState.blacksmith === 'object') {
    const normalizedMode = normalizeBlacksmithModeId(modeId);
    if (jobState.blacksmith.modeId !== normalizedMode) {
      jobState.blacksmith.modeId = normalizedMode;
      blacksmithChanged = true;
    }
    const expectedTask = normalizedMode === 'salvage' ? 'salvage' : 'craft';
    if (jobState.blacksmith.task !== expectedTask) {
      jobState.blacksmith.task = expectedTask;
      blacksmithChanged = true;
    }
  }
  if (blacksmithChanged) {
    jobChanged = true;
  }
  if (jobChanged && typeof characterDoc.markModified === 'function') {
    characterDoc.markModified('job');
    if (shiftSelectionChanged) {
      characterDoc.markModified('job.shiftSelections');
    }
    if (blacksmithChanged) {
      characterDoc.markModified('job.blacksmith');
    }
  }
  if (jobChanged) {
    await characterDoc.save();
  }
  return buildStatusForDoc(characterDoc, config);
}

async function addBlacksmithQueueItem(playerId, characterId, itemId) {
  const pid = Number(playerId);
  const cid = Number(characterId);
  const targetId = typeof itemId === 'string' ? itemId.trim() : '';
  if (!Number.isFinite(pid) || !Number.isFinite(cid) || !targetId) {
    throw new Error('playerId, characterId and itemId required');
  }
  const config = await loadJobConfig();
  const [characterDoc, equipmentMap] = await Promise.all([
    CharacterModel.findOne({ playerId: pid, characterId: cid }),
    getEquipmentMap(),
  ]);
  if (!characterDoc) {
    throw new Error('character not found');
  }
  const jobState = ensureJobState(characterDoc);
  if (jobState.jobId !== 'blacksmith') {
    throw new Error('blacksmith profession required');
  }
  const { changed: processedChanges } = await processJobForCharacter(characterDoc, { config });
  let docChanged = processedChanges;
  if (!Array.isArray(characterDoc.items)) {
    characterDoc.items = [];
  }
  const inventoryIndex = characterDoc.items.indexOf(targetId);
  if (inventoryIndex === -1) {
    throw new Error('item not found in inventory');
  }
  const resolved = await resolveItem(characterDoc, targetId, equipmentMap);
  if (!resolved || resolved.slot === 'useable') {
    throw new Error('item cannot be salvaged');
  }
  const [removed] = characterDoc.items.splice(inventoryIndex, 1);
  const { state: blacksmithState, changed: blacksmithChanged, selectionChanged } = ensureBlacksmithJob(jobState);
  blacksmithState.salvageQueue.push(removed);
  docChanged = true;
  if (blacksmithChanged) {
    docChanged = true;
  }
  if (typeof characterDoc.markModified === 'function') {
    characterDoc.markModified('items');
    characterDoc.markModified('job');
    characterDoc.markModified('job.blacksmith');
    if (selectionChanged) {
      characterDoc.markModified('job.shiftSelections');
    }
  }
  if (docChanged) {
    await characterDoc.save();
  }
  return buildStatusForDoc(characterDoc, config);
}

async function removeBlacksmithQueueItem(playerId, characterId, itemId) {
  const pid = Number(playerId);
  const cid = Number(characterId);
  const targetId = typeof itemId === 'string' ? itemId.trim() : '';
  if (!Number.isFinite(pid) || !Number.isFinite(cid) || !targetId) {
    throw new Error('playerId, characterId and itemId required');
  }
  const config = await loadJobConfig();
  const characterDoc = await CharacterModel.findOne({ playerId: pid, characterId: cid });
  if (!characterDoc) {
    throw new Error('character not found');
  }
  const jobState = ensureJobState(characterDoc);
  if (jobState.jobId !== 'blacksmith') {
    throw new Error('blacksmith profession required');
  }
  const { changed: processedChanges } = await processJobForCharacter(characterDoc, { config });
  let docChanged = processedChanges;
  const { state: blacksmithState, changed: blacksmithChanged, selectionChanged } = ensureBlacksmithJob(jobState);
  const queue = Array.isArray(blacksmithState.salvageQueue) ? blacksmithState.salvageQueue : [];
  const queueIndex = queue.indexOf(targetId);
  if (queueIndex === -1) {
    throw new Error('item not in salvage queue');
  }
  const [queued] = queue.splice(queueIndex, 1);
  if (!Array.isArray(characterDoc.items)) {
    characterDoc.items = [];
  }
  characterDoc.items.push(queued);
  docChanged = true;
  if (blacksmithChanged) {
    docChanged = true;
  }
  if (typeof characterDoc.markModified === 'function') {
    characterDoc.markModified('items');
    characterDoc.markModified('job');
    characterDoc.markModified('job.blacksmith');
    if (selectionChanged) {
      characterDoc.markModified('job.shiftSelections');
    }
  }
  if (docChanged) {
    await characterDoc.save();
  }
  return buildStatusForDoc(characterDoc, config);
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
  };
  const newJobState = ensureJobState(characterDoc);
  const { changed: modeChanged } = ensureShiftModeSelection(newJobState, jobDef);
  if (typeof characterDoc.markModified === 'function') {
    characterDoc.markModified('job');
  }
  if (modeChanged && typeof characterDoc.markModified === 'function') {
    characterDoc.markModified('job.shiftSelections');
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

async function setJobWorkingState(playerId, characterId, shouldWork, options = {}) {
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
  const jobDef = config.jobsById.get(jobState.jobId);
  if (!jobDef) {
    throw new Error('job configuration missing');
  }
  const modeIdRaw = options && typeof options.modeId === 'string' && options.modeId.trim()
    ? options.modeId.trim().toLowerCase()
    : null;
  const { changed: processedChanges } = await processJobForCharacter(characterDoc, { config, now });
  let jobChanged = false;
  let selectedMode = null;
  let blacksmithChanged = false;
  const selectionResult = ensureShiftModeSelection(jobState, jobDef, {
    requestedModeId: modeIdRaw,
    strict: !!modeIdRaw,
  });
  selectedMode = selectionResult.mode;
  const shiftSelectionChanged = !!selectionResult.changed;
  if (shiftSelectionChanged) {
    jobChanged = true;
  }
  if (jobDef.isBlacksmith && jobState.blacksmith && typeof jobState.blacksmith === 'object') {
    const modeFromSelection = selectedMode ? normalizeBlacksmithModeId(selectedMode.id) : null;
    if (modeFromSelection) {
      if (jobState.blacksmith.modeId !== modeFromSelection) {
        jobState.blacksmith.modeId = modeFromSelection;
        jobChanged = true;
        blacksmithChanged = true;
      }
      const expectedTask = modeFromSelection === 'salvage' ? 'salvage' : 'craft';
      if (jobState.blacksmith.task !== expectedTask) {
        jobState.blacksmith.task = expectedTask;
        jobChanged = true;
        blacksmithChanged = true;
      }
    }
  }
  if (shouldWork && Array.isArray(jobDef.shiftModes) && jobDef.shiftModes.length && !selectedMode) {
    throw new Error('work mode unavailable');
  }
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
    if (shiftSelectionChanged) {
      characterDoc.markModified('job.shiftSelections');
    }
    if (blacksmithChanged) {
      characterDoc.markModified('job.blacksmith');
    }
  }
  if (jobChanged || processedChanges) {
    await characterDoc.save();
  }
  return buildStatusForDoc(characterDoc, config);
}

async function startJobWork(playerId, characterId, options = {}) {
  return setJobWorkingState(playerId, characterId, true, options);
}

async function stopJobWork(playerId, characterId, options = {}) {
  return setJobWorkingState(playerId, characterId, false, options);
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
  setBlacksmithTask,
  addBlacksmithQueueItem,
  removeBlacksmithQueueItem,
};
