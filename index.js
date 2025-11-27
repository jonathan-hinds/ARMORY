const express = require("express");
const path = require("path");
const fs = require("fs").promises;
const {
  registerPlayer,
  loginPlayer,
  createCharacter,
  getPlayerCharacters,
} = require("./systems/playerService");
const { getAbilities } = require("./systems/abilityService");
const { updateRotation, levelUp } = require("./systems/characterService");
const { queueMatch, cancelMatchmaking } = require("./systems/matchmaking");
const { getEquipmentCatalog } = require("./systems/equipmentService");
const { purchaseItem } = require("./systems/shopService");
const { getInventory, setEquipment } = require("./systems/inventoryService");
const { getChallengeStatus, runChallengeFight, startChallenge } = require("./systems/challengeGA");
const {
  getJobStatus,
  selectJob,
  startJobWork,
  stopJobWork,
  ensureJobIdle,
  clearJobLog,
  setJobMode,
  addToSalvageQueue,
  removeFromSalvageQueue,
} = require("./systems/jobService");
const {
  getAdventureStatus,
  startAdventure,
  ensureAdventureIdle,
  isAdventureActive,
  streamAdventureCombat,
} = require("./systems/adventureService");
const {
  queueDungeon,
  cancelDungeon,
  readyForDungeon,
  readyForDungeonDecision,
  getDungeonStatus,
} = require("./systems/dungeonService");
const {
  getBattlefieldStatus,
  claimBattlefieldSpot,
  leaveBattlefield,
  ensureBattlefieldIdle,
  startBattlefieldChallenge,
} = require("./systems/battlefieldService");
const {
  getStash,
  depositToStash,
  withdrawFromStash,
  purchaseStashEquipmentSlot,
} = require("./systems/stashService");
const {
  listWorlds,
  joinWorld,
  leaveWorld,
  movePlayer,
  subscribe: subscribeToWorld,
  runEncounter: runWorldEncounter,
  createWorldInstance,
  interact: interactWithWorld,
} = require("./systems/worldService");
const {
  queueForWorld,
  cancelWorldQueue,
  readyWorldMatch,
  getWorldQueueStatus,
} = require("./systems/worldMatchmakingService");
const app = express();
const connectDB = require("./db");
const SpritePalette = require("./models/SpritePalette");
const EnemyTemplate = require("./models/EnemyTemplate");

app.use(express.json());
app.use(express.static(path.join(__dirname, "ui")));
app.use("/assets", express.static(path.join(__dirname, "assets")));

const SPRITE_EXTENSIONS = new Set([".png", ".gif", ".jpg", ".jpeg", ".webp"]);
const MAX_PALETTE_DIMENSION = 20;
const DEFAULT_PALETTE_ROWS = 3;
const DEFAULT_PALETTE_COLUMNS = 3;

async function listSpriteAssets() {
  const baseDir = path.join(__dirname, "assets");
  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const results = await Promise.all(
      entries.map(async entry => {
        const resolved = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          return walk(resolved);
        }
        const ext = path.extname(entry.name).toLowerCase();
        if (!SPRITE_EXTENSIONS.has(ext)) {
          return [];
        }
        const relativePath = path.relative(baseDir, resolved).split(path.sep).join("/");
        return [
          {
            id: relativePath,
            name: entry.name,
            url: `/assets/${relativePath}`,
          },
        ];
      })
    );
    return results.flat();
  }

  try {
    const assets = await walk(baseDir);
    assets.sort((a, b) => a.id.localeCompare(b.id));
    return assets;
  } catch (err) {
    if (err.code === "ENOENT") {
      return [];
    }
    throw err;
  }
}

function sanitizePaletteTiles(tiles) {
  if (!Array.isArray(tiles)) {
    return [];
  }
  const byId = new Map();
  tiles.forEach(tile => {
    if (!tile || typeof tile !== "object") {
      return;
    }
    const tileId = String(tile.tileId || tile.id || "").trim();
    const sprite = String(tile.sprite || tile.asset || "").trim();
    if (!tileId || !sprite) {
      return;
    }
    const fill = typeof tile.fill === "string" && tile.fill.trim() ? tile.fill.trim() : "#ffffff";
    const walkable = Boolean(tile.walkable);
    const rowValue = Number(tile.row);
    const columnValue = Number(tile.column);
    const row = Number.isInteger(rowValue)
      ? Math.max(0, Math.min(MAX_PALETTE_DIMENSION - 1, rowValue))
      : 0;
    const column = Number.isInteger(columnValue)
      ? Math.max(0, Math.min(MAX_PALETTE_DIMENSION - 1, columnValue))
      : 0;
    byId.set(tileId, { tileId, sprite, fill, walkable, row, column });
  });
  return Array.from(byId.values());
}

function sanitizePaletteDimension(value, fallback) {
  const numeric = Number(value);
  if (Number.isInteger(numeric) && numeric > 0) {
    return Math.max(1, Math.min(MAX_PALETTE_DIMENSION, numeric));
  }
  return fallback;
}

function sanitizeEnemyTemplatePayload(payload) {
  const templateId = payload?.templateId || payload?.id || "";
  const id = String(templateId).trim();
  if (!id) {
    return null;
  }
  const name = String(payload.name || id).trim();
  const basicType = String(payload.basicType || "melee").trim() || "melee";
  const level = Number.parseInt(payload.level, 10) || 1;
  const rotation = Array.isArray(payload.rotation)
    ? payload.rotation
        .map(value => {
          if (value == null) return null;
          const numeric = Number(value);
          if (Number.isFinite(numeric)) {
            return numeric;
          }
          return String(value);
        })
        .filter(value => value !== null && value !== "")
    : [];
  const equipment = payload.equipment && typeof payload.equipment === "object" ? payload.equipment : {};
  const spriteRaw = typeof payload.sprite === "string" ? payload.sprite.trim() : "";
  const sprite = spriteRaw ? spriteRaw : null;
  const attributes = payload.attributes && typeof payload.attributes === "object" ? payload.attributes : {};
  return {
    templateId: id,
    name,
    basicType,
    level,
    rotation,
    equipment,
    attributes: {
      strength: Number.parseInt(attributes.strength ?? attributes.STR ?? attributes.str ?? 0, 10) || 0,
      stamina: Number.parseInt(attributes.stamina ?? attributes.STA ?? attributes.sta ?? 0, 10) || 0,
      agility: Number.parseInt(attributes.agility ?? attributes.AGI ?? attributes.agi ?? 0, 10) || 0,
      intellect: Number.parseInt(attributes.intellect ?? attributes.INT ?? attributes.int ?? 0, 10) || 0,
      wisdom: Number.parseInt(attributes.wisdom ?? attributes.WIS ?? attributes.wis ?? 0, 10) || 0,
    },
    xpPct: Number(payload.xpPct ?? payload.xp ?? 0) || 0,
    gold: Number.parseInt(payload.gold ?? 0, 10) || 0,
    spawnChance: Number(payload.spawnChance ?? 0) || 0,
    sprite,
  };
}

// Render provides the port as process.env.PORT
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "ui", "index.html"));
});

app.get("/dev/world-builder", (req, res) => {
  res.sendFile(path.join(__dirname, "ui", "world-builder.html"));
});

app.get("/dev/assets/sprites", async (req, res) => {
  try {
    const assets = await listSpriteAssets();
    res.json(assets);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "failed to list sprite assets" });
  }
});

app.get("/dev/palettes", async (req, res) => {
  try {
    const palettes = await SpritePalette.find().sort({ name: 1 }).lean();
    res.json(palettes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "failed to load palettes" });
  }
});

app.post("/dev/palettes", async (req, res) => {
  const { id, name, description, tiles, rows, columns } = req.body || {};
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: "palette name required" });
  }
  const sanitizedTiles = sanitizePaletteTiles(tiles);
  const sanitizedRows = sanitizePaletteDimension(rows, DEFAULT_PALETTE_ROWS);
  const sanitizedColumns = sanitizePaletteDimension(columns, DEFAULT_PALETTE_COLUMNS);
  const updatePayload = {
    name: String(name).trim(),
    description: description || "",
    rows: sanitizedRows,
    columns: sanitizedColumns,
    tiles: sanitizedTiles,
  };
  try {
    let palette;
    if (id) {
      palette = await SpritePalette.findByIdAndUpdate(
        id,
        updatePayload,
        { new: true, runValidators: true }
      ).lean();
    } else {
      palette = await SpritePalette.findOneAndUpdate(
        { name: String(name).trim() },
        updatePayload,
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
          runValidators: true,
        }
      ).lean();
    }
    res.json(palette);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "failed to save palette" });
  }
});

app.delete("/dev/palettes/:id", async (req, res) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ error: "palette id required" });
  }
  try {
    await SpritePalette.findByIdAndDelete(id);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "failed to delete palette" });
  }
});

app.get("/dev/enemy-templates", async (req, res) => {
  try {
    const templates = await EnemyTemplate.find().sort({ templateId: 1 }).lean();
    res.json(templates);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "failed to load enemy templates" });
  }
});

app.post("/dev/enemy-templates", async (req, res) => {
  const payload = sanitizeEnemyTemplatePayload(req.body || {});
  if (!payload) {
    return res.status(400).json({ error: "templateId required" });
  }
  try {
    const template = await EnemyTemplate.findOneAndUpdate(
      { templateId: payload.templateId },
      payload,
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
        runValidators: true,
      }
    ).lean();
    res.json(template);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "failed to save enemy template" });
  }
});

app.delete("/dev/enemy-templates/:templateId", async (req, res) => {
  const { templateId } = req.params;
  if (!templateId) {
    return res.status(400).json({ error: "templateId required" });
  }
  try {
    await EnemyTemplate.findOneAndDelete({ templateId });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "failed to delete enemy template" });
  }
});

app.post("/register", async (req, res) => {
  const name = req.body.name && req.body.name.trim();
  if (!name) {
    return res.status(400).json({ error: "name required" });
  }
  try {
    const result = await registerPlayer(name);
    res.json(result);
  } catch (err) {
    if (err.message === "name taken") {
      res.status(409).json({ error: "name taken" });
    } else {
      console.error(err);
      res.status(500).json({ error: "registration failed" });
    }
  }
});

app.post("/login", async (req, res) => {
  const name = req.body.name && req.body.name.trim();
  if (!name) {
    return res.status(400).json({ error: "name required" });
  }
  try {
    const result = await loginPlayer(name);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(404).json({ error: "login failed" });
  }
});

app.get("/players/:playerId/characters", async (req, res) => {
  const playerId = parseInt(req.params.playerId, 10);
  try {
    const characters = await getPlayerCharacters(playerId);
    res.json(characters);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "failed to load characters" });
  }
});

app.post("/players/:playerId/characters", async (req, res) => {
  const playerId = parseInt(req.params.playerId, 10);
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: "name required" });
  }
  try {
    const character = await createCharacter(playerId, name);
    res.json(character);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "character creation failed" });
  }
});

app.get("/equipment", async (req, res) => {
  try {
    const catalog = await getEquipmentCatalog();
    res.json(catalog);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "failed to load equipment" });
  }
});

app.get("/abilities", async (req, res) => {
  try {
    const abilities = await getAbilities();
    res.json(abilities);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "failed to load abilities" });
  }
});

app.get("/worlds", async (req, res) => {
  try {
    const worlds = await listWorlds();
    res.json({ worlds });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "failed to load worlds" });
  }
});

app.post("/worlds/:worldId/join", async (req, res) => {
  const worldId = req.params.worldId;
  const { characterId, instanceId } = req.body || {};
  if (!characterId) {
    return res.status(400).json({ error: "characterId required" });
  }
  try {
    let targetInstance = instanceId;
    if (!targetInstance) {
      const instance = await createWorldInstance(worldId, [characterId]);
      targetInstance = instance.instanceId;
    }
    const payload = await joinWorld(worldId, targetInstance, characterId);
    res.json(payload);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || "failed to join world" });
  }
});

app.post("/worlds/:worldId/move", async (req, res) => {
  const worldId = req.params.worldId;
  const { characterId, instanceId, direction } = req.body || {};
  if (!characterId || !instanceId) {
    return res.status(400).json({ error: "characterId and instanceId required" });
  }
  try {
    const payload = await movePlayer(worldId, instanceId, characterId, direction);
    res.json(payload);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || "failed to move" });
  }
});

app.post("/worlds/:worldId/interact", async (req, res) => {
  const worldId = req.params.worldId;
  const { characterId, instanceId } = req.body || {};
  if (!characterId || !instanceId) {
    return res.status(400).json({ error: "characterId and instanceId required" });
  }
  try {
    const numericId = Number(characterId);
    if (!Number.isInteger(numericId)) {
      return res.status(400).json({ error: "characterId must be an integer" });
    }
    const payload = await interactWithWorld(worldId, instanceId, numericId);
    res.json(payload || { result: "none" });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || "failed to interact" });
  }
});

app.post("/worlds/:worldId/leave", async (req, res) => {
  const worldId = req.params.worldId;
  const { characterId, instanceId } = req.body || {};
  if (!characterId || !instanceId) {
    return res.status(400).json({ error: "characterId and instanceId required" });
  }
  try {
    const payload = await leaveWorld(worldId, instanceId, characterId);
    res.json(payload);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || "failed to leave world" });
  }
});

app.get("/worlds/:worldId/stream", (req, res) => {
  const worldId = req.params.worldId;
  const characterId = parseInt(req.query.characterId, 10);
  const instanceId = req.query && req.query.instanceId;
  if (!characterId || !instanceId) {
    return res.status(400).end();
  }
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  if (res.flushHeaders) res.flushHeaders();
  const send = data => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };
  let unsubscribe = null;
  try {
    unsubscribe = subscribeToWorld(worldId, instanceId, characterId, send);
  } catch (err) {
    console.error(err);
    send({ type: "error", message: err.message || "subscription failed" });
    res.end();
    return;
  }
  req.on("close", () => {
    if (unsubscribe) {
      try {
        unsubscribe();
      } catch (err) {
        console.error("world unsubscribe failed", err);
      }
    }
  });
});

app.get("/worlds/:worldId/encounter", (req, res) => {
  const worldId = req.params.worldId;
  const characterId = parseInt(req.query.characterId, 10);
  const token = req.query && req.query.token;
  const instanceId = req.query && req.query.instanceId;
  if (!characterId || !token || !instanceId) {
    return res.status(400).end();
  }
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  if (res.flushHeaders) res.flushHeaders();
  const send = data => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };
  let unsubscribe = null;
  try {
    unsubscribe = runWorldEncounter(worldId, instanceId, characterId, token, send);
  } catch (err) {
    console.error(err);
    send({ type: "error", message: err.message || "encounter failed" });
    res.end();
    return;
  }
  req.on("close", () => {
    if (unsubscribe) {
      try {
        unsubscribe();
      } catch (err) {
        console.error("world encounter unsubscribe failed", err);
      }
    }
  });
});

app.get("/worlds/:worldId/queue", async (req, res) => {
  const worldId = req.params.worldId;
  const characterId = parseInt(req.query.characterId, 10);
  const size = parseInt(req.query.size, 10);
  if (!characterId) {
    return res.status(400).end();
  }
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  if (res.flushHeaders) res.flushHeaders();
  const send = data => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };
  try {
    await queueForWorld(worldId, size, characterId, send);
  } catch (err) {
    console.error(err);
    send({ type: "error", message: err.message || "failed to join world queue" });
    res.end();
    return;
  }
  req.on("close", () => {
    try {
      cancelWorldQueue(characterId);
    } catch (err) {
      console.error("world queue cancel failed", err);
    }
  });
});

app.get("/worlds/:worldId/status", (req, res) => {
  const characterId = parseInt(req.query.characterId, 10);
  if (!characterId) {
    return res.status(400).json({ error: "characterId required" });
  }
  try {
    const status = getWorldQueueStatus(characterId);
    res.json({ status });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "failed to load world queue status" });
  }
});

app.post("/worlds/:worldId/cancel", (req, res) => {
  const { characterId } = req.body || {};
  if (!characterId) {
    return res.status(400).json({ error: "characterId required" });
  }
  try {
    const cancelled = cancelWorldQueue(characterId);
    res.json({ cancelled });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "failed to cancel world queue" });
  }
});

app.post("/worlds/:worldId/ready", async (req, res) => {
  const { characterId, matchId } = req.body || {};
  if (!characterId || !matchId) {
    return res.status(400).json({ error: "characterId and matchId required" });
  }
  try {
    const payload = await readyWorldMatch(matchId, characterId);
    res.json(payload);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || "failed to ready up" });
  }
});

app.put("/characters/:characterId/rotation", async (req, res) => {
  const characterId = parseInt(req.params.characterId, 10);
  const { rotation, basicType } = req.body || {};
  try {
    const character = await updateRotation(characterId, rotation, basicType);
    res.json(character);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
});

app.post("/characters/:characterId/levelup", async (req, res) => {
  const characterId = parseInt(req.params.characterId, 10);
  const { allocations } = req.body || {};
  try {
    await ensureBattlefieldIdle(characterId);
    const character = await levelUp(characterId, allocations || {});
    res.json(character);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
});

app.get("/players/:playerId/inventory", async (req, res) => {
  const playerId = parseInt(req.params.playerId, 10);
  const characterId = parseInt(req.query.characterId, 10);
  if (!playerId || !characterId) {
    return res.status(400).json({ error: "playerId and characterId required" });
  }
  try {
    const data = await getInventory(playerId, characterId);
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
});

app.get("/players/:playerId/stash", async (req, res) => {
  const playerId = parseInt(req.params.playerId, 10);
  const characterId = parseInt(req.query.characterId, 10);
  if (!playerId || !characterId) {
    return res.status(400).json({ error: "playerId and characterId required" });
  }
  try {
    const stash = await getStash(playerId, characterId);
    res.json(stash);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || "failed to load stash" });
  }
});

app.post("/players/:playerId/stash/deposit", async (req, res) => {
  const playerId = parseInt(req.params.playerId, 10);
  const characterId = parseInt(req.body.characterId, 10);
  if (!playerId || !characterId) {
    return res.status(400).json({ error: "playerId and characterId required" });
  }
  try {
    const result = await depositToStash(playerId, characterId, req.body || {});
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || "failed to deposit to stash" });
  }
});

app.post("/players/:playerId/stash/withdraw", async (req, res) => {
  const playerId = parseInt(req.params.playerId, 10);
  const characterId = parseInt(req.body.characterId, 10);
  if (!playerId || !characterId) {
    return res.status(400).json({ error: "playerId and characterId required" });
  }
  try {
    const result = await withdrawFromStash(playerId, characterId, req.body || {});
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || "failed to withdraw from stash" });
  }
});

app.post("/players/:playerId/stash/slots", async (req, res) => {
  const playerId = parseInt(req.params.playerId, 10);
  const characterId = parseInt(req.body.characterId, 10);
  if (!playerId || !characterId) {
    return res.status(400).json({ error: "playerId and characterId required" });
  }
  try {
    const result = await purchaseStashEquipmentSlot(playerId, characterId);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || "failed to unlock slot" });
  }
});

app.get("/characters/:characterId/job", async (req, res) => {
  const characterId = parseInt(req.params.characterId, 10);
  const playerId = parseInt(req.query.playerId, 10);
  if (!playerId || !characterId) {
    return res.status(400).json({ error: "playerId and characterId required" });
  }
  try {
    const status = await getJobStatus(playerId, characterId);
    res.json(status);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || "failed to load job status" });
  }
});

app.post("/shop/purchase", async (req, res) => {
  const { playerId, itemId, characterId } = req.body || {};
  const pid = parseInt(playerId, 10);
  const cid = parseInt(characterId, 10);
  if (!pid || !cid || !itemId) {
    return res.status(400).json({ error: "playerId, characterId and itemId required" });
  }
  try {
    await purchaseItem(pid, cid, itemId);
    const data = await getInventory(pid, cid);
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
});

app.post("/characters/:characterId/job/select", async (req, res) => {
  const characterId = parseInt(req.params.characterId, 10);
  const { playerId, jobId } = req.body || {};
  const pid = parseInt(playerId, 10);
  if (!pid || !characterId || !jobId) {
    return res.status(400).json({ error: "playerId, characterId and jobId required" });
  }
  try {
    const status = await selectJob(pid, characterId, jobId);
    res.json(status);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || "failed to select job" });
  }
});

app.post("/characters/:characterId/job/start", async (req, res) => {
  const characterId = parseInt(req.params.characterId, 10);
  const { playerId } = req.body || {};
  const pid = parseInt(playerId, 10);
  if (!pid || !characterId) {
    return res.status(400).json({ error: "playerId and characterId required" });
  }
  try {
    await ensureBattlefieldIdle(characterId);
    await ensureAdventureIdle(characterId);
    const status = await startJobWork(pid, characterId);
    res.json(status);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || "failed to start job" });
  }
});

app.post("/characters/:characterId/job/stop", async (req, res) => {
  const characterId = parseInt(req.params.characterId, 10);
  const { playerId } = req.body || {};
  const pid = parseInt(playerId, 10);
  if (!pid || !characterId) {
    return res.status(400).json({ error: "playerId and characterId required" });
  }
  try {
    const status = await stopJobWork(pid, characterId);
    res.json(status);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || "failed to stop job" });
  }
});

app.post("/characters/:characterId/job/mode", async (req, res) => {
  const characterId = parseInt(req.params.characterId, 10);
  const { playerId, mode } = req.body || {};
  const pid = parseInt(playerId, 10);
  if (!pid || !characterId || !mode) {
    return res.status(400).json({ error: "playerId, characterId and mode required" });
  }
  try {
    const status = await setJobMode(pid, characterId, mode);
    res.json(status);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || "failed to update job mode" });
  }
});

app.post("/characters/:characterId/job/salvage/add", async (req, res) => {
  const characterId = parseInt(req.params.characterId, 10);
  const { playerId, itemId, count } = req.body || {};
  const pid = parseInt(playerId, 10);
  if (!pid || !characterId || !itemId) {
    return res.status(400).json({ error: "playerId, characterId and itemId required" });
  }
  const parsedCount = parseInt(count, 10);
  const normalizedCount = Number.isFinite(parsedCount) && parsedCount > 0 ? parsedCount : 1;
  try {
    const status = await addToSalvageQueue(pid, characterId, itemId, normalizedCount);
    res.json(status);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || "failed to add item to salvage queue" });
  }
});

app.post("/characters/:characterId/job/salvage/remove", async (req, res) => {
  const characterId = parseInt(req.params.characterId, 10);
  const { playerId, itemId } = req.body || {};
  const pid = parseInt(playerId, 10);
  if (!pid || !characterId || !itemId) {
    return res.status(400).json({ error: "playerId, characterId and itemId required" });
  }
  try {
    const status = await removeFromSalvageQueue(pid, characterId, itemId);
    res.json(status);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || "failed to remove item from salvage queue" });
  }
});

app.post("/characters/:characterId/job/log/clear", async (req, res) => {
  const characterId = parseInt(req.params.characterId, 10);
  const { playerId } = req.body || {};
  const pid = parseInt(playerId, 10);
  if (!pid || !characterId) {
    return res.status(400).json({ error: "playerId and characterId required" });
  }
  try {
    const status = await clearJobLog(pid, characterId);
    res.json(status);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || "failed to clear job log" });
  }
});

app.put("/characters/:characterId/equipment", async (req, res) => {
  const characterId = parseInt(req.params.characterId, 10);
  const { playerId, slot, itemId = null } = req.body || {};
  const pid = parseInt(playerId, 10);
  if (!characterId || !pid || !slot) {
    return res.status(400).json({ error: "playerId, characterId, and slot required" });
  }
  try {
    const data = await setEquipment(pid, characterId, slot, itemId);
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
});

app.get("/matchmaking/queue", async (req, res) => {
  const characterId = parseInt(req.query.characterId, 10);
  if (!characterId) {
    return res.status(400).end();
  }
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  if (res.flushHeaders) res.flushHeaders();
  const send = data => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };
  try {
    await ensureBattlefieldIdle(characterId);
    await ensureAdventureIdle(characterId);
    await ensureJobIdle(characterId);
  } catch (err) {
    send({ type: "error", message: err.message || "character unavailable" });
    res.end();
    return;
  }
  let handle;
  try {
    handle = await queueMatch(characterId, send);
  } catch (err) {
    console.error(err);
    send({ type: "error", message: err.message });
    res.end();
    return;
  }

  req.on("close", () => {
    if (handle && typeof handle.cancel === "function") {
      handle.cancel("connection closed");
    } else {
      cancelMatchmaking(characterId, "connection closed");
    }
  });

  try {
    await handle.promise;
  } catch (err) {
    console.error(err);
  }
  res.end();
});

app.post("/matchmaking/cancel", (req, res) => {
  const characterId = parseInt(req.body && req.body.characterId, 10);
  if (!characterId) {
    return res.status(400).json({ error: "characterId required" });
  }
  const reason = (req.body && req.body.reason) || "Matchmaking cancelled";
  const cancelled = cancelMatchmaking(characterId, reason);
  if (!cancelled) {
    return res.status(404).json({ error: "character not queued" });
  }
  res.json({ cancelled: true });
});

app.get("/dungeon/queue", async (req, res) => {
  const characterId = parseInt(req.query.characterId, 10);
  const size = req.query.size != null ? parseInt(req.query.size, 10) : 2;
  if (!characterId) {
    return res.status(400).end();
  }
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  if (res.flushHeaders) res.flushHeaders();
  const send = data => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };
  try {
    await ensureBattlefieldIdle(characterId);
    await ensureAdventureIdle(characterId);
    await ensureJobIdle(characterId);
  } catch (err) {
    send({ type: "error", message: err.message || "character unavailable" });
    res.end();
    return;
  }
  let handle;
  try {
    handle = await queueDungeon(characterId, size, send);
  } catch (err) {
    send({ type: "error", message: err.message || "failed to join dungeon" });
    res.end();
    return;
  }
  req.on("close", () => {
    if (handle && typeof handle.cancel === "function") {
      handle.cancel("connection closed");
    } else {
      cancelDungeon(characterId, "connection closed");
    }
  });
  try {
    await handle.promise;
  } catch (err) {
    send({ type: "error", message: err.message || "dungeon failed" });
  }
  res.end();
});

app.get("/dungeon/status", (req, res) => {
  const characterId = parseInt(req.query.characterId, 10);
  if (!characterId) {
    return res.status(400).json({ error: "characterId required" });
  }
  try {
    const status = getDungeonStatus(characterId);
    res.json(status);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "failed to load dungeon status" });
  }
});

app.post("/dungeon/cancel", (req, res) => {
  const characterId = parseInt(req.body && req.body.characterId, 10);
  if (!characterId) {
    return res.status(400).json({ error: "characterId required" });
  }
  const reason = (req.body && req.body.reason) || "Dungeon cancelled";
  const cancelled = cancelDungeon(characterId, reason);
  if (!cancelled) {
    return res.status(404).json({ error: "character not queued" });
  }
  res.json({ cancelled: true });
});

app.post("/dungeon/ready", async (req, res) => {
  const matchId = req.body && req.body.matchId;
  const characterId = parseInt((req.body && req.body.characterId) || 0, 10);
  if (!matchId || !characterId) {
    return res.status(400).json({ error: "matchId and characterId required" });
  }
  try {
    const status = await readyForDungeon(matchId, characterId);
    res.json(status);
  } catch (err) {
    res.status(400).json({ error: err.message || "failed to ready" });
  }
});

app.post("/dungeon/decision", async (req, res) => {
  const matchId = req.body && req.body.matchId;
  const characterId = parseInt((req.body && req.body.characterId) || 0, 10);
  if (!matchId || !characterId) {
    return res.status(400).json({ error: "matchId and characterId required" });
  }
  try {
    const status = await readyForDungeonDecision(matchId, characterId);
    res.json(status);
  } catch (err) {
    res.status(400).json({ error: err.message || "failed to continue" });
  }
});

app.get("/challenge/status", async (req, res) => {
  const characterId = parseInt(req.query.characterId, 10);
  if (!characterId) {
    return res.status(400).json({ error: "characterId required" });
  }
  try {
    if (await isAdventureActive(characterId)) {
      return res.status(409).json({ error: "character is currently adventuring" });
    }
    const status = await getChallengeStatus(characterId);
    res.json(status);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || "failed to load challenge" });
  }
});

app.post("/challenge/start", async (req, res) => {
  const characterId = parseInt((req.body && req.body.characterId) || req.query.characterId, 10);
  if (!characterId) {
    return res.status(400).json({ error: "characterId required" });
  }
  const force = !!(req.body && req.body.force);
  try {
    await ensureBattlefieldIdle(characterId);
    await ensureAdventureIdle(characterId);
    await ensureJobIdle(characterId);
    const status = await startChallenge(characterId, { force });
    res.json(status);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || "failed to start challenge" });
  }
});

app.get("/challenge/fight", async (req, res) => {
  const characterId = parseInt(req.query.characterId, 10);
  if (!characterId) {
    return res.status(400).end();
  }
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  if (res.flushHeaders) res.flushHeaders();
  const send = data => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };
  try {
    await ensureBattlefieldIdle(characterId);
    await ensureAdventureIdle(characterId);
    await ensureJobIdle(characterId);
  } catch (err) {
    send({ type: "error", message: err.message || "character unavailable" });
    res.end();
    return;
  }
  try {
    await runChallengeFight(characterId, send);
  } catch (err) {
    console.error(err);
    send({ type: "error", message: err.message || "challenge failed" });
  }
  res.end();
});

app.get("/battlefield/status", async (req, res) => {
  const characterId = req.query.characterId != null ? parseInt(req.query.characterId, 10) : null;
  try {
    const status = await getBattlefieldStatus(characterId);
    res.json(status);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "failed to load battlefield" });
  }
});

app.post("/battlefield/claim", async (req, res) => {
  const { characterId, spotId } = req.body || {};
  const cid = parseInt(characterId, 10);
  const sid = parseInt(spotId, 10);
  if (!Number.isFinite(cid) || !Number.isFinite(sid)) {
    return res.status(400).json({ error: "characterId and spotId required" });
  }
  try {
    await ensureBattlefieldIdle(cid);
    await ensureAdventureIdle(cid);
    await ensureJobIdle(cid);
    const result = await claimBattlefieldSpot(cid, sid);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || "failed to claim battlefield spot" });
  }
});

app.post("/battlefield/leave", async (req, res) => {
  const { characterId } = req.body || {};
  const cid = parseInt(characterId, 10);
  if (!Number.isFinite(cid)) {
    return res.status(400).json({ error: "characterId required" });
  }
  try {
    const status = await leaveBattlefield(cid);
    res.json(status);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || "failed to leave battlefield" });
  }
});

app.get("/battlefield/challenge", async (req, res) => {
  const characterId = parseInt(req.query.characterId, 10);
  const spotId = parseInt(req.query.spotId, 10);
  if (!Number.isFinite(characterId) || !Number.isFinite(spotId)) {
    return res.status(400).end();
  }
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  if (res.flushHeaders) res.flushHeaders();
  const send = data => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };
  try {
    await ensureBattlefieldIdle(characterId);
    await ensureAdventureIdle(characterId);
    await ensureJobIdle(characterId);
  } catch (err) {
    send({ type: "error", message: err.message || "character unavailable" });
    res.end();
    return;
  }
  try {
    await startBattlefieldChallenge(characterId, spotId, send);
  } catch (err) {
    console.error(err);
    send({ type: "error", message: err.message || "battle failed" });
  }
  res.end();
});

app.get("/adventure/status", async (req, res) => {
  const characterId = parseInt(req.query.characterId, 10);
  if (!characterId) {
    return res.status(400).json({ error: "characterId required" });
  }
  try {
    const status = await getAdventureStatus(characterId);
    res.json(status);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || "failed to load adventure" });
  }
});

app.post("/adventure/start", async (req, res) => {
  const characterId = parseInt((req.body && req.body.characterId) || req.query.characterId, 10);
  if (!characterId) {
    return res.status(400).json({ error: "characterId required" });
  }
  try {
    const days = req.body && req.body.days != null ? parseInt(req.body.days, 10) : undefined;
    await ensureBattlefieldIdle(characterId);
    await ensureJobIdle(characterId);
    const status = await startAdventure(characterId, { days });
    res.json(status);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || "failed to start adventure" });
  }
});

app.get("/adventure/replay", async (req, res) => {
  const characterId = parseInt(req.query.characterId, 10);
  const eventId = req.query.eventId;
  if (!characterId || !eventId) {
    return res.status(400).json({ error: "characterId and eventId required" });
  }
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  if (res.flushHeaders) res.flushHeaders();
  const send = data => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };
  try {
    await streamAdventureCombat(characterId, eventId, send);
  } catch (err) {
    console.error(err);
    send({ type: "error", message: err.message || "failed to load replay" });
  }
  res.end();
});

async function start() {
  try {
    await connectDB();
    console.log("Connected to MongoDB");
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error("Failed to connect to MongoDB", err);
    process.exit(1);
  }
}

start();
