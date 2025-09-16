const path = require('path');
const {
  serializeCharacter,
  serializePlayer,
  STATS,
} = require('../models/utils');
const { readJSON, writeJSON } = require('../store/jsonStore');
const {
  buildChallengeContext,
  findChampion,
  buildAICharacter,
  rewardForRound,
  normalizeGenome,
  computePlayerGear,
} = require('./challengeGA');
const { runCombat } = require('./combatEngine');

const DATA_DIR = path.join(__dirname, '..', 'data');
const ADVENTURE_STATE_FILE = path.join(DATA_DIR, 'adventures.json');
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
  } else if (type === 'item') {
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

async function loadStates() {
  const data = await readJSON(ADVENTURE_STATE_FILE);
  return Array.isArray(data) ? data : [];
}

async function saveStates(states) {
  await writeJSON(ADVENTURE_STATE_FILE, Array.isArray(states) ? states : []);
}

async function findState(characterId) {
  const states = await loadStates();
  const index = states.findIndex(entry => entry && entry.characterId === characterId);
  const state = index === -1 ? null : states[index];
  return { state, states, index };
}

async function persistState(states, index, state) {
  const next = Array.isArray(states) ? states.slice() : [];
  const idx = typeof index === 'number' && index >= 0 ? index : next.length;
  next[idx] = state;
  await saveStates(next);
  return { states: next, index: idx };
}

function isStateActive(state) {
  if (!state || !state.active) return false;
  if (state.endsAt && Date.now() >= state.endsAt) return false;
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
    result: event.result || null,
    rewards: event.rewards || null,
    opponent: event.opponent || null,
  };
  state.events.push(entry);
  const maxEntries = config.maxLogEntries || DEFAULT_MAX_LOG;
  if (state.events.length > maxEntries) {
    state.events.splice(0, state.events.length - maxEntries);
  }
  return entry;
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
      id: event.item.id,
      name: event.item.name,
      rarity: event.item.rarity || sanitized.rarity,
    };
  }
  if (event.opponent) {
    sanitized.opponent = {
      name: event.opponent.name || null,
      basicType: event.opponent.basicType || null,
      round: event.opponent.round != null ? event.opponent.round : null,
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
  const summary = { xp: 0, gold: 0, items: [] };
  if (!state || !Array.isArray(state.events)) {
    return summary;
  }
  const seenItems = new Set();
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
  });
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
  let playerDirty = false;
  let ended = null;
  let defeatOpponent = null;
  if (eventDef.type === 'gold') {
    const amount = resolveAmountValue(eventDef.amount);
    bundle.playerDoc.gold = (bundle.playerDoc.gold || 0) + amount;
    playerDirty = true;
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
      if (!Array.isArray(bundle.playerDoc.items)) {
        bundle.playerDoc.items = [];
      }
      bundle.playerDoc.items.push(item.id);
      playerDirty = true;
      event.item = { id: item.id, name: item.name, rarity };
      event.rarity = rarity;
      event.message = formatMessage(eventDef.message, { item: item.name, rarity })
        || `Recovered a ${rarity} item: ${item.name}.`;
    } else {
      event.message = 'The search turned up nothing of value.';
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
    const result = await runCombat(playerClone, opponentClone, bundle.context.abilityMap, bundle.context.equipmentMap, {
      fastForward: true,
    });
    const playerWon = String(result.winnerId) === String(bundle.character.id);
    const rewards = rewardForRound(round, bundle.characterDoc.level || 1);
    let xpGain = 0;
    let goldGain = 0;
    if (playerWon) {
      xpGain = rewards.xpGain;
      goldGain = rewards.goldGain;
      bundle.characterDoc.xp = (bundle.characterDoc.xp || 0) + xpGain;
      bundle.playerDoc.gold = (bundle.playerDoc.gold || 0) + goldGain;
      characterDirty = true;
      playerDirty = true;
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
    event.opponent = { name: opponent.name, basicType: opponent.basicType, round };
    event.rewards = { xp: xpGain, gold: goldGain };
    event.result = playerWon ? 'victory' : 'defeat';
    const rewardText = xpGain || goldGain ? ` +${xpGain} XP, +${goldGain} gold.` : '';
    event.message = `${intro} ${playerWon ? 'Victory!' : 'Defeat...'}${rewardText}`.trim();
  } else {
    event.message = 'A quiet moment passes on the journey.';
  }
  appendEvent(state, event, config);
  state.updatedAt = Date.now();
  return { characterDirty, playerDirty, ended, opponent: defeatOpponent };
}

async function advanceAdventureState(state, config, bundle) {
  if (!state) {
    return { mutated: false, characterDirty: false, playerDirty: false };
  }
  let mutated = false;
  let characterDirty = false;
  let playerDirty = false;
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
      if (result.playerDirty) {
        playerDirty = true;
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
  return { mutated, characterDirty, playerDirty };
}

function buildAdventurePayload(state, config, characterDoc, playerDoc, extra = {}) {
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
  const player = playerDoc ? serializePlayer(playerDoc) : null;
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
    player,
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
    const bundle = await buildChallengeContext(characterId, { includePlayer: true });
    bundle.itemsByRarity = buildRarityIndex(bundle.equipmentMap);
    refreshBundle(bundle);
    return { bundle, error: null };
  } catch (err) {
    return { bundle: null, error: err };
  }
}

async function getAdventureStatus(characterId) {
  const config = await getAdventureConfig();
  const { state, states, index } = await findState(characterId);
  const { bundle, error } = await loadBundle(characterId, { includePlayer: true });
  if (!bundle) {
    if (!state) {
      return buildAdventurePayload(null, config, null, null, { error: error ? error.message : null });
    }
    return buildAdventurePayload(state, config, null, null, { error: error ? error.message : null });
  }

  let stateArray = states;
  let stateIndex = index;
  let activeState = state;
  if (!activeState) {
    const fresh = {
      characterId,
      active: false,
      events: [],
      history: [],
      finalized: true,
      outcome: null,
      totalDays: config.totalDays,
      dayDurationMs: Math.round(config.dayDurationMinutes * 60 * 1000),
      startedAt: null,
      completedAt: null,
      endsAt: null,
      nextEventAt: null,
      ga: { round: 1, parentA: null, parentB: null },
      updatedAt: Date.now(),
    };
    const persisted = await persistState(stateArray, stateIndex, fresh);
    stateArray = persisted.states;
    stateIndex = persisted.index;
    activeState = fresh;
  }

  if (!Array.isArray(activeState.history)) {
    activeState.history = [];
  }
  if (!activeState.dayDurationMs) {
    activeState.dayDurationMs = Math.round(config.dayDurationMinutes * 60 * 1000);
  }
  if (!Number.isFinite(activeState.totalDays) || activeState.totalDays <= 0) {
    activeState.totalDays = config.totalDays;
  }
  if (activeState.finalized == null) {
    activeState.finalized = !isStateActive(activeState);
  }

  const progress = await advanceAdventureState(activeState, config, bundle);
  if (progress.characterDirty) {
    await bundle.characterDoc.save();
  }
  if (progress.playerDirty && bundle.playerDoc) {
    await bundle.playerDoc.save();
  }
  if (progress.mutated) {
    const persisted = await persistState(stateArray, stateIndex, activeState);
    stateArray = persisted.states;
    stateIndex = persisted.index;
  }
  return buildAdventurePayload(activeState, config, bundle.characterDoc, bundle.playerDoc, { error: error ? error.message : null });
}

async function startAdventure(characterId, options = {}) {
  const config = await getAdventureConfig();
  const { state, states, index } = await findState(characterId);
  if (state && isStateActive(state)) {
    throw new Error('adventure already active');
  }
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
  let stateArray = states;
  let stateIndex = index;
  if (state && !Array.isArray(state.history)) {
    state.history = [];
  }
  if (state && state.completedAt && !state.finalized) {
    finalizeAdventure(state, config, { outcome: state.outcome || 'complete', timestamp: state.completedAt });
    const persisted = await persistState(stateArray, stateIndex, state);
    stateArray = persisted.states;
    stateIndex = persisted.index;
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
    events: [],
    history: baseHistory,
    finalized: false,
    outcome: null,
    ga: { round: 1, parentA: null, parentB: null },
    updatedAt: start,
  };
  appendEvent(newState, { id: `start-${start}`, type: 'start', timestamp: start, message: 'The adventure begins!' }, config);
  await persistState(stateArray, stateIndex, newState);
  return buildAdventurePayload(newState, config, bundle.characterDoc, bundle.playerDoc);
}

async function isAdventureActive(characterId) {
  const { state } = await findState(characterId);
  return isStateActive(state);
}

async function ensureAdventureIdle(characterId) {
  if (await isAdventureActive(characterId)) {
    throw new Error('character is currently adventuring');
  }
}

module.exports = {
  getAdventureStatus,
  startAdventure,
  isAdventureActive,
  ensureAdventureIdle,
  getAdventureConfig,
};
