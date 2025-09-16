let currentPlayer = null;
let characters = [];
let currentCharacter = null;
let abilityCatalog = [];
let rotation = [];
let rotationInitialized = false;

const EQUIPMENT_SLOTS = ['weapon', 'helmet', 'chest', 'legs', 'feet', 'hands'];
const SLOT_LABELS = {
  weapon: 'Weapon',
  helmet: 'Helmet',
  chest: 'Chest',
  legs: 'Legs',
  feet: 'Feet',
  hands: 'Hands',
};

let equipmentCatalog = null;
let catalogPromise = null;
let inventoryView = null;
let inventoryPromise = null;
let tabsInitialized = false;

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
      return data;
    })().finally(() => {
      catalogPromise = null;
    });
  }
  return catalogPromise;
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
    info.textContent = `${name} Lv${c.level || 1} (${c.basicType}) - STR:${stats.strength} STA:${stats.stamina} AGI:${stats.agility} INT:${stats.intellect} WIS:${stats.wisdom}`;
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
  const res = await fetch('/abilities');
  abilityCatalog = await res.json();
  rotation = [...(currentCharacter.rotation || [])];
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
    errorDiv.textContent = 'Need at least 3 abilities';
    errorDiv.classList.remove('hidden');
    return;
  }
  fetch(`/characters/${currentCharacter.id}/rotation`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rotation })
  }).then(res => {
    if (!res.ok) throw new Error('save failed');
    return res.json();
  }).then(char => {
    currentCharacter.rotation = rotation.slice();
    const idx = characters.findIndex(c => c.id === char.id);
    if (idx >= 0) characters[idx] = char;
    errorDiv.textContent = 'Saved';
    errorDiv.classList.remove('hidden');
  }).catch(() => {
    errorDiv.textContent = 'Save failed';
    errorDiv.classList.remove('hidden');
  });
}

// Battle modes
const battleArea = document.getElementById('battle-area');
document.querySelectorAll('#battle-modes button').forEach(btn => {
  btn.addEventListener('click', () => selectMode(btn.dataset.mode));
});

function selectMode(mode) {
  if (mode === 'matchmaking') {
    battleArea.innerHTML = '<button id="queue-match">Queue for Match</button>';
    document.getElementById('queue-match').addEventListener('click', () => {
      battleArea.innerHTML = 'Waiting for opponent...';
      const es = new EventSource(`/matchmaking/queue?characterId=${currentCharacter.id}`);
      let youId = null;
      let opponentId = null;
      let youBars, oppBars, logDiv, closeBtn, appendLogEntry;
      const updateBar = (el, cur, max) => {
        el.style.width = `${Math.max(0, (cur / max) * 100)}%`;
      };
      es.onmessage = ev => {
        const data = JSON.parse(ev.data);
        if (data.type === 'start') {
          youName = data.you.name;
          opponentName = data.opponent.name;
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
                    <div class="bar health"><div class="fill"></div></div>
                    <div class="bar mana"><div class="fill"></div></div>
                    <div class="bar stamina"><div class="fill"></div></div>
                  </div>
                </div>
                <div id="opponent" class="combatant">
                  <div class="name">${data.opponent.name}</div>
                  <div class="bars">
                    <div class="bar health"><div class="fill"></div></div>
                    <div class="bar mana"><div class="fill"></div></div>
                    <div class="bar stamina"><div class="fill"></div></div>
                  </div>
                </div>
              </div>
              <div id="battle-log"></div>
              <div class="dialog-buttons"><button id="battle-close" class="hidden">Close</button></div>
            </div>`;
          document.body.appendChild(dialog);
          youBars = {
            health: dialog.querySelector('#you .health .fill'),
            mana: dialog.querySelector('#you .mana .fill'),
            stamina: dialog.querySelector('#you .stamina .fill'),
            maxHealth: data.you.maxHealth,
            maxMana: data.you.maxMana,
            maxStamina: data.you.maxStamina,
          };
          oppBars = {
            health: dialog.querySelector('#opponent .health .fill'),
            mana: dialog.querySelector('#opponent .mana .fill'),
            stamina: dialog.querySelector('#opponent .stamina .fill'),
            maxHealth: data.opponent.maxHealth,
            maxMana: data.opponent.maxMana,
            maxStamina: data.opponent.maxStamina,
          };
          logDiv = dialog.querySelector('#battle-log');
          closeBtn = dialog.querySelector('#battle-close');
          closeBtn.addEventListener('click', () => {
            dialog.remove();
          });
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
          if (youBars) {
            updateBar(youBars.health, data.you.health, youBars.maxHealth);
            updateBar(youBars.mana, data.you.mana, youBars.maxMana);
            updateBar(youBars.stamina, data.you.stamina, youBars.maxStamina);
          }
          if (oppBars) {
            updateBar(oppBars.health, data.opponent.health, oppBars.maxHealth);
            updateBar(oppBars.mana, data.opponent.mana, oppBars.maxMana);
            updateBar(oppBars.stamina, data.opponent.stamina, oppBars.maxStamina);
          }
        } else if (data.type === 'update') {
          if (appendLogEntry && Array.isArray(data.log)) {
            data.log.forEach(l => appendLogEntry(l));
          }
          if (youBars) {
            updateBar(youBars.health, data.you.health, youBars.maxHealth);
            updateBar(youBars.mana, data.you.mana, youBars.maxMana);
            updateBar(youBars.stamina, data.you.stamina, youBars.maxStamina);
          }
          if (oppBars) {
            updateBar(oppBars.health, data.opponent.health, oppBars.maxHealth);
            updateBar(oppBars.mana, data.opponent.mana, oppBars.maxMana);
            updateBar(oppBars.stamina, data.opponent.stamina, oppBars.maxStamina);
          }
        } else if (data.type === 'end') {
          const win = data.winnerId === youId;
          if (appendLogEntry) {
            appendLogEntry({ message: win ? 'Victory!' : 'Defeat...' }, 'neutral');
            appendLogEntry({ message: `+${data.xpGain} XP, +${data.gpGain} GP` }, 'neutral');
          }
          currentCharacter = data.character;
          const idx = characters.findIndex(c => c.id === data.character.id);
          if (idx >= 0) characters[idx] = data.character;
          currentPlayer.gold = data.gold;
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
          closeBtn.classList.remove('hidden');
          es.close();
        } else if (data.type === 'error') {
          battleArea.textContent = data.message;
          es.close();
        }
      };
    });
  } else {
    battleArea.textContent = 'Mode not implemented';
  }
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
  addRow('Basic Type', currentCharacter.basicType);

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
