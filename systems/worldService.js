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
const VALID_FACING = new Set(['up', 'down', 'left', 'right']);

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
    .map(row =>
      (Array.isArray(row)
        ? row
            .map(v => (Number.isFinite(v) ? Math.round(v) : parseInt(v, 10)))
            .map(v => (Number.isFinite(v) ? v : 0))
        : []),
    )
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
      const spawnChanceRaw = Number.isFinite(template.spawnChance)
        ? Number(template.spawnChance)
        : parseFloat(template.spawnChance);
      const spawnChance = Number.isFinite(spawnChanceRaw) ? Math.max(0, spawnChanceRaw) : 1;
      const sprite =
        typeof template.sprite === 'string' && template.sprite.trim()
          ? template.sprite.trim()
          : null;
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
        spawnChance,
        sprite,
      };
    })
    .filter(Boolean);
}

function normalizeNpcDialog(rawDialog) {
  const result = { entries: [], loopFrom: null };
  const appendEntry = candidate => {
    let lines = [];
    if (Array.isArray(candidate)) {
      lines = candidate;
    } else if (typeof candidate === 'string') {
      lines = candidate.split(/\r?\n/);
    } else if (candidate && typeof candidate === 'object') {
      if (Array.isArray(candidate.lines)) {
        lines = candidate.lines;
      } else if (typeof candidate.lines === 'string') {
        lines = candidate.lines.split(/\r?\n/);
      } else if (Array.isArray(candidate.dialog)) {
        lines = candidate.dialog;
      } else if (typeof candidate.text === 'string') {
        lines = candidate.text.split(/\r?\n/);
      }
    }
    const normalizedLines = lines
      .map(line => (typeof line === 'string' ? line.trim() : ''))
      .filter(line => line.length > 0);
    if (normalizedLines.length) {
      result.entries.push({ lines: normalizedLines });
    }
  };

  if (Array.isArray(rawDialog)) {
    appendEntry(rawDialog);
    if (result.entries.length) {
      result.loopFrom = 0;
    }
  } else if (typeof rawDialog === 'string') {
    appendEntry(rawDialog);
    if (result.entries.length) {
      result.loopFrom = 0;
    }
  } else if (rawDialog && typeof rawDialog === 'object') {
    if (Array.isArray(rawDialog.entries)) {
      rawDialog.entries.forEach(entry => appendEntry(entry));
    } else if (Array.isArray(rawDialog.lines)) {
      appendEntry(rawDialog.lines);
    } else if (Array.isArray(rawDialog.dialog)) {
      appendEntry(rawDialog.dialog);
    } else if (typeof rawDialog.lines === 'string') {
      appendEntry(rawDialog.lines);
    } else if (typeof rawDialog.dialog === 'string') {
      appendEntry(rawDialog.dialog);
    }
    const loopCandidate =
      rawDialog.loopFrom ?? rawDialog.loopStart ?? rawDialog.loop ?? null;
    if (Number.isInteger(loopCandidate) && loopCandidate >= 0) {
      result.loopFrom = loopCandidate;
    }
  }

  if (!result.entries.length) {
    return { entries: [], loopFrom: null };
  }

  if (result.loopFrom == null) {
    result.loopFrom = null;
  } else {
    result.loopFrom = Math.max(0, Math.min(result.entries.length - 1, result.loopFrom));
  }

  return {
    entries: result.entries.map(entry => ({ lines: entry.lines.slice() })),
    loopFrom: result.loopFrom,
  };
}

function normalizeNpcService(rawService) {
  if (!rawService) {
    return null;
  }
  if (typeof rawService === 'string') {
    const type = rawService.trim().toLowerCase();
    if (type === 'shop') {
      return { type: 'shop', shopId: null };
    }
    return null;
  }
  if (typeof rawService === 'object') {
    const type = typeof rawService.type === 'string' ? rawService.type.trim().toLowerCase() : '';
    if (!type) {
      return null;
    }
    if (type === 'shop') {
      const shopId =
        typeof rawService.shopId === 'string' && rawService.shopId.trim() ? rawService.shopId.trim() : null;
      return { type: 'shop', shopId };
    }
  }
  return null;
}

function sanitizeNpcId(value) {
  const base = typeof value === 'string' ? value : '';
  const sanitized = base.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return sanitized || 'npc';
}

function uniqueNpcId(baseId, used) {
  const sanitized = sanitizeNpcId(baseId);
  let candidate = sanitized;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${sanitized}_${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

function normalizeEncounter(raw = {}) {
  const tiles = Array.isArray(raw.tiles)
    ? raw.tiles
        .map(v => {
          const numeric = Number(v);
          return Number.isFinite(numeric) ? Math.round(numeric) : null;
        })
        .filter(Number.isFinite)
    : [];
  const chance = Number.isFinite(raw.chance) ? Math.max(0, Math.min(1, raw.chance)) : 0;
  const cooldownMs = Number.isFinite(raw.cooldownMs) ? Math.max(0, Math.round(raw.cooldownMs)) : 0;
  const enemyCountRaw = Number.isFinite(raw.enemyCount)
    ? Number(raw.enemyCount)
    : parseInt(raw.enemyCount, 10);
  const enemyCount = Number.isFinite(enemyCountRaw) ? Math.max(0, Math.round(enemyCountRaw)) : 0;
  return {
    tiles: tiles.length ? tiles : [],
    chance,
    cooldownMs,
    enemyCount,
    templates: normalizeTemplates(raw.templates),
  };
}

function sanitizeZoneId(value) {
  const base = typeof value === 'string' ? value : '';
  const sanitized = base.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return sanitized || 'zone';
}

function uniqueZoneId(baseId, used) {
  const sanitized = sanitizeZoneId(baseId);
  let candidate = sanitized;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${sanitized}_${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

function collectWalkableTiles(tiles) {
  const walkable = [];
  if (!Array.isArray(tiles)) {
    return walkable;
  }
  for (let y = 0; y < tiles.length; y += 1) {
    const row = tiles[y];
    if (!Array.isArray(row)) continue;
    for (let x = 0; x < row.length; x += 1) {
      const tile = row[x];
      if (tile === 1 || tile === 2) {
        walkable.push({ x, y });
      }
    }
  }
  return walkable;
}

function normalizeTransports(rawTransports) {
  if (!Array.isArray(rawTransports)) {
    return [];
  }
  return rawTransports
    .map(entry => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }
      const fromXRaw = entry.from && Number.isFinite(entry.from.x) ? entry.from.x : parseInt(entry?.from?.x, 10);
      const fromYRaw = entry.from && Number.isFinite(entry.from.y) ? entry.from.y : parseInt(entry?.from?.y, 10);
      const toXRaw = entry.to && Number.isFinite(entry.to.x) ? entry.to.x : parseInt(entry?.to?.x, 10);
      const toYRaw = entry.to && Number.isFinite(entry.to.y) ? entry.to.y : parseInt(entry?.to?.y, 10);
      const fromX = Number.isFinite(fromXRaw) ? Math.max(0, Math.round(fromXRaw)) : 0;
      const fromY = Number.isFinite(fromYRaw) ? Math.max(0, Math.round(fromYRaw)) : 0;
      const toX = Number.isFinite(toXRaw) ? Math.max(0, Math.round(toXRaw)) : 0;
      const toY = Number.isFinite(toYRaw) ? Math.max(0, Math.round(toYRaw)) : 0;
      const toZoneId = entry.toZoneId ? String(entry.toZoneId) : '';
      return {
        from: { x: fromX, y: fromY },
        toZoneId,
        to: { x: toX, y: toY },
      };
    })
    .filter(Boolean);
}

function normalizeEnemyPlacements(rawPlacements) {
  if (!Array.isArray(rawPlacements)) {
    return [];
  }
  return rawPlacements
    .map(entry => {
      if (!entry || typeof entry !== 'object') return null;
      const xRaw = Number.isFinite(entry.x) ? entry.x : parseInt(entry.x, 10);
      const yRaw = Number.isFinite(entry.y) ? entry.y : parseInt(entry.y, 10);
      const x = Number.isFinite(xRaw) ? Math.max(0, Math.round(xRaw)) : 0;
      const y = Number.isFinite(yRaw) ? Math.max(0, Math.round(yRaw)) : 0;
      const templateId = entry.templateId ? String(entry.templateId) : '';
      return { x, y, templateId };
    })
    .filter(Boolean);
}

function normalizeNpcs(entry, zones, defaultZoneId) {
  const zoneIds = new Set(Array.isArray(zones) ? zones.map(zone => zone.id) : []);
  const usedIds = new Set();
  const npcs = [];
  const npcMap = new Map();
  const zoneNpcMap = new Map();
  const rawNpcs = Array.isArray(entry && entry.npcs) ? entry.npcs : [];
  rawNpcs.forEach((npcEntry, index) => {
    if (!npcEntry || typeof npcEntry !== 'object') {
      return;
    }
    const baseId = npcEntry.id || `npc_${index + 1}`;
    const id = uniqueNpcId(baseId, usedIds);
    const name = typeof npcEntry.name === 'string' && npcEntry.name.trim() ? npcEntry.name.trim() : id;
    const sprite =
      typeof npcEntry.sprite === 'string' && npcEntry.sprite.trim() ? npcEntry.sprite.trim() : null;
    const zoneIdRaw = typeof npcEntry.zoneId === 'string' && npcEntry.zoneId.trim() ? npcEntry.zoneId.trim() : null;
    const zoneId = zoneIdRaw && zoneIds.has(zoneIdRaw) ? zoneIdRaw : null;
    if (!zoneId) {
      return;
    }
    const xRaw = Number.isFinite(npcEntry.x) ? npcEntry.x : parseInt(npcEntry.x, 10);
    const yRaw = Number.isFinite(npcEntry.y) ? npcEntry.y : parseInt(npcEntry.y, 10);
    let x = Number.isFinite(xRaw) ? Math.max(0, Math.round(xRaw)) : 0;
    let y = Number.isFinite(yRaw) ? Math.max(0, Math.round(yRaw)) : 0;
    if (zoneId) {
      const zone = zones.find(z => z.id === zoneId);
      if (zone) {
        if (Number.isFinite(zone.width) && zone.width > 0) {
          x = Math.max(0, Math.min(zone.width - 1, x));
        }
        if (Number.isFinite(zone.height) && zone.height > 0) {
          y = Math.max(0, Math.min(zone.height - 1, y));
        }
      }
    }
    const facingRaw = typeof npcEntry.facing === 'string' ? npcEntry.facing.toLowerCase() : '';
    const facing = VALID_FACING.has(facingRaw) ? facingRaw : 'down';
    const dialog = normalizeNpcDialog(npcEntry.dialog);
    const service = normalizeNpcService(npcEntry.service);
    const npc = {
      id,
      name,
      sprite,
      zoneId,
      x,
      y,
      facing,
      dialog,
      service,
    };
    npcs.push(npc);
    npcMap.set(id, npc);
    if (zoneId) {
      if (!zoneNpcMap.has(zoneId)) {
        zoneNpcMap.set(zoneId, []);
      }
      zoneNpcMap.get(zoneId).push(npc);
    }
  });
  zones.forEach(zone => {
    if (!zoneNpcMap.has(zone.id)) {
      zoneNpcMap.set(zone.id, []);
    }
  });
  return { npcs, npcMap, zoneNpcMap };
}

function normalizeZoneEntry(entry, fallbackBaseId, usedIds) {
  const baseId = entry && entry.id ? String(entry.id) : fallbackBaseId;
  const id = uniqueZoneId(baseId, usedIds);
  const name = entry && entry.name ? String(entry.name) : id;
  const tiles = normalizeTiles(entry && entry.tiles ? entry.tiles : []);
  const width = tiles[0] ? tiles[0].length : 0;
  const height = tiles.length;
  const walkableTiles = collectWalkableTiles(tiles);
  const spawnCandidate = entry && entry.spawn ? entry.spawn : null;
  let spawn = { x: 0, y: 0 };
  if (spawnCandidate && typeof spawnCandidate === 'object') {
    const spawnXRaw = Number.isFinite(spawnCandidate.x) ? spawnCandidate.x : parseInt(spawnCandidate.x, 10);
    const spawnYRaw = Number.isFinite(spawnCandidate.y) ? spawnCandidate.y : parseInt(spawnCandidate.y, 10);
    const spawnX = Number.isFinite(spawnXRaw) ? Math.max(0, Math.round(spawnXRaw)) : null;
    const spawnY = Number.isFinite(spawnYRaw) ? Math.max(0, Math.round(spawnYRaw)) : null;
    if (spawnX != null && spawnY != null) {
      spawn = { x: spawnX, y: spawnY };
    }
  }
  if (!walkableTiles.some(tile => tile.x === spawn.x && tile.y === spawn.y)) {
    if (walkableTiles.length) {
      spawn = { ...walkableTiles[0] };
    } else {
      spawn = { x: 0, y: 0 };
    }
  }
  const transports = normalizeTransports(entry && entry.transports ? entry.transports : []);
  const enemyPlacements = normalizeEnemyPlacements(entry && entry.enemyPlacements ? entry.enemyPlacements : []);
  return {
    id,
    name,
    tiles,
    width,
    height,
    spawn,
    transports,
    enemyPlacements,
    walkableTiles,
    npcs: [],
  };
}

function normalizeZones(entry) {
  const used = new Set();
  const zones = [];
  if (entry && Array.isArray(entry.zones) && entry.zones.length) {
    entry.zones.forEach((zoneEntry, index) => {
      const fallbackBase = entry && entry.id ? `${entry.id}_zone_${index + 1}` : `zone_${index + 1}`;
      const normalized = normalizeZoneEntry(zoneEntry, fallbackBase, used);
      zones.push(normalized);
    });
  }
  if (!zones.length) {
    const fallbackBase = entry && entry.id ? String(entry.id) : 'zone';
    zones.push(
      normalizeZoneEntry(
        {
          id: fallbackBase,
          name: entry && entry.name ? String(entry.name) : fallbackBase,
          tiles: entry ? entry.tiles : [],
          spawn: entry ? entry.spawn : null,
          transports: entry ? entry.transports : [],
          enemyPlacements: entry ? entry.enemyPlacements : [],
        },
        fallbackBase,
        used,
      ),
    );
  }
  return zones;
}

function getZone(world, zoneId) {
  if (!world) {
    return null;
  }
  if (zoneId && world.zoneMap && world.zoneMap.has(zoneId)) {
    return world.zoneMap.get(zoneId);
  }
  if (world.defaultZoneId && world.zoneMap && world.zoneMap.has(world.defaultZoneId)) {
    return world.zoneMap.get(world.defaultZoneId);
  }
  if (world.zoneMap && typeof world.zoneMap.values === 'function') {
    const iterator = world.zoneMap.values().next();
    if (!iterator.done) {
      return iterator.value;
    }
  }
  return null;
}

function getTransportAt(world, zoneId, x, y) {
  const zone = getZone(world, zoneId);
  if (!zone || !Array.isArray(zone.transports)) {
    return null;
  }
  return zone.transports.find(entry => entry && entry.from && entry.from.x === x && entry.from.y === y) || null;
}

function normalizeWorld(entry) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }
  const zones = normalizeZones(entry);
  const zoneMap = new Map();
  zones.forEach(zone => {
    zoneMap.set(zone.id, zone);
  });
  const defaultZone = zones[0] || null;
  const defaultZoneId = defaultZone ? defaultZone.id : null;
  const { npcs, npcMap, zoneNpcMap } = normalizeNpcs(entry, zones, defaultZoneId);
  zones.forEach(zone => {
    const zoneNpcs = zoneNpcMap.get(zone.id) || [];
    zone.npcs = zoneNpcs.map(npc => ({
      id: npc.id,
      name: npc.name,
      x: npc.x,
      y: npc.y,
      facing: npc.facing,
      sprite: npc.sprite || null,
      service: npc.service || null,
    }));
  });
  const tiles = defaultZone ? defaultZone.tiles : [];
  const width = defaultZone ? defaultZone.width : tiles.length ? tiles[0].length : 0;
  const height = defaultZone ? defaultZone.height : tiles.length;
  const spawn = defaultZone ? { ...defaultZone.spawn } : { x: 0, y: 0 };
  const walkableTiles = [];
  zones.forEach(zone => {
    if (!zone || !Array.isArray(zone.walkableTiles)) return;
    zone.walkableTiles.forEach(tile => {
      walkableTiles.push({ zoneId: zone.id, x: tile.x, y: tile.y });
    });
  });
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
    zones,
    zoneMap,
    defaultZoneId,
    walkableTiles,
    npcs,
    npcMap,
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
  const zones = Array.isArray(world.zones)
    ? world.zones.map(zone => ({
        id: zone.id,
        name: zone.name,
        tiles: zone.tiles,
        spawn: zone.spawn,
        transports: zone.transports,
        npcs: Array.isArray(zone.npcs)
          ? zone.npcs.map(npc => ({
              id: npc.id,
              name: npc.name,
              x: npc.x,
              y: npc.y,
              facing: npc.facing,
              sprite: npc.sprite || null,
            }))
          : [],
      }))
    : [];
  const npcs = Array.isArray(world.npcs)
    ? world.npcs.map(npc => ({
        id: npc.id,
        name: npc.name,
        zoneId: npc.zoneId || null,
        x: npc.x,
        y: npc.y,
        facing: npc.facing,
        sprite: npc.sprite || null,
        service: npc.service || null,
      }))
    : [];
  return {
    id: world.id,
    name: world.name,
    tileSize: world.tileSize,
    tiles: world.tiles,
    spawn: world.spawn,
    palette: world.palette,
    tileConfig: world.tileConfig,
    moveCooldownMs: world.moveCooldownMs,
    defaultZoneId: world.defaultZoneId || null,
    zones,
    npcs,
  };
}

function serializePlayersForClient(state) {
  return Array.from(state.players.values()).map(player => ({
    characterId: player.characterId,
    name: player.name,
    x: player.x,
    y: player.y,
    facing: player.facing,
    zoneId: player.zoneId || null,
  }));
}

function serializeEnemiesForClient(state) {
  if (!state || !state.enemies) {
    return [];
  }
  return Array.from(state.enemies.values()).map(enemy => ({
    id: enemy.id,
    name: enemy.name,
    x: enemy.x,
    y: enemy.y,
    facing: enemy.facing,
    zoneId: enemy.zoneId || null,
    sprite: enemy.sprite || null,
  }));
}

function serializeNpcsForClient(state) {
  if (!state || !state.npcs) {
    return [];
  }
  return Array.from(state.npcs.values()).map(npc => ({
    id: npc.id,
    name: npc.name,
    x: npc.x,
    y: npc.y,
    facing: npc.facing || 'down',
    zoneId: npc.zoneId || null,
    sprite: npc.sprite || null,
    service: npc.service || null,
  }));
}

function broadcastWorldState(state) {
  if (!state) return;
  const payload = {
    type: 'state',
    phase: state.phase,
    players: serializePlayersForClient(state),
    enemies: serializeEnemiesForClient(state),
    npcs: serializeNpcsForClient(state),
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

function firstWalkableInZone(zone) {
  if (!zone || !Array.isArray(zone.walkableTiles) || !zone.walkableTiles.length) {
    return { x: 0, y: 0 };
  }
  const first = zone.walkableTiles[0];
  return { x: first.x, y: first.y };
}

function findFirstUnoccupiedTile(state, zone, ignoreCharacterId = null) {
  if (!state || !zone || !Array.isArray(zone.walkableTiles)) {
    return null;
  }
  for (let idx = 0; idx < zone.walkableTiles.length; idx += 1) {
    const tile = zone.walkableTiles[idx];
    const blocking = findBlockingEntity(state, zone.id, tile.x, tile.y, { ignoreCharacterId });
    if (!blocking) {
      return { x: tile.x, y: tile.y };
    }
  }
  return null;
}

function isWalkableTile(world, zoneId, x, y) {
  const zone = getZone(world, zoneId);
  if (!zone || !Array.isArray(zone.tiles)) return false;
  if (y < 0 || y >= zone.tiles.length) return false;
  const row = zone.tiles[y];
  if (!Array.isArray(row)) return false;
  if (x < 0 || x >= row.length) return false;
  const tile = row[x];
  return tile === 1 || tile === 2;
}

function ensurePlayerEntry(state, characterId, name) {
  if (!state || !state.world) {
    throw new Error('world not available');
  }
  let entry = state.players.get(characterId);
  if (!entry) {
    const world = state.world;
    const zone = getZone(world, world.defaultZoneId);
    let spawn = zone && isWalkableTile(world, zone.id, zone.spawn.x, zone.spawn.y)
      ? zone.spawn
      : zone
        ? firstWalkableInZone(zone)
        : { x: 0, y: 0 };
    if (zone) {
      const blocking = findBlockingEntity(state, zone.id, spawn.x, spawn.y, { ignoreCharacterId: characterId });
      if (blocking) {
        const alternative = findFirstUnoccupiedTile(state, zone, characterId);
        if (alternative) {
          spawn = alternative;
        }
      }
    }
    entry = {
      characterId,
      name,
      x: spawn.x,
      y: spawn.y,
      facing: 'down',
      zoneId: zone ? zone.id : world.defaultZoneId || null,
      updatedAt: Date.now(),
    };
    state.players.set(characterId, entry);
  } else {
    entry.name = name;
    if (!entry.zoneId) {
      entry.zoneId = state.world.defaultZoneId || null;
    }
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

function getEncounterTemplateById(world, templateId) {
  if (!world || !templateId) return null;
  const { encounters } = world;
  if (!encounters || !Array.isArray(encounters.templates)) {
    return null;
  }
  return encounters.templates.find(template => template && template.id === templateId) || null;
}

function chooseEncounterTemplate(world, templateId = null) {
  const { encounters } = world || {};
  if (!encounters || !Array.isArray(encounters.templates) || !encounters.templates.length) {
    return null;
  }
  if (templateId) {
    const found = getEncounterTemplateById(world, templateId);
    if (found) {
      return found;
    }
  }
  const weights = encounters.templates.map(template =>
    Number.isFinite(template.spawnChance) && template.spawnChance > 0 ? template.spawnChance : 0,
  );
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  if (totalWeight <= 0) {
    const idx = Math.floor(Math.random() * encounters.templates.length);
    return encounters.templates[idx] || null;
  }
  let roll = Math.random() * totalWeight;
  for (let idx = 0; idx < encounters.templates.length; idx += 1) {
    const template = encounters.templates[idx];
    const weight = weights[idx];
    if (weight <= 0) continue;
    roll -= weight;
    if (roll <= 0) {
      return template;
    }
  }
  return encounters.templates[encounters.templates.length - 1] || null;
}

const ENEMY_MOVE_DELTAS = [
  { dx: 0, dy: -1, facing: 'up' },
  { dx: 0, dy: 1, facing: 'down' },
  { dx: -1, dy: 0, facing: 'left' },
  { dx: 1, dy: 0, facing: 'right' },
];
const ENEMY_IDLE_MOVE = { dx: 0, dy: 0, facing: 'down' };
const PLAYER_FACING_DELTAS = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = array[i];
    array[i] = array[j];
    array[j] = temp;
  }
  return array;
}

function positionKey(zoneId, x, y) {
  const zoneKey = zoneId || 'zone';
  return `${zoneKey}:${x}:${y}`;
}

function distanceSquared(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function desiredEnemyCount(world) {
  if (!world || !world.encounters) return 0;
  const { encounters } = world;
  if (Number.isFinite(encounters.enemyCount) && encounters.enemyCount > 0) {
    return Math.round(encounters.enemyCount);
  }
  if (Array.isArray(encounters.templates)) {
    return encounters.templates.length;
  }
  return 0;
}

function ensureEnemyMap(state) {
  if (!state.enemies) {
    state.enemies = new Map();
  }
  return state.enemies;
}

function spawnMissingEnemies(state) {
  if (!state || !state.world) return;
  if (state.phase === 'encounter') return;
  const world = state.world;
  const desired = desiredEnemyCount(world);
  if (!desired) return;
  const enemyMap = ensureEnemyMap(state);
  const zonesToPopulate = new Set();
  state.players.forEach(player => {
    if (player && player.zoneId) {
      zonesToPopulate.add(player.zoneId);
    }
  });
  if (!zonesToPopulate.size && world.defaultZoneId) {
    zonesToPopulate.add(world.defaultZoneId);
  }
  const now = Date.now();
  const minEnemyDistanceSq = 9;
  const minPlayerDistanceSq = 4;

  const spawnInZone = zoneId => {
    const zone = getZone(world, zoneId);
    if (!zone || !Array.isArray(zone.walkableTiles) || !zone.walkableTiles.length) {
      return;
    }
    const zoneWalkable = shuffleArray(zone.walkableTiles.slice());
    const occupied = new Set();
    const enemyPositions = [];
    const playerPositions = [];
    let existingCount = 0;

    const placements = Array.isArray(zone.enemyPlacements) ? zone.enemyPlacements : [];
    const placementMap = new Map();
    placements.forEach(placement => {
      if (!placement || typeof placement !== 'object') return;
      const xRaw = Number.isFinite(placement.x) ? placement.x : parseInt(placement.x, 10);
      const yRaw = Number.isFinite(placement.y) ? placement.y : parseInt(placement.y, 10);
      const x = Number.isFinite(xRaw) ? Math.max(0, Math.round(xRaw)) : null;
      const y = Number.isFinite(yRaw) ? Math.max(0, Math.round(yRaw)) : null;
      if (x == null || y == null) return;
      const key = positionKey(zone.id, x, y);
      if (!placementMap.has(key)) {
        placementMap.set(key, {
          x,
          y,
          templateId: typeof placement.templateId === 'string' ? placement.templateId : String(placement.templateId || ''),
        });
      }
    });

    const placementEnemyMap = new Map();
    enemyMap.forEach(enemy => {
      if (enemy.zoneId === zone.id) {
        const key = positionKey(zone.id, enemy.x, enemy.y);
        occupied.add(key);
        const placement = placementMap.get(key);
        if (placement) {
          placementEnemyMap.set(key, enemy);
        } else {
          enemyPositions.push({ x: enemy.x, y: enemy.y });
          existingCount += 1;
        }
      }
    });
    state.players.forEach(player => {
      if (!player) return;
      const playerZoneId = player.zoneId || world.defaultZoneId || null;
      if (playerZoneId !== zone.id) return;
      occupied.add(positionKey(zone.id, player.x, player.y));
      playerPositions.push({ x: player.x, y: player.y });
    });
    if (zone.spawn) {
      occupied.add(positionKey(zone.id, zone.spawn.x, zone.spawn.y));
    }

    placementMap.forEach(placement => {
      const key = positionKey(zone.id, placement.x, placement.y);
      occupied.add(key);
      if (!isWalkableTile(world, zone.id, placement.x, placement.y)) {
        const existingEnemy = placementEnemyMap.get(key);
        if (existingEnemy) {
          enemyMap.delete(existingEnemy.id);
        }
        return;
      }
      const template = getEncounterTemplateById(world, placement.templateId);
      if (!template) {
        const existingEnemy = placementEnemyMap.get(key);
        if (existingEnemy) {
          enemyMap.delete(existingEnemy.id);
        }
        return;
      }
      const existingEnemy = placementEnemyMap.get(key);
      if (existingEnemy && existingEnemy.templateId === template.id) {
        existingEnemy.name = template.name;
        existingEnemy.sprite = template.sprite || null;
        existingEnemy.updatedAt = now;
        enemyPositions.push({ x: existingEnemy.x, y: existingEnemy.y });
        existingCount += 1;
        return;
      }
      if (existingEnemy) {
        enemyMap.delete(existingEnemy.id);
      }
      const rawChance = Number.isFinite(template.spawnChance)
        ? template.spawnChance
        : parseFloat(template.spawnChance);
      const spawnChance = Number.isFinite(rawChance) ? Math.min(1, Math.max(0, rawChance)) : 1;
      if (spawnChance <= 0) {
        return;
      }
      if (Math.random() >= spawnChance) {
        return;
      }
      const enemy = {
        id: uuid(),
        templateId: template.id,
        name: template.name,
        x: placement.x,
        y: placement.y,
        zoneId: zone.id,
        facing: 'down',
        updatedAt: now,
        sprite: template.sprite || null,
      };
      enemyMap.set(enemy.id, enemy);
      enemyPositions.push({ x: enemy.x, y: enemy.y });
      occupied.add(key);
      existingCount += 1;
    });

    if (existingCount >= desired) {
      return;
    }

    const trySpawn = enforceDistance => {
      for (let idx = 0; idx < zoneWalkable.length && existingCount < desired; idx += 1) {
        const pos = zoneWalkable[idx];
        const key = positionKey(zone.id, pos.x, pos.y);
        if (occupied.has(key)) continue;
        if (enforceDistance) {
          let tooCloseToEnemy = false;
          for (let i = 0; i < enemyPositions.length; i += 1) {
            const existing = enemyPositions[i];
            if (distanceSquared(existing.x, existing.y, pos.x, pos.y) < minEnemyDistanceSq) {
              tooCloseToEnemy = true;
              break;
            }
          }
          if (tooCloseToEnemy) continue;
          let tooCloseToPlayer = false;
          for (let i = 0; i < playerPositions.length; i += 1) {
            const playerPos = playerPositions[i];
            if (distanceSquared(playerPos.x, playerPos.y, pos.x, pos.y) < minPlayerDistanceSq) {
              tooCloseToPlayer = true;
              break;
            }
          }
          if (tooCloseToPlayer) continue;
        }
        const template = chooseEncounterTemplate(world);
        if (!template) {
          return;
        }
        const enemy = {
          id: uuid(),
          templateId: template.id,
          name: template.name,
          x: pos.x,
          y: pos.y,
          zoneId: zone.id,
          facing: 'down',
          updatedAt: now,
          sprite: template.sprite || null,
        };
        enemyMap.set(enemy.id, enemy);
        enemyPositions.push({ x: enemy.x, y: enemy.y });
        occupied.add(key);
        existingCount += 1;
      }
    };

    trySpawn(true);
    if (existingCount < desired) {
      trySpawn(false);
    }
  };

  if (!zonesToPopulate.size) {
    spawnInZone(world.defaultZoneId || null);
  } else {
    zonesToPopulate.forEach(zoneId => spawnInZone(zoneId));
  }
}

function findEnemyAtPosition(state, zoneId, x, y) {
  if (!state || !state.enemies) return null;
  for (const enemy of state.enemies.values()) {
    if (enemy.zoneId === zoneId && enemy.x === x && enemy.y === y) {
      return enemy;
    }
  }
  return null;
}

function findNpcAtPosition(state, zoneId, x, y) {
  if (!state || !state.npcs) return null;
  for (const npc of state.npcs.values()) {
    if (npc.zoneId === zoneId && npc.x === x && npc.y === y) {
      return npc;
    }
  }
  return null;
}

function advanceNpcDialogLines(npc) {
  if (!npc) {
    return [];
  }
  if (!npc.dialog || typeof npc.dialog !== 'object') {
    npc.dialog = { entries: [], loopFrom: null };
  }
  if (!npc.dialogState || typeof npc.dialogState !== 'object') {
    npc.dialogState = { nextIndex: 0 };
  }
  const entries = Array.isArray(npc.dialog.entries) ? npc.dialog.entries : [];
  if (!entries.length) {
    npc.dialogState.nextIndex = 0;
    return [];
  }
  let index = Number.isInteger(npc.dialogState.nextIndex) ? npc.dialogState.nextIndex : 0;
  if (index < 0 || index >= entries.length) {
    index = entries.length - 1;
  }
  const entry = entries[index] || {};
  const lines = Array.isArray(entry.lines)
    ? entry.lines
        .map(line => (typeof line === 'string' ? line.trim() : ''))
        .filter(line => line.length > 0)
    : [];
  let nextIndex;
  if (index < entries.length - 1) {
    nextIndex = index + 1;
  } else {
    const loopFrom = Number.isInteger(npc.dialog.loopFrom) ? npc.dialog.loopFrom : null;
    if (loopFrom != null && loopFrom >= 0 && loopFrom < entries.length) {
      nextIndex = loopFrom;
    } else {
      nextIndex = entries.length - 1;
    }
  }
  npc.dialogState.nextIndex = nextIndex;
  return lines;
}

function findPlayerAtPosition(state, zoneId, x, y, ignoreCharacterId = null) {
  if (!state || !state.players) return null;
  const world = state.world;
  const defaultZoneId = world ? world.defaultZoneId || null : null;
  for (const player of state.players.values()) {
    if (!player) continue;
    if (ignoreCharacterId && player.characterId === ignoreCharacterId) {
      continue;
    }
    const playerZoneId = player.zoneId || defaultZoneId;
    if (playerZoneId === zoneId && player.x === x && player.y === y) {
      return player;
    }
  }
  return null;
}

function findBlockingEntity(state, zoneId, x, y, options = {}) {
  if (!state) return null;
  const { ignoreCharacterId = null } = options;
  const enemy = findEnemyAtPosition(state, zoneId, x, y);
  if (enemy) {
    return { type: 'enemy', entity: enemy };
  }
  const npc = findNpcAtPosition(state, zoneId, x, y);
  if (npc) {
    return { type: 'npc', entity: npc };
  }
  const player = findPlayerAtPosition(state, zoneId, x, y, ignoreCharacterId);
  if (player) {
    return { type: 'player', entity: player };
  }
  return null;
}

function getFacingDelta(facing) {
  const normalized = typeof facing === 'string' ? facing.toLowerCase() : '';
  return PLAYER_FACING_DELTAS[normalized] || PLAYER_FACING_DELTAS.down;
}

function moveEnemies(state) {
  if (!state || state.phase === 'encounter') return null;
  const world = state.world;
  const enemyMap = ensureEnemyMap(state);
  if (!world || !enemyMap.size) {
    return null;
  }
  const enemies = Array.from(enemyMap.values());
  if (!enemies.length) return null;
  const collisions = [];
  const occupied = new Map();
  enemies.forEach(enemy => {
    occupied.set(positionKey(enemy.zoneId, enemy.x, enemy.y), enemy.id);
  });
  const playerPositions = new Map();
  state.players.forEach(player => {
    const zoneId = player.zoneId || world.defaultZoneId || null;
    playerPositions.set(positionKey(zoneId, player.x, player.y), player.characterId);
  });
  const npcPositions = new Set();
  if (state.npcs) {
    state.npcs.forEach(npc => {
      if (!npc) return;
      const npcZoneId = npc.zoneId || world.defaultZoneId || null;
      npcPositions.add(positionKey(npcZoneId, npc.x, npc.y));
    });
  }
  const now = Date.now();
  enemies.forEach(enemy => {
    const moves = shuffleArray(ENEMY_MOVE_DELTAS.slice());
    moves.push(ENEMY_IDLE_MOVE);
    const originKey = positionKey(enemy.zoneId, enemy.x, enemy.y);
    for (let idx = 0; idx < moves.length; idx += 1) {
      const move = moves[idx];
      const nextX = enemy.x + move.dx;
      const nextY = enemy.y + move.dy;
      if (!isWalkableTile(world, enemy.zoneId, nextX, nextY)) {
        continue;
      }
      const key = positionKey(enemy.zoneId, nextX, nextY);
      if (playerPositions.has(key)) {
        collisions.push({ enemy, characterId: playerPositions.get(key) });
        enemy.facing = move.facing;
        enemy.updatedAt = now;
        return;
      }
      if (npcPositions.has(key)) {
        continue;
      }
      const occupiedBy = occupied.get(key);
      if (occupiedBy && occupiedBy !== enemy.id) {
        continue;
      }
      enemy.x = nextX;
      enemy.y = nextY;
      enemy.facing = move.facing;
      enemy.updatedAt = now;
      if (originKey !== key) {
        occupied.delete(originKey);
        occupied.set(key, enemy.id);
      }
      if (playerPositions.has(key)) {
        collisions.push({ enemy, characterId: playerPositions.get(key) });
      }
      return;
    }
    enemy.updatedAt = now;
  });
  return collisions.length ? collisions : null;
}

function beginEnemyEncounter(state, enemy, startedBy) {
  if (!state || !enemy || state.phase === 'encounter') return null;
  const world = state.world;
  const template = chooseEncounterTemplate(world, enemy.templateId);
  if (!template) return null;
  ensureEnemyMap(state).delete(enemy.id);
  const token = uuid();
  const participants = Array.from(state.players.keys());
  state.activeEncounter = {
    token,
    template: deepClone(template),
    startedBy,
    listeners: new Set(),
    started: false,
    completed: false,
    lastEvent: null,
    resultPayload: null,
    participants,
    enemyId: enemy.id,
  };
  state.phase = 'encounter';
  state.listeners.forEach(listener => {
    try {
      listener({ type: 'encounter', token, startedBy });
    } catch (err) {
      console.error('world encounter notify failed', err);
    }
  });
  return { token };
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
  const state = {
    id: instanceId,
    worldId,
    world,
    players: new Map(),
    enemies: new Map(),
    npcs: new Map(),
    listeners: new Set(),
    expectedParticipants: new Set(participantIds),
    phase: 'lobby',
    activeEncounter: null,
  };
  if (Array.isArray(world.npcs)) {
    world.npcs.forEach(npc => {
      if (!npc || !npc.id) return;
      state.npcs.set(npc.id, {
        ...npc,
        dialog: normalizeNpcDialog(npc.dialog),
        service: normalizeNpcService(npc.service),
        dialogState: { nextIndex: 0 },
      });
    });
  }
  worldInstances.set(instanceId, state);
  spawnMissingEnemies(state);
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
    player: {
      characterId: entry.characterId,
      name: entry.name,
      x: entry.x,
      y: entry.y,
      facing: entry.facing,
      zoneId: entry.zoneId || null,
    },
    players: serializePlayersForClient(state),
    enemies: serializeEnemiesForClient(state),
    npcs: serializeNpcsForClient(state),
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
  let encounterEnemy = null;
  let triggeredNpcInteraction = null;
  const zoneBeforeMove = player.zoneId || world.defaultZoneId || null;
  const nextX = player.x + delta.dx;
  const nextY = player.y + delta.dy;
  if (isWalkableTile(world, zoneBeforeMove, nextX, nextY)) {
    const blocking = findBlockingEntity(state, zoneBeforeMove, nextX, nextY, {
      ignoreCharacterId: characterId,
    });
    if (!blocking) {
      player.x = nextX;
      player.y = nextY;
      moved = true;
    } else if (blocking.type === 'enemy') {
      encounterEnemy = blocking.entity;
    } else if (blocking.type === 'npc') {
      const npc = blocking.entity;
      const lines = advanceNpcDialogLines(npc);
      triggeredNpcInteraction = { npc, lines };
    }
  }
  player.facing = delta.facing;
  player.updatedAt = now;
  player.moveCooldown = now + world.moveCooldownMs;

  const previousStoredZoneId = player.zoneId;
  const previousX = player.x;
  const previousY = player.y;
  const currentZoneId = player.zoneId || world.defaultZoneId || null;
  const currentTransport = getTransportAt(world, currentZoneId, player.x, player.y);
  let transportTriggered = false;
  if (currentTransport) {
    const targetZone = getZone(world, currentTransport.toZoneId);
    if (targetZone) {
      let destX = currentTransport.to.x;
      let destY = currentTransport.to.y;
      if (!isWalkableTile(world, targetZone.id, destX, destY)) {
        const fallback = firstWalkableInZone(targetZone);
        destX = fallback.x;
        destY = fallback.y;
      }
      const blocking = findBlockingEntity(state, targetZone.id, destX, destY, {
        ignoreCharacterId: characterId,
      });
      if (blocking) {
        if (blocking.type === 'enemy') {
          encounterEnemy = encounterEnemy || blocking.entity;
        } else {
          const alternative = findFirstUnoccupiedTile(state, targetZone, characterId);
          if (alternative) {
            destX = alternative.x;
            destY = alternative.y;
          } else {
            player.zoneId = previousStoredZoneId;
            player.x = previousX;
            player.y = previousY;
            transportTriggered = false;
            destX = null;
            destY = null;
          }
        }
      }
      if (destX != null && destY != null) {
        player.zoneId = targetZone.id;
        player.x = destX;
        player.y = destY;
        transportTriggered = true;
      }
    }
  }

  if (!player.zoneId) {
    player.zoneId = world.defaultZoneId || null;
  }

  let encounter = null;
  if (encounterEnemy) {
    encounter = beginEnemyEncounter(state, encounterEnemy, characterId);
  }

  if (!encounter) {
    const collidedEnemy = findEnemyAtPosition(
      state,
      player.zoneId || world.defaultZoneId || null,
      player.x,
      player.y,
    );
    if (collidedEnemy) {
      encounter = beginEnemyEncounter(state, collidedEnemy, characterId);
    }
  }

  if (!encounter) {
    const enemyCollisions = moveEnemies(state);
    if (enemyCollisions && enemyCollisions.length) {
      const { enemy, characterId: collidedCharacterId } = enemyCollisions[0];
      encounter = beginEnemyEncounter(state, enemy, collidedCharacterId || characterId);
    }
  }

  if (!encounter) {
    spawnMissingEnemies(state);
  }

  broadcastWorldState(state);
  return {
    position: {
      x: player.x,
      y: player.y,
      facing: player.facing,
      zoneId: player.zoneId || world.defaultZoneId || null,
    },
    moved: moved || transportTriggered,
    encounter,
    interaction: triggeredNpcInteraction
      ? {
          result: 'npc',
          npc: {
            id: triggeredNpcInteraction.npc.id,
            name: triggeredNpcInteraction.npc.name,
            dialog: Array.isArray(triggeredNpcInteraction.lines)
              ? triggeredNpcInteraction.lines.slice()
              : [],
            sprite: triggeredNpcInteraction.npc.sprite || null,
            service: triggeredNpcInteraction.npc.service || null,
          },
        }
      : null,
  };
}

function subscribe(worldId, instanceId, characterId, send) {
  const state = ensureInstance(worldId, instanceId);
  if (!state.players.has(characterId)) {
    throw new Error('player not in world');
  }
  state.listeners.add(send);
  send({
    type: 'state',
    phase: state.phase,
    players: serializePlayersForClient(state),
    enemies: serializeEnemiesForClient(state),
    npcs: serializeNpcsForClient(state),
  });
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
  spawnMissingEnemies(state);
  broadcastWorldState(state);
}

async function interactWithWorld(worldId, instanceId, characterId) {
  if (!Number.isFinite(characterId)) {
    throw new Error('characterId required');
  }
  const state = ensureInstance(worldId, instanceId);
  ensureParticipant(state, characterId);
  const player = state.players.get(characterId);
  if (!player) {
    throw new Error('player not in world');
  }
  const zoneId = player.zoneId || state.world.defaultZoneId || null;
  if (!zoneId) {
    return { result: 'none' };
  }
  const facing = player.facing || 'down';
  const delta = getFacingDelta(facing);
  const targetX = player.x + delta.dx;
  const targetY = player.y + delta.dy;
  const npc = findNpcAtPosition(state, zoneId, targetX, targetY);
  if (!npc) {
    return { result: 'none' };
  }
  const dialogLines = advanceNpcDialogLines(npc);
  return {
    result: 'npc',
    npc: {
      id: npc.id,
      name: npc.name,
      dialog: dialogLines.slice(),
      sprite: npc.sprite || null,
      service: npc.service || null,
    },
  };
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
  interact: interactWithWorld,
};
