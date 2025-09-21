const express = require("express");
const path = require("path");
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
  setBlacksmithTask,
  addBlacksmithQueueItem,
  removeBlacksmithQueueItem,
} = require("./systems/jobService");
const {
  getAdventureStatus,
  startAdventure,
  ensureAdventureIdle,
  isAdventureActive,
  streamAdventureCombat,
} = require("./systems/adventureService");
const { queueDungeon, cancelDungeon, readyForDungeon } = require("./systems/dungeonService");
const app = express();
const connectDB = require("./db");

app.use(express.json());
app.use(express.static(path.join(__dirname, "ui")));

// Render provides the port as process.env.PORT
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "ui", "index.html"));
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
  const { playerId, modeId: rawModeId, mode: rawMode } = req.body || {};
  const pid = parseInt(playerId, 10);
  if (!pid || !characterId) {
    return res.status(400).json({ error: "playerId and characterId required" });
  }
  try {
    await ensureAdventureIdle(characterId);
    const modeId = typeof rawModeId === "string" && rawModeId.trim()
      ? rawModeId.trim().toLowerCase()
      : typeof rawMode === "string" && rawMode.trim()
        ? rawMode.trim().toLowerCase()
        : null;
    const status = await startJobWork(pid, characterId, { modeId });
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

app.post("/characters/:characterId/job/blacksmith/task", async (req, res) => {
  const characterId = parseInt(req.params.characterId, 10);
  const { playerId, task, mode } = req.body || {};
  const pid = parseInt(playerId, 10);
  const selection = typeof mode === "string" && mode.trim()
    ? mode
    : typeof task === "string" && task.trim()
      ? task
      : "";
  if (!pid || !characterId || !selection) {
    return res.status(400).json({ error: "playerId, characterId and mode required" });
  }
  try {
    const status = await setBlacksmithTask(pid, characterId, selection);
    res.json(status);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || "failed to update task" });
  }
});

app.post("/characters/:characterId/job/blacksmith/salvage/add", async (req, res) => {
  const characterId = parseInt(req.params.characterId, 10);
  const { playerId, itemId } = req.body || {};
  const pid = parseInt(playerId, 10);
  if (!pid || !characterId || !itemId) {
    return res.status(400).json({ error: "playerId, characterId and itemId required" });
  }
  try {
    const status = await addBlacksmithQueueItem(pid, characterId, itemId);
    res.json(status);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || "failed to add item to queue" });
  }
});

app.post("/characters/:characterId/job/blacksmith/salvage/remove", async (req, res) => {
  const characterId = parseInt(req.params.characterId, 10);
  const { playerId, itemId } = req.body || {};
  const pid = parseInt(playerId, 10);
  if (!pid || !characterId || !itemId) {
    return res.status(400).json({ error: "playerId, characterId and itemId required" });
  }
  try {
    const status = await removeBlacksmithQueueItem(pid, characterId, itemId);
    res.json(status);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || "failed to remove item from queue" });
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
