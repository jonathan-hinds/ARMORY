const path = require('path');
const CharacterModel = require('../models/Character');
const { serializeCharacter, readMaterialCount } = require('../models/utils');
const { readJSON } = require('../store/jsonStore');
const { getEquipmentMap } = require('./equipmentService');

const DATA_DIR = path.join(__dirname, '..', 'data');
const JOB_CONFIG_FILE = path.join(DATA_DIR, 'jobConfig.json');

const DEFAULT_CONFIG = {
  hourSeconds: 3600,
  craftsPerHour: 3,
  statGainChance: 0.05,
  statGainAmount: 1,
  logLimit: 30,
  rarityWeights: {
    Common: 6,
    Uncommon: 3,
    Rare: 1,
    Epic: 1,
    Legendary: 1,
  },
};

let configCache = null;

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
  const itemsRaw = Array.isArray(entry.items) ? entry.items : [];
  const items = itemsRaw.map(normalizeJobItem).filter(Boolean);
  if (!items.length) {
    return null;
  }
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
    rarityWeights,
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
  const rarityWeights = normalizeRarityWeights(source.rarityWeights, DEFAULT_CONFIG.rarityWeights);
  const base = { hourSeconds, craftsPerHour, statGainChance, statGainAmount, logLimit, rarityWeights };
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

async function loadJobConfig() {
  if (!configCache) {
    let raw;
    try {
      raw = await readJSON(JOB_CONFIG_FILE);
    } catch (err) {
      raw = {};
    }
    const normalized = normalizeConfig(raw);
    const jobsById = new Map(normalized.jobs.map(job => [job.id, job]));
    configCache = { ...normalized, jobsById };
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
    } else {
      container.delete(id);
    }
  } else if (numeric > 0) {
    container[id] = numeric;
  } else {
    delete container[id];
  }
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
  };
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
  for (let i = 0; i < attempts; i += 1) {
    jobState.totalAttempts += 1;
    const attemptTime = new Date(baseTime.getTime() + (i + 1) * interval * 1000);
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
    const event = {
      timestamp: attemptTime,
      type: canCraft ? 'crafted' : 'failed',
      itemId: jobItem.itemId,
      itemName: item ? item.name : null,
      rarity: item ? item.rarity || null : null,
      materials: recipe,
    };
    if (!canCraft) {
      event.reason = 'insufficient-materials';
      event.missing = missing;
      recordJobEvent(jobState, event, logLimit);
      jobChanged = true;
      continue;
    }
    Object.entries(recipe).forEach(([materialId, qty]) => {
      const required = sanitizePositiveInteger(qty);
      if (!required) return;
      const available = readMaterialCount(characterDoc.materials, materialId);
      const remaining = Math.max(0, available - required);
      setMaterialCount(characterDoc.materials, materialId, remaining);
    });
    materialsChanged = true;
    const craftedId = jobItem.itemId;
    characterDoc.items.push(craftedId);
    itemsChanged = true;
    jobState.totalCrafted += 1;
    const totals = jobState.totalsByItem;
    const prev = Number.isFinite(totals[craftedId]) ? totals[craftedId] : 0;
    totals[craftedId] = prev + 1;
    const gainChance = jobDef.statGainChance != null ? jobDef.statGainChance : config.statGainChance;
    const gainAmount = jobDef.statGainAmount != null ? jobDef.statGainAmount : config.statGainAmount;
    if (gainAmount > 0 && gainChance > 0 && Math.random() < gainChance) {
      const stat = jobDef.attribute && jobDef.attribute.trim ? jobDef.attribute.trim() : null;
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
      }
    }
    recordJobEvent(jobState, event, logLimit);
    jobChanged = true;
  }
  jobState.lastProcessedAt = new Date(baseTime.getTime() + attempts * interval * 1000);
  jobChanged = true;
  if (typeof characterDoc.markModified === 'function') {
    if (materialsChanged) characterDoc.markModified('materials');
    if (itemsChanged) characterDoc.markModified('items');
    if (attributesChanged) characterDoc.markModified('attributes');
    if (jobChanged) characterDoc.markModified('job');
  }
  return { changed: materialsChanged || itemsChanged || attributesChanged || jobChanged, job: jobDef, attempts };
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
  return {
    timestamp: timestamp && !Number.isNaN(timestamp.getTime()) ? timestamp.toISOString() : null,
    type: entry.type === 'failed' ? 'failed' : 'crafted',
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
    craftsPerHour: job.craftsPerHour,
    statGainChance: job.statGainChance,
    statGainAmount: job.statGainAmount,
    items,
  };
}

function buildActiveJobStatus(jobState, jobDef, now, equipmentMap, config) {
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
  return {
    id: jobDef.id,
    name: jobDef.name,
    attribute: jobDef.attribute,
    description: jobDef.description,
    category: jobDef.category,
    startedAt: startedAt && !Number.isNaN(startedAt.getTime()) ? startedAt.toISOString() : null,
    lastProcessedAt: lastProcessed && !Number.isNaN(lastProcessed.getTime()) ? lastProcessed.toISOString() : null,
    craftsPerHour: jobDef.craftsPerHour,
    craftIntervalSeconds: jobDef.craftIntervalSeconds,
    statGainChance: jobDef.statGainChance,
    statGainAmount: jobDef.statGainAmount,
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
  };
}

async function buildStatusForDoc(characterDoc, config) {
  const equipmentMap = await getEquipmentMap();
  const now = new Date();
  const jobState = ensureJobState(characterDoc);
  const activeJobDef = jobState.jobId ? config.jobsById.get(jobState.jobId) : null;
  const jobs = config.jobs.map(job => buildPublicJob(job, equipmentMap));
  const activeJob = activeJobDef ? buildActiveJobStatus(jobState, activeJobDef, now, equipmentMap, config) : null;
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

module.exports = {
  getJobStatus,
  selectJob,
  processJobForCharacter,
  loadJobConfig,
  startJobWork,
  stopJobWork,
  ensureJobIdle,
  ensureJobIdleForDoc,
};
