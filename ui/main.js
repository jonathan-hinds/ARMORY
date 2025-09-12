async function post(path, data) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error('request failed');
  return res.json();
}

function startGame(player) {
  window.player = player;
  document.getElementById('login').classList.add('hidden');
  document.getElementById('game').classList.remove('hidden');
}

const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');

loginForm.addEventListener('submit', async e => {
  e.preventDefault();
  try {
    const data = await post('/api/login', { name: loginName.value, password: loginPass.value });
    startGame(data);
  } catch (err) {
    alert('Login failed');
  }
});

registerForm.addEventListener('submit', async e => {
  e.preventDefault();
  try {
    const data = await post('/api/register', { name: regName.value, password: regPass.value });
    startGame(data);
  } catch (err) {
    alert('Register failed');
  }
});

document.querySelectorAll('#tabs button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.add('hidden'));
    document.getElementById(btn.dataset.tab).classList.remove('hidden');
  });
});
