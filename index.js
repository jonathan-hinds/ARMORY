const express = require('express');
const path = require('path');
const { readJson, writeJson } = require('./store/jsonFile');
const Player = require('./domain/Player');
const Character = require('./domain/Character');

function randomAttributes(points) {
  const stats = { strength:0, stamina:0, agility:0, intellect:0, wisdom:0 };
  const keys = Object.keys(stats);
  for (let i = 0; i < points; i++) {
    const k = keys[Math.floor(Math.random()*keys.length)];
    stats[k]++;
  }
  return stats;
}

function randomBasic() {
  return Math.random() < 0.5 ? 'melee' : 'magic';
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'ui')));

app.post('/api/register', async (req, res) => {
  const { name, password } = req.body;
  if (!name || !password) return res.status(400).json({ error: 'name and password required' });
  const players = await readJson('players.json') || [];
  if (players.find(p => p.name === name)) return res.status(400).json({ error: 'name taken' });
  const player = new Player({ id: 'p' + Date.now(), name, password, gold: 0, itemIds: [] });
  players.push(player);
  await writeJson('players.json', players);
  const characters = await readJson('characters.json') || [];
  const char = new Character({
    id: 'c' + Date.now(),
    playerId: player.id,
    name: `${name}'s hero`,
    basicType: randomBasic(),
    attributes: randomAttributes(15),
    rotation: [],
    equipment: { weapon:null, helmet:null, chest:null, legs:null, feet:null, hands:null }
  });
  characters.push(char);
  await writeJson('characters.json', characters);
  res.json({ id: player.id, name: player.name });
});

app.post('/api/login', async (req, res) => {
  const { name, password } = req.body;
  const players = await readJson('players.json') || [];
  const player = players.find(p => p.name === name && p.password === password);
  if (!player) return res.status(401).json({ error: 'invalid credentials' });
  res.json({ id: player.id, name: player.name });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
