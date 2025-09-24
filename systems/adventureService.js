const path = require('path');
const AdventureStateModel = require('../models/AdventureState');
const {
  serializeCharacter,
  STATS,
  readMaterialCount,
  writeMaterialCount,
  findItemIndex,
  countItems,
  matchesItemId,
} = require('../models/utils');
const { readJSON } = require('../store/jsonStore');
const {
  buildChallengeContext,
  findChampion,
  buildAICharacter,
  rewardForRound,
  normalizeGenome,
  computePlayerGear,
  buildOpponentPreview,
} = require('./challengeGA');
const { runCombat } = require('./combatEngine');
const { getMaterialMap } = require('./materialService');
const { ensureJobIdleForDoc } = require('./jobService');

const DATA_DIR = path.join(__dirname, '..', 'data');
const ADVENTURE_CONFIG_FILE = path.join(DATA_DIR, 'adventureConfig.json');

const DEFAULT_DAY_MINUTES = 30;
const DEFAULT_TOTAL_DAYS = 3;
const DEFAULT_EVENT_INTERVAL = { min: 5, max: 10 };
const DEFAULT_MAX_LOG = 50;
const DEFAULT_MAX_HISTORY = 20;

let configCache = null;

function clone(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function formatMessage(template, values = {}) {
  if (!template || typeof template !== 'string') return '';
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    if (Object.prototype.hasOwnProperty.call(values, key) && values[key] != null) {
      return String(values[key]);
    }
    return match;
  });
}

function normalizeAmount(amount) {
  if (typeof amount === 'number' && Number.isFinite(amount)) {
    const rounded = Math.round(amount);
    return { min: rounded, max: rounded };
  }
  if (amount && typeof amount === 'object') {
    const min = Number.isFinite(amount.min) ? amount.min : amount.max;
    const max = Number.isFinite(amount.max) ? amount.max : amount.min;
    if (Number.isFinite(min) && Number.isFinite(max)) {
      const lo = Math.round(Math.min(min, max));
      const hi = Math.round(Math.max(min, max));
      return { min: lo, max: hi };
    }
  }
  return { min: 0, max: 0 };
}

function normalizeEvent(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const type = entry.type;
  if (!type) return null;
  const weight = Number.isFinite(entry.weight) ? Math.max(0, entry.weight) : 0;
  const normalized = {
    id: typeof entry.id === 'string' ? entry.id : null,
    type,
    weight,
    message: typeof entry.message === 'string' ? entry.message : '',
  };
  if (type === 'gold' || type === 'xp') {
    normalized.amount = normalizeAmount(entry.amount);
  } else if (type === 'item' || type === 'material') {
    const weights = entry.rarityWeights && typeof entry.rarityWeights === 'object' ? entry.rarityWeights : {};
    normalized.rarityWeights = Object.entries(weights).reduce((acc, [rarity, value]) => {
      const num = Number.isFinite(value) ? Math.max(0, value) : 0;
      if (num > 0) acc[rarity] = num;
      return acc;
    }, {});
  }
  return normalized;
}

function normalizeConfig(raw) {
  const config = raw && typeof raw === 'object' ? raw : {};
  const dayDurationMinutes = Number.isFinite(config.dayDurationMinutes)
    ? Math.max(1, config.dayDurationMinutes)
    : DEFAULT_DAY_MINUTES;
  const requestedDefaultDays = Number.isFinite(config.totalDays)
    ? Math.max(1, Math.round(config.totalDays))
    : DEFAULT_TOTAL_DAYS;
  const rawInterval = config.eventIntervalMinutes && typeof config.eventIntervalMinutes === 'object'
    ? config.eventIntervalMinutes
    : DEFAULT_EVENT_INTERVAL;
  const minInterval = Number.isFinite(rawInterval.min) ? Math.max(1, rawInterval.min) : DEFAULT_EVENT_INTERVAL.min;
  const maxInterval = Number.isFinite(rawInterval.max)
    ? Math.max(minInterval, rawInterval.max)
    : Math.max(minInterval, DEFAULT_EVENT_INTERVAL.max);
  const maxLogEntries = Number.isFinite(config.maxLogEntries)
    ? Math.max(10, Math.round(config.maxLogEntries))
    : DEFAULT_MAX_LOG;
  const maxHistoryEntries = Number.isFinite(config.maxHistoryEntries)
    ? Math.max(1, Math.round(config.maxHistoryEntries))
    : DEFAULT_MAX_HISTORY;
  let dayOptions = [];
  if (Array.isArray(config.dayOptions)) {
    dayOptions = config.dayOptions
      .map(value => (Number.isFinite(value) ? Math.max(1, Math.round(value)) : null))
      .filter(value => value != null);
  }
  if (!dayOptions.length) {
    const maxDays = Number.isFinite(config.maxDays)
      ? Math.max(1, Math.round(config.maxDays))
      : Math.max(requestedDefaultDays, DEFAULT_TOTAL_DAYS);
    for (let day = 1; day <= maxDays; day += 1) {
      dayOptions.push(day);
    }
  }
  dayOptions = Array.from(new Set(dayOptions)).sort((a, b) => a - b);
  if (!dayOptions.length) {
    dayOptions = [requestedDefaultDays];
  }
  const defaultDays = dayOptions.includes(requestedDefaultDays)
    ? requestedDefaultDays
    : dayOptions[dayOptions.length - 1];
  const events = Array.isArray(config.events) ? config.events.map(normalizeEvent).filter(Boolean) : [];
  return {
    dayDurationMinutes,
    totalDays: defaultDays,
    defaultDays,
    dayOptions,
    eventIntervalMinutes: { min: minInterval, max: maxInterval },
    events,
    maxLogEntries,
    maxHistoryEntries,
  };
}

async function getAdventureConfig() {
  if (!configCache) {
    let raw = null;
    try {
      raw = await readJSON(ADVENTURE_CONFIG_FILE);
    } catch (err) {
      raw = {};
    }
    configCache = normalizeConfig(raw);
  }
  return configCache;
}

async function getState(characterId) {
  const doc = await AdventureStateModel.findOne({ characterId }).lean();
  return doc || null;
}

async function findState(characterId) {
  if (!Number.isFinite(characterId)) {
    return { state: null, created: false };
  }
  const state = await getState(characterId);
  if (!state) {
    return { state: null, created: false };
  }
  if (!Array.isArray(state.events)) {
    state.events = [];
  }
  if (!Array.isArray(state.history)) {
    state.history = [];
  }
  return { state, created: false };
}

async function persistState(state) {
  if (!state || typeof state.characterId !== 'number') {
    throw new Error('invalid adventure state');
  }
  const nullableNumbers = ['startedAt', 'endsAt', 'nextEventAt', 'completedAt'];
  nullableNumbers.forEach(key => {
    if (!Number.isFinite(state[key])) {
      state[key] = null;
    }
  });
  if (state.outcome == null) {
    state.outcome = null;
  }
  const payload = JSON.parse(JSON.stringify(state));
  payload.characterId = state.characterId;
  await AdventureStateModel.updateOne(
    { characterId: state.characterId },
    { $set: payload },
    { upsert: true }
  );
  return payload;
}

function createBaseState(characterId, config) {
  const dayDurationMs = Math.round((config.dayDurationMinutes || DEFAULT_DAY_MINUTES) * 60 * 1000);
  return {
    characterId,
    active: false,
    events: [],
    history: [],
    finalized: true,
    outcome: null,
    totalDays: config.totalDays,
    dayDurationMs,
    startedAt: null,
    completedAt: null,
    endsAt: null,
    nextEventAt: null,
    ga: { round: 1, parentA: null, parentB: null },
    updatedAt: Date.now(),
  };
}

function isStateActive(state) {
  if (!state || !state.active) return false;
  if (state.completedAt != null && state.completedAt <= Date.now()) return false;
  return true;
}

function computeDay(state, timestamp) {
  if (!state || !state.startedAt || !state.dayDurationMs) return 1;
  const offset = timestamp - state.startedAt;
  if (offset <= 0) return 1;
  const day = Math.floor(offset / state.dayDurationMs) + 1;
  return Math.min(Math.max(day, 1), state.totalDays || 1);
}

function appendEvent(state, event, config) {
  if (!state.events) state.events = [];
  const entry = {
    id: event.id || `${event.type || 'event'}-${event.timestamp || Date.now()}-${Math.floor(Math.random() * 1000)}`,
    type: event.type || 'info',
    timestamp: event.timestamp || Date.now(),
    day: event.day || computeDay(state, event.timestamp || Date.now()),
    message: event.message || '',
    amount: event.amount != null ? event.amount : null,
    rarity: event.rarity || null,
    item: event.item || null,
    material: event.material || null,
    result: event.result || null,
    rewards: event.rewards || null,
    opponent: event.opponent || null,
  };
  if (event.combat) {
    const combat = sanitizeCombatReplay(event.combat);
    if (combat) {
      entry.combat = combat;
    }
  }
  state.events.push(entry);
  const maxEntries = config.maxLogEntries || DEFAULT_MAX_LOG;
  if (state.events.length > maxEntries) {
    state.events.splice(0, state.events.length - maxEntries);
  }
  return entry;
}

function sanitizeOpponentPreview(preview) {
  if (!preview || typeof preview !== 'object') return null;
  const attributes = {};
  STATS.forEach(stat => {
    const raw = preview.attributes && preview.attributes[stat];
    attributes[stat] = Number.isFinite(raw) ? raw : 0;
  });
  const derived = preview.derived && typeof preview.derived === 'object' ? preview.derived : {};
  const sanitizedDerived = {
    attackIntervalSeconds: Number.isFinite(derived.attackIntervalSeconds) ? derived.attackIntervalSeconds : null,
    minMeleeAttack: Number.isFinite(derived.minMeleeAttack) ? derived.minMeleeAttack : null,
    maxMeleeAttack: Number.isFinite(derived.maxMeleeAttack) ? derived.maxMeleeAttack : null,
    minMagicAttack: Number.isFinite(derived.minMagicAttack) ? derived.minMagicAttack : null,
    maxMagicAttack: Number.isFinite(derived.maxMagicAttack) ? derived.maxMagicAttack : null,
    health: Number.isFinite(derived.health) ? derived.health : null,
    mana: Number.isFinite(derived.mana) ? derived.mana : null,
    stamina: Number.isFinite(derived.stamina) ? derived.stamina : null,
    meleeResist: Number.isFinite(derived.meleeResist) ? derived.meleeResist : null,
    magicResist: Number.isFinite(derived.magicResist) ? derived.magicResist : null,
  };
  const equipment = {};
  if (preview.equipment && typeof preview.equipment === 'object') {
    Object.entries(preview.equipment).forEach(([slot, value]) => {
      if (value != null) equipment[slot] = value;
    });
  }
  return {
    name: preview.name || null,
    basicType: preview.basicType || null,
    level: Number.isFinite(preview.level) ? preview.level : null,
    attributes,
    derived: sanitizedDerived,
    equipment,
    rotation: Array.isArray(preview.rotation) ? preview.rotation.slice() : [],
  };
}

function sanitizeCombatantState(state) {
  if (!state || typeof state !== 'object') return null;
  const ensureNumber = value => (Number.isFinite(value) ? value : 0);
  return {
    id: state.id != null ? state.id : null,
    name: state.name || null,
    health: ensureNumber(state.health),
    mana: ensureNumber(state.mana),
    stamina: ensureNumber(state.stamina),
    maxHealth: ensureNumber(state.maxHealth),
    maxMana: ensureNumber(state.maxMana),
    maxStamina: ensureNumber(state.maxStamina),
  };
}

function sanitizeCombatLogEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const message = entry.message != null ? String(entry.message) : '';
  const sanitized = { message };
  if (entry.sourceId != null) sanitized.sourceId = entry.sourceId;
  if (entry.targetId != null) sanitized.targetId = entry.targetId;
  if (entry.kind) sanitized.kind = entry.kind;
  return sanitized;
}

function sanitizeCombatLog(log) {
  if (!Array.isArray(log)) return [];
  return log
    .map(sanitizeCombatLogEntry)
    .filter(entry => entry && entry.message != null);
}

function sanitizeCombatUpdate(update) {
  if (!update || typeof update !== 'object') return null;
  const type = update.type === 'start' ? 'start' : 'update';
  const you = sanitizeCombatantState(update.you || update.a);
  const opponent = sanitizeCombatantState(update.opponent || update.b);
  if (!you || !opponent) return null;
  return {
    type,
    you,
    opponent,
    log: sanitizeCombatLog(update.log),
  };
}

function sanitizeCombatReplay(replay) {
  if (!replay || typeof replay !== 'object') return null;
  const updates = Array.isArray(replay.updates)
    ? replay.updates.map(sanitizeCombatUpdate).filter(Boolean)
    : [];
  if (!updates.length) return null;
  const sanitized = {
    updates,
    winnerId: replay.winnerId != null ? replay.winnerId : null,
    duration: Number.isFinite(replay.duration) ? replay.duration : null,
    youId: replay.youId != null ? replay.youId : null,
    opponentId: replay.opponentId != null ? replay.opponentId : null,
  };
  const finalYou = sanitizeCombatantState(replay.finalYou);
  if (finalYou) sanitized.finalYou = finalYou;
  const finalOpponent = sanitizeCombatantState(replay.finalOpponent);
  if (finalOpponent) sanitized.finalOpponent = finalOpponent;
  return sanitized;
}

function sanitizeEvent(event) {
  if (!event) return null;
  const sanitized = {
    id: event.id,
    type: event.type,
    timestamp: event.timestamp,
    day: event.day,
    message: event.message,
    amount: event.amount,
    rarity: event.rarity || (event.item && event.item.rarity) || null,
    result: event.result || null,
    rewards: event.rewards
      ? { xp: event.rewards.xp || 0, gold: event.rewards.gold || 0 }
      : null,
  };
  if (event.item) {
    sanitized.item = {
      id: event.item.id != null ? event.item.id : null,
      name: event.item.name,
      rarity: event.item.rarity || sanitized.rarity,
    };
  }
  if (event.material) {
    sanitized.material = {
      id: event.material.id != null ? event.material.id : null,
      name: event.material.name,
      rarity: event.material.rarity || sanitized.rarity,
      quantity: Number.isFinite(event.material.quantity) ? event.material.quantity : 1,
    };
  }
  if (event.opponent) {
    const opponent = {
      name: event.opponent.name || null,
      basicType: event.opponent.basicType || null,
      round: event.opponent.round != null ? event.opponent.round : null,
    };
    const preview = sanitizeOpponentPreview(event.opponent.preview);
    if (preview) {
      opponent.preview = preview;
    }
    if (event.opponent.id != null) {
      opponent.id = event.opponent.id;
    }
    sanitized.opponent = opponent;
  }
  if (event.combat && Array.isArray(event.combat.updates) && event.combat.updates.length) {
    sanitized.combat = {
      available: true,
      duration: Number.isFinite(event.combat.duration) ? event.combat.duration : null,
    };
  }
  return sanitized;
}

function randomIntervalMs(config) {
  const { min, max } = config.eventIntervalMinutes || DEFAULT_EVENT_INTERVAL;
  const lo = Math.max(1, Math.round(min * 60 * 1000));
  const hi = Math.max(lo, Math.round(max * 60 * 1000));
  if (lo === hi) return lo;
  const delta = hi - lo;
  return lo + Math.floor(Math.random() * (delta + 1));
}

function resolveAmountValue(amount) {
  const range = normalizeAmount(amount);
  if (range.min === range.max) return range.min;
  const delta = range.max - range.min;
  return range.min + Math.floor(Math.random() * (delta + 1));
}

function chooseEvent(events = []) {
  const eligible = events.filter(e => e && Number.isFinite(e.weight) && e.weight > 0);
  if (!eligible.length) return null;
  const totalWeight = eligible.reduce((acc, entry) => acc + entry.weight, 0);
  if (totalWeight <= 0) return eligible[Math.floor(Math.random() * eligible.length)];
  let roll = Math.random() * totalWeight;
  for (const entry of eligible) {
    roll -= entry.weight;
    if (roll <= 0) return entry;
  }
  return eligible[eligible.length - 1];
}

function buildRarityIndex(equipmentMap) {
  const byRarity = new Map();
  Array.from(equipmentMap.values()).forEach(item => {
    if (!item) return;
    const rarity = item.rarity || 'Common';
    if (!byRarity.has(rarity)) byRarity.set(rarity, []);
    byRarity.get(rarity).push(item);
  });
  return byRarity;
}

function buildMaterialRarityIndex(materialMap) {
  const byRarity = new Map();
  Array.from(materialMap.values()).forEach(material => {
    if (!material) return;
    const rarity = material.rarity || 'Common';
    if (!byRarity.has(rarity)) byRarity.set(rarity, []);
    byRarity.get(rarity).push(material);
  });
  return byRarity;
}

function pickItemReward(eventDef, bundle) {
  const rarityWeights = eventDef.rarityWeights || {};
  const byRarity = bundle.itemsByRarity;
  const entries = Object.entries(rarityWeights)
    .map(([rarity, weight]) => {
      const items = byRarity.get(rarity) || [];
      return { rarity, weight: Number.isFinite(weight) ? Math.max(0, weight) : 0, items };
    })
    .filter(entry => entry.weight > 0 && entry.items.length);
  let pool = entries;
  if (!pool.length) {
    pool = Array.from(byRarity.entries()).map(([rarity, items]) => ({ rarity, weight: items.length, items }));
  }
  if (!pool.length) {
    return { item: null, rarity: null };
  }
  const totalWeight = pool.reduce((acc, entry) => acc + entry.weight, 0);
  let roll = Math.random() * totalWeight;
  let chosen = pool[pool.length - 1];
  for (const entry of pool) {
    roll -= entry.weight;
    if (roll <= 0) {
      chosen = entry;
      break;
    }
  }
  const items = chosen.items.length ? chosen.items : pool.flatMap(p => p.items);
  if (!items.length) {
    return { item: null, rarity: null };
  }
  const item = items[Math.floor(Math.random() * items.length)];
  return { item, rarity: item.rarity || chosen.rarity || 'Common' };
}

function pickMaterialReward(eventDef, bundle) {
  const rarityWeights = eventDef.rarityWeights || {};
  const byRarity = bundle.materialsByRarity || new Map();
  const entries = Object.entries(rarityWeights)
    .map(([rarity, weight]) => {
      const materials = byRarity.get(rarity) || [];
      return { rarity, weight: Number.isFinite(weight) ? Math.max(0, weight) : 0, materials };
    })
    .filter(entry => entry.weight > 0 && entry.materials.length);
  let pool = entries;
  if (!pool.length) {
    pool = Array.from(byRarity.entries()).map(([rarity, materials]) => ({ rarity, weight: materials.length, materials }));
  }
  if (!pool.length) {
    return { material: null, rarity: null };
  }
  const totalWeight = pool.reduce((acc, entry) => acc + entry.weight, 0);
  let roll = Math.random() * totalWeight;
  let chosen = pool[pool.length - 1];
  for (const entry of pool) {
    roll -= entry.weight;
    if (roll <= 0) {
      chosen = entry;
      break;
    }
  }
  const materials = chosen.materials.length ? chosen.materials : pool.flatMap(p => p.materials);
  if (!materials.length) {
    return { material: null, rarity: null };
  }
  const material = materials[Math.floor(Math.random() * materials.length)];
  return { material, rarity: material.rarity || chosen.rarity || 'Common' };
}

function refreshBundle(bundle) {
  const serialized = serializeCharacter(bundle.characterDoc);
  bundle.character = serialized;
  bundle.context.baseCharacter = serialized;
  bundle.context.playerCharacter = serialized;
  const gear = computePlayerGear(serialized, bundle.equipmentMap);
  bundle.playerGear = gear;
  bundle.context.gearBudget = gear.gearScore;
  bundle.context.playerCosts = gear.playerCosts;
  const totalPoints = STATS.reduce((acc, stat) => acc + (serialized.attributes[stat] || 0), 0);
  bundle.context.totalPoints = totalPoints;
  return serialized;
}

function buildCompletionEvent(state, timestamp) {
  return {
    id: `complete-${timestamp}`,
    type: 'complete',
    timestamp,
    message: 'Adventure complete! Your hero returns victorious.',
  };
}

function buildFailureEvent(state, timestamp, details = {}) {
  const opponentName = details.opponent && details.opponent.name ? details.opponent.name : null;
  const baseMessage = opponentName
    ? `Defeated by ${opponentName}. The adventure ends prematurely.`
    : 'Defeated in battle. The adventure ends prematurely.';
  const event = {
    id: `failure-${timestamp}`,
    type: 'failure',
    timestamp,
    day: computeDay(state, timestamp),
    message: baseMessage,
    result: 'defeat',
  };
  if (details.opponent) {
    event.opponent = {
      name: details.opponent.name || null,
      basicType: details.opponent.basicType || null,
      round: details.opponent.round != null ? details.opponent.round : null,
    };
  }
  return event;
}

function collectAdventureSummary(state) {
  const summary = { xp: 0, gold: 0, items: [], materials: [] };
  if (!state || !Array.isArray(state.events)) {
    return summary;
  }
  const seenItems = new Set();
  const materialTotals = new Map();
  state.events.forEach(event => {
    if (!event) return;
    if (event.type === 'xp' && Number.isFinite(event.amount)) {
      summary.xp += Math.max(0, Math.round(event.amount));
    } else if (event.type === 'gold' && Number.isFinite(event.amount)) {
      summary.gold += Math.max(0, Math.round(event.amount));
    }
    if (event.type === 'combat' && event.rewards) {
      if (Number.isFinite(event.rewards.xp)) {
        summary.xp += Math.max(0, Math.round(event.rewards.xp));
      }
      if (Number.isFinite(event.rewards.gold)) {
        summary.gold += Math.max(0, Math.round(event.rewards.gold));
      }
    }
    if (event.item) {
      const id = event.item.id != null ? String(event.item.id) : null;
      const key = id || `${event.item.name || 'item'}-${event.item.rarity || ''}`;
      if (!seenItems.has(key)) {
        seenItems.add(key);
        summary.items.push({
          id: event.item.id != null ? event.item.id : null,
          name: event.item.name || null,
          rarity: event.item.rarity || event.rarity || null,
        });
      }
    }
    if (event.material) {
      const id = event.material.id != null ? String(event.material.id) : null;
      const key = id || `${event.material.name || 'material'}-${event.material.rarity || ''}`;
      const entry = materialTotals.get(key) || {
        id: event.material.id != null ? event.material.id : null,
        name: event.material.name || null,
        rarity: event.material.rarity || event.rarity || null,
        quantity: 0,
      };
      const quantity = Number.isFinite(event.material.quantity) ? event.material.quantity : 1;
      entry.quantity += quantity;
      materialTotals.set(key, entry);
    }
  });
  summary.materials = Array.from(materialTotals.values());
  return summary;
}

function finalizeAdventure(state, config, options = {}) {
  if (!state) return null;
  if (!Array.isArray(state.history)) {
    state.history = [];
  }
  if (state.finalized) {
    return null;
  }
  const endedAt = Number.isFinite(options.timestamp) ? options.timestamp : (state.completedAt || Date.now());
  const plannedDays = Number.isFinite(state.totalDays) ? Math.max(1, Math.round(state.totalDays)) : config.defaultDays;
  const dayDurationMs = state.dayDurationMs || Math.round((config.dayDurationMinutes || DEFAULT_DAY_MINUTES) * 60 * 1000);
  const startedAt = Number.isFinite(state.startedAt) ? state.startedAt : endedAt;
  const elapsed = Math.max(0, endedAt - startedAt);
  const completedRaw = dayDurationMs > 0 ? Math.floor(elapsed / dayDurationMs) : 0;
  const daysCompleted = Math.min(plannedDays, Math.max(0, completedRaw));
  const lastDay = Math.min(plannedDays, Math.max(1, computeDay(state, endedAt)));
  const outcome = options.outcome || state.outcome || 'complete';
  const rewards = collectAdventureSummary(state);
  const historyEntry = {
    id: `history-${state.characterId || 'hero'}-${endedAt}-${Math.floor(Math.random() * 1000)}`,
    startedAt,
    endedAt,
    plannedDays,
    daysCompleted,
    lastDay,
    outcome,
    rewards,
  };
  if (outcome === 'defeat' && options.opponent) {
    historyEntry.defeatedBy = {
      name: options.opponent.name || null,
      basicType: options.opponent.basicType || null,
    };
  }
  state.history.push(historyEntry);
  const maxHistory = config.maxHistoryEntries || DEFAULT_MAX_HISTORY;
  if (state.history.length > maxHistory) {
    state.history.splice(0, state.history.length - maxHistory);
  }
  state.finalized = true;
  state.updatedAt = Date.now();
  return historyEntry;
}

function sanitizeHistoryEntry(entry) {
  if (!entry) return null;
  const rewards = entry.rewards || {};
  const items = Array.isArray(rewards.items)
    ? rewards.items
        .map(item => ({
          id: item && item.id != null ? item.id : null,
          name: item && item.name ? item.name : null,
          rarity: item && item.rarity ? item.rarity : null,
        }))
        .filter(item => item.name || item.rarity || item.id != null)
    : [];
  const materials = Array.isArray(rewards.materials)
    ? rewards.materials
        .map(material => ({
          id: material && material.id != null ? material.id : null,
          name: material && material.name ? material.name : null,
          rarity: material && material.rarity ? material.rarity : null,
          quantity: Number.isFinite(material && material.quantity) ? material.quantity : 1,
        }))
        .filter(material => material.name || material.rarity || material.id != null)
    : [];
  return {
    id: entry.id,
    startedAt: entry.startedAt || null,
    endedAt: entry.endedAt || null,
    plannedDays: entry.plannedDays || null,
    daysCompleted: entry.daysCompleted != null ? entry.daysCompleted : null,
    lastDay: entry.lastDay != null ? entry.lastDay : null,
    outcome: entry.outcome || null,
    rewards: {
      xp: Number.isFinite(rewards.xp) ? rewards.xp : 0,
      gold: Number.isFinite(rewards.gold) ? rewards.gold : 0,
      items,
      materials,
    },
    defeatedBy: entry.defeatedBy
      ? {
          name: entry.defeatedBy.name || null,
          basicType: entry.defeatedBy.basicType || null,
        }
      : null,
  };
}

async function resolveAdventureEvent(state, config, bundle, eventDef, timestamp) {
  const event = {
    id: `${eventDef.id || eventDef.type}-${timestamp}-${Math.floor(Math.random() * 1000)}`,
    type: eventDef.type,
    timestamp,
  };
  let characterDirty = false;
  let ended = null;
  let defeatOpponent = null;
  if (eventDef.type === 'gold') {
    const amount = resolveAmountValue(eventDef.amount);
    bundle.characterDoc.gold = (bundle.characterDoc.gold || 0) + amount;
    characterDirty = true;
    event.amount = amount;
    event.message = formatMessage(eventDef.message, { amount }) || `Found ${amount} gold.`;
  } else if (eventDef.type === 'xp') {
    const amount = resolveAmountValue(eventDef.amount);
    bundle.characterDoc.xp = (bundle.characterDoc.xp || 0) + amount;
    characterDirty = true;
    event.amount = amount;
    event.message = formatMessage(eventDef.message, { amount }) || `Gained ${amount} experience.`;
  } else if (eventDef.type === 'item') {
    const { item, rarity } = pickItemReward(eventDef, bundle);
    if (item) {
      if (!Array.isArray(bundle.characterDoc.items)) {
        bundle.characterDoc.items = [];
      }
      bundle.characterDoc.items.push(item.id);
      characterDirty = true;
      if (typeof bundle.characterDoc.markModified === 'function') {
        bundle.characterDoc.markModified('items');
      }
      event.item = { id: item.id, name: item.name, rarity };
      event.rarity = rarity;
      event.message = formatMessage(eventDef.message, { item: item.name, rarity })
        || `Recovered a ${rarity} item: ${item.name}.`;
    } else {
      event.message = 'The search turned up nothing of value.';
    }
  } else if (eventDef.type === 'material') {
    const { material, rarity } = pickMaterialReward(eventDef, bundle);
    if (material) {
      if (!bundle.characterDoc.materials || typeof bundle.characterDoc.materials !== 'object') {
        bundle.characterDoc.materials = {};
      }
      const current = readMaterialCount(bundle.characterDoc.materials, material.id);
      writeMaterialCount(bundle.characterDoc.materials, material.id, current + 1);
      characterDirty = true;
      if (typeof bundle.characterDoc.markModified === 'function') {
        bundle.characterDoc.markModified('materials');
      }
      event.material = { id: material.id, name: material.name, rarity, quantity: 1 };
      event.rarity = rarity;
      event.message =
        formatMessage(eventDef.message, { material: material.name, rarity })
          || `Discovered a ${rarity} material: ${material.name}.`;
    } else {
      event.message = 'The expedition turned up only broken scraps.';
    }
  } else if (eventDef.type === 'combat') {
    const round = state.ga && state.ga.round ? state.ga.round : 1;
    bundle.context.round = round;
    const parentA = state.ga && state.ga.parentA ? normalizeGenome(state.ga.parentA, bundle.context) : null;
    const parentB = state.ga && state.ga.parentB ? normalizeGenome(state.ga.parentB, bundle.context) : null;
    const { champion, partner } = await findChampion(bundle.context, parentA, parentB);
    const opponent = buildAICharacter(
      champion.genome,
      bundle.character,
      0,
      round,
      { stableId: `adventure-${bundle.character.id}-${Date.now()}` },
    );
    champion.genome.name = opponent.name;
    const intro = formatMessage(eventDef.message, { opponent: opponent.name }) || `Ambushed by ${opponent.name}!`;
    const playerClone = clone(bundle.character);
    const opponentClone = clone(opponent);
    const combatUpdates = [];
    const result = await runCombat(
      playerClone,
      opponentClone,
      bundle.context.abilityMap,
      bundle.context.equipmentMap,
      update => {
        const record = sanitizeCombatUpdate(update);
        if (record) {
          combatUpdates.push(record);
        }
      },
      { fastForward: true },
    );
    const playerWon = String(result.winnerId) === String(bundle.character.id);
    const rewards = rewardForRound(round, bundle.characterDoc.level || 1);
    let xpGain = 0;
    let goldGain = 0;

    const consumed = result.consumedUseables || {};
    const consumedByPlayer = consumed[bundle.character.id] || [];
    if (consumedByPlayer.length) {
      if (!Array.isArray(bundle.characterDoc.items)) {
        bundle.characterDoc.items = [];
      }
      if (!bundle.characterDoc.useables) {
        bundle.characterDoc.useables = { useable1: null, useable2: null };
      }
      let modifiedUseables = false;
      let itemsModified = false;
      consumedByPlayer.forEach(entry => {
        const idx = findItemIndex(bundle.characterDoc.items, entry.itemId);
        if (idx !== -1) {
          bundle.characterDoc.items.splice(idx, 1);
          itemsModified = true;
        }
        if (matchesItemId(bundle.characterDoc.useables[entry.slot], entry.itemId)) {
          const remaining = countItems(bundle.characterDoc.items, entry.itemId);
          if (remaining <= 0) {
            bundle.characterDoc.useables[entry.slot] = null;
            modifiedUseables = true;
          }
        }
      });
      if (itemsModified && typeof bundle.characterDoc.markModified === 'function') {
        bundle.characterDoc.markModified('items');
      }
      if (modifiedUseables) {
        characterDirty = true;
        if (typeof bundle.characterDoc.markModified === 'function') {
          bundle.characterDoc.markModified('useables');
        }
      }
      if (itemsModified) {
        characterDirty = true;
      }
    }

    if (playerWon) {
      xpGain = rewards.xpGain;
      goldGain = rewards.goldGain;
      bundle.characterDoc.xp = (bundle.characterDoc.xp || 0) + xpGain;
      bundle.characterDoc.gold = (bundle.characterDoc.gold || 0) + goldGain;
      characterDirty = true;
      state.ga = {
        round: round + 1,
        parentA: clone(champion.genome),
        parentB: clone((partner && partner.genome) || champion.genome),
      };
    } else {
      state.ga = { round: 1, parentA: null, parentB: null };
      ended = 'defeat';
      defeatOpponent = { name: opponent.name, basicType: opponent.basicType, round };
    }
    event.opponent = { name: opponent.name, basicType: opponent.basicType, round, id: opponent.id || null };
    const preview = buildOpponentPreview(opponent, bundle.equipmentMap);
    if (preview) {
      event.opponent.preview = preview;
    }
    event.rewards = { xp: xpGain, gold: goldGain };
    event.result = playerWon ? 'victory' : 'defeat';
    const rewardText = xpGain || goldGain ? ` +${xpGain} XP, +${goldGain} gold.` : '';
    event.message = `${intro} ${playerWon ? 'Victory!' : 'Defeat...'}${rewardText}`.trim();
    const combatReplay = sanitizeCombatReplay({
      updates: combatUpdates,
      winnerId: result.winnerId,
      duration: result.duration,
      youId: bundle.character.id,
      opponentId: opponent.id || null,
      finalYou: result.finalA,
      finalOpponent: result.finalB,
    });
    if (combatReplay) {
      event.combat = combatReplay;
    }
  } else {
    event.message = 'A quiet moment passes on the journey.';
  }
  appendEvent(state, event, config);
  state.updatedAt = Date.now();
  return { characterDirty, ended, opponent: defeatOpponent };
}

async function advanceAdventureState(state, config, bundle) {
  if (!state) {
    return { mutated: false, characterDirty: false };
  }
  let mutated = false;
  let characterDirty = false;
  let finalizeOptions = null;

  if (!isStateActive(state)) {
    if (state.active && state.endsAt && Date.now() >= state.endsAt) {
      state.active = false;
      state.completedAt = state.completedAt || Date.now();
      state.nextEventAt = null;
      state.outcome = state.outcome || 'complete';
      appendEvent(state, buildCompletionEvent(state, state.completedAt), config);
      mutated = true;
      finalizeOptions = { outcome: state.outcome, timestamp: state.completedAt };
    }
  } else {
    while (
      state.active &&
      state.nextEventAt != null &&
      state.nextEventAt <= Date.now() &&
      state.nextEventAt < state.endsAt
    ) {
      const timestamp = state.nextEventAt;
      const eventDef = chooseEvent(config.events);
      if (!eventDef) {
        state.nextEventAt = Math.min(timestamp + randomIntervalMs(config), state.endsAt);
        mutated = true;
        continue;
      }
      const result = await resolveAdventureEvent(state, config, bundle, eventDef, timestamp);
      if (result.characterDirty) {
        characterDirty = true;
        refreshBundle(bundle);
      }
      mutated = true;
      const nextAt = timestamp + randomIntervalMs(config);
      state.nextEventAt = Math.min(nextAt, state.endsAt);
      bundle.context.round = state.ga && state.ga.round ? state.ga.round : bundle.context.round;
      if (result.ended) {
        state.active = false;
        state.completedAt = timestamp;
        state.endsAt = Math.min(state.endsAt || timestamp, timestamp);
        state.nextEventAt = null;
        state.outcome = result.ended;
        if (result.ended === 'defeat') {
          appendEvent(state, buildFailureEvent(state, timestamp, { opponent: result.opponent }), config);
          finalizeOptions = { outcome: 'defeat', opponent: result.opponent, timestamp };
        } else {
          appendEvent(state, buildCompletionEvent(state, timestamp), config);
          finalizeOptions = { outcome: result.ended, timestamp };
        }
        break;
      }
    }
    if (state.active && Date.now() >= state.endsAt) {
      state.active = false;
      state.completedAt = state.endsAt;
      state.nextEventAt = null;
      state.outcome = state.outcome || 'complete';
      appendEvent(state, buildCompletionEvent(state, state.completedAt), config);
      mutated = true;
      finalizeOptions = { outcome: state.outcome, timestamp: state.completedAt };
    }
  }

  if (!state.active && state.completedAt && !state.finalized) {
    const finalized = finalizeAdventure(state, config, finalizeOptions || { outcome: state.outcome });
    if (finalized) {
      mutated = true;
    }
  }

  if (mutated) {
    state.updatedAt = Date.now();
  }
  return { mutated, characterDirty };
}

function buildAdventurePayload(state, config, characterDoc, extra = {}) {
  const now = Date.now();
  const dayDurationMs = state && state.dayDurationMs ? state.dayDurationMs : Math.round(config.dayDurationMinutes * 60 * 1000);
  const totalDays = state && state.totalDays ? state.totalDays : config.totalDays;
  const startedAt = state ? state.startedAt || null : null;
  const endsAt = state ? state.endsAt || (startedAt != null ? startedAt + dayDurationMs * totalDays : null) : null;
  const active = state ? isStateActive(state) : false;
  const elapsedMs = startedAt != null ? Math.max(0, Math.min(now, endsAt || now) - startedAt) : 0;
  const totalDurationMs = dayDurationMs * totalDays;
  const remainingMs = active && endsAt != null ? Math.max(0, endsAt - now) : 0;
  let currentDay = 0;
  if (startedAt != null) {
    currentDay = Math.min(totalDays, Math.max(1, Math.floor(elapsedMs / dayDurationMs) + 1));
  }
  if (!active && state && state.completedAt) {
    currentDay = totalDays;
  }
  const events = state && Array.isArray(state.events) ? state.events.map(sanitizeEvent).filter(Boolean) : [];
  const history = state && Array.isArray(state.history)
    ? state.history
        .map(sanitizeHistoryEntry)
        .filter(Boolean)
        .sort((a, b) => (b.endedAt || 0) - (a.endedAt || 0))
    : [];
  const character = characterDoc ? serializeCharacter(characterDoc) : null;
  return {
    active,
    startedAt,
    endsAt,
    totalDurationMs,
    remainingMs,
    dayDurationMs,
    totalDays,
    currentDay,
    nextEventAt: state ? state.nextEventAt || null : null,
    events,
    history,
    ga: state && state.ga ? { round: state.ga.round || 1 } : { round: 1 },
    character,
    completedAt: state && state.completedAt ? state.completedAt : null,
    updatedAt: state && state.updatedAt ? state.updatedAt : null,
    outcome: state && state.outcome ? state.outcome : (state && state.completedAt ? 'complete' : null),
    message: extra.error || null,
    config: {
      dayDurationMinutes: config.dayDurationMinutes,
      totalDays: config.totalDays,
      defaultDays: config.defaultDays,
      dayOptions: config.dayOptions,
      eventIntervalMinutes: config.eventIntervalMinutes,
      maxHistoryEntries: config.maxHistoryEntries,
    },
  };
}

async function loadBundle(characterId, options = {}) {
  try {
    const [bundle, materialMap] = await Promise.all([
      buildChallengeContext(characterId),
      getMaterialMap(),
    ]);
    bundle.itemsByRarity = buildRarityIndex(bundle.equipmentMap);
    bundle.materialMap = materialMap;
    bundle.materialsByRarity = buildMaterialRarityIndex(materialMap);
    refreshBundle(bundle);
    return { bundle, error: null };
  } catch (err) {
    return { bundle: null, error: err };
  }
}

async function getAdventureStatus(characterId) {
  const config = await getAdventureConfig();
  let state = await getState(characterId);
  const { bundle, error } = await loadBundle(characterId, { includePlayer: true });
  if (!bundle) {
    if (!state) {
      return buildAdventurePayload(null, config, null, { error: error ? error.message : null });
    }
    return buildAdventurePayload(state, config, null, { error: error ? error.message : null });
  }

  let stateChanged = false;
  if (!state) {
    state = createBaseState(characterId, config);
    stateChanged = true;
  }
  if (!Array.isArray(state.events)) {
    state.events = [];
    stateChanged = true;
  }
  if (!Array.isArray(state.history)) {
    state.history = [];
    stateChanged = true;
  }
  if (!state.dayDurationMs) {
    state.dayDurationMs = Math.round(config.dayDurationMinutes * 60 * 1000);
    stateChanged = true;
  }
  if (!Number.isFinite(state.totalDays) || state.totalDays <= 0) {
    state.totalDays = config.totalDays;
    stateChanged = true;
  }
  if (!state.ga || typeof state.ga !== 'object') {
    state.ga = { round: 1, parentA: null, parentB: null };
    stateChanged = true;
  }
  if (state.finalized == null) {
    state.finalized = !isStateActive(state);
    stateChanged = true;
  }

  const progress = await advanceAdventureState(state, config, bundle);
  if (progress.characterDirty) {
    await bundle.characterDoc.save();
  }
  if (progress.mutated) {
    stateChanged = true;
  }
  if (stateChanged) {
    await persistState(state);
  }
  return buildAdventurePayload(state, config, bundle.characterDoc, { error: error ? error.message : null });
}

async function startAdventure(characterId, options = {}) {
  const config = await getAdventureConfig();
  const state = await getState(characterId);
  const allowedDays = Array.isArray(config.dayOptions) && config.dayOptions.length ? config.dayOptions : [config.totalDays];
  const requestedDays = options && Number.isFinite(options.days) ? Math.max(1, Math.round(options.days)) : null;
  let totalDays = config.totalDays;
  if (requestedDays != null) {
    if (!allowedDays.includes(requestedDays)) {
      throw new Error('invalid adventure length');
    }
    totalDays = requestedDays;
  }
  const { bundle, error } = await loadBundle(characterId, { includePlayer: true });
  if (!bundle) {
    throw error || new Error('failed to prepare adventure');
  }
  ensureJobIdleForDoc(bundle.characterDoc);
  if (state) {
    let stateMutated = false;
    if (!Array.isArray(state.events)) {
      state.events = [];
      stateMutated = true;
    }
    if (!Array.isArray(state.history)) {
      state.history = [];
      stateMutated = true;
    }
    const progress = await advanceAdventureState(state, config, bundle);
    if (progress.characterDirty) {
      await bundle.characterDoc.save();
    }
    if (progress.mutated) {
      stateMutated = true;
    }
    if (state.completedAt && !state.finalized) {
      finalizeAdventure(state, config, { outcome: state.outcome || 'complete', timestamp: state.completedAt });
      stateMutated = true;
    }
    if (stateMutated) {
      await persistState(state);
    }
    if (isStateActive(state)) {
      throw new Error('adventure already active');
    }
  }
  const baseHistory = state && Array.isArray(state.history) ? state.history.slice() : [];
  const start = Date.now();
  const dayDurationMs = Math.round(config.dayDurationMinutes * 60 * 1000);
  const totalDuration = dayDurationMs * totalDays;
  const endsAt = start + totalDuration;
  const nextEventAt = Math.min(endsAt, start + randomIntervalMs(config));
  const newState = {
    characterId,
    active: true,
    startedAt: start,
    endsAt,
    dayDurationMs,
    totalDays,
    nextEventAt,
    completedAt: null,
    events: [],
    history: baseHistory,
    finalized: false,
    outcome: null,
    ga: { round: 1, parentA: null, parentB: null },
    updatedAt: start,
  };
  appendEvent(newState, { id: `start-${start}`, type: 'start', timestamp: start, message: 'The adventure begins!' }, config);
  await persistState(newState);
  return buildAdventurePayload(newState, config, bundle.characterDoc);
}

async function isAdventureActive(characterId) {
  const state = await getState(characterId);
  return isStateActive(state);
}

async function ensureAdventureIdle(characterId) {
  if (await isAdventureActive(characterId)) {
    throw new Error('character is currently adventuring');
  }
}

async function streamAdventureCombat(characterId, eventId, send) {
  if (!characterId || !eventId) {
    throw new Error('combat replay unavailable');
  }
  const { state } = await findState(characterId);
  if (!state) {
    throw new Error('adventure not found');
  }
  const events = Array.isArray(state.events) ? state.events : [];
  const rawEvent = events.find(entry => entry && entry.id === eventId);
  if (!rawEvent || rawEvent.type !== 'combat') {
    throw new Error('combat event not found');
  }
  if (!rawEvent.combat) {
    throw new Error('combat replay unavailable');
  }
  const updates = Array.isArray(rawEvent.combat.updates) ? rawEvent.combat.updates : [];
  if (!updates.length) {
    throw new Error('combat replay unavailable');
  }
  updates.forEach(step => {
    const update = sanitizeCombatUpdate(step);
    if (!update) return;
    send({
      type: update.type,
      you: update.you ? { ...update.you } : null,
      opponent: update.opponent ? { ...update.opponent } : null,
      log: Array.isArray(update.log) ? update.log.map(entry => ({ ...entry })) : [],
    });
  });
  const xpGain = rawEvent.rewards && Number.isFinite(rawEvent.rewards.xp) ? rawEvent.rewards.xp : 0;
  const goldGain = rawEvent.rewards && Number.isFinite(rawEvent.rewards.gold) ? rawEvent.rewards.gold : 0;
  const summary = {
    type: 'end',
    winnerId: rawEvent.combat.winnerId != null ? rawEvent.combat.winnerId : null,
    xpGain,
    gpGain: goldGain,
    result: rawEvent.result || null,
  };
  if (rawEvent.combat.finalYou) {
    summary.finalYou = sanitizeCombatantState(rawEvent.combat.finalYou);
  }
  if (rawEvent.combat.finalOpponent) {
    summary.finalOpponent = sanitizeCombatantState(rawEvent.combat.finalOpponent);
  }
  send(summary);
}

module.exports = {
  getAdventureStatus,
  startAdventure,
  isAdventureActive,
  ensureAdventureIdle,
  getAdventureConfig,
  streamAdventureCombat,
};
