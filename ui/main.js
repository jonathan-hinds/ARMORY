let currentPlayer = null;
let characters = [];

const authDiv = document.getElementById('auth');
const charSelectDiv = document.getElementById('character-select');
const gameDiv = document.getElementById('game');
const nameInput = document.getElementById('player-name');
const authError = document.getElementById('auth-error');

async function postJSON(url, data) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error('request failed');
  return res.json();
}

function renderCharacters() {
  const list = document.getElementById('character-list');
  list.innerHTML = '';
  characters.forEach(c => {
    const li = document.createElement('li');
    li.textContent = `Character ${c.id} (${c.basicType})`;
    const btn = document.createElement('button');
    btn.textContent = 'Select';
    btn.addEventListener('click', () => enterGame(c));
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
  } catch {
    authError.textContent = 'Login failed';
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
  } catch {
    authError.textContent = 'Registration failed';
    authError.classList.remove('hidden');
  }
});

document.getElementById('create-character').addEventListener('click', async () => {
  try {
    const res = await fetch(`/players/${currentPlayer.id}/characters`, { method: 'POST' });
    if (!res.ok) throw new Error('create failed');
    const character = await res.json();
    characters.push(character);
    renderCharacters();
  } catch {
    console.error('character creation failed');
  }
});

function enterGame(character) {
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
    });
  });
  document.querySelector('#tabs button').click();
}
