const path = require('path');
const { readJSON } = require('../store/jsonStore');
const Ability = require('../domain/ability');
const Effect = require('../domain/effect');

const DATA_DIR = path.join(__dirname, '..', 'data');
const ABILITIES_FILE = path.join(DATA_DIR, 'abilities.json');

const BASIC_ATTACK_BLUEPRINT = {
  id: 0,
  name: 'Basic Attack',
  school: 'basic',
  cooldown: 0,
  costs: [],
  scaling: [],
  effects: [],
  isBasicAttack: true,
};

let abilityCache = null;

async function getAbilities() {
  if (!abilityCache) {
    const data = await readJSON(ABILITIES_FILE);
    const abilityData = Array.isArray(data) ? data.slice() : [];
    abilityData.unshift(BASIC_ATTACK_BLUEPRINT);
    abilityCache = abilityData.map(entry => {
      const effects = Array.isArray(entry.effects) ? entry.effects.map(e => new Effect(e)) : [];
      return new Ability({
        ...entry,
        effects,
      });
    });
  }
  return abilityCache;
}

async function getAbilityById(id) {
  const abilities = await getAbilities();
  return abilities.find(a => a.id === id);
}

module.exports = { getAbilities, getAbilityById };
