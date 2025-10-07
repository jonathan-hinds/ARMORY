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
const paletteRowsInput = document.getElementById('palette-rows');
const paletteColumnsInput = document.getElementById('palette-columns');
const createPaletteButton = document.getElementById('create-palette');
const savePaletteButton = document.getElementById('save-palette');
const deletePaletteButton = document.getElementById('delete-palette');
const paletteGridEl = document.getElementById('palette-grid');
const spriteAssetList = document.getElementById('sprite-asset-list');
const selectedAssetPreview = document.getElementById('selected-asset-preview');
const selectedAssetWalkableInput = document.getElementById('selected-asset-walkable');
const addPaletteTileButton = document.getElementById('add-palette-tile');
const updatePaletteTileButton = document.getElementById('update-palette-tile');
const removePaletteTileButton = document.getElementById('remove-palette-tile');

const addZoneButton = document.getElementById('add-zone');
const zoneListEl = document.getElementById('zone-list');
const zoneGridContainer = document.getElementById('zone-grid');
const zoneDetailsEl = document.getElementById('zone-details');

const modeButtons = Array.from(document.querySelectorAll('.mode-button'));
const transportControls = document.getElementById('transport-controls');
const transportSourceButton = document.getElementById('transport-source-button');
const transportDestinationButton = document.getElementById('transport-destination-button');
const transportStageIndicator = document.getElementById('transport-stage-indicator');
const transportTwoWayToggle = document.getElementById('transport-two-way');
const transportClearButton = document.getElementById('transport-clear');
const tileControls = document.getElementById('tile-controls');
const brushSizeInput = document.getElementById('brush-size');
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

const npcModeInfo = document.getElementById('npc-mode-info');
const npcPlacementTargetEl = document.getElementById('npc-placement-target');
const npcListEl = document.getElementById('npc-list');
const npcPickerListEl = document.getElementById('npc-picker-list');
const npcCreateButton = document.getElementById('npc-create');
const npcForm = document.getElementById('npc-form');
const npcIdInput = document.getElementById('npc-id');
const npcNameInput = document.getElementById('npc-name');
const npcFacingSelect = document.getElementById('npc-facing');
const npcSpriteSelect = document.getElementById('npc-sprite-select');
const npcSpritePreview = document.getElementById('npc-sprite-preview');
const npcServiceSelect = document.getElementById('npc-service');
const npcDialogList = document.getElementById('npc-dialog-entry-list');
const npcDialogAddButton = document.getElementById('npc-dialog-add');
const npcDialogLoopSelect = document.getElementById('npc-dialog-loop');
const npcDeleteButton = document.getElementById('npc-delete');

function formatBackgroundImageValue(spriteUrl) {
  if (!spriteUrl) {
    return 'none';
  }
  const trimmed = String(spriteUrl).trim();
  if (!trimmed) {
    return 'none';
  }
  return `url(${JSON.stringify(trimmed)})`;
}

function applyBackgroundImage(element, spriteUrl) {
  if (!element) return;
  const value = formatBackgroundImageValue(spriteUrl);
  element.style.backgroundImage = value === 'none' ? 'none' : value;
}

const generateWorldButton = document.getElementById('generate-world');
const loadWorldButton = document.getElementById('load-world');
const worldOutput = document.getElementById('world-output');

const DEFAULT_TILES = [
  { id: '0', fill: '#000000', sprite: '/assets/Sprite-0003.png' },
  { id: '1', fill: '#ffffff', sprite: '/assets/Sprite-0001.png' },
  { id: '2', fill: '#dcdcdc', sprite: '/assets/Sprite-0002.png' },
];

const DEFAULT_PALETTE_ROWS = 3;
const DEFAULT_PALETTE_COLUMNS = 3;
const MAX_PALETTE_DIMENSION = 20;

const DEFAULT_ENCOUNTER_TILES = [2];
const DEFAULT_ENCOUNTER_CHANCE = 0.22;
const DEFAULT_ENCOUNTER_COOLDOWN = 2000;
const DEFAULT_ENEMY_COUNT = 6;
const MAX_BRUSH_SIZE = 25;

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
    selectedPaletteTileId: null,
    pendingWalkable: true,
    selectedCell: null,
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
  paletteLayout: [],
  zones: [],
  selectedZoneId: null,
  selectedTileId: null,
  selectedPaletteRegion: null,
  selectedTilePattern: null,
  editMode: 'tile',
  brushSize: 1,
  transportSelection: {
    stage: 'source',
    source: null,
    destination: null,
    twoWay: false,
  },
  enemyTemplates: [],
  selectedEnemyTemplateId: null,
  enemyFormRotation: [],
  editingEnemyId: null,
  npcs: [],
  selectedNpcId: null,
  editingNpcId: null,
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

function clampBrushSize(value) {
  if (!Number.isFinite(value)) {
    return 1;
  }
  const rounded = Math.round(Math.abs(value));
  return Math.max(1, Math.min(MAX_BRUSH_SIZE, rounded));
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
  if (brushSizeInput) {
    const updateBrushSize = inputValue => {
      const normalized = clampBrushSize(Number(inputValue));
      state.brushSize = normalized;
      brushSizeInput.value = String(normalized);
    };
    brushSizeInput.value = String(state.brushSize);
    brushSizeInput.addEventListener('input', e => updateBrushSize(e.target.value));
    brushSizeInput.addEventListener('change', e => updateBrushSize(e.target.value));
  }
  updateBrushSizeControlAvailability();
}

function getDisplayTileSize() {
  const value = Number(state.world.tileSize);
  if (Number.isFinite(value) && value > 0) {
    return Math.max(24, Math.min(96, value));
  }
  return 48;
}

function applyTileSizeToElement(element) {
  if (!element) return;
  element.style.setProperty('--tile-size', `${getDisplayTileSize()}px`);
}

function normalizePaletteDimension(value, fallback) {
  const numeric = Number(value);
  if (Number.isInteger(numeric) && numeric > 0) {
    return Math.max(1, Math.min(MAX_PALETTE_DIMENSION, numeric));
  }
  return fallback;
}

function applyPaletteGridDimensions(element, rows, columns) {
  if (!element) return;
  element.style.setProperty('--palette-rows', `${Math.max(1, rows || 1)}`);
  element.style.setProperty('--palette-columns', `${Math.max(1, columns || 1)}`);
}

function getPaletteLayoutBounds() {
  const layout = state.paletteLayout;
  if (Array.isArray(layout) && layout.length) {
    const rows = layout.length;
    const columns = layout.reduce(
      (max, row) => Math.max(max, Array.isArray(row) ? row.length : 0),
      0
    );
    return { rows, columns };
  }
  return {
    rows: Number(state.activePalette?.rows) || 0,
    columns: Number(state.activePalette?.columns) || 0,
  };
}

function normalizePaletteRegion(region) {
  if (!region) {
    return null;
  }
  const { rows, columns } = getPaletteLayoutBounds();
  if (!rows || !columns) {
    return null;
  }
  const values = {
    startRow: Number(region.startRow),
    endRow: Number(region.endRow),
    startColumn: Number(region.startColumn),
    endColumn: Number(region.endColumn),
  };
  if (
    !Number.isFinite(values.startRow) ||
    !Number.isFinite(values.endRow) ||
    !Number.isFinite(values.startColumn) ||
    !Number.isFinite(values.endColumn)
  ) {
    return null;
  }
  const clampRow = value => Math.max(0, Math.min(rows - 1, Math.round(value)));
  const clampColumn = value => Math.max(0, Math.min(columns - 1, Math.round(value)));
  const startRow = clampRow(values.startRow);
  const endRow = clampRow(values.endRow);
  const startColumn = clampColumn(values.startColumn);
  const endColumn = clampColumn(values.endColumn);
  return {
    startRow: Math.min(startRow, endRow),
    endRow: Math.max(startRow, endRow),
    startColumn: Math.min(startColumn, endColumn),
    endColumn: Math.max(startColumn, endColumn),
  };
}

function buildTilePatternFromRegion(region) {
  if (!region) {
    return null;
  }
  const width = region.endColumn - region.startColumn + 1;
  const height = region.endRow - region.startRow + 1;
  if (width <= 0 || height <= 0) {
    return null;
  }
  const tiles = [];
  let hasTiles = false;
  let firstTileId = null;
  for (let row = 0; row < height; row += 1) {
    const patternRow = [];
    for (let column = 0; column < width; column += 1) {
      const targetRow = region.startRow + row;
      const targetColumn = region.startColumn + column;
      const tileId = state.paletteLayout?.[targetRow]?.[targetColumn] || null;
      if (tileId && state.tileConfig[tileId]) {
        patternRow.push(tileId);
        if (!firstTileId) {
          firstTileId = tileId;
        }
        hasTiles = true;
      } else {
        patternRow.push(null);
      }
    }
    tiles.push(patternRow);
  }
  return {
    width,
    height,
    tiles,
    hasTiles,
    firstTileId,
  };
}

function applyTilePaletteSelectionVisual(region = state.selectedPaletteRegion) {
  if (!tilePaletteEl) {
    return;
  }
  const tokens = tilePaletteEl.querySelectorAll('.tile-token');
  tokens.forEach(token => {
    token.classList.remove('tile-token-selected', 'tile-token-anchor');
  });
  if (!region) {
    return;
  }
  tokens.forEach(token => {
    const row = Number(token.dataset.row);
    const column = Number(token.dataset.column);
    if (
      Number.isInteger(row) &&
      Number.isInteger(column) &&
      row >= region.startRow &&
      row <= region.endRow &&
      column >= region.startColumn &&
      column <= region.endColumn
    ) {
      token.classList.add('tile-token-selected');
      if (row === region.startRow && column === region.startColumn) {
        token.classList.add('tile-token-anchor');
      }
    }
  });
}

function commitPaletteSelection(region, { skipHighlight = false, skipZoneRender = false } = {}) {
  const normalized = normalizePaletteRegion(region);
  if (!normalized) {
    state.selectedPaletteRegion = null;
    state.selectedTilePattern = null;
    state.selectedTileId = null;
    if (!skipHighlight) {
      applyTilePaletteSelectionVisual(null);
    }
    updateBrushSizeControlAvailability();
    if (!skipZoneRender) {
      renderZoneEditor();
    }
    return;
  }
  const pattern = buildTilePatternFromRegion(normalized);
  if (!pattern || !pattern.hasTiles) {
    state.selectedPaletteRegion = null;
    state.selectedTilePattern = null;
    state.selectedTileId = null;
    if (!skipHighlight) {
      applyTilePaletteSelectionVisual(null);
    }
    updateBrushSizeControlAvailability();
    if (!skipZoneRender) {
      renderZoneEditor();
    }
    return;
  }
  state.selectedPaletteRegion = normalized;
  state.selectedTilePattern = pattern;
  state.selectedTileId = pattern.firstTileId || null;
  if (!skipHighlight) {
    applyTilePaletteSelectionVisual(normalized);
  }
  updateBrushSizeControlAvailability();
  if (!skipZoneRender) {
    renderZoneEditor();
  }
}

let palettePointerState = null;

function getPaletteCellFromElement(element, { requireTile = false } = {}) {
  if (!element || !tilePaletteEl) {
    return null;
  }
  const button = element.closest('.tile-token');
  if (!button || !tilePaletteEl.contains(button)) {
    return null;
  }
  if (requireTile && button.disabled) {
    return null;
  }
  const row = Number(button.dataset.row);
  const column = Number(button.dataset.column);
  if (!Number.isInteger(row) || !Number.isInteger(column)) {
    return null;
  }
  return { row, column, button };
}

function getPaletteCellFromPoint(x, y) {
  if (typeof x !== 'number' || typeof y !== 'number') {
    return null;
  }
  const element = document.elementFromPoint(x, y);
  return getPaletteCellFromElement(element);
}

function finalizePalettePointerSelection({ cancelled = false } = {}) {
  if (!palettePointerState) {
    return;
  }
  document.removeEventListener('pointermove', handlePalettePointerMove);
  document.removeEventListener('pointerup', handlePalettePointerUp);
  document.removeEventListener('pointercancel', handlePalettePointerCancel);
  const region = palettePointerState.previewRegion;
  palettePointerState = null;
  if (cancelled) {
    applyTilePaletteSelectionVisual();
    return;
  }
  if (region) {
    commitPaletteSelection(region);
  } else {
    applyTilePaletteSelectionVisual();
  }
}

function handlePalettePointerDown(event) {
  if (!tilePaletteEl || palettePointerState) {
    return;
  }
  if (event.button !== 0 && event.pointerType !== 'touch' && event.pointerType !== 'pen') {
    return;
  }
  const cell = getPaletteCellFromElement(event.target, { requireTile: true });
  if (!cell) {
    return;
  }
  event.preventDefault();
  const region = normalizePaletteRegion({
    startRow: cell.row,
    endRow: cell.row,
    startColumn: cell.column,
    endColumn: cell.column,
  });
  palettePointerState = {
    anchorRow: cell.row,
    anchorColumn: cell.column,
    pointerId: event.pointerId,
    previewRegion: region,
  };
  if (cell.button && cell.button.setPointerCapture) {
    try {
      cell.button.setPointerCapture(event.pointerId);
    } catch (error) {
      // Ignore errors on unsupported elements.
    }
  }
  if (region) {
    applyTilePaletteSelectionVisual(region);
  }
  document.addEventListener('pointermove', handlePalettePointerMove);
  document.addEventListener('pointerup', handlePalettePointerUp);
  document.addEventListener('pointercancel', handlePalettePointerCancel);
}

function handlePalettePointerMove(event) {
  if (!palettePointerState) {
    return;
  }
  const cell = getPaletteCellFromPoint(event.clientX, event.clientY);
  if (!cell) {
    return;
  }
  const region = normalizePaletteRegion({
    startRow: palettePointerState.anchorRow,
    endRow: cell.row,
    startColumn: palettePointerState.anchorColumn,
    endColumn: cell.column,
  });
  if (!region) {
    return;
  }
  const previous = palettePointerState.previewRegion;
  if (
    previous &&
    previous.startRow === region.startRow &&
    previous.endRow === region.endRow &&
    previous.startColumn === region.startColumn &&
    previous.endColumn === region.endColumn
  ) {
    return;
  }
  palettePointerState.previewRegion = region;
  applyTilePaletteSelectionVisual(region);
}

function handlePalettePointerUp(event) {
  if (!palettePointerState) {
    return;
  }
  if (
    palettePointerState.pointerId != null &&
    event.pointerId != null &&
    palettePointerState.pointerId !== event.pointerId
  ) {
    return;
  }
  finalizePalettePointerSelection({ cancelled: false });
}

function handlePalettePointerCancel() {
  finalizePalettePointerSelection({ cancelled: true });
}

function handlePaletteButtonClick(event) {
  if (event.detail !== 0) {
    return;
  }
  const cell = getPaletteCellFromElement(event.currentTarget, { requireTile: true });
  if (!cell) {
    return;
  }
  event.preventDefault();
  commitPaletteSelection(
    { startRow: cell.row, endRow: cell.row, startColumn: cell.column, endColumn: cell.column },
    { skipHighlight: false, skipZoneRender: false }
  );
}

function renderTilePalette() {
  if (!tilePaletteEl) return;
  tilePaletteEl.innerHTML = '';
  applyTileSizeToElement(tilePaletteEl);
  const { rows, columns } = getPaletteLayoutBounds();
  if (!rows || !columns) {
    const empty = document.createElement('p');
    empty.textContent = 'Define palette dimensions to view tiles.';
    tilePaletteEl.appendChild(empty);
    return;
  }
  applyPaletteGridDimensions(tilePaletteEl, rows, columns);
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const tileId = state.paletteLayout?.[row]?.[column] || null;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'tile-token';
      button.dataset.row = String(row);
      button.dataset.column = String(column);
      if (!tileId || !state.tileConfig[tileId]) {
        button.classList.add('tile-token-empty');
        button.disabled = true;
      } else {
        const config = state.tileConfig[tileId];
        if (config.sprite) {
          applyBackgroundImage(button, config.sprite);
          button.style.backgroundColor = config.fill || '#ffffff';
        } else {
          applyBackgroundImage(button, null);
          button.style.backgroundColor = config.fill || '#ffffff';
        }
        if (!config.walkable) {
          button.classList.add('tile-token-blocked');
        }
        button.title = config.walkable ? 'Walkable tile' : 'Blocked tile';
        const label = document.createElement('span');
        label.className = 'tile-token-label';
        label.textContent = tileId;
        button.appendChild(label);
      }
      button.addEventListener('pointerdown', handlePalettePointerDown);
      button.addEventListener('click', handlePaletteButtonClick);
      tilePaletteEl.appendChild(button);
    }
  }
  applyTilePaletteSelectionVisual();
}

function createDefaultPalette() {
  return {
    _id: null,
    name: 'Default Palette',
    description: '',
    rows: DEFAULT_PALETTE_ROWS,
    columns: DEFAULT_PALETTE_COLUMNS,
    tiles: DEFAULT_TILES.map((tile, index) => ({
      tileId: String(tile.id),
      sprite: tile.sprite,
      fill: tile.fill,
      walkable: true,
      row: Math.floor(index / DEFAULT_PALETTE_COLUMNS),
      column: index % DEFAULT_PALETTE_COLUMNS,
    })),
  };
}

function normalizePalette(palette) {
  if (!palette || typeof palette !== 'object') {
    return createDefaultPalette();
  }
  const baseRows = normalizePaletteDimension(palette.rows, DEFAULT_PALETTE_ROWS);
  const baseColumns = normalizePaletteDimension(palette.columns, DEFAULT_PALETTE_COLUMNS);
  const tiles = Array.isArray(palette.tiles)
    ? palette.tiles
        .map((tile, index) => {
          if (!tile || typeof tile !== 'object') {
            return null;
          }
          const tileId = String(tile.tileId || tile.id || '').trim();
          if (!tileId) {
            return null;
          }
          const sprite =
            typeof tile.sprite === 'string' && tile.sprite.trim() ? tile.sprite.trim() : '';
          const fill =
            typeof tile.fill === 'string' && tile.fill.trim() ? tile.fill.trim() : '#ffffff';
          const walkable = tile.walkable !== false;
          const rowValue = Number(tile.row);
          const columnValue = Number(tile.column);
          const row = Number.isInteger(rowValue) ? rowValue : Math.floor(index / baseColumns);
          const column = Number.isInteger(columnValue) ? columnValue : index % baseColumns;
          return { tileId, sprite, fill, walkable, row, column };
        })
        .filter(Boolean)
    : [];
  const requiredRows = tiles.reduce((max, tile) => Math.max(max, tile.row + 1), 0);
  const requiredColumns = tiles.reduce((max, tile) => Math.max(max, tile.column + 1), 0);
  const rows = Math.max(baseRows, requiredRows || baseRows);
  const columns = Math.max(baseColumns, requiredColumns || baseColumns);
  const limitedRows = Math.max(1, Math.min(MAX_PALETTE_DIMENSION, rows));
  const limitedColumns = Math.max(1, Math.min(MAX_PALETTE_DIMENSION, columns));
  const normalizedTiles = tiles.map(tile => ({
    tileId: tile.tileId,
    sprite: tile.sprite,
    fill: tile.fill,
    walkable: tile.walkable,
    row: Math.max(0, Math.min(limitedRows - 1, tile.row)),
    column: Math.max(0, Math.min(limitedColumns - 1, tile.column)),
  }));
  normalizedTiles.sort((a, b) => {
    if (a.row !== b.row) return a.row - b.row;
    if (a.column !== b.column) return a.column - b.column;
    return a.tileId.localeCompare(b.tileId);
  });
  return {
    _id: palette._id || null,
    name: palette.name || 'Unnamed Palette',
    description: palette.description || '',
    rows: limitedRows,
    columns: limitedColumns,
    tiles: normalizedTiles,
  };
}

function clonePalette(palette) {
  const normalized = normalizePalette(palette);
  return {
    _id: normalized._id,
    name: normalized.name,
    description: normalized.description,
    rows: normalized.rows,
    columns: normalized.columns,
    tiles: normalized.tiles.map(tile => ({ ...tile })),
  };
}

function ensurePaletteSelection({ skipHighlight = false, skipZoneRender = true } = {}) {
  const region = state.selectedPaletteRegion;
  const normalized = normalizePaletteRegion(region);
  if (normalized) {
    const pattern = buildTilePatternFromRegion(normalized);
    if (pattern && pattern.hasTiles) {
      commitPaletteSelection(normalized, { skipHighlight, skipZoneRender });
      return;
    }
  }
  if (state.selectedTileId && state.tileConfig[state.selectedTileId]) {
    const config = state.tileConfig[state.selectedTileId];
    const fallbackRegion = normalizePaletteRegion({
      startRow: config.row ?? 0,
      endRow: config.row ?? 0,
      startColumn: config.column ?? 0,
      endColumn: config.column ?? 0,
    });
    if (fallbackRegion) {
      commitPaletteSelection(fallbackRegion, { skipHighlight, skipZoneRender });
      return;
    }
  }
  const { rows, columns } = getPaletteLayoutBounds();
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const tileId = state.paletteLayout?.[row]?.[column];
      if (tileId && state.tileConfig[tileId]) {
        commitPaletteSelection(
          { startRow: row, endRow: row, startColumn: column, endColumn: column },
          { skipHighlight, skipZoneRender }
        );
        return;
      }
    }
  }
  commitPaletteSelection(null, { skipHighlight, skipZoneRender });
}

function rebuildPaletteState() {
  state.palette = {};
  state.tileConfig = {};
  const rows = normalizePaletteDimension(
    state.activePalette?.rows,
    state.activePalette ? state.activePalette.rows || DEFAULT_PALETTE_ROWS : DEFAULT_PALETTE_ROWS
  );
  const columns = normalizePaletteDimension(
    state.activePalette?.columns,
    state.activePalette ? state.activePalette.columns || DEFAULT_PALETTE_COLUMNS : DEFAULT_PALETTE_COLUMNS
  );
  if (!state.activePalette) {
    state.activePalette = createDefaultPalette();
  }
  state.activePalette.rows = rows;
  state.activePalette.columns = columns;
  const layout = Array.from({ length: rows }, () => Array(columns).fill(null));
  const sourceTiles = Array.isArray(state.activePalette.tiles)
    ? state.activePalette.tiles.slice()
    : [];
  const normalizedTiles = [];
  const findEmptyCell = () => {
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < columns; c += 1) {
        if (!layout[r][c]) {
          return { row: r, column: c };
        }
      }
    }
    return null;
  };
  sourceTiles.forEach((tile, index) => {
    if (!tile || typeof tile !== 'object') {
      return;
    }
    const tileId = String(tile.tileId || tile.id || index).trim();
    if (!tileId) {
      return;
    }
    const sprite =
      typeof tile.sprite === 'string' && tile.sprite.trim() ? tile.sprite.trim() : '';
    const fill =
      typeof tile.fill === 'string' && tile.fill.trim() ? tile.fill.trim() : '#ffffff';
    const walkable = tile.walkable !== false;
    let row = Number(tile.row);
    let column = Number(tile.column);
    const validRow = Number.isInteger(row) ? row : Math.floor(index / columns);
    const validColumn = Number.isInteger(column) ? column : index % columns;
    row = validRow;
    column = validColumn;
    if (
      row < 0 ||
      column < 0 ||
      row >= rows ||
      column >= columns ||
      layout[row][column]
    ) {
      const fallback = findEmptyCell();
      if (!fallback) {
        return;
      }
      row = fallback.row;
      column = fallback.column;
    }
    layout[row][column] = tileId;
    const normalized = { tileId, sprite, fill, walkable, row, column };
    normalizedTiles.push(normalized);
    state.palette[tileId] = fill;
    state.tileConfig[tileId] = { sprite, fill, walkable, row, column };
  });
  normalizedTiles.sort((a, b) => {
    if (a.row !== b.row) return a.row - b.row;
    if (a.column !== b.column) return a.column - b.column;
    return a.tileId.localeCompare(b.tileId);
  });
  state.activePalette.tiles = normalizedTiles;
  state.paletteLayout = layout;

  const findFirstTileId = () => {
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < columns; c += 1) {
        const cellId = layout[r][c];
        if (cellId && state.tileConfig[cellId]) {
          return cellId;
        }
      }
    }
    return null;
  };

  if (!state.selectedTileId || !state.tileConfig[state.selectedTileId]) {
    state.selectedTileId = findFirstTileId();
  }

  if (
    state.spriteBuilder.selectedPaletteTileId &&
    !state.tileConfig[state.spriteBuilder.selectedPaletteTileId]
  ) {
    state.spriteBuilder.selectedPaletteTileId = state.selectedTileId || null;
  }

  const currentCell = state.spriteBuilder.selectedCell;
  if (
    currentCell &&
    (currentCell.row == null ||
      currentCell.column == null ||
      currentCell.row < 0 ||
      currentCell.column < 0 ||
      currentCell.row >= rows ||
      currentCell.column >= columns)
  ) {
    state.spriteBuilder.selectedCell = null;
  }

  if (!state.spriteBuilder.selectedCell) {
    if (state.selectedTileId && state.tileConfig[state.selectedTileId]) {
      const config = state.tileConfig[state.selectedTileId];
      state.spriteBuilder.selectedCell = { row: config.row, column: config.column };
      state.spriteBuilder.selectedPaletteTileId = state.selectedTileId;
    } else if (rows > 0 && columns > 0) {
      state.spriteBuilder.selectedCell = { row: 0, column: 0 };
      if (state.spriteBuilder.selectedPaletteTileId && !state.tileConfig[state.spriteBuilder.selectedPaletteTileId]) {
        state.spriteBuilder.selectedPaletteTileId = null;
      }
    }
  } else {
    const { row, column } = state.spriteBuilder.selectedCell;
    const tileIdAtCell = layout[row]?.[column] || null;
    if (tileIdAtCell && state.tileConfig[tileIdAtCell]) {
      state.spriteBuilder.selectedPaletteTileId = tileIdAtCell;
    } else if (!tileIdAtCell) {
      state.spriteBuilder.selectedPaletteTileId = null;
    }
  }
  ensurePaletteSelection({ skipHighlight: true, skipZoneRender: true });
}

function setPaletteInputsFromState() {
  if (paletteNameInput) {
    paletteNameInput.value = state.activePalette?.name || '';
  }
  if (paletteDescriptionInput) {
    paletteDescriptionInput.value = state.activePalette?.description || '';
  }
  if (paletteRowsInput) {
    const rows = normalizePaletteDimension(
      state.activePalette?.rows,
      state.activePalette ? state.activePalette.rows || DEFAULT_PALETTE_ROWS : DEFAULT_PALETTE_ROWS
    );
    paletteRowsInput.value = rows;
  }
  if (paletteColumnsInput) {
    const columns = normalizePaletteDimension(
      state.activePalette?.columns,
      state.activePalette ? state.activePalette.columns || DEFAULT_PALETTE_COLUMNS : DEFAULT_PALETTE_COLUMNS
    );
    paletteColumnsInput.value = columns;
  }
}

function applyPaletteDimensions(rowsValue, columnsValue) {
  if (!state.activePalette) {
    state.activePalette = createDefaultPalette();
  }
  const currentRows = Number(state.activePalette.rows) || DEFAULT_PALETTE_ROWS;
  const currentColumns = Number(state.activePalette.columns) || DEFAULT_PALETTE_COLUMNS;
  const normalizedRows = normalizePaletteDimension(rowsValue, currentRows);
  const normalizedColumns = normalizePaletteDimension(columnsValue, currentColumns);
  if (normalizedRows === currentRows && normalizedColumns === currentColumns) {
    setPaletteInputsFromState();
    return;
  }
  state.activePalette.rows = normalizedRows;
  state.activePalette.columns = normalizedColumns;
  rebuildPaletteState();
  if (state.selectedTileId) {
    setSelectedPaletteTile(state.selectedTileId, { preserveAsset: true });
  } else if (state.spriteBuilder.selectedCell) {
    selectPaletteCell(state.spriteBuilder.selectedCell.row, state.spriteBuilder.selectedCell.column, {
      preserveAsset: true,
    });
  } else {
    renderPaletteGrid();
    renderTilePalette();
    renderSpriteAssets();
    updateSelectedSpriteControls();
  }
  renderZoneEditor();
  setPaletteInputsFromState();
}

function renderPaletteGrid() {
  if (!paletteGridEl) return;
  paletteGridEl.innerHTML = '';
  applyTileSizeToElement(paletteGridEl);
  const rows = Number(state.activePalette?.rows) || 0;
  const columns = Number(state.activePalette?.columns) || 0;
  if (!rows || !columns) {
    const empty = document.createElement('div');
    empty.className = 'palette-grid-empty';
    empty.textContent = 'Set rows and columns to build a palette grid.';
    paletteGridEl.appendChild(empty);
    return;
  }
  applyPaletteGridDimensions(paletteGridEl, rows, columns);
  const selectedCell = state.spriteBuilder.selectedCell;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const tileId = state.paletteLayout?.[row]?.[column] || null;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'tile-token';
      if (selectedCell && selectedCell.row === row && selectedCell.column === column) {
        button.classList.add('active');
      }
      if (tileId && state.tileConfig[tileId]) {
        const config = state.tileConfig[tileId];
        if (config.sprite) {
          applyBackgroundImage(button, config.sprite);
          button.style.backgroundColor = config.fill || '#ffffff';
        } else {
          applyBackgroundImage(button, null);
          button.style.backgroundColor = config.fill || '#ffffff';
        }
        if (!config.walkable) {
          button.classList.add('tile-token-blocked');
        }
        const label = document.createElement('span');
        label.className = 'tile-token-label';
        label.textContent = tileId;
        button.appendChild(label);
        button.title = config.walkable ? 'Walkable tile' : 'Blocked tile';
      } else {
        button.classList.add('tile-token-empty');
        button.title = 'Empty palette slot';
      }
      button.addEventListener('click', () => selectPaletteCell(row, column));
      paletteGridEl.appendChild(button);
    }
  }
}

function selectPaletteCell(row, column, options = {}) {
  if (!Number.isInteger(row) || !Number.isInteger(column)) {
    return;
  }
  const rows = Number(state.activePalette?.rows) || 0;
  const columns = Number(state.activePalette?.columns) || 0;
  if (!rows || !columns) {
    state.spriteBuilder.selectedCell = null;
    state.spriteBuilder.selectedPaletteTileId = null;
    if (!options.preserveAsset) {
      state.spriteBuilder.selectedAsset = null;
      state.spriteBuilder.pendingWalkable = true;
    }
    updateSelectedSpriteControls();
    return;
  }
  const clampedRow = Math.max(0, Math.min(rows - 1, row));
  const clampedColumn = Math.max(0, Math.min(columns - 1, column));
  const skipWorldSelection = options.skipWorldSelection === true;
  state.spriteBuilder.selectedCell = { row: clampedRow, column: clampedColumn };
  const tileId = state.paletteLayout?.[clampedRow]?.[clampedColumn] || null;
  if (tileId && state.tileConfig[tileId]) {
    state.spriteBuilder.selectedPaletteTileId = tileId;
    const tile = state.activePalette?.tiles?.find(entry => entry.tileId === tileId) || null;
    const config = state.tileConfig[tileId];
    state.spriteBuilder.selectedAsset = tile?.sprite || config.sprite || null;
    state.spriteBuilder.pendingWalkable = tile ? Boolean(tile.walkable) : config.walkable !== false;
    state.selectedTileId = tileId;
    if (!skipWorldSelection) {
      commitPaletteSelection(
        { startRow: clampedRow, endRow: clampedRow, startColumn: clampedColumn, endColumn: clampedColumn },
        { skipHighlight: Boolean(options.skipTilePalette), skipZoneRender: true }
      );
    }
  } else {
    state.spriteBuilder.selectedPaletteTileId = null;
    if (!options.preserveAsset) {
      state.spriteBuilder.selectedAsset = state.spriteBuilder.selectedAsset || null;
    }
    if (!options.preserveAsset) {
      state.spriteBuilder.pendingWalkable = true;
    }
    if (!skipWorldSelection) {
      commitPaletteSelection(null, {
        skipHighlight: Boolean(options.skipTilePalette),
        skipZoneRender: true,
      });
    }
  }
  if (!options.skipTilePalette) {
    renderTilePalette();
  }
  if (!options.skipGrid) {
    renderPaletteGrid();
  }
  renderSpriteAssets();
  updateSelectedSpriteControls();
}

function findFirstEmptyPaletteCell() {
  const rows = Number(state.activePalette?.rows) || 0;
  const columns = Number(state.activePalette?.columns) || 0;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      if (!state.paletteLayout?.[row]?.[column]) {
        return { row, column };
      }
    }
  }
  return null;
}

function getNextPaletteTileId() {
  const tiles = state.activePalette?.tiles || [];
  const used = new Set(tiles.map(tile => String(tile.tileId)));
  let candidate = 0;
  while (used.has(String(candidate))) {
    candidate += 1;
  }
  return String(candidate);
}

function updateSelectedSpriteControls() {
  if (selectedAssetPreview) {
    selectedAssetPreview.innerHTML = '';
    if (state.spriteBuilder.selectedAsset) {
      const img = document.createElement('img');
      img.src = state.spriteBuilder.selectedAsset;
      img.alt = 'Selected sprite preview';
      img.loading = 'lazy';
      selectedAssetPreview.appendChild(img);
    } else {
      const message = document.createElement('p');
      message.textContent = 'Select a sprite asset to add it to the palette.';
      selectedAssetPreview.appendChild(message);
    }
  }
  if (selectedAssetWalkableInput) {
    selectedAssetWalkableInput.checked = Boolean(state.spriteBuilder.pendingWalkable);
  }
  const hasAsset = Boolean(state.spriteBuilder.selectedAsset);
  const selectedCell = state.spriteBuilder.selectedCell;
  const hasCellSelection =
    selectedCell &&
    Number.isInteger(selectedCell.row) &&
    Number.isInteger(selectedCell.column);
  const hasSelection = Boolean(state.spriteBuilder.selectedPaletteTileId);
  if (addPaletteTileButton) {
    addPaletteTileButton.disabled = !hasAsset || !hasCellSelection;
  }
  if (updatePaletteTileButton) {
    updatePaletteTileButton.disabled = !hasAsset || !hasSelection;
  }
  if (removePaletteTileButton) {
    removePaletteTileButton.disabled = !hasSelection;
  }
}

function setSelectedPaletteTile(tileId, options = {}) {
  if (!tileId) {
    state.spriteBuilder.selectedPaletteTileId = null;
    if (!options.preserveCell) {
      state.spriteBuilder.selectedCell = null;
    }
    if (!options.preserveAsset) {
      state.spriteBuilder.selectedAsset = null;
      state.spriteBuilder.pendingWalkable = true;
    }
    if (!options.skipTilePalette) {
      renderTilePalette();
    }
    if (!options.skipGrid) {
      renderPaletteGrid();
    }
    renderSpriteAssets();
    updateSelectedSpriteControls();
    commitPaletteSelection(null, {
      skipHighlight: Boolean(options.skipTilePalette),
      skipZoneRender: true,
    });
    return;
  }
  const tile = state.activePalette?.tiles?.find(entry => entry.tileId === tileId) || null;
  if (!tile) {
    return;
  }
  selectPaletteCell(tile.row ?? 0, tile.column ?? 0, {
    preserveAsset: false,
    skipTilePalette: options.skipTilePalette,
    skipGrid: options.skipGrid,
  });
}

function addTileToPalette() {
  if (!state.activePalette) {
    state.activePalette = createDefaultPalette();
  }
  const asset = state.spriteBuilder.selectedAsset;
  if (!asset) {
    alert('Select a sprite asset to add to the palette.');
    return;
  }
  const rows = Number(state.activePalette.rows) || DEFAULT_PALETTE_ROWS;
  const columns = Number(state.activePalette.columns) || DEFAULT_PALETTE_COLUMNS;
  if (!rows || !columns) {
    alert('Set palette rows and columns before adding tiles.');
    return;
  }
  if (!Array.isArray(state.activePalette.tiles)) {
    state.activePalette.tiles = [];
  }
  if (!Array.isArray(state.paletteLayout) || !state.paletteLayout.length) {
    rebuildPaletteState();
  }
  const selectedCell = state.spriteBuilder.selectedCell;
  let targetRow = Number.isInteger(selectedCell?.row) ? selectedCell.row : null;
  let targetColumn = Number.isInteger(selectedCell?.column) ? selectedCell.column : null;
  if (targetRow == null || targetColumn == null) {
    const emptyCell = findFirstEmptyPaletteCell();
    if (emptyCell) {
      targetRow = emptyCell.row;
      targetColumn = emptyCell.column;
    } else {
      alert('Palette grid is full. Increase rows or columns to add more tiles.');
      return;
    }
  }
  targetRow = Math.max(0, Math.min(rows - 1, targetRow));
  targetColumn = Math.max(0, Math.min(columns - 1, targetColumn));
  const existingTileId = state.paletteLayout?.[targetRow]?.[targetColumn] || null;
  if (existingTileId) {
    const existingTile = state.activePalette.tiles.find(tile => tile.tileId === existingTileId);
    if (existingTile) {
      existingTile.sprite = asset;
      existingTile.walkable = Boolean(state.spriteBuilder.pendingWalkable);
      if (!existingTile.fill) {
        existingTile.fill = '#ffffff';
      }
    }
  } else {
    const tileId = getNextPaletteTileId();
    const tile = {
      tileId,
      sprite: asset,
      fill: '#ffffff',
      walkable: Boolean(state.spriteBuilder.pendingWalkable),
      row: targetRow,
      column: targetColumn,
    };
    state.activePalette.tiles.push(tile);
  }
  rebuildPaletteState();
  selectPaletteCell(targetRow, targetColumn, { preserveAsset: true });
  renderZoneEditor();
}

function updateSelectedPaletteTile() {
  const tileId = state.spriteBuilder.selectedPaletteTileId;
  if (!tileId) {
    alert('Select a tile from the palette to update.');
    return;
  }
  const asset = state.spriteBuilder.selectedAsset;
  if (!asset) {
    alert('Select a sprite asset for this tile.');
    return;
  }
  const tiles = state.activePalette?.tiles || [];
  const target = tiles.find(entry => entry.tileId === tileId);
  if (!target) {
    return;
  }
  const targetRow = Number.isInteger(target.row) ? target.row : 0;
  const targetColumn = Number.isInteger(target.column) ? target.column : 0;
  target.sprite = asset;
  target.walkable = Boolean(state.spriteBuilder.pendingWalkable);
  if (!target.fill) {
    target.fill = '#ffffff';
  }
  rebuildPaletteState();
  const updated = state.activePalette?.tiles?.find(entry => entry.tileId === tileId) || target;
  const row = Number.isInteger(updated?.row) ? updated.row : targetRow;
  const column = Number.isInteger(updated?.column) ? updated.column : targetColumn;
  selectPaletteCell(row, column, { preserveAsset: true });
  renderZoneEditor();
}

function removePaletteTile(tileId) {
  const tiles = state.activePalette?.tiles || [];
  const index = tiles.findIndex(tile => tile.tileId === tileId);
  if (index < 0) {
    return;
  }
  const removed = tiles[index];
  tiles.splice(index, 1);
  state.activePalette.tiles = tiles;
  const targetRow = Number.isInteger(removed?.row) ? removed.row : state.spriteBuilder.selectedCell?.row || 0;
  const targetColumn = Number.isInteger(removed?.column)
    ? removed.column
    : state.spriteBuilder.selectedCell?.column || 0;
  rebuildPaletteState();
  if (state.activePalette.tiles.length) {
    if (state.paletteLayout?.[targetRow]?.[targetColumn]) {
      selectPaletteCell(targetRow, targetColumn, { preserveAsset: true });
    } else if (state.selectedTileId) {
      setSelectedPaletteTile(state.selectedTileId, { preserveAsset: true, preserveCell: true });
    } else {
      const fallbackTile = state.activePalette.tiles[0];
      if (fallbackTile) {
        setSelectedPaletteTile(fallbackTile.tileId, { preserveAsset: true, preserveCell: true });
      }
    }
  } else {
    state.selectedTileId = null;
    selectPaletteCell(targetRow, targetColumn, { preserveAsset: true });
  }
  renderZoneEditor();
}

function removeSelectedPaletteTile() {
  const tileId = state.spriteBuilder.selectedPaletteTileId;
  if (!tileId) {
    alert('Select a tile from the palette to remove.');
    return;
  }
  removePaletteTile(tileId);
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
  if (state.selectedTileId) {
    setSelectedPaletteTile(state.selectedTileId, { preserveAsset: true });
  } else if (state.spriteBuilder.selectedCell) {
    selectPaletteCell(state.spriteBuilder.selectedCell.row, state.spriteBuilder.selectedCell.column);
  } else {
    renderPaletteGrid();
    renderTilePalette();
    renderSpriteAssets();
    updateSelectedSpriteControls();
  }
  if (!options.skipZone) {
    renderZoneEditor();
  }
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
  }
}

function renderSpriteAssets() {
  if (!spriteAssetList) return;
  spriteAssetList.innerHTML = '';
  if (!state.spriteAssets.length) {
    const empty = document.createElement('p');
    empty.textContent = 'No sprite assets found.';
    spriteAssetList.appendChild(empty);
    renderEnemySpriteOptions();
    renderNpcSpriteOptions();
    updateSelectedSpriteControls();
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
      state.spriteBuilder.selectedAsset = asset.url;
      updateSelectedSpriteControls();
      renderSpriteAssets();
    });
    spriteAssetList.appendChild(button);
  });
  renderEnemySpriteOptions();
  renderNpcSpriteOptions();
  updateSelectedSpriteControls();
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

function renderNpcSpriteOptions(selectedValue = null) {
  if (!npcSpriteSelect) return;
  const previousValue = selectedValue != null ? selectedValue : npcSpriteSelect.value;
  npcSpriteSelect.innerHTML = '';
  const noneOption = document.createElement('option');
  noneOption.value = '';
  noneOption.textContent = 'None (Default)';
  npcSpriteSelect.appendChild(noneOption);
  let hasMatch = false;
  state.spriteAssets.forEach(asset => {
    const option = document.createElement('option');
    option.value = asset.url;
    option.textContent = asset.id;
    npcSpriteSelect.appendChild(option);
    if (previousValue && asset.url === previousValue) {
      hasMatch = true;
    }
  });
  if (previousValue && !hasMatch) {
    const customOption = document.createElement('option');
    customOption.value = previousValue;
    customOption.textContent = previousValue;
    npcSpriteSelect.appendChild(customOption);
    hasMatch = true;
  }
  npcSpriteSelect.value = hasMatch ? previousValue : '';
  updateNpcSpritePreview(npcSpriteSelect.value);
}

function updateNpcSpritePreview(assetUrl) {
  if (!npcSpritePreview) return;
  npcSpritePreview.innerHTML = '';
  if (assetUrl) {
    const img = document.createElement('img');
    img.src = assetUrl;
    img.alt = 'NPC sprite preview';
    img.loading = 'lazy';
    npcSpritePreview.appendChild(img);
  } else {
    const message = document.createElement('span');
    message.textContent = 'No sprite selected';
    npcSpritePreview.appendChild(message);
  }
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
    rows: Number(state.activePalette.rows) || DEFAULT_PALETTE_ROWS,
    columns: Number(state.activePalette.columns) || DEFAULT_PALETTE_COLUMNS,
    tiles: state.activePalette.tiles.map(tile => ({
      tileId: tile.tileId,
      sprite: tile.sprite,
      fill: tile.fill,
      walkable: Boolean(tile.walkable),
      row: Number.isInteger(tile.row) ? tile.row : 0,
      column: Number.isInteger(tile.column) ? tile.column : 0,
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
}

function startNewPalette() {
  const blank = createDefaultPalette();
  blank._id = null;
  blank.name = '';
  blank.description = '';
  blank.tiles = [];
  state.spriteBuilder.selectedAsset = null;
  state.spriteBuilder.pendingWalkable = true;
  state.spriteBuilder.selectedPaletteTileId = null;
  state.spriteBuilder.selectedCell = null;
  setActivePalette(blank);
  state.selectedPaletteId = null;
  renderPaletteSelect();
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

if (addPaletteTileButton) {
  addPaletteTileButton.addEventListener('click', addTileToPalette);
}

if (updatePaletteTileButton) {
  updatePaletteTileButton.addEventListener('click', updateSelectedPaletteTile);
}

if (removePaletteTileButton) {
  removePaletteTileButton.addEventListener('click', removeSelectedPaletteTile);
}

if (selectedAssetWalkableInput) {
  selectedAssetWalkableInput.addEventListener('change', event => {
    state.spriteBuilder.pendingWalkable = event.target.checked;
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

if (paletteRowsInput) {
  paletteRowsInput.addEventListener('change', event => {
    if (!state.activePalette) {
      state.activePalette = createDefaultPalette();
    }
    const currentColumns = Number(state.activePalette?.columns) || DEFAULT_PALETTE_COLUMNS;
    const normalized = normalizePaletteDimension(
      event.target.value,
      state.activePalette?.rows || DEFAULT_PALETTE_ROWS
    );
    paletteRowsInput.value = normalized;
    applyPaletteDimensions(normalized, currentColumns);
  });
}

if (paletteColumnsInput) {
  paletteColumnsInput.addEventListener('change', event => {
    if (!state.activePalette) {
      state.activePalette = createDefaultPalette();
    }
    const currentRows = Number(state.activePalette?.rows) || DEFAULT_PALETTE_ROWS;
    const normalized = normalizePaletteDimension(
      event.target.value,
      state.activePalette?.columns || DEFAULT_PALETTE_COLUMNS
    );
    paletteColumnsInput.value = normalized;
    applyPaletteDimensions(currentRows, normalized);
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

function normalizeNpcIdValue(value) {
  const base = typeof value === 'string' ? value : '';
  const sanitized = base.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return sanitized || 'npc';
}

function ensureUniqueNpcId(base, used) {
  const sanitized = normalizeNpcIdValue(base);
  let candidate = sanitized;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${sanitized}_${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

function createNpcId(base, currentId = null) {
  const used = new Set(state.npcs.map(npc => npc.id));
  if (currentId) {
    used.delete(currentId);
  }
  return ensureUniqueNpcId(base, used);
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
        state.npcs.forEach(npc => {
          if (npc.zoneId === zone.id) {
            npc.zoneId = null;
            npc.x = null;
            npc.y = null;
          }
        });
        renderZonesList();
        renderZoneEditor();
        updateTransportOptions();
        renderNpcList();
        updateNpcPlacementInfo();
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
  if (npcModeInfo) {
    npcModeInfo.classList.toggle('hidden', mode !== 'npc');
  }
  if (tileControls) {
    tileControls.classList.toggle('hidden', mode !== 'tile');
  }
  updateBrushSizeControlAvailability();
  if (mode === 'transport') {
    updateTransportOptions();
  }
}

modeButtons.forEach(button => {
  button.addEventListener('click', () => {
    setEditMode(button.dataset.mode);
  });
});

function resetTransportSelection({ keepTwoWay = true } = {}) {
  const selection = state.transportSelection;
  if (!selection) return;
  if (!keepTwoWay) {
    selection.twoWay = false;
    if (transportTwoWayToggle) {
      transportTwoWayToggle.checked = false;
    }
  }
  selection.source = null;
  selection.destination = null;
  selection.stage = 'source';
}

function setTransportStage(stage) {
  const selection = state.transportSelection;
  if (!selection) return;
  if (stage === 'destination' && !selection.source) {
    selection.stage = 'source';
  } else if (stage === 'source' || stage === 'destination') {
    selection.stage = stage;
  }
  updateTransportOptions();
}

function setTransportSource(zone, x, y) {
  const selection = state.transportSelection;
  if (!selection) return;
  selection.source = { zoneId: zone.id, x, y };
  const existing = zone.transports.find(t => t.from.x === x && t.from.y === y);
  if (existing) {
    selection.destination = {
      zoneId: existing.toZoneId,
      x: existing.to.x,
      y: existing.to.y,
    };
    const targetZone = state.zones.find(z => z.id === existing.toZoneId);
    if (targetZone) {
      const reverse = targetZone.transports.find(
        t =>
          t.from.x === existing.to.x &&
          t.from.y === existing.to.y &&
          t.toZoneId === zone.id &&
          t.to.x === x &&
          t.to.y === y,
      );
      selection.twoWay = Boolean(reverse);
    }
  } else {
    selection.destination = null;
  }
  selection.stage = 'destination';
  updateTransportOptions();
}

function setTransportDestination(zone, x, y) {
  const selection = state.transportSelection;
  if (!selection) return;
  if (!selection.source) {
    setTransportSource(zone, x, y);
    return;
  }
  selection.destination = { zoneId: zone.id, x, y };
  if (
    selection.source.zoneId === selection.destination.zoneId &&
    selection.source.x === selection.destination.x &&
    selection.source.y === selection.destination.y
  ) {
    alert('Transport cannot target the same tile.');
    selection.destination = null;
    updateTransportOptions();
    return;
  }
  applyTransportSelection();
}

function applyTransportSelection() {
  const selection = state.transportSelection;
  if (!selection?.source || !selection.destination) {
    return;
  }
  const sourceZone = state.zones.find(z => z.id === selection.source.zoneId);
  const destinationZone = state.zones.find(z => z.id === selection.destination.zoneId);
  if (!sourceZone || !destinationZone) {
    alert('Selected zones no longer exist.');
    resetTransportSelection();
    updateTransportOptions();
    return;
  }
  const { source, destination } = selection;
  const existingIndex = sourceZone.transports.findIndex(
    t => t.from.x === source.x && t.from.y === source.y,
  );
  const transport = {
    from: { x: source.x, y: source.y },
    toZoneId: destination.zoneId,
    to: { x: destination.x, y: destination.y },
  };
  if (existingIndex >= 0) {
    sourceZone.transports.splice(existingIndex, 1, transport);
  } else {
    sourceZone.transports.push(transport);
  }
  const reverseTransport = {
    from: { x: destination.x, y: destination.y },
    toZoneId: source.zoneId,
    to: { x: source.x, y: source.y },
  };
  const reverseIndex = destinationZone.transports.findIndex(
    t => t.from.x === destination.x && t.from.y === destination.y && t.toZoneId === source.zoneId,
  );
  if (selection.twoWay) {
    if (reverseIndex >= 0) {
      destinationZone.transports.splice(reverseIndex, 1, reverseTransport);
    } else {
      destinationZone.transports.push(reverseTransport);
    }
  } else if (
    reverseIndex >= 0 &&
    destinationZone.transports[reverseIndex].to.x === source.x &&
    destinationZone.transports[reverseIndex].to.y === source.y
  ) {
    destinationZone.transports.splice(reverseIndex, 1);
  }
  resetTransportSelection({ keepTwoWay: true });
  updateTransportOptions();
  renderZonesList();
}

function handleTransportClick(zone, x, y) {
  if (!state.transportSelection) return;
  if (state.transportSelection.stage === 'destination' && state.transportSelection.source) {
    setTransportDestination(zone, x, y);
  } else {
    setTransportSource(zone, x, y);
  }
}

if (transportSourceButton) {
  transportSourceButton.addEventListener('click', () => {
    setTransportStage('source');
  });
}

if (transportDestinationButton) {
  transportDestinationButton.addEventListener('click', () => {
    setTransportStage('destination');
  });
}

if (transportTwoWayToggle) {
  transportTwoWayToggle.addEventListener('change', () => {
    if (!state.transportSelection) return;
    state.transportSelection.twoWay = transportTwoWayToggle.checked;
  });
}

transportClearButton.addEventListener('click', () => {
  resetTransportSelection();
  updateTransportOptions();
  renderZoneEditor();
});

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

function handleNpcPlacement(zone, x, y) {
  const npcId = state.selectedNpcId;
  if (!npcId) {
    alert('Select an NPC to place.');
    return;
  }
  const npc = state.npcs.find(entry => entry.id === npcId);
  if (!npc) {
    alert('Select an NPC to place.');
    return;
  }
  const occupant = state.npcs.find(entry => entry.id !== npcId && entry.zoneId === zone.id && entry.x === x && entry.y === y);
  if (occupant) {
    occupant.zoneId = null;
    occupant.x = null;
    occupant.y = null;
  }
  if (npc.zoneId === zone.id && npc.x === x && npc.y === y) {
    npc.zoneId = null;
    npc.x = null;
    npc.y = null;
  } else {
    npc.zoneId = zone.id;
    npc.x = x;
    npc.y = y;
  }
  renderZoneEditor();
  renderNpcList();
  updateNpcPlacementInfo();
}

function handleSpawnPlacement(zone, x, y) {
  zone.spawn = { x, y };
}

function getBrushSize() {
  return clampBrushSize(Number(state.brushSize));
}

function getSelectedTilePattern() {
  if (state.selectedTilePattern && state.selectedTilePattern.hasTiles) {
    return state.selectedTilePattern;
  }
  const tileId = state.selectedTileId;
  if (tileId && state.tileConfig[tileId]) {
    return {
      width: 1,
      height: 1,
      tiles: [[tileId]],
      hasTiles: true,
    };
  }
  return null;
}

function hasActiveTileSelection() {
  return Boolean(getSelectedTilePattern());
}

function isMultiTileSelectionActive() {
  const pattern = getSelectedTilePattern();
  if (!pattern) {
    return false;
  }
  return pattern.width > 1 || pattern.height > 1;
}

function updateBrushSizeControlAvailability() {
  if (!brushSizeInput) {
    return;
  }
  const disabled = state.editMode !== 'tile' || isMultiTileSelectionActive();
  brushSizeInput.disabled = disabled;
  if (brushSizeInput.parentElement) {
    brushSizeInput.parentElement.classList.toggle('brush-control--disabled', disabled);
  }
  if (state.editMode === 'tile' && isMultiTileSelectionActive()) {
    brushSizeInput.title = 'Brush size is disabled while a multi-tile selection is active.';
  } else {
    brushSizeInput.title = '';
  }
}

function fillSquareBrush(zone, centerX, centerY, tileId, size = getBrushSize()) {
  if (!zone || tileId == null) {
    return;
  }
  const normalizedSize = clampBrushSize(size);
  const offset = Math.floor((normalizedSize - 1) / 2);
  const startX = centerX - offset;
  const startY = centerY - offset;
  for (let dy = 0; dy < normalizedSize; dy += 1) {
    for (let dx = 0; dx < normalizedSize; dx += 1) {
      const targetX = startX + dx;
      const targetY = startY + dy;
      if (
        targetX >= 0 &&
        targetX < zone.width &&
        targetY >= 0 &&
        targetY < zone.height
      ) {
        zone.tiles[targetY][targetX] = tileId;
      }
    }
  }
}

function applyTilePattern(zone, startX, startY, pattern) {
  if (!zone || !pattern || !pattern.hasTiles) {
    return;
  }
  for (let row = 0; row < pattern.height; row += 1) {
    for (let column = 0; column < pattern.width; column += 1) {
      const tileId = pattern.tiles[row]?.[column];
      if (tileId == null) {
        continue;
      }
      const targetX = startX + column;
      const targetY = startY + row;
      if (
        targetX >= 0 &&
        targetX < zone.width &&
        targetY >= 0 &&
        targetY < zone.height
      ) {
        zone.tiles[targetY][targetX] = tileId;
      }
    }
  }
}

function applyTileBrush(zone, x, y) {
  const pattern = getSelectedTilePattern();
  if (!zone || !pattern) {
    return;
  }
  if (pattern.width === 1 && pattern.height === 1) {
    const tileId = pattern.tiles[0]?.[0];
    if (tileId == null) {
      return;
    }
    fillSquareBrush(zone, x, y, tileId);
    return;
  }
  applyTilePattern(zone, x, y, pattern);
}

function handleZoneCellClick(event) {
  const zone = getSelectedZone();
  if (!zone) return;
  const x = Number(event.currentTarget.dataset.x);
  const y = Number(event.currentTarget.dataset.y);
  switch (state.editMode) {
    case 'tile':
      if (!hasActiveTileSelection()) {
        alert('Select a tile or tile region from the palette first.');
        return;
      }
      applyTileBrush(zone, x, y);
      break;
    case 'enemy':
      handleEnemyPlacement(zone, x, y);
      break;
    case 'npc':
      handleNpcPlacement(zone, x, y);
      break;
    case 'transport':
      handleTransportClick(zone, x, y);
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
  } else if (state.editMode === 'npc') {
    const npc = state.npcs.find(entry => entry.zoneId === zone.id && entry.x === x && entry.y === y);
    if (npc) {
      npc.zoneId = null;
      npc.x = null;
      npc.y = null;
      renderNpcList();
      updateNpcPlacementInfo();
    }
  } else if (state.editMode === 'transport') {
    zone.transports = zone.transports.filter(t => !(t.from.x === x && t.from.y === y));
    const selection = state.transportSelection;
    if (selection) {
      if (
        selection.source &&
        selection.source.zoneId === zone.id &&
        selection.source.x === x &&
        selection.source.y === y
      ) {
        selection.source = null;
        selection.stage = 'source';
      }
      if (
        selection.destination &&
        selection.destination.zoneId === zone.id &&
        selection.destination.x === x &&
        selection.destination.y === y
      ) {
        selection.destination = null;
      }
      updateTransportOptions();
    }
  } else if (state.editMode === 'spawn') {
    if (zone.spawn && zone.spawn.x === x && zone.spawn.y === y) {
      zone.spawn = null;
    }
  } else if (state.editMode === 'tile') {
    const defaultTile = Object.keys(state.tileConfig)[0];
    if (defaultTile) {
      fillSquareBrush(zone, x, y, defaultTile);
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
      cell.dataset.tileId = tileId;
      if (tileConfig.sprite) {
        applyBackgroundImage(cell, tileConfig.sprite);
        cell.style.backgroundSize = 'cover';
        cell.style.backgroundPosition = 'center';
        cell.style.backgroundColor = tileConfig.fill || '#ffffff';
        cell.textContent = '';
      } else {
        applyBackgroundImage(cell, null);
        cell.style.backgroundColor = tileConfig.fill || '#ffffff';
        cell.textContent = tileId;
      }
      if (tileConfig.walkable === false) {
        cell.classList.add('not-walkable');
      } else {
        cell.classList.remove('not-walkable');
      }
      if (zone.spawn && zone.spawn.x === x && zone.spawn.y === y) {
        cell.classList.add('is-spawn');
      }
      const placement = zone.enemyPlacements.find(p => p.x === x && p.y === y);
      if (placement) {
        cell.classList.add('has-enemy');
        const template = state.enemyTemplates.find(t => t.id === placement.templateId);
        if (template && template.sprite) {
          cell.classList.add('has-enemy-sprite');
          const overlay = document.createElement('div');
          overlay.className = 'zone-cell-enemy';
          applyBackgroundImage(overlay, template.sprite);
          const margin = Math.max(2, Math.floor(cellSize * 0.15));
          overlay.style.left = `${margin}px`;
          overlay.style.top = `${margin}px`;
          overlay.style.right = `${margin}px`;
          overlay.style.bottom = `${margin}px`;
          cell.appendChild(overlay);
        }
      }
      const npcPlacement = state.npcs.find(entry => entry.zoneId === zone.id && entry.x === x && entry.y === y);
      if (npcPlacement) {
        cell.classList.add('has-npc');
        const overlay = document.createElement('div');
        overlay.className = 'zone-cell-npc';
        if (npcPlacement.sprite) {
          applyBackgroundImage(overlay, npcPlacement.sprite);
          overlay.style.backgroundSize = 'cover';
          overlay.style.backgroundPosition = 'center';
          overlay.style.backgroundRepeat = 'no-repeat';
        } else {
          overlay.textContent = 'NPC';
        }
        cell.appendChild(overlay);
      }
      if (zone.transports.some(t => t.from.x === x && t.from.y === y)) {
        cell.classList.add('has-transport');
      }
      const selection = state.transportSelection;
      if (
        selection?.source &&
        selection.source.zoneId === zone.id &&
        selection.source.x === x &&
        selection.source.y === y
      ) {
        cell.classList.add('transport-source');
      }
      if (
        selection?.destination &&
        selection.destination.zoneId === zone.id &&
        selection.destination.x === x &&
        selection.destination.y === y
      ) {
        cell.classList.add('transport-destination');
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
  const [removed] = zone.transports.splice(index, 1);
  if (removed && state.transportSelection) {
    const selection = state.transportSelection;
    if (
      selection.source &&
      selection.source.zoneId === zoneId &&
      selection.source.x === removed.from.x &&
      selection.source.y === removed.from.y
    ) {
      selection.source = null;
      selection.stage = 'source';
    }
    if (
      selection.destination &&
      selection.destination.zoneId === removed.toZoneId &&
      selection.destination.x === removed.to.x &&
      selection.destination.y === removed.to.y
    ) {
      selection.destination = null;
    }
    updateTransportOptions();
  }
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

  const npcSection = document.createElement('div');
  npcSection.className = 'zone-subsection';
  const npcTitle = document.createElement('h3');
  const npcsInZone = state.npcs.filter(entry => entry.zoneId === zone.id);
  npcTitle.textContent = `NPC Placements (${npcsInZone.length})`;
  npcSection.appendChild(npcTitle);
  const npcList = document.createElement('ul');
  if (npcsInZone.length) {
    npcsInZone.forEach(npc => {
      const li = document.createElement('li');
      li.textContent = `${npc.name || npc.id} (${npc.x}, ${npc.y})`;
      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.textContent = 'Remove';
      removeButton.addEventListener('click', () => removeNpcPlacement(npc.id));
      li.appendChild(removeButton);
      npcList.appendChild(li);
    });
  } else {
    const empty = document.createElement('li');
    empty.textContent = 'None';
    npcList.appendChild(empty);
  }
  npcSection.appendChild(npcList);
  zoneDetailsEl.appendChild(npcSection);

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
  updateTransportOptions();
}

function getZoneDisplayName(zoneId) {
  if (!zoneId) return '';
  const zone = state.zones.find(z => z.id === zoneId);
  return zone ? zone.name || zone.id : zoneId;
}

function updateTransportOptions() {
  const selection = state.transportSelection;
  if (!selection) return;

  const validatePoint = point => {
    if (!point) return null;
    const zone = state.zones.find(z => z.id === point.zoneId);
    if (!zone) {
      return null;
    }
    if (
      point.x < 0 ||
      point.y < 0 ||
      point.x >= zone.width ||
      point.y >= zone.height
    ) {
      return null;
    }
    return point;
  };

  const validSource = validatePoint(selection.source);
  const validDestination = validatePoint(selection.destination);
  if (!validSource && selection.source) {
    selection.source = null;
  }
  if (!validDestination && selection.destination) {
    selection.destination = null;
  }
  if (!selection.source && selection.stage === 'destination') {
    selection.stage = 'source';
  }

  const formatPoint = point => `${getZoneDisplayName(point.zoneId)} (${point.x}, ${point.y})`;

  if (transportSourceButton) {
    transportSourceButton.textContent = selection.source
      ? `Source: ${formatPoint(selection.source)}`
      : 'Select source tile';
    transportSourceButton.classList.toggle('active', selection.stage === 'source');
  }

  if (transportDestinationButton) {
    transportDestinationButton.textContent = selection.destination
      ? `Destination: ${formatPoint(selection.destination)}`
      : 'Select destination tile';
    transportDestinationButton.classList.toggle('active', selection.stage === 'destination');
    transportDestinationButton.disabled = !selection.source;
  }

  if (transportStageIndicator) {
    transportStageIndicator.textContent =
      selection.stage === 'destination' && selection.source
        ? `Click a tile to set the destination for ${formatPoint(selection.source)}.`
        : 'Click a tile to set the source.';
  }

  if (transportTwoWayToggle) {
    transportTwoWayToggle.checked = Boolean(selection.twoWay);
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

function updateNpcPlacementInfo() {
  if (!npcPlacementTargetEl) return;
  const npcId = state.selectedNpcId;
  if (!npcId) {
    npcPlacementTargetEl.textContent = 'None Selected';
    return;
  }
  const npc = state.npcs.find(entry => entry.id === npcId);
  if (!npc) {
    npcPlacementTargetEl.textContent = 'None Selected';
    return;
  }
  const zone = npc.zoneId ? state.zones.find(z => z.id === npc.zoneId) : null;
  const zoneLabel = zone ? zone.name || zone.id : 'Unplaced';
  const coords = Number.isFinite(npc.x) && Number.isFinite(npc.y) ? `(${npc.x}, ${npc.y})` : '';
  const label = npc.name ? `${npc.name} (${npc.id})` : npc.id;
  npcPlacementTargetEl.textContent = zoneLabel === 'Unplaced' ? `${label} – Unplaced` : `${label} – ${zoneLabel} ${coords}`;
}

function normalizeNpcDialogConfig(rawDialog) {
  const result = { entries: [], loopFrom: null };
  const appendEntry = candidate => {
    let lines = [];
    if (Array.isArray(candidate)) {
      lines = candidate;
    } else if (typeof candidate === 'string') {
      lines = candidate.split(/\r?\n/);
    } else if (candidate && typeof candidate === 'object') {
      if (Array.isArray(candidate.lines)) {
        lines = candidate.lines;
      } else if (typeof candidate.lines === 'string') {
        lines = candidate.lines.split(/\r?\n/);
      } else if (Array.isArray(candidate.dialog)) {
        lines = candidate.dialog;
      } else if (typeof candidate.text === 'string') {
        lines = candidate.text.split(/\r?\n/);
      }
    }
    const normalized = lines
      .map(line => (typeof line === 'string' ? line.trim() : ''))
      .filter(line => line.length > 0);
    if (normalized.length) {
      result.entries.push({ lines: normalized });
    }
  };

  if (Array.isArray(rawDialog)) {
    appendEntry(rawDialog);
    if (result.entries.length) {
      result.loopFrom = 0;
    }
    return result;
  }

  if (typeof rawDialog === 'string') {
    appendEntry(rawDialog);
    if (result.entries.length) {
      result.loopFrom = 0;
    }
    return result;
  }

  if (rawDialog && typeof rawDialog === 'object') {
    if (Array.isArray(rawDialog.entries)) {
      rawDialog.entries.forEach(entry => appendEntry(entry));
    } else if (Array.isArray(rawDialog.lines)) {
      appendEntry(rawDialog.lines);
    } else if (Array.isArray(rawDialog.dialog)) {
      appendEntry(rawDialog.dialog);
    } else if (typeof rawDialog.lines === 'string') {
      appendEntry(rawDialog.lines);
    } else if (typeof rawDialog.dialog === 'string') {
      appendEntry(rawDialog.dialog);
    }

    const loopCandidate =
      rawDialog.loopFrom ?? rawDialog.loopStart ?? rawDialog.loop ?? null;
    if (Number.isInteger(loopCandidate) && loopCandidate >= 0) {
      result.loopFrom = loopCandidate;
    }
  }

  if (!result.entries.length) {
    result.loopFrom = null;
    return result;
  }

  if (result.loopFrom == null) {
    result.loopFrom = null;
  } else {
    result.loopFrom = Math.max(0, Math.min(result.entries.length - 1, result.loopFrom));
  }

  return result;
}

function cloneNpcDialog(rawDialog) {
  const normalized = normalizeNpcDialogConfig(rawDialog);
  const clonedEntries = normalized.entries.map(entry => ({ lines: entry.lines.slice() }));
  const loopFrom =
    Number.isInteger(normalized.loopFrom) && clonedEntries.length
      ? Math.max(0, Math.min(clonedEntries.length - 1, normalized.loopFrom))
      : null;
  return {
    entries: clonedEntries,
    loopFrom,
  };
}

function exportNpcDialog(dialog) {
  const cloned = cloneNpcDialog(dialog);
  if (!cloned.entries.length) {
    return undefined;
  }
  const payload = {
    entries: cloned.entries.map(entry => ({ lines: entry.lines.slice() })),
  };
  if (Number.isInteger(cloned.loopFrom) && cloned.loopFrom >= 0) {
    payload.loopFrom = cloned.loopFrom;
  }
  return payload;
}

function normalizeNpcServiceConfig(rawService) {
  if (!rawService) {
    return null;
  }
  if (typeof rawService === 'string') {
    const type = rawService.trim().toLowerCase();
    if (!type) {
      return null;
    }
    if (type === 'shop') {
      return { type: 'shop', shopId: null };
    }
    return null;
  }
  if (typeof rawService === 'object') {
    const type = typeof rawService.type === 'string' ? rawService.type.trim().toLowerCase() : '';
    if (!type) {
      return null;
    }
    if (type === 'shop') {
      const shopId =
        typeof rawService.shopId === 'string' && rawService.shopId.trim() ? rawService.shopId.trim() : null;
      return { type: 'shop', shopId };
    }
  }
  return null;
}

function cloneNpcService(rawService) {
  const normalized = normalizeNpcServiceConfig(rawService);
  if (!normalized) {
    return null;
  }
  return {
    type: normalized.type,
    shopId: normalized.shopId || null,
  };
}

function exportNpcService(service) {
  const normalized = cloneNpcService(service);
  if (!normalized) {
    return undefined;
  }
  const payload = { type: normalized.type };
  if (normalized.shopId) {
    payload.shopId = normalized.shopId;
  }
  return payload;
}

function getNpcServiceLabel(service) {
  const normalized = cloneNpcService(service);
  if (!normalized) {
    return '';
  }
  if (normalized.type === 'shop') {
    return 'Shop';
  }
  return titleCase(normalized.type);
}

function updateNpcDialogLoopOptions(entryCount, loopFrom) {
  if (!npcDialogLoopSelect) {
    return;
  }
  npcDialogLoopSelect.innerHTML = '';
  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = entryCount > 0 ? 'Stay on final entry' : 'No entries yet';
  npcDialogLoopSelect.appendChild(defaultOption);
  for (let index = 0; index < entryCount; index += 1) {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = `Entry ${index + 1}`;
    npcDialogLoopSelect.appendChild(option);
  }
  const withinRange = Number.isInteger(loopFrom) && loopFrom >= 0 && loopFrom < entryCount;
  npcDialogLoopSelect.value = withinRange ? String(loopFrom) : '';
  npcDialogLoopSelect.disabled = entryCount === 0;
}

function readNpcDialogForm(options = {}) {
  const { includeEmpty = true } = options;
  const dialog = { entries: [], loopFrom: null };
  if (npcDialogList) {
    const entryNodes = Array.from(npcDialogList.querySelectorAll('.npc-dialog-entry textarea[data-dialog-lines]'));
    entryNodes.forEach(textarea => {
      const rawLines = textarea.value.split(/\r?\n/);
      const lines = rawLines
        .map(line => (typeof line === 'string' ? line.trim() : ''))
        .filter(line => line.length > 0);
      if (lines.length || includeEmpty) {
        dialog.entries.push({ lines });
      }
    });
  }
  if (npcDialogLoopSelect && !npcDialogLoopSelect.disabled) {
    const loopValue = npcDialogLoopSelect.value;
    if (loopValue !== '' && loopValue != null) {
      const numeric = Number(loopValue);
      if (Number.isInteger(numeric) && numeric >= 0) {
        dialog.loopFrom = numeric;
      }
    }
  }
  return dialog;
}

function renderNpcDialogEditor(rawDialog) {
  if (!npcDialogList) {
    return;
  }
  const dialog =
    rawDialog && typeof rawDialog === 'object' && Array.isArray(rawDialog.entries)
      ? {
          entries: rawDialog.entries.map(entry => ({
            lines: Array.isArray(entry?.lines)
              ? entry.lines.map(line => (typeof line === 'string' ? line : String(line || '')))
              : [],
          })),
          loopFrom:
            Number.isInteger(rawDialog.loopFrom) && rawDialog.loopFrom >= 0
              ? rawDialog.loopFrom
              : null,
        }
      : { entries: [], loopFrom: null };

  const hasEntries = dialog.entries.length > 0;
  npcDialogList.innerHTML = '';

  if (!hasEntries) {
    const note = document.createElement('p');
    note.className = 'npc-dialog-empty';
    note.textContent = 'No dialogue entries yet. Add one to begin.';
    npcDialogList.appendChild(note);
    dialog.entries.push({ lines: [] });
  }

  dialog.entries.forEach((entry, index) => {
    const entryEl = document.createElement('div');
    entryEl.className = 'npc-dialog-entry';

    const header = document.createElement('div');
    header.className = 'npc-dialog-entry-header';
    const title = document.createElement('strong');
    title.textContent = `Entry ${index + 1}`;
    header.appendChild(title);
    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.textContent = 'Remove';
    removeButton.addEventListener('click', () => {
      const dialogState = readNpcDialogForm({ includeEmpty: true });
      dialogState.entries.splice(index, 1);
      renderNpcDialogEditor(dialogState);
    });
    header.appendChild(removeButton);
    entryEl.appendChild(header);

    const textarea = document.createElement('textarea');
    textarea.setAttribute('data-dialog-lines', 'true');
    textarea.placeholder = 'Enter one line per message...';
    textarea.rows = Math.max(2, entry.lines.length || 0);
    textarea.value = entry.lines.join('\n');
    entryEl.appendChild(textarea);

    npcDialogList.appendChild(entryEl);
  });

  const loopEntryCount = hasEntries ? dialog.entries.length : 0;
  updateNpcDialogLoopOptions(loopEntryCount, dialog.loopFrom);
}

function clearNpcForm() {
  if (npcForm) {
    npcForm.reset();
  }
  if (npcFacingSelect) {
    npcFacingSelect.value = 'down';
  }
  if (npcServiceSelect) {
    npcServiceSelect.value = '';
  }
  renderNpcSpriteOptions('');
  updateNpcSpritePreview('');
  renderNpcDialogEditor({ entries: [], loopFrom: null });
}

function loadNpcIntoForm(npc) {
  if (!npc) {
    clearNpcForm();
    return;
  }
  if (npcIdInput) {
    npcIdInput.value = npc.id;
  }
  if (npcNameInput) {
    npcNameInput.value = npc.name || '';
  }
  if (npcFacingSelect) {
    npcFacingSelect.value = npc.facing || 'down';
  }
  if (npcServiceSelect) {
    const service = cloneNpcService(npc.service);
    npcServiceSelect.value = service ? service.type : '';
  }
  renderNpcSpriteOptions(npc.sprite || '');
  renderNpcDialogEditor(npc.dialog);
}

function selectNpc(npcId) {
  state.editingNpcId = npcId;
  state.selectedNpcId = npcId;
  const npc = state.npcs.find(entry => entry.id === npcId) || null;
  loadNpcIntoForm(npc);
  renderNpcList();
  updateNpcPlacementInfo();
}

function renderNpcList() {
  if (!npcListEl) return;
  npcListEl.innerHTML = '';
  if (!state.npcs.length) {
    const empty = document.createElement('p');
    empty.className = 'panel-note';
    empty.textContent = 'No NPCs defined yet.';
    npcListEl.appendChild(empty);
    updateNpcPlacementInfo();
    renderNpcPickerList();
    return;
  }
  const zoneLookup = new Map(state.zones.map(zone => [zone.id, zone.name || zone.id]));
  state.npcs
    .slice()
    .sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id))
    .forEach(npc => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'npc-item';
      if (state.editingNpcId === npc.id) {
        item.classList.add('active');
      }
      const meta = document.createElement('div');
      meta.className = 'npc-meta';
      const title = document.createElement('strong');
      title.textContent = npc.name || npc.id;
      meta.appendChild(title);
      const idLine = document.createElement('span');
      idLine.textContent = npc.id;
      meta.appendChild(idLine);
      const serviceLabel = getNpcServiceLabel(npc.service);
      if (serviceLabel) {
        const serviceTag = document.createElement('span');
        serviceTag.className = 'npc-service-label';
        serviceTag.textContent = serviceLabel;
        meta.appendChild(serviceTag);
      }
      item.appendChild(meta);
      const position = document.createElement('span');
      position.className = 'npc-position';
      if (npc.zoneId && Number.isFinite(npc.x) && Number.isFinite(npc.y)) {
        const zoneName = zoneLookup.get(npc.zoneId) || npc.zoneId;
        position.textContent = `${zoneName} (${npc.x}, ${npc.y})`;
      } else {
        position.textContent = 'Unplaced';
      }
      item.appendChild(position);
      item.addEventListener('click', () => selectNpc(npc.id));
      npcListEl.appendChild(item);
    });
  updateNpcPlacementInfo();
  renderNpcPickerList();
}

function removeNpcPlacement(npcId) {
  const npc = state.npcs.find(entry => entry.id === npcId);
  if (!npc) return;
  npc.zoneId = null;
  npc.x = null;
  npc.y = null;
  renderZoneEditor();
  renderNpcList();
  updateNpcPlacementInfo();
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

if (npcSpriteSelect) {
  npcSpriteSelect.addEventListener('change', event => {
    updateNpcSpritePreview(event.target.value);
  });
}

if (npcCreateButton) {
  npcCreateButton.addEventListener('click', () => {
    state.editingNpcId = null;
    state.selectedNpcId = null;
    clearNpcForm();
    renderNpcList();
    updateNpcPlacementInfo();
    if (npcIdInput) {
      npcIdInput.focus();
    }
  });
}

if (npcDialogAddButton) {
  npcDialogAddButton.addEventListener('click', () => {
    const dialogState = readNpcDialogForm({ includeEmpty: true });
    dialogState.entries.push({ lines: [] });
    renderNpcDialogEditor(dialogState);
    if (npcDialogList) {
      const inputs = npcDialogList.querySelectorAll('textarea[data-dialog-lines]');
      const last = inputs[inputs.length - 1];
      if (last) {
        last.focus();
        const length = last.value.length;
        last.setSelectionRange(length, length);
      }
    }
  });
}

renderNpcDialogEditor({ entries: [], loopFrom: null });

if (npcForm) {
  npcForm.addEventListener('submit', event => {
    event.preventDefault();
    let idValue = npcIdInput ? npcIdInput.value.trim() : '';
    const nameValue = npcNameInput ? npcNameInput.value.trim() : '';
    if (!idValue) {
      idValue = nameValue || 'npc';
    }
    const normalizedId = createNpcId(idValue, state.editingNpcId);
    const facingValue = npcFacingSelect ? npcFacingSelect.value : 'down';
    const normalizedFacing = ['up', 'down', 'left', 'right'].includes(facingValue) ? facingValue : 'down';
    const spriteValue = npcSpriteSelect && npcSpriteSelect.value ? npcSpriteSelect.value : '';
    const dialogConfig = cloneNpcDialog(readNpcDialogForm({ includeEmpty: false }));
    const serviceValue = npcServiceSelect ? npcServiceSelect.value : '';
    const serviceConfig = cloneNpcService(serviceValue || null);

    let npc = state.npcs.find(entry => entry.id === state.editingNpcId) || null;
    if (!npc) {
      npc = {
        id: normalizedId,
        name: nameValue || normalizedId,
        facing: normalizedFacing,
        sprite: spriteValue || null,
        dialog: dialogConfig,
        zoneId: null,
        x: null,
        y: null,
        service: serviceConfig,
      };
      state.npcs.push(npc);
    } else {
      const previousId = npc.id;
      npc.id = normalizedId;
      npc.name = nameValue || normalizedId;
      npc.facing = normalizedFacing;
      npc.sprite = spriteValue || null;
      npc.dialog = dialogConfig;
      npc.service = serviceConfig;
      if (state.selectedNpcId === previousId) {
        state.selectedNpcId = normalizedId;
      }
      state.npcs = state.npcs.map(entry => (entry === npc ? npc : entry));
    }
    state.editingNpcId = normalizedId;
    if (!state.selectedNpcId) {
      state.selectedNpcId = normalizedId;
    }
    if (npcIdInput) {
      npcIdInput.value = normalizedId;
    }
    loadNpcIntoForm(npc);
    renderNpcList();
    updateNpcPlacementInfo();
    renderZoneEditor();
  });
}

if (npcDeleteButton) {
  npcDeleteButton.addEventListener('click', () => {
    if (!state.editingNpcId) {
      return;
    }
    const index = state.npcs.findIndex(entry => entry.id === state.editingNpcId);
    if (index < 0) {
      return;
    }
    const npc = state.npcs[index];
    if (!window.confirm(`Delete NPC "${npc.name || npc.id}"?`)) {
      return;
    }
    state.npcs.splice(index, 1);
    if (state.selectedNpcId === npc.id) {
      state.selectedNpcId = null;
    }
    state.editingNpcId = null;
    clearNpcForm();
    renderNpcList();
    renderZoneEditor();
    updateNpcPlacementInfo();
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

function setNpcPlacementTarget(npcId) {
  state.selectedNpcId = npcId || null;
  updateNpcPlacementInfo();
  renderNpcPickerList();
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

function renderNpcPickerList() {
  if (!npcPickerListEl) return;
  npcPickerListEl.innerHTML = '';
  if (!state.npcs.length) {
    const empty = document.createElement('p');
    empty.textContent = 'No NPCs available. Create one in the NPCs tab.';
    npcPickerListEl.appendChild(empty);
    return;
  }
  const zoneLookup = new Map(state.zones.map(zone => [zone.id, zone.name || zone.id]));
  state.npcs
    .slice()
    .sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id))
    .forEach(npc => {
      const item = document.createElement('div');
      item.className = 'npc-picker';
      if (npc.id === state.selectedNpcId) {
        item.classList.add('active');
      }

      const preview = document.createElement('div');
      preview.className = 'npc-picker-preview';
      if (npc.sprite) {
        const img = document.createElement('img');
        img.src = npc.sprite;
        img.alt = `${npc.name || npc.id} sprite`;
        img.loading = 'lazy';
        preview.appendChild(img);
      } else {
        const placeholder = document.createElement('span');
        placeholder.textContent = 'NPC';
        preview.appendChild(placeholder);
      }
      item.appendChild(preview);

      const details = document.createElement('div');
      details.className = 'npc-picker-details';
      const title = document.createElement('strong');
      title.textContent = npc.name || npc.id;
      details.appendChild(title);
      const idLine = document.createElement('span');
      idLine.textContent = npc.id;
      details.appendChild(idLine);
      const position = document.createElement('span');
      position.className = 'npc-picker-position';
      if (npc.zoneId && Number.isFinite(npc.x) && Number.isFinite(npc.y)) {
        const zoneName = zoneLookup.get(npc.zoneId) || npc.zoneId;
        position.textContent = `${zoneName} (${npc.x}, ${npc.y})`;
      } else {
        position.textContent = 'Unplaced';
      }
      details.appendChild(position);
      item.appendChild(details);

      const actions = document.createElement('div');
      actions.className = 'actions';

      const selectButton = document.createElement('button');
      selectButton.type = 'button';
      selectButton.textContent = 'Select';
      selectButton.addEventListener('click', () => {
        setNpcPlacementTarget(npc.id);
        setActiveTab('world');
        setEditMode('npc');
      });
      actions.appendChild(selectButton);

      const editButton = document.createElement('button');
      editButton.type = 'button';
      editButton.textContent = 'Edit';
      editButton.addEventListener('click', () => {
        selectNpc(npc.id);
        setActiveTab('npcs');
      });
      actions.appendChild(editButton);

      item.appendChild(actions);
      npcPickerListEl.appendChild(item);
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
  const paletteRows = Number(state.activePalette?.rows) || DEFAULT_PALETTE_ROWS;
  const paletteColumns = Number(state.activePalette?.columns) || DEFAULT_PALETTE_COLUMNS;
  const paletteLayout = Array.isArray(state.paletteLayout)
    ? state.paletteLayout.map(row =>
        Array.isArray(row) ? row.map(tileId => (tileId != null ? String(tileId) : null)) : []
      )
    : [];
  const paletteTiles = Array.isArray(state.activePalette?.tiles)
    ? state.activePalette.tiles.map(tile => ({
        tileId: tile.tileId,
        row: Number.isInteger(tile.row) ? tile.row : 0,
        column: Number.isInteger(tile.column) ? tile.column : 0,
      }))
    : [];
  const world = {
    id: state.world.id || 'new_world',
    name: state.world.name || 'New World',
    tileSize: Number(state.world.tileSize) || 0,
    palette: { ...state.palette },
    tileConfig: Object.fromEntries(
      Object.entries(state.tileConfig).map(([id, config]) => [id, { ...config }])
    ),
    paletteRows,
    paletteColumns,
    paletteLayout,
    paletteTiles,
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
  const exportedNpcs = state.npcs.map(npc => {
    const dialog = exportNpcDialog(npc.dialog);
    const payload = {
      id: npc.id,
      name: npc.name || npc.id,
      sprite: npc.sprite || undefined,
      facing: npc.facing || 'down',
      zoneId: npc.zoneId || null,
      x: Number.isFinite(npc.x) ? npc.x : null,
      y: Number.isFinite(npc.y) ? npc.y : null,
    };
    if (dialog) {
      payload.dialog = dialog;
    }
    const service = exportNpcService(npc.service);
    if (service) {
      payload.service = service;
    }
    return payload;
  });
  if (exportedNpcs.length) {
    world.npcs = exportedNpcs;
  }
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
  const layoutSource = Array.isArray(worldSource.paletteLayout) ? worldSource.paletteLayout : [];
  const positionMap = new Map();
  layoutSource.forEach((row, rowIndex) => {
    if (!Array.isArray(row)) {
      return;
    }
    row.forEach((tileId, columnIndex) => {
      if (tileId !== null && tileId !== undefined && tileId !== '') {
        positionMap.set(String(tileId), { row: rowIndex, column: columnIndex });
      }
    });
  });
  if (Array.isArray(worldSource.paletteTiles)) {
    worldSource.paletteTiles.forEach(entry => {
      if (!entry || typeof entry !== 'object') {
        return;
      }
      const tileId = String(entry.tileId || entry.id || '').trim();
      if (!tileId) {
        return;
      }
      const rowValue = Number(entry.row);
      const columnValue = Number(entry.column);
      if (Number.isInteger(rowValue) && Number.isInteger(columnValue)) {
        positionMap.set(tileId, { row: rowValue, column: columnValue });
      }
    });
  }
  const loadedRows = normalizePaletteDimension(worldSource.paletteRows, DEFAULT_PALETTE_ROWS);
  const loadedColumns = normalizePaletteDimension(worldSource.paletteColumns, DEFAULT_PALETTE_COLUMNS);
  const loadedPalette = {
    _id: null,
    name: worldSource.paletteName || state.activePalette?.name || 'Loaded Palette',
    description: worldSource.paletteDescription || '',
    rows: loadedRows,
    columns: loadedColumns,
    tiles: [],
  };
  let paletteIndex = 0;
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
    const position = positionMap.get(String(tileId));
    const row = Number.isInteger(position?.row)
      ? position.row
      : Math.floor(paletteIndex / loadedColumns);
    const column = Number.isInteger(position?.column)
      ? position.column
      : paletteIndex % loadedColumns;
    loadedPalette.tiles.push({
      tileId: String(tileId),
      sprite,
      fill,
      walkable,
      row,
      column,
    });
    paletteIndex += 1;
  });
  if (!loadedPalette.tiles.length) {
    const defaultPalette = createDefaultPalette();
    loadedPalette.tiles = defaultPalette.tiles.map(tile => ({ ...tile }));
    loadedPalette.rows = defaultPalette.rows;
    loadedPalette.columns = defaultPalette.columns;
  }
  setActivePalette(loadedPalette, { skipSelect: true, skipZone: true });
  state.selectedPaletteId = null;
  renderPaletteSelect();

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
  resetTransportSelection({ keepTwoWay: false });
  const npcSource = Array.isArray(worldSource.npcs) ? worldSource.npcs : [];
  const usedNpcIds = new Set();
  state.npcs = npcSource.map((entry, index) => {
    const baseId = entry && entry.id ? String(entry.id) : entry && entry.name ? String(entry.name) : `npc_${index + 1}`;
    const id = ensureUniqueNpcId(baseId, usedNpcIds);
    const name = typeof entry?.name === 'string' ? entry.name : id;
    const sprite = typeof entry?.sprite === 'string' && entry.sprite.trim() ? entry.sprite.trim() : null;
    const facingRaw = typeof entry?.facing === 'string' ? entry.facing.toLowerCase() : '';
    const facing = ['up', 'down', 'left', 'right'].includes(facingRaw) ? facingRaw : 'down';
    const dialog = cloneNpcDialog(entry?.dialog);
    const zoneIdRaw = typeof entry?.zoneId === 'string' && entry.zoneId.trim() ? entry.zoneId.trim() : null;
    const zone = zoneIdRaw ? state.zones.find(z => z.id === zoneIdRaw) : null;
    const clampCoord = (value, max) => {
      if (!Number.isFinite(value) || max == null || max <= 0) {
        return null;
      }
      return Math.max(0, Math.min(max - 1, Math.round(value)));
    };
    const numericX = Number(entry?.x);
    const numericY = Number(entry?.y);
    const x = zone ? clampCoord(numericX, zone.width) : null;
    const y = zone ? clampCoord(numericY, zone.height) : null;
    return {
      id,
      name,
      sprite,
      facing,
      dialog,
      zoneId: zone ? zone.id : null,
      x,
      y,
      service: cloneNpcService(entry?.service),
    };
  });
  state.selectedNpcId = null;
  state.editingNpcId = null;
  renderTilePalette();
  renderZonesList();
  renderZoneEditor();
  updateTransportOptions();
  renderNpcList();
  updateNpcPlacementInfo();
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
      const blank = createDefaultPalette();
      blank._id = null;
      blank.tiles = [];
      state.activePalette = blank;
      state.selectedPaletteId = null;
      setPaletteInputsFromState();
      rebuildPaletteState();
      renderTilePalette();
      renderPaletteGrid();
      renderPaletteSelect();
      updateSelectedSpriteControls();
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
    renderNpcList();
    updateNpcPlacementInfo();
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
