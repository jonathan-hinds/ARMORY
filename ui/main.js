let currentPlayer = null;
let characters = [];
let currentCharacter = null;
let abilityCatalog = [];
let abilityCatalogPromise = null;
let rotation = [];
let rotationInitialized = false;
let rotationDamageType = 'melee';

const rotationDamageTypeSelect = document.getElementById('rotation-damage-type');

function normalizeDamageType(value) {
  return value === 'magic' ? 'magic' : 'melee';
}

function setRotationDamageType(value) {
  rotationDamageType = normalizeDamageType(value);
  if (rotationDamageTypeSelect) {
    rotationDamageTypeSelect.value = rotationDamageType;
  }
}

if (rotationDamageTypeSelect) {
  setRotationDamageType(rotationDamageTypeSelect.value || rotationDamageType);
  rotationDamageTypeSelect.addEventListener('change', e => {
    setRotationDamageType(e.target.value);
  });
}

const EQUIPMENT_SLOTS = ['weapon', 'helmet', 'chest', 'legs', 'feet', 'hands'];
const SLOT_LABELS = {
  weapon: 'Weapon',
  helmet: 'Helmet',
  chest: 'Chest',
  legs: 'Legs',
  feet: 'Feet',
  hands: 'Hands',
};
const STAT_KEYS = ['strength', 'stamina', 'agility', 'intellect', 'wisdom'];

let equipmentCatalog = null;
let catalogPromise = null;
let equipmentIndex = null;
let inventoryView = null;
let inventoryPromise = null;
let tabsInitialized = false;

let adventureStatus = null;
let adventurePollTimer = null;
let adventureTickTimer = null;
let adventurePollInFlight = false;
let adventureElements = null;
let adventureSelectedDays = null;

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
  return {
    minMeleeAttack: strength * 2,
    maxMeleeAttack: strength * 2 + 4,
    minMagicAttack: intellect * 2,
    maxMagicAttack: intellect * 2 + 4,
    attackIntervalSeconds: attackInterval,
    health: 100 + stamina * 10,
    mana: 50 + wisdom * 8,
    stamina: 50 + stamina * 8,
  };
}

function slotLabel(slot) {
  return SLOT_LABELS[slot] || (slot ? slot.charAt(0).toUpperCase() + slot.slice(1) : '');
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

function displayDamageType(type) {
  if (!type) return 'Melee';
  if (type === 'magic') return 'Magic';
  if (type === 'melee') return 'Melee';
  const formatted = titleCase(type);
  return formatted || 'Melee';
}

function describeEffect(effect) {
  if (!effect || typeof effect !== 'object') return '';
  if (effect.type === 'PhysicalDamage') {
    const amount = effect.value != null ? effect.value : effect.damage;
    return amount != null ? `Physical Damage ${amount}` : 'Physical Damage';
  }
  if (effect.type === 'MagicDamage') {
    const amount = effect.value != null ? effect.value : effect.damage;
    return amount != null ? `Magic Damage ${amount}` : 'Magic Damage';
  }
  if (effect.type === 'Heal') {
    return effect.value != null ? `Heal ${effect.value}` : 'Heal';
  }
  if (effect.type === 'BuffDamagePct') {
    const pct = Math.round((effect.amount || 0) * 100);
    return `+${pct}% Damage for ${effect.duration || 0}s`;
  }
  if (effect.type === 'Stun') {
    return `Stun ${effect.duration || 0}s`;
  }
  if (effect.type === 'Poison') {
    const dmg = effect.damage != null ? effect.damage : 0;
    const interval = effect.interval != null ? effect.interval : 1;
    const duration = effect.duration != null ? effect.duration : 0;
    return `Poison ${dmg} dmg/${interval}s for ${duration}s`;
  }
  return effect.type || '';
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
  return `${chance}% on ${trigger}${conditionText}: ${describeEffect(entry.effect)}`;
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
  if (typeof item.attackIntervalModifier === 'number' && item.attackIntervalModifier !== 0) {
    add(
      'Attack Interval',
      `${item.attackIntervalModifier > 0 ? '+' : ''}${item.attackIntervalModifier.toFixed(2)}s`
    );
  }
  if (Array.isArray(item.onHitEffects) && item.onHitEffects.length) {
    add('On Hit', item.onHitEffects.map(describeOnHit).join('<br/>'));
  }
  return container;
}

function abilityTooltip(ability) {
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
  add('School', ability.school);
  add('Cost', `${ability.costValue} ${ability.costType}`);
  add('Cooldown', `${ability.cooldown}s`);
  add('Scaling', ability.scaling.length ? ability.scaling.join(', ') : 'None');
  const effectLines = ability.effects.map(describeEffect).join('<br/>');
  add('Effects', effectLines);
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

function applyInventoryData(data) {
  if (!data) return;
  inventoryView = data;
  if (data.character) {
    currentCharacter = data.character;
    const idx = characters.findIndex(c => c.id === data.character.id);
    if (idx >= 0) {
      characters[idx] = data.character;
    }
    setRotationDamageType(data.character.basicType);
  }
  if (currentPlayer && typeof data.gold === 'number') {
    currentPlayer.gold = data.gold;
  }
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
      equipmentIndex = buildEquipmentIndex(data);
      return data;
    })()
      .catch(err => {
        equipmentCatalog = null;
        equipmentIndex = null;
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
  [...weapons, ...armor].forEach(item => {
    if (item && item.id != null) {
      index[item.id] = item;
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

function getCatalogItems() {
  if (!equipmentCatalog) return [];
  const weapons = Array.isArray(equipmentCatalog.weapons) ? equipmentCatalog.weapons : [];
  const armor = Array.isArray(equipmentCatalog.armor) ? equipmentCatalog.armor : [];
  return [...weapons, ...armor].slice().sort((a, b) => {
    const costA = typeof a.cost === 'number' ? a.cost : 0;
    const costB = typeof b.cost === 'number' ? b.cost : 0;
    if (costA !== costB) return costA - costB;
    return a.name.localeCompare(b.name);
  });
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

function getOwnedCount(itemId) {
  if (!inventoryView || !inventoryView.ownedCounts) return 0;
  return inventoryView.ownedCounts[itemId] || 0;
}

function isTabActive(id) {
  const pane = document.getElementById(id);
  return pane ? pane.classList.contains('active') : false;
}

function renderCharacters() {
  const list = document.getElementById('character-list');
  list.innerHTML = '';
  characters.forEach(c => {
    const li = document.createElement('li');
    const stats = c.attributes;
    const name = c.name || `Character ${c.id}`;
    const info = document.createElement('span');
    info.className = 'info';
    const typeLabel = displayDamageType(c.basicType);
    info.textContent = `${name} Lv${c.level || 1} (Damage: ${typeLabel}) - STR:${stats.strength} STA:${stats.stamina} AGI:${stats.agility} INT:${stats.intellect} WIS:${stats.wisdom}`;
    const btn = document.createElement('button');
    btn.textContent = 'Select';
    btn.addEventListener('click', () => enterGame(c));
    li.appendChild(info);
    li.appendChild(btn);
    list.appendChild(li);
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
  currentCharacter = character;
  setRotationDamageType(character ? character.basicType : null);
  charSelectDiv.classList.add('hidden');
  gameDiv.classList.remove('hidden');
  inventoryView = null;
  rotationInitialized = false;
  rotation = [];
  try {
    await refreshInventory(true);
  } catch (err) {
    console.error('inventory load failed', err);
  }
  initTabs();
}

function initTabs() {
  const buttons = document.querySelectorAll('#tabs button');
  if (!tabsInitialized) {
    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.getAttribute('data-tab');
        document.querySelectorAll('.tab-pane').forEach(pane => {
          pane.classList.toggle('active', pane.id === target);
        });
        if (target === 'rotation') {
          initRotation();
        } else if (target === 'character') {
          renderCharacter();
        } else if (target === 'shop') {
          renderShop();
        } else if (target === 'inventory') {
          renderInventory();
        }
      });
    });
    tabsInitialized = true;
  }
  if (buttons.length) {
    buttons[0].click();
  }
}

async function initRotation() {
  if (rotationInitialized) return;
  rotationInitialized = true;
  await loadAbilityCatalog();
  rotation = [...(currentCharacter.rotation || [])];
  setRotationDamageType(currentCharacter ? currentCharacter.basicType : null);
  renderAbilityPool();
  renderRotationList();
  const list = document.getElementById('rotation-list');
  list.addEventListener('dragover', handleDragOverList);
  list.addEventListener('drop', handleDrop);
  const del = document.getElementById('rotation-delete');
  del.addEventListener('dragover', e => e.preventDefault());
  del.addEventListener('drop', handleDropRemove);
  document.getElementById('save-rotation').addEventListener('click', saveRotation);
}

function renderAbilityPool() {
  const phys = document.getElementById('physical-abilities');
  const mag = document.getElementById('magical-abilities');
  phys.innerHTML = '';
  mag.innerHTML = '';
  abilityCatalog.forEach(ab => {
    const card = document.createElement('div');
    card.textContent = ab.name;
    card.className = 'ability-card';
    card.dataset.id = ab.id;
    card.draggable = true;
    card.addEventListener('dragstart', handleDragStart);
    attachTooltip(card, () => abilityTooltip(ab));
    if (ab.school === 'physical') {
      phys.appendChild(card);
    } else if (ab.school === 'magical') {
      mag.appendChild(card);
    }
  });
}

function renderRotationList() {
  const list = document.getElementById('rotation-list');
  const atBottom = list.scrollTop + list.clientHeight >= list.scrollHeight;
  const prevScroll = list.scrollTop;
  list.innerHTML = '';
  rotation.forEach((id, idx) => {
    const ability = abilityCatalog.find(a => a.id === id);
    if (!ability) return;
    const li = document.createElement('li');
    li.textContent = ability.name;
    li.dataset.id = id;
    li.dataset.index = idx;
    li.draggable = true;
    li.addEventListener('dragstart', handleDragStart);
    li.addEventListener('dblclick', () => {
      const i = parseInt(li.dataset.index, 10);
      if (i >= 0) {
        rotation.splice(i, 1);
        renderRotationList();
      }
    });
    attachTooltip(li, () => abilityTooltip(ability));
    list.appendChild(li);
  });
  list.scrollTop = atBottom ? list.scrollHeight : prevScroll;
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
    rotation.splice(data.index, 1);
    renderRotationList();
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
    const nextCharacter = { ...char, rotation: rotation.slice() };
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
  if (data.character) {
    currentCharacter = data.character;
    const idx = characters.findIndex(c => c.id === data.character.id);
    if (idx >= 0) {
      characters[idx] = data.character;
    }
    setRotationDamageType(data.character.basicType);
  }
  if (currentPlayer && typeof data.gold === 'number') {
    currentPlayer.gold = data.gold;
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
}

function launchCombatStream(url, { waitingText = 'Preparing battle...', onEnd } = {}) {
  if (!currentCharacter) return null;
  battleArea.textContent = waitingText;
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

  const createBarGroup = (dialogEl, combatantId, stats) => {
    const s = stats || {};
    return {
      health: createBar(dialogEl, `#${combatantId} .bar.health`, 'HP', s.maxHealth),
      mana: createBar(dialogEl, `#${combatantId} .bar.mana`, 'MP', s.maxMana),
      stamina: createBar(dialogEl, `#${combatantId} .bar.stamina`, 'SP', s.maxStamina),
      maxHealth: typeof s.maxHealth === 'number' ? s.maxHealth : 0,
      maxMana: typeof s.maxMana === 'number' ? s.maxMana : 0,
      maxStamina: typeof s.maxStamina === 'number' ? s.maxStamina : 0,
    };
  };

  const applyResourceState = (group, state) => {
    if (!group || !state) return;
    if (typeof state.maxHealth === 'number') group.maxHealth = state.maxHealth;
    if (typeof state.maxMana === 'number') group.maxMana = state.maxMana;
    if (typeof state.maxStamina === 'number') group.maxStamina = state.maxStamina;
    updateBar(group.health, state.health, group.maxHealth);
    updateBar(group.mana, state.mana, group.maxMana);
    updateBar(group.stamina, state.stamina, group.maxStamina);
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
            </div>
            <div id="opponent" class="combatant">
              <div class="name">${data.opponent.name}</div>
              <div class="bars">
                <div class="bar health"><div class="fill"></div><div class="label"><span class="value"></span></div></div>
                <div class="bar mana"><div class="fill"></div><div class="label"><span class="value"></span></div></div>
                <div class="bar stamina"><div class="fill"></div><div class="label"><span class="value"></span></div></div>
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
    } else if (data.type === 'error') {
      battleArea.textContent = data.message || 'Battle failed';
      if (onEnd) onEnd(null);
      es.close();
    }
  };

  return es;
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

function applyAdventureUpdates(status) {
  if (!status) return;
  let characterChanged = false;
  if (status.character && typeof status.character.id === 'number') {
    if (!currentCharacter || currentCharacter.id !== status.character.id) {
      characterChanged = true;
    } else if (
      currentCharacter.xp !== status.character.xp ||
      currentCharacter.level !== status.character.level ||
      currentCharacter.basicType !== status.character.basicType
    ) {
      characterChanged = true;
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
  let playerChanged = false;
  if (status.player && currentPlayer && status.player.id === currentPlayer.id) {
    if (currentPlayer.gold !== status.player.gold) {
      playerChanged = true;
    }
    currentPlayer.gold = status.player.gold;
    if (inventoryView) {
      inventoryView.gold = status.player.gold;
    }
  }
  if (characterChanged && isTabActive('character')) {
    renderCharacter();
  }
  if (characterChanged && isTabActive('inventory')) {
    renderInventory();
  }
  if (playerChanged && isTabActive('shop')) {
    renderShop();
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
        const entry = document.createElement('div');
        entry.className = 'adventure-event';
        if (event.type) entry.classList.add(`type-${event.type}`);
        const header = document.createElement('div');
        header.className = 'event-header';
        const dayLabel = document.createElement('span');
        dayLabel.textContent = `Day ${event.day || 1}`;
        header.appendChild(dayLabel);
        const timeLabel = document.createElement('span');
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
  try {
    const status = await fetchAdventureStatus();
    adventureElements = null;
    renderAdventureStatus(status);
    ensureAdventureTimers(status);
  } catch (err) {
    battleArea.textContent = err.message || 'Failed to load adventure.';
  }
}

// Battle modes
const battleArea = document.getElementById('battle-area');
document.querySelectorAll('#battle-modes button').forEach(btn => {
  btn.addEventListener('click', () => selectMode(btn.dataset.mode));
});

function selectMode(mode) {
  stopAdventurePolling();
  if (mode === 'matchmaking') {
    battleArea.innerHTML = '<button id="queue-match">Queue for Match</button>';
    const button = document.getElementById('queue-match');
    if (button) {
      button.addEventListener('click', () => {
        launchCombatStream(`/matchmaking/queue?characterId=${currentCharacter.id}`, {
          waitingText: 'Waiting for opponent...',
          onEnd: data => {
            if (data) updateAfterBattleEnd(data);
          },
        });
      });
    }
  } else if (mode === 'challenge') {
    renderChallengePanel();
  } else if (mode === 'adventure') {
    renderAdventurePanel();
  } else {
    battleArea.textContent = 'Mode not implemented';
  }
}

function renderOpponentPreview(opponent) {
  if (!opponent) return null;
  const container = document.createElement('div');
  container.className = 'opponent-preview';

  const header = document.createElement('div');
  header.className = 'opponent-header';
  const nameEl = document.createElement('div');
  nameEl.className = 'opponent-name';
  nameEl.textContent = opponent.name || 'Unknown';
  header.appendChild(nameEl);
  const metaEl = document.createElement('div');
  metaEl.className = 'opponent-meta';
  const typeText = displayDamageType(opponent.basicType);
  metaEl.textContent = `Lv${opponent.level || 1} Damage: ${typeText}`;
  header.appendChild(metaEl);
  container.appendChild(header);

  const attributesTable = document.createElement('table');
  attributesTable.className = 'stats-table';
  const attrHeader = document.createElement('tr');
  attrHeader.className = 'section';
  const attrHeaderCell = document.createElement('td');
  attrHeaderCell.colSpan = STAT_KEYS.length;
  attrHeaderCell.textContent = 'Attributes';
  attrHeader.appendChild(attrHeaderCell);
  attributesTable.appendChild(attrHeader);
  const attrRow = document.createElement('tr');
  STAT_KEYS.forEach(stat => {
    const cell = document.createElement('td');
    const value = opponent.attributes && opponent.attributes[stat] != null ? opponent.attributes[stat] : 0;
    cell.textContent = `${statLabel(stat)} ${value}`;
    attrRow.appendChild(cell);
  });
  attributesTable.appendChild(attrRow);
  container.appendChild(attributesTable);

  const derived = opponent.derived || {};
  const derivedTable = document.createElement('table');
  derivedTable.className = 'stats-table';
  const derivedHeader = document.createElement('tr');
  derivedHeader.className = 'section';
  const derivedHeaderCell = document.createElement('td');
  derivedHeaderCell.colSpan = 4;
  derivedHeaderCell.textContent = 'Derived Stats';
  derivedHeader.appendChild(derivedHeaderCell);
  derivedTable.appendChild(derivedHeader);

  const derivedRow1 = document.createElement('tr');
  derivedRow1.innerHTML = `<td>Health</td><td>${Math.round(derived.health || 0)}</td><td>Attack Interval</td><td>${(derived.attackIntervalSeconds || 0).toFixed(2)}s</td>`;
  derivedTable.appendChild(derivedRow1);
  const derivedRow2 = document.createElement('tr');
  derivedRow2.innerHTML = `<td>Melee</td><td>${Math.round(derived.minMeleeAttack || 0)}-${Math.round(derived.maxMeleeAttack || 0)}</td><td>Magic</td><td>${Math.round(derived.minMagicAttack || 0)}-${Math.round(derived.maxMagicAttack || 0)}</td>`;
  derivedTable.appendChild(derivedRow2);
  const derivedRow3 = document.createElement('tr');
  derivedRow3.innerHTML = `<td>Mana</td><td>${Math.round(derived.mana || 0)}</td><td>Stamina</td><td>${Math.round(derived.stamina || 0)}</td>`;
  derivedTable.appendChild(derivedRow3);
  const derivedRow4 = document.createElement('tr');
  const meleeResist = Math.round((derived.meleeResist || 0) * 100);
  const magicResist = Math.round((derived.magicResist || 0) * 100);
  derivedRow4.innerHTML = `<td>Melee Resist</td><td>${meleeResist}%</td><td>Magic Resist</td><td>${magicResist}%</td>`;
  derivedTable.appendChild(derivedRow4);
  container.appendChild(derivedTable);

  const equipmentSection = document.createElement('div');
  equipmentSection.className = 'equipment-section';
  const equipmentTitle = document.createElement('div');
  equipmentTitle.className = 'section-title';
  equipmentTitle.textContent = 'Equipment';
  equipmentSection.appendChild(equipmentTitle);
  const equipmentList = document.createElement('div');
  equipmentList.className = 'equipment-list';
  EQUIPMENT_SLOTS.forEach(slot => {
    const entry = document.createElement('div');
    entry.className = 'equipment-entry';
    const label = document.createElement('div');
    label.className = 'slot';
    label.textContent = slotLabel(slot);
    entry.appendChild(label);
    const value = document.createElement('div');
    value.className = 'value';
    const itemId = opponent.equipment ? opponent.equipment[slot] : null;
    const item = getEquipmentById(itemId);
    if (item) {
      value.textContent = item.name;
      attachTooltip(entry, () => itemTooltip(item));
    } else {
      value.textContent = 'Empty';
      entry.classList.add('empty');
    }
    entry.appendChild(value);
    equipmentList.appendChild(entry);
  });
  equipmentSection.appendChild(equipmentList);
  container.appendChild(equipmentSection);

  const rotationSection = document.createElement('div');
  rotationSection.className = 'rotation-section';
  const rotationTitle = document.createElement('div');
  rotationTitle.className = 'section-title';
  rotationTitle.textContent = 'Rotation';
  rotationSection.appendChild(rotationTitle);
  const rotationList = document.createElement('div');
  rotationList.className = 'rotation-list';
  if (Array.isArray(opponent.rotation) && opponent.rotation.length) {
    opponent.rotation.forEach(id => {
      const ability = abilityCatalog.find(a => a.id === id);
      const chip = document.createElement('span');
      chip.className = 'rotation-chip';
      chip.textContent = ability ? ability.name : `Ability ${id}`;
      if (ability) {
        attachTooltip(chip, () => abilityTooltip(ability));
      }
      rotationList.appendChild(chip);
    });
  } else {
    const placeholder = document.createElement('span');
    placeholder.className = 'rotation-chip';
    placeholder.textContent = 'No abilities';
    rotationList.appendChild(placeholder);
  }
  rotationSection.appendChild(rotationList);
  container.appendChild(rotationSection);

  return container;
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
  grid.textContent = 'Loading...';
  try {
    await ensureCatalog();
    await ensureInventory();
  } catch (err) {
    grid.textContent = 'Failed to load shop.';
    showMessage(message, err.message || 'Failed to load shop.', true);
    return;
  }
  clearMessage(message);
  grid.innerHTML = '';
  goldDiv.textContent = `Gold: ${currentPlayer ? currentPlayer.gold || 0 : 0}`;
  const items = getCatalogItems();
  if (!items.length) {
    grid.textContent = 'No items available.';
    return;
  }
  items.forEach(item => {
    const card = document.createElement('div');
    card.className = 'item-card';
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = item.name;
    card.appendChild(name);
    const meta = document.createElement('div');
    meta.className = 'meta';
    const typeText = item.type ? ` (${titleCase(item.type)})` : '';
    meta.textContent = `${item.rarity || 'Common'} • ${slotLabel(item.slot)}${typeText}`;
    card.appendChild(meta);
    const cost = document.createElement('div');
    cost.className = 'cost';
    cost.textContent = `Cost: ${item.cost || 0} Gold`;
    card.appendChild(cost);
    const owned = document.createElement('div');
    owned.className = 'owned';
    owned.textContent = `Owned: ${getOwnedCount(item.id)}`;
    card.appendChild(owned);
    const button = document.createElement('button');
    button.textContent = 'Buy';
    const price = typeof item.cost === 'number' ? item.cost : 0;
    if (!currentPlayer || (currentPlayer.gold || 0) < price) {
      button.disabled = true;
    }
    button.addEventListener('click', () => purchaseItem(item, message));
    card.appendChild(button);
    attachTooltip(card, () => itemTooltip(item));
    grid.appendChild(card);
  });
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
  const slots = document.getElementById('equipment-slots');
  const summary = document.getElementById('loadout-summary');
  if (!grid || !slots || !summary) return;
  grid.textContent = 'Loading...';
  slots.innerHTML = '';
  summary.innerHTML = '';
  try {
    await ensureInventory();
  } catch (err) {
    grid.textContent = 'Failed to load inventory.';
    showMessage(message, err.message || 'Failed to load inventory', true);
    return;
  }
  clearMessage(message);
  grid.innerHTML = '';
  const inventoryItems = Array.isArray(inventoryView.inventory) ? inventoryView.inventory : [];
  if (!inventoryItems.length) {
    const empty = document.createElement('div');
    empty.textContent = 'No gear owned yet.';
    grid.appendChild(empty);
  } else {
    inventoryItems.forEach(({ item, count }) => {
      const card = document.createElement('div');
      card.className = 'item-card';
      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = item.name;
      card.appendChild(name);
      const meta = document.createElement('div');
      meta.className = 'meta';
      const typeText = item.type ? ` (${titleCase(item.type)})` : '';
      meta.textContent = `${item.rarity || 'Common'} • ${slotLabel(item.slot)}${typeText}`;
      card.appendChild(meta);
      const countDiv = document.createElement('div');
      countDiv.className = 'owned';
      countDiv.textContent = `Count: ${count}`;
      card.appendChild(countDiv);
      const equippedItem = inventoryView.equipped && inventoryView.equipped[item.slot];
      if (equippedItem && equippedItem.id === item.id) {
        const equippedTag = document.createElement('div');
        equippedTag.className = 'meta';
        equippedTag.textContent = 'Equipped';
        card.appendChild(equippedTag);
      }
      const button = document.createElement('button');
      button.textContent = `Equip ${slotLabel(item.slot)}`;
      if (equippedItem && equippedItem.id === item.id) {
        button.disabled = true;
      }
      button.addEventListener('click', () => equipItem(item.slot, item.id, message));
      card.appendChild(button);
      attachTooltip(card, () => itemTooltip(item));
      grid.appendChild(card);
    });
  }

  slots.innerHTML = '';
  EQUIPMENT_SLOTS.forEach(slot => {
    const slotDiv = document.createElement('div');
    slotDiv.className = 'equipment-slot';
    const label = document.createElement('div');
    label.className = 'slot-name';
    label.textContent = slotLabel(slot);
    slotDiv.appendChild(label);
    const equipped = inventoryView.equipped ? inventoryView.equipped[slot] : null;
    if (equipped) {
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

  populateLoadoutSummary(summary, inventoryView.derived);
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
    const equipped = inventoryView && inventoryView.equipped ? inventoryView.equipped[slot] : null;
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
  container.appendChild(attrTable);

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
  const basic = derived.basicAttackEffectType === 'MagicDamage' ? 'Magic' : 'Physical';
  addRow('Basic Attack', basic);
  container.appendChild(derivedTable);

  const heading = document.createElement('div');
  heading.textContent = 'On-Hit Effects';
  heading.style.fontWeight = 'bold';
  container.appendChild(heading);
  const effects = Array.isArray(derived.onHitEffects) ? derived.onHitEffects : [];
  if (!effects.length) {
    const none = document.createElement('div');
    none.textContent = 'None';
    container.appendChild(none);
  } else {
    const list = document.createElement('ul');
    list.className = 'simple-list';
    effects.forEach(entry => {
      const li = document.createElement('li');
      li.textContent = describeOnHit(entry);
      list.appendChild(li);
    });
    container.appendChild(list);
  }
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
  const table = document.createElement('table');
  table.className = 'stats-table';

  const addSection = label => {
    const tr = document.createElement('tr');
    tr.className = 'section';
    const td = document.createElement('td');
    td.colSpan = 2;
    td.textContent = label;
    tr.appendChild(td);
    table.appendChild(tr);
  };

  const addRow = (label, value) => {
    const tr = document.createElement('tr');
    const l = document.createElement('td');
    l.textContent = label;
    const v = document.createElement('td');
    v.textContent = value;
    tr.appendChild(l);
    tr.appendChild(v);
    table.appendChild(tr);
  };

  addSection('Info');
  addRow('Name', currentCharacter.name);
  addRow('Level', currentCharacter.level || 1);
  addRow('XP', `${currentCharacter.xp || 0} / ${xpNeeded}`);
  addRow('Gold', currentPlayer ? currentPlayer.gold || 0 : 0);
  addRow('Damage Type', displayDamageType(currentCharacter.basicType));

  pane.appendChild(table);

  const summary = document.createElement('div');
  summary.className = 'loadout-summary';
  populateLoadoutSummary(summary, inventoryView ? inventoryView.derived : null);
  pane.appendChild(summary);

  if ((currentCharacter.xp || 0) >= xpNeeded) {
    const btn = document.createElement('button');
    btn.textContent = 'Level Up';
    btn.addEventListener('click', showLevelUpForm);
    pane.appendChild(btn);
  }
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
        currentCharacter = char;
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
  }

  updateDerived();
}
