const path = require('path');
const { readJSON } = require('../store/jsonStore');
const Ability = require('../domain/ability');
const Effect = require('../domain/effect');

const DATA_DIR = path.join(__dirname, '..', 'data');
const ABILITIES_FILE = path.join(DATA_DIR, 'abilities.json');

let abilityCache = null;

async function getAbilities() {
  if (!abilityCache) {
    const data = await readJSON(ABILITIES_FILE);
    abilityCache = data.map(a => new Ability({
      ...a,
      effects: a.effects.map(e => new Effect(e)),
    }));
  }
  return abilityCache;
}

async function getAbilityById(id) {
  const abilities = await getAbilities();
  return abilities.find(a => a.id === id);
}

module.exports = { getAbilities, getAbilityById };
