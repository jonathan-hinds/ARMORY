const builderWrapper = document.getElementById('builder-wrapper');
const loadingEl = document.getElementById('builder-loading');

const tabButtons = Array.from(document.querySelectorAll('[data-tab]'));
const tabPanels = Array.from(document.querySelectorAll('[data-tab-panel]'));
const tabLinkButtons = Array.from(document.querySelectorAll('[data-tab-target]'));

const worldIdInput = document.getElementById('world-id');
const worldNameInput = document.getElementById('world-name');
const worldTileSizeInput = document.getElementById('world-tile-size');
const worldMoveCooldownInput = document.getElementById('world-move-cooldown');
const worldEnemyCountInput = document.getElementById('world-enemy-count');
const worldEncounterTilesInput = document.getElementById('world-encounter-tiles');
const worldEncounterChanceInput = document.getElementById('world-encounter-chance');
const worldEncounterCooldownInput = document.getElementById('world-encounter-cooldown');

const tilePaletteEl = document.getElementById('tile-palette');
const paletteSelect = document.getElementById('palette-select');
const paletteNameInput = document.getElementById('palette-name');
const paletteDescriptionInput = document.getElementById('palette-description');
const createPaletteButton = document.getElementById('create-palette');
const savePaletteButton = document.getElementById('save-palette');
const deletePaletteButton = document.getElementById('delete-palette');
const paletteTileList = document.getElementById('palette-tile-list');
const spriteAssetList = document.getElementById('sprite-asset-list');
const spriteForm = document.getElementById('sprite-form');
const spriteTileIdInput = document.getElementById('sprite-tile-id');
const spriteFillInput = document.getElementById('sprite-fill');
const spriteAssetPathInput = document.getElementById('sprite-asset-path');
const spriteWalkableInput = document.getElementById('sprite-walkable');
const spritePreview = document.getElementById('sprite-preview');

const addZoneButton = document.getElementById('add-zone');
const zoneListEl = document.getElementById('zone-list');
const zoneGridContainer = document.getElementById('zone-grid');
const zoneDetailsEl = document.getElementById('zone-details');

const modeButtons = Array.from(document.querySelectorAll('.mode-button'));
const transportControls = document.getElementById('transport-controls');
const transportZoneSelect = document.getElementById('transport-zone-select');
const transportTargetXInput = document.getElementById('transport-target-x');
const transportTargetYInput = document.getElementById('transport-target-y');
const transportClearButton = document.getElementById('transport-clear');
const enemyModeInfo = document.getElementById('enemy-mode-info');
const enemyPlacementTargetEl = document.getElementById('enemy-placement-target');

const enemyForm = document.getElementById('enemy-form');
const enemyIdInput = document.getElementById('enemy-id');
const enemyNameInput = document.getElementById('enemy-name');
const enemyBasicTypeInput = document.getElementById('enemy-basic-type');
const enemyLevelInput = document.getElementById('enemy-level');
const enemyStrInput = document.getElementById('enemy-str');
const enemyStaInput = document.getElementById('enemy-sta');
const enemyAgiInput = document.getElementById('enemy-agi');
const enemyIntInput = document.getElementById('enemy-int');
const enemyWisInput = document.getElementById('enemy-wis');
const enemyXpInput = document.getElementById('enemy-xp');
const enemyGoldInput = document.getElementById('enemy-gold');
const enemySpawnChanceInput = document.getElementById('enemy-spawn-chance');
const enemyAbilitySelect = document.getElementById('enemy-ability-select');
const enemyAddAbilityButton = document.getElementById('enemy-add-ability');
const enemyRotationList = document.getElementById('enemy-rotation-list');
const enemyEquipmentSlotsContainer = document.getElementById('enemy-equipment-slots');
const enemyTemplateListEl = document.getElementById('enemy-template-list');
const enemyResetButton = document.getElementById('enemy-reset');
const enemyPickerListEl = document.getElementById('enemy-picker-list');

const generateWorldButton = document.getElementById('generate-world');
const loadWorldButton = document.getElementById('load-world');
const worldOutput = document.getElementById('world-output');

const DEFAULT_TILES = [
  { id: '0', fill: '#000000', sprite: '/assets/Sprite-0003.png' },
  { id: '1', fill: '#ffffff', sprite: '/assets/Sprite-0001.png' },
  { id: '2', fill: '#dcdcdc', sprite: '/assets/Sprite-0002.png' },
];

const DEFAULT_ENCOUNTER_TILES = [2];
const DEFAULT_ENCOUNTER_CHANCE = 0.22;
const DEFAULT_ENCOUNTER_COOLDOWN = 2000;
const DEFAULT_ENEMY_COUNT = 6;

const EQUIPMENT_SLOT_LABELS = {
  weapon: 'Weapon',
  helmet: 'Helmet',
  chest: 'Chest',
  legs: 'Legs',
  feet: 'Feet',
  hands: 'Hands',
  useable: 'Useable Item',
  useable1: 'Useable Slot 1',
  useable2: 'Useable Slot 2',
};

const PREFERRED_SLOTS = [
  'weapon',
  'helmet',
  'chest',
  'legs',
  'feet',
  'hands',
  'useable',
  'useable1',
  'useable2',
];

const state = {
  abilities: [],
  equipmentBySlot: new Map(),
  equipmentSlots: [],
  spriteAssets: [],
  spritePalettes: [],
  activePalette: null,
  selectedPaletteId: null,
  spriteBuilder: {
    selectedAsset: null,
  },
  world: {
    id: '',
    name: '',
    tileSize: 32,
    moveCooldownMs: 180,
    enemyCount: DEFAULT_ENEMY_COUNT,
    encounterTiles: DEFAULT_ENCOUNTER_TILES.slice(),
    encounterChance: DEFAULT_ENCOUNTER_CHANCE,
    encounterCooldownMs: DEFAULT_ENCOUNTER_COOLDOWN,
  },
  palette: {},
  tileConfig: {},
  zones: [],
  selectedZoneId: null,
  selectedTileId: null,
  editMode: 'tile',
  transportPlacement: null,
  enemyTemplates: [],
  selectedEnemyTemplateId: null,
  enemyFormRotation: [],
  editingEnemyId: null,
};

function setActiveTab(tabId) {
  if (!tabId) {
    return;
  }
  tabButtons.forEach(button => {
    button.classList.toggle('active', button.dataset.tab === tabId);
  });
  tabPanels.forEach(panel => {
    panel.classList.toggle('active', panel.dataset.tabPanel === tabId);
  });
}

tabButtons.forEach(button => {
  button.addEventListener('click', () => setActiveTab(button.dataset.tab));
});

tabLinkButtons.forEach(button => {
  button.addEventListener('click', () => setActiveTab(button.dataset.tabTarget));
});

setActiveTab('world');

function parseEncounterTilesInput(value) {
  if (typeof value !== 'string') {
    return [];
  }
  return value
    .split(',')
    .map(part => part.trim())
    .filter(part => part.length)
    .map(part => {
      const numeric = Number(part);
      if (Number.isFinite(numeric)) {
        return Math.max(0, Math.round(numeric));
      }
      return null;
    })
    .filter(tile => Number.isFinite(tile));
}

function normalizeEncounterTiles(rawTiles) {
  if (!Array.isArray(rawTiles)) {
    return [];
  }
  return rawTiles
    .map(tile => {
      const numeric = Number(tile);
      if (Number.isFinite(numeric)) {
        return Math.max(0, Math.round(numeric));
      }
      return null;
    })
    .filter(tile => Number.isFinite(tile));
}

function formatEncounterTilesValue(tiles) {
  if (!Array.isArray(tiles) || !tiles.length) {
    return '';
  }
  return tiles.join(', ');
}

function initializeDefaults() {
  setActivePalette(createDefaultPalette(), { skipSelect: true, skipZone: true });
  renderPaletteSelect();
}

function attachWorldListeners() {
  worldIdInput.addEventListener('input', e => {
    state.world.id = e.target.value.trim();
  });
  worldNameInput.addEventListener('input', e => {
    state.world.name = e.target.value;
  });
  worldTileSizeInput.addEventListener('input', e => {
    const value = parseInt(e.target.value, 10);
    if (!Number.isNaN(value)) {
      state.world.tileSize = value;
    }
  });
  worldMoveCooldownInput.addEventListener('input', e => {
    const value = parseInt(e.target.value, 10);
    if (!Number.isNaN(value)) {
      state.world.moveCooldownMs = value;
    }
  });
  worldEnemyCountInput.addEventListener('input', e => {
    const value = parseInt(e.target.value, 10);
    if (!Number.isNaN(value) && value > 0) {
      state.world.enemyCount = value;
    }
  });
  if (worldEncounterTilesInput) {
    worldEncounterTilesInput.addEventListener('input', e => {
      state.world.encounterTiles = parseEncounterTilesInput(e.target.value);
    });
  }
  if (worldEncounterChanceInput) {
    worldEncounterChanceInput.addEventListener('input', e => {
      const value = parseFloat(e.target.value);
      if (Number.isFinite(value)) {
        state.world.encounterChance = Math.max(0, Math.min(1, value));
      }
    });
  }
  if (worldEncounterCooldownInput) {
    worldEncounterCooldownInput.addEventListener('input', e => {
      const value = parseInt(e.target.value, 10);
      if (!Number.isNaN(value) && value >= 0) {
        state.world.encounterCooldownMs = value;
      }
    });
  }
}

function renderTilePalette() {
  tilePaletteEl.innerHTML = '';
  const tileEntries = Object.entries(state.tileConfig);
  if (!tileEntries.length) {
    const empty = document.createElement('p');
    empty.textContent = 'No tiles defined';
    tilePaletteEl.appendChild(empty);
    return;
  }
  tileEntries.forEach(([id, config]) => {
    const token = document.createElement('button');
    token.type = 'button';
    token.className = 'tile-token';
    if (state.selectedTileId === id) {
      token.classList.add('active');
    }
    token.style.background = config.fill || '#ffffff';
    token.innerHTML = `<strong>${id}</strong><span>${config.fill || ''}</span>`;
    token.title = config.walkable ? 'Walkable' : 'Blocked';
    token.addEventListener('click', () => {
      state.selectedTileId = id;
      renderTilePalette();
    });
    tilePaletteEl.appendChild(token);
  });
}

function createDefaultPalette() {
  return {
    _id: null,
    name: 'Default Palette',
    description: '',
    tiles: DEFAULT_TILES.map(tile => ({
      tileId: String(tile.id),
      sprite: tile.sprite,
      fill: tile.fill,
      walkable: true,
    })),
  };
}

function normalizePalette(palette) {
  if (!palette || typeof palette !== 'object') {
    return createDefaultPalette();
  }
  const tiles = Array.isArray(palette.tiles)
    ? palette.tiles
        .map(tile => {
          if (!tile || typeof tile !== 'object') {
            return null;
          }
          const tileId = String(tile.tileId || tile.id || '').trim();
          const sprite = String(tile.sprite || tile.asset || '').trim();
          if (!tileId) {
            return null;
          }
          const fill =
            typeof tile.fill === 'string' && tile.fill.trim() ? tile.fill.trim() : '#ffffff';
          const walkable = Boolean(tile.walkable);
          return { tileId, sprite, fill, walkable };
        })
        .filter(Boolean)
    : [];
  return {
    _id: palette._id || null,
    name: palette.name || 'Unnamed Palette',
    description: palette.description || '',
    tiles,
  };
}

function clonePalette(palette) {
  const normalized = normalizePalette(palette);
  return {
    _id: normalized._id,
    name: normalized.name,
    description: normalized.description,
    tiles: normalized.tiles.map(tile => ({ ...tile })),
  };
}

function rebuildPaletteState() {
  state.palette = {};
  state.tileConfig = {};
  const tiles = state.activePalette?.tiles || [];
  tiles.forEach(tile => {
    state.palette[tile.tileId] = tile.fill;
    state.tileConfig[tile.tileId] = {
      sprite: tile.sprite,
      fill: tile.fill,
      walkable: Boolean(tile.walkable),
    };
  });
  if (!state.selectedTileId || !state.tileConfig[state.selectedTileId]) {
    state.selectedTileId = tiles[0]?.tileId || null;
  }
}

function setPaletteInputsFromState() {
  if (paletteNameInput) {
    paletteNameInput.value = state.activePalette?.name || '';
  }
  if (paletteDescriptionInput) {
    paletteDescriptionInput.value = state.activePalette?.description || '';
  }
}

function renderPaletteTiles() {
  if (!paletteTileList) return;
  paletteTileList.innerHTML = '';
  const tiles = state.activePalette?.tiles || [];
  if (!tiles.length) {
    const empty = document.createElement('p');
    empty.textContent = 'No tiles in this palette yet.';
    paletteTileList.appendChild(empty);
    return;
  }
  tiles.forEach(tile => {
    const item = document.createElement('div');
    item.className = 'palette-tile';

    const info = document.createElement('div');
    info.className = 'palette-tile-info';

    const swatch = document.createElement('div');
    swatch.className = 'palette-tile-swatch';
    if (tile.sprite) {
      const img = document.createElement('img');
      img.src = tile.sprite;
      img.alt = tile.tileId;
      img.loading = 'lazy';
      swatch.appendChild(img);
    } else {
      swatch.style.background = tile.fill || '#ffffff';
    }

    const label = document.createElement('span');
    label.textContent = `${tile.tileId} • ${tile.walkable ? 'Walkable' : 'Blocked'} • ${
      tile.fill || '#ffffff'
    }`;

    info.appendChild(swatch);
    info.appendChild(label);

    const actions = document.createElement('div');
    actions.className = 'actions';

    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.textContent = 'Edit';
    editButton.addEventListener('click', () => loadTileIntoSpriteForm(tile));
    actions.appendChild(editButton);

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.textContent = 'Remove';
    removeButton.addEventListener('click', () => removePaletteTile(tile.tileId));
    actions.appendChild(removeButton);

    item.appendChild(info);
    item.appendChild(actions);
    paletteTileList.appendChild(item);
  });
}

function renderPaletteSelect() {
  if (!paletteSelect) return;
  const activeId = state.selectedPaletteId;
  paletteSelect.innerHTML = '';
  let hasSelected = false;
  state.spritePalettes.forEach(palette => {
    const option = document.createElement('option');
    option.value = palette._id || '';
    option.textContent = palette.name || 'Palette';
    if (palette._id && palette._id === activeId) {
      option.selected = true;
      hasSelected = true;
    }
    paletteSelect.appendChild(option);
  });

  if (!hasSelected) {
    const option = document.createElement('option');
    option.value = '__custom__';
    const name = state.activePalette?.name || 'Custom Palette';
    const suffix = state.activePalette && state.activePalette._id ? '' : ' (Unsaved)';
    option.textContent = `${name}${suffix}`;
    option.selected = true;
    paletteSelect.appendChild(option);
  }
}

function setActivePalette(palette, options = {}) {
  const target = palette || createDefaultPalette();
  state.activePalette = clonePalette(target);
  state.selectedPaletteId = state.activePalette._id || null;
  setPaletteInputsFromState();
  rebuildPaletteState();
  renderTilePalette();
  if (!options.skipZone) {
    renderZoneEditor();
  }
  renderPaletteTiles();
  if (!options.skipSelect) {
    renderPaletteSelect();
  }
}

function setActivePaletteById(id) {
  if (!id) {
    return;
  }
  const palette = state.spritePalettes.find(entry => entry._id === id);
  if (palette) {
    setActivePalette(palette, { skipSelect: true });
    state.selectedPaletteId = palette._id;
    renderPaletteSelect();
    state.spriteBuilder.selectedAsset = null;
    updateSpritePreview('');
    renderSpriteAssets();
  }
}

function selectSpriteAsset(assetUrl) {
  state.spriteBuilder.selectedAsset = assetUrl || null;
  renderSpriteAssets();
}

function renderSpriteAssets() {
  if (!spriteAssetList) return;
  spriteAssetList.innerHTML = '';
  if (!state.spriteAssets.length) {
    const empty = document.createElement('p');
    empty.textContent = 'No sprite assets found.';
    spriteAssetList.appendChild(empty);
    return;
  }
  state.spriteAssets.forEach(asset => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'asset-tile';
    if (state.spriteBuilder.selectedAsset === asset.url) {
      button.classList.add('active');
    }
    button.title = asset.id;
    const img = document.createElement('img');
    img.src = asset.url;
    img.alt = asset.name;
    img.loading = 'lazy';
    button.appendChild(img);
    button.addEventListener('click', () => {
      spriteAssetPathInput.value = asset.url;
      selectSpriteAsset(asset.url);
      updateSpritePreview(asset.url);
    });
    spriteAssetList.appendChild(button);
  });
}

function updateSpritePreview(assetUrl) {
  if (!spritePreview) return;
  spritePreview.innerHTML = '';
  if (assetUrl) {
    const img = document.createElement('img');
    img.src = assetUrl;
    img.alt = 'Sprite preview';
    img.loading = 'lazy';
    spritePreview.appendChild(img);
  } else {
    const message = document.createElement('p');
    message.textContent = 'Select an asset to preview';
    spritePreview.appendChild(message);
  }
}

function loadTileIntoSpriteForm(tile) {
  if (!spriteForm) return;
  spriteTileIdInput.value = tile.tileId;
  spriteFillInput.value = tile.fill || '#ffffff';
  spriteAssetPathInput.value = tile.sprite || '';
  spriteWalkableInput.checked = Boolean(tile.walkable);
  updateSpritePreview(tile.sprite);
  selectSpriteAsset(tile.sprite);
  setActiveTab('sprites');
}

function removePaletteTile(tileId) {
  const tiles = state.activePalette?.tiles || [];
  const index = tiles.findIndex(tile => tile.tileId === tileId);
  if (index < 0) {
    return;
  }
  tiles.splice(index, 1);
  state.activePalette.tiles = tiles;
  if (state.selectedTileId === tileId) {
    state.selectedTileId = tiles[0]?.tileId || null;
  }
  rebuildPaletteState();
  renderPaletteTiles();
  renderTilePalette();
  renderZoneEditor();
}

function handleSpriteFormSubmit(event) {
  event.preventDefault();
  const tileId = spriteTileIdInput.value.trim();
  const spritePath = spriteAssetPathInput.value.trim();
  const fill = spriteFillInput.value.trim() || '#ffffff';
  const walkable = spriteWalkableInput.checked;
  if (!tileId) {
    alert('Tile ID is required.');
    return;
  }
  if (!spritePath) {
    alert('Select a sprite asset for this tile.');
    return;
  }
  const tiles = state.activePalette?.tiles || [];
  const tile = { tileId, sprite: spritePath, fill, walkable };
  const existingIndex = tiles.findIndex(entry => entry.tileId === tileId);
  if (existingIndex >= 0) {
    tiles.splice(existingIndex, 1, tile);
  } else {
    tiles.push(tile);
  }
  state.activePalette.tiles = tiles;
  state.selectedTileId = tileId;
  rebuildPaletteState();
  renderPaletteTiles();
  renderTilePalette();
  renderZoneEditor();
  spriteForm.reset();
  spriteAssetPathInput.value = spritePath;
  spriteWalkableInput.checked = walkable;
  updateSpritePreview(spritePath);
  selectSpriteAsset(spritePath);
}

async function saveActivePalette() {
  if (!state.activePalette) return;
  const name = paletteNameInput.value.trim();
  if (!name) {
    alert('Palette requires a name.');
    return;
  }
  if (!state.activePalette.tiles.length) {
    alert('Add at least one tile to the palette before saving.');
    return;
  }
  const payload = {
    id: state.activePalette._id,
    name,
    description: paletteDescriptionInput.value.trim(),
    tiles: state.activePalette.tiles.map(tile => ({
      tileId: tile.tileId,
      sprite: tile.sprite,
      fill: tile.fill,
      walkable: Boolean(tile.walkable),
    })),
  };
  try {
    const response = await fetch('/dev/palettes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error('save failed');
    }
    const saved = normalizePalette(await response.json());
    const existingIndex = state.spritePalettes.findIndex(p => p._id === saved._id);
    if (existingIndex >= 0) {
      state.spritePalettes.splice(existingIndex, 1, saved);
    } else {
      state.spritePalettes.push(saved);
    }
    state.spritePalettes.sort((a, b) => a.name.localeCompare(b.name));
    setActivePalette(saved, { skipSelect: true });
    state.selectedPaletteId = saved._id;
    setPaletteInputsFromState();
    renderPaletteSelect();
    renderPaletteTiles();
    renderTilePalette();
    renderZoneEditor();
  } catch (err) {
    console.error(err);
    alert('Failed to save palette.');
  }
}

async function deleteActivePalette() {
  if (!state.activePalette) return;
  const currentId = state.activePalette._id;
  if (currentId) {
    const confirmed = confirm(`Delete palette "${state.activePalette.name}"?`);
    if (!confirmed) {
      return;
    }
    try {
      const response = await fetch(`/dev/palettes/${encodeURIComponent(currentId)}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error('delete failed');
      }
      state.spritePalettes = state.spritePalettes.filter(palette => palette._id !== currentId);
    } catch (err) {
      console.error(err);
      alert('Failed to delete palette.');
      return;
    }
  }
  const fallback = state.spritePalettes[0] || createDefaultPalette();
  setActivePalette(fallback, { skipSelect: true });
  state.selectedPaletteId = fallback._id || null;
  renderPaletteSelect();
  renderPaletteTiles();
  renderTilePalette();
  renderZoneEditor();
  state.spriteBuilder.selectedAsset = null;
  updateSpritePreview('');
  renderSpriteAssets();
}

function startNewPalette() {
  const blank = createDefaultPalette();
  blank._id = null;
  blank.name = '';
  blank.description = '';
  blank.tiles = [];
  setActivePalette(blank);
  state.selectedPaletteId = null;
  renderPaletteSelect();
  state.spriteBuilder.selectedAsset = null;
  updateSpritePreview('');
  renderSpriteAssets();
}

if (paletteSelect) {
  paletteSelect.addEventListener('change', () => {
    const value = paletteSelect.value;
    if (!value || value === '__custom__') {
      return;
    }
    setActivePaletteById(value);
  });
}

if (createPaletteButton) {
  createPaletteButton.addEventListener('click', () => {
    startNewPalette();
    setPaletteInputsFromState();
  });
}

if (savePaletteButton) {
  savePaletteButton.addEventListener('click', saveActivePalette);
}

if (deletePaletteButton) {
  deletePaletteButton.addEventListener('click', deleteActivePalette);
}

if (spriteForm) {
  spriteForm.addEventListener('submit', handleSpriteFormSubmit);
}

if (spriteAssetPathInput) {
  spriteAssetPathInput.addEventListener('input', event => {
    const value = event.target.value.trim();
    state.spriteBuilder.selectedAsset = value || null;
    updateSpritePreview(value);
  });
}

if (paletteNameInput) {
  paletteNameInput.addEventListener('input', event => {
    if (!state.activePalette) return;
    state.activePalette.name = event.target.value;
  });
}

if (paletteDescriptionInput) {
  paletteDescriptionInput.addEventListener('input', event => {
    if (!state.activePalette) return;
    state.activePalette.description = event.target.value;
  });
}

function normalizeZoneId(base, takenIds) {
  const sanitized = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'zone';
  let candidate = sanitized;
  let suffix = 1;
  while (takenIds.has(candidate)) {
    suffix += 1;
    candidate = `${sanitized}_${suffix}`;
  }
  return candidate;
}

function createZoneId(base) {
  const existing = new Set(state.zones.map(z => z.id));
  return normalizeZoneId(base, existing);
}

function createZone(name, width, height) {
  const id = createZoneId(name);
  const defaultTile = state.selectedTileId || Object.keys(state.tileConfig)[0] || '0';
  const tiles = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => defaultTile)
  );
  return {
    id,
    name,
    width,
    height,
    tiles,
    transports: [],
    enemyPlacements: [],
    spawn: null,
  };
}

function addZone() {
  const name = prompt('Zone name?');
  if (!name) {
    return;
  }
  const width = parseInt(prompt('Zone width (tiles)?'), 10);
  const height = parseInt(prompt('Zone height (tiles)?'), 10);
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    alert('Width and height must be positive integers.');
    return;
  }
  const zone = createZone(name, width, height);
  state.zones.push(zone);
  state.selectedZoneId = zone.id;
  renderZonesList();
  renderZoneEditor();
  updateTransportOptions();
}

addZoneButton.addEventListener('click', addZone);

function renderZonesList() {
  zoneListEl.innerHTML = '';
  if (!state.zones.length) {
    const empty = document.createElement('p');
    empty.textContent = 'No zones yet. Add one to begin.';
    zoneListEl.appendChild(empty);
    return;
  }
  state.zones.forEach(zone => {
    const item = document.createElement('div');
    item.className = 'zone-item';
    if (zone.id === state.selectedZoneId) {
      item.classList.add('active');
    }
    const label = document.createElement('span');
    label.textContent = zone.name || zone.id;
    const dims = document.createElement('span');
    dims.textContent = `${zone.width}×${zone.height}`;
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = 'Delete';
    removeBtn.addEventListener('click', ev => {
      ev.stopPropagation();
      if (confirm(`Delete zone "${zone.name}"?`)) {
        state.zones = state.zones.filter(z => z.id !== zone.id);
        if (state.selectedZoneId === zone.id) {
          state.selectedZoneId = state.zones[0]?.id || null;
        }
        renderZonesList();
        renderZoneEditor();
        updateTransportOptions();
      }
    });
    item.addEventListener('click', () => {
      state.selectedZoneId = zone.id;
      renderZonesList();
      renderZoneEditor();
      updateTransportOptions();
    });
    item.appendChild(label);
    item.appendChild(dims);
    item.appendChild(removeBtn);
    zoneListEl.appendChild(item);
  });
}

function getSelectedZone() {
  return state.zones.find(z => z.id === state.selectedZoneId) || null;
}

function setEditMode(mode) {
  state.editMode = mode;
  modeButtons.forEach(button => {
    if (button.dataset.mode === mode) {
      button.classList.add('active');
    } else {
      button.classList.remove('active');
    }
  });
  transportControls.classList.toggle('hidden', mode !== 'transport');
  enemyModeInfo.classList.toggle('hidden', mode !== 'enemy');
}

modeButtons.forEach(button => {
  button.addEventListener('click', () => {
    setEditMode(button.dataset.mode);
  });
});

function setTransportPlacement() {
  const zoneId = transportZoneSelect.value || null;
  const x = parseInt(transportTargetXInput.value, 10);
  const y = parseInt(transportTargetYInput.value, 10);
  if (zoneId && Number.isInteger(x) && Number.isInteger(y)) {
    state.transportPlacement = { zoneId, x, y };
  } else if (zoneId) {
    state.transportPlacement = { zoneId, x: null, y: null };
  } else {
    state.transportPlacement = null;
  }
}

transportZoneSelect.addEventListener('change', () => {
  setTransportPlacement();
});
transportTargetXInput.addEventListener('input', () => {
  setTransportPlacement();
});
transportTargetYInput.addEventListener('input', () => {
  setTransportPlacement();
});
transportClearButton.addEventListener('click', () => {
  transportZoneSelect.value = '';
  transportTargetXInput.value = '';
  transportTargetYInput.value = '';
  state.transportPlacement = null;
});

function ensureTransportPlacement() {
  const placement = state.transportPlacement;
  if (!placement || !placement.zoneId) {
    alert('Select a target zone and coordinates for the transport.');
    return false;
  }
  if (placement.x == null || placement.y == null) {
    alert('Provide target coordinates for the transport.');
    return false;
  }
  return true;
}

function handleEnemyPlacement(zone, x, y) {
  const templateId = state.selectedEnemyTemplateId;
  if (!templateId) {
    alert('Select an enemy template to place.');
    return;
  }
  const existing = zone.enemyPlacements.find(p => p.x === x && p.y === y);
  if (existing) {
    if (existing.templateId === templateId) {
      zone.enemyPlacements = zone.enemyPlacements.filter(p => !(p.x === x && p.y === y));
    } else {
      existing.templateId = templateId;
    }
  } else {
    zone.enemyPlacements.push({ x, y, templateId });
  }
}

function handleTransportPlacement(zone, x, y) {
  if (!ensureTransportPlacement()) {
    return;
  }
  const placement = state.transportPlacement;
  if (placement.zoneId === zone.id && placement.x === x && placement.y === y) {
    alert('Transport cannot target the same tile.');
    return;
  }
  const existingIndex = zone.transports.findIndex(t => t.from.x === x && t.from.y === y);
  const transport = {
    from: { x, y },
    toZoneId: placement.zoneId,
    to: { x: placement.x, y: placement.y },
  };
  if (existingIndex >= 0) {
    zone.transports.splice(existingIndex, 1, transport);
  } else {
    zone.transports.push(transport);
  }
}

function handleSpawnPlacement(zone, x, y) {
  zone.spawn = { x, y };
}

function handleZoneCellClick(event) {
  const zone = getSelectedZone();
  if (!zone) return;
  const x = Number(event.currentTarget.dataset.x);
  const y = Number(event.currentTarget.dataset.y);
  switch (state.editMode) {
    case 'tile':
      if (!state.selectedTileId) {
        alert('Select a tile from the palette first.');
        return;
      }
      zone.tiles[y][x] = state.selectedTileId;
      break;
    case 'enemy':
      handleEnemyPlacement(zone, x, y);
      break;
    case 'transport':
      handleTransportPlacement(zone, x, y);
      break;
    case 'spawn':
      handleSpawnPlacement(zone, x, y);
      break;
    default:
      break;
  }
  renderZoneEditor();
}

function handleZoneCellContextMenu(event) {
  event.preventDefault();
  const zone = getSelectedZone();
  if (!zone) return;
  const x = Number(event.currentTarget.dataset.x);
  const y = Number(event.currentTarget.dataset.y);
  if (state.editMode === 'enemy') {
    zone.enemyPlacements = zone.enemyPlacements.filter(p => !(p.x === x && p.y === y));
  } else if (state.editMode === 'transport') {
    zone.transports = zone.transports.filter(t => !(t.from.x === x && t.from.y === y));
  } else if (state.editMode === 'spawn') {
    if (zone.spawn && zone.spawn.x === x && zone.spawn.y === y) {
      zone.spawn = null;
    }
  } else if (state.editMode === 'tile') {
    const defaultTile = Object.keys(state.tileConfig)[0];
    if (defaultTile) {
      zone.tiles[y][x] = defaultTile;
    }
  }
  renderZoneEditor();
}

function renderZoneGrid() {
  zoneGridContainer.innerHTML = '';
  const zone = getSelectedZone();
  if (!zone) {
    const empty = document.createElement('p');
    empty.textContent = 'Select a zone to edit.';
    zoneGridContainer.appendChild(empty);
    return;
  }
  const grid = document.createElement('div');
  grid.className = 'zone-grid';
  const cellSize = Math.max(16, Math.min(96, state.world.tileSize || 32));
  grid.style.gridTemplateColumns = `repeat(${zone.width}, ${cellSize}px)`;
  grid.style.gridTemplateRows = `repeat(${zone.height}, ${cellSize}px)`;
  for (let y = 0; y < zone.height; y += 1) {
    for (let x = 0; x < zone.width; x += 1) {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'zone-cell';
      cell.dataset.x = x;
      cell.dataset.y = y;
      const tileId = zone.tiles[y][x];
      const tileConfig = state.tileConfig[tileId] || {};
      cell.style.background = tileConfig.fill || '#ffffff';
      cell.textContent = tileId;
      if (tileConfig.walkable === false) {
        cell.classList.add('not-walkable');
      } else {
        cell.classList.remove('not-walkable');
      }
      if (zone.spawn && zone.spawn.x === x && zone.spawn.y === y) {
        cell.classList.add('is-spawn');
      }
      if (zone.enemyPlacements.some(p => p.x === x && p.y === y)) {
        cell.classList.add('has-enemy');
      }
      if (zone.transports.some(t => t.from.x === x && t.from.y === y)) {
        cell.classList.add('has-transport');
      }
      cell.addEventListener('click', handleZoneCellClick);
      cell.addEventListener('contextmenu', handleZoneCellContextMenu);
      grid.appendChild(cell);
    }
  }
  zoneGridContainer.appendChild(grid);
}

function removeEnemyPlacement(zoneId, index) {
  const zone = state.zones.find(z => z.id === zoneId);
  if (!zone) return;
  zone.enemyPlacements.splice(index, 1);
  renderZoneEditor();
}

function removeTransport(zoneId, index) {
  const zone = state.zones.find(z => z.id === zoneId);
  if (!zone) return;
  zone.transports.splice(index, 1);
  renderZoneEditor();
}

function renderZoneDetails() {
  zoneDetailsEl.innerHTML = '';
  const zone = getSelectedZone();
  if (!zone) {
    zoneDetailsEl.textContent = 'Select a zone to view details.';
    return;
  }
  const nameLabel = document.createElement('label');
  nameLabel.className = 'field-label';
  nameLabel.textContent = 'Zone Name';
  const nameInput = document.createElement('input');
  nameInput.value = zone.name;
  nameInput.addEventListener('input', e => {
    zone.name = e.target.value;
    renderZonesList();
    updateTransportOptions();
  });
  nameLabel.appendChild(nameInput);
  zoneDetailsEl.appendChild(nameLabel);

  const info = document.createElement('p');
  info.textContent = `Size: ${zone.width}×${zone.height}`;
  zoneDetailsEl.appendChild(info);

  const spawnInfo = document.createElement('p');
  spawnInfo.textContent = `Spawn: ${zone.spawn ? `${zone.spawn.x}, ${zone.spawn.y}` : 'Not set'}`;
  zoneDetailsEl.appendChild(spawnInfo);

  const enemySection = document.createElement('div');
  enemySection.className = 'zone-subsection';
  const enemyTitle = document.createElement('h3');
  enemyTitle.textContent = `Enemy Placements (${zone.enemyPlacements.length})`;
  enemySection.appendChild(enemyTitle);
  const enemyList = document.createElement('ul');
  zone.enemyPlacements.forEach((placement, index) => {
    const li = document.createElement('li');
    const template = state.enemyTemplates.find(t => t.id === placement.templateId);
    const label = template ? `${template.name} (${placement.templateId})` : placement.templateId;
    li.textContent = `${label} at ${placement.x}, ${placement.y}`;
    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.textContent = 'Remove';
    removeButton.addEventListener('click', () => removeEnemyPlacement(zone.id, index));
    li.appendChild(removeButton);
    enemyList.appendChild(li);
  });
  if (!zone.enemyPlacements.length) {
    const empty = document.createElement('li');
    empty.textContent = 'None';
    enemyList.appendChild(empty);
  }
  enemySection.appendChild(enemyList);
  zoneDetailsEl.appendChild(enemySection);

  const transportSection = document.createElement('div');
  transportSection.className = 'zone-subsection';
  const transportTitle = document.createElement('h3');
  transportTitle.textContent = `Transports (${zone.transports.length})`;
  transportSection.appendChild(transportTitle);
  const transportList = document.createElement('ul');
  zone.transports.forEach((transport, index) => {
    const li = document.createElement('li');
    const targetZone = state.zones.find(z => z.id === transport.toZoneId);
    const targetName = targetZone ? targetZone.name || targetZone.id : transport.toZoneId;
    li.textContent = `${transport.from.x},${transport.from.y} → ${targetName} (${transport.to.x},${transport.to.y})`;
    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.textContent = 'Remove';
    removeButton.addEventListener('click', () => removeTransport(zone.id, index));
    li.appendChild(removeButton);
    transportList.appendChild(li);
  });
  if (!zone.transports.length) {
    const empty = document.createElement('li');
    empty.textContent = 'None';
    transportList.appendChild(empty);
  }
  transportSection.appendChild(transportList);
  zoneDetailsEl.appendChild(transportSection);
}

function renderZoneEditor() {
  renderZoneDetails();
  renderZoneGrid();
}

function updateTransportOptions() {
  const zone = getSelectedZone();
  const currentId = zone?.id;
  transportZoneSelect.innerHTML = '<option value="">Select zone</option>';
  state.zones
    .filter(z => z.id !== currentId)
    .forEach(z => {
      const option = document.createElement('option');
      option.value = z.id;
      option.textContent = z.name || z.id;
      transportZoneSelect.appendChild(option);
    });
  if (state.transportPlacement && state.transportPlacement.zoneId) {
    const exists = state.zones.some(z => z.id === state.transportPlacement.zoneId);
    if (!exists || state.transportPlacement.zoneId === currentId) {
      state.transportPlacement = null;
      transportZoneSelect.value = '';
      transportTargetXInput.value = '';
      transportTargetYInput.value = '';
    }
  }
}

function populateAbilitySelect() {
  enemyAbilitySelect.innerHTML = '';
  state.abilities.forEach(ability => {
    const option = document.createElement('option');
    option.value = ability.id;
    option.textContent = `${ability.id} – ${ability.name}`;
    enemyAbilitySelect.appendChild(option);
  });
}

function flattenEquipment(data) {
  const bySlot = new Map();
  Object.values(data).forEach(items => {
    if (!Array.isArray(items)) return;
    items.forEach(item => {
      if (!item || !item.slot) return;
      const slot = item.slot;
      if (!bySlot.has(slot)) {
        bySlot.set(slot, []);
      }
      bySlot.get(slot).push(item);
    });
  });
  bySlot.forEach(list => {
    list.sort((a, b) => a.name.localeCompare(b.name));
  });
  return bySlot;
}

function renderEquipmentSlots() {
  enemyEquipmentSlotsContainer.innerHTML = '';
  const created = new Set();
  const createSlot = slotId => {
    if (created.has(slotId)) return;
    const label = EQUIPMENT_SLOT_LABELS[slotId] || slotId;
    const wrapper = document.createElement('div');
    wrapper.className = 'equipment-slot';
    const title = document.createElement('span');
    title.textContent = label;
    const select = document.createElement('select');
    select.dataset.slot = slotId;
    select.innerHTML = '<option value="">None</option>';
    const items = state.equipmentBySlot.get(slotId) || [];
    items.forEach(item => {
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent = item.name;
      select.appendChild(option);
    });
    wrapper.appendChild(title);
    wrapper.appendChild(select);
    enemyEquipmentSlotsContainer.appendChild(wrapper);
    created.add(slotId);
  };

  PREFERRED_SLOTS.forEach(slot => {
    if (state.equipmentBySlot.has(slot)) {
      createSlot(slot);
    }
  });

  state.equipmentBySlot.forEach((_, slot) => {
    if (!created.has(slot)) {
      createSlot(slot);
    }
  });
}

function updateEquipmentSelection(equipment) {
  const selects = enemyEquipmentSlotsContainer.querySelectorAll('select[data-slot]');
  selects.forEach(select => {
    const slot = select.dataset.slot;
    const value = equipment[slot] || '';
    select.value = value;
  });
}

function renderEnemyRotation() {
  enemyRotationList.innerHTML = '';
  if (!state.enemyFormRotation.length) {
    const empty = document.createElement('li');
    empty.textContent = 'No abilities yet.';
    enemyRotationList.appendChild(empty);
    return;
  }
  state.enemyFormRotation.forEach((abilityId, index) => {
    const ability = state.abilities.find(a => String(a.id) === String(abilityId));
    const li = document.createElement('li');
    const label = document.createElement('span');
    label.textContent = ability ? `${ability.id} – ${ability.name}` : abilityId;
    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.textContent = '✕';
    removeButton.addEventListener('click', () => {
      state.enemyFormRotation.splice(index, 1);
      renderEnemyRotation();
    });
    li.appendChild(label);
    li.appendChild(removeButton);
    enemyRotationList.appendChild(li);
  });
}

enemyAddAbilityButton.addEventListener('click', () => {
  const abilityId = enemyAbilitySelect.value;
  if (!abilityId) return;
  state.enemyFormRotation.push(Number(abilityId));
  renderEnemyRotation();
});

enemyResetButton.addEventListener('click', () => {
  state.enemyFormRotation = [];
  state.editingEnemyId = null;
  enemyForm.reset();
  renderEnemyRotation();
  updateEquipmentSelection({});
});

function collectEquipmentFromForm() {
  const equipment = {};
  enemyEquipmentSlotsContainer
    .querySelectorAll('select[data-slot]')
    .forEach(select => {
      if (select.value) {
        equipment[select.dataset.slot] = select.value;
      }
    });
  return equipment;
}

function normalizeEnemyTemplate(template) {
  if (!template || typeof template !== 'object') {
    return null;
  }
  const templateId = String(template.templateId || template.id || '').trim();
  if (!templateId) {
    return null;
  }
  const attributes = template.attributes || {};
  const rotation = Array.isArray(template.rotation)
    ? template.rotation
        .map(value => {
          if (value === '' || value == null) {
            return null;
          }
          const numeric = Number(value);
          if (!Number.isNaN(numeric)) {
            return numeric;
          }
          return String(value);
        })
        .filter(value => value !== null)
    : [];
  return {
    id: templateId,
    dbId: template._id || null,
    name: template.name || templateId,
    basicType: template.basicType || 'melee',
    level: Number(template.level) || 1,
    attributes: {
      strength: Number(attributes.strength ?? attributes.STR ?? attributes.str ?? 0) || 0,
      stamina: Number(attributes.stamina ?? attributes.STA ?? attributes.sta ?? 0) || 0,
      agility: Number(attributes.agility ?? attributes.AGI ?? attributes.agi ?? 0) || 0,
      intellect: Number(attributes.intellect ?? attributes.INT ?? attributes.int ?? 0) || 0,
      wisdom: Number(attributes.wisdom ?? attributes.WIS ?? attributes.wis ?? 0) || 0,
    },
    rotation,
    equipment: { ...(template.equipment || {}) },
    xpPct: Number(template.xpPct ?? template.xp ?? 0) || 0,
    gold: Number(template.gold) || 0,
    spawnChance: Number(template.spawnChance) || 0,
  };
}

async function handleEnemyFormSubmit(event) {
  event.preventDefault();
  const id = enemyIdInput.value.trim();
  if (!id) {
    alert('Enemy template requires an ID.');
    return;
  }
  if (
    state.editingEnemyId &&
    state.editingEnemyId !== id &&
    state.enemyTemplates.some(template => template.id === id)
  ) {
    alert('Another template already uses that ID.');
    return;
  }

  const payload = {
    templateId: id,
    name: enemyNameInput.value.trim() || id,
    basicType: enemyBasicTypeInput.value,
    level: parseInt(enemyLevelInput.value, 10) || 1,
    attributes: {
      strength: parseInt(enemyStrInput.value, 10) || 0,
      stamina: parseInt(enemyStaInput.value, 10) || 0,
      agility: parseInt(enemyAgiInput.value, 10) || 0,
      intellect: parseInt(enemyIntInput.value, 10) || 0,
      wisdom: parseInt(enemyWisInput.value, 10) || 0,
    },
    rotation: state.enemyFormRotation.slice(),
    equipment: collectEquipmentFromForm(),
    xpPct: Number(enemyXpInput.value) || 0,
    gold: parseInt(enemyGoldInput.value, 10) || 0,
    spawnChance: Number(enemySpawnChanceInput.value) || 0,
  };

  try {
    const response = await fetch('/dev/enemy-templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error('save failed');
    }
    const saved = normalizeEnemyTemplate(await response.json());
    if (!saved) {
      throw new Error('invalid template');
    }
    const existingIndex = state.enemyTemplates.findIndex(template => template.id === saved.id);
    if (existingIndex >= 0) {
      state.enemyTemplates.splice(existingIndex, 1, saved);
    } else {
      state.enemyTemplates.push(saved);
    }
    state.enemyTemplates.sort((a, b) => a.id.localeCompare(b.id));
    state.editingEnemyId = null;
    renderEnemyTemplateList();
    renderZoneEditor();
    updateEnemyModeInfo();
  } catch (err) {
    console.error(err);
    alert('Failed to save enemy template.');
  }
}

enemyForm.addEventListener('submit', handleEnemyFormSubmit);

function loadEnemyTemplateIntoForm(template) {
  enemyIdInput.value = template.id;
  enemyNameInput.value = template.name;
  enemyBasicTypeInput.value = template.basicType;
  enemyLevelInput.value = template.level;
  enemyStrInput.value = template.attributes.strength ?? 0;
  enemyStaInput.value = template.attributes.stamina ?? 0;
  enemyAgiInput.value = template.attributes.agility ?? 0;
  enemyIntInput.value = template.attributes.intellect ?? 0;
  enemyWisInput.value = template.attributes.wisdom ?? 0;
  enemyXpInput.value = template.xpPct ?? 0;
  enemyGoldInput.value = template.gold ?? 0;
  enemySpawnChanceInput.value = template.spawnChance ?? 0;
  state.enemyFormRotation = template.rotation ? template.rotation.slice() : [];
  updateEquipmentSelection(template.equipment || {});
  renderEnemyRotation();
  state.editingEnemyId = template.id;
  setActiveTab('enemies');
}

function setEnemyPlacementTarget(templateId) {
  state.selectedEnemyTemplateId = templateId;
  enemyPlacementTargetEl.textContent = templateId || 'None Selected';
  renderEnemyTemplateList();
  renderZoneEditor();
}

function renderEnemyTemplateList() {
  enemyTemplateListEl.innerHTML = '';
  if (!state.enemyTemplates.length) {
    const empty = document.createElement('p');
    empty.textContent = 'No enemy templates yet.';
    enemyTemplateListEl.appendChild(empty);
    renderEnemyPickerList();
    return;
  }
  state.enemyTemplates.forEach(template => {
    const item = document.createElement('div');
    item.className = 'enemy-template';
    if (template.id === state.selectedEnemyTemplateId) {
      item.classList.add('active');
    }
    const info = document.createElement('div');
    info.innerHTML = `<strong>${template.name}</strong><br /><span>${template.id}</span>`;
    const actions = document.createElement('div');
    actions.className = 'actions';

    const selectButton = document.createElement('button');
    selectButton.type = 'button';
    selectButton.textContent = 'Select';
    selectButton.addEventListener('click', () => {
      setEnemyPlacementTarget(template.id);
      setActiveTab('world');
    });
    actions.appendChild(selectButton);

    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.textContent = 'Edit';
    editButton.addEventListener('click', () => loadEnemyTemplateIntoForm(template));
    actions.appendChild(editButton);

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.textContent = 'Delete';
    removeButton.addEventListener('click', async () => {
      const confirmed = confirm(`Delete template "${template.name}"?`);
      if (!confirmed) {
        return;
      }
      const removed = await deleteEnemyTemplate(template);
      if (removed) {
        state.enemyTemplates = state.enemyTemplates.filter(t => t.id !== template.id);
        if (state.selectedEnemyTemplateId === template.id) {
          state.selectedEnemyTemplateId = null;
          enemyPlacementTargetEl.textContent = 'None Selected';
        }
        renderEnemyTemplateList();
        renderZoneEditor();
      }
    });
    actions.appendChild(removeButton);

    item.appendChild(info);
    item.appendChild(actions);
    enemyTemplateListEl.appendChild(item);
  });
  renderEnemyPickerList();
}

function renderEnemyPickerList() {
  if (!enemyPickerListEl) return;
  enemyPickerListEl.innerHTML = '';
  if (!state.enemyTemplates.length) {
    const empty = document.createElement('p');
    empty.textContent = 'No templates available. Create one in the Enemies tab.';
    enemyPickerListEl.appendChild(empty);
    return;
  }
  state.enemyTemplates.forEach(template => {
    const item = document.createElement('div');
    item.className = 'enemy-template';
    if (template.id === state.selectedEnemyTemplateId) {
      item.classList.add('active');
    }
    const info = document.createElement('div');
    info.innerHTML = `<strong>${template.name}</strong><br /><span>${template.id}</span>`;
    const actions = document.createElement('div');
    actions.className = 'actions';

    const selectButton = document.createElement('button');
    selectButton.type = 'button';
    selectButton.textContent = 'Select';
    selectButton.addEventListener('click', () => setEnemyPlacementTarget(template.id));
    actions.appendChild(selectButton);

    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.textContent = 'Edit';
    editButton.addEventListener('click', () => loadEnemyTemplateIntoForm(template));
    actions.appendChild(editButton);

    item.appendChild(info);
    item.appendChild(actions);
    enemyPickerListEl.appendChild(item);
  });
}

async function deleteEnemyTemplate(template) {
  try {
    const response = await fetch(`/dev/enemy-templates/${encodeURIComponent(template.id)}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error('delete failed');
    }
    return true;
  } catch (err) {
    console.error(err);
    alert('Failed to delete enemy template.');
    return false;
  }
}

function updateEnemyModeInfo() {
  enemyPlacementTargetEl.textContent = state.selectedEnemyTemplateId || 'None Selected';
}

function convertTileIdForExport(value) {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^-?\d+$/.test(trimmed)) {
      const numeric = Number(trimmed);
      if (!Number.isNaN(numeric)) {
        return numeric;
      }
    }
    return trimmed;
  }
  return value;
}

function buildWorldData() {
  if (!state.zones.length) {
    return null;
  }
  const encounterTiles = normalizeEncounterTiles(state.world.encounterTiles);
  const encounterChance = Number.isFinite(Number(state.world.encounterChance))
    ? Math.max(0, Math.min(1, Number(state.world.encounterChance)))
    : DEFAULT_ENCOUNTER_CHANCE;
  const encounterCooldownMs = Number.isFinite(Number(state.world.encounterCooldownMs))
    ? Math.max(0, Math.round(Number(state.world.encounterCooldownMs)))
    : DEFAULT_ENCOUNTER_COOLDOWN;
  const enemyCount = Number.isFinite(Number(state.world.enemyCount))
    ? Math.max(1, Math.round(Number(state.world.enemyCount)))
    : DEFAULT_ENEMY_COUNT;
  const world = {
    id: state.world.id || 'new_world',
    name: state.world.name || 'New World',
    tileSize: Number(state.world.tileSize) || 0,
    palette: { ...state.palette },
    tileConfig: Object.fromEntries(
      Object.entries(state.tileConfig).map(([id, config]) => [id, { ...config }])
    ),
    moveCooldownMs: Number(state.world.moveCooldownMs) || 0,
    encounters: {
      tiles: encounterTiles,
      chance: encounterChance,
      cooldownMs: encounterCooldownMs,
      enemyCount,
      templates: state.enemyTemplates.map(template => ({
        id: template.id,
        name: template.name,
        basicType: template.basicType,
        level: Number(template.level) || 1,
        attributes: {
          strength: Number(template.attributes?.strength) || 0,
          stamina: Number(template.attributes?.stamina) || 0,
          agility: Number(template.attributes?.agility) || 0,
          intellect: Number(template.attributes?.intellect) || 0,
          wisdom: Number(template.attributes?.wisdom) || 0,
        },
        rotation: Array.isArray(template.rotation)
          ? template.rotation.map(abilityId => {
              const numeric = Number(abilityId);
              return Number.isNaN(numeric) ? abilityId : numeric;
            })
          : [],
        equipment: { ...(template.equipment || {}) },
        xpPct: Number(template.xpPct) || 0,
        gold: Number(template.gold) || 0,
        spawnChance: Number(template.spawnChance) || 0,
      })),
    },
    zones: state.zones.map(zone => {
      const tiles = Array.isArray(zone.tiles)
        ? zone.tiles.map(row => row.map(convertTileIdForExport))
        : [];
      const widthValue = Number(zone.width);
      const heightValue = Number(zone.height);
      const width = Number.isFinite(widthValue) && widthValue > 0
        ? widthValue
        : (Array.isArray(tiles[0]) ? tiles[0].length : 0);
      const height = Number.isFinite(heightValue) && heightValue > 0 ? heightValue : tiles.length;
      const transports = Array.isArray(zone.transports)
        ? zone.transports.map(transport => ({
            from: {
              x: Number(transport?.from?.x) || 0,
              y: Number(transport?.from?.y) || 0,
            },
            toZoneId: transport?.toZoneId || '',
            to: {
              x: Number(transport?.to?.x) || 0,
              y: Number(transport?.to?.y) || 0,
            },
          }))
        : [];
      const enemyPlacements = Array.isArray(zone.enemyPlacements)
        ? zone.enemyPlacements.map(placement => ({
            x: Number(placement.x) || 0,
            y: Number(placement.y) || 0,
            templateId: placement.templateId || '',
          }))
        : [];
      return {
        id: zone.id,
        name: zone.name,
        width,
        height,
        tiles,
        spawn: zone.spawn
          ? {
              x: Number(zone.spawn.x) || 0,
              y: Number(zone.spawn.y) || 0,
            }
          : null,
        transports,
        enemyPlacements,
      };
    }),
  };
  if (state.activePalette?.name) {
    world.paletteName = state.activePalette.name;
  }
  if (state.activePalette?.description) {
    world.paletteDescription = state.activePalette.description;
  }
  const primaryZone = world.zones[0];
  if (primaryZone) {
    world.tiles = primaryZone.tiles;
    world.spawn = primaryZone.spawn ? { ...primaryZone.spawn } : null;
  }
  return world;
}

function generateWorldJson() {
  const world = buildWorldData();
  if (!world) {
    alert('Create at least one zone before generating.');
    return;
  }
  worldOutput.value = JSON.stringify([world], null, 2);
}

function syncWorldForm() {
  worldIdInput.value = state.world.id || '';
  worldNameInput.value = state.world.name || '';
  worldTileSizeInput.value = state.world.tileSize;
  worldMoveCooldownInput.value = state.world.moveCooldownMs;
  worldEnemyCountInput.value = state.world.enemyCount;
  if (worldEncounterTilesInput) {
    worldEncounterTilesInput.value = formatEncounterTilesValue(state.world.encounterTiles);
  }
  if (worldEncounterChanceInput) {
    worldEncounterChanceInput.value = Number.isFinite(state.world.encounterChance)
      ? state.world.encounterChance
      : DEFAULT_ENCOUNTER_CHANCE;
  }
  if (worldEncounterCooldownInput) {
    worldEncounterCooldownInput.value = Number.isFinite(state.world.encounterCooldownMs)
      ? state.world.encounterCooldownMs
      : DEFAULT_ENCOUNTER_COOLDOWN;
  }
}

function applyWorldData(rawWorld) {
  let worldSource = rawWorld;
  if (Array.isArray(worldSource)) {
    if (!worldSource.length) {
      alert('World JSON array is empty.');
      return false;
    }
    if (worldSource.length > 1) {
      console.warn('Multiple worlds provided. Loading the first entry only.');
    }
    [worldSource] = worldSource;
  }
  if (!worldSource || typeof worldSource !== 'object' || Array.isArray(worldSource)) {
    alert('World JSON must be an object.');
    return false;
  }

  state.world.id = worldSource.id || '';
  state.world.name = worldSource.name || '';
  state.world.tileSize = Number(worldSource.tileSize) || state.world.tileSize;
  state.world.moveCooldownMs = Number(worldSource.moveCooldownMs) || state.world.moveCooldownMs;

  const encounterSource =
    worldSource.encounters && typeof worldSource.encounters === 'object'
      ? worldSource.encounters
      : {};

  if (Object.prototype.hasOwnProperty.call(encounterSource, 'enemyCount')) {
    const enemyCount = Number(encounterSource.enemyCount);
    state.world.enemyCount = Number.isInteger(enemyCount) && enemyCount > 0
      ? enemyCount
      : DEFAULT_ENEMY_COUNT;
  } else {
    state.world.enemyCount = DEFAULT_ENEMY_COUNT;
  }

  const tilesSpecified =
    encounterSource && Object.prototype.hasOwnProperty.call(encounterSource, 'tiles');
  const normalizedTiles = normalizeEncounterTiles(encounterSource.tiles);
  state.world.encounterTiles =
    normalizedTiles.length || tilesSpecified
      ? normalizedTiles
      : DEFAULT_ENCOUNTER_TILES.slice();

  if (Object.prototype.hasOwnProperty.call(encounterSource, 'chance')) {
    const chanceValue = Number(encounterSource.chance);
    state.world.encounterChance = Number.isFinite(chanceValue)
      ? Math.max(0, Math.min(1, chanceValue))
      : DEFAULT_ENCOUNTER_CHANCE;
  } else {
    state.world.encounterChance = DEFAULT_ENCOUNTER_CHANCE;
  }

  if (Object.prototype.hasOwnProperty.call(encounterSource, 'cooldownMs')) {
    const cooldownValue = Number(encounterSource.cooldownMs);
    state.world.encounterCooldownMs =
      Number.isFinite(cooldownValue) && cooldownValue >= 0
        ? Math.round(cooldownValue)
        : DEFAULT_ENCOUNTER_COOLDOWN;
  } else {
    state.world.encounterCooldownMs = DEFAULT_ENCOUNTER_COOLDOWN;
  }

  const paletteEntries =
    worldSource.palette && typeof worldSource.palette === 'object' ? worldSource.palette : {};
  const tileConfigSource =
    worldSource.tileConfig && typeof worldSource.tileConfig === 'object'
      ? worldSource.tileConfig
      : {};
  const tileIdSet = new Set([
    ...Object.keys(tileConfigSource),
    ...Object.keys(paletteEntries),
  ]);
  const loadedPalette = {
    _id: null,
    name: worldSource.paletteName || state.activePalette?.name || 'Loaded Palette',
    description: worldSource.paletteDescription || '',
    tiles: [],
  };
  tileIdSet.forEach(tileId => {
    const config = tileConfigSource[tileId] || {};
    const sprite = typeof config.sprite === 'string' ? config.sprite : '';
    const fallbackFill = paletteEntries[tileId];
    const fill =
      typeof config.fill === 'string' && config.fill.trim()
        ? config.fill.trim()
        : typeof fallbackFill === 'string' && fallbackFill.trim()
          ? fallbackFill.trim()
          : '#ffffff';
    const walkable = Object.prototype.hasOwnProperty.call(config, 'walkable')
      ? Boolean(config.walkable)
      : true;
    loadedPalette.tiles.push({
      tileId: String(tileId),
      sprite,
      fill,
      walkable,
    });
  });
  if (!loadedPalette.tiles.length) {
    loadedPalette.tiles = createDefaultPalette().tiles;
  }
  setActivePalette(loadedPalette, { skipSelect: true, skipZone: true });
  state.selectedPaletteId = null;
  renderPaletteSelect();
  state.spriteBuilder.selectedAsset = null;
  updateSpritePreview('');
  renderSpriteAssets();

  const templates = Array.isArray(encounterSource?.templates)
    ? encounterSource.templates.map(normalizeEnemyTemplate).filter(Boolean)
    : [];
  if (templates.length) {
    const byId = new Map(state.enemyTemplates.map(template => [template.id, template]));
    templates.forEach(template => {
      byId.set(template.id, template);
    });
    state.enemyTemplates = Array.from(byId.values());
    state.enemyTemplates.sort((a, b) => a.id.localeCompare(b.id));
  }
  state.selectedEnemyTemplateId = null;
  state.enemyFormRotation = [];
  state.editingEnemyId = null;
  enemyForm.reset();
  renderEnemyRotation();
  updateEquipmentSelection({});
  renderEnemyTemplateList();
  updateEnemyModeInfo();

  const rawZones = Array.isArray(worldSource.zones) ? worldSource.zones.slice() : [];
  let zonesSource = rawZones;
  if (!zonesSource.length && Array.isArray(worldSource.tiles)) {
    zonesSource = [
      {
        id: worldSource.id || 'zone',
        name: worldSource.name || worldSource.id || 'Zone',
        width: Array.isArray(worldSource.tiles[0]) ? worldSource.tiles[0].length : worldSource.width,
        height: worldSource.tiles.length,
        tiles: worldSource.tiles,
        spawn: worldSource.spawn || null,
        transports: worldSource.transports || [],
        enemyPlacements: worldSource.enemyPlacements || [],
      },
    ];
  }

  const tileIds = Object.keys(state.tileConfig);
  const seenIds = new Set();
  const defaultTile = state.selectedTileId || tileIds[0] || DEFAULT_TILES[0]?.id || '0';
  state.zones = zonesSource.map(zone => {
    const width = Number(zone.width) || (Array.isArray(zone.tiles?.[0]) ? zone.tiles[0].length : 0);
    const height = Number(zone.height) || (Array.isArray(zone.tiles) ? zone.tiles.length : 0);
    const tiles = Array.from({ length: height }, (_, y) => {
      const row = Array.isArray(zone.tiles) ? zone.tiles[y] || [] : [];
      return Array.from({ length: width }, (_, x) => {
        const value = row[x];
        if (value === undefined || value === null || value === '') {
          return String(defaultTile);
        }
        return String(value);
      });
    });
    let id = zone.id ? String(zone.id) : normalizeZoneId(zone.name || 'zone', seenIds);
    if (seenIds.has(id)) {
      id = normalizeZoneId(`${id}_zone`, seenIds);
    }
    seenIds.add(id);
    const transports = Array.isArray(zone.transports)
      ? zone.transports.map(transport => ({
          from: {
            x: Number(transport?.from?.x) || 0,
            y: Number(transport?.from?.y) || 0,
          },
          toZoneId: transport?.toZoneId ? String(transport.toZoneId) : '',
          to: {
            x: Number(transport?.to?.x) || 0,
            y: Number(transport?.to?.y) || 0,
          },
        }))
      : [];
    const enemyPlacements = Array.isArray(zone.enemyPlacements)
      ? zone.enemyPlacements.map(placement => ({
          x: Number(placement.x) || 0,
          y: Number(placement.y) || 0,
          templateId: placement.templateId ? String(placement.templateId) : '',
        }))
      : [];
    return {
      id,
      name: zone.name || id,
      width,
      height,
      tiles,
      transports,
      enemyPlacements,
      spawn: zone.spawn
        ? {
            x: Number(zone.spawn.x) || 0,
            y: Number(zone.spawn.y) || 0,
          }
        : null,
    };
  });
  state.selectedZoneId = state.zones[0]?.id || null;
  state.transportPlacement = null;
  renderTilePalette();
  renderZonesList();
  renderZoneEditor();
  updateTransportOptions();
  syncWorldForm();
  return true;
}

function handleLoadWorld() {
  const raw = worldOutput.value.trim();
  if (!raw) {
    alert('Paste a world JSON into the text area before loading.');
    return;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    alert(`Invalid JSON: ${err.message}`);
    return;
  }
  if (!applyWorldData(parsed)) {
    return;
  }
  const world = buildWorldData();
  worldOutput.value = world ? JSON.stringify([world], null, 2) : '';
}

generateWorldButton.addEventListener('click', generateWorldJson);
if (loadWorldButton) {
  loadWorldButton.addEventListener('click', handleLoadWorld);
}

function showError(message) {
  loadingEl.innerHTML = `
    <div class="loading-panel">
      <p>${message}</p>
    </div>
  `;
}

async function initialize() {
  try {
    initializeDefaults();
    attachWorldListeners();
    syncWorldForm();
    const [
      abilitiesResponse,
      equipmentResponse,
      assetsResponse,
      palettesResponse,
      templatesResponse,
    ] = await Promise.all([
      fetch('/abilities'),
      fetch('/equipment'),
      fetch('/dev/assets/sprites'),
      fetch('/dev/palettes'),
      fetch('/dev/enemy-templates'),
    ]);
    if (
      !abilitiesResponse.ok ||
      !equipmentResponse.ok ||
      !assetsResponse.ok ||
      !palettesResponse.ok ||
      !templatesResponse.ok
    ) {
      throw new Error('Failed to load catalogs');
    }
    const [abilities, equipment, assets, palettes, templates] = await Promise.all([
      abilitiesResponse.json(),
      equipmentResponse.json(),
      assetsResponse.json(),
      palettesResponse.json(),
      templatesResponse.json(),
    ]);
    state.abilities = Array.isArray(abilities) ? abilities : [];
    state.equipmentBySlot = flattenEquipment(equipment || {});
    state.spriteAssets = Array.isArray(assets) ? assets : [];
    renderSpriteAssets();

    const normalizedPalettes = Array.isArray(palettes)
      ? palettes.map(normalizePalette)
      : [];
    state.spritePalettes = normalizedPalettes;
    if (normalizedPalettes.length) {
      setActivePalette(normalizedPalettes[0], { skipSelect: true, skipZone: true });
      state.selectedPaletteId = normalizedPalettes[0]._id;
      renderPaletteSelect();
    } else {
      renderPaletteTiles();
      renderTilePalette();
      renderPaletteSelect();
    }

    const normalizedTemplates = Array.isArray(templates)
      ? templates.map(normalizeEnemyTemplate).filter(Boolean)
      : [];
    if (normalizedTemplates.length) {
      const byId = new Map(state.enemyTemplates.map(template => [template.id, template]));
      normalizedTemplates.forEach(template => {
        byId.set(template.id, template);
      });
      state.enemyTemplates = Array.from(byId.values());
      state.enemyTemplates.sort((a, b) => a.id.localeCompare(b.id));
    }
    populateAbilitySelect();
    renderEquipmentSlots();
    renderEnemyRotation();
    renderEnemyTemplateList();
    renderZonesList();
    renderZoneEditor();
    updateEnemyModeInfo();
    updateTransportOptions();
    builderWrapper.classList.remove('hidden');
    loadingEl.classList.add('hidden');
  } catch (err) {
    console.error(err);
    showError('Failed to load catalogs. Please refresh to try again.');
  }
}

initialize();
