const path = require('path');
const { readJSON } = require('../store/jsonStore');
const Material = require('../domain/material');

const DATA_DIR = path.join(__dirname, '..', 'data');
const MATERIAL_FILE = path.join(DATA_DIR, 'materials.json');

let cache = null;

function createMaterial(entry) {
  return Object.freeze(new Material(entry));
}

async function loadMaterials() {
  if (!cache) {
    const raw = await readJSON(MATERIAL_FILE);
    const materials = Array.isArray(raw.materials) ? raw.materials.map(createMaterial) : [];
    const byId = new Map(materials.map(material => [material.id, material]));
    cache = { materials, byId };
  }
  return cache;
}

async function getMaterialCatalog() {
  const { materials } = await loadMaterials();
  return materials;
}

async function getMaterialMap() {
  const { byId } = await loadMaterials();
  return byId;
}

async function getMaterialById(id) {
  const map = await getMaterialMap();
  return map.get(id) || null;
}

module.exports = { getMaterialCatalog, getMaterialMap, getMaterialById };
