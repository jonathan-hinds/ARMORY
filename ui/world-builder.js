const builderEl = document.getElementById('builder');
const loadingEl = document.getElementById('builder-loading');

const worldIdInput = document.getElementById('world-id');
const worldNameInput = document.getElementById('world-name');
const worldTileSizeInput = document.getElementById('world-tile-size');
const worldMoveCooldownInput = document.getElementById('world-move-cooldown');
const worldEnemyCountInput = document.getElementById('world-enemy-count');

const tilePaletteEl = document.getElementById('tile-palette');
const tileForm = document.getElementById('tile-form');
const tileIdInput = document.getElementById('tile-id');
const tileFillInput = document.getElementById('tile-fill');
const tileSpriteInput = document.getElementById('tile-sprite');

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

const generateWorldButton = document.getElementById('generate-world');
const loadWorldButton = document.getElementById('load-world');
const worldOutput = document.getElementById('world-output');

const DEFAULT_TILES = [
  { id: '0', fill: '#000000', sprite: '/assets/Sprite-0003.png' },
  { id: '1', fill: '#ffffff', sprite: '/assets/Sprite-0001.png' },
  { id: '2', fill: '#dcdcdc', sprite: '/assets/Sprite-0002.png' },
];

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
  world: {
    id: '',
    name: '',
    tileSize: 32,
    moveCooldownMs: 180,
    enemyCount: 6,
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

function initializeDefaults() {
  DEFAULT_TILES.forEach(tile => {
    state.palette[tile.id] = tile.fill;
    state.tileConfig[tile.id] = { sprite: tile.sprite, fill: tile.fill };
  });
  state.selectedTileId = DEFAULT_TILES[1]?.id || DEFAULT_TILES[0]?.id || null;
  renderTilePalette();
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
    token.addEventListener('click', () => {
      state.selectedTileId = id;
      renderTilePalette();
    });
    tilePaletteEl.appendChild(token);
  });
}

function handleTileFormSubmit(event) {
  event.preventDefault();
  const id = tileIdInput.value.trim();
  const fill = tileFillInput.value.trim() || '#ffffff';
  const sprite = tileSpriteInput.value.trim();
  if (!id) {
    alert('Tile ID is required.');
    return;
  }
  state.palette[id] = fill;
  state.tileConfig[id] = { sprite, fill };
  if (!state.selectedTileId) {
    state.selectedTileId = id;
  }
  renderTilePalette();
  renderZoneEditor();
  tileForm.reset();
}

tileForm.addEventListener('submit', handleTileFormSubmit);

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

function handleEnemyFormSubmit(event) {
  event.preventDefault();
  const id = enemyIdInput.value.trim();
  if (!id) {
    alert('Enemy template requires an ID.');
    return;
  }
  const template = {
    id,
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

  const existingIndex = state.enemyTemplates.findIndex(t => t.id === id);
  if (state.editingEnemyId && state.editingEnemyId !== id && existingIndex >= 0) {
    alert('Another template already uses that ID.');
    return;
  }
  if (existingIndex >= 0) {
    state.enemyTemplates.splice(existingIndex, 1, template);
  } else {
    state.enemyTemplates.push(template);
  }
  state.editingEnemyId = null;
  renderEnemyTemplateList();
  renderZoneEditor();
  updateEnemyModeInfo();
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

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.textContent = 'Delete';
    removeButton.addEventListener('click', () => {
      if (confirm(`Delete template "${template.name}"?`)) {
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
      enemyCount: Number.isFinite(Number(state.world.enemyCount))
        ? Number(state.world.enemyCount)
        : 0,
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
  if (world.zones.length === 1) {
    const zone = world.zones[0];
    world.tiles = zone.tiles;
    world.spawn = zone.spawn;
  }
  return world;
}

function generateWorldJson() {
  const world = buildWorldData();
  if (!world) {
    alert('Create at least one zone before generating.');
    return;
  }
  worldOutput.value = JSON.stringify(world, null, 2);
}

function syncWorldForm() {
  worldIdInput.value = state.world.id || '';
  worldNameInput.value = state.world.name || '';
  worldTileSizeInput.value = state.world.tileSize;
  worldMoveCooldownInput.value = state.world.moveCooldownMs;
  worldEnemyCountInput.value = state.world.enemyCount;
}

function applyWorldData(rawWorld) {
  if (!rawWorld || typeof rawWorld !== 'object') {
    alert('World JSON must be an object.');
    return;
  }

  state.world.id = rawWorld.id || '';
  state.world.name = rawWorld.name || '';
  state.world.tileSize = Number(rawWorld.tileSize) || state.world.tileSize;
  state.world.moveCooldownMs = Number(rawWorld.moveCooldownMs) || state.world.moveCooldownMs;
  const enemyCount = Number(rawWorld?.encounters?.enemyCount);
  if (Number.isInteger(enemyCount) && enemyCount > 0) {
    state.world.enemyCount = enemyCount;
  }

  state.palette = {};
  state.tileConfig = {};

  const palette = rawWorld.palette && typeof rawWorld.palette === 'object' ? rawWorld.palette : {};
  Object.entries(palette).forEach(([key, value]) => {
    state.palette[String(key)] = value;
  });

  const tileConfig =
    rawWorld.tileConfig && typeof rawWorld.tileConfig === 'object' ? rawWorld.tileConfig : {};
  Object.entries(tileConfig).forEach(([key, value]) => {
    if (!value || typeof value !== 'object') return;
    state.tileConfig[String(key)] = {
      sprite: value.sprite || '',
      fill: value.fill || state.palette[String(key)] || '#ffffff',
    };
  });

  if (!Object.keys(state.tileConfig).length) {
    DEFAULT_TILES.forEach(tile => {
      state.palette[tile.id] = tile.fill;
      state.tileConfig[tile.id] = { sprite: tile.sprite, fill: tile.fill };
    });
  } else {
    Object.keys(state.tileConfig).forEach(id => {
      if (!state.palette[id] && state.tileConfig[id].fill) {
        state.palette[id] = state.tileConfig[id].fill;
      }
    });
  }

  const tileIds = Object.keys(state.tileConfig);
  if (!tileIds.includes(state.selectedTileId)) {
    state.selectedTileId = tileIds[0] || null;
  }

  const templates = Array.isArray(rawWorld?.encounters?.templates)
    ? rawWorld.encounters.templates
    : [];
  state.enemyTemplates = templates.map(template => {
    const attributes = template.attributes || {};
    return {
      id: template.id || '',
      name: template.name || template.id || '',
      basicType: template.basicType || 'melee',
      level: Number(template.level) || 1,
      attributes: {
        strength: Number(attributes.strength ?? attributes.STR ?? attributes.str ?? 0) || 0,
        stamina: Number(attributes.stamina ?? attributes.STA ?? attributes.sta ?? 0) || 0,
        agility: Number(attributes.agility ?? attributes.AGI ?? attributes.agi ?? 0) || 0,
        intellect: Number(attributes.intellect ?? attributes.INT ?? attributes.int ?? 0) || 0,
        wisdom: Number(attributes.wisdom ?? attributes.WIS ?? attributes.wis ?? 0) || 0,
      },
      rotation: Array.isArray(template.rotation)
        ? template.rotation.map(value => {
            const numeric = Number(value);
            return Number.isNaN(numeric) ? value : numeric;
          })
        : [],
      equipment: { ...(template.equipment || {}) },
      xpPct: Number(template.xpPct) || 0,
      gold: Number(template.gold) || 0,
      spawnChance: Number(template.spawnChance) || 0,
    };
  });
  state.selectedEnemyTemplateId = null;
  state.enemyFormRotation = [];
  state.editingEnemyId = null;
  enemyForm.reset();
  renderEnemyRotation();
  updateEquipmentSelection({});
  renderEnemyTemplateList();
  updateEnemyModeInfo();

  const rawZones = Array.isArray(rawWorld.zones) ? rawWorld.zones.slice() : [];
  let zonesSource = rawZones;
  if (!zonesSource.length && Array.isArray(rawWorld.tiles)) {
    zonesSource = [
      {
        id: rawWorld.id || 'zone',
        name: rawWorld.name || rawWorld.id || 'Zone',
        width: Array.isArray(rawWorld.tiles[0]) ? rawWorld.tiles[0].length : rawWorld.width,
        height: rawWorld.tiles.length,
        tiles: rawWorld.tiles,
        spawn: rawWorld.spawn || null,
        transports: rawWorld.transports || [],
        enemyPlacements: rawWorld.enemyPlacements || [],
      },
    ];
  }

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
  applyWorldData(parsed);
  const world = buildWorldData();
  worldOutput.value = world ? JSON.stringify(world, null, 2) : '';
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
    const [abilitiesResponse, equipmentResponse] = await Promise.all([
      fetch('/abilities'),
      fetch('/equipment'),
    ]);
    if (!abilitiesResponse.ok || !equipmentResponse.ok) {
      throw new Error('Failed to load catalogs');
    }
    const abilities = await abilitiesResponse.json();
    const equipment = await equipmentResponse.json();
    state.abilities = Array.isArray(abilities) ? abilities : [];
    state.equipmentBySlot = flattenEquipment(equipment || {});
    populateAbilitySelect();
    renderEquipmentSlots();
    renderEnemyRotation();
    renderEnemyTemplateList();
    renderZonesList();
    renderZoneEditor();
    updateEnemyModeInfo();
    updateTransportOptions();
    builderEl.classList.remove('hidden');
    loadingEl.classList.add('hidden');
  } catch (err) {
    console.error(err);
    showError('Failed to load catalogs. Please refresh to try again.');
  }
}

initialize();
