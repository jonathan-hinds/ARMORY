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
const { queueMatch } = require("./systems/matchmaking");
const { getEquipmentCatalog } = require("./systems/equipmentService");
const { purchaseItem } = require("./systems/shopService");
const { getInventory, setEquipment } = require("./systems/inventoryService");
const { getChallengeStatus, runChallengeFight, startChallenge } = require("./systems/challengeGA");
const { getJobStatus, selectJob } = require("./systems/jobService");
const {
  getAdventureStatus,
  startAdventure,
  ensureAdventureIdle,
  isAdventureActive,
  streamAdventureCombat,
} = require("./systems/adventureService");
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
  } catch (err) {
    send({ type: "error", message: err.message || "character unavailable" });
    res.end();
    return;
  }
  try {
    await queueMatch(characterId, send);
  } catch (err) {
    console.error(err);
    send({ type: "error", message: err.message });
  }
  res.end();
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
