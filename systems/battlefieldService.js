const path = require('path');
const CharacterModel = require('../models/Character');
const BattlefieldEventModel = require('../models/BattlefieldEvent');
const {
  serializeCharacter,
  ensureEquipmentShape,
  ensureUseableShape,
  findItemIndex,
  countItems,
  matchesItemId,
} = require('../models/utils');
const { readJSON } = require('../store/jsonStore');
const { getEquipmentMap } = require('./equipmentService');
const { getAbilities } = require('./abilityService');
const { runCombat } = require('./combatEngine');
const { xpForNextLevel } = require('./characterService');
const { compute } = require('./derivedStats');
const { processJobForCharacter, ensureJobIdleForDoc } = require('./jobService');

const DATA_DIR = path.join(__dirname, '..', 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'battlefieldConfig.json');

const DEFAULT_CONFIG = {
  spotCount: 5,
  entryCost: 50,
  rewardIntervalMinutes: 5,
  eventDurationMinutes: 120,
  pointsPerInterval: 5,
};

let configCache = null;
let configLoadedAt = 0;

function clone(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function normalizePositiveInteger(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) {
    return fallback;
  }
  return Math.round(num);
}

function normalizeNonNegativeNumber(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) {
    return fallback;
  }
  return num;
}

function normalizeConfig(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const spotCount = normalizePositiveInteger(source.spotCount, DEFAULT_CONFIG.spotCount);
  const entryCost = normalizeNonNegativeNumber(source.entryCost, DEFAULT_CONFIG.entryCost);
  const rewardIntervalMinutes = normalizePositiveInteger(
    source.rewardIntervalMinutes,
    DEFAULT_CONFIG.rewardIntervalMinutes,
  );
  const eventDurationMinutes = normalizePositiveInteger(
    source.eventDurationMinutes,
    DEFAULT_CONFIG.eventDurationMinutes,
  );
  const pointsPerInterval = normalizePositiveInteger(
    source.pointsPerInterval,
    DEFAULT_CONFIG.pointsPerInterval,
  );
  return {
    spotCount,
    entryCost,
    rewardIntervalMinutes,
    eventDurationMinutes,
    pointsPerInterval,
    rewardIntervalMs: rewardIntervalMinutes * 60 * 1000,
    eventDurationMs: eventDurationMinutes * 60 * 1000,
    configVersion: `${spotCount}-${entryCost}-${rewardIntervalMinutes}-${eventDurationMinutes}-${pointsPerInterval}`,
  };
}

async function loadConfig(force = false) {
  if (!force && configCache && Date.now() - configLoadedAt < 60_000) {
    return configCache;
  }
  let raw = null;
  try {
    raw = await readJSON(CONFIG_FILE);
  } catch (err) {
    raw = null;
  }
  configCache = normalizeConfig(raw);
  configLoadedAt = Date.now();
  return configCache;
}

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

function generateSpotLayout(count) {
  const spots = [];
  const minDistance = 12;
  for (let i = 0; i < count; i += 1) {
    let x = 10 + Math.random() * 80;
    let y = 10 + Math.random() * 80;
    let attempts = 0;
    while (attempts < 30) {
      const valid = spots.every(spot => {
        const dx = spot.x - x;
        const dy = spot.y - y;
        return Math.hypot(dx, dy) >= minDistance;
      });
      if (valid) break;
      x = 10 + Math.random() * 80;
      y = 10 + Math.random() * 80;
      attempts += 1;
    }
    spots.push({
      spotId: i + 1,
      x: Number(x.toFixed(2)),
      y: Number(y.toFixed(2)),
      occupantId: null,
      occupantName: null,
      occupantLevel: null,
      battlePoints: 0,
      claimedAt: null,
      lockedSince: null,
      snapshot: null,
      challengeId: null,
    });
  }
  return spots;
}

function buildParticipantMap(event) {
  const map = new Map();
  if (!event || !Array.isArray(event.participants)) {
    return map;
  }
  event.participants.forEach(entry => {
    if (!entry || entry.characterId == null) return;
    map.set(entry.characterId, entry);
  });
  return map;
}

function ensureParticipant(event, participantMap, characterDoc) {
  if (!event || !participantMap || !characterDoc) return null;
  const id = characterDoc.characterId;
  if (id == null) return null;
  if (participantMap.has(id)) {
    const existing = participantMap.get(id);
    if (characterDoc.name && existing.name !== characterDoc.name) {
      existing.name = characterDoc.name;
    }
    if (Number.isFinite(characterDoc.level) && existing.level !== characterDoc.level) {
      existing.level = characterDoc.level;
    }
    existing.lastActiveAt = new Date();
    return existing;
  }
  const entry = {
    characterId: id,
    name: characterDoc.name || null,
    level: characterDoc.level || null,
    points: 0,
    lastActiveAt: new Date(),
  };
  event.participants.push(entry);
  participantMap.set(id, entry);
  return entry;
}

function buildPreview(character, equipmentMap) {
  if (!character) return null;
  const equipment = ensureEquipmentShape(character.equipment || {});
  const resolved = {};
  if (equipmentMap && typeof equipmentMap.get === 'function') {
    Object.entries(equipment).forEach(([slot, id]) => {
      resolved[slot] = id && equipmentMap.has(id) ? equipmentMap.get(id) : null;
    });
  }
  const derived = compute(character, resolved);
  const preview = {
    id: character.id,
    name: character.name,
    level: character.level,
    basicType: character.basicType,
    attributes: clone(character.attributes || {}),
    equipment,
    rotation: Array.isArray(character.rotation) ? character.rotation.slice() : [],
  };
  if (derived && typeof derived === 'object') {
    preview.derived = {
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
      critChance: derived.critChance,
      blockChance: derived.blockChance,
      dodgeChance: derived.dodgeChance,
      hitChance: derived.hitChance,
    };
  }
  return preview;
}

function isSpotOccupiedBy(event, characterId) {
  if (!event || !Array.isArray(event.spots)) return false;
  return event.spots.some(spot => spot && spot.occupantId === characterId);
}

function findSpot(event, spotId) {
  if (!event || !Array.isArray(event.spots)) return null;
  return event.spots.find(spot => spot && spot.spotId === spotId) || null;
}

function sanitizeSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return null;
  return JSON.parse(JSON.stringify(snapshot));
}

function buildStatusPayload(event, config, options = {}) {
  const now = new Date();
  const participantMap = buildParticipantMap(event);
  const spots = Array.isArray(event.spots)
    ? event.spots.map(spot => ({
        spotId: spot.spotId,
        x: spot.x,
        y: spot.y,
        occupantId: spot.occupantId,
        occupantName: spot.occupantName,
        occupantLevel: spot.occupantLevel,
        battlePoints: spot.battlePoints || 0,
        claimedAt: spot.claimedAt ? spot.claimedAt.toISOString() : null,
        lockedSince: spot.lockedSince ? spot.lockedSince.toISOString() : null,
        snapshot: sanitizeSnapshot(spot.snapshot),
      }))
    : [];
  const participants = Array.isArray(event.participants)
    ? event.participants
        .map(entry => ({
          characterId: entry.characterId,
          name: entry.name,
          level: entry.level,
          points: entry.points || 0,
          lastActiveAt: entry.lastActiveAt ? entry.lastActiveAt.toISOString() : null,
          occupying: isSpotOccupiedBy(event, entry.characterId),
        }))
        .sort((a, b) => {
          if (b.points !== a.points) return b.points - a.points;
          if (a.name && b.name) return a.name.localeCompare(b.name);
          return (a.characterId || 0) - (b.characterId || 0);
        })
    : [];
  const characterId = options.characterId != null ? Number(options.characterId) : null;
  const selfEntry = participantMap.get(characterId) || null;
  const lastHistory = Array.isArray(event.history) && event.history.length
    ? event.history[event.history.length - 1]
    : null;
  return {
    eventId: event.eventId,
    startedAt: event.startedAt ? event.startedAt.toISOString() : null,
    endsAt: event.endsAt ? event.endsAt.toISOString() : null,
    nextAwardAt: event.nextAwardAt ? event.nextAwardAt.toISOString() : null,
    entryCost: event.entryCost,
    pot: event.pot,
    rewardIntervalMinutes: config.rewardIntervalMinutes,
    pointsPerInterval: config.pointsPerInterval,
    remainingMs: event.endsAt ? Math.max(0, event.endsAt.getTime() - now.getTime()) : null,
    nextAwardMs: event.nextAwardAt ? Math.max(0, event.nextAwardAt.getTime() - now.getTime()) : null,
    spots,
    participants,
    yourPoints: selfEntry ? selfEntry.points || 0 : 0,
    lastEvent: lastHistory
      ? {
          eventId: lastHistory.eventId,
          winnerId: lastHistory.winnerId,
          winnerName: lastHistory.winnerName,
          pot: lastHistory.pot,
          endedAt: lastHistory.endedAt ? lastHistory.endedAt.toISOString() : null,
        }
      : null,
  };
}

function resetEvent(event, config, now) {
  const spots = generateSpotLayout(config.spotCount);
  event.eventId = (event.eventId || 0) + 1;
  event.startedAt = now;
  event.endsAt = new Date(now.getTime() + config.eventDurationMs);
  event.nextAwardAt = new Date(now.getTime() + config.rewardIntervalMs);
  event.entryCost = config.entryCost;
  event.pot = 0;
  event.spots = spots;
  event.participants = [];
  event.lastProcessedAt = now;
  event.configVersion = Date.now();
}

async function awardPotToWinner(event, config, now) {
  const participants = Array.isArray(event.participants) ? event.participants.slice() : [];
  if (!participants.length || !event.pot) {
    resetEvent(event, config, now);
    return null;
  }
  participants.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (a.lastActiveAt && b.lastActiveAt) {
      return new Date(a.lastActiveAt) - new Date(b.lastActiveAt);
    }
    return (a.characterId || 0) - (b.characterId || 0);
  });
  const top = participants[0];
  if (!top || !top.characterId) {
    resetEvent(event, config, now);
    return null;
  }
  const winnerDoc = await CharacterModel.findOne({ characterId: top.characterId });
  if (winnerDoc) {
    winnerDoc.gold = (winnerDoc.gold || 0) + (event.pot || 0);
    await winnerDoc.save();
  }
  if (!Array.isArray(event.history)) {
    event.history = [];
  }
  event.history.push({
    eventId: event.eventId,
    winnerId: top.characterId,
    winnerName: top.name || (winnerDoc ? winnerDoc.name : null),
    pot: event.pot || 0,
    endedAt: now,
  });
  if (event.history.length > 10) {
    event.history.splice(0, event.history.length - 10);
  }
  resetEvent(event, config, now);
  return winnerDoc ? serializeCharacter(winnerDoc) : null;
}

async function applyEventProgress(event, config, now) {
  if (!event) return { changed: false, winner: null };
  let changed = false;
  let winner = null;
  if (!event.startedAt || !event.endsAt) {
    resetEvent(event, config, now);
    changed = true;
  }
  if (!Array.isArray(event.spots) || event.spots.length !== config.spotCount) {
    const existingOccupants = new Set();
    if (Array.isArray(event.spots)) {
      event.spots.forEach(spot => {
        if (spot && spot.occupantId != null) {
          existingOccupants.add(spot.occupantId);
        }
      });
    }
    event.spots = generateSpotLayout(config.spotCount);
    if (existingOccupants.size) {
      event.participants = Array.isArray(event.participants)
        ? event.participants.filter(entry => existingOccupants.has(entry.characterId))
        : [];
    }
    changed = true;
  }
  event.entryCost = config.entryCost;
  const interval = config.rewardIntervalMs;
  const participantMap = buildParticipantMap(event);
  while (event.nextAwardAt && event.nextAwardAt.getTime() <= now.getTime()) {
    if (Array.isArray(event.spots)) {
      event.spots.forEach(spot => {
        if (!spot || spot.occupantId == null) return;
        const entry = participantMap.get(spot.occupantId);
        if (!entry) return;
        entry.points = (entry.points || 0) + config.pointsPerInterval;
        entry.lastActiveAt = now;
        spot.battlePoints = entry.points;
      });
    }
    event.nextAwardAt = new Date(event.nextAwardAt.getTime() + interval);
    changed = true;
  }
  if (event.endsAt && event.endsAt.getTime() <= now.getTime()) {
    winner = await awardPotToWinner(event, config, now);
    changed = true;
  }
  if (!event.nextAwardAt || event.nextAwardAt.getTime() > event.endsAt.getTime()) {
    event.nextAwardAt = new Date(event.endsAt.getTime());
  }
  event.lastProcessedAt = now;
  return { changed, winner };
}

async function ensureEvent(options = {}) {
  const config = await loadConfig();
  const now = options.now instanceof Date ? options.now : new Date();
  let event = await BattlefieldEventModel.findOne().sort({ eventId: -1 }).exec();
  if (!event) {
    event = new BattlefieldEventModel();
    resetEvent(event, config, now);
    await event.save();
    return { event, config };
  }
  const { changed } = await applyEventProgress(event, config, now);
  if (changed) {
    await event.save();
  }
  return { event, config };
}

async function getBattlefieldStatus(characterId) {
  const { event, config } = await ensureEvent();
  return buildStatusPayload(event, config, { characterId });
}

async function ensureNotHoldingSpot(characterId) {
  if (!characterId) return;
  const { event } = await ensureEvent();
  if (isSpotOccupiedBy(event, characterId)) {
    throw new Error('character is defending a battlefield position');
  }
}

async function ensureBattlefieldIdle(characterId) {
  const { event } = await ensureEvent();
  if (isSpotOccupiedBy(event, characterId)) {
    throw new Error('character is defending a battlefield position');
  }
}

async function loadCharacterForBattle(characterId) {
  const characterDoc = await CharacterModel.findOne({ characterId });
  if (!characterDoc) {
    throw new Error('character not found');
  }
  const { changed } = await processJobForCharacter(characterDoc);
  if (changed) {
    await characterDoc.save();
  }
  ensureJobIdleForDoc(characterDoc);
  if (!Array.isArray(characterDoc.rotation) || characterDoc.rotation.length < 3) {
    throw new Error('character rotation invalid');
  }
  return characterDoc;
}

async function claimBattlefieldSpot(characterId, spotId) {
  const cid = Number(characterId);
  const sid = Number(spotId);
  if (!Number.isFinite(cid) || !Number.isFinite(sid)) {
    throw new Error('characterId and spotId required');
  }
  const { event, config } = await ensureEvent();
  if (isSpotOccupiedBy(event, cid)) {
    throw new Error('character already holds a battlefield spot');
  }
  const spot = findSpot(event, sid);
  if (!spot) {
    throw new Error('battlefield spot not found');
  }
  if (spot.occupantId != null) {
    throw new Error('battlefield spot already claimed');
  }
  const characterDoc = await loadCharacterForBattle(cid);
  if ((characterDoc.gold || 0) < config.entryCost) {
    throw new Error('insufficient gold for war bond');
  }
  characterDoc.gold = (characterDoc.gold || 0) - config.entryCost;
  event.pot = (event.pot || 0) + config.entryCost;
  const participantMap = buildParticipantMap(event);
  const participant = ensureParticipant(event, participantMap, characterDoc);
  const equipmentMap = await getEquipmentMap();
  const serialized = serializeCharacter(characterDoc);
  spot.occupantId = cid;
  spot.occupantName = characterDoc.name;
  spot.occupantLevel = characterDoc.level;
  spot.battlePoints = participant.points || 0;
  spot.claimedAt = new Date();
  spot.lockedSince = new Date();
  spot.snapshot = buildPreview(serialized, equipmentMap);
  spot.challengeId = null;
  await characterDoc.save();
  await event.save();
  return {
    status: buildStatusPayload(event, config, { characterId: cid }),
    character: serializeCharacter(characterDoc),
    gold: characterDoc.gold || 0,
  };
}

async function leaveBattlefield(characterId) {
  const cid = Number(characterId);
  if (!Number.isFinite(cid)) {
    throw new Error('characterId required');
  }
  const { event, config } = await ensureEvent();
  const spot = event.spots.find(s => s && s.occupantId === cid);
  if (!spot) {
    throw new Error('character is not holding a spot');
  }
  spot.occupantId = null;
  spot.occupantName = null;
  spot.occupantLevel = null;
  spot.battlePoints = 0;
  spot.claimedAt = null;
  spot.lockedSince = null;
  spot.snapshot = null;
  spot.challengeId = null;
  await event.save();
  return buildStatusPayload(event, config, { characterId: cid });
}

function applyUseableConsumption(consumedEntries, characterDoc) {
  if (!Array.isArray(consumedEntries) || !characterDoc) return;
  if (!Array.isArray(characterDoc.items)) {
    characterDoc.items = [];
  }
  if (!characterDoc.useables) {
    characterDoc.useables = ensureUseableShape(characterDoc.useables || {});
  }
  let itemsModified = false;
  let useablesModified = false;
  consumedEntries.forEach(entry => {
    if (!entry || !entry.itemId) return;
    const idx = findItemIndex(characterDoc.items, entry.itemId);
    if (idx !== -1) {
      characterDoc.items.splice(idx, 1);
      itemsModified = true;
    }
    if (entry.slot && matchesItemId(characterDoc.useables[entry.slot], entry.itemId)) {
      const remaining = countItems(characterDoc.items, entry.itemId);
      if (remaining <= 0) {
        characterDoc.useables[entry.slot] = null;
        useablesModified = true;
      }
    }
  });
  if (itemsModified && typeof characterDoc.markModified === 'function') {
    characterDoc.markModified('items');
  }
  if (useablesModified && typeof characterDoc.markModified === 'function') {
    characterDoc.markModified('useables');
  }
}

function computeBattleRewards(characterDoc, won) {
  const pct = won ? 0.05 + Math.random() * 0.05 : 0.01 + Math.random() * 0.01;
  const xpGain = Math.round(xpForNextLevel(characterDoc.level || 1) * pct);
  characterDoc.xp = (characterDoc.xp || 0) + xpGain;
  return xpGain;
}

async function startBattlefieldChallenge(characterId, spotId, send) {
  const cid = Number(characterId);
  const sid = Number(spotId);
  if (!Number.isFinite(cid) || !Number.isFinite(sid)) {
    throw new Error('characterId and spotId required');
  }
  const { event, config } = await ensureEvent();
  if (isSpotOccupiedBy(event, cid)) {
    throw new Error('defenders cannot initiate a challenge');
  }
  const spot = findSpot(event, sid);
  if (!spot || spot.occupantId == null) {
    throw new Error('no defender occupies that spot');
  }
  if (spot.challengeId && spot.challengeId !== cid) {
    throw new Error('another challenger is already engaged');
  }
  const defenderId = spot.occupantId;
  const [challengerDoc, defenderDoc] = await Promise.all([
    loadCharacterForBattle(cid),
    loadCharacterForBattle(defenderId),
  ]);
  if ((challengerDoc.gold || 0) < config.entryCost) {
    throw new Error('insufficient gold for war bond');
  }
  let warBondSpent = false;
  challengerDoc.gold = (challengerDoc.gold || 0) - config.entryCost;
  event.pot = (event.pot || 0) + config.entryCost;
  warBondSpent = true;
  spot.challengeId = cid;
  await event.save();
  let equipmentMap;
  let abilityMap;
  let challenger;
  let defender;
  const participantMap = buildParticipantMap(event);
  const attackerEntry = ensureParticipant(event, participantMap, challengerDoc);
  const defenderEntry = ensureParticipant(event, participantMap, defenderDoc);

  try {
    const [abilities, eqMap] = await Promise.all([getAbilities(), getEquipmentMap()]);
    equipmentMap = eqMap;
    abilityMap = new Map(abilities.map(ability => [ability.id, ability]));
    challenger = serializeCharacter(challengerDoc);
    defender = serializeCharacter(defenderDoc);

    const result = await runCombat(challenger, defender, abilityMap, equipmentMap, update => {
      if (!update) return;
      if (update.type === 'start') {
        send({ type: 'start', you: update.a, opponent: update.b, log: [] });
      } else if (update.type === 'update') {
        send({ type: 'update', you: update.a, opponent: update.b, log: update.log || [] });
      }
    });

    const consumed = result.consumedUseables || {};
    applyUseableConsumption(consumed[challenger.id] || [], challengerDoc);
    applyUseableConsumption(consumed[defender.id] || [], defenderDoc);

    const challengerWon = String(result.winnerId) === String(challenger.id);
    const defenderWon = String(result.winnerId) === String(defender.id);

    const challengerXp = computeBattleRewards(challengerDoc, challengerWon);
    computeBattleRewards(defenderDoc, defenderWon);

    if (challengerWon) {
      spot.occupantId = challengerDoc.characterId;
      spot.occupantName = challengerDoc.name;
      spot.occupantLevel = challengerDoc.level;
      spot.battlePoints = attackerEntry ? attackerEntry.points || 0 : 0;
      spot.claimedAt = new Date();
      spot.lockedSince = new Date();
      spot.snapshot = buildPreview(challenger, equipmentMap);
    } else {
      spot.occupantName = defenderDoc.name;
      spot.occupantLevel = defenderDoc.level;
      spot.battlePoints = defenderEntry ? defenderEntry.points || 0 : 0;
      spot.snapshot = buildPreview(defender, equipmentMap);
    }
    spot.challengeId = null;

    attackerEntry.points = attackerEntry.points || 0;
    defenderEntry.points = defenderEntry.points || 0;
    attackerEntry.lastActiveAt = new Date();
    defenderEntry.lastActiveAt = new Date();

    await Promise.all([challengerDoc.save(), defenderDoc.save()]);
    await event.save();

    send({
      type: 'end',
      winnerId: result.winnerId,
      xpGain: challengerXp,
      gpGain: 0,
      character: serializeCharacter(challengerDoc),
      gold: challengerDoc.gold || 0,
      battlefield: buildStatusPayload(event, config, { characterId: cid }),
    });
  } catch (err) {
    spot.challengeId = null;
    if (warBondSpent) {
      challengerDoc.gold = (challengerDoc.gold || 0) + config.entryCost;
      event.pot = Math.max(0, (event.pot || 0) - config.entryCost);
      await challengerDoc.save();
    }
    await event.save();
    throw err;
  }
}

module.exports = {
  getBattlefieldStatus,
  claimBattlefieldSpot,
  leaveBattlefield,
  ensureBattlefieldIdle,
  ensureNotHoldingSpot,
  startBattlefieldChallenge,
};
