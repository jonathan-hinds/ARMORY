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
const tileToolControls = document.getElementById('tile-tool-controls');
const tileToolButtons = Array.from(document.querySelectorAll('.tile-tool-button'));
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
const enemySpriteSelect = document.getElementById('enemy-sprite-select');
const enemySpritePreview = document.getElementById('enemy-sprite-preview');
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

const colorProbeEl = document.createElement('span');

function normalizeFillColor(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  colorProbeEl.style.color = '';
  colorProbeEl.style.color = trimmed;
  return colorProbeEl.style.color ? trimmed : '';
}

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

const RESOURCE_LABELS = { health: 'HP', mana: 'MP', stamina: 'Stamina' };
const CHANCE_LABELS = {
  critchance: 'Crit Chance',
  blockchance: 'Block Chance',
  dodgechance: 'Dodge Chance',
  hitchance: 'Hit Chance',
};

function titleCase(value) {
  if (!value) return '';
  return String(value)
    .split(/[\s_]+/)
    .map(part => (part ? part.charAt(0).toUpperCase() + part.slice(1) : ''))
    .join(' ')
    .trim();
}

function statLabel(stat) {
  if (!stat) return '';
  return stat.charAt(0).toUpperCase() + stat.slice(1);
}

function slotLabel(slot) {
  if (!slot) return '';
  return EQUIPMENT_SLOT_LABELS[slot] || titleCase(slot);
}

function formatNumericValue(value) {
  if (!Number.isFinite(value)) return '';
  if (Math.abs(value) >= 100 || Number.isInteger(value)) {
    return String(Math.round(value));
  }
  if (Math.abs(value) >= 10) {
    return value.toFixed(1).replace(/\.0$/, '');
  }
  return value.toFixed(2).replace(/\.00$/, '').replace(/\.0$/, '');
}

function formatPercentValue(value, { fromFraction = false } = {}) {
  if (!Number.isFinite(value)) return '';
  const normalized = fromFraction ? value * 100 : value;
  const rounded = Math.abs(normalized - Math.round(normalized)) < 1e-6
    ? Math.round(normalized)
    : Number(normalized.toFixed(1));
  return `${rounded}%`;
}

function formatValue(value, key = '') {
  if (value == null) return '';
  if (typeof value === 'number') {
    const lowered = key ? key.toLowerCase() : '';
    if (lowered.includes('percent') || lowered.includes('chance')) {
      return formatPercentValue(value, { fromFraction: value > 0 && value <= 1 });
    }
    if (lowered.includes('amount') && Math.abs(value) < 1 && value > 0) {
      return formatPercentValue(value, { fromFraction: true });
    }
    return formatNumericValue(value);
  }
  if (typeof value === 'string') {
    if (key && key.toLowerCase().includes('type')) {
      return titleCase(value);
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(entry => formatValue(entry)).filter(Boolean).join(', ');
  }
  if (typeof value === 'object') {
    return Object.entries(value)
      .map(([nestedKey, nestedValue]) => `${titleCase(nestedKey)}: ${formatValue(nestedValue, nestedKey)}`)
      .join(', ');
  }
  return String(value);
}

function formatAbilityCost(ability) {
  if (!ability || typeof ability !== 'object') return 'None';
  const costs = Array.isArray(ability.costs) && ability.costs.length
    ? ability.costs
    : ability.costType
    ? [{ type: ability.costType, value: ability.costValue }]
    : [];
  if (!costs.length) return 'None';
  const parts = costs
    .map(entry => {
      const value = Number.isFinite(entry.value) ? entry.value : ability.costValue;
      const type = typeof entry.type === 'string' ? entry.type.toLowerCase() : '';
      const label = RESOURCE_LABELS[type] || titleCase(type || 'Resource');
      const amountText = Number.isFinite(value) ? formatNumericValue(value) : '';
      return amountText ? `${amountText} ${label}` : label;
    })
    .filter(Boolean);
  return parts.length ? parts.join(', ') : 'None';
}

function formatAbilityScaling(ability) {
  const scaling = Array.isArray(ability?.scaling) ? ability.scaling : [];
  if (!scaling.length) return '';
  return scaling.map(statLabel).join(', ');
}

function formatAbilityEffect(effect) {
  if (!effect || typeof effect !== 'object') return '';
  const { type, chance, ...rest } = effect;
  const detailText = Object.entries(rest)
    .map(([key, value]) => `${titleCase(key)}: ${formatValue(value, key)}`)
    .join(', ');
  const base = titleCase(type || 'Effect');
  if (Number.isFinite(chance) && chance > 0) {
    const chanceText = formatPercentValue(chance, { fromFraction: chance <= 1 });
    return detailText ? `${chanceText} chance • ${base} (${detailText})` : `${chanceText} chance • ${base}`;
  }
  return detailText ? `${base} (${detailText})` : base;
}

function formatConditionalCost(entry) {
  if (!entry || typeof entry !== 'object') return '';
  const label = entry.type ? titleCase(entry.type) : 'Condition';
  const parts = [];
  if (Array.isArray(entry.resources) && entry.resources.length) {
    const resources = entry.resources
      .map(resource => RESOURCE_LABELS[resource] || titleCase(resource))
      .join(', ');
    parts.push(`Resources: ${resources}`);
  }
  if (entry.description) {
    parts.push(entry.description);
  }
  return parts.length ? `${label} – ${parts.join('; ')}` : label;
}

function createTooltipGrid(pairs = []) {
  const container = document.createElement('div');
  container.className = 'tooltip-grid';
  pairs
    .filter(pair => pair && pair[1] != null && pair[1] !== '')
    .forEach(([label, value]) => {
      const l = document.createElement('div');
      l.className = 'label';
      l.textContent = label;
      container.appendChild(l);
      const v = document.createElement('div');
      v.innerHTML = value;
      container.appendChild(v);
    });
  return container;
}

function createAbilityTooltip(ability) {
  if (!ability) {
    return createTooltipGrid([
      ['Ability', 'Unknown ability'],
    ]);
  }
  const pairs = [
    ['Name', ability.name || ability.id],
    ['ID', ability.id],
  ];
  if (ability.school) {
    pairs.push(['School', titleCase(ability.school)]);
  }
  pairs.push(['Cost', formatAbilityCost(ability)]);
  if (Number.isFinite(ability.cooldown)) {
    pairs.push(['Cooldown', `${formatNumericValue(ability.cooldown)}s`]);
  }
  const scalingText = formatAbilityScaling(ability);
  if (scalingText) {
    pairs.push(['Scaling', scalingText]);
  }
  if (ability.description) {
    pairs.push(['Description', ability.description]);
  }
  if (Array.isArray(ability.effects) && ability.effects.length) {
    pairs.push(['Effects', ability.effects.map(formatAbilityEffect).join('<br/>')]);
  }
  if (Array.isArray(ability.conditionalCosts) && ability.conditionalCosts.length) {
    pairs.push(['Conditional Costs', ability.conditionalCosts.map(formatConditionalCost).join('<br/>')]);
  }
  return createTooltipGrid(pairs);
}

function formatDamageRange(range) {
  if (!range || typeof range !== 'object') return '';
  const min = Number.isFinite(range.min) ? range.min : null;
  const max = Number.isFinite(range.max) ? range.max : null;
  if (min == null && max == null) return '';
  if (min != null && max != null && min !== max) {
    return `${formatNumericValue(min)}-${formatNumericValue(max)}`;
  }
  const value = max != null ? max : min;
  return formatNumericValue(value);
}

function formatItemScaling(scaling) {
  if (!scaling || typeof scaling !== 'object') return '';
  const entries = Object.entries(scaling)
    .filter(([, letter]) => letter)
    .map(([stat, letter]) => `${statLabel(stat)} ${String(letter).toUpperCase()}`);
  return entries.join(', ');
}

function formatBonusEntries(bonuses, { percent = false } = {}) {
  if (!bonuses || typeof bonuses !== 'object') return '';
  const entries = Object.entries(bonuses)
    .filter(([, value]) => Number.isFinite(value) && value !== 0)
    .map(([stat, value]) => {
      const label = statLabel(stat);
      if (percent) {
        return `${label} ${formatPercentValue(value, { fromFraction: value > 0 && value <= 1 })}`;
      }
      return `${label} ${formatNumericValue(value)}`;
    });
  return entries.join(', ');
}

function formatResourceBonuses(bonuses) {
  if (!bonuses || typeof bonuses !== 'object') return '';
  const entries = Object.entries(bonuses)
    .filter(([, value]) => Number.isFinite(value) && value !== 0)
    .map(([resource, value]) => {
      const label = RESOURCE_LABELS[resource] || titleCase(resource);
      return `${label} ${formatNumericValue(value)}`;
    });
  return entries.join(', ');
}

function formatChanceBonuses(bonuses) {
  if (!bonuses || typeof bonuses !== 'object') return '';
  const entries = Object.entries(bonuses)
    .filter(([, value]) => Number.isFinite(value) && value !== 0)
    .map(([stat, value]) => {
      const label = CHANCE_LABELS[stat.toLowerCase()] || titleCase(stat);
      return `${label} ${formatPercentValue(value, { fromFraction: value > 0 && value <= 1 })}`;
    });
  return entries.join(', ');
}

function formatResistances(resistances) {
  if (!resistances || typeof resistances !== 'object') return '';
  const entries = Object.entries(resistances)
    .filter(([, value]) => Number.isFinite(value) && value !== 0)
    .map(([type, value]) => `${titleCase(type)} ${formatPercentValue(value, { fromFraction: value > 0 && value <= 1 })}`);
  return entries.join(', ');
}

function isUseableItem(item) {
  return item && item.slot === 'useable';
}

function createItemTooltip(item) {
  if (!item) {
    return createTooltipGrid([
      ['Item', 'None selected'],
    ]);
  }
  const pairs = [
    ['Name', item.name || item.id],
    ['ID', item.id],
  ];
  if (item.rarity) {
    pairs.push(['Rarity', titleCase(item.rarity)]);
  }
  if (item.slot) {
    pairs.push(['Slot', slotLabel(item.slot)]);
  }
  if (item.type) {
    pairs.push(['Type', titleCase(item.type)]);
  }
  if (Number.isFinite(item.cost)) {
    pairs.push(['Cost', `${formatNumericValue(item.cost)} Gold`]);
  }
  if (item.damageType) {
    pairs.push(['Damage Type', titleCase(item.damageType)]);
  }
  if (item.baseDamage) {
    const range = formatDamageRange(item.baseDamage);
    if (range) {
      pairs.push(['Base Damage', range]);
    }
  }
  const scalingText = formatItemScaling(item.scaling);
  if (scalingText) {
    pairs.push(['Scaling', scalingText]);
  }
  const attrText = formatBonusEntries(item.attributeBonuses);
  if (attrText) {
    pairs.push(['Attributes', attrText]);
  }
  const resourceText = formatResourceBonuses(item.resourceBonuses);
  if (resourceText) {
    pairs.push(['Resources', resourceText]);
  }
  const resistText = formatResistances(item.resistances);
  if (resistText) {
    pairs.push(['Resistances', resistText]);
  }
  const chanceText = formatChanceBonuses(item.chanceBonuses);
  if (chanceText) {
    pairs.push(['Chance', chanceText]);
  }
  if (isUseableItem(item)) {
    if (item.useTrigger) {
      pairs.push(['Use Trigger', titleCase(item.useTrigger)]);
    }
    if (item.useEffect) {
      pairs.push(['Use Effect', formatAbilityEffect(item.useEffect)]);
    }
    if (item.useDuration) {
      pairs.push(['Duration', titleCase(item.useDuration)]);
    }
    if (typeof item.useConsumed === 'boolean') {
      pairs.push(['Consumed', item.useConsumed ? 'Yes' : 'No']);
    }
  }
  if (item.description) {
    pairs.push(['Description', item.description]);
  }
  return createTooltipGrid(pairs);
}

function formatItemSummary(item) {
  if (!item) return '';
  const parts = [];
  if (item.damageType && item.baseDamage) {
    const range = formatDamageRange(item.baseDamage);
    if (range) {
      parts.push(`${titleCase(item.damageType)} ${range}`);
    }
  }
  const scalingText = formatItemScaling(item.scaling);
  if (scalingText) {
    parts.push(`Scaling ${scalingText}`);
  }
  const attrText = formatBonusEntries(item.attributeBonuses);
  if (attrText) {
    parts.push(`Stats ${attrText}`);
  }
  const resourceText = formatResourceBonuses(item.resourceBonuses);
  if (resourceText) {
    parts.push(`Resources ${resourceText}`);
  }
  const resistText = formatResistances(item.resistances);
  if (resistText) {
    parts.push(`Resist ${resistText}`);
  }
  const chanceText = formatChanceBonuses(item.chanceBonuses);
  if (chanceText) {
    parts.push(`Chance ${chanceText}`);
  }
  if (isUseableItem(item) && item.useEffect) {
    parts.push(`Use: ${formatAbilityEffect(item.useEffect)}`);
  }
  if (item.description) {
    parts.push(item.description);
  }
  return parts.join(' • ');
}

function createEquipmentCard(item) {
  const card = document.createElement('div');
  card.className = 'shop-item-card inventory-item-card builder-item-card';

  const header = document.createElement('div');
  header.className = 'card-header';
  const name = document.createElement('div');
  name.className = 'card-name';
  name.textContent = item?.name || 'Unknown Item';
  header.appendChild(name);
  const rarity = document.createElement('div');
  rarity.className = 'card-rarity';
  rarity.textContent = item?.rarity || 'Common';
  header.appendChild(rarity);
  card.appendChild(header);

  if (item) {
    const tags = document.createElement('div');
    tags.className = 'card-tags';
    if (item.slot) {
      const slotTag = document.createElement('span');
      slotTag.className = 'card-tag';
      slotTag.textContent = slotLabel(item.slot);
      tags.appendChild(slotTag);
    }
    if (item.type && !isUseableItem(item)) {
      const typeTag = document.createElement('span');
      typeTag.className = 'card-tag';
      typeTag.textContent = titleCase(item.type);
      tags.appendChild(typeTag);
    }
    if (isUseableItem(item) && item.category) {
      const categoryTag = document.createElement('span');
      categoryTag.className = 'card-tag';
      categoryTag.textContent = titleCase(item.category);
      tags.appendChild(categoryTag);
    }
    if (tags.childElementCount) {
      card.appendChild(tags);
    }
    const meta = document.createElement('div');
    meta.className = 'card-description inventory-card-meta';
    meta.textContent = formatItemSummary(item) || 'No additional effects.';
    card.appendChild(meta);
  } else {
    const placeholder = document.createElement('div');
    placeholder.className = 'equipment-card-placeholder';
    placeholder.textContent = 'No item selected';
    card.appendChild(placeholder);
  }

  if (typeof attachTooltip === 'function' && item) {
    attachTooltip(card, () => createItemTooltip(item));
  }

  return card;
}

function renderEquipmentPreview(slot, itemId) {
  const preview = enemyEquipmentSlotsContainer.querySelector(
    `.equipment-slot-preview[data-slot="${slot}"]`
  );
  if (!preview) return;
  preview.innerHTML = '';
  if (!itemId) {
    const placeholder = document.createElement('div');
    placeholder.className = 'equipment-card-placeholder';
    placeholder.textContent = 'None equipped';
    preview.appendChild(placeholder);
    return;
  }
  const items = state.equipmentBySlot.get(slot) || [];
  const item = items.find(entry => entry.id === itemId);
  const card = createEquipmentCard(item);
  preview.appendChild(card);
}

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
  tileTool: 'brush',
  transportPlacement: null,
  enemyTemplates: [],
  selectedEnemyTemplateId: null,
  enemyFormRotation: [],
  editingEnemyId: null,
};

const imageCache = new Map();

const zoneCanvasState = {
  baseCanvas: null,
  overlayCanvas: null,
  baseCtx: null,
  overlayCtx: null,
  zoneId: null,
  cellSize: 32,
  pixelRatio: 1,
  pointerId: null,
  dragging: false,
  startCell: null,
  lastCell: null,
  previewRect: null,
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
    const hasSprite = Boolean(config.sprite);
    if (hasSprite) {
      token.classList.add('has-sprite');
      token.style.backgroundImage = `url(${config.sprite})`;
      token.style.backgroundSize = 'cover';
      token.style.backgroundPosition = 'center';
      token.style.backgroundColor = normalizeFillColor(config.fill) || 'transparent';
    } else {
      token.style.background = normalizeFillColor(config.fill) || '#ffffff';
      token.style.backgroundImage = '';
    }
    if (state.selectedTileId === id) {
      token.classList.add('active');
    }
    const fillLabel = normalizeFillColor(config.fill);
    token.innerHTML = `<strong>${id}</strong><span>${fillLabel || (hasSprite ? '' : '#ffffff')}</span>`;
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
          const rawFill = typeof tile.fill === 'string' ? tile.fill : '';
          const fill = normalizeFillColor(rawFill) || (sprite ? '' : '#ffffff');
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
    const fill = normalizeFillColor(tile.fill) || (tile.sprite ? '' : '#ffffff');
    state.palette[tile.tileId] = fill;
    state.tileConfig[tile.tileId] = {
      sprite: tile.sprite,
      fill,
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
    const fillColor = normalizeFillColor(tile.fill);
    if (tile.sprite) {
      const img = document.createElement('img');
      img.src = tile.sprite;
      img.alt = tile.tileId;
      img.loading = 'lazy';
      swatch.appendChild(img);
    } else {
      swatch.style.background = fillColor || '#ffffff';
    }

    const label = document.createElement('span');
    label.textContent = `${tile.tileId} • ${tile.walkable ? 'Walkable' : 'Blocked'} • ${
      fillColor || (tile.sprite ? 'Sprite' : '#ffffff')
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
    renderEnemySpriteOptions();
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
  renderEnemySpriteOptions();
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

function renderEnemySpriteOptions(selectedValue = null) {
  if (!enemySpriteSelect) return;
  const previousValue =
    selectedValue != null ? selectedValue : enemySpriteSelect.value;
  enemySpriteSelect.innerHTML = '';
  const noneOption = document.createElement('option');
  noneOption.value = '';
  noneOption.textContent = 'None (Default)';
  enemySpriteSelect.appendChild(noneOption);
  let hasMatch = false;
  state.spriteAssets.forEach(asset => {
    const option = document.createElement('option');
    option.value = asset.url;
    option.textContent = asset.id;
    enemySpriteSelect.appendChild(option);
    if (previousValue && asset.url === previousValue) {
      hasMatch = true;
    }
  });
  if (previousValue && !hasMatch) {
    const customOption = document.createElement('option');
    customOption.value = previousValue;
    customOption.textContent = previousValue;
    enemySpriteSelect.appendChild(customOption);
    hasMatch = true;
  }
  enemySpriteSelect.value = hasMatch ? previousValue : '';
  updateEnemySpritePreview(enemySpriteSelect.value);
}

function updateEnemySpritePreview(assetUrl) {
  if (!enemySpritePreview) return;
  enemySpritePreview.innerHTML = '';
  if (assetUrl) {
    const img = document.createElement('img');
    img.src = assetUrl;
    img.alt = 'Enemy sprite preview';
    img.loading = 'lazy';
    enemySpritePreview.appendChild(img);
  } else {
    const message = document.createElement('span');
    message.textContent = 'No sprite selected';
    enemySpritePreview.appendChild(message);
  }
}

function loadTileIntoSpriteForm(tile) {
  if (!spriteForm) return;
  spriteTileIdInput.value = tile.tileId;
  spriteFillInput.value = normalizeFillColor(tile.fill);
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
  const fill = normalizeFillColor(spriteFillInput.value);
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
  if (tileToolControls) {
    tileToolControls.classList.toggle('hidden', mode !== 'tile');
  }
  if (mode !== 'tile' && zoneCanvasState.previewRect) {
    zoneCanvasState.previewRect = null;
    refreshZoneOverlay();
  }
  updateZoneCanvasCursor();
}

modeButtons.forEach(button => {
  button.addEventListener('click', () => {
    setEditMode(button.dataset.mode);
  });
});

function setTileTool(tool) {
  if (!tool) return;
  state.tileTool = tool;
  tileToolButtons.forEach(button => {
    button.classList.toggle('active', button.dataset.tool === tool);
  });
  if (tool !== 'rectangle' && zoneCanvasState.previewRect) {
    zoneCanvasState.previewRect = null;
    refreshZoneOverlay();
  }
}

tileToolButtons.forEach(button => {
  button.addEventListener('click', () => {
    setTileTool(button.dataset.tool);
  });
});

setTileTool(state.tileTool);

setEditMode(state.editMode);

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
    return false;
  }
  const existingIndex = zone.enemyPlacements.findIndex(p => p.x === x && p.y === y);
  if (existingIndex >= 0) {
    const existing = zone.enemyPlacements[existingIndex];
    if (existing.templateId === templateId) {
      zone.enemyPlacements.splice(existingIndex, 1);
    } else {
      existing.templateId = templateId;
    }
    return true;
  }
  zone.enemyPlacements.push({ x, y, templateId });
  return true;
}

function handleTransportPlacement(zone, x, y) {
  if (!ensureTransportPlacement()) {
    return false;
  }
  const placement = state.transportPlacement;
  if (placement.zoneId === zone.id && placement.x === x && placement.y === y) {
    alert('Transport cannot target the same tile.');
    return false;
  }
  const existingIndex = zone.transports.findIndex(t => t.from.x === x && t.from.y === y);
  const transport = {
    from: { x, y },
    toZoneId: placement.zoneId,
    to: { x: placement.x, y: placement.y },
  };
  if (existingIndex >= 0) {
    const existing = zone.transports[existingIndex];
    const unchanged =
      existing.toZoneId === transport.toZoneId &&
      existing.to.x === transport.to.x &&
      existing.to.y === transport.to.y;
    if (unchanged) {
      return false;
    }
    zone.transports.splice(existingIndex, 1, transport);
  } else {
    zone.transports.push(transport);
  }
  return true;
}

function handleSpawnPlacement(zone, x, y) {
  if (zone.spawn && zone.spawn.x === x && zone.spawn.y === y) {
    return false;
  }
  zone.spawn = { x, y };
  return true;
}

function getFallbackTileId() {
  const tileIds = Object.keys(state.tileConfig);
  if (tileIds.length) {
    return tileIds[0];
  }
  if (state.selectedTileId && state.tileConfig[state.selectedTileId]) {
    return state.selectedTileId;
  }
  return null;
}

function applyTileBrush(zone, x, y, tileId) {
  if (!tileId) return false;
  if (zone.tiles[y][x] === tileId) {
    return false;
  }
  zone.tiles[y][x] = tileId;
  return true;
}

function applyTileFill(zone, startX, startY, tileId) {
  if (!tileId) return false;
  const targetId = zone.tiles[startY][startX];
  if (targetId === tileId) {
    return false;
  }
  const width = zone.width;
  const height = zone.height;
  const visited = Array.from({ length: height }, () => Array(width).fill(false));
  const stack = [[startX, startY]];
  let changed = false;
  while (stack.length) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    if (visited[y][x]) continue;
    if (zone.tiles[y][x] !== targetId) continue;
    visited[y][x] = true;
    zone.tiles[y][x] = tileId;
    changed = true;
    stack.push([x + 1, y]);
    stack.push([x - 1, y]);
    stack.push([x, y + 1]);
    stack.push([x, y - 1]);
  }
  return changed;
}

function applyTileRectangle(zone, start, end, tileId) {
  if (!tileId || !start || !end) return false;
  const minX = Math.max(0, Math.min(start.x, end.x));
  const maxX = Math.min(zone.width - 1, Math.max(start.x, end.x));
  const minY = Math.max(0, Math.min(start.y, end.y));
  const maxY = Math.min(zone.height - 1, Math.max(start.y, end.y));
  let changed = false;
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (zone.tiles[y][x] !== tileId) {
        zone.tiles[y][x] = tileId;
        changed = true;
      }
    }
  }
  return changed;
}

function applySecondaryAction(zone, x, y) {
  switch (state.editMode) {
    case 'enemy': {
      const before = zone.enemyPlacements.length;
      zone.enemyPlacements = zone.enemyPlacements.filter(p => !(p.x === x && p.y === y));
      return zone.enemyPlacements.length !== before;
    }
    case 'transport': {
      const index = zone.transports.findIndex(t => t.from.x === x && t.from.y === y);
      if (index >= 0) {
        zone.transports.splice(index, 1);
        return true;
      }
      return false;
    }
    case 'spawn': {
      if (zone.spawn && zone.spawn.x === x && zone.spawn.y === y) {
        zone.spawn = null;
        return true;
      }
      return false;
    }
    case 'tile': {
      const fallback = getFallbackTileId();
      return applyTileBrush(zone, x, y, fallback);
    }
    default:
      return false;
  }
}

function handleNonTilePrimaryAction(zone, x, y) {
  switch (state.editMode) {
    case 'enemy':
      return handleEnemyPlacement(zone, x, y);
    case 'transport':
      return handleTransportPlacement(zone, x, y);
    case 'spawn':
      return handleSpawnPlacement(zone, x, y);
    default:
      return false;
  }
}

function loadImageAsset(url, onLoad) {
  if (!url) return null;
  let entry = imageCache.get(url);
  if (!entry) {
    const image = new Image();
    entry = { image, loaded: false, error: false, callbacks: [] };
    image.onload = () => {
      entry.loaded = true;
      entry.callbacks.splice(0).forEach(cb => cb(image));
    };
    image.onerror = () => {
      entry.error = true;
      entry.callbacks.length = 0;
    };
    image.src = url;
    imageCache.set(url, entry);
  }
  if (entry.loaded) {
    if (onLoad) onLoad(entry.image);
  } else if (onLoad && !entry.error) {
    entry.callbacks.push(onLoad);
  }
  return entry.image;
}

function drawZoneTiles(zone) {
  if (!zoneCanvasState.baseCtx || !zone) return;
  const ctx = zoneCanvasState.baseCtx;
  const cellSize = zoneCanvasState.cellSize;
  const width = zone.width * cellSize;
  const height = zone.height * cellSize;
  const ratio = zoneCanvasState.pixelRatio || 1;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = false;
  for (let y = 0; y < zone.height; y += 1) {
    for (let x = 0; x < zone.width; x += 1) {
      const tileId = zone.tiles[y][x];
      const tileConfig = state.tileConfig[tileId] || {};
      const px = x * cellSize;
      const py = y * cellSize;
      const fillColor = normalizeFillColor(tileConfig.fill);
      const hasSprite = Boolean(tileConfig.sprite);
      const shouldFill = !hasSprite || Boolean(fillColor);
      if (shouldFill) {
        ctx.fillStyle = fillColor || '#ffffff';
        ctx.fillRect(px, py, cellSize, cellSize);
      }
      if (hasSprite) {
        const image = loadImageAsset(tileConfig.sprite, () => {
          if (zoneCanvasState.zoneId === zone.id) {
            drawZoneTiles(zone);
          }
        });
        if (image && image.complete && image.naturalWidth) {
          ctx.drawImage(image, px, py, cellSize, cellSize);
        }
      } else {
        ctx.fillStyle = '#111';
        ctx.font = `${Math.max(10, Math.floor(cellSize * 0.35))}px 'Courier New', monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(tileId ?? '', px + cellSize / 2, py + cellSize / 2);
      }
      if (tileConfig.walkable === false) {
        ctx.save();
        ctx.strokeStyle = 'rgba(180, 30, 30, 0.85)';
        ctx.lineWidth = Math.max(1, Math.floor(cellSize * 0.1));
        ctx.beginPath();
        ctx.moveTo(px + 2, py + 2);
        ctx.lineTo(px + cellSize - 2, py + cellSize - 2);
        ctx.moveTo(px + cellSize - 2, py + 2);
        ctx.lineTo(px + 2, py + cellSize - 2);
        ctx.stroke();
        ctx.restore();
      }
    }
  }
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= zone.width; x += 1) {
    const pos = x * cellSize + 0.5;
    ctx.moveTo(pos, 0);
    ctx.lineTo(pos, height);
  }
  for (let y = 0; y <= zone.height; y += 1) {
    const pos = y * cellSize + 0.5;
    ctx.moveTo(0, pos);
    ctx.lineTo(width, pos);
  }
  ctx.stroke();
}

function drawZoneOverlay(zone) {
  if (!zoneCanvasState.overlayCtx || !zone) return;
  const ctx = zoneCanvasState.overlayCtx;
  const cellSize = zoneCanvasState.cellSize;
  const width = zone.width * cellSize;
  const height = zone.height * cellSize;
  const ratio = zoneCanvasState.pixelRatio || 1;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = false;

  const drawText = (text, px, py, align = 'center', baseline = 'middle', color = '#111') => {
    ctx.save();
    ctx.fillStyle = color;
    ctx.font = `${Math.max(12, Math.floor(cellSize * 0.4))}px 'Courier New', monospace`;
    ctx.textAlign = align;
    ctx.textBaseline = baseline;
    ctx.fillText(text, px, py);
    ctx.restore();
  };

  zone.enemyPlacements.forEach(placement => {
    const px = placement.x * cellSize;
    const py = placement.y * cellSize;
    const template = state.enemyTemplates.find(t => t.id === placement.templateId);
    if (template && template.sprite) {
      const image = loadImageAsset(template.sprite, () => {
        if (zoneCanvasState.zoneId === zone.id) {
          drawZoneOverlay(zone);
        }
      });
      if (image && image.complete && image.naturalWidth) {
        const margin = Math.max(2, Math.floor(cellSize * 0.15));
        ctx.drawImage(image, px + margin, py + margin, cellSize - margin * 2, cellSize - margin * 2);
        return;
      }
    }
    drawText('E', px + cellSize - 4, py + cellSize - 4, 'right', 'bottom');
  });

  zone.transports.forEach(transport => {
    const px = transport.from.x * cellSize;
    const py = transport.from.y * cellSize;
    drawText('⇄', px + cellSize - 4, py + 4, 'right', 'top');
  });

  if (zone.spawn) {
    const px = zone.spawn.x * cellSize;
    const py = zone.spawn.y * cellSize;
    drawText('S', px + 4, py + 4, 'left', 'top');
  }

  if (
    zoneCanvasState.previewRect &&
    state.editMode === 'tile' &&
    state.tileTool === 'rectangle' &&
    zoneCanvasState.previewRect.start &&
    zoneCanvasState.previewRect.end
  ) {
    const { start, end } = zoneCanvasState.previewRect;
    const minX = Math.max(0, Math.min(start.x, end.x));
    const maxX = Math.min(zone.width - 1, Math.max(start.x, end.x));
    const minY = Math.max(0, Math.min(start.y, end.y));
    const maxY = Math.min(zone.height - 1, Math.max(start.y, end.y));
    const rectX = minX * cellSize;
    const rectY = minY * cellSize;
    const rectW = (maxX - minX + 1) * cellSize;
    const rectH = (maxY - minY + 1) * cellSize;
    ctx.save();
    ctx.fillStyle = 'rgba(80, 160, 255, 0.2)';
    ctx.fillRect(rectX, rectY, rectW, rectH);
    ctx.strokeStyle = 'rgba(80, 160, 255, 0.75)';
    ctx.lineWidth = 2;
    ctx.strokeRect(rectX + 1, rectY + 1, rectW - 2, rectH - 2);
    ctx.restore();
  }
}

function refreshZoneTiles() {
  const zone = getSelectedZone();
  if (!zone || zoneCanvasState.zoneId !== zone?.id) {
    renderZoneGrid();
    return;
  }
  drawZoneTiles(zone);
  refreshZoneOverlay();
}

function refreshZoneOverlay() {
  const zone = getSelectedZone();
  if (!zone || zoneCanvasState.zoneId !== zone?.id) {
    return;
  }
  drawZoneOverlay(zone);
}

function updateZoneCanvasCursor() {
  if (!zoneCanvasState.overlayCanvas) return;
  zoneCanvasState.overlayCanvas.classList.toggle('is-non-tile', state.editMode !== 'tile');
  if (state.editMode === 'tile') {
    zoneCanvasState.overlayCanvas.style.cursor = 'crosshair';
  } else {
    zoneCanvasState.overlayCanvas.style.cursor = 'pointer';
  }
}

function resetZoneCanvasPointerState() {
  zoneCanvasState.pointerId = null;
  zoneCanvasState.dragging = false;
  zoneCanvasState.startCell = null;
  zoneCanvasState.lastCell = null;
}

function getTileCoordsFromEvent(event) {
  const zone = getSelectedZone();
  if (!zone || !zoneCanvasState.overlayCanvas) return null;
  const rect = zoneCanvasState.overlayCanvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const width = zone.width * zoneCanvasState.cellSize;
  const height = zone.height * zoneCanvasState.cellSize;
  const scaleX = width / rect.width;
  const scaleY = height / rect.height;
  const canvasX = (event.clientX - rect.left) * scaleX;
  const canvasY = (event.clientY - rect.top) * scaleY;
  const x = Math.floor(canvasX / zoneCanvasState.cellSize);
  const y = Math.floor(canvasY / zoneCanvasState.cellSize);
  if (x < 0 || y < 0 || x >= zone.width || y >= zone.height) {
    return null;
  }
  return { x, y };
}

function handleZonePointerDown(event) {
  const zone = getSelectedZone();
  if (!zone) return;
  const coords = getTileCoordsFromEvent(event);
  if (!coords) return;

  if (event.button === 2) {
    event.preventDefault();
    const changed = applySecondaryAction(zone, coords.x, coords.y);
    if (changed) {
      if (state.editMode === 'tile') {
        refreshZoneTiles();
      } else {
        refreshZoneOverlay();
        renderZoneDetails();
      }
    }
    return;
  }

  if (state.editMode === 'tile' && !state.selectedTileId) {
    alert('Select a tile from the palette first.');
    resetZoneCanvasPointerState();
    return;
  }

  zoneCanvasState.pointerId = event.pointerId;
  zoneCanvasState.startCell = coords;
  zoneCanvasState.lastCell = coords;

  if (state.editMode === 'tile') {
    if (state.tileTool === 'brush') {
      zoneCanvasState.overlayCanvas.setPointerCapture(event.pointerId);
      zoneCanvasState.dragging = true;
      if (applyTileBrush(zone, coords.x, coords.y, state.selectedTileId)) {
        refreshZoneTiles();
      }
    } else if (state.tileTool === 'fill') {
      if (applyTileFill(zone, coords.x, coords.y, state.selectedTileId)) {
        refreshZoneTiles();
      }
      resetZoneCanvasPointerState();
    } else if (state.tileTool === 'rectangle') {
      zoneCanvasState.overlayCanvas.setPointerCapture(event.pointerId);
      zoneCanvasState.dragging = true;
      zoneCanvasState.previewRect = { start: coords, end: coords };
      refreshZoneOverlay();
    }
  } else {
    const changed = handleNonTilePrimaryAction(zone, coords.x, coords.y);
    if (changed) {
      refreshZoneOverlay();
      renderZoneDetails();
    }
    resetZoneCanvasPointerState();
  }

  event.preventDefault();
}

function handleZonePointerMove(event) {
  if (!zoneCanvasState.dragging || zoneCanvasState.pointerId !== event.pointerId) {
    return;
  }
  const zone = getSelectedZone();
  if (!zone || zoneCanvasState.zoneId !== zone.id) {
    return;
  }
  const coords = getTileCoordsFromEvent(event);
  if (!coords) {
    return;
  }
  if (state.editMode === 'tile') {
    if (state.tileTool === 'brush') {
      if (!zoneCanvasState.lastCell || zoneCanvasState.lastCell.x !== coords.x || zoneCanvasState.lastCell.y !== coords.y) {
        if (applyTileBrush(zone, coords.x, coords.y, state.selectedTileId)) {
          refreshZoneTiles();
        }
        zoneCanvasState.lastCell = coords;
      }
    } else if (state.tileTool === 'rectangle') {
      zoneCanvasState.previewRect = { start: zoneCanvasState.startCell, end: coords };
      refreshZoneOverlay();
    }
  }
}

function handleZonePointerUp(event) {
  if (zoneCanvasState.pointerId !== event.pointerId) {
    return;
  }
  if (zoneCanvasState.overlayCanvas?.hasPointerCapture(event.pointerId)) {
    zoneCanvasState.overlayCanvas.releasePointerCapture(event.pointerId);
  }
  const zone = getSelectedZone();
  if (zone && state.editMode === 'tile' && state.tileTool === 'rectangle' && zoneCanvasState.startCell) {
    const coords = getTileCoordsFromEvent(event) || zoneCanvasState.lastCell || zoneCanvasState.startCell;
    if (coords && applyTileRectangle(zone, zoneCanvasState.startCell, coords, state.selectedTileId)) {
      refreshZoneTiles();
    }
    zoneCanvasState.previewRect = null;
    refreshZoneOverlay();
  }
  resetZoneCanvasPointerState();
}

function handleZonePointerCancel(event) {
  if (zoneCanvasState.pointerId !== event.pointerId) {
    return;
  }
  if (zoneCanvasState.overlayCanvas?.hasPointerCapture(event.pointerId)) {
    zoneCanvasState.overlayCanvas.releasePointerCapture(event.pointerId);
  }
  zoneCanvasState.previewRect = null;
  refreshZoneOverlay();
  resetZoneCanvasPointerState();
}

function renderZoneGrid() {
  zoneGridContainer.innerHTML = '';
  const zone = getSelectedZone();
  if (!zone) {
    zoneCanvasState.baseCanvas = null;
    zoneCanvasState.overlayCanvas = null;
    zoneCanvasState.baseCtx = null;
    zoneCanvasState.overlayCtx = null;
    zoneCanvasState.zoneId = null;
    zoneCanvasState.previewRect = null;
    const empty = document.createElement('p');
    empty.textContent = 'Select a zone to edit.';
    zoneGridContainer.appendChild(empty);
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'zone-grid';
  const cellSize = Math.max(16, Math.min(96, state.world.tileSize || 32));
  const width = zone.width * cellSize;
  const height = zone.height * cellSize;
  const ratio = window.devicePixelRatio || 1;

  const baseCanvas = document.createElement('canvas');
  baseCanvas.className = 'zone-grid-canvas';
  baseCanvas.width = Math.max(1, Math.floor(width * ratio));
  baseCanvas.height = Math.max(1, Math.floor(height * ratio));
  baseCanvas.style.width = `${width}px`;
  baseCanvas.style.height = `${height}px`;

  const overlayCanvas = document.createElement('canvas');
  overlayCanvas.className = 'zone-grid-overlay';
  overlayCanvas.width = Math.max(1, Math.floor(width * ratio));
  overlayCanvas.height = Math.max(1, Math.floor(height * ratio));
  overlayCanvas.style.width = `${width}px`;
  overlayCanvas.style.height = `${height}px`;

  grid.appendChild(baseCanvas);
  grid.appendChild(overlayCanvas);
  zoneGridContainer.appendChild(grid);

  zoneCanvasState.baseCanvas = baseCanvas;
  zoneCanvasState.overlayCanvas = overlayCanvas;
  zoneCanvasState.baseCtx = baseCanvas.getContext('2d');
  zoneCanvasState.overlayCtx = overlayCanvas.getContext('2d');
  zoneCanvasState.zoneId = zone.id;
  zoneCanvasState.cellSize = cellSize;
  zoneCanvasState.pixelRatio = ratio;
  zoneCanvasState.previewRect = null;
  resetZoneCanvasPointerState();

  overlayCanvas.addEventListener('pointerdown', handleZonePointerDown);
  overlayCanvas.addEventListener('pointermove', handleZonePointerMove);
  overlayCanvas.addEventListener('pointerup', handleZonePointerUp);
  overlayCanvas.addEventListener('pointercancel', handleZonePointerCancel);
  overlayCanvas.addEventListener('pointerleave', handleZonePointerCancel);
  overlayCanvas.addEventListener('contextmenu', event => event.preventDefault());

  drawZoneTiles(zone);
  drawZoneOverlay(zone);
  updateZoneCanvasCursor();
}

function removeEnemyPlacement(zoneId, index) {
  const zone = state.zones.find(z => z.id === zoneId);
  if (!zone) return;
  zone.enemyPlacements.splice(index, 1);
  renderZoneDetails();
  refreshZoneOverlay();
}

function removeTransport(zoneId, index) {
  const zone = state.zones.find(z => z.id === zoneId);
  if (!zone) return;
  zone.transports.splice(index, 1);
  renderZoneDetails();
  refreshZoneOverlay();
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
    li.classList.add('zone-enemy-row');
    const infoWrapper = document.createElement('div');
    infoWrapper.className = 'zone-enemy-info';
    const preview = document.createElement('div');
    preview.className = 'enemy-template-preview';
    if (template && template.sprite) {
      const img = document.createElement('img');
      img.src = template.sprite;
      img.alt = `${template.name} sprite`;
      img.loading = 'lazy';
      preview.appendChild(img);
    } else {
      const placeholder = document.createElement('span');
      placeholder.textContent = '▣';
      preview.appendChild(placeholder);
    }
    const textWrapper = document.createElement('div');
    textWrapper.className = 'zone-enemy-text';
    const nameEl = document.createElement('strong');
    nameEl.textContent = template ? template.name : placement.templateId;
    const idEl = document.createElement('span');
    idEl.className = 'zone-enemy-id';
    idEl.textContent = placement.templateId;
    const coordsEl = document.createElement('span');
    coordsEl.className = 'zone-enemy-coords';
    coordsEl.textContent = `(${placement.x}, ${placement.y})`;
    textWrapper.appendChild(nameEl);
    textWrapper.appendChild(idEl);
    textWrapper.appendChild(coordsEl);
    infoWrapper.appendChild(preview);
    infoWrapper.appendChild(textWrapper);
    li.appendChild(infoWrapper);
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
    select.addEventListener('change', () => {
      renderEquipmentPreview(slotId, select.value);
    });
    wrapper.appendChild(title);
    wrapper.appendChild(select);
    const preview = document.createElement('div');
    preview.className = 'equipment-slot-preview';
    preview.dataset.slot = slotId;
    wrapper.appendChild(preview);
    enemyEquipmentSlotsContainer.appendChild(wrapper);
    created.add(slotId);
    renderEquipmentPreview(slotId, select.value);
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
    renderEquipmentPreview(slot, value);
  });
}

function renderEnemyRotation() {
  enemyRotationList.innerHTML = '';
  if (!state.enemyFormRotation.length) {
    const empty = document.createElement('div');
    empty.className = 'rotation-card-empty';
    empty.textContent = 'No abilities yet.';
    enemyRotationList.appendChild(empty);
    return;
  }
  state.enemyFormRotation.forEach((abilityId, index) => {
    const ability = state.abilities.find(a => String(a.id) === String(abilityId));
    const card = document.createElement('div');
    card.className = 'ability-card builder-ability-card';
    card.dataset.index = index;
    card.dataset.id = abilityId;

    const badge = document.createElement('span');
    badge.className = 'builder-card-index';
    badge.textContent = index + 1;
    card.appendChild(badge);

    const name = document.createElement('div');
    name.className = 'ability-name';
    name.textContent = ability ? `${ability.id} – ${ability.name}` : String(abilityId);
    card.appendChild(name);

    if (ability) {
      const metaParts = [];
      if (ability.school) {
        metaParts.push(titleCase(ability.school));
      }
      const costText = formatAbilityCost(ability);
      if (costText && costText !== 'None') {
        metaParts.push(costText);
      }
      if (Number.isFinite(ability.cooldown)) {
        metaParts.push(`${formatNumericValue(ability.cooldown)}s CD`);
      }
      if (metaParts.length) {
        const meta = document.createElement('div');
        meta.className = 'ability-meta';
        meta.textContent = metaParts.join(' • ');
        card.appendChild(meta);
      }
      if (typeof attachTooltip === 'function') {
        attachTooltip(card, () => createAbilityTooltip(ability));
      }
    }

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'builder-card-remove';
    removeButton.textContent = 'Remove';
    removeButton.addEventListener('click', () => {
      state.enemyFormRotation.splice(index, 1);
      renderEnemyRotation();
    });
    card.appendChild(removeButton);

    enemyRotationList.appendChild(card);
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
  if (enemySpriteSelect) {
    enemySpriteSelect.value = '';
    updateEnemySpritePreview('');
  }
  renderEnemyRotation();
  updateEquipmentSelection({});
});

if (enemySpriteSelect) {
  enemySpriteSelect.addEventListener('change', event => {
    updateEnemySpritePreview(event.target.value);
  });
}

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
  const spriteValue = typeof template.sprite === 'string' ? template.sprite.trim() : '';
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
    sprite: spriteValue || null,
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

  const spriteValue =
    enemySpriteSelect && typeof enemySpriteSelect.value === 'string'
      ? enemySpriteSelect.value.trim()
      : '';

  const payload = {
    templateId: id,
    name: enemyNameInput.value.trim() || id,
    basicType: enemyBasicTypeInput.value,
    level: parseInt(enemyLevelInput.value, 10) || 1,
    sprite: spriteValue || null,
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
  if (enemySpriteSelect) {
    renderEnemySpriteOptions(template.sprite || '');
  }
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
    const preview = document.createElement('div');
    preview.className = 'enemy-template-preview';
    if (template.sprite) {
      const img = document.createElement('img');
      img.src = template.sprite;
      img.alt = `${template.name} sprite`;
      img.loading = 'lazy';
      preview.appendChild(img);
    } else {
      const placeholder = document.createElement('span');
      placeholder.textContent = '▣';
      preview.appendChild(placeholder);
    }
    const info = document.createElement('div');
    info.className = 'enemy-template-info';
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

    item.appendChild(preview);
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
    const preview = document.createElement('div');
    preview.className = 'enemy-template-preview';
    if (template.sprite) {
      const img = document.createElement('img');
      img.src = template.sprite;
      img.alt = `${template.name} sprite`;
      img.loading = 'lazy';
      preview.appendChild(img);
    } else {
      const placeholder = document.createElement('span');
      placeholder.textContent = '▣';
      preview.appendChild(placeholder);
    }
    const info = document.createElement('div');
    info.className = 'enemy-template-info';
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

    item.appendChild(preview);
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
        sprite: template.sprite || undefined,
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
      normalizeFillColor(config.fill) ||
      normalizeFillColor(fallbackFill) ||
      (sprite ? '' : '#ffffff');
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
  if (enemySpriteSelect) {
    enemySpriteSelect.value = '';
    updateEnemySpritePreview('');
  }
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
