const { readJson } = require('../store/jsonFile');
const Ability = require('../domain/Ability');
const Item = require('../domain/Item');

async function loadAbilities() {
  const raw = await readJson('abilities.json');
  const abilities = {};
  (raw || []).forEach(a => abilities[a.id] = new Ability(a));
  return abilities;
}

async function loadItems() {
  const raw = await readJson('equipment.json');
  const items = {};
  (raw || []).forEach(i => items[i.id] = new Item(i));
  return items;
}

module.exports = { loadAbilities, loadItems };
