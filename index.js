const express = require("express");
const path = require("path");
const {
  registerPlayer,
  loginPlayer,
  createCharacter,
  getPlayerCharacters,
} = require("./systems/playerService");
const { getAbilities } = require("./systems/abilityService");
const { updateRotation } = require("./systems/characterService");
const { queueMatch } = require("./systems/matchmaking");
const app = express();

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
  const { rotation } = req.body;
  try {
    const character = await updateRotation(characterId, rotation);
    res.json(character);
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
    await queueMatch(characterId, send);
  } catch (err) {
    console.error(err);
    send({ type: "error", message: err.message });
  }
  res.end();
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
