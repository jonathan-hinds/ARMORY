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
const { runCombat } = require('./combatEngine');
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

const worldStates = new Map();

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

function getWorldState(worldId) {
  if (!worldStates.has(worldId)) {
    worldStates.set(worldId, {
      players: new Map(),
      listeners: new Set(),
    });
  }
  return worldStates.get(worldId);
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

function broadcastWorldState(worldId) {
  const state = getWorldState(worldId);
  const payload = { type: 'state', players: serializePlayersForClient(state) };
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

function ensurePlayerEntry(worldId, characterId, name, world) {
  const state = getWorldState(worldId);
  let entry = state.players.get(characterId);
  if (!entry) {
    const spawn = isWalkableTile(world, world.spawn.x, world.spawn.y) ? world.spawn : firstWalkable(world);
    entry = {
      characterId,
      name,
      x: spawn.x,
      y: spawn.y,
      facing: 'down',
      updatedAt: Date.now(),
      lastEncounterAt: 0,
      pendingEncounter: null,
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

async function joinWorld(worldId, characterId) {
  if (!Number.isFinite(characterId)) {
    throw new Error('characterId required');
  }
  const world = await getWorldById(worldId);
  if (!world) {
    throw new Error('world not found');
  }
  await ensureBattlefieldIdle(characterId);
  await ensureAdventureIdle(characterId);
  const prep = await prepareCharacterForCombat(characterId);
  const entry = ensurePlayerEntry(worldId, characterId, prep.character.name, world);
  broadcastWorldState(worldId);
  return {
    world: sanitizeWorld(world),
    player: { characterId: entry.characterId, name: entry.name, x: entry.x, y: entry.y, facing: entry.facing },
    players: serializePlayersForClient(getWorldState(worldId)),
  };
}

async function leaveWorld(worldId, characterId) {
  const state = getWorldState(worldId);
  const existing = state.players.get(characterId);
  if (existing) {
    state.players.delete(characterId);
    broadcastWorldState(worldId);
  }
  return { success: true };
}

async function movePlayer(worldId, characterId, direction) {
  const world = await getWorldById(worldId);
  if (!world) {
    throw new Error('world not found');
  }
  const state = getWorldState(worldId);
  const player = state.players.get(characterId);
  if (!player) {
    throw new Error('player not in world');
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
        player.pendingEncounter = { token, template: deepClone(template) };
        player.lastEncounterAt = now;
        encounter = { token };
      }
    }
  }

  broadcastWorldState(worldId);
  return {
    position: { x: player.x, y: player.y, facing: player.facing },
    moved,
    encounter,
  };
}

function subscribe(worldId, characterId, send) {
  const world = worldStates.get(worldId);
  if (!world) {
    throw new Error('world not found');
  }
  if (!world.players.has(characterId)) {
    throw new Error('player not in world');
  }
  world.listeners.add(send);
  send({ type: 'state', players: serializePlayersForClient(world) });
  return () => {
    world.listeners.delete(send);
  };
}

async function runEncounter(worldId, characterId, token, send) {
  const world = await getWorldById(worldId);
  if (!world) {
    throw new Error('world not found');
  }
  const state = getWorldState(worldId);
  const playerEntry = state.players.get(characterId);
  if (!playerEntry || !playerEntry.pendingEncounter || playerEntry.pendingEncounter.token !== token) {
    throw new Error('no pending encounter');
  }
  const { template } = playerEntry.pendingEncounter;
  playerEntry.pendingEncounter = null;

  const prep = await prepareCharacterForCombat(characterId);
  const enemy = instantiateEncounter(template, prep.abilityMap, prep.equipmentMap);
  if (!enemy) {
    throw new Error('encounter unavailable');
  }

  const rewards = {
    xpPct: template.xpPct || 0.06,
    gold: template.gold || 7,
  };

  const playerClone = deepClone(prep.character);
  const enemyClone = deepClone(enemy);

  const result = await runCombat(
    playerClone,
    enemyClone,
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
  const xpGain = playerWon ? Math.max(5, Math.round(xpForNextLevel(prep.characterDoc.level || 1) * rewards.xpPct)) : 0;
  const goldGain = playerWon ? Math.max(0, rewards.gold) : 0;

  const consumed = result.consumedUseables || {};
  const consumedByPlayer = consumed[prep.character.id] || [];
  consumeUseables(prep.characterDoc, consumedByPlayer);
  if (playerWon) {
    applyEncounterRewards(prep.characterDoc, { xpGain, goldGain });
  }
  await prep.characterDoc.save();

  const updatedCharacter = serializeCharacter(prep.characterDoc);

  send({
    type: 'end',
    winnerId: result.winnerId,
    xpGain,
    gpGain: goldGain,
    character: updatedCharacter,
    gold: typeof prep.characterDoc.gold === 'number' ? prep.characterDoc.gold : 0,
  });
}

module.exports = {
  listWorlds,
  joinWorld,
  leaveWorld,
  movePlayer,
  subscribe,
  runEncounter,
};
