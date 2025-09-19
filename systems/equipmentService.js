const path = require('path');
const { readJSON } = require('../store/jsonStore');
const Item = require('../domain/item');
const { getMaterialCatalog } = require('./materialService');

const DATA_DIR = path.join(__dirname, '..', 'data');
const EQUIPMENT_FILE = path.join(DATA_DIR, 'equipment.json');

let cache = null;

function cloneEffect(entry) {
  if (!entry) return null;
  const cloned = { ...entry };
  if (entry.effect) {
    cloned.effect = JSON.parse(JSON.stringify(entry.effect));
  }
  if (entry.conditions) {
    cloned.conditions = { ...entry.conditions };
  }
  return cloned;
}

function createItem(entry) {
  const item = new Item(entry);
  item.attributeBonuses = Object.freeze({ ...(item.attributeBonuses || {}) });
  item.resourceBonuses = Object.freeze({ ...(item.resourceBonuses || {}) });
  item.resistances = Object.freeze({ ...(item.resistances || {}) });
  item.scaling = Object.freeze({ ...(item.scaling || {}) });
  item.chanceBonuses = Object.freeze({ ...(item.chanceBonuses || {}) });
  item.onHitEffects = Object.freeze((item.onHitEffects || []).map(cloneEffect).filter(Boolean));
  item.useTrigger = item.useTrigger ? Object.freeze({ ...item.useTrigger }) : null;
  item.useEffect = item.useEffect ? Object.freeze(cloneEffect(item.useEffect) || item.useEffect) : null;
  return Object.freeze(item);
}

async function loadCatalog() {
  if (!cache) {
    const raw = await readJSON(EQUIPMENT_FILE);
    const weapons = Array.isArray(raw.weapons) ? raw.weapons.map(createItem) : [];
    const armor = Array.isArray(raw.armor) ? raw.armor.map(createItem) : [];
    const useables = Array.isArray(raw.useables) ? raw.useables.map(createItem) : [];
    const items = [...weapons, ...armor, ...useables];
    const byId = new Map(items.map(item => [item.id, item]));
    cache = { weapons, armor, useables, byId };
  }
  return cache;
}

async function getEquipmentCatalog() {
  const [catalog, materials] = await Promise.all([loadCatalog(), getMaterialCatalog()]);
  return {
    weapons: catalog.weapons,
    armor: catalog.armor,
    useables: catalog.useables,
    materials,
  };
}

async function getEquipmentMap() {
  const catalog = await loadCatalog();
  return catalog.byId;
}

async function getItemById(id) {
  const map = await getEquipmentMap();
  return map.get(id) || null;
}

module.exports = { getEquipmentCatalog, getEquipmentMap, getItemById };
