document.querySelectorAll('#tabs button').forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.getAttribute('data-tab');
    document.querySelectorAll('.tab-pane').forEach(pane => {
      pane.classList.toggle('active', pane.id === target);
    });
  });
});
document.querySelector('#tabs button').click();
