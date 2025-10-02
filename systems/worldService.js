const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const CharacterModel = require('../models/Character');
const {
  serializeCharacter,
  ensureAttributesShape,
  ensureEquipmentShape,
  ensureUseableShape,
  findItemIndex,
  matchesItemId,
  countItems,
} = require('../models/utils');
const { processJobForCharacter, ensureJobIdleForDoc } = require('./jobService');
const { ensureAdventureIdle } = require('./adventureService');
const { ensureBattlefieldIdle } = require('./battlefieldService');
const { getAbilities } = require('./abilityService');
const { getEquipmentMap } = require('./equipmentService');
const { runDungeonCombat } = require('./combatEngine');
const { xpForNextLevel } = require('./characterService');

const WORLD_FILE = path.join(__dirname, '..', 'data', 'worlds.json');

function uuid() {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return crypto.randomBytes(16).toString('hex');
}

let cachedConfig = null;
let cachedAbilityMap = null;
let cachedEquipmentMap = null;

const worldInstances = new Map();

function deepClone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function normalizeTiles(rawTiles) {
  if (!Array.isArray(rawTiles)) {
    return [];
  }
  return rawTiles
    .map(row => (Array.isArray(row) ? row.map(v => Number.isFinite(v) ? Math.round(v) : parseInt(v, 10)).map(v => (Number.isFinite(v) ? v : 0)) : []))
    .filter(row => row.length > 0);
}

function normalizePalette(raw) {
  if (!raw || typeof raw !== 'object') {
    return {};
  }
  const palette = {};
  Object.entries(raw).forEach(([key, value]) => {
    if (typeof value === 'string') {
      palette[String(key)] = value;
    }
  });
  return palette;
}

function normalizeTileConfig(raw) {
  if (!raw || typeof raw !== 'object') {
    return {};
  }
  const tileConfig = {};
  Object.entries(raw).forEach(([key, value]) => {
    if (!value || typeof value !== 'object') {
      return;
    }
    const sprite = typeof value.sprite === 'string' && value.sprite.trim() ? value.sprite.trim() : null;
    let fill = null;
    if (typeof value.fill === 'string') {
      const rawFill = value.fill.trim().toLowerCase();
      if (/^#(?:0{3}|f{3}|0{6}|f{6})$/.test(rawFill)) {
        fill = rawFill.length === 4 ? (rawFill === '#000' ? '#000000' : '#ffffff') : rawFill;
      }
    }
    if (!sprite && !fill) {
      return;
    }
    tileConfig[String(key)] = {};
    if (sprite) {
      tileConfig[String(key)].sprite = sprite;
    }
    if (fill) {
      tileConfig[String(key)].fill = fill;
    }
  });
  return tileConfig;
}

function normalizeTemplates(rawTemplates) {
  if (!Array.isArray(rawTemplates) || !rawTemplates.length) {
    return [];
  }
  return rawTemplates
    .map(template => {
      if (!template || typeof template !== 'object') return null;
      const rotation = Array.isArray(template.rotation)
        ? template.rotation
            .map(id => {
              const numeric = Number(id);
              return Number.isFinite(numeric) ? Math.round(numeric) : null;
            })
            .filter(id => Number.isFinite(id))
        : [];
      const equipment = ensureEquipmentShape(template.equipment || {});
      return {
        id: template.id || uuid(),
        name: typeof template.name === 'string' && template.name ? template.name : 'Wild Foe',
        basicType: template.basicType === 'magic' ? 'magic' : 'melee',
        level: Number.isFinite(template.level) ? Math.max(1, Math.round(template.level)) : 1,
        attributes: ensureAttributesShape(template.attributes || {}),
        rotation,
        equipment,
        xpPct: Number.isFinite(template.xpPct) ? Math.max(0.01, template.xpPct) : 0.06,
        gold: Number.isFinite(template.gold) ? Math.max(1, Math.round(template.gold)) : 7,
      };
    })
    .filter(Boolean);
}

function normalizeEncounter(raw = {}) {
  const tiles = Array.isArray(raw.tiles)
    ? raw.tiles.map(v => {
        const numeric = Number(v);
        return Number.isFinite(numeric) ? Math.round(numeric) : null;
      }).filter(Number.isFinite)
    : [2];
  const chance = Number.isFinite(raw.chance) ? Math.max(0, Math.min(1, raw.chance)) : 0.15;
  const cooldownMs = Number.isFinite(raw.cooldownMs) ? Math.max(0, Math.round(raw.cooldownMs)) : 1500;
  return {
    tiles: tiles.length ? tiles : [2],
    chance,
    cooldownMs,
    templates: normalizeTemplates(raw.templates),
  };
}

function normalizeWorld(entry) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }
  const tiles = normalizeTiles(entry.tiles);
  const width = tiles.length ? tiles[0].length : 0;
  const height = tiles.length;
  const spawn = entry.spawn && typeof entry.spawn === 'object' ? {
    x: Number.isFinite(entry.spawn.x) ? Math.max(0, Math.round(entry.spawn.x)) : 0,
    y: Number.isFinite(entry.spawn.y) ? Math.max(0, Math.round(entry.spawn.y)) : 0,
  } : { x: 0, y: 0 };
  return {
    id: entry.id || uuid(),
    name: typeof entry.name === 'string' && entry.name ? entry.name : 'World',
    tileSize: Number.isFinite(entry.tileSize) ? Math.max(16, Math.round(entry.tileSize)) : 32,
    tiles,
    width,
    height,
    palette: normalizePalette(entry.palette),
    tileConfig: normalizeTileConfig(entry.tileConfig),
    spawn,
    moveCooldownMs: Number.isFinite(entry.moveCooldownMs) ? Math.max(60, Math.round(entry.moveCooldownMs)) : 180,
    encounters: normalizeEncounter(entry.encounters),
  };
}

async function loadWorldConfig() {
  if (!cachedConfig) {
    let raw = [];
    try {
      const data = await fs.readFile(WORLD_FILE, 'utf8');
      raw = JSON.parse(data);
    } catch (err) {
      if (!err || err.code !== 'ENOENT') {
        throw err;
      }
    }
    const normalized = Array.isArray(raw) ? raw.map(normalizeWorld).filter(Boolean) : [];
    cachedConfig = normalized;
  }
  return cachedConfig;
}

async function getWorldById(worldId) {
  const config = await loadWorldConfig();
  return config.find(world => world && world.id === worldId) || null;
}

function ensureInstance(worldId, instanceId) {
  if (!instanceId || !worldInstances.has(instanceId)) {
    throw new Error('world instance not found');
  }
  const instance = worldInstances.get(instanceId);
  if (!instance || instance.worldId !== worldId) {
    throw new Error('world instance mismatch');
  }
  return instance;
}

function cleanupInstance(instanceId) {
  if (!instanceId || !worldInstances.has(instanceId)) return;
  const instance = worldInstances.get(instanceId);
  if (!instance) return;
  instance.listeners.forEach(listener => {
    try {
      listener({ type: 'error', message: 'World instance closed.' });
    } catch (err) {
      /* ignore */
    }
  });
  worldInstances.delete(instanceId);
}

function sanitizeWorld(world) {
  if (!world) return null;
  return {
    id: world.id,
    name: world.name,
    tileSize: world.tileSize,
    tiles: world.tiles,
    palette: world.palette,
    tileConfig: world.tileConfig,
    moveCooldownMs: world.moveCooldownMs,
  };
}

function serializePlayersForClient(state) {
  return Array.from(state.players.values()).map(player => ({
    characterId: player.characterId,
    name: player.name,
    x: player.x,
    y: player.y,
    facing: player.facing,
  }));
}

function broadcastWorldState(state) {
  if (!state) return;
  const payload = {
    type: 'state',
    phase: state.phase,
    players: serializePlayersForClient(state),
  };
  state.listeners.forEach(listener => {
    try {
      listener(payload);
    } catch (err) {
      console.error('world listener failed', err);
    }
  });
}

async function prepareCharacterForCombat(characterId) {
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
  if (!cachedAbilityMap) {
    const abilities = await getAbilities();
    cachedAbilityMap = new Map(abilities.map(ability => [ability.id, ability]));
  }
  if (!cachedEquipmentMap) {
    cachedEquipmentMap = await getEquipmentMap();
  }
  return {
    characterDoc,
    character: serializeCharacter(characterDoc),
    abilityMap: cachedAbilityMap,
    equipmentMap: cachedEquipmentMap,
  };
}

function firstWalkable(world) {
  if (!world || !Array.isArray(world.tiles)) {
    return { x: 0, y: 0 };
  }
  for (let y = 0; y < world.tiles.length; y += 1) {
    const row = world.tiles[y];
    if (!Array.isArray(row)) continue;
    for (let x = 0; x < row.length; x += 1) {
      if (isWalkableTile(world, x, y)) {
        return { x, y };
      }
    }
  }
  return { x: 0, y: 0 };
}

function isWalkableTile(world, x, y) {
  if (!world || !Array.isArray(world.tiles)) return false;
  if (y < 0 || y >= world.tiles.length) return false;
  const row = world.tiles[y];
  if (!Array.isArray(row)) return false;
  if (x < 0 || x >= row.length) return false;
  const tile = row[x];
  return tile === 1 || tile === 2;
}

function tileAt(world, x, y) {
  if (!world || !Array.isArray(world.tiles)) return null;
  if (y < 0 || y >= world.tiles.length) return null;
  const row = world.tiles[y];
  if (!Array.isArray(row) || x < 0 || x >= row.length) return null;
  return row[x];
}

function ensurePlayerEntry(state, characterId, name) {
  if (!state || !state.world) {
    throw new Error('world not available');
  }
  let entry = state.players.get(characterId);
  if (!entry) {
    const world = state.world;
    const spawn = isWalkableTile(world, world.spawn.x, world.spawn.y) ? world.spawn : firstWalkable(world);
    entry = {
      characterId,
      name,
      x: spawn.x,
      y: spawn.y,
      facing: 'down',
      updatedAt: Date.now(),
      lastEncounterAt: 0,
    };
    state.players.set(characterId, entry);
  } else {
    entry.name = name;
  }
  return entry;
}

function directionToDelta(direction) {
  const dir = typeof direction === 'string' ? direction.toLowerCase() : '';
  switch (dir) {
    case 'up':
      return { dx: 0, dy: -1, facing: 'up' };
    case 'down':
      return { dx: 0, dy: 1, facing: 'down' };
    case 'left':
      return { dx: -1, dy: 0, facing: 'left' };
    case 'right':
      return { dx: 1, dy: 0, facing: 'right' };
    default:
      return null;
  }
}

function chooseEncounterTemplate(world) {
  const { encounters } = world || {};
  if (!encounters || !Array.isArray(encounters.templates) || !encounters.templates.length) {
    return null;
  }
  const idx = Math.floor(Math.random() * encounters.templates.length);
  return encounters.templates[idx] || null;
}

function instantiateEncounter(template, abilityMap, equipmentMap) {
  if (!template) return null;
  const rotation = Array.isArray(template.rotation) ? template.rotation.filter(id => abilityMap.has(id)) : [];
  const fallbackAbilities = rotation.length >= 3 ? rotation : Array.from(abilityMap.keys()).slice(0, 6);
  const finalRotation = rotation.slice(0, 6);
  for (let i = 0; finalRotation.length < 3 && i < fallbackAbilities.length; i += 1) {
    if (!finalRotation.includes(fallbackAbilities[i])) {
      finalRotation.push(fallbackAbilities[i]);
    }
  }
  const equipment = ensureEquipmentShape(template.equipment || {});
  Object.keys(equipment).forEach(slot => {
    if (!equipment[slot] || !equipmentMap.has(equipment[slot])) {
      equipment[slot] = null;
    }
  });
  return {
    id: `encounter-${template.id}-${Date.now()}`,
    name: template.name || 'Wild Foe',
    playerId: null,
    attributes: ensureAttributesShape(template.attributes || {}),
    basicType: template.basicType === 'magic' ? 'magic' : 'melee',
    level: template.level || 1,
    xp: 0,
    rotation: finalRotation.length ? finalRotation : Array.from(abilityMap.keys()).slice(0, 3),
    equipment,
    useables: ensureUseableShape({}),
    gold: 0,
    items: [],
    materials: {},
    job: {},
  };
}

function applyEncounterRewards(characterDoc, rewards) {
  if (!characterDoc || !rewards) return;
  if (Number.isFinite(rewards.xpGain) && rewards.xpGain > 0) {
    characterDoc.xp = (characterDoc.xp || 0) + rewards.xpGain;
  }
  if (Number.isFinite(rewards.goldGain) && rewards.goldGain > 0) {
    characterDoc.gold = (characterDoc.gold || 0) + rewards.goldGain;
  }
}

function consumeUseables(characterDoc, consumedEntries) {
  if (!characterDoc || !Array.isArray(consumedEntries) || !consumedEntries.length) {
    return;
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
    if (entry.slot && matchesItemId(characterDoc.useables && characterDoc.useables[entry.slot], entry.itemId)) {
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

async function listWorlds() {
  const config = await loadWorldConfig();
  return config.map(world => ({ id: world.id, name: world.name }));
}

async function createWorldInstance(worldId, participantIds = []) {
  const world = await getWorldById(worldId);
  if (!world) {
    throw new Error('world not found');
  }
  const instanceId = uuid();
  worldInstances.set(instanceId, {
    id: instanceId,
    worldId,
    world,
    players: new Map(),
    listeners: new Set(),
    expectedParticipants: new Set(participantIds),
    phase: 'lobby',
    activeEncounter: null,
  });
  return { instanceId, world: sanitizeWorld(world) };
}

function ensureParticipant(state, characterId) {
  if (!state) {
    throw new Error('world instance not found');
  }
  if (state.expectedParticipants && state.expectedParticipants.size && !state.expectedParticipants.has(characterId)) {
    throw new Error('character not part of this world');
  }
}

async function joinWorld(worldId, instanceId, characterId) {
  if (!Number.isFinite(characterId)) {
    throw new Error('characterId required');
  }
  if (!instanceId) {
    throw new Error('instanceId required');
  }
  const state = ensureInstance(worldId, instanceId);
  ensureParticipant(state, characterId);
  await ensureBattlefieldIdle(characterId);
  await ensureAdventureIdle(characterId);
  const prep = await prepareCharacterForCombat(characterId);
  const entry = ensurePlayerEntry(state, characterId, prep.character.name);
  if (state.phase !== 'encounter') {
    state.phase = 'explore';
  }
  broadcastWorldState(state);
  return {
    world: sanitizeWorld(state.world),
    instanceId: state.id,
    player: { characterId: entry.characterId, name: entry.name, x: entry.x, y: entry.y, facing: entry.facing },
    players: serializePlayersForClient(state),
    phase: state.phase,
  };
}

async function leaveWorld(worldId, instanceId, characterId) {
  const state = ensureInstance(worldId, instanceId);
  const existing = state.players.get(characterId);
  if (existing) {
    state.players.delete(characterId);
    if (state.activeEncounter && state.activeEncounter.listeners) {
      state.activeEncounter.listeners.forEach(listener => {
        try {
          listener({ type: 'cancelled' });
        } catch (err) {
          /* ignore */
        }
      });
      state.activeEncounter = null;
    }
    if (!state.players.size) {
      cleanupInstance(instanceId);
    } else {
      if (state.phase !== 'encounter') {
        state.phase = 'explore';
      }
      broadcastWorldState(state);
    }
  }
  return { success: true };
}

async function movePlayer(worldId, instanceId, characterId, direction) {
  const state = ensureInstance(worldId, instanceId);
  const world = state.world;
  if (!world) {
    throw new Error('world not found');
  }
  const player = state.players.get(characterId);
  if (!player) {
    throw new Error('player not in world');
  }
  if (state.phase === 'encounter' && state.activeEncounter) {
    return {
      position: { x: player.x, y: player.y, facing: player.facing },
      moved: false,
      locked: true,
    };
  }
  const delta = directionToDelta(direction);
  if (!delta) {
    return { position: { x: player.x, y: player.y, facing: player.facing }, moved: false };
  }
  const now = Date.now();
  if (player.moveCooldown && now < player.moveCooldown) {
    return { position: { x: player.x, y: player.y, facing: player.facing }, moved: false };
  }
  let moved = false;
  const nextX = player.x + delta.dx;
  const nextY = player.y + delta.dy;
  if (isWalkableTile(world, nextX, nextY)) {
    player.x = nextX;
    player.y = nextY;
    moved = true;
  }
  player.facing = delta.facing;
  player.updatedAt = now;
  player.moveCooldown = now + world.moveCooldownMs;

  let encounter = null;
  if (moved) {
    const tile = tileAt(world, player.x, player.y);
    const encounters = world.encounters || {};
    const eligibleTile = encounters.tiles && encounters.tiles.includes(tile);
    const cooldownReady = now - (player.lastEncounterAt || 0) >= (encounters.cooldownMs || 0);
    if (eligibleTile && cooldownReady && Math.random() < (encounters.chance || 0)) {
      const template = chooseEncounterTemplate(world);
      if (template) {
        const token = uuid();
        const participants = Array.from(state.players.keys());
        state.activeEncounter = {
          token,
          template: deepClone(template),
          startedBy: characterId,
          listeners: new Set(),
          started: false,
          completed: false,
          lastEvent: null,
          resultPayload: null,
          participants,
        };
        state.phase = 'encounter';
        player.lastEncounterAt = now;
        encounter = { token };
        state.listeners.forEach(listener => {
          try {
            listener({ type: 'encounter', token, startedBy: characterId });
          } catch (err) {
            console.error('world encounter notify failed', err);
          }
        });
      }
    }
  }

  broadcastWorldState(state);
  return {
    position: { x: player.x, y: player.y, facing: player.facing },
    moved,
    encounter,
  };
}

function subscribe(worldId, instanceId, characterId, send) {
  const state = ensureInstance(worldId, instanceId);
  if (!state.players.has(characterId)) {
    throw new Error('player not in world');
  }
  state.listeners.add(send);
  send({ type: 'state', phase: state.phase, players: serializePlayersForClient(state) });
  if (state.phase === 'encounter' && state.activeEncounter) {
    send({
      type: 'encounter',
      token: state.activeEncounter.token,
      startedBy: state.activeEncounter.startedBy,
    });
  }
  return () => {
    state.listeners.delete(send);
  };
}

function broadcastEncounterEvent(encounter, payload) {
  if (!encounter) return;
  encounter.listeners.forEach(listener => {
    try {
      listener(payload);
    } catch (err) {
      /* ignore */
    }
  });
}

async function startEncounterBattle(state, encounter) {
  if (!state || !encounter || encounter.started) return;
  encounter.started = true;
  const participants = Array.isArray(encounter.participants) && encounter.participants.length
    ? encounter.participants
    : Array.from(state.players.keys());
  const prepList = await Promise.all(
    participants.map(characterId => prepareCharacterForCombat(characterId).catch(err => ({ error: err, characterId }))),
  );
  const validPreps = prepList.filter(entry => !entry.error);
  if (!validPreps.length) {
    const errorPayload = { type: 'error', message: 'Encounter failed to initialize.' };
    broadcastEncounterEvent(encounter, errorPayload);
    encounter.completed = true;
    encounter.resultPayload = errorPayload;
    state.activeEncounter = null;
    state.phase = 'explore';
    broadcastWorldState(state);
    return;
  }
  const abilityMap = validPreps[0].abilityMap;
  const equipmentMap = validPreps[0].equipmentMap;
  const party = validPreps.map(prep => deepClone(prep.character));
  const template = encounter.template;
  const enemy = instantiateEncounter(template, abilityMap, equipmentMap);
  if (!enemy) {
    const errorPayload = { type: 'error', message: 'Encounter unavailable.' };
    broadcastEncounterEvent(encounter, errorPayload);
    encounter.completed = true;
    encounter.resultPayload = errorPayload;
    state.activeEncounter = null;
    state.phase = 'explore';
    broadcastWorldState(state);
    return;
  }

  const safeSend = payload => {
    encounter.lastEvent = payload;
    broadcastEncounterEvent(encounter, payload);
  };

  const enemyClone = deepClone(enemy);
  let result = null;
  try {
    result = await runDungeonCombat(
      party,
      enemyClone,
      abilityMap,
      equipmentMap,
      update => {
        if (!update) return;
        safeSend({ ...update, encounterToken: encounter.token });
      },
      { mode: 'world' },
    );
  } catch (err) {
    console.error('world encounter failed', err);
    const errorPayload = { type: 'error', message: 'Encounter failed.' };
    safeSend(errorPayload);
    encounter.completed = true;
    encounter.resultPayload = errorPayload;
    state.activeEncounter = null;
    state.phase = 'explore';
    broadcastWorldState(state);
    return;
  }

  const consumedMap = (result && result.consumedUseables) || {};
  const rewardsByCharacter = {};
  await Promise.all(
    validPreps.map(async prep => {
      const { characterDoc, character } = prep;
      const consumedEntries = consumedMap[character.id] || [];
      consumeUseables(characterDoc, consumedEntries);
      const won = result.winnerSide === 'party';
      let xpGain = 0;
      let goldGain = 0;
      if (won) {
        const pct = template && Number.isFinite(template.xpPct) ? Math.max(0.01, template.xpPct) : 0.06;
        xpGain = Math.max(5, Math.round(xpForNextLevel(characterDoc.level || 1) * pct));
        goldGain = template && Number.isFinite(template.gold) ? Math.max(0, template.gold) : 7;
        applyEncounterRewards(characterDoc, { xpGain, goldGain });
      }
      await characterDoc.save();
      const serialized = serializeCharacter(characterDoc);
      rewardsByCharacter[serialized.id] = {
        xpGain,
        gpGain: goldGain,
        character: serialized,
        gold: typeof characterDoc.gold === 'number' ? characterDoc.gold : 0,
      };
    }),
  );

  const endPayload = {
    type: 'end',
    mode: 'world',
    winnerSide: result.winnerSide,
    winnerId: result.winnerId,
    rewards: rewardsByCharacter,
    finalParty: result.finalParty || null,
    finalBoss: result.finalBoss || null,
    metrics: result.metrics || null,
  };
  safeSend(endPayload);
  encounter.completed = true;
  encounter.resultPayload = endPayload;

  state.activeEncounter = null;
  state.phase = state.players.size ? 'explore' : 'lobby';
  broadcastWorldState(state);
}

function runEncounter(worldId, instanceId, characterId, token, send) {
  const state = ensureInstance(worldId, instanceId);
  const encounter = state.activeEncounter;
  if (!encounter || encounter.token !== token) {
    throw new Error('no pending encounter');
  }
  if (!state.players.has(characterId)) {
    throw new Error('player not in world');
  }
  const safeSend = payload => {
    try {
      send(payload);
    } catch (err) {
      /* ignore */
    }
  };
  encounter.listeners.add(safeSend);
  if (encounter.resultPayload) {
    safeSend(encounter.resultPayload);
  } else if (encounter.lastEvent) {
    safeSend(encounter.lastEvent);
  }
  startEncounterBattle(state, encounter);
  return () => {
    encounter.listeners.delete(safeSend);
  };
}

module.exports = {
  listWorlds,
  createWorldInstance,
  joinWorld,
  leaveWorld,
  movePlayer,
  subscribe,
  runEncounter,
};
