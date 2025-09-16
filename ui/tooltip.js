(function(){
  let tooltip;
  function ensureTooltip(){
    if (tooltip) return tooltip;
    tooltip = document.createElement('div');
    tooltip.className = 'tooltip hidden';
    document.body.appendChild(tooltip);
    return tooltip;
  }
  window.attachTooltip = function(element, contentFn){
    const tip = ensureTooltip();
    element.addEventListener('mouseenter', e => {
      const content = contentFn();
      tip.innerHTML = '';
      if (content) {
        tip.appendChild(content);
      }
      if (content && content.dataset && content.dataset.tooltipTheme) {
        tip.dataset.theme = content.dataset.tooltipTheme;
      } else {
        delete tip.dataset.theme;
      }
      if (content) {
        tip.classList.remove('hidden');
        position(e);
      } else {
        tip.classList.add('hidden');
      }
    });
    element.addEventListener('mousemove', position);
    element.addEventListener('mouseleave', () => {
      tip.classList.add('hidden');
      delete tip.dataset.theme;
    });
    function position(e){
      tip.style.left = e.pageX + 10 + 'px';
      tip.style.top = e.pageY + 10 + 'px';
    }
  };
})();
