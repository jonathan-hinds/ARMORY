let currentPlayer = null;
let characters = [];
let currentCharacter = null;
let abilityCatalog = [];
let abilityCatalogPromise = null;
let rotation = [];
let rotationInitialized = false;
let rotationDamageType = 'melee';
let rotationViewMode = 'planner';
let rotationTabsInitialized = false;

const rotationDamageTypeSelect = document.getElementById('rotation-damage-type');

function normalizeDamageType(value) {
  return value === 'magic' ? 'magic' : 'melee';
}

function basicAttackTypeLabel(value) {
  const normalized = normalizeDamageType(value);
  return normalized === 'magic' ? 'Magic' : 'Physical';
}

function formatBasicAttackName(baseName, typeValue) {
  const label = basicAttackTypeLabel(typeValue);
  return `${baseName} (${label})`;
}

function setRotationDamageType(value) {
  rotationDamageType = normalizeDamageType(value);
  if (rotationDamageTypeSelect) {
    rotationDamageTypeSelect.value = rotationDamageType;
  }
  if (rotationInitialized) {
    renderAbilityPool();
  }
}

if (rotationDamageTypeSelect) {
  setRotationDamageType(rotationDamageTypeSelect.value || rotationDamageType);
  rotationDamageTypeSelect.addEventListener('change', e => {
    setRotationDamageType(e.target.value);
  });
}

const EQUIPMENT_SLOTS = ['weapon', 'helmet', 'chest', 'legs', 'feet', 'hands'];
const USEABLE_SLOTS = ['useable1', 'useable2'];
const SLOT_LABELS = {
  weapon: 'Weapon',
  helmet: 'Helmet',
  chest: 'Chest',
  legs: 'Legs',
  feet: 'Feet',
  hands: 'Hands',
  useable: 'Useable Item',
  useable1: 'Useable Slot 1',
  useable2: 'Useable Slot 2',
  material: 'Material',
};
const STAT_KEYS = ['strength', 'stamina', 'agility', 'intellect', 'wisdom'];
const RESOURCE_LABELS = { health: 'HP', mana: 'MP', stamina: 'Stamina' };
const CHANCE_LABELS = {
  critChance: 'Crit Chance',
  blockChance: 'Block Chance',
  dodgeChance: 'Dodge Chance',
  hitChance: 'Hit Chance',
};
const CHANCE_CAPS = { critChance: 50, blockChance: 30, dodgeChance: 30, hitChance: 100 };
const HIT_BASE = 75;
const HIT_RANGE = CHANCE_CAPS.hitChance - HIT_BASE;
const HIT_SCALE = 45;

function saturatingChance(value, cap, scale) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return cap * (1 - Math.exp(-value / scale));
}

function computeCritChanceLocal(attributes) {
  const agility = attributes.agility || 0;
  const strength = attributes.strength || 0;
  const combined = agility * 0.65 + strength * 0.35;
  return saturatingChance(combined, CHANCE_CAPS.critChance, 60);
}

function computeBlockChanceLocal(attributes) {
  const stamina = attributes.stamina || 0;
  const strength = attributes.strength || 0;
  const combined = stamina * 0.7 + strength * 0.3;
  return saturatingChance(combined, CHANCE_CAPS.blockChance, 70);
}

function computeDodgeChanceLocal(attributes) {
  const wisdom = attributes.wisdom || 0;
  const stamina = attributes.stamina || 0;
  const combined = wisdom * 0.55 + stamina * 0.45;
  return saturatingChance(combined, CHANCE_CAPS.dodgeChance, 65);
}

function computeHitChanceLocal(attributes) {
  const agility = attributes.agility || 0;
  const intellect = attributes.intellect || 0;
  const combined = agility * 0.6 + intellect * 0.4;
  return HIT_BASE + saturatingChance(combined, HIT_RANGE, HIT_SCALE);
}

let equipmentCatalog = null;
let catalogPromise = null;
let equipmentIndex = null;
let materialsCatalog = [];
let materialIndex = null;
let inventoryView = null;
let inventoryPromise = null;
let stashView = null;
let stashPromise = null;
let stashDialog = null;
let stashKeyHandler = null;
let tabsInitialized = false;
let jobStatusCache = null;
let jobStatusPromise = null;

let adventureStatus = null;
let adventurePollTimer = null;
let adventureTickTimer = null;
let adventurePollInFlight = false;
let adventureElements = null;
let adventureSelectedDays = null;

let dungeonSource = null;
let dungeonState = null;
let dungeonDialog = null;
let dungeonBars = null;
let dungeonBossBars = null;
let dungeonLogElement = null;
let dungeonCloseButton = null;
let matchmakingState = null;
let battlefieldState = null;
let battlefieldElements = null;
let battlefieldPollTimer = null;
let battlefieldTickTimer = null;
let battlefieldPollInFlight = false;
let battlefieldResourcePromise = null;

let worldInitialized = false;
let worldEntering = false;
let worldCurrentWorldId = null;
let worldCurrentInstanceId = null;
let worldConfig = null;
let worldPlayersState = new Map();
let worldEnemiesState = new Map();
let worldNpcsState = new Map();
let worldStreamSource = null;
let worldQueueSource = null;
let worldQueueState = null;
let worldMovementPending = false;
let worldMovementLocked = false;
let worldLastMoveAt = 0;
let worldMoveCooldownMs = 180;
let worldCanvas = null;
let worldCtx = null;
let worldStatusEl = null;
let worldMessageEl = null;
let worldPlayerListEl = null;
let worldTitleEl = null;
const WORLD_VISIBLE_TILES = 16;
let worldDpadEl = null;
let worldLobbyStatusEl = null;
let worldWorldSelectEl = null;
let worldPartySizeSelectEl = null;
let worldQueueButton = null;
let worldLeaveQueueButton = null;
let worldReadyButton = null;
let worldReadyPanelEl = null;
let worldReadyListEl = null;
let worldReadyStatusEl = null;
let worldAnimationFrame = null;
let worldDpadActiveDirection = null;
let worldDpadRepeatTimer = null;
let worldDpadPointerId = null;
let worldDpadLastPointerTs = 0;
let worldResizeListenerAttached = false;
let worldDpadBlurListenerAttached = false;
const worldSpriteCache = new Map();
let worldTileSpriteRefs = new Map();
let worldOptionsLoaded = false;
let worldEncounterSource = null;
let worldBattleDialog = null;
let worldBattleBars = null;
let worldBattleBossBars = null;
let worldBattleLogEl = null;
let worldBattleCloseButton = null;
let worldDialogState = null;
let worldInteractPending = false;
let worldCanvasFocusActive = false;
let worldFocusExitButton = null;
let worldFocusControlsInitialized = false;
let worldZoneMap = new Map();
let worldCurrentZoneId = null;
const worldEntityMotion = new Map();

function worldNow() {
  if (typeof performance !== 'undefined' && performance && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

function worldMotionDuration() {
  const fallback = 180;
  const duration = Number.isFinite(worldMoveCooldownMs) ? worldMoveCooldownMs : fallback;
  return Math.max(80, duration);
}

function smoothStep(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t);
}

function getWorldMotionKeyForPlayer(id) {
  return `player:${String(id)}`;
}

function getWorldMotionKeyForEnemy(id) {
  return `enemy:${String(id)}`;
}

function getWorldMotionPosition(motion, timestamp = worldNow()) {
  if (!motion) return null;
  const {
    startX,
    startY,
    targetX,
    targetY,
    startTs,
    endTs,
  } = motion;
  if (!Number.isFinite(targetX) || !Number.isFinite(targetY)) {
    return null;
  }
  if (!Number.isFinite(startTs) || !Number.isFinite(endTs) || endTs <= startTs) {
    return { x: targetX, y: targetY };
  }
  const nowTs = Number.isFinite(timestamp) ? timestamp : worldNow();
  const total = endTs - startTs;
  const progressRaw = (nowTs - startTs) / total;
  if (progressRaw >= 1) {
    return { x: targetX, y: targetY };
  }
  if (progressRaw <= 0) {
    return { x: startX, y: startY };
  }
  const eased = smoothStep(progressRaw);
  const x = startX + (targetX - startX) * eased;
  const y = startY + (targetY - startY) * eased;
  return { x, y };
}

function updateWorldEntityMotion(key, targetX, targetY, options = {}) {
  if (!key || !Number.isFinite(targetX) || !Number.isFinite(targetY)) return;
  const nowTs = worldNow();
  const duration = worldMotionDuration();
  const existing = worldEntityMotion.get(key);
  const immediate = options.immediate === true;
  if (!existing || immediate) {
    worldEntityMotion.set(key, {
      startX: targetX,
      startY: targetY,
      targetX,
      targetY,
      startTs: nowTs,
      endTs: nowTs,
    });
    return;
  }
  const currentPos = getWorldMotionPosition(existing, nowTs);
  const startX = currentPos ? currentPos.x : existing.targetX;
  const startY = currentPos ? currentPos.y : existing.targetY;
  const deltaTarget = Math.abs(targetX - existing.targetX) + Math.abs(targetY - existing.targetY);
  const distanceFromStart = Math.abs(targetX - startX) + Math.abs(targetY - startY);
  const teleport = deltaTarget > 1.5 || distanceFromStart > 2;
  if (teleport || distanceFromStart < 1e-3) {
    worldEntityMotion.set(key, {
      startX: targetX,
      startY: targetY,
      targetX,
      targetY,
      startTs: nowTs,
      endTs: nowTs,
    });
    return;
  }
  worldEntityMotion.set(key, {
    startX,
    startY,
    targetX,
    targetY,
    startTs: nowTs,
    endTs: nowTs + duration,
  });
}

function getWorldEntityDisplayPosition(entry, key) {
  if (!entry) return null;
  const fallback = { x: entry.x, y: entry.y };
  if (!key) return fallback;
  const motion = worldEntityMotion.get(key);
  if (!motion) return fallback;
  const pos = getWorldMotionPosition(motion);
  if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) {
    return fallback;
  }
  return pos;
}

function shouldUseWorldFocusLayout() {
  if (typeof window !== 'undefined') {
    if (typeof window.matchMedia === 'function') {
      if (window.matchMedia('(pointer: coarse)').matches) {
        return true;
      }
      if (window.matchMedia('(max-width: 1024px)').matches) {
        return true;
      }
    }
    if (typeof window.innerWidth === 'number' && window.innerWidth <= 1024) {
      return true;
    }
  }
  return false;
}

function setWorldCanvasFocus(active, options = {}) {
  const requested = !!active;
  const canEnable = requested && shouldUseWorldFocusLayout();
  const nextActive = requested && canEnable;
  if (!nextActive) {
    if (worldCanvasFocusActive) {
      worldCanvasFocusActive = false;
      document.body.classList.remove('world-canvas-focused');
      requestAnimationFrame(() => {
        resizeWorldCanvas();
      });
    } else {
      document.body.classList.remove('world-canvas-focused');
      if (options.forceResize) {
        requestAnimationFrame(() => {
          resizeWorldCanvas();
        });
      }
    }
    return;
  }
  if (worldCanvasFocusActive) {
    if (options.forceResize) {
      requestAnimationFrame(() => {
        resizeWorldCanvas();
      });
    }
    return;
  }
  worldCanvasFocusActive = true;
  document.body.classList.add('world-canvas-focused');
  if (options.scroll !== false && worldCanvas) {
    requestAnimationFrame(() => {
      try {
        worldCanvas.scrollIntoView({ block: 'center', behavior: 'smooth' });
      } catch (_err) {
        worldCanvas.scrollIntoView({ block: 'center' });
      }
    });
  }
  requestAnimationFrame(() => {
    resizeWorldCanvas();
  });
}

function ensureWorldFocusControls() {
  if (!worldFocusExitButton) {
    worldFocusExitButton = document.getElementById('world-exit-focus');
    if (worldFocusExitButton) {
      worldFocusExitButton.addEventListener('click', () => {
        setWorldCanvasFocus(false);
      });
    }
  }
  if (worldCanvas && !worldCanvas.dataset.worldFocusBound) {
    worldCanvas.dataset.worldFocusBound = 'true';
    worldCanvas.addEventListener('pointerdown', handleWorldCanvasFocusPointer);
    worldCanvas.addEventListener('keydown', handleWorldCanvasFocusKeydown);
  }
  if (!worldFocusControlsInitialized) {
    document.addEventListener('keydown', handleWorldFocusEscape);
    worldFocusControlsInitialized = true;
  }
}

function handleWorldCanvasFocusPointer(event) {
  if (event && event.pointerType === 'mouse' && !shouldUseWorldFocusLayout()) {
    return;
  }
  if (!worldCanvasFocusActive && shouldUseWorldFocusLayout()) {
    setWorldCanvasFocus(true);
    if (worldCanvas && typeof worldCanvas.focus === 'function') {
      try {
        worldCanvas.focus({ preventScroll: true });
      } catch (_err) {
        worldCanvas.focus();
      }
    }
  }
}

function handleWorldCanvasFocusKeydown(event) {
  if (!event) return;
  const key = event.key;
  if ((key === 'Enter' || key === ' ') && !worldCanvasFocusActive) {
    event.preventDefault();
    setWorldCanvasFocus(true);
  } else if (key === 'Escape' && worldCanvasFocusActive) {
    setWorldCanvasFocus(false);
  }
}

function handleWorldFocusEscape(event) {
  if (event && event.key === 'Escape' && worldCanvasFocusActive) {
    setWorldCanvasFocus(false);
  }
}

const adventurePreviewCache = new Map();
const adventurePreviewViews = new Map();
const ADVENTURE_PREVIEW_TTL = 30000;
const DUNGEON_FORGING_MESSAGE = 'Match found! Forging dungeon boss...';
const DUNGEON_FORGING_DETAIL = 'Calibrating encounter parameters.';

function xpForNextLevel(level) {
  return level * 100;
}

function computeDerived(character) {
  const attr = character.attributes || {};
  const strength = attr.strength || 0;
  const stamina = attr.stamina || 0;
  const agility = attr.agility || 0;
  const intellect = attr.intellect || 0;
  const wisdom = attr.wisdom || 0;
  const attackInterval = 2.0 + 3 * Math.exp(-0.1 * agility);
  const critChance = computeCritChanceLocal(attr);
  const blockChance = computeBlockChanceLocal(attr);
  const dodgeChance = computeDodgeChanceLocal(attr);
  const hitChance = computeHitChanceLocal(attr);
  const normalizedAttributes = {
    strength,
    stamina,
    agility,
    intellect,
    wisdom,
  };
  return {
    minMeleeAttack: strength * 2,
    maxMeleeAttack: strength * 2 + 4,
    minMagicAttack: intellect * 2,
    maxMagicAttack: intellect * 2 + 4,
    attackIntervalSeconds: attackInterval,
    health: 100 + stamina * 10,
    mana: 50 + wisdom * 8,
    stamina: 50 + stamina * 8,
    critChance,
    blockChance,
    dodgeChance,
    hitChance,
    chanceBonuses: { critChance: 0, blockChance: 0, dodgeChance: 0, hitChance: 0 },
    attributes: normalizedAttributes,
  };
}

function slotLabel(slot) {
  return SLOT_LABELS[slot] || (slot ? slot.charAt(0).toUpperCase() + slot.slice(1) : '');
}

function isUseableSlot(slot) {
  return USEABLE_SLOTS.includes(slot);
}

function isUseableItem(item) {
  return item && item.slot === 'useable';
}

function isMaterial(item) {
  return item && (item.kind === 'material' || item.slot === 'material');
}

function statLabel(stat) {
  if (!stat) return '';
  return stat.charAt(0).toUpperCase() + stat.slice(1);
}

function titleCase(value) {
  if (!value) return '';
  return value
    .split(/[\s_]+/)
    .map(part => (part ? part.charAt(0).toUpperCase() + part.slice(1) : ''))
    .join(' ')
    .trim();
}

const WORLD_KEY_MAP = {
  w: 'up',
  arrowup: 'up',
  s: 'down',
  arrowdown: 'down',
  a: 'left',
  arrowleft: 'left',
  d: 'right',
  arrowright: 'right',
};

function updateWorldStatus(text) {
  if (worldStatusEl) {
    worldStatusEl.textContent = text || '';
  }
}

function updateWorldPlayerList() {
  if (!worldPlayerListEl) return;
  worldPlayerListEl.innerHTML = '';
  if (!worldPlayersState.size) {
    const empty = document.createElement('li');
    empty.textContent = 'No adventurers in sight.';
    empty.className = 'empty';
    worldPlayerListEl.appendChild(empty);
    return;
  }
  const entries = Array.from(worldPlayersState.values()).sort((a, b) => {
    const nameA = (a && a.name) || '';
    const nameB = (b && b.name) || '';
    return nameA.localeCompare(nameB);
  });
  entries.forEach(entry => {
    if (!entry) return;
    const li = document.createElement('li');
    if (currentCharacter && entry.characterId === currentCharacter.id) {
      li.classList.add('you');
    }
    const nameSpan = document.createElement('span');
    nameSpan.textContent = entry.name || `Adventurer ${entry.characterId}`;
    li.appendChild(nameSpan);
    const coord = document.createElement('span');
    coord.className = 'player-coords';
    const x = Number.isFinite(entry.x) ? entry.x : 0;
    const y = Number.isFinite(entry.y) ? entry.y : 0;
    const zoneLabel = entry.zoneId
      ? (worldZoneMap.get(entry.zoneId)?.name || entry.zoneId)
      : null;
    coord.textContent = zoneLabel ? `${zoneLabel} (${x}, ${y})` : `(${x}, ${y})`;
    li.appendChild(coord);
    worldPlayerListEl.appendChild(li);
  });
}

function resetWorldState() {
  setWorldCanvasFocus(false);
  if (worldStreamSource) {
    worldStreamSource.close();
    worldStreamSource = null;
  }
  if (worldQueueSource) {
    worldQueueSource.close();
    worldQueueSource = null;
  }
  if (worldEncounterSource) {
    worldEncounterSource.close();
    worldEncounterSource = null;
  }
  closeWorldEncounterDialog();
  closeWorldDialog();
  worldPlayersState = new Map();
  worldEnemiesState = new Map();
  worldNpcsState = new Map();
  worldEntityMotion.clear();
  worldConfig = null;
  worldCurrentWorldId = null;
  worldCurrentInstanceId = null;
  worldQueueState = null;
  setWorldQueueUIState('idle');
  worldTileSpriteRefs = new Map();
  worldZoneMap = new Map();
  worldCurrentZoneId = null;
  worldMovementPending = false;
  worldMovementLocked = false;
  worldDialogState = null;
  worldInteractPending = false;
  worldLastMoveAt = 0;
  clearWorldDpadHold();
  updateWorldStatus(currentCharacter ? 'Disconnected' : 'Select a character');
  if (worldTitleEl) {
    worldTitleEl.textContent = 'Exploration';
  }
  if (worldMessageEl) {
    clearMessage(worldMessageEl);
  }
  updateWorldPlayerList();
}

function ensureWorldCanvas() {
  if (!worldCanvas) {
    worldCanvas = document.getElementById('world-canvas');
    if (worldCanvas) {
      worldCtx = worldCanvas.getContext('2d');
      if (worldCtx) {
        worldCtx.imageSmoothingEnabled = false;
      }
    }
  }
  if (worldCanvas) {
    if (!worldResizeListenerAttached) {
      window.addEventListener('resize', resizeWorldCanvas);
      worldResizeListenerAttached = true;
    }
    resizeWorldCanvas();
  }
  if (!worldDpadBlurListenerAttached) {
    window.addEventListener('blur', clearWorldDpadHold);
    worldDpadBlurListenerAttached = true;
  }
  if (!worldStatusEl) {
    worldStatusEl = document.getElementById('world-status');
  }
  if (!worldMessageEl) {
    worldMessageEl = document.getElementById('world-message');
  }
  if (!worldPlayerListEl) {
    worldPlayerListEl = document.getElementById('world-player-list');
  }
  if (!worldTitleEl) {
    worldTitleEl = document.getElementById('world-title');
  }
  ensureWorldFocusControls();
  ensureWorldTouchControls();
  ensureWorldLobbyControls();
}

async function refreshWorldOptions() {
  if (!worldWorldSelectEl || worldOptionsLoaded) return;
  try {
    const res = await fetch('/worlds');
    if (!res.ok) {
      throw new Error('Failed to load worlds');
    }
    const data = await res.json();
    const worlds = Array.isArray(data.worlds) ? data.worlds : [];
    worldWorldSelectEl.innerHTML = '';
    if (!worlds.length) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'No worlds available';
      worldWorldSelectEl.appendChild(opt);
      worldWorldSelectEl.disabled = true;
    } else {
      worlds.forEach((world, idx) => {
        if (!world || !world.id) return;
        const opt = document.createElement('option');
        opt.value = world.id;
        opt.textContent = world.name || `World ${idx + 1}`;
        worldWorldSelectEl.appendChild(opt);
      });
      worldWorldSelectEl.disabled = false;
    }
    worldOptionsLoaded = true;
  } catch (err) {
    console.error('Failed to load world options', err);
    if (worldWorldSelectEl) {
      worldWorldSelectEl.innerHTML = '';
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'Unavailable';
      worldWorldSelectEl.appendChild(opt);
      worldWorldSelectEl.disabled = true;
    }
  }
}

function updateWorldLobbyMessage(message, isError = false) {
  if (!worldLobbyStatusEl) return;
  if (!message) {
    clearMessage(worldLobbyStatusEl);
  } else {
    showMessage(worldLobbyStatusEl, message, isError);
  }
}

function ensureWorldLobbyControls() {
  if (!worldLobbyStatusEl) {
    worldLobbyStatusEl = document.getElementById('world-lobby-status');
  }
  if (!worldWorldSelectEl) {
    worldWorldSelectEl = document.getElementById('world-select');
    worldOptionsLoaded = false;
    refreshWorldOptions();
  }
  if (!worldPartySizeSelectEl) {
    worldPartySizeSelectEl = document.getElementById('world-party-size');
  }
  if (!worldQueueButton) {
    worldQueueButton = document.getElementById('world-queue-btn');
    if (worldQueueButton) {
      worldQueueButton.addEventListener('click', startWorldQueue);
    }
  }
  if (!worldLeaveQueueButton) {
    worldLeaveQueueButton = document.getElementById('world-leave-btn');
    if (worldLeaveQueueButton) {
      worldLeaveQueueButton.addEventListener('click', leaveWorldQueue);
    }
  }
  if (!worldReadyButton) {
    worldReadyButton = document.getElementById('world-ready-btn');
    if (worldReadyButton) {
      worldReadyButton.addEventListener('click', readyWorldQueue);
    }
  }
  if (!worldReadyPanelEl) {
    worldReadyPanelEl = document.getElementById('world-ready-panel');
  }
  if (!worldReadyListEl) {
    worldReadyListEl = document.getElementById('world-ready-party');
  }
  if (!worldReadyStatusEl) {
    worldReadyStatusEl = document.getElementById('world-ready-status');
  }
}

function resizeWorldCanvas() {
  if (!worldCanvas) return;
  const displayWidth = Math.floor(worldCanvas.clientWidth);
  const displayHeight = Math.floor(worldCanvas.clientHeight);
  if (!displayWidth || !displayHeight) return;
  const dpr = window.devicePixelRatio || 1;
  const nextWidth = Math.max(1, Math.round(displayWidth * dpr));
  const nextHeight = Math.max(1, Math.round(displayHeight * dpr));
  if (worldCanvas.width !== nextWidth || worldCanvas.height !== nextHeight) {
    worldCanvas.width = nextWidth;
    worldCanvas.height = nextHeight;
    if (!worldCtx) {
      worldCtx = worldCanvas.getContext('2d');
    }
    if (worldCtx) {
      worldCtx.imageSmoothingEnabled = false;
    }
  }
}

function ensureWorldTouchControls() {
  if (worldDpadEl && !document.body.contains(worldDpadEl)) {
    worldDpadEl = null;
  }
  if (!worldDpadEl) {
    worldDpadEl = document.getElementById('world-dpad');
    if (worldDpadEl && !worldDpadEl.dataset.worldDpadBound) {
      worldDpadEl.addEventListener('contextmenu', event => {
        event.preventDefault();
      });
      worldDpadEl.dataset.worldDpadBound = 'true';
    }
  }
  if (!worldDpadEl) return;
  const buttons = worldDpadEl.querySelectorAll('button[data-direction]');
  buttons.forEach(button => {
    if (button.dataset.worldDpadBound === 'true') return;
    button.dataset.worldDpadBound = 'true';
    button.addEventListener('pointerdown', handleWorldDpadPointerDown);
    button.addEventListener('pointerup', handleWorldDpadPointerUp);
    button.addEventListener('pointerleave', handleWorldDpadPointerUp);
    button.addEventListener('pointercancel', handleWorldDpadPointerUp);
    button.addEventListener('click', handleWorldDpadClick);
  });
}

function startWorldDpadHold(direction) {
  if (!direction) return;
  worldDpadActiveDirection = direction;
  queueWorldMove(direction);
  if (worldDpadRepeatTimer) {
    clearInterval(worldDpadRepeatTimer);
  }
  const repeatDelay = Math.max(120, worldMoveCooldownMs);
  worldDpadRepeatTimer = setInterval(() => {
    if (!worldDpadActiveDirection) return;
    queueWorldMove(worldDpadActiveDirection);
  }, repeatDelay);
}

function clearWorldDpadHold() {
  worldDpadActiveDirection = null;
  if (worldDpadRepeatTimer) {
    clearInterval(worldDpadRepeatTimer);
    worldDpadRepeatTimer = null;
  }
  if (worldDpadPointerId != null) {
    window.removeEventListener('pointerup', handleWorldDpadWindowPointerUp);
    window.removeEventListener('pointercancel', handleWorldDpadWindowPointerUp);
    worldDpadPointerId = null;
  }
}

function handleWorldDpadPointerDown(event) {
  if (!isTabActive('world')) return;
  const button = event.currentTarget;
  const direction = button && button.getAttribute('data-direction');
  if (!direction) return;
  clearWorldDpadHold();
  worldDpadLastPointerTs = Date.now();
  worldDpadPointerId = typeof event.pointerId === 'number' ? event.pointerId : null;
  if (typeof button.setPointerCapture === 'function' && worldDpadPointerId != null) {
    try {
      button.setPointerCapture(worldDpadPointerId);
    } catch (err) {
      // ignore capture errors
    }
  }
  event.preventDefault();
  startWorldDpadHold(direction);
  if (worldDpadPointerId != null) {
    window.addEventListener('pointerup', handleWorldDpadWindowPointerUp);
    window.addEventListener('pointercancel', handleWorldDpadWindowPointerUp);
  }
}

function handleWorldDpadPointerUp(event) {
  worldDpadLastPointerTs = Date.now();
  const button = event.currentTarget;
  if (
    button &&
    typeof event.pointerId === 'number' &&
    typeof button.releasePointerCapture === 'function'
  ) {
    try {
      button.releasePointerCapture(event.pointerId);
    } catch (err) {
      // ignore release errors
    }
  }
  clearWorldDpadHold();
}

function handleWorldDpadWindowPointerUp(event) {
  if (worldDpadPointerId == null) return;
  if (typeof event.pointerId === 'number' && event.pointerId !== worldDpadPointerId) {
    return;
  }
  worldDpadLastPointerTs = Date.now();
  clearWorldDpadHold();
}

function handleWorldDpadClick(event) {
  const button = event.currentTarget;
  const direction = button && button.getAttribute('data-direction');
  if (!direction) return;
  const now = Date.now();
  if (now - worldDpadLastPointerTs < 250) {
    return;
  }
  event.preventDefault();
  queueWorldMove(direction);
}

function setWorldQueueUIState(mode = 'idle') {
  if (worldQueueButton) {
    if (mode === 'idle') {
      worldQueueButton.disabled = !currentCharacter;
      worldQueueButton.textContent = 'Find Party';
    } else if (mode === 'queued') {
      worldQueueButton.disabled = true;
      worldQueueButton.textContent = 'Matching...';
    } else if (mode === 'matched') {
      worldQueueButton.disabled = true;
      worldQueueButton.textContent = 'Match Found';
    } else if (mode === 'starting') {
      worldQueueButton.disabled = true;
      worldQueueButton.textContent = 'Starting...';
    }
  }
  if (worldLeaveQueueButton) {
    if (mode === 'idle') {
      worldLeaveQueueButton.classList.add('hidden');
      worldLeaveQueueButton.disabled = false;
      worldLeaveQueueButton.textContent = 'Leave Queue';
    } else if (mode === 'queued' || mode === 'matched') {
      worldLeaveQueueButton.classList.remove('hidden');
      worldLeaveQueueButton.disabled = false;
      worldLeaveQueueButton.textContent = 'Leave Queue';
    } else {
      worldLeaveQueueButton.classList.remove('hidden');
      worldLeaveQueueButton.disabled = true;
      worldLeaveQueueButton.textContent = 'Starting...';
    }
  }
  if (worldReadyButton) {
    if (mode === 'matched') {
      worldReadyButton.classList.remove('hidden');
      const alreadyReady =
        worldQueueState && Array.isArray(worldQueueState.readyIds)
          ? worldQueueState.readyIds.includes(currentCharacter && currentCharacter.id)
          : false;
      worldReadyButton.disabled = alreadyReady;
      worldReadyButton.textContent = alreadyReady ? 'Ready' : 'Ready Up';
    } else {
      worldReadyButton.classList.add('hidden');
      worldReadyButton.disabled = false;
      worldReadyButton.textContent = 'Ready Up';
    }
  }
  if (worldReadyPanelEl) {
    if (mode === 'matched') {
      worldReadyPanelEl.classList.remove('hidden');
    } else {
      worldReadyPanelEl.classList.add('hidden');
    }
  }
}

function updateWorldReadyPanel() {
  if (!worldReadyListEl) return;
  worldReadyListEl.innerHTML = '';
  const state = worldQueueState;
  if (!state || !Array.isArray(state.party) || !state.party.length) {
    if (worldReadyPanelEl) {
      worldReadyPanelEl.classList.add('hidden');
    }
    if (worldReadyStatusEl) {
      worldReadyStatusEl.textContent = '';
    }
    return;
  }
  const readyIds = Array.isArray(state.readyIds) ? state.readyIds.map(id => Number(id)) : [];
  state.party.forEach(member => {
    if (!member) return;
    const li = document.createElement('li');
    li.textContent = `${member.name || 'Adventurer'} (Lv ${member.level || 1})`;
    if (currentCharacter && member.id === currentCharacter.id) {
      li.classList.add('you');
    }
    if (readyIds.includes(member.id)) {
      li.classList.add('ready');
    }
    worldReadyListEl.appendChild(li);
  });
  if (worldReadyStatusEl) {
    const readyCount = Number.isFinite(state.ready) ? state.ready : readyIds.length;
    const total = Number.isFinite(state.size) ? state.size : state.party.length;
    worldReadyStatusEl.textContent = `Ready: ${readyCount} / ${total}`;
  }
  if (worldReadyPanelEl) {
    worldReadyPanelEl.classList.remove('hidden');
  }
  setWorldQueueUIState('matched');
}

function stopWorldQueue(message = '', isError = false) {
  if (worldQueueSource) {
    worldQueueSource.close();
    worldQueueSource = null;
  }
  worldQueueState = null;
  setWorldQueueUIState('idle');
  updateWorldReadyPanel();
  updateWorldLobbyMessage(message, isError);
}

function handleWorldQueueEvent(data) {
  if (!data) return;
  if (data.type === 'queued') {
    worldQueueState = {
      status: 'queued',
      worldId: data.worldId || (worldQueueState && worldQueueState.worldId) || null,
      worldName: data.worldName || null,
      size: Number.isFinite(data.size) ? data.size : (worldQueueState && worldQueueState.size) || 1,
      ready: 0,
      readyIds: [],
      party: [],
    };
    setWorldQueueUIState('queued');
    updateWorldLobbyMessage('Searching for party...', false);
    return;
  }
  if (data.type === 'matched') {
    worldQueueState = {
      status: 'matched',
      worldId: data.worldId || (worldQueueState && worldQueueState.worldId) || null,
      worldName: data.worldName || null,
      size: Number.isFinite(data.size) ? data.size : (worldQueueState && worldQueueState.size) || 1,
      matchId: data.matchId || null,
      ready: Number.isFinite(data.ready) ? data.ready : 0,
      readyIds: Array.isArray(data.readyIds) ? data.readyIds.slice() : [],
      party: Array.isArray(data.party) ? data.party.slice() : [],
    };
    updateWorldLobbyMessage('Party found! Ready up to embark.', false);
    updateWorldReadyPanel();
    return;
  }
  if (data.type === 'ready') {
    if (!worldQueueState) return;
    worldQueueState.ready = Number.isFinite(data.ready) ? data.ready : worldQueueState.ready || 0;
    worldQueueState.readyIds = Array.isArray(data.readyIds) ? data.readyIds.slice() : worldQueueState.readyIds || [];
    updateWorldReadyPanel();
    return;
  }
  if (data.type === 'start') {
    const worldId = data.worldId || (worldQueueState && worldQueueState.worldId) || (worldWorldSelectEl && worldWorldSelectEl.value);
    if (data.party) {
      worldQueueState = {
        status: 'starting',
        worldId,
        worldName: data.worldName || null,
        matchId: data.matchId || null,
        ready: worldQueueState && worldQueueState.ready,
        readyIds: worldQueueState && worldQueueState.readyIds,
        party: Array.isArray(data.party) ? data.party.slice() : [],
        size: Array.isArray(data.party) ? data.party.length : worldQueueState && worldQueueState.size,
      };
    }
    setWorldQueueUIState('starting');
    updateWorldLobbyMessage('Entering world...', false);
    if (worldQueueSource) {
      worldQueueSource.close();
      worldQueueSource = null;
    }
    worldQueueState = null;
    const instanceId = data.instanceId || null;
    if (worldId && instanceId) {
      enterWorldInstance(worldId, instanceId, data.world || null);
    }
    return;
  }
  if (data.type === 'cancelled') {
    stopWorldQueue(data.message || 'World queue cancelled.', true);
    return;
  }
  if (data.type === 'error') {
    stopWorldQueue(data.message || 'World queue error.', true);
  }
}

function startWorldQueue() {
  if (!currentCharacter) {
    updateWorldLobbyMessage('Select a character to form a party.', true);
    return;
  }
  if (worldCurrentInstanceId) {
    updateWorldLobbyMessage('Leave your current world before forming a new party.', true);
    return;
  }
  if (worldQueueSource) return;
  if (!worldWorldSelectEl || !worldWorldSelectEl.value) {
    updateWorldLobbyMessage('Select a world first.', true);
    return;
  }
  const worldId = worldWorldSelectEl.value;
  const sizeValue = worldPartySizeSelectEl ? parseInt(worldPartySizeSelectEl.value, 10) : 1;
  const size = Number.isFinite(sizeValue) ? Math.max(1, Math.min(5, sizeValue)) : 1;
  setWorldQueueUIState('queued');
  updateWorldLobbyMessage('Searching for party...', false);
  const url = `/worlds/${encodeURIComponent(worldId)}/queue?characterId=${currentCharacter.id}&size=${size}`;
  const es = new EventSource(url);
  worldQueueSource = es;
  worldQueueState = {
    status: 'queued',
    worldId,
    size,
    ready: 0,
    readyIds: [],
    party: [],
  };
  es.onmessage = ev => {
    if (!ev || !ev.data) return;
    try {
      const data = JSON.parse(ev.data);
      handleWorldQueueEvent(data);
    } catch (err) {
      console.error('World queue parse failed', err);
    }
  };
  es.onerror = () => {
    stopWorldQueue('World queue connection lost.', true);
  };
}

async function leaveWorldQueue() {
  if (!currentCharacter) return;
  const state = worldQueueState;
  if (!state || !state.worldId) {
    stopWorldQueue();
    return;
  }
  if (worldLeaveQueueButton) {
    worldLeaveQueueButton.disabled = true;
    worldLeaveQueueButton.textContent = 'Leaving...';
  }
  try {
    await postJSON(`/worlds/${encodeURIComponent(state.worldId)}/cancel`, {
      characterId: currentCharacter.id,
    });
    stopWorldQueue('Left world queue.', false);
  } catch (err) {
    console.error('Failed to leave world queue', err);
    updateWorldLobbyMessage(err.message || 'Failed to leave queue.', true);
    setWorldQueueUIState(state.status || 'queued');
  }
}

async function readyWorldQueue() {
  if (!currentCharacter) return;
  if (!worldQueueState || !worldQueueState.worldId || !worldQueueState.matchId) return;
  if (worldReadyButton) {
    worldReadyButton.disabled = true;
    worldReadyButton.textContent = 'Ready';
  }
  try {
    const payload = await postJSON(`/worlds/${encodeURIComponent(worldQueueState.worldId)}/ready`, {
      characterId: currentCharacter.id,
      matchId: worldQueueState.matchId,
    });
    if (payload && Array.isArray(payload.readyIds)) {
      worldQueueState.ready = Number.isFinite(payload.ready) ? payload.ready : worldQueueState.ready;
      worldQueueState.readyIds = payload.readyIds.slice();
      updateWorldReadyPanel();
    }
    updateWorldLobbyMessage('Ready confirmed. Awaiting allies...', false);
  } catch (err) {
    console.error('Failed to ready for world', err);
    updateWorldLobbyMessage(err.message || 'Failed to ready up.', true);
    if (worldReadyButton) {
      worldReadyButton.disabled = false;
      worldReadyButton.textContent = 'Ready Up';
    }
  }
}

function getWorldSprite(src) {
  if (!src) return null;
  if (!worldSpriteCache.has(src)) {
    const img = new Image();
    img.src = src;
    img.onload = () => {
      renderWorldScene();
    };
    worldSpriteCache.set(src, img);
  }
  return worldSpriteCache.get(src);
}

function prepareWorldAssets(world) {
  worldTileSpriteRefs = new Map();
  if (!world || !world.tileConfig || typeof world.tileConfig !== 'object') {
    return;
  }
  Object.entries(world.tileConfig).forEach(([key, value]) => {
    if (!value || typeof value !== 'object') return;
    if (typeof value.sprite === 'string' && value.sprite.trim()) {
      const img = getWorldSprite(value.sprite.trim());
      if (img) {
        worldTileSpriteRefs.set(String(key), img);
      }
    }
  });
}

function initializeWorldZones(world) {
  worldZoneMap = new Map();
  if (world && Array.isArray(world.zones)) {
    world.zones.forEach(zone => {
      if (!zone || !zone.id) return;
      const safeId = String(zone.id);
      worldZoneMap.set(safeId, {
        id: safeId,
        name: zone.name || safeId,
        tiles: Array.isArray(zone.tiles) ? zone.tiles : [],
        transports: Array.isArray(zone.transports) ? zone.transports : [],
        spawn: zone.spawn || null,
      });
    });
  }
  const defaultZoneId = world && world.defaultZoneId && worldZoneMap.has(world.defaultZoneId)
    ? world.defaultZoneId
    : worldZoneMap.size
      ? worldZoneMap.keys().next().value
      : null;
  worldCurrentZoneId = defaultZoneId || null;
}

function setActiveWorldZone(zoneId, options = {}) {
  let nextZoneId = zoneId;
  if (nextZoneId && !worldZoneMap.has(nextZoneId)) {
    nextZoneId = null;
  }
  if (!nextZoneId) {
    if (worldConfig && worldConfig.defaultZoneId && worldZoneMap.has(worldConfig.defaultZoneId)) {
      nextZoneId = worldConfig.defaultZoneId;
    } else if (worldZoneMap.size) {
      nextZoneId = worldZoneMap.keys().next().value;
    } else {
      nextZoneId = null;
    }
  }
  if (!options.force && nextZoneId === worldCurrentZoneId) {
    return;
  }
  worldCurrentZoneId = nextZoneId;
  renderWorldScene();
}

function strokeTile(tileConfigEntry, drawX, drawY, tileSize, fallback) {
  if (!worldCtx) return;
  if (!tileConfigEntry) return;
  const { stroke } = tileConfigEntry;
  if (!stroke) return;
  worldCtx.save();
  worldCtx.strokeStyle = typeof stroke === 'string' ? stroke : fallback;
  worldCtx.strokeRect(drawX + 0.5, drawY + 0.5, tileSize, tileSize);
  worldCtx.restore();
}

function drawMonochromeTile(tile, tileConfigEntry, drawX, drawY, tileSize) {
  if (!worldCtx) return;
  const base = tileConfigEntry && typeof tileConfigEntry.fill === 'string' ? tileConfigEntry.fill : null;
  let fill = base;
  if (!fill) {
    fill = tile === 0 ? '#000000' : '#ffffff';
  }
  worldCtx.fillStyle = fill;
  worldCtx.fillRect(drawX, drawY, tileSize, tileSize);
  strokeTile(tileConfigEntry, drawX, drawY, tileSize, fill === '#000000' ? '#ffffff' : '#000000');
  if (tile === 2) {
    const inset = Math.max(1, Math.floor(tileSize / 4));
    const accent = fill === '#000000' ? '#ffffff' : '#000000';
    worldCtx.fillStyle = accent;
    worldCtx.fillRect(drawX + inset, drawY + Math.floor(tileSize / 2) - 1, tileSize - inset * 2, 2);
    worldCtx.fillRect(drawX + Math.floor(tileSize / 2) - 1, drawY + inset, 2, tileSize - inset * 2);
  }
}

function renderWorldScene() {
  if (!worldCanvas || !worldCtx) return;
  const { width, height } = worldCanvas;
  worldCtx.fillStyle = '#ffffff';
  worldCtx.fillRect(0, 0, width, height);
  const activeZone = worldCurrentZoneId && worldZoneMap.has(worldCurrentZoneId)
    ? worldZoneMap.get(worldCurrentZoneId)
    : null;
  const tilesSource = activeZone && Array.isArray(activeZone.tiles)
    ? activeZone.tiles
    : worldConfig && Array.isArray(worldConfig.tiles)
      ? worldConfig.tiles
      : null;
  if (!tilesSource || !tilesSource.length) {
    return;
  }
  const tiles = tilesSource;
  const mapHeight = tiles.length;
  const mapWidth = tiles[0] ? tiles[0].length : 0;
  const visibleTiles = WORLD_VISIBLE_TILES;
  const tileSize = Math.max(1, Math.floor(Math.min(width, height) / visibleTiles));
  const renderWidth = tileSize * visibleTiles;
  const renderHeight = tileSize * visibleTiles;
  const offsetX = Math.floor((width - renderWidth) / 2);
  const offsetY = Math.floor((height - renderHeight) / 2);
  const you = currentCharacter ? worldPlayersState.get(currentCharacter.id) : null;
  const youMotionKey = you ? getWorldMotionKeyForPlayer(you.characterId) : null;
  const youDisplay = you ? getWorldEntityDisplayPosition(you, youMotionKey) : null;
  const fallbackSpawn = activeZone && activeZone.spawn
    ? activeZone.spawn
    : worldConfig && worldConfig.spawn
      ? worldConfig.spawn
      : null;
  const fallbackCenterX = fallbackSpawn ? fallbackSpawn.x + 0.5 : mapWidth / 2;
  const fallbackCenterY = fallbackSpawn ? fallbackSpawn.y + 0.5 : mapHeight / 2;
  const cameraX = youDisplay ? youDisplay.x + 0.5 : you ? you.x + 0.5 : fallbackCenterX;
  const cameraY = youDisplay ? youDisplay.y + 0.5 : you ? you.y + 0.5 : fallbackCenterY;
  const halfTiles = visibleTiles / 2;
  const startX = Math.floor(cameraX - halfTiles) - 1;
  const endX = Math.ceil(cameraX + halfTiles) + 1;
  const startY = Math.floor(cameraY - halfTiles) - 1;
  const endY = Math.ceil(cameraY + halfTiles) + 1;
  const palette = worldConfig.palette || {};
  const tileConfig = worldConfig.tileConfig || {};

  for (let y = startY; y <= endY; y += 1) {
    if (y < 0 || y >= tiles.length) continue;
    const row = tiles[y];
    if (!Array.isArray(row)) continue;
    for (let x = startX; x <= endX; x += 1) {
      if (x < 0 || x >= row.length) continue;
      const tile = row[x];
      const tileKey = String(tile);
      const relativeX = x + 0.5 - cameraX;
      const relativeY = y + 0.5 - cameraY;
      const drawX = Math.round(offsetX + renderWidth / 2 + relativeX * tileSize - tileSize / 2);
      const drawY = Math.round(offsetY + renderHeight / 2 + relativeY * tileSize - tileSize / 2);
      const tileConfigEntry = tileConfig[tileKey];
      const sprite = worldTileSpriteRefs.get(tileKey);
      if (sprite && sprite.complete && sprite.naturalWidth > 0 && sprite.naturalHeight > 0) {
        worldCtx.drawImage(sprite, drawX, drawY, tileSize, tileSize);
        strokeTile(tileConfigEntry, drawX, drawY, tileSize, '#000000');
      } else {
        let color = palette[tileKey];
        if (typeof color === 'string' && /^#(?:0{3}|f{3}|0{6}|f{6})$/i.test(color)) {
          color = color.length === 4 ? (color.toLowerCase() === '#000' ? '#000000' : '#ffffff') : color.toLowerCase();
        } else {
          color = null;
        }
        drawMonochromeTile(tile, Object.assign({}, tileConfigEntry, color ? { fill: color } : {}), drawX, drawY, tileSize);
      }
    }
  }

  const drawNameplate = (text, centerX, topY, options = {}) => {
    if (!text) return;
    const safeText = String(text);
    const baseOffset = Math.max(6, Math.floor(tileSize * 0.25));
    let baseY = topY - baseOffset;
    const fontSize = Math.max(14, Math.floor(tileSize * 0.45));
    const paddingX = Math.max(4, Math.floor(fontSize / 3));
    const paddingY = Math.max(2, Math.floor(fontSize / 4));
    worldCtx.save();
    worldCtx.font = `bold ${fontSize}px "Courier New", monospace`;
    worldCtx.textAlign = 'center';
    worldCtx.textBaseline = 'middle';
    const measured = worldCtx.measureText(safeText);
    const textWidth = Number.isFinite(measured.width) ? Math.ceil(measured.width) : safeText.length * fontSize;
    const rectWidth = textWidth + paddingX * 2;
    const rectHeight = fontSize + paddingY * 2;
    let rectX = Math.round(centerX - rectWidth / 2);
    if (rectX < 4) rectX = 4;
    if (rectX + rectWidth > width - 4) rectX = width - rectWidth - 4;
    if (baseY - rectHeight < 4) {
      baseY = rectHeight + 4;
    }
    const rectY = Math.round(baseY - rectHeight);
    const isEnemy = options.isEnemy;
    const backgroundColor = isEnemy ? '#ffffff' : '#000000';
    const borderColor = isEnemy ? '#000000' : '#ffffff';
    const textColor = isEnemy ? '#000000' : '#ffffff';
    worldCtx.fillStyle = backgroundColor;
    worldCtx.fillRect(rectX, rectY, rectWidth, rectHeight);
    worldCtx.strokeStyle = borderColor;
    worldCtx.lineWidth = Math.max(1, Math.floor(fontSize / 10));
    worldCtx.strokeRect(rectX + 0.5, rectY + 0.5, rectWidth, rectHeight);
    worldCtx.fillStyle = textColor;
    worldCtx.fillText(safeText, Math.round(centerX), rectY + rectHeight / 2);
    worldCtx.restore();
  };

  const drawEntity = (entry, options = {}) => {
    if (!entry || !Number.isFinite(entry.x) || !Number.isFinite(entry.y)) return;
    const motionKey = options.motionKey || null;
    const display = motionKey ? getWorldEntityDisplayPosition(entry, motionKey) : null;
    const entityX = display && Number.isFinite(display.x) ? display.x : entry.x;
    const entityY = display && Number.isFinite(display.y) ? display.y : entry.y;
    const screenX = offsetX + renderWidth / 2 + (entityX + 0.5 - cameraX) * tileSize;
    const screenY = offsetY + renderHeight / 2 + (entityY + 0.5 - cameraY) * tileSize;
    if (screenX < -tileSize || screenX > width + tileSize || screenY < -tileSize || screenY > height + tileSize) return;
    const baseSize = Math.max(12, Math.floor(tileSize * 0.65));
    let size = baseSize;
    let drawLeft = Math.round(screenX - size / 2);
    let drawTop = Math.round(screenY - size / 2);
    worldCtx.save();
    worldCtx.lineWidth = Math.max(1, Math.floor(size / 8));
    if (options.isEnemy) {
      const sprite = entry.sprite ? getWorldSprite(entry.sprite) : null;
      if (
        sprite &&
        sprite.complete &&
        sprite.naturalWidth > 0 &&
        sprite.naturalHeight > 0
      ) {
        size = Math.max(tileSize, baseSize);
        drawLeft = Math.round(screenX - size / 2);
        drawTop = Math.round(screenY - size / 2);
        worldCtx.drawImage(sprite, drawLeft, drawTop, size, size);
      } else {
        worldCtx.fillStyle = '#ffffff';
        worldCtx.fillRect(drawLeft, drawTop, size, size);
        worldCtx.strokeStyle = '#000000';
        worldCtx.strokeRect(drawLeft + 0.5, drawTop + 0.5, size, size);
        const innerSize = Math.max(4, Math.floor(size / 2));
        const innerLeft = Math.round(drawLeft + (size - innerSize) / 2);
        const innerTop = Math.round(drawTop + (size - innerSize) / 2);
        worldCtx.fillStyle = '#000000';
        worldCtx.fillRect(innerLeft, innerTop, innerSize, innerSize);
      }
    } else if (options.isNpc) {
      const sprite = entry.sprite ? getWorldSprite(entry.sprite) : null;
      if (
        sprite &&
        sprite.complete &&
        sprite.naturalWidth > 0 &&
        sprite.naturalHeight > 0
      ) {
        size = Math.max(tileSize, baseSize);
        drawLeft = Math.round(screenX - size / 2);
        drawTop = Math.round(screenY - size / 2);
        worldCtx.drawImage(sprite, drawLeft, drawTop, size, size);
      } else {
        worldCtx.fillStyle = '#ffffff';
        worldCtx.fillRect(drawLeft, drawTop, size, size);
        worldCtx.strokeStyle = '#000000';
        worldCtx.strokeRect(drawLeft + 0.5, drawTop + 0.5, size, size);
        const accentSize = Math.max(4, Math.floor(size / 3));
        const accentLeft = Math.round(drawLeft + (size - accentSize) / 2);
        const accentTop = Math.round(drawTop + (size - accentSize) / 2);
        worldCtx.fillStyle = '#000000';
        worldCtx.fillRect(accentLeft, accentTop, accentSize, accentSize);
      }
    } else {
      const fill = options.isYou ? '#ffffff' : '#000000';
      const border = options.isYou ? '#000000' : '#ffffff';
      worldCtx.fillStyle = fill;
      worldCtx.fillRect(drawLeft, drawTop, size, size);
      worldCtx.strokeStyle = border;
      worldCtx.strokeRect(drawLeft + 0.5, drawTop + 0.5, size, size);
    }
    worldCtx.restore();
    const label = entry.name || (options.isEnemy ? 'Foe' : options.isNpc ? 'Resident' : 'Adventurer');
    drawNameplate(label, screenX, drawTop, options);
  };

  worldEnemiesState.forEach(entry => {
    if (entry && entry.zoneId && worldCurrentZoneId && entry.zoneId !== worldCurrentZoneId) return;
    const motionKey = entry && entry.id ? getWorldMotionKeyForEnemy(entry.id) : null;
    drawEntity(entry, { isEnemy: true, motionKey });
  });
  worldNpcsState.forEach(entry => {
    if (entry && entry.zoneId && worldCurrentZoneId && entry.zoneId !== worldCurrentZoneId) return;
    drawEntity(entry, { isNpc: true });
  });
  worldPlayersState.forEach(entry => {
    if (entry && entry.zoneId && worldCurrentZoneId && entry.zoneId !== worldCurrentZoneId) return;
    const isYou = currentCharacter && entry && entry.characterId === currentCharacter.id;
    const motionKey = entry && entry.characterId ? getWorldMotionKeyForPlayer(entry.characterId) : null;
    drawEntity(entry, { isYou, motionKey });
  });

  drawWorldDialog();
}

function wrapDialogText(ctx, text, maxWidth) {
  if (!ctx) return [text];
  const safe = typeof text === 'string' ? text.trim() : String(text || '');
  if (!safe) {
    return [''];
  }
  const words = safe.split(/\s+/).filter(Boolean);
  if (!words.length) {
    return [''];
  }
  const lines = [];
  let current = words[0];
  for (let i = 1; i < words.length; i += 1) {
    const word = words[i];
    const candidate = `${current} ${word}`;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) {
    lines.push(current);
  }
  return lines.length ? lines : [''];
}

function drawWorldDialog() {
  if (!worldCanvas || !worldCtx) return;
  if (!worldDialogState || !Array.isArray(worldDialogState.lines) || !worldDialogState.lines.length) {
    return;
  }
  const { width, height } = worldCanvas;
  const padding = Math.max(12, Math.floor(Math.min(width, height) / 30));
  const baseFontSize = Math.max(16, Math.floor(Math.min(width, height) / 26));
  const lineHeight = Math.floor(baseFontSize * 1.25);
  const baseBoxHeight = Math.max(Math.floor(height * 0.22), lineHeight * 3 + padding * 2);
  const maxBoxHeight = Math.min(Math.floor(height * 0.45), height - padding * 2);
  const nameText = worldDialogState.name ? `${worldDialogState.name}:` : '';

  worldCtx.save();
  worldCtx.font = `bold ${baseFontSize}px "Courier New", monospace`;
  const headerHeight = nameText ? lineHeight : 0;
  const availableTextHeight = Math.max(
    lineHeight,
    Math.min(maxBoxHeight, baseBoxHeight) - padding * 2 - headerHeight,
  );
  worldCtx.font = `${baseFontSize}px "Courier New", monospace`;
  const maxLines = Math.max(1, Math.floor(availableTextHeight / lineHeight));
  const activeLineIndex = Math.min(
    worldDialogState.index,
    worldDialogState.lines.length - 1,
  );
  const activeLine = worldDialogState.lines[activeLineIndex] || '';
  const maxTextWidth = width - padding * 4;
  const wrappedLines = wrapDialogText(worldCtx, activeLine, maxTextWidth);
  const visibleLines = wrappedLines.slice(0, maxLines);
  const contentHeight = headerHeight + visibleLines.length * lineHeight;
  const computedHeight = padding * 2 + contentHeight;
  const boxHeight = Math.max(
    Math.min(Math.max(baseBoxHeight, computedHeight), maxBoxHeight),
    padding * 2 + lineHeight,
  );
  const boxWidth = width - padding * 2;
  const boxX = padding;
  const boxY = height - boxHeight - padding;

  worldCtx.fillStyle = '#ffffff';
  worldCtx.fillRect(boxX, boxY, boxWidth, boxHeight);
  worldCtx.strokeStyle = '#000000';
  worldCtx.lineWidth = Math.max(2, Math.floor(baseFontSize / 5));
  worldCtx.strokeRect(boxX + 0.5, boxY + 0.5, boxWidth, boxHeight);

  worldCtx.fillStyle = '#000000';
  worldCtx.textAlign = 'left';
  worldCtx.textBaseline = 'top';
  let cursorY = boxY + padding;
  if (nameText) {
    worldCtx.font = `bold ${baseFontSize}px "Courier New", monospace`;
    worldCtx.fillText(nameText, boxX + padding, cursorY);
    cursorY += lineHeight;
  }
  worldCtx.font = `${baseFontSize}px "Courier New", monospace`;
  visibleLines.forEach(line => {
    worldCtx.fillText(line, boxX + padding, cursorY);
    cursorY += lineHeight;
  });

  const indicatorSize = Math.max(10, Math.floor(baseFontSize * 0.8));
  const indicatorX = boxX + boxWidth - padding - indicatorSize;
  const indicatorY = boxY + boxHeight - padding - indicatorSize;
  if (worldDialogState.index < worldDialogState.lines.length - 1) {
    worldCtx.beginPath();
    worldCtx.moveTo(indicatorX, indicatorY);
    worldCtx.lineTo(indicatorX + indicatorSize, indicatorY);
    worldCtx.lineTo(indicatorX + indicatorSize / 2, indicatorY + indicatorSize);
    worldCtx.closePath();
    worldCtx.fill();
  } else {
    const dotSize = Math.max(4, Math.floor(indicatorSize / 3));
    worldCtx.fillRect(indicatorX + indicatorSize - dotSize, indicatorY + indicatorSize - dotSize, dotSize, dotSize);
  }
  worldCtx.restore();
}

function closeWorldDialog() {
  worldDialogState = null;
  worldMovementLocked = false;
}

function advanceWorldDialog() {
  if (!worldDialogState) {
    return;
  }
  const nextIndex = worldDialogState.index + 1;
  if (nextIndex >= worldDialogState.lines.length) {
    closeWorldDialog();
  } else {
    worldDialogState.index = nextIndex;
  }
}

function startWorldRenderLoop() {
  if (!worldCanvas || !worldCtx) return;
  if (worldAnimationFrame) {
    cancelAnimationFrame(worldAnimationFrame);
  }
  const tick = () => {
    renderWorldScene();
    worldAnimationFrame = requestAnimationFrame(tick);
  };
  worldAnimationFrame = requestAnimationFrame(tick);
}

function handleWorldStateUpdate(data) {
  if (!data) return;
  const prevPlayersState = worldPlayersState;
  const prevEnemiesState = worldEnemiesState;
  if (Array.isArray(data.players)) {
    const next = new Map();
    const activeMotionKeys = new Set();
    data.players.forEach(player => {
      if (!player || !Number.isFinite(player.characterId)) return;
      const zoneId = typeof player.zoneId === 'string' && player.zoneId ? player.zoneId : null;
      const prevEntry = prevPlayersState instanceof Map ? prevPlayersState.get(player.characterId) : null;
      const prevZoneId = prevEntry ? prevEntry.zoneId || null : null;
      next.set(player.characterId, {
        characterId: player.characterId,
        name: player.name || `Adventurer ${player.characterId}`,
        x: Number.isFinite(player.x) ? player.x : 0,
        y: Number.isFinite(player.y) ? player.y : 0,
        facing: player.facing || 'down',
        zoneId,
      });
      const entry = next.get(player.characterId);
      const motionKey = getWorldMotionKeyForPlayer(entry.characterId);
      const zoneChanged = prevZoneId !== zoneId;
      const teleport = prevEntry
        ? Math.abs((prevEntry.x || 0) - entry.x) + Math.abs((prevEntry.y || 0) - entry.y) > 1.5
        : false;
      updateWorldEntityMotion(motionKey, entry.x, entry.y, {
        immediate: !prevEntry || zoneChanged || teleport,
      });
      activeMotionKeys.add(motionKey);
    });
    if (prevPlayersState instanceof Map) {
      prevPlayersState.forEach((_, id) => {
        const motionKey = getWorldMotionKeyForPlayer(id);
        if (!activeMotionKeys.has(motionKey)) {
          worldEntityMotion.delete(motionKey);
        }
      });
    }
    worldPlayersState = next;
    updateWorldPlayerList();
    if (currentCharacter && worldPlayersState.has(currentCharacter.id)) {
      const selfEntry = worldPlayersState.get(currentCharacter.id);
      setActiveWorldZone(selfEntry.zoneId);
    }
  }
  if (Object.prototype.hasOwnProperty.call(data, 'enemies')) {
    const nextEnemies = new Map();
    const activeEnemyKeys = new Set();
    if (Array.isArray(data.enemies)) {
      data.enemies.forEach(enemy => {
        if (!enemy || !enemy.id) return;
        const zoneId = typeof enemy.zoneId === 'string' && enemy.zoneId ? enemy.zoneId : null;
        const prevEnemy = prevEnemiesState instanceof Map ? prevEnemiesState.get(enemy.id) : null;
        const prevZoneId = prevEnemy ? prevEnemy.zoneId || null : null;
        nextEnemies.set(enemy.id, {
          id: enemy.id,
          name: enemy.name || 'Foe',
          x: Number.isFinite(enemy.x) ? enemy.x : 0,
          y: Number.isFinite(enemy.y) ? enemy.y : 0,
          facing: enemy.facing || 'down',
          zoneId,
          sprite:
            typeof enemy.sprite === 'string' && enemy.sprite.trim()
              ? enemy.sprite.trim()
              : null,
        });
        const entry = nextEnemies.get(enemy.id);
        const motionKey = getWorldMotionKeyForEnemy(entry.id);
        const zoneChanged = prevZoneId !== zoneId;
        const teleport = prevEnemy
          ? Math.abs((prevEnemy.x || 0) - entry.x) + Math.abs((prevEnemy.y || 0) - entry.y) > 1.5
          : false;
        updateWorldEntityMotion(motionKey, entry.x, entry.y, {
          immediate: !prevEnemy || zoneChanged || teleport,
        });
        activeEnemyKeys.add(motionKey);
      });
    }
    if (prevEnemiesState instanceof Map) {
      prevEnemiesState.forEach((_, id) => {
        const motionKey = getWorldMotionKeyForEnemy(id);
        if (!activeEnemyKeys.has(motionKey)) {
          worldEntityMotion.delete(motionKey);
        }
      });
    }
    worldEnemiesState = nextEnemies;
  }
  if (Object.prototype.hasOwnProperty.call(data, 'npcs')) {
    const nextNpcs = new Map();
    if (Array.isArray(data.npcs)) {
      data.npcs.forEach(npc => {
        if (!npc || !npc.id) return;
        const zoneId = typeof npc.zoneId === 'string' && npc.zoneId ? npc.zoneId : null;
        nextNpcs.set(npc.id, {
          id: npc.id,
          name: npc.name || 'Resident',
          x: Number.isFinite(npc.x) ? npc.x : 0,
          y: Number.isFinite(npc.y) ? npc.y : 0,
          facing: npc.facing || 'down',
          zoneId,
          sprite: typeof npc.sprite === 'string' && npc.sprite.trim() ? npc.sprite.trim() : null,
        });
      });
    }
    worldNpcsState = nextNpcs;
  }
  const phase = data.phase || 'explore';
  if (phase === 'encounter') {
    updateWorldStatus('Encounter!');
  } else if (!worldMovementLocked) {
    updateWorldStatus('Roaming');
  }
}

function startWorldStream(worldId, instanceId) {
  if (!worldId || !instanceId || !currentCharacter) return;
  if (worldStreamSource) {
    worldStreamSource.close();
    worldStreamSource = null;
  }
  const url = `/worlds/${encodeURIComponent(worldId)}/stream?characterId=${currentCharacter.id}&instanceId=${encodeURIComponent(
    instanceId,
  )}`;
  const es = new EventSource(url);
  es.onmessage = ev => {
    if (!ev || !ev.data) return;
    try {
      const data = JSON.parse(ev.data);
      if (data.type === 'state') {
        handleWorldStateUpdate(data);
      } else if (data.type === 'encounter' && data.token) {
        beginWorldEncounter(data.token);
      } else if (data.type === 'error' && worldMessageEl) {
        showMessage(worldMessageEl, data.message || 'World connection error.', true);
      }
    } catch (err) {
      console.error('world stream parse failed', err);
    }
  };
  es.onerror = () => {
    es.close();
    worldStreamSource = null;
    updateWorldStatus('Reconnecting...');
    setTimeout(() => {
      if (
        isTabActive('world') &&
        currentCharacter &&
        !worldStreamSource &&
        worldCurrentWorldId &&
        worldCurrentInstanceId
      ) {
        startWorldStream(worldCurrentWorldId, worldCurrentInstanceId);
      }
    }, 1500);
  };
  worldStreamSource = es;
}

async function enterWorldInstance(worldId, instanceId, worldPayload = null) {
  if (!currentCharacter || !worldId || !instanceId) return;
  if (worldEntering) return;
  worldEntering = true;
  updateWorldStatus('Connecting...');
  try {
    const payload = await postJSON(`/worlds/${encodeURIComponent(worldId)}/join`, {
      characterId: currentCharacter.id,
      instanceId,
    });
    const world = payload.world || worldPayload || null;
    worldCurrentWorldId = world && world.id ? world.id : worldId;
    worldCurrentInstanceId = payload.instanceId || instanceId;
    worldConfig = world;
    prepareWorldAssets(world);
    initializeWorldZones(world);
    setActiveWorldZone(worldCurrentZoneId, { force: true });
    worldMoveCooldownMs = world && Number.isFinite(world.moveCooldownMs) ? world.moveCooldownMs : 180;
    handleWorldStateUpdate(payload);
    if (worldTitleEl && world && world.name) {
      worldTitleEl.textContent = world.name;
    }
    if (worldWorldSelectEl && worldCurrentWorldId) {
      worldWorldSelectEl.value = worldCurrentWorldId;
    }
    updateWorldStatus('Roaming');
    updateWorldLobbyMessage('', false);
    setWorldQueueUIState('idle');
    startWorldStream(worldCurrentWorldId, worldCurrentInstanceId);
    startWorldRenderLoop();
  } catch (err) {
    console.error('world connection failed', err);
    updateWorldStatus('Unavailable');
    updateWorldLobbyMessage(err.message || 'Failed to enter world.', true);
    setWorldQueueUIState('idle');
  } finally {
    worldEntering = false;
  }
}

function handleWorldKeydown(event) {
  if (!isTabActive('world')) return;
  if (!currentCharacter || !worldCurrentWorldId) return;
  const target = event.target;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
    return;
  }
  const key = (event.key || event.code || '').toLowerCase();
  if (key === 'escape') {
    if (worldDialogState) {
      event.preventDefault();
      closeWorldDialog();
    }
    return;
  }
  if (key === 'enter' || key === ' ' || key === 'spacebar' || key === 'space' || key === 'z' || key === 'e') {
    event.preventDefault();
    triggerWorldInteract();
    return;
  }
  const direction = WORLD_KEY_MAP[key];
  if (!direction) return;
  event.preventDefault();
  queueWorldMove(direction);
}

async function triggerWorldInteract() {
  if (!currentCharacter || !worldCurrentWorldId || !worldCurrentInstanceId) return;
  if (worldDialogState) {
    advanceWorldDialog();
    return;
  }
  if (worldInteractPending) return;
  worldInteractPending = true;
  try {
    const payload = await postJSON(`/worlds/${encodeURIComponent(worldCurrentWorldId)}/interact`, {
      characterId: currentCharacter.id,
      instanceId: worldCurrentInstanceId,
    });
    if (payload && payload.result === 'npc' && payload.npc) {
      const npc = payload.npc;
      const dialogLines = Array.isArray(npc.dialog)
        ? npc.dialog
            .map(line => (typeof line === 'string' ? line.trim() : ''))
            .filter(line => line.length > 0)
        : [];
      const lines = dialogLines.length ? dialogLines : ['...'];
      worldDialogState = {
        npcId: npc.id || null,
        name: npc.name || 'Resident',
        lines,
        index: 0,
      };
      worldMovementLocked = true;
    } else if (payload && payload.result === 'none') {
      // No interaction available; do nothing.
    }
  } catch (err) {
    if (worldMessageEl) {
      showMessage(worldMessageEl, err.message || 'Interaction failed.', true);
    }
  } finally {
    worldInteractPending = false;
  }
}

async function queueWorldMove(direction) {
  if (!currentCharacter || !worldCurrentWorldId || !worldCurrentInstanceId) return;
  if (worldMovementPending || worldMovementLocked) return;
  const now = Date.now();
  if (now - worldLastMoveAt < worldMoveCooldownMs) return;
  worldMovementPending = true;
  try {
    const payload = await postJSON(`/worlds/${encodeURIComponent(worldCurrentWorldId)}/move`, {
      characterId: currentCharacter.id,
      instanceId: worldCurrentInstanceId,
      direction,
    });
    worldLastMoveAt = Date.now();
    if (payload && payload.position) {
      const zoneId = payload.position.zoneId || (worldPlayersState.get(currentCharacter.id)?.zoneId ?? null);
      const you = {
        characterId: currentCharacter.id,
        name: currentCharacter.name,
        x: Number.isFinite(payload.position.x) ? payload.position.x : 0,
        y: Number.isFinite(payload.position.y) ? payload.position.y : 0,
        facing: payload.position.facing || 'down',
        zoneId,
      };
      worldPlayersState.set(currentCharacter.id, you);
      updateWorldPlayerList();
      setActiveWorldZone(zoneId);
    }
    if (payload && payload.encounter && payload.encounter.token) {
      beginWorldEncounter(payload.encounter.token);
    }
  } catch (err) {
    if (worldMessageEl) {
      showMessage(worldMessageEl, err.message || 'Movement failed.', true);
    }
  } finally {
    worldMovementPending = false;
  }
}

function closeWorldEncounterDialog() {
  if (worldBattleCloseButton) {
    worldBattleCloseButton.removeEventListener('click', closeWorldEncounterDialog);
  }
  if (worldBattleDialog && worldBattleDialog.parentNode) {
    worldBattleDialog.parentNode.removeChild(worldBattleDialog);
  }
  worldBattleDialog = null;
  worldBattleBars = null;
  worldBattleBossBars = null;
  worldBattleLogEl = null;
  worldBattleCloseButton = null;
}

function appendWorldEncounterLogs(entries, partyIds, bossId) {
  if (!worldBattleLogEl || !Array.isArray(entries)) return;
  entries.forEach(entry => {
    if (!entry || !entry.message) return;
    const line = document.createElement('div');
    line.classList.add('log-message');
    const type = classifyDungeonLogEntry(entry, partyIds, bossId);
    line.classList.add(type || 'neutral');
    line.textContent = entry.message;
    worldBattleLogEl.appendChild(line);
  });
  worldBattleLogEl.scrollTop = worldBattleLogEl.scrollHeight;
}

function openWorldEncounterDialog(data) {
  closeWorldEncounterDialog();
  const dialog = document.createElement('div');
  dialog.id = 'world-encounter-dialog';
  dialog.innerHTML = `
    <div class="dialog-box">
      <div class="combatants-row dungeon-combatants-row">
        <div class="dungeon-party party-column" role="group" aria-label="Party status"></div>
        <div class="dungeon-boss boss-column" role="group" aria-label="Boss status"></div>
      </div>
      <div class="battle-log dungeon-log" id="world-encounter-log"></div>
      <div class="dialog-buttons"><button id="world-encounter-close" class="hidden">Close</button></div>
    </div>`;
  document.body.appendChild(dialog);
  worldBattleDialog = dialog;
  const partyContainer = dialog.querySelector('.dungeon-party');
  const bossContainer = dialog.querySelector('.dungeon-boss');
  worldBattleLogEl = dialog.querySelector('#world-encounter-log');
  worldBattleCloseButton = dialog.querySelector('#world-encounter-close');
  if (worldBattleCloseButton) {
    worldBattleCloseButton.addEventListener('click', closeWorldEncounterDialog);
  }
  worldBattleBars = new Map();
  if (Array.isArray(data.party)) {
    data.party.forEach(member => {
      if (!partyContainer) return;
      const wrapper = document.createElement('div');
      wrapper.className = 'combatant dungeon-combatant party-member';
      wrapper.innerHTML = `
        <div class="name">${member.name}</div>
        <div class="bars">
          <div class="bar health"><div class="fill"></div><div class="label"><span class="value"></span></div></div>
          <div class="bar mana"><div class="fill"></div><div class="label"><span class="value"></span></div></div>
          <div class="bar stamina"><div class="fill"></div><div class="label"><span class="value"></span></div></div>
        </div>
        <div class="useable-slots" role="group" aria-label="Useable item slots">
          <div class="useable-slot" data-slot="useable1"></div>
          <div class="useable-slot" data-slot="useable2"></div>
        </div>`;
      partyContainer.appendChild(wrapper);
      const group = createDungeonBarGroup(wrapper, member);
      worldBattleBars.set(member.id, group);
      updateDungeonBarGroup(group, member);
    });
  }
  if (bossContainer && data.boss) {
    const wrapper = document.createElement('div');
    wrapper.className = 'combatant dungeon-combatant boss-member';
    wrapper.innerHTML = `
      <div class="name">${data.boss.name}</div>
      <div class="bars">
        <div class="bar health"><div class="fill"></div><div class="label"><span class="value"></span></div></div>
        <div class="bar mana"><div class="fill"></div><div class="label"><span class="value"></span></div></div>
        <div class="bar stamina"><div class="fill"></div><div class="label"><span class="value"></span></div></div>
      </div>
      <div class="useable-slots" role="group" aria-label="Useable item slots">
        <div class="useable-slot" data-slot="useable1"></div>
        <div class="useable-slot" data-slot="useable2"></div>
      </div>`;
    bossContainer.appendChild(wrapper);
    worldBattleBossBars = createDungeonBarGroup(wrapper, data.boss);
    updateDungeonBarGroup(worldBattleBossBars, data.boss);
  }
  if (Array.isArray(data.log) && data.log.length) {
    appendWorldEncounterLogs(data.log, data.partyIds || [], data.bossId);
  }
}

function updateWorldEncounterDialog(data) {
  if (Array.isArray(data.party) && worldBattleBars) {
    data.party.forEach(member => {
      const group = worldBattleBars.get(member.id);
      if (group) {
        updateDungeonBarGroup(group, member);
      }
    });
  }
  if (data.boss && worldBattleBossBars) {
    updateDungeonBarGroup(worldBattleBossBars, data.boss);
  }
  if (Array.isArray(data.log) && data.log.length) {
    appendWorldEncounterLogs(data.log, data.partyIds || [], data.bossId);
  }
}

function handleWorldEncounterEnd(data) {
  worldMovementLocked = false;
  updateWorldStatus('Roaming');
  if (worldMessageEl) {
    clearMessage(worldMessageEl);
  }
  if (data) {
    if (Array.isArray(data.finalParty) && worldBattleBars) {
      data.finalParty.forEach(member => {
        const group = worldBattleBars.get(member && member.id);
        if (group) {
          updateDungeonBarGroup(group, member);
        }
      });
    }
    if (data.finalBoss && worldBattleBossBars) {
      updateDungeonBarGroup(worldBattleBossBars, data.finalBoss);
    }
    if (data.winnerSide) {
      const message = data.winnerSide === 'party' ? 'Victory!' : 'Defeat...';
      appendWorldEncounterLogs([{ message }], data.partyIds || [], data.bossId || null);
    }
    const rewards = data.rewards || null;
    if (rewards && currentCharacter && rewards[currentCharacter.id]) {
      updateAfterBattleEnd(rewards[currentCharacter.id]);
    }
  }
  if (worldBattleCloseButton) {
    worldBattleCloseButton.classList.remove('hidden');
  }
}

function ensureWorldEncounterDialog(data) {
  if (worldBattleDialog) return;
  if (!data) return;
  const hasParty = Array.isArray(data.party) && data.party.length;
  const hasBoss = !!data.boss;
  if (!hasParty && !hasBoss) return;
  const initialData = {
    party: hasParty ? data.party : [],
    boss: hasBoss ? data.boss : null,
    log: Array.isArray(data.log) ? data.log : [],
    partyIds: Array.isArray(data.partyIds) ? data.partyIds : [],
    bossId: data.bossId,
  };
  openWorldEncounterDialog(initialData);
}

function startWorldEncounterStream(token) {
  if (!worldCurrentWorldId || !worldCurrentInstanceId || !currentCharacter || !token) return;
  if (worldEncounterSource) {
    worldEncounterSource.close();
    worldEncounterSource = null;
  }
  worldDialogState = null;
  worldMovementLocked = true;
  updateWorldStatus('Encounter!');
  if (worldMessageEl) {
    showMessage(worldMessageEl, 'A wild foe appears!', false);
  }
  const url = `/worlds/${encodeURIComponent(worldCurrentWorldId)}/encounter?characterId=${currentCharacter.id}&instanceId=${encodeURIComponent(
    worldCurrentInstanceId,
  )}&token=${encodeURIComponent(token)}`;
  const es = new EventSource(url);
  worldEncounterSource = es;
  es.onmessage = ev => {
    if (!ev || !ev.data) return;
    try {
      const data = JSON.parse(ev.data);
      if (data.type === 'start') {
        openWorldEncounterDialog(data);
      } else if (data.type === 'update') {
        ensureWorldEncounterDialog(data);
        updateWorldEncounterDialog(data);
      } else if (data.type === 'end') {
        ensureWorldEncounterDialog(data);
        updateWorldEncounterDialog(data);
        handleWorldEncounterEnd(data);
        es.close();
        worldEncounterSource = null;
      } else if (data.type === 'cancelled') {
        handleWorldEncounterEnd({});
        closeWorldEncounterDialog();
        es.close();
        worldEncounterSource = null;
      } else if (data.type === 'error') {
        if (worldMessageEl) {
          showMessage(worldMessageEl, data.message || 'Encounter failed.', true);
        }
        worldMovementLocked = false;
        updateWorldStatus('Roaming');
        es.close();
        worldEncounterSource = null;
      }
    } catch (err) {
      console.error('world encounter parse failed', err);
    }
  };
  es.onerror = () => {
    if (worldMessageEl) {
      showMessage(worldMessageEl, 'Encounter connection lost.', true);
    }
    worldMovementLocked = false;
    updateWorldStatus('Roaming');
    es.close();
    worldEncounterSource = null;
    closeWorldEncounterDialog();
  };
}

function beginWorldEncounter(token) {
  startWorldEncounterStream(token);
}

async function leaveWorldServer() {
  if (!worldCurrentWorldId || !worldCurrentInstanceId || !currentCharacter) return;
  try {
    await postJSON(`/worlds/${encodeURIComponent(worldCurrentWorldId)}/leave`, {
      characterId: currentCharacter.id,
      instanceId: worldCurrentInstanceId,
    });
  } catch (err) {
    console.warn('failed to leave world', err);
  }
}

function initWorldTab() {
  ensureWorldCanvas();
  if (!worldInitialized) {
    document.addEventListener('keydown', handleWorldKeydown);
    worldInitialized = true;
  }
  ensureWorldLobbyControls();
  if (!currentCharacter) {
    updateWorldStatus('Select a character');
    setWorldQueueUIState('idle');
    updateWorldLobbyMessage('Log in and choose a hero to explore.', false);
    return;
  }
  setWorldQueueUIState(worldQueueState && worldQueueState.status ? worldQueueState.status : 'idle');
  if (worldCurrentWorldId && worldCurrentInstanceId) {
    startWorldStream(worldCurrentWorldId, worldCurrentInstanceId);
    updateWorldStatus('Roaming');
  } else {
    updateWorldStatus('Gather your party');
    updateWorldLobbyMessage('Queue up to enter a world instance.', false);
  }
}

const SHOP_CATEGORY_DEFINITIONS = [
  { value: 'weapons', label: 'Weapons' },
  { value: 'armor', label: 'Armor' },
  { value: 'useables', label: 'Useable Items' },
  { value: 'materials', label: 'Materials' },
];
const SHOP_EFFECT_OPTIONS = [
  { value: 'onHit', label: 'On Hit Effects' },
  { value: 'useEffect', label: 'Use Effect' },
  { value: 'attributeBonus', label: 'Attribute Bonuses' },
  { value: 'chanceBonus', label: 'Chance Bonuses' },
  { value: 'resourceBonus', label: 'Resource Bonuses' },
];
const SHOP_SLOT_ORDER = ['weapon', 'helmet', 'chest', 'legs', 'feet', 'hands', 'useable', 'material'];

const shopFilters = {
  categories: new Set(),
  slots: new Set(),
  weaponTypes: new Set(),
  scaling: new Set(),
  effects: new Set(),
};
let shopSortOrder = 'cost-asc';
let shopControlsInitialized = false;
let shopCatalogCache = [];
let shopTotalItems = 0;

const inventoryFilters = {
  categories: new Set(),
  slots: new Set(),
  weaponTypes: new Set(),
  scaling: new Set(),
  effects: new Set(),
};
const inventoryFilterOptionValues = {
  categories: SHOP_CATEGORY_DEFINITIONS.map(option => option.value),
  slots: [],
  weaponTypes: [],
  scaling: [],
  effects: [],
};
let inventoryFiltersInitialized = false;
let inventoryItemsCache = [];

setSetValues(shopFilters.categories, SHOP_CATEGORY_DEFINITIONS.map(option => option.value));
setSetValues(inventoryFilters.categories, SHOP_CATEGORY_DEFINITIONS.map(option => option.value));

function displayDamageType(type) {
  if (!type) return 'Melee';
  if (type === 'magic') return 'Magic';
  if (type === 'melee') return 'Melee';
  const formatted = titleCase(type);
  return formatted || 'Melee';
}

function formatIntervalDuration(countRaw, singular, plural) {
  if (!Number.isFinite(countRaw) || countRaw <= 0) return '';
  const normalized = Number.isInteger(countRaw) ? countRaw : Number(countRaw.toFixed(1));
  if (!Number.isFinite(normalized) || normalized <= 0) return '';
  if (normalized === 1) return `1 ${singular}`;
  return `${normalized} ${plural || `${singular}s`}`;
}

function formatEffectDurationText(effect) {
  if (!effect || typeof effect !== 'object') return '';
  if (effect.type === 'Stun') {
    let label = 'attack';
    let pluralLabel = 'attacks';
    if (effect.durationType === 'enemyAttackIntervals') {
      label = 'enemy attack';
      pluralLabel = 'enemy attacks';
    } else if (effect.durationType === 'userAttackIntervals' || effect.durationType === 'selfAttackIntervals') {
      label = 'own attack';
      pluralLabel = 'own attacks';
    }
    const range = resolveAttackWindowRange(effect);
    const rangeText = formatIntervalRange(range, label, pluralLabel);
    if (rangeText) {
      return rangeText;
    }
    if (Number.isFinite(effect.attacks)) {
      return formatIntervalDuration(effect.attacks, label, pluralLabel);
    }
    if (Number.isFinite(effect.attackCount)) {
      return formatIntervalDuration(effect.attackCount, label, pluralLabel);
    }
    if (Number.isFinite(effect.durationSeconds) || Number.isFinite(effect.duration)) {
      const seconds = Number.isFinite(effect.durationSeconds) ? effect.durationSeconds : effect.duration;
      if (seconds > 0) {
        return `${seconds}s`;
      }
    }
    return '';
  }
  if (typeof effect.duration === 'number' && Number.isFinite(effect.duration)) {
    const value = effect.duration;
    const formatted = Number.isInteger(value) ? String(value) : value.toFixed(1);
    return `${formatted}s`;
  }
  if (effect.durationType === 'enemyAttackIntervals') {
    const countRaw = typeof effect.durationCount === 'number' ? effect.durationCount : 1;
    return formatIntervalDuration(countRaw, 'enemy attack interval');
  }
  if (effect.durationType === 'userAttackIntervals' || effect.durationType === 'selfAttackIntervals') {
    const countRaw = typeof effect.durationCount === 'number' ? effect.durationCount : 1;
    return formatIntervalDuration(countRaw, 'user attack interval');
  }
  return '';
}

function resolveEffectAttackCount(effect) {
  if (!effect || typeof effect !== 'object') return null;
  if (Number.isFinite(effect.attackCount)) return effect.attackCount;
  if (Number.isFinite(effect.attacks)) return effect.attacks;
  if (
    Number.isFinite(effect.durationCount) &&
    (effect.durationType === 'enemyAttackIntervals' ||
      effect.durationType === 'userAttackIntervals' ||
      effect.durationType === 'selfAttackIntervals')
  ) {
    return effect.durationCount;
  }
  return null;
}

function resolveAttackWindowRange(effect) {
  if (!effect || typeof effect !== 'object') return null;
  const minCandidates = [];
  const maxCandidates = [];
  ['attackCountMin', 'attacksMin', 'durationCountMin'].forEach(key => {
    if (Number.isFinite(effect[key])) {
      minCandidates.push(effect[key]);
    }
  });
  ['attackCountMax', 'attacksMax', 'durationCountMax'].forEach(key => {
    if (Number.isFinite(effect[key])) {
      maxCandidates.push(effect[key]);
    }
  });
  let min = minCandidates.length ? Math.min(...minCandidates) : null;
  let max = maxCandidates.length ? Math.max(...maxCandidates) : null;
  if (min == null && max == null) {
    const count = resolveEffectAttackCount(effect);
    if (!Number.isFinite(count) || count <= 0) {
      return null;
    }
    return { min: count, max: count };
  }
  if (min == null) min = max;
  if (max == null) max = min;
  if (min == null || max == null) return null;
  if (max < min) {
    const tmp = max;
    max = min;
    min = tmp;
  }
  return { min, max };
}

function normalizeIntervalValue(value) {
  if (!Number.isFinite(value)) return null;
  const rounded = Math.abs(value - Math.round(value)) < 1e-6 ? Math.round(value) : Number(value.toFixed(1));
  if (!Number.isFinite(rounded)) return null;
  return rounded;
}

function formatIntervalRange(range, singular, plural) {
  if (!range) return '';
  const minValue = normalizeIntervalValue(range.min);
  const maxValue = normalizeIntervalValue(range.max);
  if (minValue == null) return '';
  const pluralLabel = plural || `${singular}s`;
  if (maxValue == null || Math.abs(maxValue - minValue) < 1e-6) {
    if (minValue <= 0) return '';
    if (minValue === 1) return `1 ${singular}`;
    return `${minValue} ${pluralLabel}`;
  }
  if (minValue <= 0) return '';
  return `${minValue}-${maxValue} ${pluralLabel}`;
}

function formatAttackWindow(effect, label = 'attack') {
  const range = resolveAttackWindowRange(effect);
  if (!range) return '';
  const singular = label;
  const pluralLabel = label.endsWith('s') ? label : `${label}s`;
  const minValue = normalizeIntervalValue(range.min);
  const maxValue = normalizeIntervalValue(range.max);
  if (minValue == null || minValue <= 0) return '';
  if (maxValue == null || Math.abs(maxValue - minValue) < 1e-6) {
    if (minValue === 1) {
      return `next ${singular}`;
    }
    return `next ${minValue} ${pluralLabel}`;
  }
  return `next ${minValue}-${maxValue} ${pluralLabel}`;
}

function formatNumericValue(value) {
  if (!Number.isFinite(value)) return '0';
  const abs = Math.abs(value);
  const rounded = Number.isInteger(abs) ? abs.toString() : abs.toFixed(2).replace(/\.0+$/, '').replace(/\.([1-9]*)0+$/, '.$1');
  return value < 0 ? `-${rounded}` : rounded;
}

function formatScalingEntries(scaling) {
  if (!scaling || typeof scaling !== 'object') return [];
  return Object.entries(scaling)
    .filter(([, amount]) => Number.isFinite(amount) && amount !== 0)
    .map(([stat, amount]) => {
      const label = statLabel(stat);
      const magnitude = formatNumericValue(Math.abs(amount));
      const sign = amount >= 0 ? '+' : '-';
      return `${sign}${magnitude}x ${label}`;
    });
}

function formatValueWithScaling(baseValue, scaling) {
  const hasBase = Number.isFinite(baseValue);
  const baseText = hasBase ? formatNumericValue(baseValue) : '';
  const scalingParts = formatScalingEntries(scaling);
  if (hasBase && scalingParts.length) {
    return `${baseText} (${scalingParts.join(', ')})`;
  }
  if (hasBase) {
    return baseText;
  }
  if (scalingParts.length) {
    return `(${scalingParts.join(', ')})`;
  }
  return '';
}

function formatPercentScalingEntries(scaling) {
  if (!scaling || typeof scaling !== 'object') return [];
  return Object.entries(scaling)
    .filter(([, amount]) => Number.isFinite(amount) && amount !== 0)
    .map(([stat, amount]) => {
      const label = statLabel(stat);
      const percent = formatNumericValue(Math.abs(amount * 100));
      const sign = amount >= 0 ? '+' : '-';
      return `${sign}${percent}% × ${label}`;
    });
}

function formatPercentWithScaling(baseValue, scaling) {
  const hasBase = Number.isFinite(baseValue);
  const baseText = hasBase ? `${formatNumericValue(baseValue * 100)}%` : '';
  const scalingParts = formatPercentScalingEntries(scaling);
  if (hasBase && scalingParts.length) {
    return `${baseText} (${scalingParts.join(', ')})`;
  }
  if (hasBase) {
    return baseText;
  }
  if (scalingParts.length) {
    return scalingParts.join(', ');
  }
  return '';
}

function normalizeStatKey(stat) {
  if (typeof stat !== 'string') return '';
  return stat.trim().toLowerCase();
}

function resolveDerivedAttributes(derived) {
  if (!derived || typeof derived !== 'object') return null;
  if (derived.attributes && typeof derived.attributes === 'object') return derived.attributes;
  if (derived.baseAttributes && typeof derived.baseAttributes === 'object') return derived.baseAttributes;
  return null;
}

function computeScalingBonusLocal(derived, scaling) {
  const attributes = resolveDerivedAttributes(derived);
  if (!attributes) return 0;
  if (!scaling || typeof scaling !== 'object') return 0;
  let total = 0;
  Object.entries(scaling).forEach(([stat, multiplier]) => {
    const coeff = Number(multiplier);
    if (!Number.isFinite(coeff) || coeff === 0) return;
    const key = normalizeStatKey(stat);
    if (!key) return;
    const statValue = Number(attributes[key]);
    if (!Number.isFinite(statValue)) return;
    total += statValue * coeff;
  });
  return total;
}

function computeScaledEffectValue(baseValue, derived, scaling) {
  const base = Number.isFinite(baseValue) ? baseValue : 0;
  return base + computeScalingBonusLocal(derived, scaling);
}

function resolveEffectAttackCountWithDerived(effect, derived) {
  if (!effect || typeof effect !== 'object') return 0;
  if (Number.isFinite(effect.attacks)) {
    return effect.attacks;
  }
  if (Number.isFinite(effect.attackCount)) {
    return effect.attackCount;
  }
  const base = Number.isFinite(effect.attackCountBase)
    ? effect.attackCountBase
    : Number.isFinite(effect.baseAttacks)
    ? effect.baseAttacks
    : Number.isFinite(effect.durationCount)
    ? effect.durationCount
    : 1;
  if (!derived) {
    return base;
  }
  const scaling = effect.attackCountScaling || effect.durationCountScaling;
  const scaled = computeScaledEffectValue(base, derived, scaling);
  let count = Number.isFinite(scaled) ? scaled : base;
  if (Number.isFinite(effect.attackCountMin)) {
    count = Math.max(effect.attackCountMin, count);
  }
  if (Number.isFinite(effect.minAttacks)) {
    count = Math.max(effect.minAttacks, count);
  }
  if (Number.isFinite(effect.attackCountMax)) {
    count = Math.min(effect.attackCountMax, count);
  }
  if (Number.isFinite(effect.maxAttacks)) {
    count = Math.min(effect.maxAttacks, count);
  }
  return count;
}

function formatRange(min, max) {
  const minFinite = Number.isFinite(min);
  const maxFinite = Number.isFinite(max);
  if (minFinite && maxFinite) {
    const roundedMin = Math.round(min);
    const roundedMax = Math.round(max);
    const minText = formatNumericValue(roundedMin);
    const maxText = formatNumericValue(roundedMax);
    return roundedMin === roundedMax ? minText : `${minText}-${maxText}`;
  }
  if (minFinite) {
    return formatNumericValue(Math.round(min));
  }
  if (maxFinite) {
    return formatNumericValue(Math.round(max));
  }
  return '';
}

function getActiveDerivedStats() {
  if (inventoryView && inventoryView.derived) {
    return inventoryView.derived;
  }
  if (currentCharacter) {
    return computeDerived(currentCharacter);
  }
  return null;
}

function describeTriggerEffects(trigger, effects, options = {}) {
  if (!Array.isArray(effects) || effects.length === 0) {
    return '';
  }
  const derived = options && options.derived ? options.derived : null;
  const abilityBonus = options && Number.isFinite(options.abilityBonus) ? options.abilityBonus : null;
  const parts = effects
    .map(effect => describeEffect(effect, { ...options, derived, abilityBonus }))
    .filter(Boolean);
  if (!parts.length) {
    return '';
  }
  let label = 'On trigger';
  if (trigger === 'crit' || trigger === 'critical' || trigger === 'criticalHit') {
    label = 'On crit';
  }
  return `${label}: ${parts.join('; ')}`;
}

function describeEffect(effect, options = {}) {
  if (!effect || typeof effect !== 'object') return '';
  const derived = options && options.derived ? options.derived : null;
  const applyEffectChance = text => {
    const chance = typeof effect.chance === 'number' ? effect.chance : null;
    if (!Number.isFinite(chance) || chance <= 0) {
      return text;
    }
    const pct = Math.round(Math.max(0, Math.min(1, chance)) * 100);
    if (pct <= 0 || pct >= 100) {
      return text;
    }
    return `${pct}% chance to ${text}`;
  };

  if (effect.type === 'PhysicalDamage') {
    const baseAmount = effect.value != null ? effect.value : effect.damage;
    if (derived) {
      const scaled = computeScaledEffectValue(baseAmount, derived, effect.scaling || effect.valueScaling);
      const minAttack = Number.isFinite(derived.minMeleeAttack) ? derived.minMeleeAttack : null;
      const maxAttack = Number.isFinite(derived.maxMeleeAttack) ? derived.maxMeleeAttack : minAttack;
      if (minAttack != null) {
        const rangeText = formatRange(scaled + minAttack, scaled + (maxAttack != null ? maxAttack : minAttack));
        const scalingText = formatScalingEntries(effect.scaling || effect.valueScaling);
        const suffix = scalingText.length ? ` (${scalingText.join(', ')})` : '';
        let baseText = rangeText ? `Physical Damage ${rangeText}${suffix}` : 'Physical Damage';
        if (effect.ignoreResistOnCrit) {
          baseText += ' (ignores resistance on crit)';
        }
        const triggerText = describeTriggerEffects('crit', effect.critEffects, {
          ...options,
          derived,
          abilityBonus: scaled,
        });
        if (triggerText) {
          baseText += `. ${triggerText}`;
        }
        return applyEffectChance(baseText);
      }
    }
    const text = formatValueWithScaling(baseAmount, effect.scaling || effect.valueScaling);
    let baseText = text ? `Physical Damage ${text}` : 'Physical Damage';
    if (effect.ignoreResistOnCrit) {
      baseText += ' (ignores resistance on crit)';
    }
    const triggerText = describeTriggerEffects('crit', effect.critEffects, {
      ...options,
      abilityBonus: Number.isFinite(baseAmount) ? baseAmount : null,
    });
    if (triggerText) {
      baseText += `. ${triggerText}`;
    }
    return applyEffectChance(baseText);
  }
  if (effect.type === 'MagicDamage') {
    const baseAmount = effect.value != null ? effect.value : effect.damage;
    if (derived) {
      const scaled = computeScaledEffectValue(baseAmount, derived, effect.scaling || effect.valueScaling);
      const minAttack = Number.isFinite(derived.minMagicAttack) ? derived.minMagicAttack : null;
      const maxAttack = Number.isFinite(derived.maxMagicAttack) ? derived.maxMagicAttack : minAttack;
      if (minAttack != null) {
        const rangeText = formatRange(scaled + minAttack, scaled + (maxAttack != null ? maxAttack : minAttack));
        const scalingText = formatScalingEntries(effect.scaling || effect.valueScaling);
        const suffix = scalingText.length ? ` (${scalingText.join(', ')})` : '';
        let baseText = rangeText ? `Magic Damage ${rangeText}${suffix}` : 'Magic Damage';
        if (effect.ignoreResistOnCrit) {
          baseText += ' (ignores resistance on crit)';
        }
        const triggerText = describeTriggerEffects('crit', effect.critEffects, {
          ...options,
          derived,
          abilityBonus: scaled,
        });
        if (triggerText) {
          baseText += `. ${triggerText}`;
        }
        return applyEffectChance(baseText);
      }
    }
    const text = formatValueWithScaling(baseAmount, effect.scaling || effect.valueScaling);
    let baseText = text ? `Magic Damage ${text}` : 'Magic Damage';
    if (effect.ignoreResistOnCrit) {
      baseText += ' (ignores resistance on crit)';
    }
    const triggerText = describeTriggerEffects('crit', effect.critEffects, {
      ...options,
      abilityBonus: Number.isFinite(baseAmount) ? baseAmount : null,
    });
    if (triggerText) {
      baseText += `. ${triggerText}`;
    }
    return applyEffectChance(baseText);
  }
  if (effect.type === 'ReckoningDamage') {
    const baseAmount = effect.value != null ? effect.value : effect.damage;
    const scaling = effect.scaling || effect.valueScaling;
    const percentMultiplier =
      Number.isFinite(effect.percentMultiplier) && effect.percentMultiplier > 0 ? effect.percentMultiplier : 1;
    const minPercent = Number.isFinite(effect.minPercent) ? effect.minPercent : null;
    const maxPercent = Number.isFinite(effect.maxPercent) ? effect.maxPercent : null;
    const typeLabel = effect.damageType === 'magical' ? 'Magic' : 'Physical';
    if (derived) {
      const scaled = computeScaledEffectValue(baseAmount, derived, scaling);
      const formatted = formatNumericValue(Math.round(scaled));
      const scalingText = formatScalingEntries(scaling);
      const suffix = scalingText.length ? ` (${scalingText.join(', ')})` : '';
      let baseText = `${typeLabel} damage equal to your missing health % × ${formatted}${suffix}`;
      if (percentMultiplier !== 1) {
        baseText += ` × ${formatNumericValue(percentMultiplier)}`;
      }
      if (minPercent != null || maxPercent != null) {
        const rangeParts = [];
        if (minPercent != null) {
          rangeParts.push(`minimum ${formatChanceValue(minPercent * 100)}`);
        }
        if (maxPercent != null) {
          rangeParts.push(`maximum ${formatChanceValue(maxPercent * 100)}`);
        }
        if (rangeParts.length) {
          baseText += ` (${rangeParts.join(', ')})`;
        }
      }
      return applyEffectChance(baseText);
    }
    const valueText = formatValueWithScaling(baseAmount, scaling);
    let baseText = valueText
      ? `${typeLabel} damage equal to your missing health % × ${valueText}`
      : `${typeLabel} damage equal to your missing health %`;
    if (percentMultiplier !== 1) {
      baseText += ` × ${formatNumericValue(percentMultiplier)}`;
    }
    const scalingText = formatScalingEntries(scaling);
    if (!valueText && scalingText.length) {
      baseText += ` (${scalingText.join(', ')})`;
    }
    if (minPercent != null || maxPercent != null) {
      const rangeParts = [];
      if (minPercent != null) {
        rangeParts.push(`minimum ${formatChanceValue(minPercent * 100)}`);
      }
      if (maxPercent != null) {
        rangeParts.push(`maximum ${formatChanceValue(maxPercent * 100)}`);
      }
      if (rangeParts.length) {
        baseText += ` (${rangeParts.join(', ')})`;
      }
    }
    return applyEffectChance(baseText);
  }
  if (effect.type === 'StatDifferenceDamage') {
    const statKey = typeof effect.stat === 'string' ? effect.stat : 'strength';
    const statLabelText = statLabel(statKey) || 'Strength';
    const typeLabel = effect.damageType === 'magical' ? 'Magic Damage' : 'Physical Damage';
    const multiplier = Number.isFinite(effect.multiplier) ? effect.multiplier : 1;
    const differenceLabel =
      effect.absolute === true || effect.useAbsoluteDifference === true
        ? `|${statLabelText} - enemy ${statLabelText}|`
        : `${statLabelText} - enemy ${statLabelText}`;
    const multiplierText = formatNumericValue(multiplier);
    const baseComponent = Number.isFinite(effect.base) ? effect.base : 0;
    const baseScaling = effect.baseScaling || effect.bonusScaling || null;
    const baseText = formatValueWithScaling(baseComponent, baseScaling);
    const pieces = [`${multiplierText}× ${differenceLabel}`];
    if (baseText) {
      pieces.push(baseText);
    }
    let description = `${typeLabel} equal to ${pieces.join(' + ')}`;
    const minDamage = Number.isFinite(effect.minDamage) ? effect.minDamage : Number.isFinite(effect.minimum) ? effect.minimum : null;
    const maxDamage = Number.isFinite(effect.maxDamage) ? effect.maxDamage : null;
    const bounds = [];
    if (minDamage != null) {
      bounds.push(`minimum ${formatNumericValue(minDamage)}`);
    }
    if (maxDamage != null) {
      bounds.push(`maximum ${formatNumericValue(maxDamage)}`);
    }
    if (bounds.length) {
      description += ` (${bounds.join(', ')})`;
    }
    return applyEffectChance(description);
  }
  if (effect.type === 'Bleed') {
    const abilityBonus = options && Number.isFinite(options.abilityBonus) ? options.abilityBonus : null;
    const basePercent = effect.percent != null ? Number(effect.percent) : null;
    let percent = Number.isFinite(basePercent) ? basePercent : null;
    const perBonus = Number(effect.percentPerBonus);
    if (abilityBonus != null && Number.isFinite(perBonus) && perBonus !== 0) {
      const bonusContribution = abilityBonus * perBonus;
      percent = (Number.isFinite(percent) ? percent : 0) + bonusContribution;
    }
    let baseText;
    if (Number.isFinite(percent) && percent > 0) {
      baseText = `Bleed the target for ${formatNumericValue(percent * 100)}% of their max health`;
    } else {
      baseText = "Bleed the target for damage based on this ability's bonus damage";
    }
    const duration = Number(effect.duration);
    if (Number.isFinite(duration) && duration > 0) {
      baseText += ` over ${formatNumericValue(duration)}s`;
    }
    const interval = Number(effect.interval);
    if (Number.isFinite(interval) && interval > 0) {
      baseText += ` (${formatNumericValue(interval)}s intervals)`;
    }
    return baseText;
  }
  if (effect.type === 'Heal') {
    const amount = effect.value != null ? effect.value : effect.amount;
    if (derived) {
      const scaled = computeScaledEffectValue(amount, derived, effect.scaling || effect.valueScaling);
      const text = formatNumericValue(Math.round(scaled));
      return applyEffectChance(text ? `Heal ${text}` : 'Heal');
    }
    const text = formatValueWithScaling(amount, effect.scaling || effect.valueScaling);
    return applyEffectChance(text ? `Heal ${text}` : 'Heal');
  }
  if (effect.type === 'RestoreResource') {
    const resource = typeof effect.resource === 'string' ? effect.resource.toLowerCase() : '';
    const label = RESOURCE_LABELS[resource] || titleCase(resource || 'Resource');
    const amount = effect.value != null ? effect.value : effect.amount;
    if (derived) {
      const scaled = computeScaledEffectValue(amount, derived, effect.scaling || effect.valueScaling);
      const formatted = formatNumericValue(Math.round(scaled));
      const scalingText = formatScalingEntries(effect.scaling || effect.valueScaling);
      const suffix = scalingText.length ? ` (${scalingText.join(', ')})` : '';
      return applyEffectChance(`Restore ${formatted} ${label}${suffix}`);
    }
    const text = formatValueWithScaling(amount, effect.scaling || effect.valueScaling);
    return applyEffectChance(text ? `Restore ${text} ${label}` : `Restore ${label}`);
  }
  if (effect.type === 'ResourceOverTime') {
    const resource = typeof effect.resource === 'string' ? effect.resource.toLowerCase() : '';
    const label = RESOURCE_LABELS[resource] || titleCase(resource || 'Resource');
    const intervalValue = Number.isFinite(effect.interval) && effect.interval > 0 ? effect.interval : 1;
    const rawDuration = Number.isFinite(effect.duration) && effect.duration >= 0 ? effect.duration : null;
    const rawTicks =
      Number.isFinite(effect.ticks) && effect.ticks > 0 ? Math.max(1, Math.floor(effect.ticks)) : null;
    let durationSeconds = rawDuration;
    if ((durationSeconds == null || durationSeconds <= 0) && rawTicks != null) {
      durationSeconds = intervalValue * rawTicks;
    }
    if (durationSeconds == null || durationSeconds < intervalValue) {
      durationSeconds = intervalValue;
    }
    const tickCount = rawTicks != null ? rawTicks : Math.max(1, Math.round(durationSeconds / intervalValue));
    const amount = effect.value != null ? effect.value : effect.amount;
    const intervalText = formatNumericValue(intervalValue);
    const durationText = formatNumericValue(durationSeconds);
    if (derived) {
      const scaled = computeScaledEffectValue(amount, derived, effect.scaling || effect.valueScaling);
      const perTick = Math.max(0, Math.round(scaled));
      const scalingText = formatScalingEntries(effect.scaling || effect.valueScaling);
      const suffix = scalingText.length ? ` (${scalingText.join(', ')})` : '';
      const tickInfo = tickCount > 1 ? ` (${tickCount} ticks)` : '';
      return applyEffectChance(
        `Restore ${formatNumericValue(perTick)} ${label} every ${intervalText}s for ${durationText}s${tickInfo}${suffix}`,
      );
    }
    const valueText = formatValueWithScaling(amount, effect.scaling || effect.valueScaling);
    const tickInfo = tickCount > 1 ? ` (${tickCount} ticks)` : '';
    const base = valueText
      ? `Restore ${valueText} ${label} every ${intervalText}s for ${durationText}s${tickInfo}`
      : `Restore ${label} every ${intervalText}s for ${durationText}s${tickInfo}`;
    return applyEffectChance(base);
  }
  if (effect.type === 'ResistShield') {
    const scaling = effect.scaling || effect.amountScaling || effect.valueScaling;
    const baseAmount = effect.amount != null ? effect.amount : effect.value;
    const windowText = formatAttackWindow(effect);
    const durationText = windowText ? ` for the ${windowText}` : '';
    const typeKey = effect.damageType === 'magical' ? 'magical' : effect.damageType === 'physical' ? 'physical' : 'incoming';
    const typeLabel = typeKey === 'incoming' ? 'Incoming Damage' : `${titleCase(typeKey)} Damage`;
    const retaliateTarget = effect.retaliateDamageType === 'magical'
      ? 'magical attackers'
      : effect.retaliateDamageType === 'physical'
      ? 'physical attackers'
      : 'attackers';
    if (derived) {
      const scaled = computeScaledEffectValue(baseAmount, derived, scaling);
      const pct = Math.max(0, Math.round(Math.min(0.75, scaled) * 100));
      const percentText = formatChanceValue(pct, { withSign: true });
      let base = `Gain ${percentText} ${typeLabel} resistance${durationText}`;
      if (effect.reflectNegatedDamage) {
        base += ` and retaliate with prevented damage to ${retaliateTarget}`;
      }
      return applyEffectChance(base);
    }
    const basePct = Number.isFinite(baseAmount) ? baseAmount * 100 : 0;
    const percentText = formatChanceValue(basePct, { withSign: true });
    const scalingText = formatScalingEntries(scaling);
    const suffix = scalingText.length ? ` (${scalingText.join(', ')})` : '';
    let base = `Gain ${percentText}${suffix} ${typeLabel} resistance${durationText}`;
    if (effect.reflectNegatedDamage) {
      base += ` and retaliate with prevented damage to ${retaliateTarget}`;
    }
    return applyEffectChance(base);
  }
  if (effect.type === 'AttackIntervalDebuff') {
    const scaling = effect.scaling || effect.amountScaling || effect.valueScaling;
    const baseAmount = effect.amount != null ? effect.amount : effect.value;
    let base;
    if (derived) {
      const scaled = computeScaledEffectValue(baseAmount, derived, scaling);
      const rounded = Math.max(0, Math.round(scaled * 100) / 100);
      const formatted = formatNumericValue(rounded);
      const scalingText = formatScalingEntries(scaling);
      const suffix = scalingText.length ? ` (${scalingText.join(', ')})` : '';
      base = `Increase enemy attack interval by ${formatted}s${suffix}`;
    } else {
      const valueText = formatValueWithScaling(baseAmount, scaling);
      base = valueText
        ? `Increase enemy attack interval by ${valueText}s`
        : 'Increase enemy attack interval';
    }
    const windowText = formatAttackWindow(effect, 'enemy attack');
    if (windowText) {
      base += ` for the ${windowText}`;
    }
    return applyEffectChance(base);
  }
  if (effect.type === 'ResistDebuff') {
    const scaling = effect.percentScaling || effect.scaling || effect.valueScaling;
    const basePercent = effect.percent != null ? effect.percent : effect.value;
    const maxPercent = Number.isFinite(effect.maxPercent)
      ? effect.maxPercent
      : Number.isFinite(effect.percentMax)
      ? effect.percentMax
      : null;
    let percentText;
    if (derived) {
      let scaled = computeScaledEffectValue(basePercent, derived, scaling);
      if (!Number.isFinite(scaled)) {
        scaled = 0;
      }
      if (scaled < 0) {
        scaled = 0;
      }
      if (maxPercent != null) {
        scaled = Math.min(maxPercent, scaled);
      }
      percentText = formatChanceValue(scaled * 100);
    } else {
      percentText = formatPercentWithScaling(basePercent, scaling) || `${formatNumericValue((basePercent || 0) * 100)}%`;
    }
    const maxText = maxPercent != null ? ` (max ${formatChanceValue(maxPercent * 100)})` : '';
    const resistLabel =
      effect.damageType === 'magical'
        ? 'magical resistance'
        : effect.damageType === 'physical'
        ? 'physical resistance'
        : 'resistance';
    let base = `Reduce target ${resistLabel} by ${percentText}${maxText}`;
    const windowText = formatAttackWindow(effect, 'enemy attack');
    if (windowText) {
      base += ` for the ${windowText}`;
    }
    return applyEffectChance(base);
  }
  if (effect.type === 'AttackIntervalPercentDebuff') {
    const scaling = effect.percentScaling || effect.scaling || effect.valueScaling;
    const basePercent = effect.percent != null ? effect.percent : effect.value;
    const maxPercent = Number.isFinite(effect.maxPercent)
      ? effect.maxPercent
      : Number.isFinite(effect.percentMax)
      ? effect.percentMax
      : null;
    let percentLabel;
    if (derived) {
      let scaled = computeScaledEffectValue(basePercent, derived, scaling);
      if (!Number.isFinite(scaled)) {
        scaled = 0;
      }
      if (scaled < 0) {
        scaled = 0;
      }
      if (maxPercent != null) {
        scaled = Math.min(maxPercent, scaled);
      }
      percentLabel = formatChanceValue(scaled * 100);
    } else {
      percentLabel = formatPercentWithScaling(basePercent, scaling) || `${formatNumericValue((basePercent || 0) * 100)}%`;
    }
    const maxText = maxPercent != null ? ` (max ${formatChanceValue(maxPercent * 100)})` : '';
    let base = `Increase enemy attack interval by ${percentLabel}${maxText}`;
    const windowText = formatAttackWindow(effect, 'enemy attack');
    if (windowText) {
      base += ` for the ${windowText}`;
    }
    return applyEffectChance(base);
  }
  if (effect.type === 'DamageFloor') {
    const scaling = effect.scaling || effect.percentScaling || effect.valueScaling;
    const basePercent = effect.percent != null ? effect.percent : effect.value;
    const windowText = formatAttackWindow(effect);
    const durationText = windowText ? ` during the ${windowText}` : '';
    if (derived) {
      const scaled = computeScaledEffectValue(basePercent, derived, scaling);
      const pct = Math.max(0, Math.round(Math.min(0.95, scaled) * 100));
      return applyEffectChance(`Cannot fall below ${formatChanceValue(pct)} health${durationText}`);
    }
    const basePct = Number.isFinite(basePercent) ? basePercent * 100 : 0;
    const scalingText = formatScalingEntries(scaling);
    const suffix = scalingText.length ? ` (${scalingText.join(', ')})` : '';
    return applyEffectChance(`Cannot fall below ${formatChanceValue(basePct)} health${suffix}${durationText}`);
  }
  if (effect.type === 'DamageReflect') {
    const scaling = effect.scaling || effect.percentScaling || effect.valueScaling;
    const basePercent = effect.percent != null ? effect.percent : effect.value;
    const windowText = formatAttackWindow(effect);
    const durationText = windowText ? ` on the ${windowText}` : '';
    const typeKey = effect.damageType === 'magical' ? 'incoming magical damage' : effect.damageType === 'physical' ? 'incoming physical damage' : 'incoming damage';
    const negateNote = effect.negateDamage === false ? '' : ' (negates that portion)';
    if (derived) {
      const scaled = computeScaledEffectValue(basePercent, derived, scaling);
      const pct = Math.max(0, Math.round(Math.min(0.95, scaled) * 100));
      return applyEffectChance(`Reflect ${formatChanceValue(pct)} ${typeKey}${durationText}${negateNote}`);
    }
    const basePct = Number.isFinite(basePercent) ? basePercent * 100 : 0;
    const scalingText = formatScalingEntries(scaling);
    const suffix = scalingText.length ? ` (${scalingText.join(', ')})` : '';
    return applyEffectChance(`Reflect ${formatChanceValue(basePct)} ${typeKey}${suffix}${durationText}${negateNote}`);
  }
  if (effect.type === 'DamageHeal') {
    const scaling = effect.scaling || effect.percentScaling || effect.valueScaling;
    const basePercent = effect.percent != null ? effect.percent : effect.value;
    const windowText = formatAttackWindow(effect);
    const durationText = windowText ? ` for the ${windowText}` : '';
    if (derived) {
      const scaled = computeScaledEffectValue(basePercent, derived, scaling);
      const pct = Math.max(0, Math.round(Math.min(0.95, scaled) * 100));
      return applyEffectChance(`Heal ${formatChanceValue(pct)} of damage taken${durationText}`);
    }
    const basePct = Number.isFinite(basePercent) ? basePercent * 100 : 0;
    const scalingText = formatScalingEntries(scaling);
    const suffix = scalingText.length ? ` (${scalingText.join(', ')})` : '';
    return applyEffectChance(`Heal ${formatChanceValue(basePct)} of damage taken${suffix}${durationText}`);
  }
  if (effect.type === 'DamageResourceReturn') {
    const resource = typeof effect.resource === 'string' ? effect.resource.toLowerCase() : '';
    const label = RESOURCE_LABELS[resource] || titleCase(resource || 'Resource');
    const scaling = effect.scaling || effect.percentScaling || effect.valueScaling;
    const basePercent = effect.percent != null ? effect.percent : effect.value;
    let percentText;
    if (derived) {
      const scaled = computeScaledEffectValue(basePercent, derived, scaling);
      const pct = Math.max(0, Math.round(scaled * 100));
      const scalingText = formatScalingEntries(scaling);
      const suffix = scalingText.length ? ` (${scalingText.join(', ')})` : '';
      percentText = `${formatChanceValue(pct)}${suffix}`;
    } else {
      const pct = Number.isFinite(basePercent) ? basePercent * 100 : 0;
      const scalingText = formatScalingEntries(scaling);
      const suffix = scalingText.length ? ` (${scalingText.join(', ')})` : '';
      percentText = `${formatChanceValue(pct)}${suffix}`;
    }
    const attackScaling = effect.attackCountScaling || effect.durationCountScaling;
    const attackCountDerived = derived ? resolveEffectAttackCountWithDerived(effect, derived) : null;
    const baseAttackCount = resolveEffectAttackCount(effect);
    let attackText;
    if (derived && Number.isFinite(attackCountDerived)) {
      const rounded = Math.max(1, Math.round(attackCountDerived));
      attackText = `${formatNumericValue(rounded)} attacks`;
    } else {
      const scalingText = formatScalingEntries(attackScaling);
      const baseText = formatNumericValue(Number.isFinite(baseAttackCount) ? baseAttackCount : 1);
      attackText = scalingText.length ? `${baseText} attacks (${scalingText.join(', ')})` : `${baseText} attacks`;
    }
    const maxAttacks = Number.isFinite(effect.attackCountMax)
      ? effect.attackCountMax
      : Number.isFinite(effect.maxAttacks)
      ? effect.maxAttacks
      : null;
    let baseText = `Recover ${percentText} of damage dealt as ${label}`;
    if (attackText) {
      baseText += ` for up to ${attackText}`;
    }
    if (Number.isFinite(maxAttacks)) {
      const displayedCount = derived && Number.isFinite(attackCountDerived)
        ? Math.max(1, Math.round(attackCountDerived))
        : Number.isFinite(baseAttackCount)
        ? Math.round(baseAttackCount)
        : null;
      if (displayedCount == null || Math.round(maxAttacks) !== displayedCount) {
        baseText += ` (capped at ${formatNumericValue(maxAttacks)} attacks)`;
      }
    }
    if (Number.isFinite(effect.perHitCap)) {
      baseText += ` (max ${formatNumericValue(effect.perHitCap)} ${label} per hit)`;
    }
    return applyEffectChance(baseText);
  }
  if (effect.type === 'DamageRetaliationStore') {
    const scaling = effect.percentScaling || effect.scaling || effect.valueScaling;
    const basePercent = effect.percent != null ? effect.percent : effect.value;
    const maxPercent = Number.isFinite(effect.maxPercent)
      ? effect.maxPercent
      : Number.isFinite(effect.percentMax)
      ? effect.percentMax
      : null;
    let percentLabel;
    if (derived) {
      let scaled = computeScaledEffectValue(basePercent, derived, scaling);
      if (!Number.isFinite(scaled)) {
        scaled = 0;
      }
      if (scaled < 0) {
        scaled = 0;
      }
      if (maxPercent != null) {
        scaled = Math.min(maxPercent, scaled);
      }
      percentLabel = formatChanceValue(scaled * 100);
    } else {
      percentLabel = formatPercentWithScaling(basePercent, scaling) || `${formatNumericValue((basePercent || 0) * 100)}%`;
    }
    const maxText = maxPercent != null ? ` (max ${formatChanceValue(maxPercent * 100)})` : '';
    const windowText = formatAttackWindow(effect) || 'next attacks';
    const clause = windowText.startsWith('next') ? `the ${windowText}` : windowText;
    const message = `Store damage from ${clause} and retaliate with ${percentLabel}${maxText}`;
    return applyEffectChance(message);
  }
  if (effect.type === 'BuffChance') {
    const stat = typeof effect.stat === 'string' ? effect.stat : '';
    const label = CHANCE_LABELS[stat] || titleCase(stat || 'Chance');
    const scaling = effect.amountScaling || effect.scaling || effect.valueScaling;
    const baseAmount = effect.amount != null ? effect.amount : 0;
    const scaledAmount = derived
      ? computeScaledEffectValue(baseAmount, derived, scaling)
      : baseAmount;
    const amountText = formatChanceValue(scaledAmount, { withSign: true });
    const scalingText = formatScalingEntries(scaling);
    const durationText = formatEffectDurationText(effect);
    const suffix = scalingText.length ? ` (${scalingText.join(', ')})` : '';
    const base = durationText
      ? `${amountText}${suffix} ${label} for ${durationText}`
      : `${amountText}${suffix} ${label}`;
    return applyEffectChance(base);
  }
  if (effect.type === 'NextAbilityDamage') {
    const appliesTo = effect.appliesTo === 'basic' ? 'basic attack' : 'ability';
    const scaling = effect.scaling || effect.valueScaling || effect.amountScaling;
    const usesCount = Number.isFinite(effect.uses) && effect.uses > 0 ? Math.floor(effect.uses) : 1;
    const pluralLabel = appliesTo === 'ability' ? 'abilities' : `${appliesTo}s`;
    const targetLabel = usesCount > 1 ? `the next ${usesCount} ${pluralLabel}` : `the next ${appliesTo}`;
    let prefix;
    if (effect.matchLastResult) {
      const fallbackText = formatValueWithScaling(effect.value, scaling);
      prefix = fallbackText
        ? `Store damage equal to last hit (fallback ${fallbackText})`
        : 'Store damage equal to last hit';
    } else if (derived) {
      const baseValue = effect.value != null ? effect.value : 0;
      const scaled = computeScaledEffectValue(baseValue, derived, scaling);
      const formatted = formatNumericValue(Math.round(scaled));
      const scalingText = formatScalingEntries(scaling);
      const suffix = scalingText.length ? ` (${scalingText.join(', ')})` : '';
      prefix = formatted
        ? `Store ${formatted}${suffix} bonus ${appliesTo} damage`
        : `Store bonus ${appliesTo} damage`;
    } else {
      const valueText = formatValueWithScaling(effect.value, scaling);
      prefix = valueText
        ? `Store ${valueText} bonus ${appliesTo} damage`
        : `Store bonus ${appliesTo} damage`;
    }
    let base = `${prefix} for ${targetLabel}`;
    const durationText = formatEffectDurationText(effect);
    if (durationText) {
      base += ` within ${durationText}`;
    }
    if (Array.isArray(effect.bonusEffects) && effect.bonusEffects.length) {
      const extraDescriptions = effect.bonusEffects
        .map(entry => describeEffect(entry, options))
        .filter(text => typeof text === 'string' && text.length);
      if (extraDescriptions.length) {
        base += `. Also triggers ${extraDescriptions.join('; ')}`;
      }
    }
    return applyEffectChance(base);
  }
  if (effect.type === 'BuffDamagePct') {
    const pct = Math.round((effect.amount || 0) * 100);
    return `+${pct}% Damage for ${effect.duration || 0}s`;
  }
  if (effect.type === 'Stun') {
    const durationText = formatEffectDurationText(effect);
    const actionText = durationText ? `stun for ${durationText}` : 'stun';
    const chance = typeof effect.chance === 'number' && Number.isFinite(effect.chance) ? effect.chance : null;
    if (chance != null) {
      const pct = Math.round(Math.max(0, Math.min(1, chance)) * 100);
      return `${pct}% chance to ${actionText}`;
    }
    return actionText.charAt(0).toUpperCase() + actionText.slice(1);
  }
  if (effect.type === 'Poison') {
    const dmg = effect.damage != null ? effect.damage : 0;
    const interval = effect.interval != null ? effect.interval : 1;
    const duration = effect.duration != null ? effect.duration : 0;
    if (derived) {
      const scaled = computeScaledEffectValue(dmg, derived, effect.damageScaling || effect.scaling);
      const value = Math.max(0, Math.round(scaled));
      const scalingText = formatScalingEntries(effect.damageScaling || effect.scaling);
      const suffix = scalingText.length ? ` (${scalingText.join(', ')})` : '';
      return applyEffectChance(`Poison ${formatNumericValue(value)} dmg/${interval}s for ${duration}s${suffix}`);
    }
    const amountText = formatValueWithScaling(dmg, effect.damageScaling || effect.scaling);
    const base = `Poison ${amountText || formatNumericValue(dmg)} dmg/${interval}s for ${duration}s`;
    return applyEffectChance(base);
  }
  if (effect.type === 'Ignite') {
    const dmg = effect.damage != null ? effect.damage : 0;
    const interval = effect.interval != null ? effect.interval : 1;
    const duration = effect.duration != null ? effect.duration : 0;
    if (derived) {
      const scaled = computeScaledEffectValue(dmg, derived, effect.damageScaling || effect.scaling);
      const value = Math.max(0, Math.round(scaled));
      const scalingText = formatScalingEntries(effect.damageScaling || effect.scaling);
      const suffix = scalingText.length ? ` (${scalingText.join(', ')})` : '';
      return applyEffectChance(`Ignite ${formatNumericValue(value)} dmg/${interval}s for ${duration}s${suffix}`);
    }
    const amountText = formatValueWithScaling(dmg, effect.damageScaling || effect.scaling);
    const base = `Ignite ${amountText || formatNumericValue(dmg)} dmg/${interval}s for ${duration}s`;
    return applyEffectChance(base);
  }
  if (effect.type === 'HealOverTime') {
    const total = effect.value != null ? effect.value : effect.amount;
    const durationText = formatEffectDurationText(effect);
    if (total != null && durationText) {
      return applyEffectChance(`Heal ${total} HP over ${durationText}`);
    }
    if (total != null) {
      return applyEffectChance(`Heal ${total} HP over time`);
    }
    return applyEffectChance('Heal over time');
  }
  if (effect.type === 'ResourceCostModifier') {
    const resource = typeof effect.resource === 'string' ? effect.resource.toLowerCase() : '';
    const label = RESOURCE_LABELS[resource] || titleCase(resource || 'Resource');
    const percent = Math.round(Math.abs(effect.amount || 0) * 100);
    const change = effect.amount >= 0 ? 'Reduce' : 'Increase';
    const durationText = formatEffectDurationText(effect);
    const base = durationText
      ? `${change} ${label} costs by ${percent}% for ${durationText}`
      : `${change} ${label} costs by ${percent}%`;
    return applyEffectChance(base);
  }
  if (effect.type === 'StealResource') {
    const resource = typeof effect.resource === 'string' ? effect.resource.toLowerCase() : '';
    const label = RESOURCE_LABELS[resource] || titleCase(resource || 'Resource');
    const amount = effect.value != null ? effect.value : effect.amount;
    const base = amount != null ? `Steal ${amount} ${label}` : `Steal ${label}`;
    return applyEffectChance(base);
  }
  if (effect.type === 'RemoveUseable') {
    return applyEffectChance('Remove one enemy useable item');
  }
  return effect.type || '';
}

function describeUseTrigger(trigger) {
  if (!trigger || typeof trigger !== 'object') return 'Manual activation';
  if (trigger.type === 'auto') {
    const statLabels = { healthPct: 'HP', manaPct: 'MP', staminaPct: 'Stamina' };
    if (trigger.stat && statLabels[trigger.stat]) {
      const threshold = trigger.threshold;
      const pct = typeof threshold === 'number' ? Math.round(Math.max(0, threshold) * 100) : null;
      const target = trigger.owner === false ? 'ally' : 'self';
      const label = statLabels[trigger.stat];
      if (pct != null) {
        return `Auto when ${target} ${label} < ${pct}%`;
      }
      return `Auto when ${target} ${label} is low`;
    }
    return 'Auto activation';
  }
  if (trigger.type === 'onDamageTaken') {
    const target = trigger.owner === false ? 'ally' : 'self';
    const damageText = trigger.damageType ? `${titleCase(trigger.damageType)} damage` : 'damage';
    return `On ${target} taking ${damageText}`;
  }
  if (trigger.type === 'onAction' || trigger.type === 'onHit') {
    const ownerLabel = trigger.owner === false ? 'ally' : 'self';
    const actions = Array.isArray(trigger.actions)
      ? trigger.actions
      : trigger.action
      ? [trigger.action]
      : [];
    const uniqueActions = [...new Set(actions)];
    const hasBasic = uniqueActions.includes('basic');
    const hasAbility = uniqueActions.includes('ability');
    let actionText = null;
    if (trigger.requiresAttack && (hasBasic || hasAbility) && uniqueActions.every(a => a === 'basic' || a === 'ability')) {
      if (hasBasic && hasAbility) {
        actionText = 'attack';
      } else if (hasBasic) {
        actionText = 'basic attack';
      } else if (hasAbility) {
        actionText = 'ability attack';
      }
    }
    if (!actionText) {
      const mapped = uniqueActions.map(action => {
        if (action === 'basic') return 'basic attack';
        if (action === 'ability') return 'ability';
        return titleCase(action);
      });
      if (!mapped.length) {
        actionText = trigger.requiresAttack ? 'attack' : 'action';
      } else if (mapped.length === 1) {
        actionText = mapped[0];
      } else if (mapped.length === 2 && mapped.includes('basic attack') && mapped.includes('ability')) {
        actionText = 'basic attack or ability';
      } else {
        const last = mapped[mapped.length - 1];
        actionText = `${mapped.slice(0, -1).join(', ')} or ${last}`;
      }
    }
    const frequency = trigger.firstOnly ? 'On first' : 'On each';
    let description = `${frequency} ${ownerLabel} ${actionText}`;
    if (trigger.type === 'onHit') {
      if (!/hit$/i.test(description)) {
        description += ' hit';
      }
      if (trigger.damageType) {
        description += ` (${titleCase(trigger.damageType)} only)`;
      }
    }
    return description;
  }
  return titleCase(trigger.type || 'Auto');
}

function describeOnHit(entry) {
  if (!entry || !entry.effect) return '';
  const chance = entry.chance != null ? Math.round(entry.chance * 100) : 100;
  let trigger = 'attack';
  if (entry.trigger === 'basic') trigger = 'basic attack';
  if (entry.trigger === 'ability') trigger = 'ability';
  const conditionParts = [];
  if (entry.conditions && entry.conditions.damageType) {
    conditionParts.push(`${entry.conditions.damageType} hits only`);
  }
  if (entry.conditions && entry.conditions.school) {
    conditionParts.push(`${entry.conditions.school} abilities`);
  }
  const conditionText = conditionParts.length ? ` (${conditionParts.join(', ')})` : '';
  return `${chance}% on ${trigger}${conditionText}: ${describeEffect(entry.effect, { derived: getActiveDerivedStats() })}`;
}

function formatAttributeBonuses(bonuses) {
  const entries = Object.entries(bonuses || {}).filter(([, value]) => value);
  if (!entries.length) return null;
  return entries
    .map(([stat, value]) => `${value >= 0 ? '+' : ''}${value} ${statLabel(stat)}`)
    .join(', ');
}

function formatResourceBonuses(bonuses) {
  const entries = Object.entries(bonuses || {}).filter(([, value]) => value);
  if (!entries.length) return null;
  return entries
    .map(([resource, value]) => `${value >= 0 ? '+' : ''}${value} ${statLabel(resource)}`)
    .join(', ');
}

function formatResistances(resistances) {
  const entries = Object.entries(resistances || {}).filter(([, value]) => value);
  if (!entries.length) return null;
  return entries
    .map(([type, value]) => `${statLabel(type)} Resist ${Math.round(value * 100)}%`)
    .join(', ');
}

function formatChanceValue(value, { withSign = false } = {}) {
  let numeric = Number.isFinite(value) ? Number(value) : 0;
  numeric = Number(numeric.toFixed(1));
  if (Object.is(numeric, -0)) numeric = 0;
  let prefix = '';
  if (withSign && numeric > 0) prefix = '+';
  return `${prefix}${numeric}%`;
}

function formatChanceBonuses(bonuses) {
  const entries = Object.entries(bonuses || {}).filter(([, value]) => Number.isFinite(value) && value);
  if (!entries.length) return null;
  return entries
    .map(([key, value]) => {
      const label = CHANCE_LABELS[key] || statLabel(key);
      return `${formatChanceValue(value, { withSign: true })} ${label}`;
    })
    .join(', ');
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '0s';
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [];
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (!parts.length || seconds) parts.push(`${seconds}s`);
  return parts.join(' ');
}

function formatClockTime(timestamp) {
  if (!Number.isFinite(timestamp)) return '';
  try {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch (err) {
    return '';
  }
}

function cacheAdventurePreview(characterId, data, { error = false } = {}) {
  if (characterId == null) return;
  adventurePreviewCache.set(characterId, {
    data,
    timestamp: Date.now(),
    error: !!error,
  });
}

function getAdventurePreviewEntry(characterId) {
  if (characterId == null) return null;
  return adventurePreviewCache.get(characterId) || null;
}

function loadAdventurePreview(characterId, { force = false } = {}) {
  if (!characterId) {
    return Promise.resolve({ status: null, error: true });
  }
  const now = Date.now();
  const entry = adventurePreviewCache.get(characterId);
  if (!force && entry && entry.data && entry.timestamp && now - entry.timestamp < ADVENTURE_PREVIEW_TTL) {
    return Promise.resolve({ status: entry.data, error: !!entry.error });
  }
  if (!force && entry && entry.promise) {
    return entry.promise;
  }
  const promise = fetch(`/adventure/status?characterId=${characterId}`)
    .then(res => {
      if (!res.ok) {
        throw new Error('failed to load adventure status');
      }
      return res.json();
    })
    .then(data => {
      const error = !!(data && data.error);
      cacheAdventurePreview(characterId, data, { error });
      return { status: data, error };
    })
    .catch(err => {
      console.error('adventure status preview failed', err);
      cacheAdventurePreview(characterId, null, { error: true });
      return { status: null, error: true };
    });
  const nextEntry = Object.assign({}, entry || {}, { promise });
  adventurePreviewCache.set(characterId, nextEntry);
  return promise;
}

function applyAdventurePreview(view, status, { error = false, loading = false } = {}) {
  if (!view) return;
  const { fill, statusEl, timeEl, container } = view;
  const classes = ['adventure-active', 'adventure-complete', 'adventure-defeat', 'adventure-error', 'adventure-loading'];
  classes.forEach(cls => container.classList.remove(cls));
  let ratio = 0;
  let statusText = 'Ready for adventure';
  let timeText = 'Time Remaining: Idle';
  if (loading) {
    statusText = 'Loading adventure...';
    timeText = '';
    container.classList.add('adventure-loading');
  } else if (error) {
    statusText = 'Adventure status unavailable';
    timeText = 'Time Remaining: Unknown';
    container.classList.add('adventure-error');
  } else if (status && status.active) {
    const total = Number(status.totalDurationMs) || 0;
    const remaining = Number(status.remainingMs) || 0;
    const elapsed = Math.max(0, total - remaining);
    ratio = total > 0 ? Math.min(1, Math.max(0, elapsed / total)) : 0;
    statusText = `On Adventure • Day ${status.currentDay || 1} of ${status.totalDays || 1}`;
    timeText = `Time Remaining: ${formatDuration(Math.max(0, remaining))}`;
    container.classList.add('adventure-active');
  } else if (status && status.outcome === 'defeat') {
    ratio = 1;
    statusText = 'Adventure Ended • Defeat';
    timeText = 'Time Remaining: 0s';
    container.classList.add('adventure-defeat');
  } else if (status && (status.outcome === 'complete' || status.completedAt)) {
    ratio = 1;
    statusText = 'Adventure Complete';
    timeText = 'Time Remaining: 0s';
    container.classList.add('adventure-complete');
  } else if (status && status.startedAt) {
    const total = Number(status.totalDurationMs) || 0;
    const remaining = Number(status.remainingMs) || 0;
    const elapsed = Math.max(0, total - remaining);
    ratio = total > 0 ? Math.min(1, Math.max(0, elapsed / total)) : 0;
    statusText = 'Adventure Pending';
    timeText = 'Time Remaining: 0s';
  }
  fill.style.width = `${Math.round(ratio * 100)}%`;
  statusEl.textContent = statusText;
  timeEl.textContent = timeText;
}

function updateAdventurePreviewView(characterId, status, options = {}) {
  if (characterId == null) return;
  const view = adventurePreviewViews.get(characterId);
  if (!view) return;
  applyAdventurePreview(view, status, options);
}

function itemTooltip(item) {
  const container = document.createElement('div');
  container.className = 'tooltip-grid';
  const add = (label, value) => {
    const l = document.createElement('div');
    l.className = 'label';
    l.textContent = label;
    container.appendChild(l);
    const v = document.createElement('div');
    v.innerHTML = value;
    container.appendChild(v);
  };
  add('Name', item.name);
  add('Rarity', item.rarity || 'Common');
  if (isMaterial(item)) {
    add('Category', 'Material');
    if (item.cost != null) add('Cost', `${item.cost} Gold`);
    if (item.description) {
      add('Description', item.description);
    } else {
      add('Description', 'A crafting component.');
    }
    add('Usage', 'Will be used in future crafting systems.');
    return container;
  }
  if (isUseableItem(item)) {
    add('Slot', slotLabel(item.slot));
    if (item.category) add('Category', titleCase(item.category));
    if (item.type) add('Type', titleCase(item.type));
    if (item.cost != null) add('Cost', `${item.cost} Gold`);
    add('Trigger', describeUseTrigger(item.useTrigger));
    add('Effect', item.useEffect ? describeEffect(item.useEffect) : 'None');
    if (item.useDuration) add('Duration', titleCase(item.useDuration));
    add('Consumed', item.useConsumed ? 'Yes' : 'No');
    add('Per Fight', 'One use per equipped slot');
  } else {
    add('Slot', slotLabel(item.slot));
    if (item.type) add('Type', titleCase(item.type));
    if (item.cost != null) add('Cost', `${item.cost} Gold`);
    if (item.damageType) add('Damage Type', titleCase(item.damageType));
    if (item.baseDamage) {
      const min = item.baseDamage.min != null ? item.baseDamage.min : 0;
      const max = item.baseDamage.max != null ? item.baseDamage.max : min;
      add('Base Damage', `${min}-${max}`);
    }
    const scalingEntries = Object.entries(item.scaling || {}).filter(([, letter]) => letter);
    if (scalingEntries.length) {
      add(
        'Scaling',
        scalingEntries
          .map(([stat, letter]) => `${statLabel(stat)} ${String(letter).toUpperCase()}`)
          .join(', ')
      );
    }
    const attrText = formatAttributeBonuses(item.attributeBonuses);
    add('Attributes', attrText || 'None');
    const resourceText = formatResourceBonuses(item.resourceBonuses);
    add('Resources', resourceText || 'None');
    const resistText = formatResistances(item.resistances);
    add('Resistances', resistText || 'None');
    const chanceText = formatChanceBonuses(item.chanceBonuses);
    add('Chance', chanceText || 'None');
    if (typeof item.attackIntervalModifier === 'number' && item.attackIntervalModifier !== 0) {
      add(
        'Attack Interval',
        `${item.attackIntervalModifier > 0 ? '+' : ''}${item.attackIntervalModifier.toFixed(2)}s`
      );
    }
    if (Array.isArray(item.onHitEffects) && item.onHitEffects.length) {
      add('On Hit', item.onHitEffects.map(describeOnHit).join('<br/>'));
    }
  }
  return container;
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

function normalizeAbilityConditionalCosts(ability) {
  if (!ability) return [];
  if (Array.isArray(ability.conditionalCosts) && ability.conditionalCosts.length) {
    return ability.conditionalCosts;
  }
  if (ability.conditionalCost) {
    return [ability.conditionalCost];
  }
  return [];
}

function formatConditionalResourceList(resources) {
  if (!Array.isArray(resources) || resources.length === 0) {
    return null;
  }
  const labels = resources
    .map(resource => (typeof resource === 'string' ? resource.toLowerCase() : null))
    .filter(Boolean)
    .map(resource => RESOURCE_LABELS[resource] || titleCase(resource));
  if (!labels.length) {
    return null;
  }
  if (labels.length === 1) {
    return { text: `${labels[0]} cost`, plural: false };
  }
  if (labels.length === 2) {
    return { text: `${labels[0]} and ${labels[1]} costs`, plural: true };
  }
  const prefix = labels.slice(0, -1).join(', ');
  const last = labels[labels.length - 1];
  return { text: `${prefix}, and ${last} costs`, plural: true };
}

function describeConditionalCostEntry(entry) {
  if (!entry || typeof entry !== 'object') return '';
  const type = typeof entry.type === 'string' ? entry.type : '';
  const normalizedType = type.replace(/[^a-z]/gi, '').toLowerCase();
  const resourceInfo = formatConditionalResourceList(entry.resources);
  const baseText = resourceInfo ? resourceInfo.text : 'Resource cost';
  const verb = resourceInfo && resourceInfo.plural ? 'are' : 'is';
  if (normalizedType === 'waiveifnodamagelastturn') {
    return `${baseText} ${verb} waived if you haven't taken damage since your last turn.`;
  }
  if (entry.description && typeof entry.description === 'string') {
    return entry.description;
  }
  return '';
}

function describeAbilitySpecialRules(ability) {
  return normalizeAbilityConditionalCosts(ability).map(describeConditionalCostEntry).filter(Boolean);
}

function abilityTooltip(ability, options = {}) {
  const container = document.createElement('div');
  container.className = 'tooltip-grid';
  const add = (label, value) => {
    const l = document.createElement('div');
    l.className = 'label';
    l.textContent = label;
    container.appendChild(l);
    const v = document.createElement('div');
    v.innerHTML = value;
    container.appendChild(v);
  };
  if (ability && ability.isBasicAttack) {
    const derived = getActiveDerivedStats();
    const typeHint = options && typeof options.basicType === 'string' ? options.basicType : rotationDamageType;
    const normalized = normalizeDamageType(typeHint);
    const effectType = normalized === 'magic' ? 'MagicDamage' : 'PhysicalDamage';
    const effectText = describeEffect({ type: effectType, value: 0 }, { derived });
    const schoolLabel = normalized === 'magic' ? 'Magical' : 'Physical';
    add('School', schoolLabel);
    add('Cost', 'None');
    add('Cooldown', 'None');
    add('Scaling', 'Weapon Damage');
    add('Effects', effectText || 'None');
    return container;
  }
  add('School', ability.school);
  add('Cost', formatAbilityCost(ability));
  const cooldownText = Number.isFinite(ability.cooldown) ? `${ability.cooldown}s` : 'None';
  add('Cooldown', cooldownText);
  const scalingStats = ability.scaling.length
    ? ability.scaling.map(statLabel).join(', ')
    : 'None';
  add('Scaling', scalingStats);
  const derived = getActiveDerivedStats();
  const effectLines = ability.effects.map(effect => describeEffect(effect, { derived })).join('<br/>');
  add('Effects', effectLines || 'None');
  const specialRules = describeAbilitySpecialRules(ability);
  if (specialRules.length) {
    add('Special', specialRules.join('<br/>'));
  }
  return container;
}

function classifyLogEntry(entry, youId, opponentId) {
  if (!entry || typeof entry !== 'object') return 'neutral';
  const you = youId != null ? String(youId) : null;
  const opp = opponentId != null ? String(opponentId) : null;
  const src = entry.sourceId != null ? String(entry.sourceId) : null;
  const tgt = entry.targetId != null ? String(entry.targetId) : null;
  if (src && you && src === you) return 'you';
  if (src && opp && src === opp) return 'opponent';
  if (tgt && you && tgt === you) return 'you';
  if (tgt && opp && tgt === opp) return 'opponent';
  return 'neutral';
}

const authDiv = document.getElementById('auth');
const charSelectDiv = document.getElementById('character-select');
const gameDiv = document.getElementById('game');
const nameInput = document.getElementById('player-name');
const authError = document.getElementById('auth-error');
const nameDialog = document.getElementById('name-dialog');
const newCharName = document.getElementById('new-char-name');
const nameOk = document.getElementById('name-ok');
const nameCancel = document.getElementById('name-cancel');

async function postJSON(url, data) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    let message = 'request failed';
    try {
      const err = await res.json();
      if (err && err.error) message = err.error;
    } catch {}
    throw new Error(message);
  }
  return res.json();
}

async function loadAbilityCatalog(force = false) {
  if (!force && abilityCatalog.length) {
    return abilityCatalog;
  }
  if (!abilityCatalogPromise) {
    abilityCatalogPromise = (async () => {
      const res = await fetch('/abilities');
      if (!res.ok) {
        throw new Error('failed to load abilities');
      }
      const data = await res.json();
      abilityCatalog = data;
      return abilityCatalog;
    })()
      .catch(err => {
        abilityCatalog = [];
        throw err;
      })
      .finally(() => {
        abilityCatalogPromise = null;
      });
  }
  return abilityCatalogPromise;
}

function ensureBattlefieldResources() {
  if (!battlefieldResourcePromise) {
    battlefieldResourcePromise = Promise.all([ensureCatalog(), loadAbilityCatalog()])
      .catch(err => {
        battlefieldResourcePromise = null;
        throw err;
      });
  }
  return battlefieldResourcePromise;
}

function showMessage(el, text, isError = false) {
  if (!el) return;
  if (text) {
    el.textContent = text;
    el.classList.remove('hidden');
  } else {
    el.textContent = '';
    el.classList.add('hidden');
  }
  if (isError) {
    el.classList.add('error');
  } else {
    el.classList.remove('error');
  }
}

function clearMessage(el) {
  showMessage(el, '');
}

function updateInventoryHeader() {
  const goldDisplay = document.getElementById('inventory-gold-display');
  if (goldDisplay) {
    let goldValue = 0;
    if (inventoryView && typeof inventoryView.gold === 'number') {
      goldValue = inventoryView.gold;
    } else if (currentCharacter && typeof currentCharacter.gold === 'number') {
      goldValue = currentCharacter.gold;
    }
    const safeGold = Number.isFinite(goldValue) ? Math.max(0, Math.floor(goldValue)) : 0;
    goldDisplay.textContent = `Gold: ${safeGold}`;
  }
  const stashButton = document.getElementById('inventory-stash-button');
  if (stashButton) {
    if (stashView && Number.isFinite(stashView.equipmentSlots)) {
      const slotsUsed = Number.isFinite(stashView.slotsUsed) ? stashView.slotsUsed : 0;
      stashButton.textContent = `Stash (${slotsUsed}/${stashView.equipmentSlots})`;
    } else {
      stashButton.textContent = 'Open Stash';
    }
  }
}

const SAFE_MAX_QUANTITY = typeof Number.MAX_SAFE_INTEGER === 'number'
  ? Number.MAX_SAFE_INTEGER
  : 9007199254740991;

function createStashDomId(prefix, key) {
  const raw = typeof key === 'string' || typeof key === 'number' ? String(key) : '';
  const sanitized = raw.replace(/[^a-zA-Z0-9_-]+/g, '_');
  if (sanitized && sanitized === raw) {
    return `${prefix}-${sanitized}`;
  }
  let hash = 0;
  for (let i = 0; i < raw.length; i += 1) {
    hash = (hash * 31 + raw.charCodeAt(i)) >>> 0;
  }
  const suffix = hash ? `-${hash.toString(36)}` : '';
  const base = sanitized || 'entry';
  return `${prefix}-${base}${suffix}`;
}

function normalizeQuantityInput(input, options = {}) {
  const {
    min = 1,
    max = null,
    defaultValue = min,
  } = options;
  const rawMax = Number.isFinite(max) ? Math.floor(max) : null;
  const effectiveMax = Number.isFinite(rawMax) ? Math.max(rawMax, min) : null;
  const rawValue = input ? parseInt(input.value, 10) : NaN;
  let quantity = Number.isFinite(rawValue) ? Math.floor(rawValue) : defaultValue;
  if (!Number.isFinite(quantity)) {
    quantity = defaultValue;
  }
  if (!Number.isFinite(quantity)) {
    quantity = min;
  }
  if (quantity < min) {
    quantity = min;
  }
  if (Number.isFinite(effectiveMax) && quantity > effectiveMax) {
    quantity = effectiveMax;
  }
  if (quantity > SAFE_MAX_QUANTITY) {
    quantity = SAFE_MAX_QUANTITY;
  }
  if (input) {
    input.value = String(quantity);
  }
  return quantity;
}

function applyInventoryData(data) {
  if (!data) return;
  const previousCharacter = currentCharacter;
  const nextCharacter = data && data.character ? data.character : null;
  const jobStateChanged = shouldInvalidateJobStatus(previousCharacter, nextCharacter);
  inventoryView = data;
  if (!inventoryView.useables) {
    inventoryView.useables = { useable1: null, useable2: null };
  }
  if (!Array.isArray(inventoryView.materials)) {
    inventoryView.materials = [];
  }
  if (data.character) {
    currentCharacter = data.character;
    const idx = characters.findIndex(c => c.id === data.character.id);
    if (idx >= 0) {
      characters[idx] = data.character;
    }
    setRotationDamageType(data.character.basicType);
    if (currentCharacter) {
      currentCharacter.materials = data.character.materials || {};
    }
  }
  if (currentCharacter && typeof data.gold === 'number') {
    currentCharacter.gold = data.gold;
  }
  if (inventoryView && typeof data.gold === 'number') {
    inventoryView.gold = data.gold;
  }
  if (jobStateChanged) {
    clearJobStatusCache();
  }
  updateInventoryHeader();
}

async function ensureCatalog() {
  if (equipmentCatalog) return equipmentCatalog;
  if (!catalogPromise) {
    catalogPromise = (async () => {
      const res = await fetch('/equipment');
      if (!res.ok) {
        throw new Error('failed to load equipment');
      }
      const data = await res.json();
      equipmentCatalog = data;
      materialsCatalog = Array.isArray(data.materials) ? data.materials : [];
      equipmentIndex = buildEquipmentIndex(data);
      materialIndex = buildMaterialIndex(materialsCatalog);
      return data;
    })()
      .catch(err => {
        equipmentCatalog = null;
      equipmentIndex = null;
      materialsCatalog = [];
      materialIndex = null;
        throw err;
      })
      .finally(() => {
        catalogPromise = null;
      });
  }
  return catalogPromise;
}

function buildEquipmentIndex(catalog = equipmentCatalog) {
  const index = {};
  if (!catalog) return index;
  const weapons = Array.isArray(catalog.weapons) ? catalog.weapons : [];
  const armor = Array.isArray(catalog.armor) ? catalog.armor : [];
  const useables = Array.isArray(catalog.useables) ? catalog.useables : [];
  [...weapons, ...armor, ...useables].forEach(item => {
    if (item && item.id != null) {
      index[item.id] = item;
    }
  });
  return index;
}

function buildMaterialIndex(materials = materialsCatalog) {
  const index = {};
  materials.forEach(material => {
    if (material && material.id != null) {
      index[material.id] = material;
    }
  });
  return index;
}

function getEquipmentById(id) {
  if (id == null) return null;
  if (!equipmentCatalog) return null;
  if (!equipmentIndex) {
    equipmentIndex = buildEquipmentIndex();
  }
  return equipmentIndex[id] || null;
}

function getMaterialById(id) {
  if (id == null) return null;
  if (!materialsCatalog) return null;
  if (!materialIndex) {
    materialIndex = buildMaterialIndex();
  }
  return materialIndex[id] || null;
}

function getCatalogItems() {
  if (!equipmentCatalog) return [];
  const weapons = Array.isArray(equipmentCatalog.weapons) ? equipmentCatalog.weapons : [];
  const armor = Array.isArray(equipmentCatalog.armor) ? equipmentCatalog.armor : [];
  const useables = Array.isArray(equipmentCatalog.useables) ? equipmentCatalog.useables : [];
  const materials = Array.isArray(equipmentCatalog.materials) ? equipmentCatalog.materials : [];
  return [...weapons, ...armor, ...useables, ...materials].slice().sort((a, b) => {
    const priorityA = isMaterial(a) ? 2 : isUseableItem(a) ? 1 : 0;
    const priorityB = isMaterial(b) ? 2 : isUseableItem(b) ? 1 : 0;
    if (priorityA !== priorityB) return priorityA - priorityB;
    const costA = typeof a.cost === 'number' ? a.cost : 0;
    const costB = typeof b.cost === 'number' ? b.cost : 0;
    if (costA !== costB) return costA - costB;
    return a.name.localeCompare(b.name);
  });
}

function formatItemMeta(item) {
  if (!item) return '';
  const rarity = item.rarity || 'Common';
  if (isMaterial(item)) {
    return `${rarity} • Material`;
  }
  if (isUseableItem(item)) {
    const category = item.category ? titleCase(item.category) : 'Useable Item';
    return `${rarity} • Useable Item (${category})`;
  }
  const typeText = item.type ? ` (${titleCase(item.type)})` : '';
  return `${rarity} • ${slotLabel(item.slot)}${typeText}`;
}

function clearJobStatusCache() {
  jobStatusCache = null;
  jobStatusPromise = null;
}

function normalizeJobSummary(job) {
  if (!job || typeof job !== 'object') {
    return { jobId: null, startedAt: null, lastProcessedAt: null, isWorking: false, workingSince: null };
  }
  const jobId = job.jobId != null ? String(job.jobId) : null;
  const startedAt = job.startedAt != null ? String(job.startedAt) : null;
  const lastProcessedAt = job.lastProcessedAt != null ? String(job.lastProcessedAt) : null;
  const workingSince = job.workingSince != null ? String(job.workingSince) : null;
  const isWorking = !!job.isWorking;
  return { jobId, startedAt, lastProcessedAt, workingSince, isWorking };
}

function shouldInvalidateJobStatus(previousCharacter, nextCharacter) {
  if (!nextCharacter) return false;
  if (!previousCharacter) return false;
  if (previousCharacter.id !== nextCharacter.id) {
    return true;
  }
  const prevSummary = normalizeJobSummary(previousCharacter.job);
  const nextSummary = normalizeJobSummary(nextCharacter.job);
  return (
    prevSummary.jobId !== nextSummary.jobId
    || prevSummary.startedAt !== nextSummary.startedAt
    || prevSummary.lastProcessedAt !== nextSummary.lastProcessedAt
    || prevSummary.workingSince !== nextSummary.workingSince
    || prevSummary.isWorking !== nextSummary.isWorking
  );
}

function getJobDisplayName(jobId) {
  if (!jobId) return 'Unassigned';
  if (jobStatusCache && Array.isArray(jobStatusCache.jobs)) {
    const entry = jobStatusCache.jobs.find(job => job.id === jobId);
    if (entry && entry.name) {
      return entry.name;
    }
  }
  return titleCase(jobId);
}

function formatPercent(value, digits = 1) {
  if (!Number.isFinite(value) || value <= 0) {
    return '0%';
  }
  const pct = value * 100;
  if (!Number.isFinite(digits) || digits <= 0) {
    return `${Math.round(pct)}%`;
  }
  if (pct >= 100) {
    const precision = pct % 1 === 0 ? 0 : digits;
    return `${pct.toFixed(precision)}%`;
  }
  return `${pct.toFixed(digits)}%`;
}

function formatDurationShort(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return 'Ready';
  }
  const totalSeconds = Math.max(1, Math.round(seconds));
  const totalMinutes = Math.floor(totalSeconds / 60);
  const remSeconds = totalSeconds % 60;
  if (totalMinutes <= 0) {
    return `${remSeconds}s`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) {
    const parts = [`${hours}h`];
    if (minutes > 0) parts.push(`${minutes}m`);
    return parts.join(' ');
  }
  if (remSeconds > 0) {
    return `${minutes}m ${remSeconds}s`;
  }
  return `${minutes}m`;
}

function describeMaterial(materialId) {
  if (!materialId) return 'Unknown Material';
  const material = getMaterialById(materialId);
  if (material && material.name) {
    return material.name;
  }
  return titleCase(materialId.replace(/^material[_-]?/i, '').replace(/_/g, ' '));
}

function getOwnedMaterialCount(materialId) {
  if (!inventoryView || !inventoryView.ownedMaterials) {
    return 0;
  }
  const value = inventoryView.ownedMaterials[materialId];
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function createMaterialList(materials = {}, { includeOwned = false } = {}) {
  const list = document.createElement('ul');
  list.className = 'job-material-list';
  const entries = Object.entries(materials);
  if (!entries.length) {
    const li = document.createElement('li');
    li.className = 'job-material empty';
    li.textContent = 'No materials required';
    list.appendChild(li);
    return list;
  }
  entries.forEach(([materialId, qty]) => {
    const count = Math.max(0, Math.round(Number(qty) || 0));
    if (count <= 0) return;
    const li = document.createElement('li');
    li.className = 'job-material';
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = describeMaterial(materialId);
    li.appendChild(name);
    const amount = document.createElement('span');
    amount.className = 'count';
    amount.textContent = `×${count}`;
    li.appendChild(amount);
    if (includeOwned) {
      const owned = getOwnedMaterialCount(materialId);
      const ownedSpan = document.createElement('span');
      ownedSpan.className = 'owned-count';
      ownedSpan.textContent = `You have ${owned}`;
      if (owned < count) {
        ownedSpan.classList.add('insufficient');
      }
      li.appendChild(ownedSpan);
    }
    list.appendChild(li);
  });
  return list;
}

function createJobRecipeList(job, { includeOwned = false } = {}) {
  const list = document.createElement('div');
  list.className = 'job-recipe-list';
  if (!job || !Array.isArray(job.items) || !job.items.length) {
    const empty = document.createElement('div');
    empty.className = 'job-empty-text';
    empty.textContent = 'No recipes available.';
    list.appendChild(empty);
    return list;
  }
  job.items.forEach(jobItem => {
    const card = document.createElement('div');
    card.className = 'job-recipe';
    const header = document.createElement('div');
    header.className = 'job-recipe-header';
    const item = getEquipmentById(jobItem.itemId);
    const name = document.createElement('div');
    name.className = 'job-recipe-name';
    if (item && item.name) {
      name.textContent = item.name;
    } else {
      name.textContent = titleCase((jobItem.itemId || 'Item').replace(/^useable[_-]?/i, '').replace(/_/g, ' '));
    }
    header.appendChild(name);
    if (item && item.rarity) {
      const rarity = document.createElement('span');
      rarity.className = 'job-recipe-rarity';
      rarity.textContent = item.rarity;
      header.appendChild(rarity);
    }
    card.appendChild(header);
    card.appendChild(createMaterialList(jobItem.materials || {}, { includeOwned }));
    list.appendChild(card);
  });
  return list;
}

function setSetValues(targetSet, values) {
  targetSet.clear();
  values.forEach(value => {
    if (value != null) {
      targetSet.add(value);
    }
  });
}

function normalizeWeaponType(type) {
  return typeof type === 'string' ? type.toLowerCase() : '';
}

function getShopCategoryKey(item) {
  if (!item) return 'armor';
  if (isMaterial(item)) return 'materials';
  if (isUseableItem(item)) return 'useables';
  if (item.slot === 'weapon') return 'weapons';
  return 'armor';
}

function getShopSubgroupInfo(categoryKey, item) {
  if (categoryKey === 'weapons') {
    return {
      key: 'all-weapons',
      label: 'Weapons',
    };
  }
  if (categoryKey === 'armor') {
    return {
      key: 'all-armor',
      label: 'Armor',
    };
  }
  if (categoryKey === 'useables') {
    const category = typeof item.category === 'string' && item.category ? item.category : 'general';
    return {
      key: category,
      label: category ? titleCase(category) : 'General',
    };
  }
  if (categoryKey === 'materials') {
    const rarity = item && item.rarity ? String(item.rarity) : 'Common';
    return {
      key: rarity,
      label: `${titleCase(rarity)} Materials`,
    };
  }
  const slot = item.slot || 'misc';
  return {
    key: slot,
    label: slotLabel(slot) || titleCase(slot),
  };
}

function collectUniqueValues(values) {
  return [...new Set(values)].filter(Boolean);
}

function pruneSetToOptions(targetSet, options) {
  const valid = new Set(options.map(option => option.value));
  [...targetSet].forEach(value => {
    if (!valid.has(value)) {
      targetSet.delete(value);
    }
  });
}

function buildSlotOptions(items) {
  const slots = collectUniqueValues(items.map(item => item.slot));
  const ordered = slots.sort((a, b) => {
    const indexA = SHOP_SLOT_ORDER.indexOf(a);
    const indexB = SHOP_SLOT_ORDER.indexOf(b);
    if (indexA === -1 && indexB === -1) {
      return slotLabel(a).localeCompare(slotLabel(b));
    }
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexA - indexB;
  });
  return ordered.map(slot => ({ value: slot, label: slotLabel(slot) || titleCase(slot) }));
}

function buildWeaponTypeOptions(items) {
  const types = collectUniqueValues(
    items.filter(item => item.slot === 'weapon').map(item => normalizeWeaponType(item.type))
  ).sort((a, b) => a.localeCompare(b));
  return types.map(type => ({ value: type, label: titleCase(type) }));
}

function getItemStatKeys(item) {
  const scalingKeys = Object.keys(item.scaling || {});
  const attributeKeys = Object.entries(item.attributeBonuses || {})
    .filter(([, value]) => {
      if (value == null) return false;
      const numeric = Number(value);
      if (Number.isFinite(numeric)) {
        return numeric !== 0;
      }
      return Boolean(value);
    })
    .map(([stat]) => stat);
  return collectUniqueValues([...scalingKeys, ...attributeKeys]);
}

function buildScalingOptions(items) {
  const statKeys = collectUniqueValues(items.flatMap(item => getItemStatKeys(item)));
  const ordered = STAT_KEYS.filter(stat => statKeys.includes(stat));
  const extras = statKeys.filter(stat => !STAT_KEYS.includes(stat)).sort((a, b) => a.localeCompare(b));
  return [...ordered, ...extras].map(stat => ({ value: stat, label: statLabel(stat) }));
}

function buildEffectOptionsForItems(items) {
  const available = new Set();
  items.forEach(item => {
    if (!item) return;
    if (Array.isArray(item.onHitEffects) && item.onHitEffects.length) {
      available.add('onHit');
    }
    if (item.useEffect) {
      available.add('useEffect');
    }
    if (formatAttributeBonuses(item.attributeBonuses)) {
      available.add('attributeBonus');
    }
    if (formatChanceBonuses(item.chanceBonuses)) {
      available.add('chanceBonus');
    }
    if (formatResourceBonuses(item.resourceBonuses)) {
      available.add('resourceBonus');
    }
  });
  return SHOP_EFFECT_OPTIONS.filter(option => available.has(option.value));
}

function renderCheckboxGroup(containerId, options, valueSet, onChange) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  const handleChange = typeof onChange === 'function' ? onChange : updateShopDisplay;
  options.forEach(option => {
    const label = document.createElement('label');
    label.className = 'filter-option';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = option.value;
    input.checked = valueSet.has(option.value);
    input.addEventListener('change', () => {
      if (input.checked) {
        valueSet.add(option.value);
      } else {
        valueSet.delete(option.value);
      }
      handleChange();
    });
    const text = document.createElement('span');
    text.textContent = option.label;
    label.appendChild(input);
    label.appendChild(text);
    container.appendChild(label);
  });
}

function resetShopFilters() {
  setSetValues(shopFilters.categories, SHOP_CATEGORY_DEFINITIONS.map(option => option.value));
  shopFilters.slots.clear();
  shopFilters.weaponTypes.clear();
  shopFilters.scaling.clear();
  shopFilters.effects.clear();
  shopSortOrder = 'cost-asc';
}

function initializeShopControls(items) {
  const categoryOptions = SHOP_CATEGORY_DEFINITIONS;
  const slotOptions = buildSlotOptions(items);
  const weaponOptions = buildWeaponTypeOptions(items);
  const scalingOptions = buildScalingOptions(items);

  pruneSetToOptions(shopFilters.categories, categoryOptions);
  pruneSetToOptions(shopFilters.slots, slotOptions);
  pruneSetToOptions(shopFilters.weaponTypes, weaponOptions);
  pruneSetToOptions(shopFilters.scaling, scalingOptions);
  pruneSetToOptions(shopFilters.effects, SHOP_EFFECT_OPTIONS);

  renderCheckboxGroup('shop-category-filter', categoryOptions, shopFilters.categories);
  renderCheckboxGroup('shop-slot-filter', slotOptions, shopFilters.slots);
  renderCheckboxGroup('shop-weapon-filter', weaponOptions, shopFilters.weaponTypes);
  renderCheckboxGroup('shop-scaling-filter', scalingOptions, shopFilters.scaling);
  renderCheckboxGroup('shop-effect-filter', SHOP_EFFECT_OPTIONS, shopFilters.effects);

  const sortSelect = document.getElementById('shop-sort');
  if (sortSelect) {
    sortSelect.value = shopSortOrder;
    if (!shopControlsInitialized) {
      sortSelect.addEventListener('change', event => {
        shopSortOrder = event.target.value;
        updateShopDisplay();
      });
    }
  }

  const resetButton = document.getElementById('shop-reset');
  if (resetButton && !shopControlsInitialized) {
    resetButton.addEventListener('click', () => {
      resetShopFilters();
      initializeShopControls(shopCatalogCache);
      const sortEl = document.getElementById('shop-sort');
      if (sortEl) sortEl.value = shopSortOrder;
      updateShopDisplay();
    });
  }

  shopControlsInitialized = true;
}

function updateShopDisplay() {
  const grid = document.getElementById('shop-grid');
  if (!grid) return;
  const summary = document.getElementById('shop-results-summary');
  const messageEl = document.getElementById('shop-message');
  grid.innerHTML = '';

  if (!shopCatalogCache.length) {
    const empty = document.createElement('div');
    empty.className = 'shop-empty';
    empty.textContent = 'No items available.';
    grid.appendChild(empty);
    if (summary) summary.textContent = '0 items available';
    return;
  }

  const filtered = applyShopFilters(shopCatalogCache);
  const sorted = sortShopItems(filtered);
  if (sorted.length) {
    renderShopGroups(grid, sorted, messageEl);
  } else {
    const empty = document.createElement('div');
    empty.className = 'shop-empty';
    empty.textContent = 'No items match the selected filters.';
    grid.appendChild(empty);
  }
  if (summary) {
    summary.textContent = `${filtered.length} of ${shopTotalItems} items displayed`;
  }
}


function updateInventoryFilterToggleLabel(button, isOpen) {
  if (!button) return;
  button.textContent = isOpen ? 'Hide Filters ▴' : 'Show Filters ▾';
}

function toggleInventoryFilterSection(sectionKey, visible) {
  const section = document.querySelector(`[data-inventory-section='${sectionKey}']`);
  if (!section) return;
  if (visible) {
    section.classList.remove('hidden');
  } else {
    section.classList.add('hidden');
  }
}

function initializeInventoryControls(items) {
  const categoryOptions = SHOP_CATEGORY_DEFINITIONS;
  const slotOptions = buildSlotOptions(items);
  const weaponOptions = buildWeaponTypeOptions(items);
  const scalingOptions = buildScalingOptions(items);
  const effectOptions = buildEffectOptionsForItems(items);

  inventoryFilterOptionValues.categories = categoryOptions.map(option => option.value);
  inventoryFilterOptionValues.slots = slotOptions.map(option => option.value);
  inventoryFilterOptionValues.weaponTypes = weaponOptions.map(option => option.value);
  inventoryFilterOptionValues.scaling = scalingOptions.map(option => option.value);
  inventoryFilterOptionValues.effects = effectOptions.map(option => option.value);

  pruneSetToOptions(inventoryFilters.categories, categoryOptions);
  pruneSetToOptions(inventoryFilters.slots, slotOptions);
  pruneSetToOptions(inventoryFilters.weaponTypes, weaponOptions);
  pruneSetToOptions(inventoryFilters.scaling, scalingOptions);
  pruneSetToOptions(inventoryFilters.effects, effectOptions);

  renderCheckboxGroup('inventory-category-filter', categoryOptions, inventoryFilters.categories, updateInventoryDisplay);
  renderCheckboxGroup('inventory-slot-filter', slotOptions, inventoryFilters.slots, updateInventoryDisplay);
  renderCheckboxGroup('inventory-weapon-filter', weaponOptions, inventoryFilters.weaponTypes, updateInventoryDisplay);
  renderCheckboxGroup('inventory-scaling-filter', scalingOptions, inventoryFilters.scaling, updateInventoryDisplay);
  renderCheckboxGroup('inventory-effect-filter', effectOptions, inventoryFilters.effects, updateInventoryDisplay);

  toggleInventoryFilterSection('slots', slotOptions.length > 0);
  toggleInventoryFilterSection('weaponTypes', weaponOptions.length > 0);
  toggleInventoryFilterSection('scaling', scalingOptions.length > 0);
  toggleInventoryFilterSection('effects', effectOptions.length > 0);
}

function resetInventoryFilters() {
  const defaultCategories = inventoryFilterOptionValues.categories.length
    ? inventoryFilterOptionValues.categories
    : SHOP_CATEGORY_DEFINITIONS.map(option => option.value);
  setSetValues(inventoryFilters.categories, defaultCategories);
  inventoryFilters.slots.clear();
  inventoryFilters.weaponTypes.clear();
  inventoryFilters.scaling.clear();
  inventoryFilters.effects.clear();
}

function ensureInventoryFilterControls() {
  if (inventoryFiltersInitialized) return;
  const toggle = document.getElementById('inventory-filter-toggle');
  const panel = document.getElementById('inventory-filter-panel');
  if (toggle && panel) {
    updateInventoryFilterToggleLabel(toggle, panel.classList.contains('open'));
    toggle.addEventListener('click', () => {
      const isOpen = panel.classList.toggle('open');
      toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      updateInventoryFilterToggleLabel(toggle, isOpen);
    });
  }
  const resetButton = document.getElementById('inventory-filter-reset');
  if (resetButton) {
    resetButton.addEventListener('click', () => {
      resetInventoryFilters();
      initializeInventoryControls(inventoryItemsCache.map(entry => entry.item));
      updateInventoryDisplay();
    });
  }
  const stashButton = document.getElementById('inventory-stash-button');
  if (stashButton) {
    stashButton.addEventListener('click', () => openStashDialog());
  }
  inventoryFiltersInitialized = true;
}

function applyInventoryFilters(entries) {
  return entries.filter(({ item }) => {
    if (!item) return false;
    if (!inventoryFilters.categories.size) {
      return false;
    }
    const categoryKey = getShopCategoryKey(item);
    if (!inventoryFilters.categories.has(categoryKey)) {
      return false;
    }
    if (inventoryFilters.slots.size && !inventoryFilters.slots.has(item.slot)) {
      return false;
    }
    if (inventoryFilters.weaponTypes.size) {
      const type = normalizeWeaponType(item.type);
      if (!inventoryFilters.weaponTypes.has(type)) {
        return false;
      }
    }
    if (inventoryFilters.scaling.size) {
      const statKeys = getItemStatKeys(item);
      if (!statKeys.some(stat => inventoryFilters.scaling.has(stat))) {
        return false;
      }
    }
    if (inventoryFilters.effects.size) {
      for (const effect of inventoryFilters.effects) {
        if (effect === 'onHit' && !(Array.isArray(item.onHitEffects) && item.onHitEffects.length)) {
          return false;
        }
        if (effect === 'useEffect' && !item.useEffect) {
          return false;
        }
        if (effect === 'attributeBonus' && !formatAttributeBonuses(item.attributeBonuses)) {
          return false;
        }
        if (effect === 'chanceBonus' && !formatChanceBonuses(item.chanceBonuses)) {
          return false;
        }
        if (effect === 'resourceBonus' && !formatResourceBonuses(item.resourceBonuses)) {
          return false;
        }
      }
    }
    return true;
  });
}

function updateInventoryDisplay() {
  const grid = document.getElementById('inventory-grid');
  if (!grid) return;
  const summary = document.getElementById('inventory-results-summary');
  const messageEl = document.getElementById('inventory-message');
  grid.innerHTML = '';
  const total = inventoryItemsCache.length;
  if (!total) {
    const empty = document.createElement('div');
    empty.className = 'shop-empty';
    empty.textContent = 'No gear owned yet.';
    grid.appendChild(empty);
    if (summary) summary.textContent = '0 items owned';
    return;
  }
  const filteredEntries = applyInventoryFilters(inventoryItemsCache);
  const filteredCount = filteredEntries.length;
  if (filteredCount) {
    filteredEntries.forEach(entry => {
      const card = createInventoryItemCard(entry, messageEl);
      if (card) {
        grid.appendChild(card);
      }
    });
  } else {
    const empty = document.createElement('div');
    empty.className = 'shop-empty';
    empty.textContent = inventoryFilters.categories.size
      ? 'No items match the selected filters.'
      : 'Select a category to view items.';
    grid.appendChild(empty);
  }
  if (summary) {
    summary.textContent = `${filteredCount} of ${total} items shown`;
  }
}

function createInventoryItemCard(entry, messageEl) {
  if (!entry || !entry.item) return null;
  const { item, count } = entry;
  const card = document.createElement('div');
  card.className = 'shop-item-card inventory-item-card';

  const header = document.createElement('div');
  header.className = 'card-header';
  const name = document.createElement('div');
  name.className = 'card-name';
  name.textContent = item.name || 'Unknown Item';
  header.appendChild(name);
  const rarity = document.createElement('div');
  rarity.className = 'card-rarity';
  rarity.textContent = item.rarity || 'Common';
  header.appendChild(rarity);
  card.appendChild(header);

  const tags = document.createElement('div');
  tags.className = 'card-tags';
  if (item.slot) {
    const slotTag = document.createElement('span');
    slotTag.className = 'card-tag';
    slotTag.textContent = slotLabel(item.slot) || titleCase(item.slot);
    tags.appendChild(slotTag);
  }
  if (isUseableItem(item) && item.category) {
    const categoryTag = document.createElement('span');
    categoryTag.className = 'card-tag';
    categoryTag.textContent = titleCase(item.category);
    tags.appendChild(categoryTag);
  }
  if (item.type && !isUseableItem(item)) {
    const typeTag = document.createElement('span');
    typeTag.className = 'card-tag';
    typeTag.textContent = titleCase(item.type);
    tags.appendChild(typeTag);
  }
  if (tags.childElementCount) {
    card.appendChild(tags);
  }

  const meta = document.createElement('div');
  meta.className = 'card-description inventory-card-meta';
  meta.textContent = formatItemMeta(item);
  card.appendChild(meta);

  const footer = document.createElement('div');
  footer.className = 'card-footer inventory-card-footer';
  const countLabel = document.createElement('div');
  countLabel.className = 'card-cost inventory-card-count';
  countLabel.textContent = `Owned ×${count}`;
  footer.appendChild(countLabel);

  const actions = document.createElement('div');
  actions.className = 'inventory-card-actions';

  if (isUseableItem(item)) {
    const equippedSlots = getUseableSlotsForItem(item.id);
    if (equippedSlots.length) {
      const status = document.createElement('div');
      status.className = 'inventory-card-status';
      status.textContent = `Equipped: ${equippedSlots.map(slotLabel).join(', ')}`;
      card.appendChild(status);
      card.classList.add('equipped');
    }
    USEABLE_SLOTS.forEach(slotName => {
      const btn = document.createElement('button');
      btn.textContent = `Equip ${slotLabel(slotName)}`;
      const slotItem = getEquippedSlotItem(slotName);
      if (slotItem && slotItem.id === item.id) {
        btn.disabled = true;
      }
      btn.addEventListener('click', () => equipItem(slotName, item.id, messageEl));
      actions.appendChild(btn);
    });
  } else {
    const equippedItem = getEquippedSlotItem(item.slot);
    if (equippedItem && equippedItem.id === item.id) {
      const status = document.createElement('div');
      status.className = 'inventory-card-status';
      status.textContent = 'Equipped';
      card.appendChild(status);
      card.classList.add('equipped');
    }
    const equipButton = document.createElement('button');
    equipButton.textContent = `Equip ${slotLabel(item.slot)}`;
    if (equippedItem && equippedItem.id === item.id) {
      equipButton.disabled = true;
    }
    equipButton.addEventListener('click', () => equipItem(item.slot, item.id, messageEl));
    actions.appendChild(equipButton);
  }

  const stashEligibleCount = Math.max(0, count - countEquippedCopiesForItem(item.id));
  const stashControls = document.createElement('div');
  stashControls.className = 'inventory-stash-controls';
  const quantityField = document.createElement('div');
  quantityField.className = 'blacksmith-quantity-field';
  const quantityId = createStashDomId('stash-qty', item.id);
  const quantityLabel = document.createElement('label');
  quantityLabel.className = 'blacksmith-quantity-label';
  quantityLabel.setAttribute('for', quantityId);
  quantityLabel.textContent = 'Qty';
  const quantityInput = document.createElement('input');
  quantityInput.type = 'number';
  quantityInput.id = quantityId;
  quantityInput.className = 'blacksmith-quantity-input';
  quantityInput.min = '1';
  quantityInput.value = stashEligibleCount > 0 ? '1' : '0';
  if (stashEligibleCount > 0) {
    quantityInput.max = String(stashEligibleCount);
  } else {
    quantityInput.disabled = true;
  }
  const enforceBounds = () => {
    normalizeQuantityInput(quantityInput, {
      min: stashEligibleCount > 0 ? 1 : 0,
      max: stashEligibleCount > 0 ? stashEligibleCount : 0,
      defaultValue: stashEligibleCount > 0 ? 1 : 0,
    });
  };
  quantityInput.addEventListener('change', enforceBounds);
  quantityInput.addEventListener('blur', enforceBounds);
  quantityField.appendChild(quantityLabel);
  quantityField.appendChild(quantityInput);
  stashControls.appendChild(quantityField);

  const stashButton = document.createElement('button');
  stashButton.textContent = 'Add to Stash';
  let stashFull = false;
  if (stashView) {
    const alreadyStored = Array.isArray(stashView.equipment)
      ? stashView.equipment.some(entry => entry && entry.item && entry.item.id === item.id)
      : false;
    stashFull = !alreadyStored && Number.isFinite(stashView.slotsUsed) && Number.isFinite(stashView.equipmentSlots)
      ? stashView.slotsUsed >= stashView.equipmentSlots
      : false;
  }
  if (!stashEligibleCount || stashFull) {
    stashButton.disabled = true;
    if (stashFull) {
      stashButton.title = 'Stash is out of equipment slots';
    }
  }
  stashButton.addEventListener('click', () => handleInventoryStashDeposit(item, quantityInput, stashButton, messageEl));
  stashControls.appendChild(stashButton);
  actions.appendChild(stashControls);

  footer.appendChild(actions);
  card.appendChild(footer);

  attachTooltip(card, () => itemTooltip(item));
  return card;
}

function createInventoryMaterialCard(material, count, messageEl) {
  if (!material) return null;
  const card = document.createElement('div');
  card.className = 'shop-item-card inventory-material-card';

  const header = document.createElement('div');
  header.className = 'card-header';
  const name = document.createElement('div');
  name.className = 'card-name';
  name.textContent = material.name || 'Material';
  header.appendChild(name);
  const rarity = document.createElement('div');
  rarity.className = 'card-rarity';
  rarity.textContent = material.rarity || 'Common';
  header.appendChild(rarity);
  card.appendChild(header);

  const tags = document.createElement('div');
  tags.className = 'card-tags';
  const tag = document.createElement('span');
  tag.className = 'card-tag';
  tag.textContent = 'Material';
  tags.appendChild(tag);
  card.appendChild(tags);

  const meta = document.createElement('div');
  meta.className = 'card-description inventory-card-meta';
  meta.textContent = formatItemMeta(material);
  card.appendChild(meta);

  if (material.description) {
    const description = document.createElement('div');
    description.className = 'card-description inventory-card-description';
    description.textContent = material.description;
    card.appendChild(description);
  }

  const footer = document.createElement('div');
  footer.className = 'card-footer inventory-card-footer';
  const countLabel = document.createElement('div');
  countLabel.className = 'card-cost inventory-card-count';
  countLabel.textContent = `Owned ×${count}`;
  footer.appendChild(countLabel);

  const actions = document.createElement('div');
  actions.className = 'inventory-card-actions';
  const stashControls = document.createElement('div');
  stashControls.className = 'inventory-stash-controls';
  const quantityField = document.createElement('div');
  quantityField.className = 'blacksmith-quantity-field';
  const quantityId = createStashDomId('stash-material', material.id);
  const quantityLabel = document.createElement('label');
  quantityLabel.className = 'blacksmith-quantity-label';
  quantityLabel.setAttribute('for', quantityId);
  quantityLabel.textContent = 'Qty';
  const quantityInput = document.createElement('input');
  quantityInput.type = 'number';
  quantityInput.id = quantityId;
  quantityInput.className = 'blacksmith-quantity-input';
  quantityInput.min = '1';
  quantityInput.value = count > 0 ? '1' : '0';
  if (count > 0) {
    quantityInput.max = String(count);
  } else {
    quantityInput.disabled = true;
  }
  const enforceBounds = () => {
    normalizeQuantityInput(quantityInput, {
      min: count > 0 ? 1 : 0,
      max: count > 0 ? count : 0,
      defaultValue: count > 0 ? 1 : 0,
    });
  };
  quantityInput.addEventListener('change', enforceBounds);
  quantityInput.addEventListener('blur', enforceBounds);
  quantityField.appendChild(quantityLabel);
  quantityField.appendChild(quantityInput);
  stashControls.appendChild(quantityField);

  const stashButton = document.createElement('button');
  stashButton.textContent = 'Add to Stash';
  if (!count) {
    stashButton.disabled = true;
  }
  stashButton.addEventListener('click', () => handleInventoryMaterialDeposit(material, quantityInput, stashButton, messageEl));
  stashControls.appendChild(stashButton);
  actions.appendChild(stashControls);
  footer.appendChild(actions);
  card.appendChild(footer);

  attachTooltip(card, () => itemTooltip(material));
  return card;
}

function applyShopFilters(items) {
  return items.filter(item => {
    const categoryKey = getShopCategoryKey(item);
    if (!shopFilters.categories.size) {
      return false;
    }
    if (!shopFilters.categories.has(categoryKey)) {
      return false;
    }
    if (shopFilters.slots.size && !shopFilters.slots.has(item.slot)) {
      return false;
    }
    if (shopFilters.weaponTypes.size) {
      const type = normalizeWeaponType(item.type);
      if (!shopFilters.weaponTypes.has(type)) {
        return false;
      }
    }
    if (shopFilters.scaling.size) {
      const statKeys = getItemStatKeys(item);
      if (!statKeys.some(stat => shopFilters.scaling.has(stat))) {
        return false;
      }
    }
    if (shopFilters.effects.size) {
      for (const effect of shopFilters.effects) {
        if (effect === 'onHit' && !(Array.isArray(item.onHitEffects) && item.onHitEffects.length)) {
          return false;
        }
        if (effect === 'useEffect' && !item.useEffect) {
          return false;
        }
        if (effect === 'attributeBonus' && !formatAttributeBonuses(item.attributeBonuses)) {
          return false;
        }
        if (effect === 'chanceBonus' && !formatChanceBonuses(item.chanceBonuses)) {
          return false;
        }
        if (effect === 'resourceBonus' && !formatResourceBonuses(item.resourceBonuses)) {
          return false;
        }
      }
    }
    return true;
  });
}

function sortShopItems(items) {
  const comparator = getShopComparator();
  return items.slice().sort(comparator);
}

function getShopComparator() {
  const comparators = {
    'cost-asc': createMetricComparator(getItemCost, 'asc'),
    'cost-desc': createMetricComparator(getItemCost, 'desc'),
    'damage-asc': createMetricComparator(getItemAverageDamage, 'asc'),
    'damage-desc': createMetricComparator(getItemAverageDamage, 'desc'),
    'stat-asc': createMetricComparator(getItemStatBonus, 'asc'),
    'stat-desc': createMetricComparator(getItemStatBonus, 'desc'),
  };
  return comparators[shopSortOrder] || comparators['cost-asc'];
}

function createMetricComparator(metricFn, direction) {
  return (a, b) => {
    const valueA = metricFn(a);
    const valueB = metricFn(b);
    if (valueA !== valueB) {
      return direction === 'desc' ? valueB - valueA : valueA - valueB;
    }
    const costA = getItemCost(a);
    const costB = getItemCost(b);
    if (costA !== costB) {
      return costA - costB;
    }
    return (a.name || '').localeCompare(b.name || '');
  };
}

function getItemCost(item) {
  return typeof item.cost === 'number' ? item.cost : 0;
}

function getItemAverageDamage(item) {
  if (!item || !item.baseDamage) return 0;
  const min = Number(item.baseDamage.min);
  const max = Number(item.baseDamage.max);
  if (!Number.isFinite(min) && !Number.isFinite(max)) return 0;
  if (!Number.isFinite(max)) return min || 0;
  if (!Number.isFinite(min)) return max || 0;
  return (min + max) / 2;
}

function getItemStatBonus(item) {
  const bonuses = item && item.attributeBonuses ? Object.values(item.attributeBonuses) : [];
  return bonuses.reduce((sum, value) => sum + (Number.isFinite(value) ? Number(value) : 0), 0);
}

async function loadJobStatus(force = false) {
  if (!currentPlayer || !currentCharacter) {
    return null;
  }
  if (!force && jobStatusCache) {
    return jobStatusCache;
  }
  if (!jobStatusPromise) {
    const url = `/characters/${currentCharacter.id}/job?playerId=${currentPlayer.id}`;
    jobStatusPromise = fetch(url)
      .then(async res => {
        let payload = null;
        try {
          payload = await res.json();
        } catch (err) {
          payload = null;
        }
        if (!res.ok) {
          const message = payload && payload.error ? payload.error : 'Failed to load job status';
          throw new Error(message);
        }
        jobStatusCache = payload;
        return payload;
      })
      .catch(err => {
        jobStatusCache = null;
        throw err;
      })
      .finally(() => {
        jobStatusPromise = null;
      });
  }
  return jobStatusPromise;
}

async function fetchJobStatusAndRefresh(force = false) {
  const status = await loadJobStatus(force);
  try {
    await refreshInventory(true);
  } catch (err) {
    console.error('inventory refresh failed', err);
  }
  if (isTabActive('character')) {
    renderCharacter();
  }
  return status;
}

function formatJobLogMultiplier(value) {
  if (!Number.isFinite(value)) {
    return null;
  }
  if (value === 0) {
    return '0';
  }
  if (Math.abs(value - Math.round(value)) < 0.0001) {
    return String(Math.round(value));
  }
  if (value >= 10) {
    return value.toFixed(1);
  }
  return value.toFixed(2);
}

function getJobLogInfo(entry) {
  if (!entry) return null;
  const itemName = entry.itemName
    || (entry.itemId ? titleCase(entry.itemId.replace(/^useable[_-]?/i, '').replace(/_/g, ' ')) : 'item');
  if (entry.type === 'salvaged') {
    const recoveredMaterials = Array.isArray(entry.recoveredMaterials)
      ? entry.recoveredMaterials
          .map(m => {
            if (!m || !m.materialId) return null;
            const amount = Math.max(1, Math.round(Number(m.amount) || 0));
            return { materialId: m.materialId, name: describeMaterial(m.materialId), amount };
          })
          .filter(Boolean)
      : [];
    const statGain = entry.stat && Number.isFinite(entry.statAmount) && entry.statAmount > 0
      ? { stat: statLabel(entry.stat), amount: entry.statAmount }
      : null;
    return {
      itemName,
      rarity: entry.rarity || null,
      type: 'salvaged',
      timestamp: entry.timestamp || null,
      recoveredMaterials,
      statGain,
    };
  }
  const chanceRaw = Number(entry.generationChance);
  const shareRaw = Number(entry.generationShare);
  const rollRaw = Number(entry.generationRoll);
  const multiplierRaw = Number(entry.generationMultiplier);
  const hasChance = entry.generationChance != null && Number.isFinite(chanceRaw) && chanceRaw >= 0;
  const hasShare = entry.generationShare != null && Number.isFinite(shareRaw) && shareRaw >= 0;
  const hasRoll = entry.generationRoll != null && Number.isFinite(rollRaw) && rollRaw >= 0;
  const hasMultiplier = entry.generationMultiplier != null && Number.isFinite(multiplierRaw) && multiplierRaw >= 0;
  const attempted = !!entry.generationAttempted
    || hasChance
    || hasShare
    || hasRoll
    || hasMultiplier
    || (Array.isArray(entry.generatedMaterials) && entry.generatedMaterials.length > 0)
    || (entry.generationSucceeded != null);
  const attributeName = entry.generationAttribute ? statLabel(entry.generationAttribute) : 'attribute';
  const clamp01 = value => Math.max(0, Math.min(1, value));
  const chance = hasChance ? clamp01(chanceRaw) : null;
  const share = hasShare ? clamp01(shareRaw) : null;
  const roll = hasRoll ? clamp01(rollRaw) : null;
  const multiplier = hasMultiplier ? Math.max(0, multiplierRaw) : null;
  const generatedMaterials = Array.isArray(entry.generatedMaterials)
    ? entry.generatedMaterials
        .map(m => {
          if (!m || !m.materialId) return null;
          const amount = Math.max(1, Math.round(Number(m.amount) || 0));
          return { materialId: m.materialId, name: describeMaterial(m.materialId), amount };
        })
        .filter(Boolean)
    : [];
  const missingMaterials = Array.isArray(entry.missing)
    ? entry.missing
        .map(m => {
          if (!m || !m.materialId) return null;
          const required = Math.max(0, Math.round(Number(m.required) || 0));
          const available = Math.max(0, Math.round(Number(m.available) || 0));
          return { materialId: m.materialId, name: describeMaterial(m.materialId), required, available };
        })
        .filter(Boolean)
    : [];
  const missingTargets = missingMaterials.map(m => m.name).filter(Boolean);
  const describeTargets = targets => {
    if (!targets || !targets.length) {
      return 'missing materials';
    }
    if (targets.length === 1) {
      return targets[0];
    }
    if (targets.length === 2) {
      return `${targets[0]} or ${targets[1]}`;
    }
    const head = targets.slice(0, -1).join(', ');
    const tail = targets[targets.length - 1];
    return `${head}, or ${tail}`;
  };
  const describeCreationRoll = (outcome, { includeTargets = false } = {}) => {
    if (!attempted) {
      return '';
    }
    if (!hasChance && !hasShare && !hasRoll && !hasMultiplier) {
      return 'Creation roll unavailable—insufficient attribute share.';
    }
    const detailParts = [];
    if (hasChance) {
      let chancePart = `${formatPercent(chance, 1)} chance`;
      if (hasRoll) {
        chancePart += `; rolled ${formatPercent(roll, 2)}`;
      }
      detailParts.push(chancePart);
    } else if (hasRoll) {
      detailParts.push(`rolled ${formatPercent(roll, 2)}`);
    }
    if (hasShare) {
      let sharePart = `${formatPercent(share, 1)} ${attributeName} share`;
      if (hasMultiplier) {
        sharePart += ` ×${formatJobLogMultiplier(multiplier)} multiplier`;
      }
      detailParts.push(sharePart);
    } else if (hasMultiplier) {
      detailParts.push(`×${formatJobLogMultiplier(multiplier)} multiplier`);
    }
    const details = detailParts.length ? ` (${detailParts.join('; ')})` : '';
    const targetText = includeTargets && missingTargets.length ? ` to conjure ${describeTargets(missingTargets)}` : '';
    return `Creation roll ${outcome}${targetText}${details}.`;
  };
  const statGain = entry.stat && Number.isFinite(entry.statAmount) && entry.statAmount > 0
    ? { stat: statLabel(entry.stat), amount: entry.statAmount }
    : null;
  const bonusAttributes = entry.bonusAttributes && typeof entry.bonusAttributes === 'object'
    ? Object.entries(entry.bonusAttributes)
        .map(([stat, amount]) => {
          const numeric = Number(amount);
          if (!stat || !Number.isFinite(numeric) || numeric <= 0) {
            return null;
          }
          return `${statLabel(stat)} +${numeric}`;
        })
        .filter(Boolean)
    : [];
  const succeeded = entry.generationSucceeded != null ? !!entry.generationSucceeded : entry.type === 'crafted';
  return {
    itemName,
    rarity: entry.rarity || null,
    type: entry.type === 'crafted' ? 'crafted' : 'failed',
    rawType: entry.type || 'failed',
    reason: entry.reason || null,
    timestamp: entry.timestamp || null,
    attributeName,
    attempted,
    generatedMaterials,
    missingMaterials,
    statGain,
    bonusAttributes,
    creation: {
      hasChance,
      hasShare,
      hasRoll,
      hasMultiplier,
      chance,
      share,
      roll,
      multiplier,
      succeeded,
    },
    describeCreationRoll,
  };
}

function createJobLogEntryStructure({
  className,
  titleText,
  rarityText,
  badgeText,
  badgeClass,
  timestamp,
}) {
  const li = document.createElement('li');
  li.className = `job-log-entry${className ? ` ${className}` : ''}`;

  const header = document.createElement('div');
  header.className = 'job-log-header';

  const titleGroup = document.createElement('div');
  titleGroup.className = 'job-log-title-group';

  const title = document.createElement('div');
  title.className = 'job-log-title';
  title.textContent = titleText;
  titleGroup.appendChild(title);

  if (rarityText) {
    const rarity = document.createElement('span');
    rarity.className = 'job-log-rarity';
    rarity.textContent = rarityText;
    titleGroup.appendChild(rarity);
  }

  header.appendChild(titleGroup);

  if (badgeText) {
    const badge = document.createElement('span');
    badge.className = badgeClass ? `job-log-badge ${badgeClass}` : 'job-log-badge';
    badge.textContent = badgeText;
    header.appendChild(badge);
  }

  li.appendChild(header);

  const details = document.createElement('div');
  details.className = 'job-log-details';
  li.appendChild(details);

  const addDetail = (label, value) => {
    if (!value) return;
    const row = document.createElement('div');
    row.className = 'job-log-detail';
    const l = document.createElement('div');
    l.className = 'label';
    l.textContent = label;
    const v = document.createElement('div');
    v.className = 'value';
    v.textContent = value;
    row.appendChild(l);
    row.appendChild(v);
    details.appendChild(row);
  };

  if (timestamp) {
    const time = new Date(timestamp);
    if (!Number.isNaN(time.getTime())) {
      const footer = document.createElement('div');
      footer.className = 'job-log-footer';
      footer.textContent = time.toLocaleString();
      li.appendChild(footer);
    }
  }

  return { li, addDetail };
}

function createStandardJobLogCard(info, { hideGenerated = false } = {}) {
  const className = info.type === 'crafted' ? 'log-crafted' : 'log-failed';
  const badgeClass = info.type === 'crafted'
    ? 'success'
    : info.reason === 'insufficient-materials'
      ? 'warning'
      : 'failure';
  const badgeText = info.type === 'crafted'
    ? 'Crafted'
    : info.reason === 'insufficient-materials'
      ? 'Missing Materials'
      : 'Failed';
  const { li, addDetail } = createJobLogEntryStructure({
    className,
    titleText: info.itemName,
    rarityText: info.rarity,
    badgeText,
    badgeClass,
    timestamp: info.timestamp,
  });

  addDetail('Outcome', info.type === 'crafted' ? 'Success' : info.reason === 'insufficient-materials' ? 'Blocked by missing materials' : 'Failed attempt');

  if (info.attempted) {
    addDetail('Roll Result', info.creation.succeeded ? 'Creation succeeded' : 'Creation failed');
  } else {
    addDetail('Roll Result', 'Not attempted');
  }

  const creationParts = [];
  if (info.creation.hasChance) {
    creationParts.push(`Chance ${formatPercent(info.creation.chance, 1)}`);
  }
  if (info.creation.hasRoll) {
    creationParts.push(`Roll ${formatPercent(info.creation.roll, 2)}`);
  }
  if (info.creation.hasShare) {
    let sharePart = `${formatPercent(info.creation.share, 1)} ${info.attributeName} share`;
    if (info.creation.hasMultiplier) {
      sharePart += ` ×${formatJobLogMultiplier(info.creation.multiplier)} multiplier`;
    }
    creationParts.push(sharePart);
  } else if (info.creation.hasMultiplier) {
    creationParts.push(`×${formatJobLogMultiplier(info.creation.multiplier)} multiplier`);
  }
  if (creationParts.length) {
    addDetail('Creation Roll', creationParts.join(' • '));
  }

  if (!hideGenerated && info.generatedMaterials.length) {
    addDetail('Materials Recovered', info.generatedMaterials.map(m => `${m.name} ×${m.amount}`).join(', '));
  }

  if (info.missingMaterials.length) {
    addDetail('Missing Materials', info.missingMaterials.map(m => `${m.name} (${m.available}/${m.required})`).join(', '));
  }

  if (info.statGain) {
    addDetail('Stat Gain', `+${info.statGain.amount} ${info.statGain.stat}`);
  }

  if (info.bonusAttributes && info.bonusAttributes.length) {
    addDetail('Augmentation', info.bonusAttributes.join(', '));
  }

  return li;
}

function createDiscoveryLogCard(info) {
  const materialsText = info.generatedMaterials.map(m => `${m.name} ×${m.amount}`).join(', ');
  const creationSummary = info.describeCreationRoll(
    info.creation.succeeded ? 'succeeded' : 'failed',
    { includeTargets: true }
  );
  const { li, addDetail } = createJobLogEntryStructure({
    className: 'log-discovery',
    titleText: 'Resource Discovery',
    badgeText: 'Recovered',
    badgeClass: 'info',
    timestamp: info.timestamp,
  });

  addDetail('Recovered', materialsText);
  addDetail('Attempted Recipe', info.itemName);
  if (creationSummary) {
    addDetail('Creation Roll', creationSummary);
  }

  return li;
}

function createSalvageLogCard(info) {
  const { li, addDetail } = createJobLogEntryStructure({
    className: 'log-salvaged',
    titleText: info.itemName,
    rarityText: info.rarity,
    badgeText: 'Salvaged',
    badgeClass: 'info',
    timestamp: info.timestamp,
  });

  if (info.recoveredMaterials && info.recoveredMaterials.length) {
    addDetail('Recovered Materials', info.recoveredMaterials.map(m => `${m.name} ×${m.amount}`).join(', '));
  }
  if (info.statGain) {
    addDetail('Stat Gain', `+${info.statGain.amount} ${info.statGain.stat}`);
  }

  return li;
}

function buildJobLogListItem(entry) {
  const fragment = document.createDocumentFragment();
  const info = getJobLogInfo(entry);
  if (!info) {
    return fragment;
  }
  if (info.type === 'salvaged') {
    const card = createSalvageLogCard(info);
    if (card) {
      fragment.appendChild(card);
    }
    return fragment;
  }
  const splitDiscovery = info.type !== 'crafted' && info.generatedMaterials.length > 0;
  const primaryCard = createStandardJobLogCard(info, { hideGenerated: splitDiscovery });
  if (primaryCard) {
    fragment.appendChild(primaryCard);
  }
  if (splitDiscovery) {
    const discoveryCard = createDiscoveryLogCard(info);
    if (discoveryCard) {
      fragment.appendChild(discoveryCard);
    }
  }
  return fragment;
}

function getJobAttributeSource(status) {
  if (status && status.character && status.character.attributes && typeof status.character.attributes === 'object') {
    return status.character.attributes;
  }
  if (currentCharacter && currentCharacter.attributes && typeof currentCharacter.attributes === 'object') {
    return currentCharacter.attributes;
  }
  return null;
}

function calculateResourceCreationInfo(source, status) {
  if (!source) {
    return { available: false, statName: 'Attribute', chance: 0, share: 0, multiplier: 0 };
  }
  const config = status && status.config ? status.config : null;
  const enabled = source.materialRecoveryEnabled != null
    ? !!source.materialRecoveryEnabled
    : !!(config && config.materialRecoveryEnabled);
  const attributeKey = typeof source.attribute === 'string' ? source.attribute.toLowerCase() : null;
  const statName = attributeKey ? statLabel(attributeKey) : 'Attribute';
  if (!enabled || !attributeKey) {
    return { available: false, statName, chance: 0, share: 0, multiplier: 0 };
  }
  const attributes = getJobAttributeSource(status);
  let totalAttributes = 0;
  let statValue = 0;
  if (attributes && typeof attributes === 'object') {
    Object.entries(attributes).forEach(([key, value]) => {
      const numeric = Number(value);
      if (!Number.isFinite(numeric) || numeric <= 0) {
        if (typeof key === 'string' && key.toLowerCase() === attributeKey) {
          statValue = 0;
        }
        return;
      }
      totalAttributes += numeric;
      if (typeof key === 'string' && key.toLowerCase() === attributeKey) {
        statValue = numeric;
      }
    });
  }
  const multiplierSource = source.materialRecoveryChanceMultiplier != null
    ? source.materialRecoveryChanceMultiplier
    : config && config.materialRecoveryChanceMultiplier;
  const multiplierNumeric = Number(multiplierSource);
  const multiplier = Number.isFinite(multiplierNumeric) && multiplierNumeric >= 0 ? multiplierNumeric : 0;
  const share = totalAttributes > 0 && statValue > 0 ? statValue / totalAttributes : 0;
  const chance = Math.max(0, Math.min(1, share * multiplier));
  return { available: true, statName, chance, share, multiplier };
}

function formatResourceCreationText(info) {
  if (!info || !info.available) {
    return 'Unavailable';
  }
  const digits = info.chance >= 0.1 ? 1 : 2;
  const chanceText = formatPercent(info.chance, digits);
  const shareDigits = info.share >= 0.1 ? 1 : 2;
  const shareText = formatPercent(info.share, shareDigits);
  const statName = info.statName || 'Attribute';
  const multiplierDigits = info.multiplier >= 1 ? 0 : 1;
  const multiplierText = formatPercent(info.multiplier, multiplierDigits);
  return `${chanceText} chance to create missing materials and add them to your inventory (based on ${shareText} ${statName} share × ${multiplierText} job bonus)`;
}

function renderJobSelectionContent(container, status) {
  container.innerHTML = '';
  const intro = document.createElement('p');
  intro.className = 'job-dialog-intro';
  intro.textContent = 'Choose a profession. This choice is permanent—clock in when you want to work and clock out to roam.';
  container.appendChild(intro);

  if (!status || !Array.isArray(status.jobs) || !status.jobs.length) {
    const empty = document.createElement('div');
    empty.className = 'job-empty-text';
    empty.textContent = 'No professions are available at this time.';
    container.appendChild(empty);
    return;
  }

  const tip = document.createElement('p');
  tip.className = 'job-dialog-note';
  tip.textContent = 'Professions use your materials to craft items each hour while you are on the clock.';
  container.appendChild(tip);

  const grid = document.createElement('div');
  grid.className = 'job-card-grid';
  const activeJobId = currentCharacter && currentCharacter.job ? currentCharacter.job.jobId : null;
  status.jobs.forEach(job => {
    const card = document.createElement('div');
    card.className = 'job-card';

    const title = document.createElement('h3');
    title.textContent = job.name;
    card.appendChild(title);

    const focus = document.createElement('div');
    focus.className = 'job-attribute';
    const focusParts = [];
    if (job.attribute) {
      focusParts.push(`${statLabel(job.attribute)} Focus`);
    }
    if (job.category) {
      focusParts.push(titleCase(job.category));
    }
    focus.textContent = focusParts.length ? focusParts.join(' • ') : 'Specialized Crafting';
    card.appendChild(focus);

    if (job.description) {
      const desc = document.createElement('p');
      desc.className = 'job-description';
      desc.textContent = job.description;
      card.appendChild(desc);
    }

    const details = document.createElement('ul');
    details.className = 'job-meta-list';
    const addDetail = (label, value) => {
      const li = document.createElement('li');
      const l = document.createElement('span');
      l.className = 'label';
      l.textContent = label;
      const v = document.createElement('span');
      v.className = 'value';
      v.textContent = value;
      li.appendChild(l);
      li.appendChild(v);
      details.appendChild(li);
    };
    const craftsPerHour = job.craftsPerHour || (status.config && status.config.craftsPerHour) || 0;
    addDetail('Crafts / Hour', craftsPerHour);
    const chance = job.statGainChance != null ? job.statGainChance : status.config?.statGainChance;
    const amount = job.statGainAmount != null ? job.statGainAmount : status.config?.statGainAmount;
    const statName = job.attribute ? statLabel(job.attribute) : 'Attribute';
    addDetail('Stat Gain Chance', `${formatPercent(chance || 0)} for +${amount || 0} ${statName}`);
    const creationInfo = calculateResourceCreationInfo(job, status);
    addDetail('Resource Creation Chance', formatResourceCreationText(creationInfo));
    card.appendChild(details);

    const recipeTitle = document.createElement('h4');
    recipeTitle.textContent = 'Recipes';
    card.appendChild(recipeTitle);
    card.appendChild(createJobRecipeList(job));

    const button = document.createElement('button');
    if (activeJobId) {
      button.disabled = true;
      button.textContent = activeJobId === job.id ? 'Current Profession' : 'Unavailable';
    } else {
      button.textContent = 'Choose Profession';
      button.addEventListener('click', () => handleSelectJob(job.id, container, button));
    }
    card.appendChild(button);

    grid.appendChild(card);
  });
  container.appendChild(grid);
}

function createBlacksmithModeControls(active, container) {
  const panel = document.createElement('div');
  panel.className = 'blacksmith-mode-panel';
  const label = document.createElement('span');
  label.className = 'blacksmith-mode-label';
  label.textContent = 'Active Task:';
  panel.appendChild(label);

  const createButton = (mode, text) => {
    const button = document.createElement('button');
    button.type = 'button';
    const isActive = active.blacksmith?.mode === mode;
    button.className = `blacksmith-mode-button${isActive ? ' active' : ''}`;
    button.dataset.mode = mode;
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    button.textContent = text;
    if (isActive) {
      button.disabled = true;
    } else {
      button.addEventListener('click', () => handleBlacksmithModeChange(mode, container, button));
    }
    return button;
  };

  panel.appendChild(createButton('craft', 'Forge Gear'));
  panel.appendChild(createButton('salvage', 'Salvage Gear'));
  return panel;
}

function createBlacksmithItemCard(entry, { type, container }) {
  const card = document.createElement('div');
  card.className = 'blacksmith-item-card';
  const header = document.createElement('div');
  header.className = 'blacksmith-item-header';
  const name = document.createElement('div');
  name.className = 'name';
  name.textContent = entry.name || titleCase(entry.itemId.replace(/_/g, ' '));
  header.appendChild(name);
  if (entry.rarity) {
    const rarity = document.createElement('span');
    rarity.className = 'rarity';
    rarity.textContent = entry.rarity;
    header.appendChild(rarity);
  }
  card.appendChild(header);

  const meta = document.createElement('div');
  meta.className = 'blacksmith-item-meta';
  if (type === 'inventory') {
    meta.textContent = `Available ${entry.available || 0}${entry.total != null ? ` / ${entry.total}` : ''}`;
  } else {
    meta.textContent = `Queued ${entry.count || 0}`;
  }
  card.appendChild(meta);

  if (Array.isArray(entry.tags) && entry.tags.length) {
    const tags = document.createElement('div');
    tags.className = 'blacksmith-tags';
    entry.tags.forEach(tagText => {
      if (!tagText) return;
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = tagText;
      tags.appendChild(tag);
    });
    card.appendChild(tags);
  }

  const controls = document.createElement('div');
  controls.className = 'blacksmith-item-controls';

  let quantityInput = null;
  let enforceQuantityBounds = () => {};
  if (type === 'inventory') {
    const quantityField = document.createElement('div');
    quantityField.className = 'blacksmith-quantity-field';
    const quantityId = `blacksmith-qty-${entry.itemId}`;
    const quantityLabel = document.createElement('label');
    quantityLabel.className = 'blacksmith-quantity-label';
    quantityLabel.setAttribute('for', quantityId);
    quantityLabel.textContent = 'Qty';
    quantityInput = document.createElement('input');
    quantityInput.type = 'number';
    quantityInput.id = quantityId;
    quantityInput.className = 'blacksmith-quantity-input';
    quantityInput.min = '1';
    if (entry.available > 0) {
      quantityInput.value = '1';
      quantityInput.max = String(entry.available);
    } else {
      quantityInput.value = '0';
      quantityInput.disabled = true;
    }
    enforceQuantityBounds = () => {
      if (!quantityInput) {
        return;
      }
      const raw = parseInt(quantityInput.value, 10);
      if (!Number.isFinite(raw)) {
        return;
      }
      const max = entry.available > 0 ? entry.available : 1;
      if (raw < 1) {
        quantityInput.value = entry.available > 0 ? '1' : '0';
        return;
      }
      if (raw > max) {
        quantityInput.value = String(max);
        return;
      }
      quantityInput.value = String(raw);
    };
    quantityInput.addEventListener('change', enforceQuantityBounds);
    quantityInput.addEventListener('blur', enforceQuantityBounds);
    quantityField.appendChild(quantityLabel);
    quantityField.appendChild(quantityInput);
    controls.appendChild(quantityField);
  }

  const action = document.createElement('button');
  action.type = 'button';
  action.className = 'blacksmith-item-action';
  if (type === 'inventory') {
    action.textContent = 'Add to Queue';
    if (!(entry.available > 0)) {
      action.disabled = true;
    }
    action.addEventListener('click', () => {
      if (!quantityInput) {
        handleAddToSalvageQueue(entry.itemId, 1, container, action);
        return;
      }
      enforceQuantityBounds();
      const raw = parseInt(quantityInput.value, 10);
      const max = entry.available > 0 ? entry.available : 1;
      let requested = Number.isFinite(raw) ? raw : 1;
      if (requested < 1) {
        requested = 1;
      }
      if (requested > max) {
        requested = max;
      }
      if (!(requested > 0)) {
        return;
      }
      handleAddToSalvageQueue(entry.itemId, requested, container, action);
    });
  } else {
    action.textContent = 'Remove';
    if (!(entry.count > 0)) {
      action.disabled = true;
    }
    action.addEventListener('click', () => handleRemoveFromSalvageQueue(entry.itemId, container, action));
  }
  controls.appendChild(action);
  card.appendChild(controls);
  return card;
}

function createBlacksmithColumn(title, entries, { type, container }) {
  const column = document.createElement('div');
  column.className = 'blacksmith-column';
  const heading = document.createElement('h4');
  heading.textContent = title;
  column.appendChild(heading);
  if (!Array.isArray(entries) || !entries.length) {
    const empty = document.createElement('p');
    empty.className = 'job-empty-text';
    empty.textContent = type === 'inventory'
      ? 'No equipment available to salvage.'
      : 'No items queued for salvage.';
    column.appendChild(empty);
    return column;
  }
  entries.forEach(entry => {
    column.appendChild(createBlacksmithItemCard(entry, { type, container }));
  });
  return column;
}

function createBlacksmithWorkspace(active, container) {
  const wrapper = document.createElement('div');
  wrapper.className = 'blacksmith-workspace';
  const inventoryColumn = createBlacksmithColumn('Inventory', active.blacksmith?.inventory || [], { type: 'inventory', container });
  const queueColumn = createBlacksmithColumn('Salvage Queue', active.blacksmith?.salvageQueue || [], { type: 'queue', container });
  wrapper.appendChild(inventoryColumn);
  wrapper.appendChild(queueColumn);
  return wrapper;
}

function renderJobActiveContent(container, status) {
  container.innerHTML = '';
  const active = status.activeJob;
  const jobDef = status.jobs ? status.jobs.find(job => job.id === active.id) || active : active;
  const statName = active.attribute ? statLabel(active.attribute) : 'Attribute';
  const isWorking = !!active.isWorking;
  const isBlacksmith = jobDef.type === 'blacksmith';
  const workingSinceDate = active.workingSince ? new Date(active.workingSince) : null;
  const lastAttemptDate = active.lastProcessedAt ? new Date(active.lastProcessedAt) : null;

  const summary = document.createElement('div');
  summary.className = 'job-active-summary';
  const title = document.createElement('h3');
  title.textContent = active.name;
  summary.appendChild(title);
  const subtitle = document.createElement('div');
  subtitle.className = 'job-active-subtitle';
  const subtitleParts = [];
  if (statName) subtitleParts.push(`${statName} Focus`);
  if (jobDef.category) subtitleParts.push(titleCase(jobDef.category));
  subtitle.textContent = subtitleParts.join(' • ');
  summary.appendChild(subtitle);
  if (jobDef.description) {
    const desc = document.createElement('p');
    desc.className = 'job-description';
    desc.textContent = jobDef.description;
    summary.appendChild(desc);
  }

  const shiftPanel = document.createElement('div');
  shiftPanel.className = 'job-shift-panel';

  const statusBadge = document.createElement('span');
  statusBadge.className = `job-shift-status ${isWorking ? 'working' : 'idle'}`;
  statusBadge.textContent = isWorking ? 'ON THE CLOCK' : 'OFF DUTY';
  shiftPanel.appendChild(statusBadge);

  const shiftMessage = document.createElement('p');
  shiftMessage.className = 'job-shift-message';
  if (isBlacksmith) {
    shiftMessage.textContent = isWorking
      ? 'Working your current task. Swap modes at any time to forge new gear or salvage old equipment.'
      : 'Choose whether to forge or salvage, then clock in to get the forge roaring.';
  } else {
    shiftMessage.textContent = isWorking
      ? 'Crafting runs in the background while materials are available. Clock out to take on adventures, matchmaking, or challenges.'
      : 'Clock in to begin hourly crafting rolls. Stay off duty to freely adventure and battle opponents.';
  }
  shiftPanel.appendChild(shiftMessage);

  const shiftButton = document.createElement('button');
  shiftButton.className = 'job-shift-action';
  shiftButton.textContent = isWorking ? 'Clock Out' : 'Clock In';
  shiftButton.addEventListener('click', () => handleJobShiftToggle(!isWorking, container, shiftButton));
  shiftPanel.appendChild(shiftButton);

  summary.appendChild(shiftPanel);

  if (isBlacksmith) {
    summary.appendChild(createBlacksmithModeControls(active, container));
  }

  const restriction = document.createElement('p');
  restriction.className = 'job-restriction-note';
  restriction.textContent = isWorking
    ? 'Clock out before starting adventures, matchmaking battles, or challenges.'
    : 'You are free to adventure, join matchmaking, or tackle challenges while off duty.';
  summary.appendChild(restriction);

  container.appendChild(summary);

  if (isBlacksmith) {
    container.appendChild(createBlacksmithWorkspace(active, container));
  }

  const statsGrid = document.createElement('div');
  statsGrid.className = 'job-stats-grid';
  const addStat = (label, value) => {
    const stat = document.createElement('div');
    stat.className = 'job-stat';
    const l = document.createElement('div');
    l.className = 'label';
    l.textContent = label;
    const v = document.createElement('div');
    v.className = 'value';
    v.textContent = value;
    stat.appendChild(l);
    stat.appendChild(v);
    statsGrid.appendChild(stat);
  };
  addStat('Shift Status', isWorking ? 'On the Clock' : 'Off Duty');
  if (workingSinceDate && !Number.isNaN(workingSinceDate.getTime())) {
    addStat('Working Since', workingSinceDate.toLocaleString());
  }
  if (lastAttemptDate && !Number.isNaN(lastAttemptDate.getTime())) {
    addStat('Last Attempt', lastAttemptDate.toLocaleString());
  }
  const craftsPerHour = active.craftsPerHour || status.config?.craftsPerHour || 0;
  addStat('Crafts / Hour', craftsPerHour);
  addStat(isBlacksmith ? 'Forge Attempts' : 'Total Attempts', active.totalAttempts || 0);
  addStat(isBlacksmith ? 'Successful Forges' : 'Successful Crafts', active.totalCrafted || 0);
  const successRate = active.totalAttempts ? `${Math.round((active.totalCrafted / active.totalAttempts) * 100)}%` : '0%';
  addStat(isBlacksmith ? 'Forge Success Rate' : 'Success Rate', successRate);
  const chance = active.statGainChance != null ? active.statGainChance : status.config?.statGainChance;
  const amount = active.statGainAmount != null ? active.statGainAmount : status.config?.statGainAmount;
  addStat('Stat Gain Chance', `${formatPercent(chance || 0)} for +${amount || 0} ${statName}`);
  const creationInfo = calculateResourceCreationInfo(active, status);
  addStat('Resource Creation Chance', formatResourceCreationText(creationInfo));
  addStat('Total Stat Gains', `${active.totalStatGain || 0} ${statName}`);
  if (isBlacksmith) {
    const queuedItems = (active.blacksmith?.salvageQueue || []).reduce((sum, entry) => sum + (entry.count || 0), 0);
    addStat('Queued for Salvage', queuedItems);
  }
  const nextText = isWorking
    ? active.secondsUntilNext == null
      ? 'Processing...'
      : formatDurationShort(active.secondsUntilNext)
    : 'Clocked Out';
  addStat('Next Attempt', nextText);
  if (isWorking && active.nextAttemptAt) {
    const nextDate = new Date(active.nextAttemptAt);
    if (!Number.isNaN(nextDate.getTime())) {
      addStat('Next Attempt At', nextDate.toLocaleString());
    }
  }
  container.appendChild(statsGrid);

  const totalsSection = document.createElement('div');
  totalsSection.className = 'job-output-section';
  const totalsTitle = document.createElement('h4');
  totalsTitle.textContent = 'Production Summary';
  totalsSection.appendChild(totalsTitle);
  if (!active.totalsByItem || !active.totalsByItem.length) {
    const empty = document.createElement('p');
    empty.className = 'job-empty-text';
    empty.textContent = 'No items crafted yet. Maintain a supply of materials to keep production running.';
    totalsSection.appendChild(empty);
  } else {
    const list = document.createElement('ul');
    list.className = 'job-output-list';
    active.totalsByItem.forEach(entry => {
      const item = document.createElement('li');
      item.className = 'job-output-item';
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = entry.name || titleCase(entry.itemId.replace(/^useable[_-]?/i, '').replace(/_/g, ' '));
      item.appendChild(name);
      const count = document.createElement('span');
      count.className = 'count';
      count.textContent = `×${entry.count}`;
      item.appendChild(count);
      if (entry.rarity) {
        const rarity = document.createElement('span');
        rarity.className = 'rarity';
        rarity.textContent = entry.rarity;
        item.appendChild(rarity);
      }
      list.appendChild(item);
    });
    totalsSection.appendChild(list);
  }
  container.appendChild(totalsSection);

  const logSection = document.createElement('div');
  logSection.className = 'job-log-section';
  const logHeaderBar = document.createElement('div');
  logHeaderBar.className = 'job-log-header-bar';
  const logTitle = document.createElement('h4');
  logTitle.textContent = 'Recent Activity';
  logHeaderBar.appendChild(logTitle);
  const clearButton = document.createElement('button');
  clearButton.type = 'button';
  clearButton.className = 'job-log-clear';
  clearButton.textContent = 'Clear Log';
  const hasLogEntries = Array.isArray(active.log) && active.log.length > 0;
  if (!hasLogEntries) {
    clearButton.disabled = true;
  } else {
    clearButton.addEventListener('click', () => handleClearJobLog(container, clearButton));
  }
  logHeaderBar.appendChild(clearButton);
  logSection.appendChild(logHeaderBar);
  if (!hasLogEntries) {
    const emptyLog = document.createElement('p');
    emptyLog.className = 'job-empty-text';
    emptyLog.textContent = 'No activity recorded yet.';
    logSection.appendChild(emptyLog);
  } else {
    const logList = document.createElement('ul');
    logList.className = 'job-log-list';
    active.log.forEach(entry => {
      logList.appendChild(buildJobLogListItem(entry));
    });
    const scrollContainer = document.createElement('div');
    scrollContainer.className = 'job-log-scroll';
    scrollContainer.appendChild(logList);
    logSection.appendChild(scrollContainer);
  }
  container.appendChild(logSection);

  const recipeSection = document.createElement('div');
  recipeSection.className = 'job-recipe-section';
  const recipeTitle = document.createElement('h4');
  recipeTitle.textContent = isBlacksmith ? 'Forge Catalogue' : 'Available Recipes';
  recipeSection.appendChild(recipeTitle);
  recipeSection.appendChild(createJobRecipeList(jobDef, { includeOwned: true }));
  container.appendChild(recipeSection);
}

function renderJobDialogContent(container, status) {
  if (!container) return;
  if (!status) {
    container.innerHTML = '';
    const error = document.createElement('div');
    error.className = 'job-empty-text';
    error.textContent = 'Unable to load profession details.';
    container.appendChild(error);
    return;
  }
  if (status.activeJob) {
    renderJobActiveContent(container, status);
  } else {
    renderJobSelectionContent(container, status);
  }
}

async function handleSelectJob(jobId, container, button) {
  if (!currentPlayer || !currentCharacter) return;
  if (button) button.disabled = true;
  let responsePayload = null;
  try {
    const res = await fetch(`/characters/${currentCharacter.id}/job/select`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: currentPlayer.id, jobId }),
    });
    try {
      responsePayload = await res.json();
    } catch (err) {
      responsePayload = null;
    }
    if (!res.ok) {
      const message = responsePayload && responsePayload.error ? responsePayload.error : 'Failed to select job';
      throw new Error(message);
    }
    jobStatusCache = responsePayload;
    try {
      await refreshInventory(true);
    } catch (err) {
      console.error('inventory refresh failed', err);
    }
    if (isTabActive('character')) {
      renderCharacter();
    }
    renderJobDialogContent(container, responsePayload);
  } catch (err) {
    alert(err && err.message ? err.message : 'Failed to select job');
    if (button) button.disabled = false;
  }
}

async function handleJobShiftToggle(shouldStart, container, button) {
  if (!currentPlayer || !currentCharacter) return;
  if (button) button.disabled = true;
  let responsePayload = null;
  try {
    const endpoint = shouldStart ? 'start' : 'stop';
    const res = await fetch(`/characters/${currentCharacter.id}/job/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: currentPlayer.id }),
    });
    try {
      responsePayload = await res.json();
    } catch (err) {
      responsePayload = null;
    }
    if (!res.ok) {
      const message = responsePayload && responsePayload.error
        ? responsePayload.error
        : shouldStart ? 'Failed to start working' : 'Failed to stop working';
      throw new Error(message);
    }
    jobStatusCache = responsePayload;
    try {
      await refreshInventory(true);
    } catch (err) {
      console.error('inventory refresh failed', err);
    }
    if (isTabActive('character')) {
      renderCharacter();
    }
    renderJobDialogContent(container, responsePayload);
  } catch (err) {
    alert(err && err.message ? err.message : shouldStart ? 'Failed to start working' : 'Failed to stop working');
  } finally {
    if (button) button.disabled = false;
  }
}

async function handleBlacksmithModeChange(mode, container, button) {
  if (!currentPlayer || !currentCharacter || !container) return;
  const normalizedMode = mode === 'salvage' ? 'salvage' : 'craft';
  const currentMode = jobStatusCache?.activeJob?.blacksmith?.mode || null;
  if (currentMode === normalizedMode) {
    return;
  }
  const originalText = button ? button.textContent : null;
  if (button) {
    button.disabled = true;
    button.textContent = 'Switching...';
  }
  let responsePayload = null;
  let succeeded = false;
  try {
    const res = await fetch(`/characters/${currentCharacter.id}/job/mode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: currentPlayer.id, mode: normalizedMode }),
    });
    try {
      responsePayload = await res.json();
    } catch (err) {
      responsePayload = null;
    }
    if (!res.ok) {
      const message = responsePayload && responsePayload.error
        ? responsePayload.error
        : 'Failed to update job mode';
      throw new Error(message);
    }
    jobStatusCache = responsePayload;
    try {
      await refreshInventory(true);
    } catch (err) {
      console.error('inventory refresh failed', err);
    }
    if (isTabActive('character')) {
      renderCharacter();
    }
    renderJobDialogContent(container, responsePayload);
    succeeded = true;
  } catch (err) {
    alert(err && err.message ? err.message : 'Failed to update job mode');
  } finally {
    if (!succeeded && button) {
      button.disabled = false;
      if (originalText != null) {
        button.textContent = originalText;
      }
    }
  }
}

async function mutateBlacksmithSalvageQueue(action, itemId, container, button, options = {}) {
  if (!currentPlayer || !currentCharacter || !container) return;
  const itemKey = typeof itemId === 'string' ? itemId : '';
  if (!itemKey) {
    return;
  }
  const endpoint = action === 'remove' ? 'remove' : 'add';
  const pendingText = endpoint === 'add' ? 'Adding...' : 'Removing...';
  const originalText = button ? button.textContent : null;
  if (button) {
    button.disabled = true;
    button.textContent = pendingText;
  }
  let responsePayload = null;
  let succeeded = false;
  try {
    const payload = { playerId: currentPlayer.id, itemId: itemKey };
    if (endpoint === 'add') {
      const provided = Number(options.count);
      const normalized = Number.isFinite(provided) ? Math.floor(provided) : 1;
      payload.count = normalized > 0 ? normalized : 1;
    }
    const res = await fetch(`/characters/${currentCharacter.id}/job/salvage/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    try {
      responsePayload = await res.json();
    } catch (err) {
      responsePayload = null;
    }
    if (!res.ok) {
      const message = responsePayload && responsePayload.error
        ? responsePayload.error
        : endpoint === 'add'
          ? 'Failed to add item to salvage queue'
          : 'Failed to remove item from salvage queue';
      throw new Error(message);
    }
    jobStatusCache = responsePayload;
    try {
      await refreshInventory(true);
    } catch (err) {
      console.error('inventory refresh failed', err);
    }
    if (isTabActive('character')) {
      renderCharacter();
    }
    renderJobDialogContent(container, responsePayload);
    succeeded = true;
  } catch (err) {
    const fallback = endpoint === 'add'
      ? 'Failed to add item to salvage queue'
      : 'Failed to remove item from salvage queue';
    alert(err && err.message ? err.message : fallback);
  } finally {
    if (!succeeded && button) {
      button.disabled = false;
      if (originalText != null) {
        button.textContent = originalText;
      }
    }
  }
}

async function handleAddToSalvageQueue(itemId, count, container, button) {
  const provided = Number(count);
  const normalized = Number.isFinite(provided) ? Math.floor(provided) : 1;
  const quantity = normalized > 0 ? normalized : 1;
  await mutateBlacksmithSalvageQueue('add', itemId, container, button, { count: quantity });
}

async function handleRemoveFromSalvageQueue(itemId, container, button) {
  await mutateBlacksmithSalvageQueue('remove', itemId, container, button);
}

function showJobConfirmDialog({
  title = 'Confirm Action',
  message = 'Are you sure?',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
} = {}) {
  return new Promise(resolve => {
    let overlay = document.getElementById('job-confirm-overlay');
    if (overlay) {
      overlay.remove();
    }
    overlay = document.createElement('div');
    overlay.id = 'job-confirm-overlay';
    overlay.className = 'job-confirm-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'job-confirm-dialog';
    overlay.appendChild(dialog);

    const heading = document.createElement('h3');
    heading.textContent = title;
    dialog.appendChild(heading);

    const body = document.createElement('p');
    body.textContent = message;
    dialog.appendChild(body);

    const actions = document.createElement('div');
    actions.className = 'job-confirm-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = cancelLabel;
    actions.appendChild(cancelBtn);

    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = 'confirm';
    confirmBtn.textContent = confirmLabel;
    actions.appendChild(confirmBtn);

    dialog.appendChild(actions);

    document.body.appendChild(overlay);

    let settled = false;
    const cleanup = result => {
      if (settled) return;
      settled = true;
      document.removeEventListener('keydown', keyHandler);
      overlay.remove();
      resolve(result);
    };

    const keyHandler = event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        cleanup(false);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        cleanup(true);
      }
    };

    cancelBtn.addEventListener('click', () => cleanup(false));
    confirmBtn.addEventListener('click', () => cleanup(true));
    overlay.addEventListener('click', event => {
      if (event.target === overlay) {
        cleanup(false);
      }
    });
    document.addEventListener('keydown', keyHandler);

    setTimeout(() => {
      try {
        confirmBtn.focus();
      } catch (err) {
        /* ignore */
      }
    }, 0);
  });
}

async function handleClearJobLog(container, button) {
  if (!currentPlayer || !currentCharacter || !container || !button) return;
  const confirmed = await showJobConfirmDialog({
    title: 'Clear Crafting Log',
    message: 'Are you sure you want to clear all recent crafting activity?',
    confirmLabel: 'Clear Log',
    cancelLabel: 'Cancel',
  });
  if (!confirmed) {
    return;
  }
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = 'Clearing...';
  let responsePayload = null;
  try {
    const res = await fetch(`/characters/${currentCharacter.id}/job/log/clear`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: currentPlayer.id }),
    });
    try {
      responsePayload = await res.json();
    } catch (err) {
      responsePayload = null;
    }
    if (!res.ok) {
      const message = responsePayload && responsePayload.error
        ? responsePayload.error
        : 'Failed to clear crafting log';
      throw new Error(message);
    }
    jobStatusCache = responsePayload;
    if (isTabActive('character')) {
      renderCharacter();
    }
    renderJobDialogContent(container, responsePayload);
  } catch (err) {
    alert(err && err.message ? err.message : 'Failed to clear crafting log');
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = originalText;
    }
  }
}

async function showJobDialog() {
  if (!currentPlayer || !currentCharacter) return;
  await ensureCatalog();

  let overlay = document.getElementById('job-dialog');
  if (overlay) {
    overlay.remove();
  }
  overlay = document.createElement('div');
  overlay.id = 'job-dialog';
  overlay.className = 'job-dialog-overlay';

  const box = document.createElement('div');
  box.className = 'job-dialog';
  overlay.appendChild(box);

  const header = document.createElement('div');
  header.className = 'job-dialog-header';
  const title = document.createElement('h2');
  title.textContent = 'Professions';
  header.appendChild(title);
  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'Close';
  closeBtn.addEventListener('click', () => {
    overlay.remove();
    if (isTabActive('character')) {
      renderCharacter();
    }
  });
  header.appendChild(closeBtn);
  box.appendChild(header);

  const content = document.createElement('div');
  content.className = 'job-dialog-content';
  const loading = document.createElement('div');
  loading.className = 'job-dialog-loading';
  loading.textContent = 'Loading...';
  content.appendChild(loading);
  box.appendChild(content);

  overlay.addEventListener('click', event => {
    if (event.target === overlay) {
      closeBtn.click();
    }
  });

  document.body.appendChild(overlay);

  try {
    const status = await fetchJobStatusAndRefresh(true);
    renderJobDialogContent(content, status);
  } catch (err) {
    loading.textContent = err && err.message ? err.message : 'Failed to load job data.';
    loading.classList.add('error');
  }
}

function buildShopCategoryStructure(items) {
  const structure = {};
  items.forEach(item => {
    const categoryKey = getShopCategoryKey(item);
    const subgroup = getShopSubgroupInfo(categoryKey, item);
    if (!structure[categoryKey]) {
      structure[categoryKey] = new Map();
    }
    const groupMap = structure[categoryKey];
    if (!groupMap.has(subgroup.key)) {
      groupMap.set(subgroup.key, { label: subgroup.label, items: [] });
    }
    groupMap.get(subgroup.key).items.push(item);
  });
  return structure;
}

function renderShopGroups(container, items, messageEl) {
  const structure = buildShopCategoryStructure(items);
  let rendered = false;
  SHOP_CATEGORY_DEFINITIONS.forEach(category => {
    const groupMap = structure[category.value];
    if (!groupMap || !groupMap.size) return;
    rendered = true;
    const section = document.createElement('section');
    section.className = 'shop-category';
    const totalCount = [...groupMap.values()].reduce((sum, subgroup) => sum + subgroup.items.length, 0);
    const header = document.createElement('div');
    header.className = 'shop-category-header';
    header.textContent = `${category.label} (${totalCount})`;
    section.appendChild(header);

    const subgroups = [...groupMap.values()].sort((a, b) => a.label.localeCompare(b.label));
    const showTitles = subgroups.length > 1;
    subgroups.forEach(subgroup => {
      const subSection = document.createElement('div');
      subSection.className = 'shop-subsection';
      if (showTitles) {
        const title = document.createElement('div');
        title.className = 'shop-subsection-title';
        const name = document.createElement('span');
        name.textContent = subgroup.label;
        title.appendChild(name);
        const count = document.createElement('span');
        count.className = 'shop-subsection-count';
        count.textContent = `${subgroup.items.length} item${subgroup.items.length === 1 ? '' : 's'}`;
        title.appendChild(count);
        subSection.appendChild(title);
      }

      const grid = document.createElement('div');
      grid.className = 'shop-card-grid';
      subgroup.items.forEach(item => {
        grid.appendChild(buildShopItemCard(item, messageEl));
      });
      subSection.appendChild(grid);
      section.appendChild(subSection);
    });

    container.appendChild(section);
  });

  if (!rendered) {
    const empty = document.createElement('div');
    empty.className = 'shop-empty';
    empty.textContent = 'No items match the selected filters.';
    container.appendChild(empty);
  }
}

function createTag(text) {
  const tag = document.createElement('div');
  tag.className = 'card-tag';
  tag.textContent = text;
  return tag;
}

function buildShopItemCard(item, messageEl) {
  const card = document.createElement('div');
  card.className = 'shop-item-card';

  const header = document.createElement('div');
  header.className = 'card-header';
  const name = document.createElement('div');
  name.className = 'card-name';
  name.textContent = item.name;
  header.appendChild(name);
  const rarity = document.createElement('div');
  rarity.className = 'card-rarity';
  rarity.textContent = item.rarity || 'Common';
  header.appendChild(rarity);
  card.appendChild(header);

  const tags = document.createElement('div');
  tags.className = 'card-tags';
  const slotTag = slotLabel(item.slot);
  if (slotTag) tags.appendChild(createTag(slotTag));
  if (item.slot === 'weapon') {
    const typeTag = item.type ? titleCase(item.type) : '';
    if (typeTag) tags.appendChild(createTag(typeTag));
    if (item.damageType) tags.appendChild(createTag(`${titleCase(item.damageType)} Damage`));
  } else if (isUseableItem(item)) {
    const categoryTag = item.category ? titleCase(item.category) : '';
    if (categoryTag) tags.appendChild(createTag(categoryTag));
  } else if (isMaterial(item)) {
    tags.appendChild(createTag('Crafting'));
  } else if (item.type) {
    tags.appendChild(createTag(titleCase(item.type)));
  }
  if (tags.childElementCount) {
    card.appendChild(tags);
  }

  if (isMaterial(item) && item.description) {
    const body = document.createElement('div');
    body.className = 'card-description';
    body.textContent = item.description;
    card.appendChild(body);
  }

  const footer = document.createElement('div');
  footer.className = 'card-footer';
  const cost = document.createElement('div');
  cost.className = 'card-cost';
  cost.textContent = `${getItemCost(item)} Gold`;
  footer.appendChild(cost);

  const button = document.createElement('button');
  button.textContent = 'Buy';
  const price = getItemCost(item);
  const gold = currentCharacter ? currentCharacter.gold || 0 : 0;
  if (!currentCharacter || gold < price) {
    button.disabled = true;
  }
  button.addEventListener('click', () => purchaseItem(item, messageEl));
  footer.appendChild(button);

  card.appendChild(footer);

  attachTooltip(card, () => itemTooltip(item));
  return card;
}

async function refreshInventory(force = false) {
  if (!currentPlayer || !currentCharacter) return null;
  if (!force && inventoryView) {
    return inventoryView;
  }
  if (!inventoryPromise) {
    const url = `/players/${currentPlayer.id}/inventory?characterId=${currentCharacter.id}`;
    inventoryPromise = (async () => {
      const res = await fetch(url);
      if (!res.ok) {
        let message = 'failed to load inventory';
        try {
          const err = await res.json();
          if (err && err.error) message = err.error;
        } catch {}
        throw new Error(message);
      }
      const data = await res.json();
      applyInventoryData(data);
      return inventoryView;
    })();
  }
  try {
    return await inventoryPromise;
  } finally {
    inventoryPromise = null;
  }
}

async function ensureInventory() {
  if (inventoryView) return inventoryView;
  return refreshInventory(true);
}

function applyStashData(data) {
  if (!data) {
    stashView = null;
  } else {
    const gold = Number.isFinite(data.gold) ? Math.max(0, Math.floor(data.gold)) : 0;
    const equipmentSlots = Number.isFinite(data.equipmentSlots)
      ? Math.max(5, Math.floor(data.equipmentSlots))
      : 5;
    const slotsUsedRaw = Number.isFinite(data.slotsUsed) ? Math.max(0, Math.floor(data.slotsUsed)) : 0;
    const slotsUsed = Math.min(slotsUsedRaw, equipmentSlots);
    const nextSlotCost = Number.isFinite(data.nextSlotCost) && data.nextSlotCost > 0
      ? Math.min(Math.floor(data.nextSlotCost), SAFE_MAX_QUANTITY)
      : null;
    const equipment = Array.isArray(data.equipment)
      ? data.equipment
          .filter(entry => entry && entry.item && Number.isFinite(entry.count) && entry.count > 0)
          .map(entry => ({
            ...entry,
            count: Math.min(Math.floor(entry.count), SAFE_MAX_QUANTITY),
          }))
      : [];
    const materials = Array.isArray(data.materials)
      ? data.materials
          .filter(entry => entry && entry.material && Number.isFinite(entry.count) && entry.count > 0)
          .map(entry => ({
            ...entry,
            count: Math.min(Math.floor(entry.count), SAFE_MAX_QUANTITY),
          }))
      : [];
    stashView = {
      ...data,
      gold,
      equipmentSlots,
      slotsUsed,
      nextSlotCost,
      equipment,
      materials,
    };
  }
  updateInventoryHeader();
  if (stashDialog) {
    renderStashDialog(stashDialog, stashView);
  }
}

async function refreshStash(force = false) {
  if (!currentPlayer || !currentCharacter) return null;
  if (!force && stashView) {
    return stashView;
  }
  if (!stashPromise) {
    const url = `/players/${currentPlayer.id}/stash?characterId=${currentCharacter.id}`;
    stashPromise = (async () => {
      const res = await fetch(url);
      if (!res.ok) {
        let message = 'failed to load stash';
        try {
          const err = await res.json();
          if (err && err.error) message = err.error;
        } catch {}
        throw new Error(message);
      }
      const data = await res.json();
      applyStashData(data);
      return stashView;
    })()
      .catch(err => {
        stashView = null;
        updateInventoryHeader();
        throw err;
      })
      .finally(() => {
        stashPromise = null;
      });
  }
  return stashPromise;
}

async function ensureStash() {
  if (stashView) return stashView;
  return refreshStash(true);
}

function getEquippedSlotItem(slot) {
  if (!inventoryView) return null;
  if (EQUIPMENT_SLOTS.includes(slot)) {
    return inventoryView.equipped ? inventoryView.equipped[slot] : null;
  }
  if (USEABLE_SLOTS.includes(slot)) {
    return inventoryView.useables ? inventoryView.useables[slot] : null;
  }
  return null;
}

function getUseableSlotsForItem(itemId) {
  if (!inventoryView || !inventoryView.useables) return [];
  return USEABLE_SLOTS.filter(slot => {
    const entry = inventoryView.useables[slot];
    return entry && entry.id === itemId;
  });
}

function countEquippedCopiesForItem(itemId) {
  if (!inventoryView || !itemId) return 0;
  let total = 0;
  if (inventoryView.equipped) {
    EQUIPMENT_SLOTS.forEach(slot => {
      const equipped = inventoryView.equipped[slot];
      if (equipped && equipped.id === itemId) {
        total += 1;
      }
    });
  }
  if (inventoryView.useables) {
    USEABLE_SLOTS.forEach(slot => {
      const equipped = inventoryView.useables[slot];
      if (equipped && equipped.id === itemId) {
        total += 1;
      }
    });
  }
  return total;
}

function isTabActive(id) {
  const pane = document.getElementById(id);
  return pane ? pane.classList.contains('active') : false;
}

function renderCharacters() {
  const list = document.getElementById('character-list');
  if (!list) return;
  list.innerHTML = '';
  list.classList.toggle('empty', characters.length === 0);
  adventurePreviewViews.clear();
  if (!characters.length) {
    const empty = document.createElement('div');
    empty.className = 'character-empty-card';
    empty.textContent = 'No characters yet. Forge a new legend!';
    list.appendChild(empty);
    return;
  }
  characters.forEach(c => {
    const card = document.createElement('div');
    card.className = 'character-card';

    const header = document.createElement('div');
    header.className = 'card-header';
    card.appendChild(header);

    const name = document.createElement('div');
    name.className = 'character-name';
    name.textContent = c.name || `Character ${c.id}`;
    header.appendChild(name);

    const level = document.createElement('div');
    level.className = 'character-level';
    level.textContent = `Level ${c.level || 1}`;
    header.appendChild(level);

    const type = document.createElement('div');
    type.className = 'character-type';
    type.textContent = `${displayDamageType(c.basicType)} Damage`;
    card.appendChild(type);

    const xpSection = document.createElement('div');
    xpSection.className = 'character-xp';
    card.appendChild(xpSection);

    const levelValue = c.level || 1;
    const xpNeeded = xpForNextLevel(levelValue);
    const xpCurrent = c.xp || 0;
    const xpLabel = document.createElement('div');
    xpLabel.className = 'xp-label';
    xpLabel.textContent = xpNeeded > 0 ? `XP ${xpCurrent} / ${xpNeeded}` : `XP ${xpCurrent}`;
    xpSection.appendChild(xpLabel);

    const xpBar = document.createElement('div');
    xpBar.className = 'xp-bar';
    xpSection.appendChild(xpBar);

    const xpFill = document.createElement('div');
    xpFill.className = 'xp-fill';
    const progress = xpNeeded > 0 ? Math.min(1, Math.max(0, xpCurrent / xpNeeded)) : 1;
    xpFill.style.width = `${progress * 100}%`;
    xpBar.appendChild(xpFill);

    if (xpNeeded > 0) {
      const xpHint = document.createElement('div');
      xpHint.className = 'xp-hint';
      if (xpCurrent >= xpNeeded) {
        xpHint.textContent = 'Ready to level up!';
      } else {
        const remaining = Math.max(0, xpNeeded - xpCurrent);
        xpHint.textContent = `${remaining} XP to next level`;
      }
      xpSection.appendChild(xpHint);
    }

    const adventureSection = document.createElement('div');
    adventureSection.className = 'character-adventure';
    card.appendChild(adventureSection);

    const adventureTitle = document.createElement('div');
    adventureTitle.className = 'adventure-title';
    adventureTitle.textContent = 'Adventure';
    adventureSection.appendChild(adventureTitle);

    const adventureBar = document.createElement('div');
    adventureBar.className = 'adventure-progress-bar';
    const adventureFill = document.createElement('div');
    adventureFill.className = 'adventure-progress-fill';
    adventureBar.appendChild(adventureFill);
    adventureSection.appendChild(adventureBar);

    const adventureStatusText = document.createElement('div');
    adventureStatusText.className = 'adventure-status-text';
    adventureSection.appendChild(adventureStatusText);

    const adventureTimeText = document.createElement('div');
    adventureTimeText.className = 'adventure-time-remaining';
    adventureSection.appendChild(adventureTimeText);

    const view = {
      fill: adventureFill,
      statusEl: adventureStatusText,
      timeEl: adventureTimeText,
      container: adventureSection,
    };
    adventurePreviewViews.set(c.id, view);

    const cached = getAdventurePreviewEntry(c.id);
    const now = Date.now();
    if (cached && cached.data) {
      applyAdventurePreview(view, cached.data, { error: !!cached.error });
      if (!cached.timestamp || now - cached.timestamp > ADVENTURE_PREVIEW_TTL) {
        loadAdventurePreview(c.id).then(result => {
          const payload = result || {};
          updateAdventurePreviewView(c.id, payload.status, { error: !!payload.error });
        });
      }
    } else if (cached && cached.error) {
      applyAdventurePreview(view, null, { error: true });
      if (!cached.timestamp || now - cached.timestamp > ADVENTURE_PREVIEW_TTL) {
        loadAdventurePreview(c.id).then(result => {
          const payload = result || {};
          updateAdventurePreviewView(c.id, payload.status, { error: !!payload.error });
        });
      }
    } else {
      applyAdventurePreview(view, null, { loading: true });
      loadAdventurePreview(c.id).then(result => {
        const payload = result || {};
        updateAdventurePreviewView(c.id, payload.status, { error: !!payload.error });
      });
    }

    const stats = c.attributes || {};
    const attrGrid = document.createElement('div');
    attrGrid.className = 'character-attributes';
    STAT_KEYS.forEach(key => {
      const attr = document.createElement('div');
      attr.className = 'attribute';
      const label = document.createElement('span');
      label.className = 'label';
      label.textContent = key.slice(0, 3).toUpperCase();
      attr.appendChild(label);
      const value = document.createElement('span');
      value.className = 'value';
      const statValue = stats[key];
      value.textContent = Number.isFinite(statValue) ? statValue : 0;
      attr.appendChild(value);
      attrGrid.appendChild(attr);
    });
    card.appendChild(attrGrid);

    const gold = document.createElement('div');
    gold.className = 'character-gold';
    const goldValue = Number.isFinite(c.gold) ? c.gold : 0;
    gold.textContent = `Gold ${goldValue}`;
    card.appendChild(gold);

    const btn = document.createElement('button');
    btn.textContent = 'Play';
    btn.addEventListener('click', () => enterGame(c));
    card.appendChild(btn);

    list.appendChild(card);
  });
}

document.getElementById('login-btn').addEventListener('click', async () => {
  const name = nameInput.value.trim();
  if (!name) return;
  try {
    const data = await postJSON('/login', { name });
    currentPlayer = data.player;
    characters = data.characters;
    renderCharacters();
    authDiv.classList.add('hidden');
    charSelectDiv.classList.remove('hidden');
    authError.classList.add('hidden');
  } catch (err) {
    authError.textContent = err.message;
    authError.classList.remove('hidden');
  }
});

document.getElementById('register-btn').addEventListener('click', async () => {
  const name = nameInput.value.trim();
  if (!name) return;
  try {
    await postJSON('/register', { name });
    const data = await postJSON('/login', { name });
    currentPlayer = data.player;
    characters = data.characters;
    renderCharacters();
    authDiv.classList.add('hidden');
    charSelectDiv.classList.remove('hidden');
    authError.classList.add('hidden');
  } catch (err) {
    authError.textContent = err.message;
    authError.classList.remove('hidden');
  }
});

document.getElementById('create-character').addEventListener('click', () => {
  newCharName.value = '';
  nameDialog.classList.remove('hidden');
  newCharName.focus();
});

nameCancel.addEventListener('click', () => {
  nameDialog.classList.add('hidden');
});

nameOk.addEventListener('click', async () => {
  const name = newCharName.value.trim();
  if (!name) return;
  try {
    const res = await fetch(`/players/${currentPlayer.id}/characters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    if (!res.ok) throw new Error('create failed');
    const character = await res.json();
    characters.push(character);
    renderCharacters();
  } catch {
    console.error('character creation failed');
  }
  nameDialog.classList.add('hidden');
});

async function enterGame(character) {
  if (currentCharacter && currentCharacter.id !== character.id) {
    await leaveWorldServer();
  }
  clearJobStatusCache();
  currentCharacter = character;
  resetWorldState();
  setRotationDamageType(character ? character.basicType : null);
  charSelectDiv.classList.add('hidden');
  gameDiv.classList.remove('hidden');
  inventoryView = null;
  stashView = null;
  closeStashDialog();
  rotationInitialized = false;
  rotation = [];
  try {
    await refreshInventory(true);
  } catch (err) {
    console.error('inventory load failed', err);
  }
  initTabs();
}

function exitToCharacterSelect() {
  const previousId = currentCharacter ? currentCharacter.id : null;
  const latestStatus = adventureStatus;
  stopAdventurePolling();
  leaveWorldServer();
  resetWorldState();
  if (previousId != null && latestStatus) {
    cacheAdventurePreview(previousId, latestStatus, { error: !!latestStatus.error });
    updateAdventurePreviewView(previousId, latestStatus, { error: !!latestStatus.error });
  }
  currentCharacter = null;
  clearJobStatusCache();
  inventoryView = null;
  stashView = null;
  closeStashDialog();
  rotation = [];
  rotationInitialized = false;
  adventureElements = null;
  adventureStatus = null;
  const battleArea = document.getElementById('battle-area');
  if (battleArea) {
    battleArea.innerHTML = '';
  }
  gameDiv.classList.add('hidden');
  charSelectDiv.classList.remove('hidden');
  document.body.classList.remove('world-tab-active');
  renderCharacters();
}

function showTab(target) {
  if (!target) return false;
  let found = false;
  document.querySelectorAll('.tab-pane').forEach(pane => {
    const isActive = pane.id === target;
    if (isActive) found = true;
    pane.classList.toggle('active', isActive);
  });
  if (!found) {
    return false;
  }
  document.querySelectorAll('#tabs button').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === target);
  });
  document.body.classList.toggle('world-tab-active', target === 'world');
  if (target !== 'world') {
    setWorldCanvasFocus(false);
  }
  if (target === 'rotation') {
    initRotation();
  } else if (target === 'character') {
    renderCharacter();
  } else if (target === 'shop') {
    renderShop();
  } else if (target === 'inventory') {
    renderInventory();
  } else if (target === 'world') {
    initWorldTab();
  }
  return true;
}

function initTabs() {
  const buttons = document.querySelectorAll('#tabs button');
  if (!tabsInitialized) {
    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.getAttribute('data-tab');
        showTab(target);
      });
    });
    tabsInitialized = true;
  }
  if (!showTab('character') && buttons.length) {
    const fallback = buttons[0].getAttribute('data-tab');
    if (fallback) {
      showTab(fallback);
    }
  }
}

async function initRotation() {
  if (rotationInitialized) return;
  rotationInitialized = true;
  try {
    await ensureInventory();
  } catch (err) {
    console.warn('Failed to load inventory for rotation view', err);
  }
  await loadAbilityCatalog();
  rotation = [...(currentCharacter.rotation || [])];
  setRotationDamageType(currentCharacter ? currentCharacter.basicType : null);
  renderRotationList();
  const list = document.getElementById('rotation-list');
  list.addEventListener('dragover', handleDragOverList);
  list.addEventListener('drop', handleDrop);
  const del = document.getElementById('rotation-delete');
  del.addEventListener('dragover', e => e.preventDefault());
  del.addEventListener('drop', handleDropRemove);
  document.getElementById('save-rotation').addEventListener('click', saveRotation);
  if (!rotationTabsInitialized) {
    const buttons = Array.from(document.querySelectorAll('.rotation-tab-button'));
    if (buttons.length) {
      buttons.forEach(button => {
        button.addEventListener('click', () => {
          const view = button.dataset.view === 'visualize' ? 'visualize' : 'planner';
          showRotationView(view);
        });
      });
      rotationTabsInitialized = true;
    }
  }
  showRotationView(rotationViewMode);
  renderRotationVisualization();
}

const ROTATION_STAT_ORDER = ['strength', 'agility', 'intellect', 'wisdom', 'stamina', 'weapon', 'unscaled'];

function rotationStatGroupLabel(stat) {
  if (stat === 'weapon') return 'Weapon Damage';
  if (stat === 'unscaled') return 'No Scaling';
  return `${statLabel(stat)} Scaling`;
}

function renderAbilityPool() {
  const groupContainer = document.getElementById('ability-groups');
  if (!groupContainer) return;
  groupContainer.innerHTML = '';
  const groups = new Map();
  const ensureGroup = stat => {
    if (!groups.has(stat)) {
      groups.set(stat, []);
    }
    return groups.get(stat);
  };
  abilityCatalog.forEach(ability => {
    if (!ability) return;
    let stats = [];
    if (ability.isBasicAttack) {
      stats = ['weapon'];
    } else if (Array.isArray(ability.scaling) && ability.scaling.length) {
      stats = ability.scaling;
    } else {
      stats = ['unscaled'];
    }
    stats.forEach(stat => {
      ensureGroup(stat).push(ability);
    });
  });
  const statOrder = [
    ...ROTATION_STAT_ORDER,
    ...Array.from(groups.keys()).filter(stat => !ROTATION_STAT_ORDER.includes(stat)).sort(),
  ];
  statOrder.forEach(stat => {
    const abilities = groups.get(stat);
    if (!abilities || !abilities.length) return;
    const group = document.createElement('div');
    group.className = 'ability-group';
    const header = document.createElement('div');
    header.className = 'ability-group-header';
    const title = document.createElement('div');
    title.textContent = rotationStatGroupLabel(stat);
    header.appendChild(title);
    const badge = document.createElement('div');
    badge.className = 'badge';
    badge.textContent = abilities.length;
    header.appendChild(badge);
    group.appendChild(header);
    const grid = document.createElement('div');
    grid.className = 'ability-grid';
    abilities
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach(ability => {
        grid.appendChild(createAbilityCard(ability));
      });
    group.appendChild(grid);
    groupContainer.appendChild(group);
  });
}

function createAbilityCard(ability) {
  const card = document.createElement('div');
  card.className = 'ability-card';
  card.dataset.id = ability.id;
  card.draggable = true;
  card.addEventListener('dragstart', handleDragStart);
  const name = document.createElement('div');
  name.className = 'ability-name';
  if (ability && ability.isBasicAttack) {
    name.textContent = formatBasicAttackName(ability.name, rotationDamageType);
  } else {
    name.textContent = ability.name;
  }
  card.appendChild(name);
  const metaParts = [];
  if (ability && ability.isBasicAttack) {
    metaParts.push(`${basicAttackTypeLabel(rotationDamageType)} Damage`);
  } else if (ability.school) {
    metaParts.push(titleCase(ability.school));
  }
  if (!ability.isBasicAttack && Number.isFinite(ability.cooldown)) {
    metaParts.push(`${ability.cooldown}s CD`);
  }
  const costText = formatAbilityCost(ability);
  if (costText && costText !== 'None') {
    metaParts.push(costText);
  }
  if (metaParts.length) {
    const meta = document.createElement('div');
    meta.className = 'ability-meta';
    meta.textContent = metaParts.join(' • ');
    card.appendChild(meta);
  }
  const actions = document.createElement('div');
  actions.className = 'ability-actions';
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.textContent = 'Add';
  addBtn.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    addAbilityToRotation(ability.id);
  });
  addBtn.addEventListener('mousedown', e => e.stopPropagation());
  actions.appendChild(addBtn);
  card.appendChild(actions);
  attachTooltip(card, () => abilityTooltip(ability, { basicType: rotationDamageType }));
  return card;
}

function renderRotationList() {
  const list = document.getElementById('rotation-list');
  if (!list) return;
  const atBottom = list.scrollTop + list.clientHeight >= list.scrollHeight;
  const prevScroll = list.scrollTop;
  list.innerHTML = '';
  rotation.forEach((id, idx) => {
    const ability = abilityCatalog.find(a => a.id === id);
    if (!ability) return;
    const li = document.createElement('li');
    li.className = 'rotation-entry';
    li.dataset.id = id;
    li.dataset.index = idx;
    li.draggable = true;
    li.addEventListener('dragstart', handleDragStart);
    li.addEventListener('dblclick', () => {
      const i = parseInt(li.dataset.index, 10);
      removeAbilityAt(i);
    });
    const order = document.createElement('div');
    order.className = 'rotation-order';
    order.textContent = idx + 1;
    li.appendChild(order);
    const name = document.createElement('div');
    name.className = 'rotation-name';
    if (ability.isBasicAttack) {
      name.textContent = formatBasicAttackName(ability.name, rotationDamageType);
    } else {
      name.textContent = ability.name;
    }
    li.appendChild(name);
    const actions = document.createElement('div');
    actions.className = 'rotation-actions ability-actions';
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      removeAbilityAt(idx);
    });
    removeBtn.addEventListener('mousedown', e => e.stopPropagation());
    actions.appendChild(removeBtn);
    li.appendChild(actions);
    attachTooltip(li, () => abilityTooltip(ability, { basicType: rotationDamageType }));
    list.appendChild(li);
  });
  list.scrollTop = atBottom ? list.scrollHeight : prevScroll;
  updateRotationVisualization();
}

function showRotationView(mode) {
  const normalized = mode === 'visualize' ? 'visualize' : 'planner';
  rotationViewMode = normalized;
  const plannerPanel = document.getElementById('rotation-planner');
  const visualizePanel = document.getElementById('rotation-visualizer');
  if (plannerPanel) {
    plannerPanel.classList.toggle('hidden', normalized !== 'planner');
    plannerPanel.setAttribute('aria-hidden', normalized === 'planner' ? 'false' : 'true');
  }
  if (visualizePanel) {
    visualizePanel.classList.toggle('hidden', normalized !== 'visualize');
    visualizePanel.setAttribute('aria-hidden', normalized === 'visualize' ? 'false' : 'true');
  }
  document.querySelectorAll('.rotation-tab-button').forEach(button => {
    const view = button.dataset.view === 'visualize' ? 'visualize' : 'planner';
    const active = view === normalized;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', active ? 'true' : 'false');
    button.setAttribute('tabindex', active ? '0' : '-1');
  });
  if (normalized === 'visualize') {
    renderRotationVisualization();
  }
  return normalized;
}

function updateRotationVisualization() {
  if (!rotationInitialized) return;
  if (rotationViewMode === 'visualize') {
    renderRotationVisualization();
  }
}



function renderRotationVisualization() {
  const summaryContainer = document.getElementById('rotation-visualize-summary');
  const timelineSvg = document.getElementById('rotation-timeline');
  const emptyState = document.getElementById('rotation-visualize-empty');
  if (!summaryContainer || !timelineSvg) return;

  summaryContainer.innerHTML = '';
  const addSummary = (label, value) => {
    if (!label || value == null) return;
    const item = document.createElement('div');
    item.className = 'summary-item';
    const labelSpan = document.createElement('span');
    labelSpan.textContent = label;
    item.appendChild(labelSpan);
    const valueSpan = document.createElement('span');
    valueSpan.className = 'value';
    valueSpan.textContent = value;
    item.appendChild(valueSpan);
    summaryContainer.appendChild(item);
  };

  while (timelineSvg.firstChild) {
    timelineSvg.removeChild(timelineSvg.firstChild);
  }

  const defaultWidth = 640;
  const defaultHeight = 260;
  const derived = getActiveDerivedStats() || {};
  const attackInterval = Number.isFinite(derived.attackIntervalSeconds) && derived.attackIntervalSeconds > 0
    ? derived.attackIntervalSeconds
    : 2;

  addSummary('Abilities', rotation.length);
  addSummary('Attack Interval', `${attackInterval.toFixed(2)}s`);
  if (rotation.length) {
    addSummary('Rotation Length', `${(rotation.length * attackInterval).toFixed(2)}s`);
  }
  if (Number.isFinite(derived.mana)) {
    addSummary('Mana', Math.round(derived.mana));
  }
  if (Number.isFinite(derived.stamina)) {
    addSummary('Stamina', Math.round(derived.stamina));
  }

  const abilityEntries = rotation
    .map((id, index) => {
      const ability = abilityCatalog.find(entry => entry.id === id);
      if (!ability) return null;
      const cooldown = Number.isFinite(ability.cooldown) && ability.cooldown > 0 ? ability.cooldown : 0;
      return {
        ability,
        index,
        start: index * attackInterval,
        cooldown,
        costs: getRotationAbilityCosts(ability),
        warnings: [],
      };
    })
    .filter(Boolean);

  const trackMap = new Map();
  const tracks = [];
  abilityEntries.forEach(entry => {
    const abilityId = entry.ability.id;
    if (!trackMap.has(abilityId)) {
      const trackInfo = {
        id: abilityId,
        ability: entry.ability,
        index: tracks.length,
        entries: [],
      };
      trackMap.set(abilityId, trackInfo);
      tracks.push(trackInfo);
    }
    const trackInfo = trackMap.get(abilityId);
    entry.track = trackInfo.index;
    trackInfo.entries.push(entry);
  });

  addSummary('Ability Tracks', tracks.length);

  const svgNS = 'http://www.w3.org/2000/svg';
  const create = tag => document.createElementNS(svgNS, tag);
  const title = create('title');
  title.textContent = 'Rotation visualization';
  timelineSvg.appendChild(title);
  const desc = create('desc');
  desc.textContent = 'Timeline showing ability tracks, cooldowns, and resource usage.';
  timelineSvg.appendChild(desc);

  const setDefaultViewport = () => {
    timelineSvg.setAttribute('viewBox', `0 0 ${defaultWidth} ${defaultHeight}`);
    timelineSvg.setAttribute('width', defaultWidth);
    timelineSvg.setAttribute('height', defaultHeight);
    timelineSvg.style.width = `${defaultWidth}px`;
    timelineSvg.style.height = `${defaultHeight}px`;
  };

  if (!abilityEntries.length) {
    setDefaultViewport();
    const background = create('rect');
    background.setAttribute('x', 0);
    background.setAttribute('y', 0);
    background.setAttribute('width', defaultWidth);
    background.setAttribute('height', defaultHeight);
    background.setAttribute('fill', '#000');
    timelineSvg.appendChild(background);
    if (emptyState) {
      emptyState.classList.remove('hidden');
    }
    return;
  }

  if (emptyState) {
    emptyState.classList.add('hidden');
  }

  const baseInterval = attackInterval > 0 ? attackInterval : 1;
  const slotWidth = 120;
  const timelinePadding = 32;
  const labelWidth = 140;
  const trackSpacing = 12;
  const trackAreaTop = 32;
  const blockInnerPadding = 6;
  const blockHeight = 40;
  const blockWidth = slotWidth - 16;
  const blockOffset = (slotWidth - blockWidth) / 2;
  const cooldownGap = 12;
  const warningGap = 12;
  const trackHeight = blockInnerPadding + blockHeight + cooldownGap + warningGap + 12;
  const timelineStartX = timelinePadding + labelWidth;

  const rotationDuration = abilityEntries.length * baseInterval;
  const maxCooldownEnd = abilityEntries.reduce((acc, entry) => Math.max(acc, entry.start + entry.cooldown), rotationDuration);
  const displayDuration = Math.max(baseInterval, rotationDuration, maxCooldownEnd);
  const totalWidth = timelinePadding * 2 + labelWidth + (displayDuration / baseInterval) * slotWidth;
  const timelineEndX = timelineStartX + (displayDuration / baseInterval) * slotWidth;
  const abilityAreaBottom = tracks.length
    ? trackAreaTop + tracks.length * trackHeight + (tracks.length - 1) * trackSpacing
    : trackAreaTop;
  const resourceTop = abilityAreaBottom + 56;
  const resourceHeight = 104;
  const totalHeight = resourceTop + resourceHeight + 48;

  timelineSvg.setAttribute('viewBox', `0 0 ${totalWidth} ${totalHeight}`);
  timelineSvg.setAttribute('width', totalWidth);
  timelineSvg.setAttribute('height', totalHeight);
  timelineSvg.style.width = `${totalWidth}px`;
  timelineSvg.style.height = `${totalHeight}px`;

  const appendBackground = (width, height) => {
    const rect = create('rect');
    rect.setAttribute('x', 0);
    rect.setAttribute('y', 0);
    rect.setAttribute('width', width);
    rect.setAttribute('height', height);
    rect.setAttribute('fill', '#000');
    timelineSvg.appendChild(rect);
  };

  appendBackground(totalWidth, totalHeight);

  const timeToX = time => timelineStartX + (time / baseInterval) * slotWidth;

  const resourceKeys = ['mana', 'stamina'];
  const resourceState = {};
  const resourceHistory = {};
  const resourceCaps = {};
  resourceKeys.forEach(key => {
    const value = Number.isFinite(derived[key]) ? derived[key] : null;
    if (value != null) {
      resourceState[key] = value;
      resourceHistory[key] = [{ time: 0, value }];
      resourceCaps[key] = value;
    }
  });

  tracks.forEach(trackInfo => {
    const top = trackAreaTop + trackInfo.index * (trackHeight + trackSpacing);
    const bottom = top + trackHeight;
    const blockY = top + blockInnerPadding;
    const cooldownY = blockY + blockHeight + cooldownGap;
    const warningY = cooldownY + warningGap;
    trackInfo.top = top;
    trackInfo.bottom = bottom;
    trackInfo.blockY = blockY;
    trackInfo.cooldownY = cooldownY;
    trackInfo.warningY = warningY;

    const labelBox = create('rect');
    labelBox.setAttribute('x', timelinePadding + 4);
    labelBox.setAttribute('y', top + 2);
    labelBox.setAttribute('width', Math.max(0, labelWidth - 16));
    labelBox.setAttribute('height', blockHeight + cooldownGap + 8);
    labelBox.setAttribute('fill', '#000');
    labelBox.setAttribute('stroke', '#fff');
    labelBox.setAttribute('stroke-width', '1');
    labelBox.setAttribute('stroke-dasharray', '4 4');
    timelineSvg.appendChild(labelBox);

    const labelText = create('text');
    labelText.setAttribute('x', timelinePadding + labelWidth - 10);
    labelText.setAttribute('y', blockY + blockHeight / 2 + 4);
    labelText.setAttribute('text-anchor', 'end');
    labelText.setAttribute('fill', '#fff');
    labelText.setAttribute('font-size', '11');
    labelText.setAttribute('font-weight', 'bold');
    if (trackInfo.ability && trackInfo.ability.isBasicAttack) {
      labelText.textContent = formatBasicAttackName(trackInfo.ability.name, rotationDamageType);
    } else {
      labelText.textContent = trackInfo.ability.name;
    }
    timelineSvg.appendChild(labelText);

    const connector = create('line');
    connector.setAttribute('x1', timelinePadding + labelWidth - 6);
    connector.setAttribute('x2', timelineStartX);
    connector.setAttribute('y1', blockY + blockHeight / 2);
    connector.setAttribute('y2', blockY + blockHeight / 2);
    connector.setAttribute('stroke', '#fff');
    connector.setAttribute('stroke-width', '1');
    connector.setAttribute('stroke-dasharray', '4 6');
    timelineSvg.appendChild(connector);

    if (trackInfo.index === 0) {
      const topLine = create('line');
      topLine.setAttribute('x1', timelineStartX);
      topLine.setAttribute('x2', timelineEndX);
      topLine.setAttribute('y1', top);
      topLine.setAttribute('y2', top);
      topLine.setAttribute('stroke', '#fff');
      topLine.setAttribute('stroke-width', '1');
      topLine.setAttribute('stroke-dasharray', '6 6');
      timelineSvg.appendChild(topLine);
    }

    const bottomLine = create('line');
    bottomLine.setAttribute('x1', timelineStartX);
    bottomLine.setAttribute('x2', timelineEndX);
    bottomLine.setAttribute('y1', bottom);
    bottomLine.setAttribute('y2', bottom);
    bottomLine.setAttribute('stroke', '#fff');
    bottomLine.setAttribute('stroke-width', '1');
    bottomLine.setAttribute('stroke-dasharray', '6 6');
    timelineSvg.appendChild(bottomLine);
  });

  const lastUsage = new Map();
  abilityEntries.forEach(entry => {
    if (entry.cooldown > 0) {
      const previous = lastUsage.get(entry.ability.id);
      if (previous != null) {
        const readyAt = previous + entry.cooldown;
        if (entry.start < readyAt) {
          entry.cooldownConflict = true;
          entry.cooldownReadyAt = readyAt;
        }
      }
    }
    lastUsage.set(entry.ability.id, entry.start);

    Object.keys(resourceHistory).forEach(key => {
      const currentValue = resourceState[key];
      const history = resourceHistory[key];
      history.push({ time: entry.start, value: currentValue });
      const cost = Number.isFinite(entry.costs[key]) ? entry.costs[key] : 0;
      const nextValue = currentValue - cost;
      if (!entry.resourceSnapshot) {
        entry.resourceSnapshot = {};
      }
      entry.resourceSnapshot[key] = {
        before: currentValue,
        after: nextValue,
        cap: resourceCaps[key],
      };
      resourceState[key] = nextValue;
      history.push({ time: entry.start, value: nextValue });
      if (nextValue < 0 && !entry.warnings.includes(key)) {
        entry.warnings.push(key);
      }
    });
  });

  Object.keys(resourceHistory).forEach(key => {
    resourceHistory[key].push({ time: displayDuration, value: resourceState[key] });
  });

  const resourceValues = [];
  Object.values(resourceHistory).forEach(points => {
    points.forEach(point => resourceValues.push(point.value));
  });

  const minResourceValue = resourceValues.length ? Math.min(0, ...resourceValues) : 0;
  const maxResourceValue = resourceValues.length ? Math.max(0, ...resourceValues) : 1;
  const resourceRange = Math.max(1, maxResourceValue - minResourceValue);
  const valueToY = value => resourceTop + resourceHeight - ((value - minResourceValue) / resourceRange) * resourceHeight;

  const gridTop = trackAreaTop - 16;
  const gridBottom = resourceTop + resourceHeight;

  const stepCount = Math.max(1, Math.ceil(displayDuration / baseInterval));
  for (let i = 0; i <= stepCount; i += 1) {
    const time = Math.min(displayDuration, i * baseInterval);
    const x = timeToX(time);
    const marker = create('line');
    marker.setAttribute('x1', x);
    marker.setAttribute('x2', x);
    marker.setAttribute('y1', gridTop);
    marker.setAttribute('y2', gridBottom);
    marker.setAttribute('stroke', '#fff');
    marker.setAttribute('stroke-width', '1');
    marker.setAttribute('stroke-dasharray', '2 12');
    timelineSvg.appendChild(marker);
    const label = create('text');
    label.setAttribute('x', x);
    label.setAttribute('y', resourceTop + resourceHeight + 18);
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('fill', '#fff');
    label.setAttribute('font-size', '10');
    label.textContent = `${time.toFixed(1)}s`;
    timelineSvg.appendChild(label);
  }

  const leftAxis = create('line');
  leftAxis.setAttribute('x1', timelineStartX);
  leftAxis.setAttribute('x2', timelineStartX);
  leftAxis.setAttribute('y1', gridTop);
  leftAxis.setAttribute('y2', gridBottom);
  leftAxis.setAttribute('stroke', '#fff');
  leftAxis.setAttribute('stroke-width', '2');
  timelineSvg.appendChild(leftAxis);

  const rightAxis = create('line');
  rightAxis.setAttribute('x1', timelineEndX);
  rightAxis.setAttribute('x2', timelineEndX);
  rightAxis.setAttribute('y1', gridTop);
  rightAxis.setAttribute('y2', gridBottom);
  rightAxis.setAttribute('stroke', '#fff');
  rightAxis.setAttribute('stroke-width', '1');
  timelineSvg.appendChild(rightAxis);

  if (resourceValues.length) {
    const baseline = create('line');
    baseline.setAttribute('x1', timeToX(0));
    baseline.setAttribute('x2', timeToX(displayDuration));
    baseline.setAttribute('y1', resourceTop + resourceHeight);
    baseline.setAttribute('y2', resourceTop + resourceHeight);
    baseline.setAttribute('stroke', '#fff');
    baseline.setAttribute('stroke-width', '2');
    timelineSvg.appendChild(baseline);

    const zeroLine = create('line');
    zeroLine.setAttribute('x1', timeToX(0));
    zeroLine.setAttribute('x2', timeToX(displayDuration));
    zeroLine.setAttribute('y1', valueToY(0));
    zeroLine.setAttribute('y2', valueToY(0));
    zeroLine.setAttribute('stroke', '#fff');
    zeroLine.setAttribute('stroke-width', '1');
    zeroLine.setAttribute('stroke-dasharray', '4 8');
    timelineSvg.appendChild(zeroLine);

    Object.entries(resourceHistory).forEach(([key, points]) => {
      const pathData = buildRotationResourcePath(points, timeToX, valueToY);
      if (!pathData) return;
      const path = create('path');
      path.setAttribute('d', pathData);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', '#fff');
      path.setAttribute('stroke-width', '2');
      if (key === 'stamina') {
        path.setAttribute('stroke-dasharray', '6 4');
      }
      timelineSvg.appendChild(path);
    });
  }

  const formatSeconds = value => {
    if (!Number.isFinite(value)) return '';
    return value % 1 === 0 ? `${value.toFixed(0)}s` : `${value.toFixed(1)}s`;
  };

  const resourceOrder = resourceKeys.filter(key => resourceCaps[key] != null);
  abilityEntries.forEach(entry => {
    const trackInfo = tracks[entry.track];
    if (!trackInfo) return;
    const blockX = timeToX(entry.start) + blockOffset;
    const blockY = trackInfo.blockY;
    const rect = create('rect');
    rect.setAttribute('x', blockX);
    rect.setAttribute('y', blockY);
    rect.setAttribute('width', blockWidth);
    rect.setAttribute('height', blockHeight);
    rect.setAttribute('fill', '#fff');
    rect.setAttribute('stroke', '#000');
    rect.setAttribute('stroke-width', entry.cooldownConflict ? '3' : '2');
    if (entry.cooldownConflict) {
      rect.setAttribute('stroke-dasharray', '4 2');
    }
    timelineSvg.appendChild(rect);

    if (entry.cooldownConflict) {
      const crossOne = create('line');
      crossOne.setAttribute('x1', blockX + 4);
      crossOne.setAttribute('y1', blockY + 4);
      crossOne.setAttribute('x2', blockX + blockWidth - 4);
      crossOne.setAttribute('y2', blockY + blockHeight - 4);
      crossOne.setAttribute('stroke', '#000');
      crossOne.setAttribute('stroke-width', '2');
      timelineSvg.appendChild(crossOne);
      const crossTwo = create('line');
      crossTwo.setAttribute('x1', blockX + blockWidth - 4);
      crossTwo.setAttribute('y1', blockY + 4);
      crossTwo.setAttribute('x2', blockX + 4);
      crossTwo.setAttribute('y2', blockY + blockHeight - 4);
      crossTwo.setAttribute('stroke', '#000');
      crossTwo.setAttribute('stroke-width', '2');
      timelineSvg.appendChild(crossTwo);
    }

    const centerX = blockX + blockWidth / 2;
    const nameText = create('text');
    nameText.setAttribute('x', centerX);
    nameText.setAttribute('y', blockY + 14);
    nameText.setAttribute('text-anchor', 'middle');
    nameText.setAttribute('fill', '#000');
    nameText.setAttribute('font-size', '12');
    nameText.setAttribute('font-weight', 'bold');
    if (entry.ability && entry.ability.isBasicAttack) {
      nameText.textContent = formatBasicAttackName(entry.ability.name, rotationDamageType);
    } else {
      nameText.textContent = entry.ability.name;
    }
    timelineSvg.appendChild(nameText);

    const snapshot = entry.resourceSnapshot || {};
    const resourceStrings = resourceOrder
      .map(key => {
        const data = snapshot[key];
        if (!data) return null;
        const cap = Number.isFinite(data.cap) ? Math.round(data.cap) : null;
        const afterRaw = Number.isFinite(data.after) ? Math.round(data.after) : null;
        if (afterRaw == null) return null;
        const afterValue = Math.max(0, afterRaw);
        const label = rotationResourceLabel(key);
        let textValue = cap != null && cap > 0 ? `${label} ${afterValue}/${Math.round(cap)}` : `${label} ${afterValue}`;
        if (afterRaw < 0) {
          textValue += '!';
        }
        return textValue;
      })
      .filter(Boolean);

    if (resourceStrings.length) {
      const resourceText = create('text');
      resourceText.setAttribute('x', centerX);
      resourceText.setAttribute('y', blockY + 26);
      resourceText.setAttribute('text-anchor', 'middle');
      resourceText.setAttribute('fill', '#000');
      resourceText.setAttribute('font-size', '10');
      resourceText.textContent = resourceStrings.join(' • ');
      timelineSvg.appendChild(resourceText);
    }

    const rawCost = describeRotationCosts(entry.costs);
    const costString = rawCost ? `Cost: ${rawCost}` : 'No Cost';
    const costText = create('text');
    costText.setAttribute('x', centerX);
    costText.setAttribute('y', blockY + blockHeight - 6);
    costText.setAttribute('text-anchor', 'middle');
    costText.setAttribute('fill', '#000');
    costText.setAttribute('font-size', '10');
    costText.textContent = costString;
    timelineSvg.appendChild(costText);

    if (entry.cooldown > 0) {
      const startX = timeToX(entry.start);
      const endX = timeToX(entry.start + entry.cooldown);
      const cooldownLine = create('line');
      cooldownLine.setAttribute('x1', startX);
      cooldownLine.setAttribute('x2', endX);
      cooldownLine.setAttribute('y1', trackInfo.cooldownY);
      cooldownLine.setAttribute('y2', trackInfo.cooldownY);
      cooldownLine.setAttribute('stroke', '#fff');
      cooldownLine.setAttribute('stroke-width', entry.cooldownConflict ? '3' : '2');
      cooldownLine.setAttribute('stroke-dasharray', entry.cooldownConflict ? '4 4' : '8 6');
      timelineSvg.appendChild(cooldownLine);

      const startTick = create('line');
      startTick.setAttribute('x1', startX);
      startTick.setAttribute('x2', startX);
      startTick.setAttribute('y1', trackInfo.cooldownY - 6);
      startTick.setAttribute('y2', trackInfo.cooldownY + 6);
      startTick.setAttribute('stroke', '#fff');
      startTick.setAttribute('stroke-width', '2');
      timelineSvg.appendChild(startTick);

      const endTick = create('line');
      endTick.setAttribute('x1', endX);
      endTick.setAttribute('x2', endX);
      endTick.setAttribute('y1', trackInfo.cooldownY - 6);
      endTick.setAttribute('y2', trackInfo.cooldownY + 6);
      endTick.setAttribute('stroke', '#fff');
      endTick.setAttribute('stroke-width', '2');
      timelineSvg.appendChild(endTick);

      const cooldownLabel = create('text');
      cooldownLabel.setAttribute('x', (startX + endX) / 2);
      cooldownLabel.setAttribute('y', trackInfo.cooldownY - 10);
      cooldownLabel.setAttribute('text-anchor', 'middle');
      cooldownLabel.setAttribute('fill', '#fff');
      cooldownLabel.setAttribute('font-size', '10');
      cooldownLabel.textContent = formatSeconds(entry.cooldown);
      timelineSvg.appendChild(cooldownLabel);

      if (entry.cooldownConflict && entry.cooldownReadyAt != null) {
        const readyLabel = create('text');
        readyLabel.setAttribute('x', endX);
        readyLabel.setAttribute('y', trackInfo.cooldownY + 18);
        readyLabel.setAttribute('text-anchor', 'end');
        readyLabel.setAttribute('fill', '#fff');
        readyLabel.setAttribute('font-size', '10');
        const timeRemaining = entry.cooldownReadyAt - entry.start;
        readyLabel.textContent = `Ready @ ${formatSeconds(timeRemaining)}`;
        timelineSvg.appendChild(readyLabel);
      }
    }

    if (entry.warnings.length) {
      const markerSize = 8;
      const centerY = trackInfo.warningY;
      const marker = create('path');
      marker.setAttribute('d', `M ${centerX} ${centerY - markerSize} L ${centerX + markerSize} ${centerY} L ${centerX} ${centerY + markerSize} L ${centerX - markerSize} ${centerY} Z`);
      marker.setAttribute('fill', '#fff');
      marker.setAttribute('stroke', '#000');
      marker.setAttribute('stroke-width', '2');
      timelineSvg.appendChild(marker);
      const warnText = create('text');
      warnText.setAttribute('x', centerX);
      warnText.setAttribute('y', centerY + 4);
      warnText.setAttribute('text-anchor', 'middle');
      warnText.setAttribute('fill', '#000');
      warnText.setAttribute('font-size', '10');
      warnText.setAttribute('font-weight', 'bold');
      warnText.textContent = entry.warnings
        .map(key => {
          if (key === 'mana') return 'M';
          if (key === 'stamina') return 'S';
          return key.charAt(0).toUpperCase();
        })
        .join('');
      timelineSvg.appendChild(warnText);
    }
  });
}
function getRotationAbilityCosts(ability) {
  if (!ability || typeof ability !== 'object') return {};
  const rawCosts = Array.isArray(ability.costs) && ability.costs.length
    ? ability.costs
    : ability.costType
    ? [{ type: ability.costType, value: ability.costValue }]
    : [];
  return rawCosts.reduce((acc, entry) => {
    const type = typeof entry.type === 'string' ? entry.type.toLowerCase() : '';
    if (!type) return acc;
    const value = Number.isFinite(entry.value)
      ? entry.value
      : Number.isFinite(ability.costValue)
      ? ability.costValue
      : 0;
    if (!Number.isFinite(value)) return acc;
    acc[type] = (acc[type] || 0) + value;
    return acc;
  }, {});
}

function describeRotationCosts(costMap) {
  if (!costMap || typeof costMap !== 'object') return '';
  const parts = Object.entries(costMap)
    .map(([type, value]) => {
      if (!Number.isFinite(value) || value === 0) return null;
      const label = rotationResourceLabel(type);
      const amount = Math.abs(Math.round(value));
      if (!amount) return null;
      if (value < 0) {
        return `Gain ${amount} ${label}`;
      }
      return `${label} ${amount}`;
    })
    .filter(Boolean);
  return parts.length ? parts.join(' + ') : '';
}

function rotationResourceLabel(resource) {
  const key = typeof resource === 'string' ? resource.toLowerCase() : '';
  return RESOURCE_LABELS[key] || titleCase(key || 'Resource');
}

function buildRotationResourcePath(points, timeToX, valueToY) {
  if (!Array.isArray(points) || !points.length) return '';
  const sorted = points.slice().sort((a, b) => a.time - b.time);
  const first = sorted[0];
  let d = `M ${timeToX(first.time)} ${valueToY(first.value)}`;
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1];
    const current = sorted[i];
    const x = timeToX(current.time);
    const prevY = valueToY(prev.value);
    if (current.time !== prev.time) {
      d += ` L ${x} ${prevY}`;
    }
    d += ` L ${x} ${valueToY(current.value)}`;
  }
  return d;
}

function addAbilityToRotation(abilityId) {
  const numericId = Number.parseInt(abilityId, 10);
  if (!Number.isFinite(numericId)) return;
  if (!abilityCatalog.some(ab => ab && ab.id === numericId)) return;
  rotation.push(numericId);
  renderRotationList();
}

function removeAbilityAt(index) {
  const numericIndex = Number.parseInt(index, 10);
  if (!Number.isFinite(numericIndex) || numericIndex < 0 || numericIndex >= rotation.length) return;
  rotation.splice(numericIndex, 1);
  renderRotationList();
}

function handleDragStart(e) {
  const id = parseInt(e.target.dataset.id, 10);
  const payload = { id };
  if (e.target.dataset.index !== undefined) {
    payload.from = 'rotation';
    payload.index = parseInt(e.target.dataset.index, 10);
  } else {
    payload.from = 'pool';
  }
  e.dataTransfer.setData('text/plain', JSON.stringify(payload));
}

function handleDragOverList(e) {
  e.preventDefault();
  const list = e.currentTarget;
  const rect = list.getBoundingClientRect();
  const margin = 20;
  if (e.clientY < rect.top + margin) {
    list.scrollTop -= 10;
  } else if (e.clientY > rect.bottom - margin) {
    list.scrollTop += 10;
  }
}

function handleDrop(e) {
  e.preventDefault();
  const data = JSON.parse(e.dataTransfer.getData('text/plain'));
  const list = document.getElementById('rotation-list');
  const children = Array.from(list.children);
  const target = e.target.closest('li');
  let insertIndex = children.length;
  if (target) {
    const rect = target.getBoundingClientRect();
    const after = (e.clientY - rect.top) > rect.height / 2;
    insertIndex = children.indexOf(target) + (after ? 1 : 0);
  }
  if (data.from === 'rotation') {
    const existing = data.index;
    rotation.splice(existing, 1);
    if (existing < insertIndex) insertIndex--;
  }
  rotation.splice(insertIndex, 0, data.id);
  renderRotationList();
}

function handleDropRemove(e) {
  e.preventDefault();
  const data = JSON.parse(e.dataTransfer.getData('text/plain'));
  if (data.from === 'rotation') {
    removeAbilityAt(data.index);
  }
}

function saveRotation() {
  const errorDiv = document.getElementById('rotation-error');
  if (rotation.length < 3) {
    showMessage(errorDiv, 'Need at least 3 abilities', true);
    return;
  }
  clearMessage(errorDiv);
  fetch(`/characters/${currentCharacter.id}/rotation`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rotation, basicType: rotationDamageType })
  }).then(res => {
    if (!res.ok) throw new Error('save failed');
    return res.json();
  }).then(char => {
    const previousCharacter = currentCharacter;
    const nextCharacter = { ...char, rotation: rotation.slice() };
    if (shouldInvalidateJobStatus(previousCharacter, nextCharacter)) {
      clearJobStatusCache();
    }
    currentCharacter = nextCharacter;
    const idx = characters.findIndex(c => c.id === char.id);
    if (idx >= 0) characters[idx] = nextCharacter;
    setRotationDamageType(nextCharacter.basicType);
    if (inventoryView && inventoryView.character) {
      inventoryView.character.basicType = nextCharacter.basicType;
      inventoryView.character.rotation = nextCharacter.rotation.slice();
    }
    if (inventoryView && inventoryView.derived) {
      inventoryView.derived.basicAttackEffectType =
        nextCharacter.basicType === 'magic' ? 'MagicDamage' : 'PhysicalDamage';
    }
    showMessage(errorDiv, 'Saved', false);
    if (isTabActive('character')) {
      renderCharacter();
    }
  }).catch(err => {
    const message = err && err.message ? err.message : 'Save failed';
    showMessage(errorDiv, message, true);
  });
}

function updateAfterBattleEnd(data) {
  if (!data) return;
  const previousCharacter = currentCharacter;
  let jobStateChanged = false;
  if (data.character) {
    jobStateChanged = shouldInvalidateJobStatus(previousCharacter, data.character);
    currentCharacter = data.character;
    const idx = characters.findIndex(c => c.id === data.character.id);
    if (idx >= 0) {
      characters[idx] = data.character;
    }
    setRotationDamageType(data.character.basicType);
  }
  if (currentCharacter && typeof data.gold === 'number') {
    currentCharacter.gold = data.gold;
    if (inventoryView) {
      inventoryView.gold = data.gold;
    }
  }
  const shouldRender = {
    shop: isTabActive('shop'),
    inventory: isTabActive('inventory'),
    character: isTabActive('character'),
  };
  refreshInventory(true)
    .then(() => {
      if (shouldRender.character) renderCharacter();
      if (shouldRender.inventory) renderInventory();
      if (shouldRender.shop) renderShop();
    })
    .catch(() => {
      if (shouldRender.character) renderCharacter();
    });
  if (jobStateChanged) {
    clearJobStatusCache();
  }
}

function launchCombatStream(
  url,
  {
    waitingText = 'Preparing battle...',
    onEnd,
    onStart,
    onError,
    onCancel,
    updateArea = true,
  } = {},
) {
  if (!currentCharacter) return null;
  if (updateArea && battleArea) {
    battleArea.textContent = waitingText;
  }
  const es = new EventSource(url);
  let youId = null;
  let opponentId = null;
  let youBars = null;
  let oppBars = null;
  let logDiv = null;
  let closeBtn = null;
  let appendLogEntry = null;

  const updateBar = (bar, current, maxValue) => {
    if (!bar) return;
    if (typeof maxValue === 'number') {
      bar.max = maxValue;
    }
    const max = typeof bar.max === 'number' && bar.max > 0 ? bar.max : 0;
    const nextCurrent = typeof current === 'number' ? current : bar.current || 0;
    bar.current = nextCurrent;
    const clampedCurrent = max > 0 ? Math.min(Math.max(nextCurrent, 0), max) : Math.max(nextCurrent, 0);
    const ratio = max > 0 ? clampedCurrent / max : 0;
    if (bar.fill) {
      bar.fill.style.width = `${Math.max(0, Math.min(ratio, 1)) * 100}%`;
    }
    const displayCurrent = Math.round(Math.max(nextCurrent, 0));
    const displayMax = Math.round(max);
    if (bar.labelText) {
      bar.labelText.textContent = `${bar.prefix}: ${displayCurrent} / ${displayMax}`;
    }
    if (bar.labelContainer) {
      const coverageThreshold = 0.65;
      let useLightText = ratio >= coverageThreshold;
      if (bar.element && bar.fill && bar.labelText) {
        const barWidth = bar.element.clientWidth;
        const fillWidth = bar.fill.clientWidth;
        const textWidth = bar.labelText.getBoundingClientRect().width;
        const constrainedTextWidth = Math.min(textWidth, barWidth);
        const textStart = Math.max(0, (barWidth - constrainedTextWidth) / 2);
        const textEnd = textStart + constrainedTextWidth;
        const coverage = Math.max(0, Math.min(fillWidth, textEnd) - textStart);
        const coverageRatio = constrainedTextWidth > 0 ? coverage / constrainedTextWidth : 0;
        useLightText = coverageRatio >= coverageThreshold;
      }
      bar.labelContainer.style.color = useLightText ? '#fff' : '#000';
    }
  };

  const createBar = (dialogEl, selector, prefix, maxValue) => {
    const barEl = dialogEl.querySelector(selector);
    if (!barEl) return null;
    const fillEl = barEl.querySelector('.fill');
    const labelContainer = barEl.querySelector('.label');
    const labelText = barEl.querySelector('.label .value') || labelContainer;
    return {
      element: barEl,
      fill: fillEl,
      labelContainer,
      labelText,
      prefix,
      max: typeof maxValue === 'number' ? maxValue : 0,
      current: 0,
    };
  };

  const createUseableSlots = (dialogEl, combatantId) => {
    const slots = {};
    USEABLE_SLOTS.forEach(slot => {
      const selector = `#${combatantId} .useable-slot[data-slot="${slot}"]`;
      const slotEl = dialogEl.querySelector(selector);
      if (slotEl) {
        slotEl.title = slotLabel(slot);
        slots[slot] = slotEl;
      }
    });
    return slots;
  };

  const createBarGroup = (dialogEl, combatantId, stats) => {
    const s = stats || {};
    return {
      health: createBar(dialogEl, `#${combatantId} .bar.health`, 'HP', s.maxHealth),
      mana: createBar(dialogEl, `#${combatantId} .bar.mana`, 'MP', s.maxMana),
      stamina: createBar(dialogEl, `#${combatantId} .bar.stamina`, 'SP', s.maxStamina),
      maxHealth: typeof s.maxHealth === 'number' ? s.maxHealth : 0,
      maxMana: typeof s.maxMana === 'number' ? s.maxMana : 0,
      maxStamina: typeof s.maxStamina === 'number' ? s.maxStamina : 0,
      useableSlots: createUseableSlots(dialogEl, combatantId),
    };
  };

  const applyUseableState = (group, state) => {
    if (!group || !group.useableSlots) return;
    const slotState = {};
    if (state && Array.isArray(state.useables)) {
      state.useables.forEach(entry => {
        if (entry && entry.slot) {
          slotState[entry.slot] = entry;
        }
      });
    }
    USEABLE_SLOTS.forEach(slot => {
      const el = group.useableSlots[slot];
      if (!el) return;
      const info = slotState[slot];
      el.classList.remove('available', 'empty', 'used');
      let stateLabel = 'empty';
      if (info && info.hasItem && !info.used) {
        el.classList.add('available');
        stateLabel = 'available';
      } else if (info && info.hasItem && info.used) {
        el.classList.add('used');
        stateLabel = 'used';
      } else {
        el.classList.add('empty');
        stateLabel = 'empty';
      }
      el.dataset.state = stateLabel;
      const slotName = slotLabel(slot);
      if (slotName) {
        let description = 'empty';
        if (stateLabel === 'available') description = 'ready';
        if (stateLabel === 'used') description = 'consumed';
        el.setAttribute('aria-label', `${slotName} ${description}`);
      }
    });
  };

  const applyResourceState = (group, state) => {
    if (!group || !state) return;
    if (typeof state.maxHealth === 'number') group.maxHealth = state.maxHealth;
    if (typeof state.maxMana === 'number') group.maxMana = state.maxMana;
    if (typeof state.maxStamina === 'number') group.maxStamina = state.maxStamina;
    updateBar(group.health, state.health, group.maxHealth);
    updateBar(group.mana, state.mana, group.maxMana);
    updateBar(group.stamina, state.stamina, group.maxStamina);
    applyUseableState(group, state);
  };

  es.onmessage = ev => {
    const data = JSON.parse(ev.data);
    if (data.type === 'start') {
      youId = data.you.id;
      opponentId = data.opponent.id;
      const dialog = document.createElement('div');
      dialog.id = 'battle-dialog';
      dialog.innerHTML = `
        <div class="dialog-box">
          <div class="combatants-row">
            <div id="you" class="combatant">
              <div class="name">${data.you.name}</div>
              <div class="bars">
                <div class="bar health"><div class="fill"></div><div class="label"><span class="value"></span></div></div>
                <div class="bar mana"><div class="fill"></div><div class="label"><span class="value"></span></div></div>
                <div class="bar stamina"><div class="fill"></div><div class="label"><span class="value"></span></div></div>
              </div>
              <div class="useable-slots" role="group" aria-label="Useable item slots">
                <div class="useable-slot" data-slot="useable1"></div>
                <div class="useable-slot" data-slot="useable2"></div>
              </div>
            </div>
            <div id="opponent" class="combatant">
              <div class="name">${data.opponent.name}</div>
              <div class="bars">
                <div class="bar health"><div class="fill"></div><div class="label"><span class="value"></span></div></div>
                <div class="bar mana"><div class="fill"></div><div class="label"><span class="value"></span></div></div>
                <div class="bar stamina"><div class="fill"></div><div class="label"><span class="value"></span></div></div>
              </div>
              <div class="useable-slots" role="group" aria-label="Useable item slots">
                <div class="useable-slot" data-slot="useable1"></div>
                <div class="useable-slot" data-slot="useable2"></div>
              </div>
            </div>
          </div>
          <div id="battle-log"></div>
          <div class="dialog-buttons"><button id="battle-close" class="hidden">Close</button></div>
        </div>`;
      document.body.appendChild(dialog);
      youBars = createBarGroup(dialog, 'you', data.you);
      oppBars = createBarGroup(dialog, 'opponent', data.opponent);
      logDiv = dialog.querySelector('#battle-log');
      closeBtn = dialog.querySelector('#battle-close');
      closeBtn.addEventListener('click', () => dialog.remove());
      appendLogEntry = (payload, forcedType) => {
        if (!logDiv) return;
        const entry = typeof payload === 'string' ? { message: payload } : payload;
        if (!entry || !entry.message) return;
        const message = document.createElement('div');
        message.classList.add('log-message');
        const type = forcedType || classifyLogEntry(entry, youId, opponentId);
        message.classList.add(type || 'neutral');
        message.textContent = entry.message;
        logDiv.appendChild(message);
        logDiv.scrollTop = logDiv.scrollHeight;
      };
      applyResourceState(youBars, data.you);
      applyResourceState(oppBars, data.opponent);
      if (onStart) onStart(data);
    } else if (data.type === 'update') {
      if (appendLogEntry && Array.isArray(data.log)) {
        data.log.forEach(l => appendLogEntry(l));
      }
      applyResourceState(youBars, data.you);
      applyResourceState(oppBars, data.opponent);
    } else if (data.type === 'end') {
      const win = data.winnerId === youId;
      if (appendLogEntry) {
        appendLogEntry({ message: win ? 'Victory!' : 'Defeat...' }, 'neutral');
        appendLogEntry({ message: `+${data.xpGain} XP, +${data.gpGain} GP` }, 'neutral');
        if (data.challenge && data.challenge.rewards) {
          appendLogEntry(
            {
              message: `Next Round ${data.challenge.round}: potential rewards +${data.challenge.rewards.xpGain} XP, +${data.challenge.rewards.goldGain} GP`,
            },
            'neutral',
          );
        }
      }
      if (closeBtn) closeBtn.classList.remove('hidden');
      if (onEnd) onEnd(data);
      es.close();
    } else if (data.type === 'cancelled') {
      if (onCancel) onCancel(data);
      if (onEnd) onEnd(null);
      es.close();
    } else if (data.type === 'error') {
      if (onError) onError(data);
      if (updateArea && battleArea) {
        battleArea.textContent = data.message || 'Battle failed';
      }
      if (onEnd) onEnd(null);
      es.close();
    }
  };

  return es;
}

function safeCloseMatchmakingSource() {
  if (matchmakingState && matchmakingState.source) {
    try {
      matchmakingState.source.close();
    } catch (err) {
      /* ignore */
    }
    matchmakingState.source = null;
  }
}

function resetMatchmakingControls(message, { hideLeave = true } = {}) {
  if (!matchmakingState) return;
  safeCloseMatchmakingSource();
  const { queueBtn, leaveBtn, statusEl } = matchmakingState;
  if (queueBtn) {
    queueBtn.disabled = false;
    queueBtn.textContent = 'Find Opponent';
  }
  if (leaveBtn) {
    leaveBtn.disabled = false;
    leaveBtn.textContent = 'Leave Matchmaking';
    if (hideLeave) {
      leaveBtn.classList.add('hidden');
    }
  }
  if (statusEl && message) {
    statusEl.textContent = message;
  }
}

function startMatchmakingQueue() {
  if (!matchmakingState) return;
  if (!currentCharacter) {
    if (matchmakingState.statusEl) {
      matchmakingState.statusEl.textContent = 'Select a character first.';
    }
    return;
  }
  if (matchmakingState.source) {
    return;
  }
  const { queueBtn, leaveBtn, statusEl } = matchmakingState;
  if (queueBtn) {
    queueBtn.disabled = true;
    queueBtn.textContent = 'Matching...';
  }
  if (statusEl) {
    statusEl.textContent = 'Searching for opponent...';
  }
  if (leaveBtn) {
    leaveBtn.classList.remove('hidden');
    leaveBtn.disabled = false;
    leaveBtn.textContent = 'Leave Matchmaking';
  }
  const es = launchCombatStream(`/matchmaking/queue?characterId=${currentCharacter.id}`, {
    waitingText: 'Waiting for opponent...',
    updateArea: false,
    onStart: () => {
      if (statusEl) {
        statusEl.textContent = 'Opponent found!';
      }
      if (leaveBtn) {
        leaveBtn.disabled = true;
        leaveBtn.textContent = 'Match Found';
      }
    },
    onEnd: data => {
      if (!data) {
        return;
      }
      resetMatchmakingControls('Match complete.');
      updateAfterBattleEnd(data);
    },
    onError: data => {
      resetMatchmakingControls((data && data.message) || 'Matchmaking failed.');
    },
    onCancel: data => {
      resetMatchmakingControls((data && data.message) || 'Matchmaking cancelled.');
    },
  });
  matchmakingState.source = es;
  es.onerror = () => {
    resetMatchmakingControls('Matchmaking connection interrupted.');
  };
}

async function cancelMatchmakingQueue() {
  if (!matchmakingState || !currentCharacter) return;
  const { leaveBtn, statusEl } = matchmakingState;
  if (leaveBtn) {
    leaveBtn.disabled = true;
    leaveBtn.textContent = 'Leaving...';
  }
  if (statusEl) {
    statusEl.textContent = 'Leaving matchmaking...';
  }
  try {
    await postJSON('/matchmaking/cancel', { characterId: currentCharacter.id });
  } catch (err) {
    if (leaveBtn) {
      leaveBtn.disabled = false;
      leaveBtn.textContent = 'Leave Matchmaking';
    }
    if (statusEl) {
      statusEl.textContent = err.message || 'Failed to leave matchmaking.';
    }
  }
}

function renderMatchmakingPanel() {
  if (!battleArea) return;
  safeCloseMatchmakingSource();
  battleArea.innerHTML = `
    <div class="matchmaking-panel">
      <div id="matchmaking-status" class="matchmaking-status"></div>
      <div class="matchmaking-controls">
        <button id="queue-match">Find Opponent</button>
        <button id="leave-match" class="hidden">Leave Matchmaking</button>
      </div>
    </div>
  `;
  const statusEl = battleArea.querySelector('#matchmaking-status');
  const queueBtn = battleArea.querySelector('#queue-match');
  const leaveBtn = battleArea.querySelector('#leave-match');
  matchmakingState = {
    statusEl,
    queueBtn,
    leaveBtn,
    source: null,
  };
  if (statusEl) {
    statusEl.textContent = currentCharacter ? 'Ready to queue for battle.' : 'Select a character first.';
  }
  if (!currentCharacter && queueBtn) {
    queueBtn.disabled = true;
  }
  if (queueBtn) {
    queueBtn.addEventListener('click', startMatchmakingQueue);
  }
  if (leaveBtn) {
    leaveBtn.addEventListener('click', cancelMatchmakingQueue);
  }
}

function closeDungeonDialog() {
  if (dungeonCloseButton) {
    dungeonCloseButton.removeEventListener('click', closeDungeonDialog);
  }
  if (dungeonDialog) {
    dungeonDialog.remove();
  }
  dungeonDialog = null;
  dungeonBars = null;
  dungeonBossBars = null;
  dungeonLogElement = null;
  dungeonCloseButton = null;
}

function closeDungeonSource() {
  if (dungeonSource) {
    try {
      dungeonSource.close();
    } catch (_) {
      /* ignore */
    }
  }
  dungeonSource = null;
}

function hideDungeonForging() {
  if (!dungeonState || !dungeonState.forgingContainer) {
    return;
  }
  dungeonState.forgingContainer.classList.add('hidden');
}

function showDungeonForging(headline, detail) {
  if (!dungeonState || !dungeonState.forgingContainer) {
    return;
  }
  const title = headline || 'Forging dungeon boss...';
  const description = detail || DUNGEON_FORGING_DETAIL;
  dungeonState.forgingContainer.classList.remove('hidden');
  if (dungeonState.forgingHeadline) {
    dungeonState.forgingHeadline.textContent = title;
  }
  if (dungeonState.forgingDetail) {
    dungeonState.forgingDetail.textContent = description;
  }
}

function updateDungeonBar(bar, current, maxValue) {
  if (!bar) return;
  if (typeof maxValue === 'number') {
    bar.max = maxValue;
  }
  const max = typeof bar.max === 'number' && bar.max > 0 ? bar.max : 0;
  const nextCurrent = typeof current === 'number' ? current : bar.current || 0;
  bar.current = nextCurrent;
  const clampedCurrent = max > 0 ? Math.min(Math.max(nextCurrent, 0), max) : Math.max(nextCurrent, 0);
  const ratio = max > 0 ? clampedCurrent / max : 0;
  if (bar.fill) {
    bar.fill.style.width = `${Math.max(0, Math.min(ratio, 1)) * 100}%`;
  }
  const displayCurrent = Math.round(Math.max(nextCurrent, 0));
  const displayMax = Math.round(max);
  if (bar.labelText) {
    bar.labelText.textContent = `${bar.prefix}: ${displayCurrent} / ${displayMax}`;
  }
  if (bar.labelContainer) {
    const coverageThreshold = 0.65;
    let useLightText = ratio >= coverageThreshold;
    if (bar.element && bar.fill && bar.labelText) {
      const barWidth = bar.element.clientWidth;
      const fillWidth = bar.fill.clientWidth;
      const textWidth = bar.labelText.getBoundingClientRect().width;
      const constrainedTextWidth = Math.min(textWidth, barWidth);
      const textStart = Math.max(0, (barWidth - constrainedTextWidth) / 2);
      const textEnd = textStart + constrainedTextWidth;
      const coverage = Math.max(0, Math.min(fillWidth, textEnd) - textStart);
      const coverageRatio = constrainedTextWidth > 0 ? coverage / constrainedTextWidth : 0;
      useLightText = coverageRatio >= coverageThreshold;
    }
    bar.labelContainer.style.color = useLightText ? '#fff' : '#000';
  }
}

function createDungeonUseableSlots(rootEl) {
  const slots = {};
  USEABLE_SLOTS.forEach(slot => {
    const element = rootEl.querySelector(`.useable-slot[data-slot="${slot}"]`);
    if (element) {
      element.title = slotLabel(slot);
      slots[slot] = element;
    }
  });
  return slots;
}

function createDungeonBarGroup(rootEl, stats) {
  const makeBar = (selector, prefix, maxValue) => {
    const barEl = rootEl.querySelector(selector);
    if (!barEl) return null;
    const fillEl = barEl.querySelector('.fill');
    const labelContainer = barEl.querySelector('.label');
    const labelText = labelContainer ? labelContainer.querySelector('.value') || labelContainer : null;
    return {
      element: barEl,
      fill: fillEl,
      labelContainer,
      labelText,
      prefix,
      max: typeof maxValue === 'number' ? maxValue : 0,
      current: 0,
    };
  };
  const s = stats || {};
  return {
    health: makeBar('.bar.health', 'HP', s.maxHealth),
    mana: makeBar('.bar.mana', 'MP', s.maxMana),
    stamina: makeBar('.bar.stamina', 'SP', s.maxStamina),
    maxHealth: typeof s.maxHealth === 'number' ? s.maxHealth : 0,
    maxMana: typeof s.maxMana === 'number' ? s.maxMana : 0,
    maxStamina: typeof s.maxStamina === 'number' ? s.maxStamina : 0,
    useableSlots: createDungeonUseableSlots(rootEl),
  };
}

function applyDungeonUseables(group, state) {
  if (!group || !group.useableSlots) return;
  const slotState = {};
  if (state && Array.isArray(state.useables)) {
    state.useables.forEach(entry => {
      if (entry && entry.slot) {
        slotState[entry.slot] = entry;
      }
    });
  }
  USEABLE_SLOTS.forEach(slot => {
    const el = group.useableSlots[slot];
    if (!el) return;
    const info = slotState[slot];
    el.classList.remove('available', 'empty', 'used');
    let stateLabel = 'empty';
    if (info && info.hasItem && !info.used) {
      el.classList.add('available');
      stateLabel = 'available';
    } else if (info && info.hasItem && info.used) {
      el.classList.add('used');
      stateLabel = 'used';
    } else {
      el.classList.add('empty');
      stateLabel = 'empty';
    }
    el.dataset.state = stateLabel;
    const slotName = slotLabel(slot);
    if (slotName) {
      let description = 'empty';
      if (stateLabel === 'available') description = 'ready';
      if (stateLabel === 'used') description = 'consumed';
      el.setAttribute('aria-label', `${slotName} ${description}`);
    }
  });
}

function updateDungeonBarGroup(group, state) {
  if (!group || !state) return;
  if (typeof state.maxHealth === 'number') group.maxHealth = state.maxHealth;
  if (typeof state.maxMana === 'number') group.maxMana = state.maxMana;
  if (typeof state.maxStamina === 'number') group.maxStamina = state.maxStamina;
  updateDungeonBar(group.health, state.health, group.maxHealth);
  updateDungeonBar(group.mana, state.mana, group.maxMana);
  updateDungeonBar(group.stamina, state.stamina, group.maxStamina);
  applyDungeonUseables(group, state);
}

function classifyDungeonLogEntry(entry, partyIds, bossId) {
  if (!entry || typeof entry !== 'object') return 'neutral';
  const partySet = new Set((partyIds || []).map(id => String(id)));
  const boss = bossId != null ? String(bossId) : null;
  const src = entry.sourceId != null ? String(entry.sourceId) : null;
  const tgt = entry.targetId != null ? String(entry.targetId) : null;
  if (src && partySet.has(src)) return 'party';
  if (src && boss && src === boss) return 'boss';
  if (tgt && partySet.has(tgt)) return 'party';
  if (tgt && boss && tgt === boss) return 'boss';
  return 'neutral';
}

function appendDungeonLogs(entries, partyIds, bossId) {
  if (!dungeonLogElement || !Array.isArray(entries)) return;
  entries.forEach(entry => {
    if (!entry || !entry.message) return;
    const line = document.createElement('div');
    line.classList.add('log-message');
    const type = classifyDungeonLogEntry(entry, partyIds, bossId);
    line.classList.add(type || 'neutral');
    line.textContent = entry.message;
    dungeonLogElement.appendChild(line);
  });
  dungeonLogElement.scrollTop = dungeonLogElement.scrollHeight;
}

function normalizeCombatantDerivedForPreview(combatant) {
  if (!combatant) return {};
  if (combatant.derived && typeof combatant.derived === 'object') {
    return combatant.derived;
  }
  return computeDerived(combatant);
}

function formatCombatantValue(value) {
  return Number.isFinite(value) ? Math.round(value) : 0;
}

function formatCombatantRange(min, max) {
  const start = formatCombatantValue(min);
  const end = formatCombatantValue(max);
  return `${start}-${end}`;
}

function formatCombatantPercent(value) {
  return Number.isFinite(value) ? `${Math.round(value)}%` : '0%';
}

function formatCombatantResist(value) {
  if (!Number.isFinite(value)) return '0%';
  return `${Math.round(Math.max(0, value) * 100)}%`;
}

function formatCombatantInterval(value) {
  if (!Number.isFinite(value)) return '0.00s';
  return `${value.toFixed(2)}s`;
}

function resolveCombatantItem(entry) {
  if (!entry) return null;
  if (entry.item && entry.item.name) return entry.item;
  if (entry.item && entry.item.id != null) {
    return getEquipmentById(entry.item.id) || entry.item;
  }
  if (entry.itemId != null) return getEquipmentById(entry.itemId);
  if (entry.id != null) return getEquipmentById(entry.id);
  if (typeof entry === 'string') {
    const numeric = Number(entry);
    if (!Number.isNaN(numeric)) {
      return getEquipmentById(numeric);
    }
    return null;
  }
  if (typeof entry === 'number') return getEquipmentById(entry);
  return null;
}

function getCombatantUseables(combatant) {
  if (!combatant) return [];
  if (Array.isArray(combatant.useables)) return combatant.useables;
  if (combatant.useables && typeof combatant.useables === 'object') {
    return Object.entries(combatant.useables).map(([slot, value]) => {
      if (value && typeof value === 'object') {
        return { slot, ...value };
      }
      return { slot, itemId: value };
    });
  }
  return [];
}

function getCombatantAbilityEntries(combatant) {
  const entries = [];
  if (!combatant) return entries;
  const seen = new Set();
  const lookupAbility = id => {
    if (!Array.isArray(abilityCatalog)) return null;
    return abilityCatalog.find(a => a.id === id) || null;
  };
  const addEntry = (id, ability) => {
    const key = id != null ? String(id) : ability && ability.id != null ? String(ability.id) : null;
    if (key && seen.has(key)) return;
    if (key) seen.add(key);
    entries.push({ id, ability });
  };
  const normalizeAbilityId = value => {
    if (value && typeof value === 'object') {
      if (value.id != null) return value.id;
      if (value.abilityId != null) return value.abilityId;
    }
    return value;
  };
  if (Array.isArray(combatant.rotation)) {
    combatant.rotation.forEach(entry => {
      const id = normalizeAbilityId(entry);
      const ability = entry && entry.name ? entry : lookupAbility(id);
      addEntry(id, ability || null);
    });
  }
  if (Array.isArray(combatant.abilities)) {
    combatant.abilities.forEach(entry => {
      const id = normalizeAbilityId(entry);
      const ability = entry && entry.name ? entry : lookupAbility(id);
      addEntry(id, ability || null);
    });
  }
  return entries;
}

function buildCombatantPreview(combatant, options = {}) {
  if (!combatant) return null;
  const derived = normalizeCombatantDerivedForPreview(combatant) || {};
  const attributes = combatant.attributes || {};
  const container = document.createElement('div');
  container.className = 'combatant-preview';
  if (options.compact) {
    container.classList.add('compact');
  }
  const previewTheme = options.theme || (options.compact ? 'dark' : null);
  if (previewTheme) {
    container.dataset.tooltipTheme = previewTheme;
  }

  const header = document.createElement('div');
  header.className = 'preview-header';
  const title = document.createElement('div');
  title.className = 'preview-name';
  title.textContent = combatant.name || 'Unknown';
  header.appendChild(title);
  const meta = document.createElement('div');
  meta.className = 'preview-meta';
  const level = Number.isFinite(combatant.level) ? combatant.level : 1;
  meta.textContent = `Lv${level} • ${displayDamageType(combatant.basicType)}`;
  header.appendChild(meta);
  container.appendChild(header);

  const addGridSection = (label, rows) => {
    const validRows = Array.isArray(rows) ? rows.filter(row => row && row.length >= 2) : [];
    if (!validRows.length) return null;
    const section = document.createElement('div');
    section.className = 'preview-section';
    const heading = document.createElement('div');
    heading.className = 'preview-section-title';
    heading.textContent = label;
    section.appendChild(heading);
    const grid = document.createElement('div');
    grid.className = 'preview-grid';
    validRows.forEach(([name, value]) => {
      const l = document.createElement('div');
      l.className = 'label';
      l.textContent = name;
      grid.appendChild(l);
      const v = document.createElement('div');
      v.className = 'value';
      v.textContent = value;
      grid.appendChild(v);
    });
    section.appendChild(grid);
    container.appendChild(section);
    return section;
  };

  addGridSection('Attributes', STAT_KEYS.map(stat => [statLabel(stat), formatCombatantValue(attributes[stat])]));
  addGridSection('Vitals', [
    ['HP', formatCombatantValue(derived.health)],
    ['MP', formatCombatantValue(derived.mana)],
    ['Stamina', formatCombatantValue(derived.stamina)],
    ['Interval', formatCombatantInterval(derived.attackIntervalSeconds)],
  ]);
  addGridSection('Offense', [
    ['Melee', formatCombatantRange(derived.minMeleeAttack, derived.maxMeleeAttack)],
    ['Magic', formatCombatantRange(derived.minMagicAttack, derived.maxMagicAttack)],
    ['Hit', formatCombatantPercent(derived.hitChance)],
    ['Crit', formatCombatantPercent(derived.critChance)],
  ]);
  addGridSection('Defense', [
    ['Block', formatCombatantPercent(derived.blockChance)],
    ['Dodge', formatCombatantPercent(derived.dodgeChance)],
    ['Melee Resist', formatCombatantResist(derived.meleeResist)],
    ['Magic Resist', formatCombatantResist(derived.magicResist)],
  ]);

  const addListSection = label => {
    const section = document.createElement('div');
    section.className = 'preview-section';
    const heading = document.createElement('div');
    heading.className = 'preview-section-title';
    heading.textContent = label;
    section.appendChild(heading);
    const list = document.createElement('div');
    list.className = 'preview-list';
    section.appendChild(list);
    container.appendChild(section);
    return { section, list };
  };

  const equipmentSection = addListSection('Equipment');
  EQUIPMENT_SLOTS.forEach(slot => {
    const row = document.createElement('div');
    row.className = 'preview-row';
    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = slotLabel(slot);
    row.appendChild(label);
    const value = document.createElement('div');
    value.className = 'value';
    const itemId = combatant.equipment ? combatant.equipment[slot] : null;
    const item = resolveCombatantItem(itemId);
    if (item) {
      const rarityText = item.rarity ? `${titleCase(item.rarity)} • ` : '';
      value.textContent = `${rarityText}${item.name}`;
      attachTooltip(row, () => itemTooltip(item));
    } else {
      value.textContent = 'Empty';
      row.classList.add('empty');
    }
    row.appendChild(value);
    equipmentSection.list.appendChild(row);
  });

  const useables = getCombatantUseables(combatant);
  const useableSection = addListSection('Useable Items');
  USEABLE_SLOTS.forEach(slot => {
    const row = document.createElement('div');
    row.className = 'preview-row';
    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = slotLabel(slot);
    row.appendChild(label);
    const value = document.createElement('div');
    value.className = 'value';
    const entry = useables.find(info => info && String(info.slot) === slot) || null;
    const item = resolveCombatantItem(entry);
    if (item) {
      const rarityText = item.rarity ? `${titleCase(item.rarity)} • ` : '';
      value.textContent = `${rarityText}${item.name}`;
      attachTooltip(row, () => itemTooltip(item));
    } else {
      value.textContent = 'Empty';
      row.classList.add('empty');
    }
    row.appendChild(value);
    useableSection.list.appendChild(row);
  });

  const abilityEntries = getCombatantAbilityEntries(combatant);
  const abilitySection = addListSection('Abilities');
  if (abilityEntries.length) {
    const chipGroup = document.createElement('div');
    chipGroup.className = 'preview-chips';
    abilityEntries.forEach(({ id, ability }) => {
      const chip = document.createElement('span');
      chip.className = 'preview-chip';
      const label = ability && ability.name ? ability.name : id != null ? `Ability ${id}` : 'Ability';
      chip.textContent = label;
      if (ability) {
        chip.dataset.abilityId = String(ability.id != null ? ability.id : id);
        attachTooltip(chip, () => abilityTooltip(ability, { basicType: combatant.basicType }));
      }
      chipGroup.appendChild(chip);
    });
    abilitySection.list.appendChild(chipGroup);
  } else {
    const placeholder = document.createElement('div');
    placeholder.className = 'preview-row empty';
    const value = document.createElement('div');
    value.className = 'value';
    value.textContent = 'No abilities';
    placeholder.appendChild(value);
    abilitySection.list.appendChild(placeholder);
  }

  return container;
}

function updateReadyBarsForCombatant(wrapper, combatant) {
  if (!wrapper) return;
  const derived = normalizeCombatantDerivedForPreview(combatant) || {};
  const bars = [
    { selector: '.bar.health', label: 'HP', value: derived.health },
    { selector: '.bar.mana', label: 'MP', value: derived.mana },
    { selector: '.bar.stamina', label: 'SP', value: derived.stamina },
  ];
  bars.forEach(({ selector, label, value }) => {
    const barEl = wrapper.querySelector(selector);
    if (!barEl) return;
    const fillEl = barEl.querySelector('.fill');
    if (fillEl) {
      fillEl.style.width = '100%';
    }
    const textEl = barEl.querySelector('.value');
    if (textEl) {
      const normalized = Math.max(0, formatCombatantValue(value));
      textEl.textContent = `${label}: ${normalized} / ${normalized}`;
    }
  });
}

function createReadyCombatantCard(combatant, { isBoss = false } = {}) {
  if (!combatant) {
    return { element: null, indicator: null };
  }
  const wrapper = document.createElement('div');
  wrapper.className = `ready-combatant${isBoss ? ' boss-member' : ' party-member'}`;
  wrapper.dataset.ready = 'false';
  if (combatant.id != null) {
    wrapper.dataset.combatantId = String(combatant.id);
  }
  const nameEl = document.createElement('div');
  nameEl.className = 'ready-name';
  nameEl.textContent = combatant.name || 'Unknown';
  wrapper.appendChild(nameEl);
  const metaEl = document.createElement('div');
  metaEl.className = 'ready-meta';
  const level = Number.isFinite(combatant.level) ? combatant.level : 1;
  metaEl.textContent = `Lv${level} • ${displayDamageType(combatant.basicType)}`;
  wrapper.appendChild(metaEl);
  const bars = document.createElement('div');
  bars.className = 'bars';
  bars.innerHTML =
    '<div class="bar health"><div class="fill"></div><div class="label"><span class="value"></span></div></div>' +
    '<div class="bar mana"><div class="fill"></div><div class="label"><span class="value"></span></div></div>' +
    '<div class="bar stamina"><div class="fill"></div><div class="label"><span class="value"></span></div></div>';
  wrapper.appendChild(bars);
  updateReadyBarsForCombatant(wrapper, combatant);
  let indicator = null;
  if (!isBoss) {
    indicator = document.createElement('div');
    indicator.className = 'ready-indicator not-ready';
    indicator.textContent = 'Not Ready';
    wrapper.appendChild(indicator);
  }
  if (typeof attachTooltip === 'function') {
    attachTooltip(wrapper, () => buildCombatantPreview(combatant, { compact: true, theme: 'dark' }));
  }
  return { element: wrapper, indicator };
}

async function renderDungeonPreview(previewContainer, data, statusEl) {
  if (!previewContainer) return;
  if (dungeonState) {
    dungeonState.phase = 'preview';
    dungeonState.decisionAction = null;
    hideDungeonForging();
  }
  previewContainer.innerHTML = '';

  const loading = document.createElement('div');
  loading.textContent = 'Preparing encounter...';
  previewContainer.appendChild(loading);

  try {
    await loadAbilityCatalog();
  } catch (err) {
    console.warn('Failed to load abilities for dungeon preview', err);
  }

  if (!previewContainer.isConnected) {
    return;
  }

  if (data && data.matchId && dungeonState && dungeonState.matchId && dungeonState.matchId !== data.matchId) {
    return;
  }

  previewContainer.innerHTML = '';
  const panel = document.createElement('div');
  panel.className = 'dungeon-preview-panel';
  const title = document.createElement('h3');
  title.textContent = 'Ready Check';
  panel.appendChild(title);

  const columns = document.createElement('div');
  columns.className = 'ready-columns';

  const partyColumn = document.createElement('div');
  partyColumn.className = 'ready-column party';
  const partyTitle = document.createElement('div');
  partyTitle.className = 'ready-column-title';
  partyTitle.textContent = 'Party';
  partyColumn.appendChild(partyTitle);
  const partyList = document.createElement('div');
  partyList.className = 'ready-party-list';

  dungeonState.readyDisplays = new Map();
  const partyMembers = Array.isArray(data && data.party) ? data.party : [];
  dungeonState.partyPreview = partyMembers;
  partyMembers.forEach(member => {
    const card = createReadyCombatantCard(member, { isBoss: false });
    if (card.element) {
      const id = member && member.id != null ? String(member.id) : null;
      if (id) {
        dungeonState.readyDisplays.set(id, { indicator: card.indicator || null, frame: card.element });
      }
      if (card.element && currentCharacter && member && member.id === currentCharacter.id) {
        card.element.classList.add('ready-self');
      }
      partyList.appendChild(card.element);
    }
  });
  if (partyList.children.length) {
    partyColumn.appendChild(partyList);
  } else {
    const emptyParty = document.createElement('div');
    emptyParty.className = 'ready-empty';
    emptyParty.textContent = 'Waiting for allies...';
    partyColumn.appendChild(emptyParty);
  }
  columns.appendChild(partyColumn);

  const bossColumn = document.createElement('div');
  bossColumn.className = 'ready-column boss';
  const bossTitle = document.createElement('div');
  bossTitle.className = 'ready-column-title';
  bossTitle.textContent = 'Boss';
  bossColumn.appendChild(bossTitle);
  if (data && data.boss) {
    const bossCard = createReadyCombatantCard(data.boss, { isBoss: true });
    if (bossCard.element) {
      bossColumn.appendChild(bossCard.element);
    } else {
      const emptyBoss = document.createElement('div');
      emptyBoss.className = 'ready-empty';
      emptyBoss.textContent = 'Boss unavailable';
      bossColumn.appendChild(emptyBoss);
    }
  } else {
    const pendingBoss = document.createElement('div');
    pendingBoss.className = 'ready-empty';
    pendingBoss.textContent = 'Awaiting boss data...';
    bossColumn.appendChild(pendingBoss);
  }
  columns.appendChild(bossColumn);
  panel.appendChild(columns);

  const actions = document.createElement('div');
  actions.className = 'ready-actions';
  const readyStatus = document.createElement('div');
  readyStatus.className = 'dungeon-ready-status';
  readyStatus.textContent = 'Ready 0 / ?';
  actions.appendChild(readyStatus);
  const readyButton = document.createElement('button');
  readyButton.className = 'dungeon-ready-button';
  readyButton.textContent = 'Ready Up';
  actions.appendChild(readyButton);
  panel.appendChild(actions);

  previewContainer.appendChild(panel);
  dungeonState.readyStatus = readyStatus;
  dungeonState.readyButton = readyButton;
  readyButton.addEventListener('click', () => {
    sendDungeonReady(statusEl);
  });

  const readyCount = Number.isFinite(data && data.ready)
    ? data.ready
    : Number.isFinite(dungeonState && dungeonState.lastReadyCount)
    ? dungeonState.lastReadyCount
    : 0;
  const readyTotal = Number.isFinite(data && data.total)
    ? data.total
    : Number.isFinite(data && data.size)
    ? data.size
    : Number.isFinite(dungeonState && dungeonState.lastReadyTotal)
    ? dungeonState.lastReadyTotal
    : Number.isFinite(dungeonState && dungeonState.size)
    ? dungeonState.size
    : 0;
  const readyIds = Array.isArray(data && data.readyIds)
    ? data.readyIds
    : Array.isArray(dungeonState && dungeonState.lastReadyMembers)
    ? dungeonState.lastReadyMembers
    : [];
  dungeonState.lastReadyMembers = Array.isArray(readyIds) ? readyIds.slice() : [];
  updateDungeonReady(readyCount, readyTotal, readyIds);
}

function renderDungeonDecision(previewContainer, data = {}, statusEl) {
  if (!previewContainer || !dungeonState) return;
  hideDungeonForging();
  dungeonState.phase = 'decision';
  const action = data.action === 'advance' ? 'advance' : 'retry';
  dungeonState.decisionAction = action;
  if (statusEl) {
    showMessage(
      statusEl,
      action === 'advance'
        ? 'Victory secured. Awaiting votes to advance.'
        : 'Defeat endured. Awaiting votes to retry.',
      false,
    );
  }
  previewContainer.innerHTML = '';

  const panel = document.createElement('div');
  panel.className = 'dungeon-decision-panel';

  const title = document.createElement('h3');
  title.className = 'decision-title';
  const outcome = data.outcome === 'victory' ? 'Victory!' : 'Defeat...';
  title.textContent = outcome;
  panel.appendChild(title);

  if (Number.isFinite(data.round)) {
    const roundTag = document.createElement('div');
    roundTag.className = 'decision-round';
    roundTag.textContent = `Round ${data.round}`;
    panel.appendChild(roundTag);
  }

  const detail = document.createElement('div');
  detail.className = 'decision-detail';
  detail.textContent =
    action === 'advance'
      ? 'Ready up to face a fiercer foe forged from your fallen challenger.'
      : 'Regroup and ready up to challenge the dungeon once more.';
  panel.appendChild(detail);

  if (Number.isFinite(data.xpGain) || Number.isFinite(data.gpGain)) {
    const reward = document.createElement('div');
    reward.className = 'decision-reward';
    const xpValue = Number.isFinite(data.xpGain) ? data.xpGain : 0;
    const gpValue = Number.isFinite(data.gpGain) ? data.gpGain : 0;
    reward.textContent = `Rewards: +${xpValue} XP, +${gpValue} GP`;
    panel.appendChild(reward);
  }

  const columns = document.createElement('div');
  columns.className = 'ready-columns decision-columns';

  const partyColumn = document.createElement('div');
  partyColumn.className = 'ready-column party';
  const partyTitle = document.createElement('div');
  partyTitle.className = 'ready-column-title';
  partyTitle.textContent = 'Party';
  partyColumn.appendChild(partyTitle);

  const partyList = document.createElement('div');
  partyList.className = 'ready-party-list';
  dungeonState.readyDisplays = new Map();
  const partyMembers = Array.isArray(data.party) ? data.party : dungeonState.partyPreview || [];
  dungeonState.partyPreview = partyMembers;
  partyMembers.forEach(member => {
    const card = createReadyCombatantCard(member, { isBoss: false });
    if (card.element) {
      const id = member && member.id != null ? String(member.id) : null;
      if (id) {
        dungeonState.readyDisplays.set(id, { indicator: card.indicator || null, frame: card.element });
      }
      if (card.element && currentCharacter && member && member.id === currentCharacter.id) {
        card.element.classList.add('ready-self');
      }
      partyList.appendChild(card.element);
    }
  });
  if (partyList.children.length) {
    partyColumn.appendChild(partyList);
  } else {
    const emptyParty = document.createElement('div');
    emptyParty.className = 'ready-empty';
    emptyParty.textContent = 'Waiting for allies...';
    partyColumn.appendChild(emptyParty);
  }
  columns.appendChild(partyColumn);

  const bossColumn = document.createElement('div');
  bossColumn.className = 'ready-column boss';
  const bossTitle = document.createElement('div');
  bossTitle.className = 'ready-column-title';
  bossTitle.textContent = 'Boss';
  bossColumn.appendChild(bossTitle);
  if (data && data.boss) {
    const bossCard = createReadyCombatantCard(data.boss, { isBoss: true });
    if (bossCard.element) {
      bossColumn.appendChild(bossCard.element);
    } else {
      const emptyBoss = document.createElement('div');
      emptyBoss.className = 'ready-empty';
      emptyBoss.textContent = 'Boss unavailable';
      bossColumn.appendChild(emptyBoss);
    }
  } else {
    const pendingBoss = document.createElement('div');
    pendingBoss.className = 'ready-empty';
    pendingBoss.textContent = 'Boss data unavailable';
    bossColumn.appendChild(pendingBoss);
  }
  columns.appendChild(bossColumn);
  panel.appendChild(columns);

  const actions = document.createElement('div');
  actions.className = 'decision-actions ready-actions';
  const readyStatus = document.createElement('div');
  readyStatus.className = 'dungeon-ready-status';
  actions.appendChild(readyStatus);
  const button = document.createElement('button');
  button.className = 'dungeon-ready-button';
  const buttonLabel = action === 'advance' ? 'Advance' : 'Retry';
  button.textContent = buttonLabel;
  button.dataset.action = action;
  button.addEventListener('click', () => {
    sendDungeonReady(statusEl);
  });
  actions.appendChild(button);
  panel.appendChild(actions);

  previewContainer.appendChild(panel);

  dungeonState.readyStatus = readyStatus;
  dungeonState.readyButton = button;

  const readyCount = Number.isFinite(data.ready) ? data.ready : 0;
  const readyTotal = Number.isFinite(data.total) ? data.total : dungeonState.size;
  const readyIds = Array.isArray(data.readyIds) ? data.readyIds : [];
  dungeonState.lastReadyMembers = readyIds.slice();
  updateDungeonReady(readyCount, readyTotal, readyIds);
}

function updateDungeonReady(count, total, readyIds) {
  if (!dungeonState) return;
  const normalizedCount = Number.isFinite(count) ? count : 0;
  const normalizedTotal = Number.isFinite(total)
    ? total
    : Number.isFinite(dungeonState.size)
    ? dungeonState.size
    : 0;
  dungeonState.lastReadyCount = normalizedCount;
  dungeonState.lastReadyTotal = normalizedTotal;

  let normalizedReadyIds;
  if (Array.isArray(readyIds)) {
    const seen = new Set();
    normalizedReadyIds = readyIds
      .map(id => Number(id))
      .filter(id => {
        if (!Number.isFinite(id) || seen.has(id)) {
          return false;
        }
        seen.add(id);
        return true;
      });
  } else if (Array.isArray(dungeonState.lastReadyMembers)) {
    normalizedReadyIds = dungeonState.lastReadyMembers.slice();
  } else {
    normalizedReadyIds = [];
  }

  if (normalizedCount <= 0) {
    normalizedReadyIds = [];
  } else if (normalizedReadyIds.length > normalizedCount) {
    normalizedReadyIds.length = normalizedCount;
  }

  dungeonState.lastReadyMembers = normalizedReadyIds;
  const isDecisionPhase = dungeonState.phase === 'decision';
  const actionLabel = isDecisionPhase
    ? dungeonState.decisionAction === 'advance'
      ? 'Advance'
      : 'Retry'
    : 'Ready';
  if (dungeonState.readyStatus) {
    dungeonState.readyStatus.textContent = `${actionLabel} ${normalizedCount} / ${normalizedTotal}`;
  }
  const readySet = new Set(
    (Array.isArray(dungeonState.lastReadyMembers) ? dungeonState.lastReadyMembers : [])
      .map(id => String(id)),
  );
  if (dungeonState.readyDisplays && typeof dungeonState.readyDisplays.forEach === 'function') {
    dungeonState.readyDisplays.forEach((display, id) => {
      if (!display) return;
      const indicator = display.indicator || null;
      const frame = display.frame || null;
      const isReady = readySet.has(id);
      if (indicator) {
        const readyText = isDecisionPhase
          ? isReady
            ? actionLabel
            : 'Not Ready'
          : isReady
          ? 'Ready'
          : 'Not Ready';
        indicator.textContent = readyText;
        indicator.classList.toggle('ready', isReady);
        indicator.classList.toggle('not-ready', !isReady);
      }
      if (frame) {
        frame.classList.toggle('ready', isReady);
        frame.dataset.ready = isReady ? 'true' : 'false';
      }
    });
  }
  const button = dungeonState.readyButton;
  if (button) {
    const selfId = currentCharacter && currentCharacter.id != null ? String(currentCharacter.id) : null;
    const isSelfReady = selfId ? readySet.has(selfId) : false;
    if (normalizedCount >= normalizedTotal && normalizedTotal > 0) {
      button.disabled = true;
      button.textContent = isDecisionPhase ? 'All Ready' : 'All Ready';
    } else if (isSelfReady) {
      button.disabled = true;
      button.textContent = isDecisionPhase ? 'Locked In' : 'Ready!';
    } else {
      button.disabled = false;
      button.textContent = isDecisionPhase ? actionLabel : 'Ready Up';
    }
  }
}

async function sendDungeonReady(statusEl) {
  if (!dungeonState || !dungeonState.matchId || !currentCharacter) return;
  const button = dungeonState.readyButton;
  if (button && button.disabled) return;
  const isDecisionPhase = dungeonState.phase === 'decision';
  const actionLabel = isDecisionPhase
    ? dungeonState.decisionAction === 'advance'
      ? 'Advance'
      : 'Retry'
    : 'Ready';
  if (button) {
    button.disabled = true;
    button.textContent = `${actionLabel}...`;
  }
  if (statusEl) {
    showMessage(
      statusEl,
      isDecisionPhase ? 'Casting your vote to continue...' : 'Signalling readiness...',
      false,
    );
  }
  try {
    const endpoint = isDecisionPhase ? '/dungeon/decision' : '/dungeon/ready';
    const data = await postJSON(endpoint, {
      matchId: dungeonState.matchId,
      characterId: currentCharacter.id,
    });
    updateDungeonReady(data.ready, data.total, data.readyIds);
    if (statusEl) {
      showMessage(
        statusEl,
        isDecisionPhase
          ? 'Decision recorded. Awaiting the rest of the party...'
          : 'Ready confirmed. Waiting for allies...',
        false,
      );
    }
  } catch (err) {
    if (statusEl) {
      showMessage(statusEl, err.message || 'Failed to ready.', true);
    }
    if (button) {
      button.disabled = false;
      button.textContent = isDecisionPhase ? actionLabel : 'Ready Up';
    }
  }
}

function openDungeonDialog(data) {
  closeDungeonDialog();
  const dialog = document.createElement('div');
  dialog.id = 'dungeon-dialog';
  dialog.innerHTML = `
    <div class="dialog-box">
      <div class="combatants-row dungeon-combatants-row">
        <div class="dungeon-party party-column" role="group" aria-label="Party status"></div>
        <div class="dungeon-boss boss-column" role="group" aria-label="Boss status"></div>
      </div>
      <div class="battle-log dungeon-log" id="dungeon-log"></div>
      <div class="dialog-buttons"><button id="dungeon-close" class="hidden">Close</button></div>
    </div>`;
  document.body.appendChild(dialog);
  dungeonDialog = dialog;
  const partyContainer = dialog.querySelector('.dungeon-party');
  const bossContainer = dialog.querySelector('.dungeon-boss');
  dungeonLogElement = dialog.querySelector('#dungeon-log');
  dungeonCloseButton = dialog.querySelector('#dungeon-close');
  if (dungeonCloseButton) {
    dungeonCloseButton.addEventListener('click', closeDungeonDialog);
  }
  dungeonBars = new Map();
  if (Array.isArray(data.party)) {
    data.party.forEach(member => {
      const wrapper = document.createElement('div');
      wrapper.className = 'combatant dungeon-combatant party-member';
      wrapper.innerHTML = `
        <div class="name">${member.name}</div>
        <div class="bars">
          <div class="bar health"><div class="fill"></div><div class="label"><span class="value"></span></div></div>
          <div class="bar mana"><div class="fill"></div><div class="label"><span class="value"></span></div></div>
          <div class="bar stamina"><div class="fill"></div><div class="label"><span class="value"></span></div></div>
        </div>
        <div class="useable-slots" role="group" aria-label="Useable item slots">
          <div class="useable-slot" data-slot="useable1"></div>
          <div class="useable-slot" data-slot="useable2"></div>
        </div>`;
      partyContainer.appendChild(wrapper);
      const group = createDungeonBarGroup(wrapper, member);
      dungeonBars.set(member.id, group);
      updateDungeonBarGroup(group, member);
    });
  }
  if (bossContainer && data.boss) {
    const wrapper = document.createElement('div');
    wrapper.className = 'combatant dungeon-combatant boss-member';
    wrapper.innerHTML = `
      <div class="name">${data.boss.name}</div>
      <div class="bars">
        <div class="bar health"><div class="fill"></div><div class="label"><span class="value"></span></div></div>
        <div class="bar mana"><div class="fill"></div><div class="label"><span class="value"></span></div></div>
        <div class="bar stamina"><div class="fill"></div><div class="label"><span class="value"></span></div></div>
      </div>
      <div class="useable-slots" role="group" aria-label="Useable item slots">
        <div class="useable-slot" data-slot="useable1"></div>
        <div class="useable-slot" data-slot="useable2"></div>
      </div>`;
    bossContainer.appendChild(wrapper);
    dungeonBossBars = createDungeonBarGroup(wrapper, data.boss);
    updateDungeonBarGroup(dungeonBossBars, data.boss);
  }
  if (Array.isArray(data.log) && data.log.length) {
    appendDungeonLogs(data.log, data.partyIds || [], data.bossId);
  }
}

function handleDungeonUpdate(data) {
  if (!data) return;
  if (Array.isArray(data.party) && dungeonBars) {
    data.party.forEach(member => {
      const group = dungeonBars.get(member.id);
      if (group) {
        updateDungeonBarGroup(group, member);
      }
    });
  }
  if (data.boss && dungeonBossBars) {
    updateDungeonBarGroup(dungeonBossBars, data.boss);
  }
  if (Array.isArray(data.log) && data.log.length) {
    appendDungeonLogs(data.log, data.partyIds || (dungeonState && dungeonState.partyIds) || [], data.bossId || (dungeonState && dungeonState.bossId));
  }
}

function handleDungeonDecision(data, statusEl, previewEl) {
  hideDungeonForging();
  if (dungeonState) {
    dungeonState.phase = 'decision';
    dungeonState.decisionAction = data && data.action ? data.action : null;
    if (Number.isFinite(data && data.total)) {
      dungeonState.lastReadyTotal = data.total;
    } else if (!Number.isFinite(dungeonState.lastReadyTotal)) {
      dungeonState.lastReadyTotal = dungeonState.size || 0;
    }
    if (Array.isArray(data && data.readyIds)) {
      dungeonState.lastReadyMembers = data.readyIds.slice();
    } else {
      dungeonState.lastReadyMembers = [];
    }
    dungeonState.lastReadyCount = Number.isFinite(data && data.ready) ? data.ready : 0;
    if (data && data.matchId) {
      dungeonState.matchId = data.matchId;
    }
    if (Array.isArray(data && data.partyIds)) {
      dungeonState.partyIds = data.partyIds.slice();
    }
    if (Number.isFinite(data && data.bossId)) {
      dungeonState.bossId = data.bossId;
    }
  }
  if (data) {
    if (Array.isArray(data.finalParty) && dungeonBars) {
      data.finalParty.forEach(member => {
        if (!member || !member.id) return;
        const group = dungeonBars.get(member.id);
        if (group) {
          updateDungeonBarGroup(group, member);
        }
      });
    }
    if (data.finalBoss && dungeonBossBars) {
      updateDungeonBarGroup(dungeonBossBars, data.finalBoss);
    }
  }
  if (dungeonLogElement) {
    const outcome = data && data.outcome === 'victory' ? 'Victory!' : 'Defeat...';
    appendDungeonLogs([{ message: outcome }], [], null);
    appendDungeonLogs(
      [
        {
          message: `+${Number.isFinite(data && data.xpGain) ? data.xpGain : 0} XP, +${
            Number.isFinite(data && data.gpGain) ? data.gpGain : 0
          } GP`,
        },
      ],
      [],
      null,
    );
  }
  if (dungeonCloseButton) {
    dungeonCloseButton.classList.remove('hidden');
  }
  const targetStatus = statusEl || (dungeonState && dungeonState.statusEl) || null;
  const targetPreview = previewEl || (dungeonState && dungeonState.previewEl) || null;
  if (targetPreview) {
    renderDungeonDecision(targetPreview, data, targetStatus);
  }
  if (dungeonState && dungeonState.leaveButton) {
    dungeonState.leaveButton.classList.remove('hidden');
    dungeonState.leaveButton.disabled = false;
    dungeonState.leaveButton.textContent = 'Leave Party';
  }
  updateAfterBattleEnd(data);
}

function handleDungeonEnd(data) {
  if (dungeonState) {
    dungeonState.phase = 'complete';
  }
  hideDungeonForging();
  if (data) {
    if (Array.isArray(data.finalParty) && dungeonBars) {
      data.finalParty.forEach(member => {
        if (!member || !member.id) return;
        const group = dungeonBars.get(member.id);
        if (group) {
          updateDungeonBarGroup(group, member);
        }
      });
    }
    if (data.finalBoss && dungeonBossBars) {
      updateDungeonBarGroup(dungeonBossBars, data.finalBoss);
    }
  }
  if (dungeonLogElement) {
    const outcome = data.winnerSide === 'party' ? 'Victory!' : 'Defeat...';
    appendDungeonLogs([{ message: outcome }], [], null);
    appendDungeonLogs([
      { message: `+${data.xpGain || 0} XP, +${data.gpGain || 0} GP` },
    ], [], null);
  }
  if (dungeonCloseButton) {
    dungeonCloseButton.classList.remove('hidden');
  }
  if (dungeonState && dungeonState.statusEl) {
    showMessage(dungeonState.statusEl, 'Dungeon complete.', false);
  }
  if (dungeonState && dungeonState.readyButton) {
    dungeonState.readyButton.disabled = true;
  }
  if (dungeonState && dungeonState.queueBtn) {
    dungeonState.queueBtn.disabled = false;
    dungeonState.queueBtn.textContent = 'Find Party';
  }
  if (dungeonState && dungeonState.leaveButton) {
    dungeonState.leaveButton.disabled = false;
    dungeonState.leaveButton.textContent = 'Leave Queue';
    dungeonState.leaveButton.classList.add('hidden');
  }
  closeDungeonSource();
  updateAfterBattleEnd(data);
}

async function leaveDungeonQueue(statusEl) {
  if (!currentCharacter || !dungeonState || !dungeonState.leaveButton) return;
  const button = dungeonState.leaveButton;
  if (button.disabled) return;
  button.disabled = true;
  button.textContent = 'Leaving...';
  hideDungeonForging();
  const targetStatus = statusEl || dungeonState.statusEl;
  if (targetStatus) {
    showMessage(targetStatus, 'Leaving dungeon queue...', false);
  }
  try {
    await postJSON('/dungeon/cancel', { characterId: currentCharacter.id });
  } catch (err) {
    button.disabled = false;
    button.textContent = 'Leave Queue';
    if (targetStatus) {
      showMessage(targetStatus, err.message || 'Failed to leave dungeon queue.', true);
    }
  }
}

function startDungeonQueue(
  size,
  statusEl,
  previewEl,
  queueBtn,
  leaveBtn,
  forgingElements = null,
  options = {},
) {
  if (!currentCharacter) {
    showMessage(statusEl, 'Select a character first.', true);
    return;
  }
  const resume = !!(options && options.resume);
  const initialStatus = options && options.status ? options.status : null;
  const normalizedSize = Number.isFinite(size) ? size : Number.parseInt(size, 10) || 2;
  const forgingContainer =
    forgingElements && forgingElements.container ? forgingElements.container : null;
  const forgingHeadline =
    forgingElements && forgingElements.headline ? forgingElements.headline : null;
  const forgingDetail =
    forgingElements && forgingElements.detail ? forgingElements.detail : null;
  const hasInitialPreview =
    resume &&
    initialStatus &&
    (initialStatus.state === 'matched' || initialStatus.state === 'in-progress') &&
    initialStatus.party &&
    initialStatus.boss;
  const initialPreview = hasInitialPreview
    ? {
        matchId: initialStatus.matchId || null,
        party: initialStatus.party,
        boss: initialStatus.boss,
        size: initialStatus.size || normalizedSize,
        ready: initialStatus.ready || 0,
        readyIds: initialStatus.readyIds || [],
      }
    : null;
  closeDungeonSource();
  if (queueBtn) {
    queueBtn.disabled = true;
    queueBtn.textContent = resume ? 'Resuming...' : 'Matching...';
  }
  if (leaveBtn) {
    leaveBtn.classList.remove('hidden');
    if (initialStatus && initialStatus.state === 'in-progress') {
      leaveBtn.disabled = true;
      leaveBtn.textContent = 'Encounter underway';
    } else {
      leaveBtn.disabled = false;
      leaveBtn.textContent = 'Leave Queue';
    }
  }
  if (previewEl) {
    previewEl.innerHTML = '';
  }
  const forgingStatusMessage = DUNGEON_FORGING_MESSAGE;
  const forgingStatusDetail = DUNGEON_FORGING_DETAIL;
  let statusMessage = 'Searching for allies...';
  if (resume && initialStatus) {
    if (initialStatus.phase === 'forging') {
      statusMessage = forgingStatusMessage;
    } else if (initialStatus.state === 'matched') {
      statusMessage = 'Rejoining your party...';
    } else if (initialStatus.state === 'in-progress') {
      statusMessage = 'Reconnecting to the encounter...';
    } else {
      statusMessage = 'Resuming dungeon queue...';
    }
  }
  if (statusEl) {
    showMessage(statusEl, statusMessage, false);
  }
  dungeonState = {
    queueBtn,
    statusEl,
    previewEl,
    leaveButton: leaveBtn || null,
    readyButton: null,
    readyStatus: null,
    matchId: null,
    size: normalizedSize,
    partyIds: [],
    bossId: null,
    lastReadyCount: 0,
    lastReadyTotal: normalizedSize,
    lastReadyMembers: [],
    readyDisplays: new Map(),
    partyPreview: [],
    forgingContainer,
    forgingHeadline,
    forgingDetail,
    forgingMessage: forgingStatusMessage,
    forgingDetailMessage: forgingStatusDetail,
    phase: 'queued',
    decisionAction: null,
  };
  if (resume && initialStatus && initialStatus.phase) {
    dungeonState.phase = initialStatus.phase;
  }
  hideDungeonForging();
  if (dungeonState.phase === 'forging') {
    const detailMessage =
      (initialStatus && initialStatus.detail) || dungeonState.forgingDetailMessage;
    showDungeonForging(statusMessage, detailMessage);
  }
  if (resume && initialStatus) {
    if (initialStatus.matchId) {
      dungeonState.matchId = initialStatus.matchId;
    }
    if (Array.isArray(initialStatus.partyIds)) {
      dungeonState.partyIds = initialStatus.partyIds.slice();
    }
    if (Number.isFinite(initialStatus.bossId)) {
      dungeonState.bossId = initialStatus.bossId;
    }
    if (Number.isFinite(initialStatus.readyTotal)) {
      dungeonState.lastReadyTotal = initialStatus.readyTotal;
    }
    if (Array.isArray(initialStatus.readyIds)) {
      dungeonState.lastReadyMembers = initialStatus.readyIds.slice();
    }
    if (Number.isFinite(initialStatus.ready)) {
      dungeonState.lastReadyCount = initialStatus.ready;
    }
  }

  let previewPromise = null;
  const isDecisionPhase = initialStatus && initialStatus.phase === 'decision';
  if (previewEl) {
    if (isDecisionPhase) {
      const pendingAction =
        (initialStatus.decision && initialStatus.decision.action) ||
        initialStatus.pendingAction ||
        'retry';
      const fallbackOutcome = pendingAction === 'advance' ? 'victory' : 'defeat';
      const decisionData = {
        matchId: initialStatus.matchId || null,
        party: initialStatus.party || [],
        boss: initialStatus.boss || null,
        ready: initialStatus.ready || 0,
        total: initialStatus.readyTotal || (initialStatus.size || normalizedSize),
        readyIds: initialStatus.readyIds || [],
        action: pendingAction,
        outcome: (initialStatus.decision && initialStatus.decision.outcome) || fallbackOutcome,
        round:
          (initialStatus.decision && initialStatus.decision.round) ||
          initialStatus.round ||
          1,
        xpGain: initialStatus.xpGain || 0,
        gpGain: initialStatus.gpGain || 0,
        metrics: initialStatus.metrics || null,
        finalParty: initialStatus.finalParty || null,
        finalBoss: initialStatus.finalBoss || null,
      };
      previewPromise = Promise.resolve(renderDungeonDecision(previewEl, decisionData, statusEl));
    } else if (initialPreview) {
      previewPromise = Promise.resolve(renderDungeonPreview(previewEl, initialPreview, statusEl));
    } else {
      previewEl.innerHTML = '';
    }
  }
  const applyInitialReady = () => {
    if (
      !isDecisionPhase &&
      resume &&
      initialStatus &&
      (Number.isFinite(initialStatus.ready) || (Array.isArray(initialStatus.readyIds) && initialStatus.readyIds.length))
    ) {
      const readyCount = Number.isFinite(initialStatus.ready)
        ? initialStatus.ready
        : Array.isArray(initialStatus.readyIds)
        ? initialStatus.readyIds.length
        : 0;
      const readyTotal = Number.isFinite(initialStatus.readyTotal)
        ? initialStatus.readyTotal
        : dungeonState.size;
      updateDungeonReady(
        readyCount,
        readyTotal,
        Array.isArray(initialStatus.readyIds) ? initialStatus.readyIds : []
      );
    }
  };
  if (previewPromise && typeof previewPromise.then === 'function') {
    previewPromise.then(applyInitialReady).catch(() => {});
  } else {
    applyInitialReady();
  }

  const es = new EventSource(
    `/dungeon/queue?characterId=${currentCharacter.id}&size=${normalizedSize}`
  );
  dungeonSource = es;
  es.onmessage = ev => {
    let data;
    try {
      data = JSON.parse(ev.data);
    } catch (err) {
      return;
    }
    if (!data) return;
    if (data.type === 'error') {
      const message = data.message || 'Dungeon matchmaking failed.';
      const isCancelled = /cancelled|closed|disbanded/i.test(message);
      if (statusEl) {
        showMessage(statusEl, message, !isCancelled);
      }
      if (queueBtn) {
        queueBtn.disabled = false;
        queueBtn.textContent = 'Find Party';
      }
      if (dungeonState && dungeonState.leaveButton) {
        dungeonState.leaveButton.disabled = false;
        dungeonState.leaveButton.textContent = 'Leave Queue';
        if (/already\s+queued/i.test(message)) {
          dungeonState.leaveButton.classList.remove('hidden');
        } else {
          dungeonState.leaveButton.classList.add('hidden');
        }
      }
      hideDungeonForging();
      closeDungeonSource();
      return;
    }
    if (data.type === 'queued') {
      if (statusEl) {
        const descriptor = data.size ? `${data.size}-player` : 'party';
        showMessage(statusEl, `Searching for a ${descriptor} group...`, false);
      }
      if (queueBtn) {
        queueBtn.disabled = true;
        queueBtn.textContent = 'Matching...';
      }
      if (dungeonState) {
        dungeonState.size = Number.isFinite(data.size)
          ? data.size
          : dungeonState.size;
        dungeonState.lastReadyTotal = dungeonState.size;
        if (dungeonState.leaveButton) {
          dungeonState.leaveButton.classList.remove('hidden');
          dungeonState.leaveButton.disabled = false;
          dungeonState.leaveButton.textContent = 'Leave Queue';
        }
        dungeonState.phase = 'queued';
        dungeonState.forgingMessage = DUNGEON_FORGING_MESSAGE;
        dungeonState.forgingDetailMessage = DUNGEON_FORGING_DETAIL;
      }
      hideDungeonForging();
      return;
    }
    if (data.type === 'matched') {
      if (dungeonState) {
        dungeonState.phase = 'forging';
        dungeonState.forgingMessage =
          (data && data.message) || dungeonState.forgingMessage || DUNGEON_FORGING_MESSAGE;
        dungeonState.forgingDetailMessage =
          (data && data.detail) || dungeonState.forgingDetailMessage || DUNGEON_FORGING_DETAIL;
        dungeonState.decisionAction = null;
      }
      const message =
        (data && data.message) || (dungeonState && dungeonState.forgingMessage) ||
        DUNGEON_FORGING_MESSAGE;
      const detailMessage =
        (data && data.detail) || (dungeonState && dungeonState.forgingDetailMessage) ||
        DUNGEON_FORGING_DETAIL;
      if (statusEl) {
        showMessage(statusEl, message, false);
      }
      showDungeonForging(message, detailMessage);
      return;
    }
    if (data.type === 'preview') {
      dungeonState.matchId = data.matchId;
      dungeonState.size = Number.isFinite(data.size) ? data.size : dungeonState.size;
      dungeonState.lastReadyTotal = dungeonState.size;
      if (dungeonState) {
        dungeonState.phase = 'preview';
      }
      hideDungeonForging();
      if (statusEl) {
        showMessage(statusEl, 'Boss encountered. Ready when prepared.', false);
      }
      if (dungeonState && dungeonState.leaveButton) {
        dungeonState.leaveButton.classList.remove('hidden');
        dungeonState.leaveButton.disabled = false;
        dungeonState.leaveButton.textContent = 'Leave Queue';
      }
      renderDungeonPreview(previewEl, data, statusEl);
      return;
    }
    if (data.type === 'ready') {
      const eventPhase = data.phase || null;
      if (
        dungeonState &&
        dungeonState.phase &&
        eventPhase &&
        eventPhase !== dungeonState.phase
      ) {
        return;
      }
      updateDungeonReady(data.ready || 0, data.total || dungeonState.size, data.readyIds);
      return;
    }
    if (data.type === 'decision' && data.mode === 'dungeon') {
      handleDungeonDecision(data, statusEl, previewEl);
      return;
    }
    if (data.type === 'start' && data.mode === 'dungeon') {
      if (dungeonState) {
        dungeonState.partyIds =
          data.partyIds || (data.party ? data.party.map(member => member.id) : []);
        dungeonState.bossId = data.bossId || (data.boss ? data.boss.id : null);
        dungeonState.phase = 'encounter';
        dungeonState.decisionAction = null;
      }
      hideDungeonForging();
      if (statusEl) {
        showMessage(statusEl, 'Encounter underway...', false);
      }
      if (dungeonState && dungeonState.leaveButton) {
        dungeonState.leaveButton.disabled = true;
        dungeonState.leaveButton.textContent = 'Encounter underway';
        dungeonState.leaveButton.classList.add('hidden');
      }
      openDungeonDialog(data);
      return;
    }
    if (data.type === 'update' && data.mode === 'dungeon') {
      handleDungeonUpdate(data);
      return;
    }
    if (data.type === 'end') {
      hideDungeonForging();
      handleDungeonEnd(data);
      closeDungeonSource();
    }
  };
  es.onerror = () => {
    if (queueBtn) {
      queueBtn.disabled = false;
      queueBtn.textContent = 'Find Party';
    }
    if (statusEl) {
      showMessage(statusEl, 'Dungeon connection interrupted.', true);
    }
    if (dungeonState && dungeonState.leaveButton) {
      dungeonState.leaveButton.disabled = false;
      dungeonState.leaveButton.textContent = 'Leave Queue';
      dungeonState.leaveButton.classList.add('hidden');
    }
    hideDungeonForging();
    closeDungeonSource();
  };
}

async function loadDungeonStatus(statusEl, previewEl, queueBtn, leaveBtn, select, forgingElements = null) {
  if (!currentCharacter || dungeonSource) return;
  let res;
  try {
    res = await fetch(`/dungeon/status?characterId=${currentCharacter.id}`);
  } catch (err) {
    console.warn('Failed to load dungeon status', err);
    return;
  }
  if (!res.ok) {
    if (statusEl) {
      showMessage(statusEl, 'Failed to load dungeon status.', true);
    }
    return;
  }
  let data;
  try {
    data = await res.json();
  } catch (err) {
    console.warn('Failed to parse dungeon status', err);
    return;
  }
  if (!data || !data.state || data.state === 'idle') {
    return;
  }
  if (select && Number.isFinite(data.size)) {
    const stringValue = String(data.size);
    if (select.value !== stringValue) {
      select.value = stringValue;
    }
  }
  const resumeSize = Number.isFinite(data.size)
    ? data.size
    : (select
    ? Number.parseInt(select.value, 10) || 2
    : 2);
  startDungeonQueue(resumeSize, statusEl, previewEl, queueBtn, leaveBtn, forgingElements, {
    resume: true,
    status: data,
  });
}

function renderDungeonPanel() {
  if (!battleArea) return;
  if (!currentCharacter) {
    battleArea.textContent = 'Select a character first.';
    return;
  }
  battleArea.innerHTML = '';
  const container = document.createElement('div');
  container.className = 'dungeon-panel';
  const controls = document.createElement('div');
  controls.className = 'dungeon-controls';
  const label = document.createElement('label');
  label.setAttribute('for', 'dungeon-party-size');
  label.textContent = 'Party Size';
  const select = document.createElement('select');
  select.id = 'dungeon-party-size';
  for (let size = 2; size <= 5; size += 1) {
    const option = document.createElement('option');
    option.value = String(size);
    option.textContent = `${size} Players`;
    select.appendChild(option);
  }
  const queueBtn = document.createElement('button');
  queueBtn.id = 'dungeon-queue';
  queueBtn.textContent = 'Find Party';
  const leaveBtn = document.createElement('button');
  leaveBtn.id = 'dungeon-leave';
  leaveBtn.textContent = 'Leave Queue';
  leaveBtn.classList.add('hidden');
  const statusEl = document.createElement('div');
  statusEl.className = 'dungeon-status message';
  controls.appendChild(label);
  controls.appendChild(select);
  controls.appendChild(queueBtn);
  controls.appendChild(leaveBtn);
  container.appendChild(controls);
  container.appendChild(statusEl);
  const forgingEl = document.createElement('div');
  forgingEl.id = 'dungeon-forging';
  forgingEl.className = 'dungeon-forging hidden';
  forgingEl.setAttribute('role', 'status');
  forgingEl.setAttribute('aria-live', 'polite');
  const forgingHeadline = document.createElement('div');
  forgingHeadline.className = 'dungeon-forging-headline';
  forgingHeadline.textContent = DUNGEON_FORGING_MESSAGE;
  forgingEl.appendChild(forgingHeadline);
  const forgingBar = document.createElement('div');
  forgingBar.className = 'dungeon-forging-bar';
  const forgingFill = document.createElement('div');
  forgingFill.className = 'dungeon-forging-fill';
  forgingFill.setAttribute('aria-hidden', 'true');
  forgingBar.appendChild(forgingFill);
  forgingEl.appendChild(forgingBar);
  const forgingDetail = document.createElement('div');
  forgingDetail.className = 'dungeon-forging-detail';
  forgingDetail.textContent = DUNGEON_FORGING_DETAIL;
  forgingEl.appendChild(forgingDetail);
  container.appendChild(forgingEl);
  const forgingElements = {
    container: forgingEl,
    headline: forgingHeadline,
    detail: forgingDetail,
  };
  const previewEl = document.createElement('div');
  previewEl.id = 'dungeon-preview';
  container.appendChild(previewEl);
  battleArea.appendChild(container);

  ensureCatalog().catch(() => {});
  loadAbilityCatalog().catch(err => {
    console.warn('Failed to load abilities for dungeon panel', err);
  });

  queueBtn.addEventListener('click', () => {
    const sizeValue = parseInt(select.value, 10) || 2;
    startDungeonQueue(sizeValue, statusEl, previewEl, queueBtn, leaveBtn, forgingElements);
  });

  leaveBtn.addEventListener('click', () => {
    leaveDungeonQueue(statusEl);
  });

  loadDungeonStatus(statusEl, previewEl, queueBtn, leaveBtn, select, forgingElements).catch(err => {
    console.warn('Failed to restore dungeon status', err);
  });
}

function stopAdventurePolling() {
  if (adventurePollTimer) {
    clearInterval(adventurePollTimer);
    adventurePollTimer = null;
  }
  if (adventureTickTimer) {
    clearInterval(adventureTickTimer);
    adventureTickTimer = null;
  }
  adventurePollInFlight = false;
}

async function fetchAdventureStatus() {
  if (!currentCharacter) {
    throw new Error('Select a character first.');
  }
  const res = await fetch(`/adventure/status?characterId=${currentCharacter.id}`);
  if (!res.ok) {
    let message = 'Failed to load adventure.';
    try {
      const err = await res.json();
      if (err && err.error) message = err.error;
    } catch {}
    throw new Error(message);
  }
  const data = await res.json();
  applyAdventureUpdates(data);
  return data;
}

function inventoryItemsEqual(a, b) {
  const listA = Array.isArray(a) ? a : [];
  const listB = Array.isArray(b) ? b : [];
  if (listA.length !== listB.length) {
    return false;
  }
  const counts = new Map();
  listA.forEach(id => {
    const key = id != null ? String(id) : '__null__';
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  for (const id of listB) {
    const key = id != null ? String(id) : '__null__';
    if (!counts.has(key)) {
      return false;
    }
    const next = counts.get(key) - 1;
    if (next <= 0) {
      counts.delete(key);
    } else {
      counts.set(key, next);
    }
  }
  return counts.size === 0;
}

function materialsEqual(a, b) {
  const entriesA = a && typeof a === 'object' ? Object.entries(a) : [];
  const entriesB = b && typeof b === 'object' ? Object.entries(b) : [];
  if (entriesA.length !== entriesB.length) {
    return false;
  }
  const map = new Map();
  entriesA.forEach(([id, count]) => {
    const key = id != null ? String(id) : '__null__';
    const value = Number(count) || 0;
    map.set(key, value);
  });
  for (const [id, count] of entriesB) {
    const key = id != null ? String(id) : '__null__';
    const value = Number(count) || 0;
    if (!map.has(key) || map.get(key) !== value) {
      return false;
    }
    map.delete(key);
  }
  return map.size === 0;
}

function applyAdventureUpdates(status) {
  if (!status) return;
  let inventoryDirty = false;
  let characterChanged = false;
  const previousCharacter = currentCharacter;
  let jobStateChanged = false;
  if (status.character && typeof status.character.id === 'number') {
    jobStateChanged = shouldInvalidateJobStatus(previousCharacter, status.character);
    if (!currentCharacter || currentCharacter.id !== status.character.id) {
      characterChanged = true;
    } else if (
      currentCharacter.xp !== status.character.xp ||
      currentCharacter.level !== status.character.level ||
      currentCharacter.basicType !== status.character.basicType
    ) {
      characterChanged = true;
    }
    const sameCharacter = currentCharacter && currentCharacter.id === status.character.id;
    if (sameCharacter) {
      const nextItems = Array.isArray(status.character.items) ? [...status.character.items] : [];
      if (!inventoryItemsEqual(currentCharacter.items, nextItems)) {
        inventoryDirty = true;
      }
      if (!materialsEqual(currentCharacter.materials, status.character.materials || {})) {
        inventoryDirty = true;
      }
    }
    currentCharacter = status.character;
    const idx = characters.findIndex(c => c.id === status.character.id);
    if (idx >= 0) {
      characters[idx] = status.character;
    }
    setRotationDamageType(status.character.basicType);
    if (inventoryView && inventoryView.character && inventoryView.character.id === status.character.id) {
      inventoryView.character = { ...inventoryView.character, ...status.character };
    }
  }
  let goldChanged = false;
  if (status.character && currentCharacter && status.character.id === currentCharacter.id) {
    const nextItems = Array.isArray(status.character.items) ? [...status.character.items] : [];
    if (!inventoryItemsEqual(currentCharacter.items, nextItems)) {
      inventoryDirty = true;
    }
    if (!materialsEqual(currentCharacter.materials, status.character.materials || {})) {
      inventoryDirty = true;
    }
    if (typeof status.character.gold === 'number' && (currentCharacter.gold || 0) !== status.character.gold) {
      goldChanged = true;
    }
    currentCharacter.gold = status.character.gold;
    currentCharacter.items = nextItems;
    currentCharacter.materials = status.character.materials || {};
    if (inventoryView && inventoryView.character && inventoryView.character.id === status.character.id) {
      inventoryView.gold = status.character.gold;
    }
  }
  const inventoryActive = isTabActive('inventory');
  if (inventoryDirty) {
    inventoryView = null;
  }
  if (characterChanged && isTabActive('character')) {
    renderCharacter();
  }
  if (characterChanged && inventoryActive) {
    renderInventory();
  } else if (inventoryDirty && inventoryActive) {
    renderInventory();
  }
  if ((goldChanged || characterChanged) && isTabActive('shop')) {
    renderShop();
  }
  if (jobStateChanged) {
    clearJobStatusCache();
  }
  const previewCharacterId =
    status && typeof status.characterId === 'number'
      ? status.characterId
      : status && status.character && typeof status.character.id === 'number'
      ? status.character.id
      : null;
  if (previewCharacterId != null) {
    cacheAdventurePreview(previewCharacterId, status, { error: !!status.error });
    updateAdventurePreviewView(previewCharacterId, status, { error: !!status.error });
  }
}

function createAdventureLayout() {
  if (!battleArea) return null;
  battleArea.innerHTML = '';
  const panel = document.createElement('div');
  panel.className = 'adventure-panel';

  const statusText = document.createElement('div');
  statusText.className = 'adventure-status-text';
  panel.appendChild(statusText);

  const progressSection = document.createElement('div');
  progressSection.className = 'adventure-progress';
  const progressBar = document.createElement('div');
  progressBar.className = 'adventure-progress-bar';
  const progressFill = document.createElement('div');
  progressFill.className = 'fill';
  progressBar.appendChild(progressFill);
  progressSection.appendChild(progressBar);
  const progressLabel = document.createElement('div');
  progressLabel.className = 'adventure-progress-label';
  progressSection.appendChild(progressLabel);
  panel.appendChild(progressSection);

  const timers = document.createElement('div');
  timers.className = 'adventure-timers';
  const timeRemaining = document.createElement('div');
  timeRemaining.className = 'adventure-time-remaining';
  timers.appendChild(timeRemaining);
  const nextEvent = document.createElement('div');
  nextEvent.className = 'adventure-next-event';
  timers.appendChild(nextEvent);
  panel.appendChild(timers);

  const actions = document.createElement('div');
  actions.className = 'adventure-actions';
  const dayLabel = document.createElement('label');
  dayLabel.className = 'adventure-day-picker';
  dayLabel.textContent = 'Adventure length:';
  const daySelect = document.createElement('select');
  daySelect.addEventListener('change', () => {
    const value = parseInt(daySelect.value, 10);
    if (Number.isFinite(value)) {
      adventureSelectedDays = value;
    }
    updateAdventureStartLabel();
  });
  dayLabel.appendChild(daySelect);
  actions.appendChild(dayLabel);
  const startBtn = document.createElement('button');
  startBtn.textContent = 'Start Adventure';
  actions.appendChild(startBtn);
  panel.appendChild(actions);

  const message = document.createElement('div');
  message.className = 'adventure-message message hidden';
  panel.appendChild(message);

  const logSection = document.createElement('div');
  logSection.className = 'adventure-log';
  const logTitle = document.createElement('h3');
  logTitle.textContent = 'Adventure Log';
  logSection.appendChild(logTitle);
  const logList = document.createElement('div');
  logList.className = 'adventure-events';
  logSection.appendChild(logList);
  panel.appendChild(logSection);

  const historySection = document.createElement('div');
  historySection.className = 'adventure-history';
  const historyTitle = document.createElement('h3');
  historyTitle.textContent = 'Past Adventures';
  historySection.appendChild(historyTitle);
  const historyList = document.createElement('div');
  historyList.className = 'adventure-history-entries';
  historySection.appendChild(historyList);
  panel.appendChild(historySection);

  battleArea.appendChild(panel);

  startBtn.addEventListener('click', onAdventureStart);

  return {
    container: panel,
    statusText,
    progressBar,
    progressFill,
    progressLabel,
    timeRemaining,
    nextEvent,
    startBtn,
    daySelect,
    message,
    logList,
    historyList,
  };
}

function updateAdventureStartLabel() {
  if (!adventureElements || !adventureElements.startBtn) return;
  const button = adventureElements.startBtn;
  if (button.dataset.state === 'starting') return;
  if (adventureStatus && adventureStatus.active) {
    button.textContent = 'Adventure in progress';
    return;
  }
  const days = Number.isFinite(adventureSelectedDays) ? adventureSelectedDays : null;
  if (days && days > 0) {
    button.textContent = days === 1 ? 'Start 1-Day Adventure' : `Start ${days}-Day Adventure`;
  } else {
    button.textContent = 'Start Adventure';
  }
}

function buildTooltipFromPairs(pairs = []) {
  const container = document.createElement('div');
  container.className = 'tooltip-grid';
  pairs.forEach(([label, value]) => {
    const l = document.createElement('div');
    l.className = 'label';
    l.textContent = label;
    container.appendChild(l);
    const v = document.createElement('div');
    v.textContent = value != null ? value : '';
    container.appendChild(v);
  });
  return container;
}

function launchAdventureReplay(event) {
  if (!event || !event.id || !currentCharacter) return;
  const url = `/adventure/replay?characterId=${currentCharacter.id}&eventId=${encodeURIComponent(event.id)}`;
  const messageEl = adventureElements && adventureElements.message ? adventureElements.message : null;
  let errorShown = false;
  if (messageEl) {
    showMessage(messageEl, 'Loading battle replay...', false);
  }
  const es = launchCombatStream(url, {
    waitingText: 'Loading battle replay...',
    updateArea: false,
    onStart: () => {
      if (messageEl && !errorShown) {
        clearMessage(messageEl);
      }
    },
    onEnd: data => {
      if (messageEl && !errorShown) {
        clearMessage(messageEl);
      }
      if (!data && messageEl && !errorShown) {
        showMessage(messageEl, 'Failed to load battle replay.', true);
      }
    },
    onError: info => {
      if (!messageEl) return;
      errorShown = true;
      const message = info && info.message ? info.message : 'Failed to load battle replay.';
      showMessage(messageEl, message, true);
    },
  });
  if (!es && messageEl) {
    showMessage(messageEl, 'Failed to start battle replay.', true);
  }
  return es;
}

function createAdventureItemCard(item) {
  if (!item) return null;
  const card = document.createElement('div');
  card.className = 'event-card item-card';
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  if (item.rarity) {
    card.dataset.rarity = String(item.rarity).toLowerCase();
  }
  const title = document.createElement('div');
  title.className = 'card-title';
  title.textContent = 'Item Found';
  card.appendChild(title);
  const body = document.createElement('div');
  body.className = 'card-body';
  const rarityText = item.rarity ? titleCase(item.rarity) : '';
  const nameText = item.name || 'Unknown item';
  body.textContent = rarityText ? `${rarityText} • ${nameText}` : nameText;
  card.appendChild(body);
  const itemDetails = item.id != null ? getEquipmentById(item.id) : null;
  if (itemDetails) {
    attachTooltip(card, () => itemTooltip(itemDetails));
  } else {
    attachTooltip(card, () => buildTooltipFromPairs([
      ['Item', nameText],
      ['Rarity', rarityText || 'Unknown'],
    ]));
  }
  return card;
}

function createAdventureMaterialCard(material) {
  if (!material) return null;
  const card = document.createElement('div');
  card.className = 'event-card item-card';
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  if (material.rarity) {
    card.dataset.rarity = String(material.rarity).toLowerCase();
  }
  const title = document.createElement('div');
  title.className = 'card-title';
  title.textContent = 'Material Found';
  card.appendChild(title);
  const body = document.createElement('div');
  body.className = 'card-body';
  const rarityText = material.rarity ? titleCase(material.rarity) : '';
  const nameText = material.name || 'Unknown material';
  const quantity = Number.isFinite(material.quantity) ? material.quantity : 1;
  const quantityText = quantity > 1 ? ` ×${quantity}` : '';
  body.textContent = rarityText ? `${rarityText} • ${nameText}${quantityText}` : `${nameText}${quantityText}`;
  card.appendChild(body);
  const materialDetails = material.id != null ? getMaterialById(material.id) : null;
  if (materialDetails) {
    attachTooltip(card, () => itemTooltip(materialDetails));
  } else {
    attachTooltip(card, () => buildTooltipFromPairs([
      ['Material', nameText],
      ['Rarity', rarityText || 'Unknown'],
      ['Quantity', quantity],
    ]));
  }
  return card;
}

function createAdventureOpponentCard(event) {
  if (!event || !event.opponent) return null;
  const card = document.createElement('div');
  card.className = 'event-card opponent-card';
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  if (event.result) {
    card.dataset.result = event.result;
  }
  const title = document.createElement('div');
  title.className = 'card-title';
  if (event.result === 'victory') {
    title.textContent = 'Battle Won';
  } else if (event.result === 'defeat') {
    title.textContent = 'Battle Lost';
  } else {
    title.textContent = 'Combat Encounter';
  }
  card.appendChild(title);
  const body = document.createElement('div');
  body.className = 'card-body';
  const parts = [];
  const opponentName = event.opponent.name || 'Unknown opponent';
  parts.push(opponentName);
  if (event.opponent.round != null) {
    parts.push(`Round ${event.opponent.round}`);
  }
  if (event.opponent.basicType) {
    parts.push(displayDamageType(event.opponent.basicType));
  }
  body.textContent = parts.filter(Boolean).join(' • ');
  card.appendChild(body);
  const previewData = event.opponent.preview || null;
  if (previewData) {
    attachTooltip(card, () => {
      const preview = buildCombatantPreview(previewData, { compact: true, theme: 'dark' });
      if (preview) {
        return preview;
      }
      return buildTooltipFromPairs([['Opponent', opponentName]]);
    });
  } else {
    attachTooltip(card, () => buildTooltipFromPairs([['Opponent', opponentName]]));
  }
  if (event.combat && event.combat.available) {
    card.classList.add('has-replay');
    card.setAttribute('data-action', 'view-battle');
    const actions = document.createElement('div');
    actions.className = 'card-actions';
    const viewBtn = document.createElement('button');
    viewBtn.type = 'button';
    viewBtn.className = 'card-action view-battle';
    viewBtn.textContent = 'View Battle';
    viewBtn.addEventListener('click', ev => {
      ev.stopPropagation();
      launchAdventureReplay(event);
    });
    actions.appendChild(viewBtn);
    card.appendChild(actions);
    card.addEventListener('click', () => {
      launchAdventureReplay(event);
    });
    card.addEventListener('keydown', ev => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        launchAdventureReplay(event);
      }
    });
  }
  return card;
}

function buildAdventureEventCards(event) {
  const cards = [];
  if (!event) return cards;
  if (event.item) {
    const itemCard = createAdventureItemCard(event.item);
    if (itemCard) cards.push(itemCard);
  }
  if (event.material) {
    const materialCard = createAdventureMaterialCard(event.material);
    if (materialCard) cards.push(materialCard);
  }
  if (event.opponent) {
    const opponentCard = createAdventureOpponentCard(event);
    if (opponentCard) cards.push(opponentCard);
  }
  return cards;
}

function renderAdventureHistory(historyEntries) {
  if (!adventureElements || !adventureElements.historyList) return;
  const list = adventureElements.historyList;
  list.innerHTML = '';
  const entries = Array.isArray(historyEntries) ? historyEntries : [];
  if (!entries.length) {
    const empty = document.createElement('div');
    empty.className = 'adventure-history-empty';
    empty.textContent = 'No completed adventures yet.';
    list.appendChild(empty);
    return;
  }
  entries.forEach(entry => {
    if (!entry) return;
    const item = document.createElement('div');
    item.className = 'adventure-history-entry';
    if (entry.outcome === 'defeat') {
      item.classList.add('outcome-defeat');
    } else {
      item.classList.add('outcome-complete');
    }
    const header = document.createElement('div');
    header.className = 'history-header';
    if (entry.outcome === 'defeat') {
      const defeatDay = entry.lastDay || entry.daysCompleted || entry.plannedDays || 1;
      const opponentName = entry.defeatedBy && entry.defeatedBy.name ? entry.defeatedBy.name : null;
      header.textContent = opponentName
        ? `Defeated on day ${defeatDay} by ${opponentName}`
        : `Defeated on day ${defeatDay}`;
    } else {
      const planned = entry.plannedDays || entry.daysCompleted || 1;
      header.textContent = `Completed ${planned} day${planned === 1 ? '' : 's'} adventure`;
    }
    item.appendChild(header);

    const detailParts = [];
    if (Number.isFinite(entry.plannedDays)) {
      detailParts.push(`Planned ${entry.plannedDays} day${entry.plannedDays === 1 ? '' : 's'}`);
    }
    if (Number.isFinite(entry.daysCompleted)) {
      detailParts.push(`Completed ${entry.daysCompleted} day${entry.daysCompleted === 1 ? '' : 's'}`);
    }
    if (entry.outcome === 'defeat' && Number.isFinite(entry.lastDay) && entry.lastDay !== entry.daysCompleted) {
      detailParts.push(`Reached day ${entry.lastDay}`);
    }
    if (detailParts.length) {
      const details = document.createElement('div');
      details.className = 'history-details';
      details.textContent = detailParts.join(' • ');
      item.appendChild(details);
    }

    const timeParts = [];
    const startTime = formatClockTime(entry.startedAt);
    const endTime = formatClockTime(entry.endedAt);
    if (startTime) timeParts.push(`Start ${startTime}`);
    if (endTime) timeParts.push(`End ${endTime}`);
    if (timeParts.length) {
      const timeline = document.createElement('div');
      timeline.className = 'history-timeline';
      timeline.textContent = timeParts.join(' • ');
      item.appendChild(timeline);
    }

    const rewards = entry.rewards || {};
    const rewardParts = [];
    if (Number.isFinite(rewards.xp) && rewards.xp > 0) {
      rewardParts.push(`+${rewards.xp} XP`);
    }
    if (Number.isFinite(rewards.gold) && rewards.gold > 0) {
      rewardParts.push(`+${rewards.gold} gold`);
    }
    const rewardLine = document.createElement('div');
    rewardLine.className = 'history-rewards';
    rewardLine.textContent = rewardParts.length ? rewardParts.join(' • ') : 'No XP or gold earned';
    item.appendChild(rewardLine);

    const items = Array.isArray(rewards.items)
      ? rewards.items.filter(it => it && (it.name || it.rarity))
      : [];
    if (items.length) {
      const itemsLine = document.createElement('div');
      itemsLine.className = 'history-items';
      const names = items.map(it => {
        if (it.name && it.rarity) return `${it.rarity} ${it.name}`;
        if (it.name) return it.name;
        if (it.rarity) return `${it.rarity} item`;
        return 'Item';
      });
      itemsLine.textContent = `Items: ${names.join(', ')}`;
      item.appendChild(itemsLine);
    }
    const materials = Array.isArray(rewards.materials)
      ? rewards.materials.filter(mat => mat && (mat.name || mat.rarity))
      : [];
    if (materials.length) {
      const materialsLine = document.createElement('div');
      materialsLine.className = 'history-items';
      const names = materials.map(mat => {
        const rarity = mat.rarity ? `${mat.rarity} ` : '';
        const qty = Number.isFinite(mat.quantity) && mat.quantity > 1 ? ` ×${mat.quantity}` : '';
        if (mat.name) return `${rarity}${mat.name}${qty}`.trim();
        return `${rarity}material${qty}`.trim();
      });
      materialsLine.textContent = `Materials: ${names.join(', ')}`;
      item.appendChild(materialsLine);
    }

    list.appendChild(item);
  });
}

function renderAdventureStatus(status, { refreshEvents = true } = {}) {
  adventureStatus = status;
  if (!adventureElements || !adventureElements.container || !battleArea.contains(adventureElements.container)) {
    adventureElements = createAdventureLayout();
  }
  if (!adventureElements) return;
  const now = Date.now();
  const active = !!status.active;
  const startedAt = status.startedAt || 0;
  const endsAt = status.endsAt || startedAt;
  const totalDuration = Math.max(1, endsAt - startedAt || status.totalDurationMs || 1);
  const elapsed = Math.max(0, Math.min(now, endsAt) - startedAt);
  const ratio = Math.min(1, Math.max(0, elapsed / totalDuration));
  const config = status.config || {};
  if (adventureElements.daySelect) {
    const select = adventureElements.daySelect;
    const optionValues = Array.isArray(config.dayOptions) ? config.dayOptions.slice() : [];
    const normalizedOptions = optionValues
      .map(value => {
        const num = parseInt(value, 10);
        return Number.isFinite(num) && num > 0 ? num : null;
      })
      .filter(value => value != null)
      .sort((a, b) => a - b);
    const options = normalizedOptions.length ? Array.from(new Set(normalizedOptions)) : [(status.totalDays || 1)];
    const currentOptions = Array.from(select.options).map(opt => parseInt(opt.value, 10));
    const changed =
      options.length !== currentOptions.length || options.some((value, idx) => value !== currentOptions[idx]);
    if (changed) {
      select.innerHTML = '';
      options.forEach(value => {
        const option = document.createElement('option');
        option.value = String(value);
        option.textContent = `${value} day${value === 1 ? '' : 's'}`;
        select.appendChild(option);
      });
    }
    let desired = adventureSelectedDays;
    if (status.active) {
      desired = status.totalDays || desired;
    }
    const defaultDays = Number.isFinite(config.defaultDays) ? config.defaultDays : options[options.length - 1];
    if (!Number.isFinite(desired) || !options.includes(desired)) {
      desired = options.includes(defaultDays) ? defaultDays : options[options.length - 1];
    }
    adventureSelectedDays = desired;
    if (String(select.value) !== String(desired)) {
      select.value = String(desired);
    }
    select.disabled = status.active || options.length <= 1;
    if (!status.active) {
      updateAdventureStartLabel();
    }
  }
  const latestHistory = Array.isArray(status.history) && status.history.length ? status.history[0] : null;
  if (adventureElements.statusText) {
    if (active) {
      adventureElements.statusText.textContent = `On Adventure • Day ${status.currentDay || 1} of ${status.totalDays || 1}`;
    } else if (status.completedAt) {
      if (status.outcome === 'defeat') {
        const defeatDay = latestHistory && latestHistory.lastDay ? latestHistory.lastDay : status.currentDay || 1;
        const opponent = latestHistory && latestHistory.defeatedBy && latestHistory.defeatedBy.name
          ? ` against ${latestHistory.defeatedBy.name}`
          : '';
        adventureElements.statusText.textContent = `Adventure ended in defeat on day ${defeatDay}${opponent}`;
      } else {
        const planned = latestHistory && latestHistory.plannedDays ? latestHistory.plannedDays : status.totalDays || 1;
        adventureElements.statusText.textContent = `Adventure complete • ${planned} day${planned === 1 ? '' : 's'}`;
      }
    } else {
      adventureElements.statusText.textContent = 'Ready for adventure';
    }
  }
  if (adventureElements.progressFill) {
    adventureElements.progressFill.style.width = `${Math.round(ratio * 100)}%`;
  }
  if (adventureElements.progressLabel) {
    const pct = Math.round(ratio * 100);
    adventureElements.progressLabel.textContent = `${pct}% complete`;
  }
  if (adventureElements.timeRemaining) {
    if (active && endsAt) {
      adventureElements.timeRemaining.textContent = `Time Remaining: ${formatDuration(Math.max(0, endsAt - now))}`;
    } else if (status.completedAt) {
      adventureElements.timeRemaining.textContent = status.outcome === 'defeat'
        ? 'Adventure ended early'
        : 'Adventure complete';
    } else {
      adventureElements.timeRemaining.textContent = 'Idle';
    }
  }
  if (adventureElements.nextEvent) {
    if (active && status.nextEventAt) {
      const untilNext = Math.max(0, status.nextEventAt - now);
      adventureElements.nextEvent.textContent = `Next event in ${formatDuration(untilNext)}`;
    } else if (!active && status.config) {
      adventureElements.nextEvent.textContent = `Duration per day: ${status.config.dayDurationMinutes || 0} minutes`;
    } else {
      adventureElements.nextEvent.textContent = '';
    }
  }
  if (adventureElements.startBtn) {
    if (active) {
      adventureElements.startBtn.disabled = true;
      delete adventureElements.startBtn.dataset.state;
      adventureElements.startBtn.textContent = 'Adventure in progress';
    } else {
      adventureElements.startBtn.disabled = false;
      delete adventureElements.startBtn.dataset.state;
      updateAdventureStartLabel();
    }
  }
  if (adventureElements.message) {
    if (status.message) {
      showMessage(adventureElements.message, status.message, true);
    } else {
      clearMessage(adventureElements.message);
    }
  }
  if (refreshEvents && adventureElements.logList) {
    const events = Array.isArray(status.events) ? status.events.slice().sort((a, b) => a.timestamp - b.timestamp) : [];
    adventureElements.logList.innerHTML = '';
    if (!events.length) {
      const empty = document.createElement('div');
      empty.className = 'adventure-event empty';
      empty.textContent = 'No events yet.';
      adventureElements.logList.appendChild(empty);
    } else {
      events.forEach(event => {
        if (!event) return;
        const entry = document.createElement('div');
        entry.className = 'adventure-event';
        if (event.type) {
          entry.classList.add(`type-${event.type}`);
          entry.dataset.type = event.type;
        }
        const header = document.createElement('div');
        header.className = 'event-header';
        const dayLabel = document.createElement('span');
        dayLabel.className = 'event-day';
        dayLabel.textContent = `Day ${event.day || 1}`;
        header.appendChild(dayLabel);
        const timeLabel = document.createElement('span');
        timeLabel.className = 'event-time';
        timeLabel.textContent = formatClockTime(event.timestamp);
        header.appendChild(timeLabel);
        entry.appendChild(header);
        const message = document.createElement('div');
        message.className = 'event-message';
        message.textContent = event.message || '';
        entry.appendChild(message);
        const metaParts = [];
        if (event.type === 'gold' && typeof event.amount === 'number') {
          metaParts.push(`+${event.amount} gold`);
        }
        if (event.type === 'xp' && typeof event.amount === 'number') {
          metaParts.push(`+${event.amount} XP`);
        }
        if (event.type === 'item' && event.item) {
          const rarity = event.item.rarity ? `${event.item.rarity} • ` : '';
          metaParts.push(`${rarity}${event.item.name}`);
        }
        if (event.type === 'material' && event.material) {
          const rarity = event.material.rarity ? `${event.material.rarity} • ` : '';
          const quantity = Number.isFinite(event.material.quantity) && event.material.quantity > 1
            ? ` ×${event.material.quantity}`
            : '';
          metaParts.push(`${rarity}${event.material.name}${quantity}`);
        }
        if (event.rewards) {
          if (event.rewards.xp) metaParts.push(`+${event.rewards.xp} XP`);
          if (event.rewards.gold) metaParts.push(`+${event.rewards.gold} gold`);
        }
        if (event.result) {
          metaParts.push(event.result === 'victory' ? 'Victory' : 'Defeat');
        }
        if (metaParts.length) {
          const meta = document.createElement('div');
          meta.className = 'event-meta';
          meta.textContent = metaParts.join(' • ');
          entry.appendChild(meta);
        }
        const cards = buildAdventureEventCards(event);
        if (cards.length) {
          const cardGroup = document.createElement('div');
          cardGroup.className = 'event-cards';
          cards.forEach(card => cardGroup.appendChild(card));
          entry.appendChild(cardGroup);
          entry.classList.add('has-cards');
        }
        adventureElements.logList.appendChild(entry);
      });
      adventureElements.logList.scrollTop = adventureElements.logList.scrollHeight;
    }
  }
  if (refreshEvents && adventureElements.historyList) {
    renderAdventureHistory(status.history);
  }
  if (!active) {
    stopAdventurePolling();
  }
}

function ensureAdventureTimers(status) {
  if (!status || !status.active) {
    stopAdventurePolling();
    return;
  }
  if (!adventureTickTimer) {
    adventureTickTimer = setInterval(() => {
      if (adventureStatus) {
        renderAdventureStatus(adventureStatus, { refreshEvents: false });
      }
    }, 1000);
  }
  if (!adventurePollTimer) {
    adventurePollTimer = setInterval(() => {
      if (adventurePollInFlight || !currentCharacter) return;
      adventurePollInFlight = true;
      fetchAdventureStatus()
        .then(data => {
          renderAdventureStatus(data);
          ensureAdventureTimers(data);
        })
        .catch(err => {
          if (adventureElements && adventureElements.message) {
            showMessage(adventureElements.message, err.message || 'Failed to refresh adventure.', true);
          }
        })
        .finally(() => {
          adventurePollInFlight = false;
        });
    }, 10000);
  }
}

async function onAdventureStart() {
  if (!currentCharacter || !adventureElements || !adventureElements.startBtn) return;
  const button = adventureElements.startBtn;
  if (button.disabled) return;
  button.disabled = true;
  button.dataset.state = 'starting';
  button.textContent = 'Starting...';
  if (adventureElements.message) clearMessage(adventureElements.message);
  try {
    const daysValue = adventureElements.daySelect ? parseInt(adventureElements.daySelect.value, 10) : adventureSelectedDays;
    const payload = { characterId: currentCharacter.id };
    if (Number.isFinite(daysValue) && daysValue > 0) {
      payload.days = daysValue;
      adventureSelectedDays = daysValue;
    }
    const status = await postJSON('/adventure/start', payload);
    applyAdventureUpdates(status);
    renderAdventureStatus(status);
    ensureAdventureTimers(status);
  } catch (err) {
    if (adventureElements && adventureElements.message) {
      showMessage(adventureElements.message, err.message || 'Failed to start adventure.', true);
    }
    button.disabled = false;
    delete button.dataset.state;
    updateAdventureStartLabel();
  }
}

async function renderAdventurePanel() {
  if (!currentCharacter) {
    battleArea.textContent = 'Select a character first.';
    return;
  }
  stopAdventurePolling();
  battleArea.textContent = 'Loading adventure...';
  const resourcePromise = Promise.all([ensureCatalog(), loadAbilityCatalog()]);
  let status;
  try {
    status = await fetchAdventureStatus();
  } catch (err) {
    battleArea.textContent = err.message || 'Failed to load adventure.';
    return;
  }
  try {
    await resourcePromise;
  } catch (err) {
    battleArea.textContent = err.message || 'Failed to load adventure.';
    return;
  }
  adventureElements = null;
  renderAdventureStatus(status);
  ensureAdventureTimers(status);
}

function stopBattlefieldPolling() {
  if (battlefieldPollTimer) {
    clearInterval(battlefieldPollTimer);
    battlefieldPollTimer = null;
  }
  if (battlefieldTickTimer) {
    clearInterval(battlefieldTickTimer);
    battlefieldTickTimer = null;
  }
  battlefieldPollInFlight = false;
  battlefieldElements = null;
}

function normalizeBattlefieldStatus(status) {
  if (!status || typeof status !== 'object') return null;
  const endsAtMs = status.endsAt ? Date.parse(status.endsAt) : null;
  const nextAwardAtMs = status.nextAwardAt ? Date.parse(status.nextAwardAt) : null;
  return {
    ...status,
    endsAtMs: Number.isFinite(endsAtMs) ? endsAtMs : null,
    nextAwardAtMs: Number.isFinite(nextAwardAtMs) ? nextAwardAtMs : null,
  };
}

function updateBattlefieldCountdown() {
  if (!battlefieldElements || !battlefieldState) return;
  const now = Date.now();
  const remainingMs = battlefieldState.endsAtMs != null ? battlefieldState.endsAtMs - now : null;
  const nextMs = battlefieldState.nextAwardAtMs != null ? battlefieldState.nextAwardAtMs - now : null;
  if (battlefieldElements.endsValue) {
    battlefieldElements.endsValue.textContent =
      remainingMs != null ? formatDuration(Math.max(0, remainingMs)) : '—';
  }
  if (battlefieldElements.nextValue) {
    battlefieldElements.nextValue.textContent =
      nextMs != null ? formatDuration(Math.max(0, nextMs)) : '—';
  }
}

function challengeBattlefieldSpot(spot, button) {
  if (!currentCharacter) {
    if (battlefieldElements && battlefieldElements.message) {
      showMessage(battlefieldElements.message, 'Select a character to challenge a defender.', true);
    }
    return;
  }
  if (!spot || !Number.isFinite(spot.spotId)) return;
  const messageEl = battlefieldElements ? battlefieldElements.message : null;
  if (messageEl) {
    showMessage(messageEl, `Challenging ${spot.occupantName || 'defender'}...`, false);
  }
  if (button) {
    button.disabled = true;
    button.textContent = 'Challenging...';
  }
  launchCombatStream(
    `/battlefield/challenge?characterId=${currentCharacter.id}&spotId=${spot.spotId}`,
    {
      waitingText: 'Preparing battlefield duel...',
      updateArea: false,
      onStart: () => {
        if (messageEl) {
          showMessage(messageEl, 'Engaging defender...', false);
        }
      },
      onEnd: data => {
        if (data && data.character) {
          updateAfterBattleEnd(data);
        }
        if (data && data.battlefield) {
          const normalized = normalizeBattlefieldStatus(data.battlefield);
          ensureBattlefieldResources()
            .then(() => {
              renderBattlefieldStatus(normalized);
              ensureBattlefieldTimers(normalized);
            })
            .catch(resourceErr => {
              if (messageEl) {
                showMessage(
                  messageEl,
                  resourceErr && resourceErr.message ? resourceErr.message : 'Failed to load battlefield.',
                  true,
                );
              }
            });
        } else {
          refreshBattlefieldStatus();
        }
        if (messageEl) {
          const win = data && data.winnerId === currentCharacter.id;
          const text = win ? 'Victory on the battlefield!' : 'Battle resolved.';
          showMessage(messageEl, text, false);
        }
      },
      onError: err => {
        if (messageEl) {
          showMessage(messageEl, err && err.message ? err.message : 'Battle failed.', true);
        }
        refreshBattlefieldStatus();
      },
    },
  );
}

function createBattlefieldSpot(status, spot) {
  const wrapper = document.createElement('div');
  wrapper.className = 'battlefield-spot';
  wrapper.style.left = `${spot.x != null ? spot.x : 50}%`;
  wrapper.style.top = `${spot.y != null ? spot.y : 50}%`;
  wrapper.dataset.id = spot.spotId;

  const tile = document.createElement('div');
  tile.className = 'battlefield-tile';
  const title = document.createElement('div');
  title.className = 'battlefield-tile-title';
  title.textContent = `Position ${spot.spotId}`;
  tile.appendChild(title);

  if (spot.occupantId != null) {
    wrapper.classList.add('occupied');
    const name = document.createElement('div');
    name.className = 'battlefield-tile-name';
    name.textContent = spot.occupantName || 'Unknown';
    tile.appendChild(name);
    const meta = document.createElement('div');
    meta.className = 'battlefield-tile-meta';
    meta.textContent = `Lv ${spot.occupantLevel || 1}`;
    tile.appendChild(meta);
    const points = document.createElement('div');
    points.className = 'battlefield-tile-points';
    points.textContent = `${spot.battlePoints || 0} pts`;
    tile.appendChild(points);
    const defending = currentCharacter && spot.occupantId === currentCharacter.id;
    if (defending) {
      wrapper.classList.add('yours');
    } else if (currentCharacter && !battlefieldState?.defending) {
      const challengeBtn = document.createElement('button');
      challengeBtn.type = 'button';
      challengeBtn.className = 'battlefield-action';
      challengeBtn.textContent = 'Challenge';
      challengeBtn.addEventListener('click', () => challengeBattlefieldSpot(spot, challengeBtn));
      tile.appendChild(challengeBtn);
    }
    if (spot.snapshot) {
      attachTooltip(tile, () => buildCombatantPreview(spot.snapshot, { theme: 'dark' }));
    }
  } else {
    const empty = document.createElement('div');
    empty.className = 'battlefield-tile-empty';
    empty.textContent = 'Unclaimed';
    tile.appendChild(empty);
    if (currentCharacter && !battlefieldState?.defending) {
      const claimBtn = document.createElement('button');
      claimBtn.type = 'button';
      claimBtn.className = 'battlefield-action';
      claimBtn.textContent = `Claim (${status.entryCost} GP)`;
      claimBtn.addEventListener('click', () => claimBattlefieldPosition(spot, claimBtn));
      tile.appendChild(claimBtn);
    }
  }

  wrapper.appendChild(tile);
  return wrapper;
}

function renderBattlefieldMap(status) {
  if (!battlefieldElements || !battlefieldElements.map) return;
  const map = battlefieldElements.map;
  map.innerHTML = '';
  const spots = Array.isArray(status.spots) ? status.spots : [];
  spots.forEach(spot => {
    if (!spot) return;
    const node = createBattlefieldSpot(status, spot);
    map.appendChild(node);
  });
}

function renderBattlefieldScoreboard(status) {
  if (!battlefieldElements || !battlefieldElements.scoreboard) return;
  const container = battlefieldElements.scoreboard;
  container.innerHTML = '';
  const participants = Array.isArray(status.participants) ? status.participants : [];
  if (!participants.length) {
    const empty = document.createElement('div');
    empty.className = 'battlefield-score-empty';
    empty.textContent = 'No contenders have scored yet.';
    container.appendChild(empty);
    return;
  }
  participants.forEach((entry, index) => {
    const row = document.createElement('div');
    row.className = 'battlefield-score-row';
    if (entry.occupying) {
      row.classList.add('holding');
    }
    if (currentCharacter && entry.characterId === currentCharacter.id) {
      row.classList.add('you');
    }
    const rank = document.createElement('span');
    rank.className = 'rank';
    rank.textContent = `${index + 1}.`;
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = entry.name || 'Unknown';
    const points = document.createElement('span');
    points.className = 'points';
    points.textContent = `${entry.points || 0} pts`;
    row.append(rank, name, points);
    container.appendChild(row);
  });
}

function renderBattlefieldStatus(status) {
  const normalized = normalizeBattlefieldStatus(status);
  battlefieldState = normalized;
  if (!battlefieldElements || !normalized) {
    return;
  }
  clearMessage(battlefieldElements.message);
  if (battlefieldElements.potValue) {
    battlefieldElements.potValue.textContent = `${normalized.pot || 0} Gold`;
  }
  if (battlefieldElements.entryCost) {
    battlefieldElements.entryCost.textContent = `War bond: ${normalized.entryCost || 0} Gold`;
  }
  const defending =
    currentCharacter &&
    Array.isArray(normalized.spots) &&
    normalized.spots.some(spot => spot && spot.occupantId === currentCharacter.id);
  battlefieldState.defending = defending;
  renderBattlefieldMap(normalized);
  renderBattlefieldScoreboard(normalized);
  if (battlefieldElements.yourPoints) {
    const pointsText = Number.isFinite(normalized.yourPoints) ? normalized.yourPoints : 0;
    battlefieldElements.yourPoints.textContent = currentCharacter
      ? `Your battle points: ${pointsText}`
      : 'Select a character to join the battle.';
  }
  if (battlefieldElements.leaveButton) {
    if (defending) {
      battlefieldElements.leaveButton.classList.remove('hidden');
      battlefieldElements.leaveButton.disabled = false;
    } else {
      battlefieldElements.leaveButton.classList.add('hidden');
    }
  }
  if (battlefieldElements.notice) {
    if (!currentCharacter) {
      battlefieldElements.notice.textContent = 'Log in and select a character to fight for the battlefield.';
    } else if (defending) {
      battlefieldElements.notice.textContent = 'You are defending a battlefield position.';
    } else {
      battlefieldElements.notice.textContent = 'Spend a war bond to claim a position or challenge a defender.';
    }
  }
  if (battlefieldElements.lastWinner) {
    if (normalized.lastEvent && normalized.lastEvent.winnerName) {
      const event = normalized.lastEvent;
      const potText = Number.isFinite(event.pot) ? `${event.pot} Gold` : 'the war chest';
      battlefieldElements.lastWinner.textContent = `Previous victor: ${event.winnerName} claimed ${potText}.`;
      battlefieldElements.lastWinner.classList.remove('hidden');
    } else {
      battlefieldElements.lastWinner.textContent = '';
      battlefieldElements.lastWinner.classList.add('hidden');
    }
  }
  updateBattlefieldCountdown();
}

function ensureBattlefieldTimers(status) {
  if (!status) {
    stopBattlefieldPolling();
    return;
  }
  if (!battlefieldTickTimer) {
    battlefieldTickTimer = setInterval(updateBattlefieldCountdown, 1000);
  }
  if (!battlefieldPollTimer) {
    battlefieldPollTimer = setInterval(() => {
      if (battlefieldPollInFlight || !battlefieldElements) return;
      battlefieldPollInFlight = true;
      fetchBattlefieldStatus()
        .then(async data => {
          const normalized = normalizeBattlefieldStatus(data);
          try {
            await ensureBattlefieldResources();
          } catch (resourceErr) {
            if (battlefieldElements && battlefieldElements.message) {
              showMessage(
                battlefieldElements.message,
                resourceErr && resourceErr.message ? resourceErr.message : 'Failed to load battlefield.',
                true,
              );
            }
            return;
          }
          renderBattlefieldStatus(normalized);
        })
        .catch(err => {
          if (battlefieldElements && battlefieldElements.message) {
            showMessage(
              battlefieldElements.message,
              err && err.message ? err.message : 'Failed to refresh battlefield.',
              true,
            );
          }
        })
        .finally(() => {
          battlefieldPollInFlight = false;
        });
    }, 30000);
  }
}

async function fetchBattlefieldStatus() {
  const characterId = currentCharacter && currentCharacter.id != null ? currentCharacter.id : null;
  const url = characterId != null ? `/battlefield/status?characterId=${characterId}` : '/battlefield/status';
  const res = await fetch(url);
  if (!res.ok) {
    let message = 'Failed to load battlefield.';
    try {
      const err = await res.json();
      if (err && err.error) message = err.error;
    } catch {}
    throw new Error(message);
  }
  return res.json();
}

async function refreshBattlefieldStatus() {
  try {
    const status = await fetchBattlefieldStatus();
    const normalized = normalizeBattlefieldStatus(status);
    try {
      await ensureBattlefieldResources();
    } catch (resourceErr) {
      if (battlefieldElements && battlefieldElements.message) {
        showMessage(
          battlefieldElements.message,
          resourceErr && resourceErr.message ? resourceErr.message : 'Failed to load battlefield.',
          true,
        );
      }
      return;
    }
    renderBattlefieldStatus(normalized);
    ensureBattlefieldTimers(normalized);
  } catch (err) {
    if (battlefieldElements && battlefieldElements.message) {
      showMessage(battlefieldElements.message, err.message || 'Failed to refresh battlefield.', true);
    }
  }
}

async function claimBattlefieldPosition(spot, button) {
  if (!currentCharacter) {
    if (battlefieldElements && battlefieldElements.message) {
      showMessage(battlefieldElements.message, 'Select a character to claim a position.', true);
    }
    return;
  }
  if (!spot || !Number.isFinite(spot.spotId)) return;
  const messageEl = battlefieldElements ? battlefieldElements.message : null;
  const entryCostLabel =
    battlefieldState && battlefieldState.entryCost != null ? battlefieldState.entryCost : '?';
  if (messageEl) {
    showMessage(messageEl, 'Purchasing war bond...', false);
  }
  if (button) {
    button.disabled = true;
    button.textContent = 'Claiming...';
  }
  try {
    const result = await postJSON('/battlefield/claim', {
      characterId: currentCharacter.id,
      spotId: spot.spotId,
    });
    if (result && result.character) {
      updateAfterBattleEnd({ character: result.character, gold: result.gold });
    }
    if (result && result.status) {
      const normalized = normalizeBattlefieldStatus(result.status);
      try {
        await ensureBattlefieldResources();
      } catch (resourceErr) {
        if (messageEl) {
          showMessage(
            messageEl,
            resourceErr && resourceErr.message ? resourceErr.message : 'Failed to load battlefield.',
            true,
          );
        }
        return;
      }
      renderBattlefieldStatus(normalized);
      ensureBattlefieldTimers(normalized);
    } else {
      await refreshBattlefieldStatus();
    }
    if (messageEl) {
      showMessage(messageEl, 'Position secured.', false);
    }
  } catch (err) {
    if (messageEl) {
      showMessage(messageEl, err.message || 'Failed to claim position.', true);
    }
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = `Claim (${entryCostLabel} GP)`;
    }
  }
}

async function leaveBattlefieldPosition(button) {
  if (!currentCharacter) return;
  if (button) {
    button.disabled = true;
    button.textContent = 'Leaving...';
  }
  const messageEl = battlefieldElements ? battlefieldElements.message : null;
  if (messageEl) {
    showMessage(messageEl, 'Withdrawing from the battlefield...', false);
  }
  try {
    const status = await postJSON('/battlefield/leave', {
      characterId: currentCharacter.id,
    });
    const normalized = normalizeBattlefieldStatus(status);
    try {
      await ensureBattlefieldResources();
    } catch (resourceErr) {
      if (messageEl) {
        showMessage(
          messageEl,
          resourceErr && resourceErr.message ? resourceErr.message : 'Failed to load battlefield.',
          true,
        );
      }
      return;
    }
    renderBattlefieldStatus(normalized);
    ensureBattlefieldTimers(normalized);
    if (messageEl) {
      showMessage(messageEl, 'You have vacated the position.', false);
    }
  } catch (err) {
    if (messageEl) {
      showMessage(messageEl, err.message || 'Failed to leave battlefield.', true);
    }
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = 'Leave Position';
    }
  }
}

function initializeBattlefieldPanel(status) {
  battleArea.innerHTML = '';
  const panel = document.createElement('div');
  panel.className = 'battlefield-panel';

  const header = document.createElement('div');
  header.className = 'battlefield-header';

  const timing = document.createElement('div');
  timing.className = 'battlefield-timing';
  const endsLabel = document.createElement('div');
  endsLabel.className = 'battlefield-label';
  endsLabel.textContent = 'Event ends in';
  const endsValue = document.createElement('div');
  endsValue.className = 'battlefield-value';
  timing.appendChild(endsLabel);
  timing.appendChild(endsValue);
  const nextLabel = document.createElement('div');
  nextLabel.className = 'battlefield-label';
  nextLabel.textContent = 'Next reward in';
  const nextValue = document.createElement('div');
  nextValue.className = 'battlefield-value';
  timing.appendChild(nextLabel);
  timing.appendChild(nextValue);

  const pot = document.createElement('div');
  pot.className = 'battlefield-pot';
  const potLabel = document.createElement('div');
  potLabel.className = 'battlefield-label';
  potLabel.textContent = 'War chest';
  const potValue = document.createElement('div');
  potValue.className = 'battlefield-value';
  const entryCost = document.createElement('div');
  entryCost.className = 'battlefield-entry';
  pot.append(potLabel, potValue, entryCost);

  header.append(timing, pot);
  panel.appendChild(header);

  const body = document.createElement('div');
  body.className = 'battlefield-body';
  const map = document.createElement('div');
  map.className = 'battlefield-map';
  const sidebar = document.createElement('div');
  sidebar.className = 'battlefield-sidebar';
  const notice = document.createElement('div');
  notice.className = 'battlefield-notice';
  const yourPoints = document.createElement('div');
  yourPoints.className = 'battlefield-your-points';
  const leaveButton = document.createElement('button');
  leaveButton.type = 'button';
  leaveButton.className = 'battlefield-leave hidden';
  leaveButton.textContent = 'Leave Position';
  leaveButton.addEventListener('click', () => leaveBattlefieldPosition(leaveButton));
  const scoreboardTitle = document.createElement('h3');
  scoreboardTitle.textContent = 'Battle points';
  scoreboardTitle.className = 'battlefield-score-title';
  const scoreboard = document.createElement('div');
  scoreboard.className = 'battlefield-scoreboard';
  const lastWinner = document.createElement('div');
  lastWinner.className = 'battlefield-last-winner hidden';
  sidebar.append(notice, yourPoints, leaveButton, scoreboardTitle, scoreboard, lastWinner);

  body.append(map, sidebar);
  panel.appendChild(body);

  const message = document.createElement('div');
  message.className = 'battlefield-message message hidden';
  panel.appendChild(message);

  battleArea.appendChild(panel);

  battlefieldElements = {
    container: panel,
    endsValue,
    nextValue,
    potValue,
    entryCost,
    map,
    scoreboard,
    yourPoints,
    leaveButton,
    message,
    lastWinner,
    notice,
  };

  renderBattlefieldStatus(status);
}

async function renderBattlefieldPanel() {
  stopBattlefieldPolling();
  battleArea.textContent = 'Loading battlefield...';
  const resourcePromise = ensureBattlefieldResources();
  let status;
  try {
    status = await fetchBattlefieldStatus();
  } catch (err) {
    battleArea.textContent = err.message || 'Failed to load battlefield.';
    return;
  }
  try {
    await resourcePromise;
  } catch (err) {
    battleArea.textContent = err.message || 'Failed to load battlefield.';
    return;
  }
  const normalized = normalizeBattlefieldStatus(status);
  initializeBattlefieldPanel(normalized);
  ensureBattlefieldTimers(normalized);
}

// Battle modes
const battleArea = document.getElementById('battle-area');
document.querySelectorAll('#battle-modes button').forEach(btn => {
  btn.addEventListener('click', () => selectMode(btn.dataset.mode));
});

function selectMode(mode) {
  stopAdventurePolling();
  closeDungeonSource();
  stopBattlefieldPolling();
  if (mode !== 'dungeon') {
    closeDungeonDialog();
  }
  if (mode !== 'matchmaking' && matchmakingState) {
    safeCloseMatchmakingSource();
    matchmakingState = null;
  }
  if (mode === 'matchmaking') {
    renderMatchmakingPanel();
  } else if (mode === 'challenge') {
    renderChallengePanel();
  } else if (mode === 'adventure') {
    renderAdventurePanel();
  } else if (mode === 'dungeon') {
    renderDungeonPanel();
  } else if (mode === 'battlefield') {
    renderBattlefieldPanel();
  } else {
    battleArea.textContent = 'Mode not implemented';
  }
}

function renderOpponentPreview(opponent) {
  return buildCombatantPreview(opponent);
}

async function renderChallengePanel(statusOverride) {
  if (!currentCharacter) {
    battleArea.textContent = 'Select a character first.';
    return;
  }
  battleArea.textContent = 'Loading challenge...';
  try {
    await ensureCatalog();
    await loadAbilityCatalog();
  } catch (err) {
    battleArea.textContent = err.message || 'Failed to load challenge.';
    return;
  }

  let status = statusOverride || null;
  if (!status) {
    try {
      const res = await fetch(`/challenge/status?characterId=${currentCharacter.id}`);
      if (!res.ok) {
        let message = 'Failed to load challenge.';
        try {
          const err = await res.json();
          if (err && err.error) message = err.error;
        } catch {}
        throw new Error(message);
      }
      status = await res.json();
    } catch (err) {
      battleArea.textContent = err.message || 'Failed to load challenge.';
      return;
    }
  }

  battleArea.innerHTML = '';
  const panel = document.createElement('div');
  panel.className = 'challenge-panel';

  const round = document.createElement('div');
  round.className = 'challenge-round';
  round.textContent = `Round ${status.round || 1}`;
  panel.appendChild(round);

  if (status.rewards) {
    const reward = document.createElement('div');
    reward.className = 'challenge-reward';
    reward.textContent = `Current Reward: +${status.rewards.xpGain} XP, +${status.rewards.goldGain} GP`;
    panel.appendChild(reward);
  }

  if (status.nextRewards) {
    const next = document.createElement('div');
    next.className = 'challenge-next';
    next.textContent = `Next Reward: +${status.nextRewards.xpGain} XP, +${status.nextRewards.goldGain} GP`;
    panel.appendChild(next);
  }

  const messageDiv = document.createElement('div');
  messageDiv.className = 'challenge-message message hidden';
  panel.appendChild(messageDiv);

  if (status.opponent) {
    const preview = renderOpponentPreview(status.opponent);
    if (preview) panel.appendChild(preview);

    const actions = document.createElement('div');
    actions.className = 'challenge-actions';
    const fightBtn = document.createElement('button');
    fightBtn.textContent = 'Fight Challenger';
    fightBtn.addEventListener('click', () => {
      fightBtn.disabled = true;
      clearMessage(messageDiv);
      launchCombatStream(`/challenge/fight?characterId=${currentCharacter.id}`, {
        waitingText: 'Engaging challenge...',
        onEnd: data => {
          if (data) {
            updateAfterBattleEnd(data);
            renderChallengePanel(data.challenge);
          } else {
            renderChallengePanel();
          }
        },
      });
    });
    actions.appendChild(fightBtn);
    panel.appendChild(actions);
  } else {
    const empty = document.createElement('div');
    empty.className = 'challenge-empty';
    empty.textContent = 'No opponent is ready. Start a new challenge to forge a nemesis.';
    panel.appendChild(empty);

    const actions = document.createElement('div');
    actions.className = 'challenge-actions';
    const startBtn = document.createElement('button');
    startBtn.textContent = 'Start Challenge';
    startBtn.addEventListener('click', async () => {
      startBtn.disabled = true;
      startBtn.textContent = 'Generating...';
      clearMessage(messageDiv);
      try {
        const data = await postJSON('/challenge/start', { characterId: currentCharacter.id });
        renderChallengePanel(data);
      } catch (err) {
        showMessage(messageDiv, err.message || 'Failed to start challenge.', true);
        startBtn.disabled = false;
        startBtn.textContent = 'Start Challenge';
      }
    });
    actions.appendChild(startBtn);
    panel.appendChild(actions);
  }

  battleArea.appendChild(panel);
}

async function renderShop() {
  const grid = document.getElementById('shop-grid');
  const goldDiv = document.getElementById('shop-gold');
  const message = document.getElementById('shop-message');
  if (!grid || !goldDiv || !message) return;
  grid.innerHTML = '';
  const loading = document.createElement('div');
  loading.className = 'shop-empty';
  loading.textContent = 'Loading...';
  grid.appendChild(loading);
  try {
    await ensureCatalog();
    await ensureInventory();
  } catch (err) {
    grid.textContent = 'Failed to load shop.';
    showMessage(message, err.message || 'Failed to load shop.', true);
    return;
  }
  clearMessage(message);
  goldDiv.textContent = `Gold: ${currentCharacter ? currentCharacter.gold || 0 : 0}`;
  shopCatalogCache = getCatalogItems();
  shopTotalItems = shopCatalogCache.length;
  initializeShopControls(shopCatalogCache);
  updateShopDisplay();
}

async function purchaseItem(item, messageEl) {
  if (!currentPlayer || !currentCharacter) return;
  clearMessage(messageEl);
  try {
    const res = await fetch('/shop/purchase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playerId: currentPlayer.id,
        itemId: item.id,
        characterId: currentCharacter.id,
      }),
    });
    if (!res.ok) {
      let message = 'purchase failed';
      try {
        const err = await res.json();
        if (err && err.error) message = err.error;
      } catch {}
      throw new Error(message);
    }
    const data = await res.json();
    const shouldRender = {
      shop: isTabActive('shop'),
      inventory: isTabActive('inventory'),
      character: isTabActive('character'),
    };
    applyInventoryData(data);
    if (shouldRender.shop) renderShop();
    if (shouldRender.inventory) renderInventory();
    if (shouldRender.character) renderCharacter();
    showMessage(messageEl, `Purchased ${item.name}`, false);
  } catch (err) {
    showMessage(messageEl, err.message || 'Purchase failed', true);
  }
}

async function renderInventory() {
  const message = document.getElementById('inventory-message');
  const grid = document.getElementById('inventory-grid');
  const materialGrid = document.getElementById('material-grid');
  const slots = document.getElementById('equipment-slots');
  const loadoutSummary = document.getElementById('loadout-summary');
  const resultsSummary = document.getElementById('inventory-results-summary');
  if (!grid || !materialGrid || !slots || !loadoutSummary) return;
  grid.textContent = 'Loading...';
  materialGrid.textContent = 'Loading...';
  slots.innerHTML = '';
  loadoutSummary.innerHTML = '';
  if (resultsSummary) resultsSummary.textContent = 'Loading inventory...';
  try {
    await ensureInventory();
  } catch (err) {
    grid.textContent = 'Failed to load inventory.';
    materialGrid.textContent = '';
    showMessage(message, err.message || 'Failed to load inventory', true);
    if (resultsSummary) resultsSummary.textContent = '';
    return;
  }
  clearMessage(message);
  updateInventoryHeader();
  grid.innerHTML = '';
  materialGrid.innerHTML = '';
  const inventoryItems = Array.isArray(inventoryView.inventory) ? inventoryView.inventory : [];
  inventoryItemsCache = inventoryItems.filter(entry => entry && entry.item);
  initializeInventoryControls(inventoryItemsCache.map(entry => entry.item));
  ensureInventoryFilterControls();
  updateInventoryDisplay();

  const materialItems = Array.isArray(inventoryView.materials) ? inventoryView.materials : [];
  if (!materialItems.length) {
    const emptyMaterial = document.createElement('div');
    emptyMaterial.className = 'shop-empty';
    emptyMaterial.textContent = 'No materials collected yet.';
    materialGrid.appendChild(emptyMaterial);
  } else {
    materialItems.forEach(({ material, count }) => {
      const card = createInventoryMaterialCard(material, count, message);
      if (card) {
        materialGrid.appendChild(card);
      }
    });
  }

  slots.innerHTML = '';
  const gearHeader = document.createElement('div');
  gearHeader.className = 'slot-section-header';
  gearHeader.textContent = 'Gear';
  slots.appendChild(gearHeader);

  EQUIPMENT_SLOTS.forEach(slot => {
    const slotDiv = document.createElement('div');
    slotDiv.className = 'equipment-slot';
    const label = document.createElement('div');
    label.className = 'slot-name';
    label.textContent = slotLabel(slot);
    slotDiv.appendChild(label);
    const equipped = getEquippedSlotItem(slot);
    if (equipped) {
      slotDiv.classList.add('filled');
      const itemName = document.createElement('div');
      itemName.className = 'item-name';
      itemName.textContent = equipped.name;
      slotDiv.appendChild(itemName);
      const meta = document.createElement('div');
      meta.className = 'meta';
      const typeText = equipped.type ? ` (${titleCase(equipped.type)})` : '';
      meta.textContent = `${equipped.rarity || 'Common'}${typeText}`;
      slotDiv.appendChild(meta);
      const button = document.createElement('button');
      button.textContent = 'Unequip';
      button.addEventListener('click', () => unequipSlot(slot, message));
      slotDiv.appendChild(button);
      attachTooltip(slotDiv, () => itemTooltip(equipped));
    } else {
      slotDiv.classList.add('empty');
      const emptyText = document.createElement('div');
      emptyText.className = 'item-name';
      emptyText.textContent = 'Empty';
      slotDiv.appendChild(emptyText);
    }
    slots.appendChild(slotDiv);
  });

  const useableHeader = document.createElement('div');
  useableHeader.className = 'slot-section-header';
  useableHeader.textContent = 'Useable Items';
  slots.appendChild(useableHeader);

  USEABLE_SLOTS.forEach(slot => {
    const slotDiv = document.createElement('div');
    slotDiv.className = 'equipment-slot useable-slot';
    const label = document.createElement('div');
    label.className = 'slot-name';
    label.textContent = slotLabel(slot);
    slotDiv.appendChild(label);
    const equipped = getEquippedSlotItem(slot);
    if (equipped) {
      slotDiv.classList.add('filled');
      const itemName = document.createElement('div');
      itemName.className = 'item-name';
      itemName.textContent = equipped.name;
      slotDiv.appendChild(itemName);
      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.textContent = formatItemMeta(equipped);
      slotDiv.appendChild(meta);
      const trigger = document.createElement('div');
      trigger.className = 'meta';
      trigger.textContent = describeUseTrigger(equipped.useTrigger);
      slotDiv.appendChild(trigger);
      const button = document.createElement('button');
      button.textContent = 'Unequip';
      button.addEventListener('click', () => unequipSlot(slot, message));
      slotDiv.appendChild(button);
      attachTooltip(slotDiv, () => itemTooltip(equipped));
    } else {
      slotDiv.classList.add('empty');
      const emptyText = document.createElement('div');
      emptyText.className = 'item-name';
      emptyText.textContent = 'Empty';
      slotDiv.appendChild(emptyText);
    }
    slots.appendChild(slotDiv);
  });

  loadoutSummary.innerHTML = '';
  populateLoadoutSummary(loadoutSummary, inventoryView.derived);
}

async function equipItem(slot, itemId, messageEl) {
  if (!currentPlayer || !currentCharacter) return;
  clearMessage(messageEl);
  try {
    const res = await fetch(`/characters/${currentCharacter.id}/equipment`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: currentPlayer.id, slot, itemId }),
    });
    if (!res.ok) {
      let message = 'equip failed';
      try {
        const err = await res.json();
        if (err && err.error) message = err.error;
      } catch {}
      throw new Error(message);
    }
    const data = await res.json();
    const shouldRender = {
      inventory: isTabActive('inventory'),
      shop: isTabActive('shop'),
      character: isTabActive('character'),
    };
    applyInventoryData(data);
    if (shouldRender.inventory) renderInventory();
    if (shouldRender.shop) renderShop();
    if (shouldRender.character) renderCharacter();
    const equipped = getEquippedSlotItem(slot);
    showMessage(messageEl, equipped ? `Equipped ${equipped.name}` : 'Equipped', false);
  } catch (err) {
    showMessage(messageEl, err.message || 'Equip failed', true);
  }
}

async function unequipSlot(slot, messageEl) {
  if (!currentPlayer || !currentCharacter) return;
  clearMessage(messageEl);
  try {
    const res = await fetch(`/characters/${currentCharacter.id}/equipment`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: currentPlayer.id, slot, itemId: null }),
    });
    if (!res.ok) {
      let message = 'unequip failed';
      try {
        const err = await res.json();
        if (err && err.error) message = err.error;
      } catch {}
      throw new Error(message);
    }
    const data = await res.json();
    const shouldRender = {
      inventory: isTabActive('inventory'),
      shop: isTabActive('shop'),
      character: isTabActive('character'),
    };
    applyInventoryData(data);
    if (shouldRender.inventory) renderInventory();
    if (shouldRender.shop) renderShop();
    if (shouldRender.character) renderCharacter();
    showMessage(messageEl, `Unequipped ${slotLabel(slot)}`, false);
  } catch (err) {
    showMessage(messageEl, err.message || 'Unequip failed', true);
  }
}

async function mutateStash(action, payload, options = {}) {
  if (!currentPlayer || !currentCharacter) return null;
  const { messageEl, button, pendingText, successMessage, errorMessage, onSuccess } = options;
  if (messageEl) clearMessage(messageEl);
  const originalText = button ? button.textContent : null;
  if (button) {
    button.disabled = true;
    if (pendingText) {
      button.textContent = pendingText;
    }
  }
  let responsePayload = null;
  try {
    const res = await fetch(`/players/${currentPlayer.id}/stash/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, characterId: currentCharacter.id }),
    });
    try {
      responsePayload = await res.json();
    } catch {
      responsePayload = null;
    }
    if (!res.ok) {
      const message = responsePayload && responsePayload.error
        ? responsePayload.error
        : errorMessage || 'Stash update failed';
      throw new Error(message);
    }
    if (responsePayload && responsePayload.inventory) {
      applyInventoryData(responsePayload.inventory);
    }
    if (responsePayload && responsePayload.stash) {
      applyStashData(responsePayload.stash);
    } else {
      updateInventoryHeader();
    }
    const shouldRender = {
      inventory: isTabActive('inventory'),
      shop: isTabActive('shop'),
      character: isTabActive('character'),
    };
    if (shouldRender.inventory) {
      await renderInventory();
    }
    if (shouldRender.shop) {
      renderShop();
    }
    if (shouldRender.character) {
      renderCharacter();
    }
    if (typeof onSuccess === 'function') {
      onSuccess(responsePayload);
    }
    if (messageEl && successMessage) {
      const text = typeof successMessage === 'function' ? successMessage(responsePayload) : successMessage;
      showMessage(messageEl, text, false);
    }
    return responsePayload;
  } catch (err) {
    if (messageEl) {
      showMessage(messageEl, err && err.message ? err.message : errorMessage || 'Stash update failed', true);
    } else {
      alert(err && err.message ? err.message : errorMessage || 'Stash update failed');
    }
    return null;
  } finally {
    if (button) {
      button.disabled = false;
      if (originalText != null) {
        button.textContent = originalText;
      }
    }
  }
}

async function handleInventoryStashDeposit(item, quantityInput, button, messageEl) {
  if (!item) return;
  const quantity = quantityInput
    ? normalizeQuantityInput(quantityInput, {
        min: 1,
        max: quantityInput.max ? parseInt(quantityInput.max, 10) : null,
        defaultValue: 1,
      })
    : 1;
  await mutateStash('deposit', { kind: 'equipment', itemId: item.id, count: quantity }, {
    messageEl,
    button,
    pendingText: 'Stashing...',
    successMessage: () => `Added ${quantity} × ${item.name} to stash.`,
    errorMessage: 'Failed to add item to stash',
    onSuccess: () => {
      if (quantityInput) quantityInput.value = '1';
    },
  });
}

async function handleInventoryMaterialDeposit(material, quantityInput, button, messageEl) {
  if (!material) return;
  const quantity = quantityInput
    ? normalizeQuantityInput(quantityInput, {
        min: 1,
        max: quantityInput.max ? parseInt(quantityInput.max, 10) : null,
        defaultValue: 1,
      })
    : 1;
  await mutateStash('deposit', { kind: 'material', materialId: material.id, count: quantity }, {
    messageEl,
    button,
    pendingText: 'Stashing...',
    successMessage: () => `Added ${quantity} × ${material.name} to stash.`,
    errorMessage: 'Failed to add material to stash',
    onSuccess: () => {
      if (quantityInput) quantityInput.value = '1';
    },
  });
}

async function handleStashWithdrawEquipment(item, quantityInput, button, messageEl) {
  if (!item) return;
  const quantity = quantityInput
    ? normalizeQuantityInput(quantityInput, {
        min: 1,
        max: quantityInput.max ? parseInt(quantityInput.max, 10) : null,
        defaultValue: 1,
      })
    : 1;
  await mutateStash('withdraw', { kind: 'equipment', itemId: item.id, count: quantity }, {
    messageEl,
    button,
    pendingText: 'Withdrawing...',
    successMessage: () => `Withdrew ${quantity} × ${item.name} from stash.`,
    errorMessage: 'Failed to withdraw item',
    onSuccess: () => {
      if (quantityInput) quantityInput.value = '1';
    },
  });
}

async function handleStashWithdrawMaterial(material, quantityInput, button, messageEl) {
  if (!material) return;
  const quantity = quantityInput
    ? normalizeQuantityInput(quantityInput, {
        min: 1,
        max: quantityInput.max ? parseInt(quantityInput.max, 10) : null,
        defaultValue: 1,
      })
    : 1;
  await mutateStash('withdraw', { kind: 'material', materialId: material.id, count: quantity }, {
    messageEl,
    button,
    pendingText: 'Withdrawing...',
    successMessage: () => `Withdrew ${quantity} × ${material.name} from stash.`,
    errorMessage: 'Failed to withdraw material',
    onSuccess: () => {
      if (quantityInput) quantityInput.value = '1';
    },
  });
}

async function handleStashGoldTransfer(direction, input, button, messageEl) {
  if (!input) return;
  const raw = parseInt(input.value, 10);
  let amount = Number.isFinite(raw) && raw > 0 ? raw : 0;
  if (!amount) {
    showMessage(messageEl, 'Enter an amount greater than zero', true);
    return;
  }
  if (direction === 'deposit') {
    const available = inventoryView && typeof inventoryView.gold === 'number'
      ? inventoryView.gold
      : currentCharacter && typeof currentCharacter.gold === 'number'
        ? currentCharacter.gold
        : 0;
    const maxAmount = Math.max(0, Math.floor(available));
    if (maxAmount <= 0) {
      showMessage(messageEl, 'No gold available to stash', true);
      return;
    }
    if (amount > maxAmount) {
      amount = maxAmount;
      input.value = String(amount);
    }
  } else {
    const stashGold = stashView && Number.isFinite(stashView.gold) ? stashView.gold : 0;
    const maxAmount = Math.max(0, Math.floor(stashGold));
    if (maxAmount <= 0) {
      showMessage(messageEl, 'No gold stored in stash', true);
      return;
    }
    if (amount > maxAmount) {
      amount = maxAmount;
      input.value = String(amount);
    }
  }
  if (amount > SAFE_MAX_QUANTITY) {
    amount = SAFE_MAX_QUANTITY;
    input.value = String(amount);
  }
  const action = direction === 'deposit' ? 'deposit' : 'withdraw';
  const pendingText = direction === 'deposit' ? 'Depositing...' : 'Withdrawing...';
  const successMessage = direction === 'deposit'
    ? () => `Deposited ${amount} gold into stash.`
    : () => `Withdrew ${amount} gold from stash.`;
  const errorMessage = direction === 'deposit' ? 'Failed to deposit gold' : 'Failed to withdraw gold';
  await mutateStash(action, { kind: 'gold', amount }, {
    messageEl,
    button,
    pendingText,
    successMessage,
    errorMessage,
    onSuccess: () => {
      input.value = '';
    },
  });
}

async function handleStashExpand(button, messageEl) {
  await mutateStash('slots', {}, {
    messageEl,
    button,
    pendingText: 'Unlocking...',
    successMessage: 'Unlocked a new equipment slot.',
    errorMessage: 'Failed to unlock slot',
  });
}

function renderStashDialog(dialogEl, data) {
  if (!dialogEl) return;
  const goldSummary = dialogEl.querySelector('#stash-gold-total');
  if (goldSummary) {
    const gold = data && Number.isFinite(data.gold) ? Math.max(0, Math.floor(data.gold)) : 0;
    goldSummary.textContent = `Stash Gold: ${gold}`;
  }
  const charGoldValue = inventoryView && typeof inventoryView.gold === 'number'
    ? inventoryView.gold
    : currentCharacter && typeof currentCharacter.gold === 'number'
      ? currentCharacter.gold
      : 0;
  const characterGold = Math.max(0, Math.floor(charGoldValue));
  const charSummary = dialogEl.querySelector('#stash-character-gold');
  if (charSummary) {
    charSummary.textContent = `Character Gold: ${characterGold}`;
  }
  const slotSummary = dialogEl.querySelector('#stash-slot-summary');
  if (slotSummary) {
    if (data && Number.isFinite(data.equipmentSlots)) {
      const used = Number.isFinite(data.slotsUsed) ? data.slotsUsed : 0;
      slotSummary.textContent = `Equipment Slots: ${used} / ${data.equipmentSlots}`;
    } else {
      slotSummary.textContent = 'Equipment Slots: —';
    }
  }
  const expandButton = dialogEl.querySelector('#stash-expand-button');
  if (expandButton) {
    if (data && Number.isFinite(data.nextSlotCost)) {
      const cost = Math.max(0, Math.floor(data.nextSlotCost));
      expandButton.textContent = `Unlock Slot (${cost}g)`;
      const canAfford = data.gold >= cost;
      expandButton.disabled = !canAfford;
      expandButton.title = canAfford ? '' : 'Not enough stash gold';
    } else {
      expandButton.textContent = 'Unlock Slot';
      expandButton.disabled = true;
      expandButton.title = '';
    }
  }

  const equipmentGrid = dialogEl.querySelector('#stash-equipment-grid');
  if (equipmentGrid) {
    equipmentGrid.innerHTML = '';
    if (!data) {
      const loading = document.createElement('div');
      loading.className = 'stash-empty';
      loading.textContent = 'Loading stash...';
      equipmentGrid.appendChild(loading);
    } else if (!data.equipment.length) {
      const empty = document.createElement('div');
      empty.className = 'stash-empty';
      empty.textContent = 'No equipment stored.';
      equipmentGrid.appendChild(empty);
    } else {
      data.equipment.forEach(entry => {
        if (!entry || !entry.item) return;
        const card = document.createElement('div');
        card.className = 'stash-card';
        const name = document.createElement('div');
        name.className = 'stash-card-name';
        name.textContent = entry.item.name || 'Equipment';
        card.appendChild(name);
        const meta = document.createElement('div');
        meta.className = 'stash-card-meta';
        const metaParts = [];
        if (entry.item.rarity) metaParts.push(entry.item.rarity);
        if (entry.item.slot) {
          const slotText = slotLabel(entry.item.slot);
          if (slotText) metaParts.push(slotText);
        }
        if (entry.item.type && entry.item.slot !== 'useable') metaParts.push(titleCase(entry.item.type));
        meta.textContent = metaParts.join(' • ');
        card.appendChild(meta);
        const countLabel = document.createElement('div');
        countLabel.className = 'stash-card-count';
        countLabel.textContent = `Stored ×${entry.count}`;
        card.appendChild(countLabel);
        const controls = document.createElement('div');
        controls.className = 'stash-card-controls';
        const quantityField = document.createElement('div');
        quantityField.className = 'blacksmith-quantity-field';
        const quantityId = createStashDomId('stash-withdraw', entry.item.id);
        const quantityLabel = document.createElement('label');
        quantityLabel.className = 'blacksmith-quantity-label';
        quantityLabel.setAttribute('for', quantityId);
        quantityLabel.textContent = 'Qty';
        const quantityInput = document.createElement('input');
        quantityInput.type = 'number';
        quantityInput.id = quantityId;
        quantityInput.className = 'blacksmith-quantity-input';
        quantityInput.min = '1';
        quantityInput.max = String(entry.count);
        quantityInput.value = entry.count > 0 ? '1' : '0';
        if (!entry.count) {
          quantityInput.disabled = true;
        }
        const enforceBounds = () => {
          normalizeQuantityInput(quantityInput, {
            min: entry.count > 0 ? 1 : 0,
            max: entry.count > 0 ? entry.count : 0,
            defaultValue: entry.count > 0 ? 1 : 0,
          });
        };
        quantityInput.addEventListener('change', enforceBounds);
        quantityInput.addEventListener('blur', enforceBounds);
        quantityField.appendChild(quantityLabel);
        quantityField.appendChild(quantityInput);
        controls.appendChild(quantityField);
        const withdrawButton = document.createElement('button');
        withdrawButton.textContent = 'Withdraw';
        if (!entry.count) {
          withdrawButton.disabled = true;
        }
        const messageEl = dialogEl.querySelector('#stash-message');
        withdrawButton.addEventListener('click', () => handleStashWithdrawEquipment(entry.item, quantityInput, withdrawButton, messageEl));
        controls.appendChild(withdrawButton);
        card.appendChild(controls);
        attachTooltip(card, () => itemTooltip(entry.item));
        equipmentGrid.appendChild(card);
      });
    }
  }

  const materialGrid = dialogEl.querySelector('#stash-material-grid');
  if (materialGrid) {
    materialGrid.innerHTML = '';
    if (!data) {
      const loading = document.createElement('div');
      loading.className = 'stash-empty';
      loading.textContent = 'Loading stash...';
      materialGrid.appendChild(loading);
    } else if (!data.materials.length) {
      const empty = document.createElement('div');
      empty.className = 'stash-empty';
      empty.textContent = 'No materials stored.';
      materialGrid.appendChild(empty);
    } else {
      data.materials.forEach(entry => {
        if (!entry || !entry.material) return;
        const card = document.createElement('div');
        card.className = 'stash-card';
        const name = document.createElement('div');
        name.className = 'stash-card-name';
        name.textContent = entry.material.name || 'Material';
        card.appendChild(name);
        const meta = document.createElement('div');
        meta.className = 'stash-card-meta';
        const metaParts = [];
        metaParts.push('Material');
        if (entry.material.rarity) metaParts.push(entry.material.rarity);
        meta.textContent = metaParts.join(' • ');
        card.appendChild(meta);
        const countLabel = document.createElement('div');
        countLabel.className = 'stash-card-count';
        countLabel.textContent = `Stored ×${entry.count}`;
        card.appendChild(countLabel);
        const controls = document.createElement('div');
        controls.className = 'stash-card-controls';
        const quantityField = document.createElement('div');
        quantityField.className = 'blacksmith-quantity-field';
        const quantityId = createStashDomId('stash-material-withdraw', entry.material.id);
        const quantityLabel = document.createElement('label');
        quantityLabel.className = 'blacksmith-quantity-label';
        quantityLabel.setAttribute('for', quantityId);
        quantityLabel.textContent = 'Qty';
        const quantityInput = document.createElement('input');
        quantityInput.type = 'number';
        quantityInput.id = quantityId;
        quantityInput.className = 'blacksmith-quantity-input';
        quantityInput.min = '1';
        quantityInput.max = String(entry.count);
        quantityInput.value = entry.count > 0 ? '1' : '0';
        if (!entry.count) {
          quantityInput.disabled = true;
        }
        const enforceBounds = () => {
          normalizeQuantityInput(quantityInput, {
            min: entry.count > 0 ? 1 : 0,
            max: entry.count > 0 ? entry.count : 0,
            defaultValue: entry.count > 0 ? 1 : 0,
          });
        };
        quantityInput.addEventListener('change', enforceBounds);
        quantityInput.addEventListener('blur', enforceBounds);
        quantityField.appendChild(quantityLabel);
        quantityField.appendChild(quantityInput);
        controls.appendChild(quantityField);
        const withdrawButton = document.createElement('button');
        withdrawButton.textContent = 'Withdraw';
        if (!entry.count) {
          withdrawButton.disabled = true;
        }
        const messageEl = dialogEl.querySelector('#stash-message');
        withdrawButton.addEventListener('click', () => handleStashWithdrawMaterial(entry.material, quantityInput, withdrawButton, messageEl));
        controls.appendChild(withdrawButton);
        card.appendChild(controls);
        attachTooltip(card, () => itemTooltip(entry.material));
        materialGrid.appendChild(card);
      });
    }
  }

  const depositInput = dialogEl.querySelector('#stash-gold-deposit-amount');
  const depositButton = dialogEl.querySelector('#stash-gold-deposit button[type="submit"]');
  if (depositInput) {
    const canDeposit = characterGold > 0;
    depositInput.value = '';
    depositInput.placeholder = `Max ${characterGold}`;
    if (canDeposit) {
      depositInput.max = String(characterGold);
      depositInput.disabled = false;
    } else {
      depositInput.removeAttribute('max');
      depositInput.disabled = true;
    }
    if (depositButton) depositButton.disabled = !canDeposit;
  }

  const stashGoldValue = data && Number.isFinite(data.gold) ? Math.max(0, Math.floor(data.gold)) : 0;
  const withdrawInput = dialogEl.querySelector('#stash-gold-withdraw-amount');
  const withdrawButton = dialogEl.querySelector('#stash-gold-withdraw button[type="submit"]');
  if (withdrawInput) {
    const canWithdraw = stashGoldValue > 0;
    withdrawInput.value = '';
    withdrawInput.placeholder = `Max ${stashGoldValue}`;
    if (canWithdraw) {
      withdrawInput.max = String(stashGoldValue);
      withdrawInput.disabled = false;
    } else {
      withdrawInput.removeAttribute('max');
      withdrawInput.disabled = true;
    }
    if (withdrawButton) withdrawButton.disabled = !canWithdraw;
  }
}

async function openStashDialog() {
  if (!currentPlayer || !currentCharacter) return;
  closeStashDialog();
  try {
    await ensureInventory();
  } catch (err) {
    alert(err && err.message ? err.message : 'Failed to load inventory');
    return;
  }
  const overlay = document.createElement('div');
  overlay.id = 'stash-dialog';
  overlay.className = 'stash-overlay';
  overlay.innerHTML = `
    <div class="stash-dialog">
      <div class="stash-header">
        <div class="stash-title">Account Stash</div>
        <button type="button" class="stash-close">Close</button>
      </div>
      <div id="stash-message" class="message hidden"></div>
      <div class="stash-content">
        <div class="stash-summary">
          <div class="stash-summary-item" id="stash-gold-total">Stash Gold: 0</div>
          <div class="stash-summary-item" id="stash-character-gold">Character Gold: 0</div>
          <div class="stash-summary-item" id="stash-slot-summary">Equipment Slots: —</div>
          <button type="button" id="stash-expand-button">Unlock Slot</button>
        </div>
        <div class="stash-sections">
          <div class="stash-section">
            <h3>Stored Equipment</h3>
            <div id="stash-equipment-grid" class="stash-grid"></div>
          </div>
          <div class="stash-section">
            <h3>Stored Materials</h3>
            <div id="stash-material-grid" class="stash-grid"></div>
          </div>
          <div class="stash-section">
            <h3>Gold Transfer</h3>
            <div class="stash-gold-forms">
              <form id="stash-gold-deposit" autocomplete="off">
                <label for="stash-gold-deposit-amount" class="blacksmith-quantity-label">Deposit</label>
                <input id="stash-gold-deposit-amount" type="number" min="1" />
                <button type="submit">Add to Stash</button>
              </form>
              <form id="stash-gold-withdraw" autocomplete="off">
                <label for="stash-gold-withdraw-amount" class="blacksmith-quantity-label">Withdraw</label>
                <input id="stash-gold-withdraw-amount" type="number" min="1" />
                <button type="submit">Take Out</button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  stashDialog = overlay;
  overlay.addEventListener('click', event => {
    if (event.target === overlay) {
      closeStashDialog();
    }
  });
  const closeButton = overlay.querySelector('.stash-close');
  if (closeButton) {
    closeButton.addEventListener('click', () => closeStashDialog());
  }
  const messageEl = overlay.querySelector('#stash-message');
  const depositForm = overlay.querySelector('#stash-gold-deposit');
  if (depositForm) {
    const depositInput = depositForm.querySelector('input');
    const depositButton = depositForm.querySelector('button[type="submit"]');
    depositForm.addEventListener('submit', event => {
      event.preventDefault();
      handleStashGoldTransfer('deposit', depositInput, depositButton, messageEl);
    });
  }
  const withdrawForm = overlay.querySelector('#stash-gold-withdraw');
  if (withdrawForm) {
    const withdrawInput = withdrawForm.querySelector('input');
    const withdrawButton = withdrawForm.querySelector('button[type="submit"]');
    withdrawForm.addEventListener('submit', event => {
      event.preventDefault();
      handleStashGoldTransfer('withdraw', withdrawInput, withdrawButton, messageEl);
    });
  }
  const expandButton = overlay.querySelector('#stash-expand-button');
  if (expandButton) {
    expandButton.addEventListener('click', () => handleStashExpand(expandButton, messageEl));
  }
  stashKeyHandler = event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeStashDialog();
    }
  };
  document.addEventListener('keydown', stashKeyHandler);
  renderStashDialog(overlay, stashView);
  try {
    await refreshStash(true);
  } catch (err) {
    if (stashDialog && messageEl) {
      showMessage(messageEl, err && err.message ? err.message : 'Failed to load stash', true);
    }
  }
}

function closeStashDialog() {
  if (stashKeyHandler) {
    document.removeEventListener('keydown', stashKeyHandler);
    stashKeyHandler = null;
  }
  if (stashDialog && stashDialog.parentNode) {
    stashDialog.parentNode.removeChild(stashDialog);
  }
  stashDialog = null;
}

function populateLoadoutSummary(container, derived) {
  if (!container) return;
  container.innerHTML = '';
  if (!derived) {
    const empty = document.createElement('div');
    empty.textContent = 'No loadout data available.';
    container.appendChild(empty);
    return;
  }

  const baseAttributes = derived.baseAttributes || (currentCharacter && currentCharacter.attributes) || {};
  const attributes = derived.attributes || baseAttributes;
  const bonuses = derived.attributeBonuses || {};
  const stats = ['strength', 'stamina', 'agility', 'intellect', 'wisdom'];

  const attrTable = document.createElement('table');
  attrTable.className = 'stats-table';
  const header = document.createElement('tr');
  ['Attribute', 'Base', 'Gear', 'Total'].forEach(label => {
    const th = document.createElement('th');
    th.textContent = label;
    header.appendChild(th);
  });
  attrTable.appendChild(header);
  stats.forEach(stat => {
    const tr = document.createElement('tr');
    const base = baseAttributes[stat] || 0;
    const bonus = bonuses[stat] || 0;
    const total = attributes[stat] != null ? attributes[stat] : base + bonus;
    const cells = [statLabel(stat), base, bonus, total];
    cells.forEach(value => {
      const td = document.createElement('td');
      td.textContent = value;
      tr.appendChild(td);
    });
    attrTable.appendChild(tr);
  });

  const derivedTable = document.createElement('table');
  derivedTable.className = 'stats-table';
  const addRow = (label, value) => {
    const tr = document.createElement('tr');
    const l = document.createElement('td');
    l.textContent = label;
    const v = document.createElement('td');
    v.textContent = value;
    tr.appendChild(l);
    tr.appendChild(v);
    derivedTable.appendChild(tr);
  };
  addRow('Melee Attack', `${Math.round(derived.minMeleeAttack || 0)}-${Math.round(derived.maxMeleeAttack || 0)}`);
  addRow('Magic Attack', `${Math.round(derived.minMagicAttack || 0)}-${Math.round(derived.maxMagicAttack || 0)}`);
  addRow('Attack Interval', `${(derived.attackIntervalSeconds || 0).toFixed(2)}s`);
  addRow('Health', Math.round(derived.health || 0));
  addRow('Mana', Math.round(derived.mana || 0));
  addRow('Stamina', Math.round(derived.stamina || 0));
  addRow('Melee Resist', `${Math.round((derived.meleeResist || 0) * 100)}%`);
  addRow('Magic Resist', `${Math.round((derived.magicResist || 0) * 100)}%`);
  addRow('Hit Chance', formatChanceValue(derived.hitChance));
  addRow('Crit Chance', formatChanceValue(derived.critChance));
  addRow('Block Chance', formatChanceValue(derived.blockChance));
  addRow('Dodge Chance', formatChanceValue(derived.dodgeChance));
  const basic = derived.basicAttackEffectType === 'MagicDamage' ? 'Magic' : 'Physical';
  addRow('Basic Attack', basic);

  const tables = document.createElement('div');
  tables.className = 'summary-tables';
  tables.appendChild(attrTable);
  tables.appendChild(derivedTable);
  container.appendChild(tables);

  const chanceBonuses = derived.chanceBonuses || {};
  const chanceTable = document.createElement('table');
  chanceTable.className = 'stats-table';
  const chanceHeader = document.createElement('tr');
  ['Chance Stat', 'Gear Bonus', 'Total'].forEach(label => {
    const th = document.createElement('th');
    th.textContent = label;
    chanceHeader.appendChild(th);
  });
  chanceTable.appendChild(chanceHeader);
  [
    { key: 'hitChance', label: 'Hit Chance' },
    { key: 'critChance', label: 'Crit Chance' },
    { key: 'blockChance', label: 'Block Chance' },
    { key: 'dodgeChance', label: 'Dodge Chance' },
  ].forEach(({ key, label }) => {
    const tr = document.createElement('tr');
    const statTd = document.createElement('td');
    statTd.textContent = label;
    const gearTd = document.createElement('td');
    gearTd.textContent = formatChanceValue(chanceBonuses[key], { withSign: true });
    const totalTd = document.createElement('td');
    totalTd.textContent = formatChanceValue(derived[key]);
    tr.appendChild(statTd);
    tr.appendChild(gearTd);
    tr.appendChild(totalTd);
    chanceTable.appendChild(tr);
  });

  const extras = document.createElement('div');
  extras.className = 'summary-extras';

  const chanceCard = document.createElement('div');
  chanceCard.className = 'chance-card';
  const chanceHeading = document.createElement('div');
  chanceHeading.className = 'card-heading';
  chanceHeading.textContent = 'Chance Breakdown';
  chanceCard.appendChild(chanceHeading);
  chanceCard.appendChild(chanceTable);
  extras.appendChild(chanceCard);

  const effectsCard = document.createElement('div');
  effectsCard.className = 'onhit-card';
  const effectsHeading = document.createElement('div');
  effectsHeading.className = 'card-heading';
  effectsHeading.textContent = 'On-Hit Effects';
  effectsCard.appendChild(effectsHeading);
  const effects = Array.isArray(derived.onHitEffects) ? derived.onHitEffects : [];
  if (!effects.length) {
    const none = document.createElement('div');
    none.textContent = 'None';
    effectsCard.appendChild(none);
  } else {
    const list = document.createElement('ul');
    list.className = 'simple-list';
    effects.forEach(entry => {
      const li = document.createElement('li');
      li.textContent = describeOnHit(entry);
      list.appendChild(li);
    });
    effectsCard.appendChild(list);
  }
  extras.appendChild(effectsCard);

  container.appendChild(extras);
}


async function renderCharacter() {
  const pane = document.getElementById('character');
  if (!pane) return;
  pane.innerHTML = '';
  const loading = document.createElement('div');
  loading.textContent = 'Loading character...';
  pane.appendChild(loading);
  try {
    await ensureInventory();
  } catch (err) {
    pane.innerHTML = '';
    const error = document.createElement('div');
    error.className = 'message error';
    error.textContent = err.message || 'Failed to load character data';
    pane.appendChild(error);
    return;
  }

  pane.innerHTML = '';
  const xpNeeded = xpForNextLevel(currentCharacter.level || 1);
  const xpCurrent = currentCharacter.xp || 0;
  const gold = currentCharacter ? currentCharacter.gold || 0 : 0;
  const derived = (inventoryView && inventoryView.derived) || computeDerived(currentCharacter);

  const page = document.createElement('div');
  page.className = 'character-page';
  pane.appendChild(page);

  const hero = document.createElement('div');
  hero.className = 'character-hero';
  page.appendChild(hero);

  const emblem = document.createElement('div');
  emblem.className = 'hero-emblem';
  emblem.textContent = (currentCharacter.name || '?').slice(0, 1).toUpperCase();
  hero.appendChild(emblem);

  const heroBody = document.createElement('div');
  heroBody.className = 'hero-body';
  hero.appendChild(heroBody);

  const heroHeader = document.createElement('div');
  heroHeader.className = 'hero-header';
  heroBody.appendChild(heroHeader);

  const heroName = document.createElement('div');
  heroName.className = 'hero-name';
  heroName.textContent = currentCharacter.name;
  heroHeader.appendChild(heroName);

  const heroType = document.createElement('div');
  heroType.className = 'hero-type';
  heroType.textContent = displayDamageType(currentCharacter.basicType);
  heroHeader.appendChild(heroType);

  const metaGrid = document.createElement('div');
  metaGrid.className = 'hero-meta-grid';
  heroBody.appendChild(metaGrid);
  const metaEntries = [
    { label: 'Level', value: currentCharacter.level || 1 },
    { label: 'Gold', value: gold },
    { label: 'Basic Attack', value: derived.basicAttackEffectType === 'MagicDamage' ? 'Magic' : 'Physical' },
  ];
  const professionName = getJobDisplayName(currentCharacter && currentCharacter.job ? currentCharacter.job.jobId : null);
  metaEntries.push({ label: 'Profession', value: professionName });
  metaEntries.forEach(({ label, value }) => {
    const item = document.createElement('div');
    item.className = 'hero-meta-item';
    const l = document.createElement('div');
    l.className = 'label';
    l.textContent = label;
    const v = document.createElement('div');
    v.className = 'value';
    v.textContent = value;
    item.appendChild(l);
    item.appendChild(v);
    metaGrid.appendChild(item);
  });

  const xpSection = document.createElement('div');
  xpSection.className = 'hero-xp';
  heroBody.appendChild(xpSection);
  const xpLabel = document.createElement('div');
  xpLabel.className = 'xp-label';
  xpLabel.textContent = xpNeeded > 0 ? `XP ${xpCurrent} / ${xpNeeded}` : `XP ${xpCurrent}`;
  xpSection.appendChild(xpLabel);
  const xpBar = document.createElement('div');
  xpBar.className = 'xp-bar';
  xpSection.appendChild(xpBar);
  const xpFill = document.createElement('div');
  xpFill.className = 'xp-bar-fill';
  const progress = xpNeeded > 0 ? Math.min(1, Math.max(0, xpCurrent / xpNeeded)) : 1;
  xpFill.style.width = `${progress * 100}%`;
  xpBar.appendChild(xpFill);
  if (xpNeeded > 0 && xpCurrent >= xpNeeded) {
    xpSection.classList.add('ready');
    const ready = document.createElement('div');
    ready.className = 'xp-ready-text';
    ready.textContent = 'Ready to level up!';
    xpSection.appendChild(ready);
  } else if (xpNeeded > 0) {
    const hint = document.createElement('div');
    hint.className = 'xp-hint';
    hint.textContent = `${Math.max(0, xpNeeded - xpCurrent)} XP to next level`;
    xpSection.appendChild(hint);
  } else {
    const hint = document.createElement('div');
    hint.className = 'xp-hint';
    hint.textContent = 'Maximum level reached';
    xpSection.appendChild(hint);
  }

  const heroActions = document.createElement('div');
  heroActions.className = 'hero-actions';
  hero.appendChild(heroActions);
  if (xpNeeded > 0 && xpCurrent >= xpNeeded) {
    const status = document.createElement('div');
    status.className = 'hero-status ready';
    status.textContent = 'Advancement available';
    heroActions.appendChild(status);
    const btn = document.createElement('button');
    btn.textContent = 'Level Up';
    btn.addEventListener('click', showLevelUpForm);
    heroActions.appendChild(btn);
  } else {
    const status = document.createElement('div');
    status.className = 'hero-status';
    status.textContent = xpNeeded > 0 ? `${Math.max(0, xpNeeded - xpCurrent)} XP needed` : 'Standing at the peak';
    heroActions.appendChild(status);
  }
  const jobButton = document.createElement('button');
  const hasJob = currentCharacter && currentCharacter.job && currentCharacter.job.jobId;
  jobButton.textContent = hasJob ? 'Jobs' : 'Choose Job';
  if (!hasJob) {
    jobButton.classList.add('job-attention');
  }
  jobButton.addEventListener('click', showJobDialog);
  jobButton.title = hasJob ? `Active profession: ${getJobDisplayName(currentCharacter.job.jobId)}` : 'Assign a profession to start crafting';
  heroActions.appendChild(jobButton);
  const heroNote = document.createElement('div');
  heroNote.className = 'hero-note';
  heroNote.textContent = 'Tweak gear in the loadout and prepare your next rotation.';
  heroActions.appendChild(heroNote);

  const swapButton = document.createElement('button');
  swapButton.textContent = 'Swap Character';
  swapButton.addEventListener('click', exitToCharacterSelect);
  heroActions.appendChild(swapButton);

  const grid = document.createElement('div');
  grid.className = 'character-grid';
  page.appendChild(grid);

  const highlightCard = document.createElement('div');
  highlightCard.className = 'character-card highlight-card';
  const highlightTitle = document.createElement('h3');
  highlightTitle.textContent = 'Battle Snapshot';
  highlightCard.appendChild(highlightTitle);
  const highlightGrid = document.createElement('div');
  highlightGrid.className = 'highlight-grid';
  const highlightStats = [
    { label: 'Health', value: Math.round(derived.health || 0) },
    { label: 'Mana', value: Math.round(derived.mana || 0) },
    { label: 'Stamina', value: Math.round(derived.stamina || 0) },
    { label: 'Melee ATK', value: `${Math.round(derived.minMeleeAttack || 0)}-${Math.round(derived.maxMeleeAttack || 0)}` },
    { label: 'Magic ATK', value: `${Math.round(derived.minMagicAttack || 0)}-${Math.round(derived.maxMagicAttack || 0)}` },
    { label: 'Attack Rate', value: `${(derived.attackIntervalSeconds || 0).toFixed(2)}s` },
    { label: 'Hit Chance', value: formatChanceValue(derived.hitChance) },
    { label: 'Crit Chance', value: formatChanceValue(derived.critChance) },
    { label: 'Block Chance', value: formatChanceValue(derived.blockChance) },
    { label: 'Dodge Chance', value: formatChanceValue(derived.dodgeChance) },
    { label: 'Melee Resist', value: `${Math.round((derived.meleeResist || 0) * 100)}%` },
    { label: 'Magic Resist', value: `${Math.round((derived.magicResist || 0) * 100)}%` },
  ];
  highlightStats.forEach(({ label, value }) => {
    const item = document.createElement('div');
    item.className = 'highlight-item';
    const l = document.createElement('div');
    l.className = 'label';
    l.textContent = label;
    const v = document.createElement('div');
    v.className = 'value';
    v.textContent = value;
    item.appendChild(l);
    item.appendChild(v);
    highlightGrid.appendChild(item);
  });
  highlightCard.appendChild(highlightGrid);
  grid.appendChild(highlightCard);

  const loadoutCard = document.createElement('div');
  loadoutCard.className = 'character-card loadout-card';
  const loadoutTitle = document.createElement('h3');
  loadoutTitle.textContent = 'Loadout Breakdown';
  loadoutCard.appendChild(loadoutTitle);
  const summary = document.createElement('div');
  summary.className = 'loadout-summary';
  populateLoadoutSummary(summary, derived);
  loadoutCard.appendChild(summary);
  grid.appendChild(loadoutCard);
}


function showLevelUpForm() {
  if (document.getElementById('levelup-dialog')) return;
  const dialog = document.createElement('div');
  dialog.id = 'levelup-dialog';
  const box = document.createElement('div');
  box.className = 'dialog-box';
  dialog.appendChild(box);

  let remaining = 2;
  const alloc = { strength: 0, stamina: 0, agility: 0, intellect: 0, wisdom: 0 };
  const baseAttrs = currentCharacter.attributes || {};
  const baseDerived = computeDerived(currentCharacter);

  const remDiv = document.createElement('div');
  remDiv.textContent = `Points remaining: ${remaining}`;
  box.appendChild(remDiv);

  const attrTable = document.createElement('table');
  attrTable.className = 'stats-table';
  const stats = ['strength', 'stamina', 'agility', 'intellect', 'wisdom'];
  let confirm;
  stats.forEach(stat => {
    const tr = document.createElement('tr');
    const label = document.createElement('td');
    label.textContent = stat.toUpperCase();
    const val = document.createElement('td');
    val.textContent = baseAttrs[stat];
    const btnTd = document.createElement('td');
    const btn = document.createElement('button');
    btn.textContent = '+';
    btn.addEventListener('click', () => {
      if (remaining > 0) {
        alloc[stat]++;
        remaining--;
        val.textContent = baseAttrs[stat] + alloc[stat];
        remDiv.textContent = `Points remaining: ${remaining}`;
        updateDerived();
        confirm.disabled = remaining !== 0;
      }
    });
    btnTd.appendChild(btn);
    tr.appendChild(label);
    tr.appendChild(val);
    tr.appendChild(btnTd);
    attrTable.appendChild(tr);
  });
  box.appendChild(attrTable);

  const derivedTable = document.createElement('table');
  derivedTable.className = 'stats-table';
  const header = document.createElement('tr');
  ['Stat', 'Current', 'New'].forEach(h => {
    const th = document.createElement('th');
    th.textContent = h;
    header.appendChild(th);
  });
  derivedTable.appendChild(header);

  const derivedRows = {};
  const addDerivedRow = (label, cur) => {
    const tr = document.createElement('tr');
    const l = document.createElement('td'); l.textContent = label;
    const c = document.createElement('td'); c.textContent = cur;
    const n = document.createElement('td'); n.textContent = cur;
    tr.appendChild(l); tr.appendChild(c); tr.appendChild(n);
    derivedTable.appendChild(tr);
    derivedRows[label] = n;
  };

  addDerivedRow('Melee Attack', `${baseDerived.minMeleeAttack}-${baseDerived.maxMeleeAttack}`);
  addDerivedRow('Magic Attack', `${baseDerived.minMagicAttack}-${baseDerived.maxMagicAttack}`);
  addDerivedRow('Attack Interval', `${baseDerived.attackIntervalSeconds.toFixed(2)}s`);
  addDerivedRow('Health', baseDerived.health);
  addDerivedRow('Mana', baseDerived.mana);
  addDerivedRow('Stamina Pool', baseDerived.stamina);
  addDerivedRow('Hit Chance', formatChanceValue(baseDerived.hitChance));
  addDerivedRow('Crit Chance', formatChanceValue(baseDerived.critChance));
  addDerivedRow('Block Chance', formatChanceValue(baseDerived.blockChance));
  addDerivedRow('Dodge Chance', formatChanceValue(baseDerived.dodgeChance));

  box.appendChild(derivedTable);

  const buttons = document.createElement('div');
  buttons.className = 'dialog-buttons';
  confirm = document.createElement('button');
  confirm.textContent = 'Confirm';
  confirm.disabled = true;
  confirm.addEventListener('click', () => {
    fetch(`/characters/${currentCharacter.id}/levelup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ allocations: alloc }),
    })
      .then(res => {
        if (!res.ok) throw new Error('fail');
        return res.json();
      })
      .then(char => {
        const previousCharacter = currentCharacter;
        currentCharacter = char;
        if (shouldInvalidateJobStatus(previousCharacter, char)) {
          clearJobStatusCache();
        }
        const idx = characters.findIndex(c => c.id === char.id);
        if (idx >= 0) characters[idx] = char;
        dialog.remove();
        inventoryView = null;
        refreshInventory(true)
          .then(() => renderCharacter())
          .catch(() => renderCharacter());
      })
      .catch(() => {
        alert('Level up failed');
      });
  });
  const cancel = document.createElement('button');
  cancel.textContent = 'Cancel';
  cancel.addEventListener('click', () => dialog.remove());

  buttons.appendChild(confirm);
  buttons.appendChild(cancel);
  box.appendChild(buttons);

  document.body.appendChild(dialog);

  function updateDerived() {
    const attrs = {};
    stats.forEach(s => {
      attrs[s] = baseAttrs[s] + alloc[s];
    });
    const d = computeDerived({ attributes: attrs });
    derivedRows['Melee Attack'].textContent = `${d.minMeleeAttack}-${d.maxMeleeAttack}`;
    derivedRows['Magic Attack'].textContent = `${d.minMagicAttack}-${d.maxMagicAttack}`;
    derivedRows['Attack Interval'].textContent = `${d.attackIntervalSeconds.toFixed(2)}s`;
    derivedRows['Health'].textContent = d.health;
    derivedRows['Mana'].textContent = d.mana;
    derivedRows['Stamina Pool'].textContent = d.stamina;
    derivedRows['Hit Chance'].textContent = formatChanceValue(d.hitChance);
    derivedRows['Crit Chance'].textContent = formatChanceValue(d.critChance);
    derivedRows['Block Chance'].textContent = formatChanceValue(d.blockChance);
    derivedRows['Dodge Chance'].textContent = formatChanceValue(d.dodgeChance);
  }

  updateDerived();
}
