let currentPlayer = null;
let characters = [];
let currentCharacter = null;
let abilityCatalog = [];
let rotation = [];
let rotationInitialized = false;

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
  const effectLines = ability.effects.map(e => {
    if (e.type === 'PhysicalDamage') return `Physical Damage ${e.value}`;
    if (e.type === 'MagicDamage') return `Magic Damage ${e.value}`;
    if (e.type === 'Heal') return `Heal ${e.value}`;
    if (e.type === 'BuffDamagePct') return `+${Math.round(e.amount * 100)}% Damage for ${e.duration}s`;
    if (e.type === 'Stun') return `Stun ${e.duration}s`;
    if (e.type === 'Poison') return `Poison ${e.damage} dmg/${e.interval}s for ${e.duration}s`;
    return e.type;
  }).join('<br/>');
  add('Effects', effectLines);
  return container;
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

function enterGame(character) {
  currentCharacter = character;
  charSelectDiv.classList.add('hidden');
  gameDiv.classList.remove('hidden');
  initTabs();
}

function initTabs() {
  document.querySelectorAll('#tabs button').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-tab');
      document.querySelectorAll('.tab-pane').forEach(pane => {
        pane.classList.toggle('active', pane.id === target);
      });
      if (target === 'rotation') {
        initRotation();
      }
    });
  });
  document.querySelector('#tabs button').click();
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
  list.addEventListener('dragover', e => e.preventDefault());
  list.addEventListener('drop', handleDrop);
  document.getElementById('save-rotation').addEventListener('click', saveRotation);
}

function renderAbilityPool() {
  const pool = document.getElementById('ability-pool');
  pool.innerHTML = '';
  abilityCatalog.forEach(ab => {
    const li = document.createElement('li');
    li.textContent = ab.name;
    li.dataset.id = ab.id;
    li.draggable = true;
    li.addEventListener('dragstart', handleDragStart);
    attachTooltip(li, () => abilityTooltip(ab));
    pool.appendChild(li);
  });
}

function renderRotationList() {
  const list = document.getElementById('rotation-list');
  list.innerHTML = '';
  rotation.forEach(id => {
    const ability = abilityCatalog.find(a => a.id === id);
    if (!ability) return;
    const li = document.createElement('li');
    li.textContent = ability.name;
    li.dataset.id = id;
    li.draggable = true;
    li.addEventListener('dragstart', handleDragStart);
    li.addEventListener('dblclick', () => {
      const idx = rotation.indexOf(id);
      if (idx >= 0) {
        rotation.splice(idx, 1);
        renderRotationList();
      }
    });
    attachTooltip(li, () => abilityTooltip(ability));
    list.appendChild(li);
  });
}

function handleDragStart(e) {
  e.dataTransfer.setData('text/plain', e.target.dataset.id);
}

function handleDrop(e) {
  e.preventDefault();
  const id = parseInt(e.dataTransfer.getData('text/plain'), 10);
  const list = document.getElementById('rotation-list');
  const children = Array.from(list.children);
  const target = e.target.closest('li');
  let insertIndex = children.length;
  if (target) {
    insertIndex = children.indexOf(target);
  }
  const existing = rotation.indexOf(id);
  if (existing >= 0) {
    rotation.splice(existing, 1);
    if (existing < insertIndex) insertIndex--;
  }
  rotation.splice(insertIndex, 0, id);
  renderRotationList();
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
