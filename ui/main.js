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
      let youBars, oppBars, logDiv, closeBtn;
      const updateBar = (el, cur, max) => {
        el.style.width = `${Math.max(0, (cur / max) * 100)}%`;
      };
      es.onmessage = ev => {
        const data = JSON.parse(ev.data);
        if (data.type === 'start') {
          youId = data.you.id;
          const dialog = document.createElement('div');
          dialog.id = 'battle-dialog';
          dialog.innerHTML = `
            <div class="dialog-box">
              <div id="you" class="combatant">
                <div class="name">${data.you.name}</div>
                <div class="bar health"><div class="fill"></div></div>
                <div class="bar mana"><div class="fill"></div></div>
                <div class="bar stamina"><div class="fill"></div></div>
              </div>
              <div id="opponent" class="combatant">
                <div class="name">${data.opponent.name}</div>
                <div class="bar health"><div class="fill"></div></div>
                <div class="bar mana"><div class="fill"></div></div>
                <div class="bar stamina"><div class="fill"></div></div>
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
          updateBar(youBars.health, data.you.health, youBars.maxHealth);
          updateBar(youBars.mana, data.you.mana, youBars.maxMana);
          updateBar(youBars.stamina, data.you.stamina, youBars.maxStamina);
          updateBar(oppBars.health, data.opponent.health, oppBars.maxHealth);
          updateBar(oppBars.mana, data.opponent.mana, oppBars.maxMana);
          updateBar(oppBars.stamina, data.opponent.stamina, oppBars.maxStamina);
        } else if (data.type === 'update') {
          data.log.forEach(l => {
            const d = document.createElement('div');
            d.textContent = l;
            logDiv.appendChild(d);
            logDiv.scrollTop = logDiv.scrollHeight;
          });
          updateBar(youBars.health, data.you.health, youBars.maxHealth);
          updateBar(youBars.mana, data.you.mana, youBars.maxMana);
          updateBar(youBars.stamina, data.you.stamina, youBars.maxStamina);
          updateBar(oppBars.health, data.opponent.health, oppBars.maxHealth);
          updateBar(oppBars.mana, data.opponent.mana, oppBars.maxMana);
          updateBar(oppBars.stamina, data.opponent.stamina, oppBars.maxStamina);
        } else if (data.type === 'end') {
          const outcome = document.createElement('div');
          outcome.textContent = data.winnerId === youId ? 'You won!' : 'You lost!';
          logDiv.appendChild(outcome);
          logDiv.scrollTop = logDiv.scrollHeight;
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
