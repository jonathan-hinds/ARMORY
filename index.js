const express = require("express");
const path = require("path");
const { registerPlayer } = require("./systems/playerRegistration");
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, "ui")));

// Render provides the port as process.env.PORT
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "ui", "index.html"));
});

app.post("/register", async (req, res) => {
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: "name required" });
  }
  try {
    const result = await registerPlayer(name);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "registration failed" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
