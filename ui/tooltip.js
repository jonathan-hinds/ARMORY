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
      tip.appendChild(content);
      tip.classList.remove('hidden');
      position(e);
    });
    element.addEventListener('mousemove', position);
    element.addEventListener('mouseleave', () => {
      tip.classList.add('hidden');
    });
    function position(e){
      tip.style.left = e.pageX + 10 + 'px';
      tip.style.top = e.pageY + 10 + 'px';
    }
  };
})();
