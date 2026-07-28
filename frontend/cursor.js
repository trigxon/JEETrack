(function(){
  const cursor = document.createElement('div');
  cursor.id = 'custom-cursor';
  document.body.appendChild(cursor);
  
  let mouseX = -100, mouseY = -100;
  let currentX = -100, currentY = -100;
  let isVisible = false;
  let isMoving = false;
  
  const style = document.createElement('style');
  style.innerHTML = `
    #custom-cursor {
      position: fixed; 
      top: 0; 
      left: 0; 
      width: 20px; 
      height: 20px;
      border-radius: 50%; 
      background: rgba(168, 85, 247, 1);
      box-shadow: 0 0 15px rgba(168, 85, 247, 1), 0 0 30px rgba(168, 85, 247, 1);
      pointer-events: none; 
      z-index: 2147483647; 
      transform: translate3d(-100px, -100px, 0);
      opacity: 0;
      transition: opacity 0.2s ease, width 0.2s, height 0.2s;
      will-change: transform;
    }
    html.mouse-active, html.mouse-active *, .mouse-active *, .mouse-active body, .mouse-active a, .mouse-active button, .mouse-active input, .mouse-active textarea, .mouse-active select { 
      cursor: none !important; 
    }
    
    a:hover ~ #custom-cursor, button:hover ~ #custom-cursor, .ob-opt:hover ~ #custom-cursor {
      width: 30px !important;
      height: 30px !important;
      background: rgba(168, 85, 247, 0.5);
      box-shadow: 0 0 20px rgba(168, 85, 247, 1);
    }
  `;
  document.head.appendChild(style);

  window.addEventListener('mousemove', (e) => {
    mouseX = e.clientX; mouseY = e.clientY;
    if (!isVisible) {
      document.documentElement.classList.add('mouse-active');
      document.body.classList.add('mouse-active');
      cursor.style.opacity = '1';
      isVisible = true;
    }
    if (!isMoving) {
      isMoving = true;
      requestAnimationFrame(render);
    }
  }, { passive: true });

  document.addEventListener('mouseleave', () => {
    cursor.style.opacity = '0';
    isVisible = false;
    document.documentElement.classList.remove('mouse-active');
    document.body.classList.remove('mouse-active');
  });
  
  document.addEventListener('mouseenter', () => {
    cursor.style.opacity = '1';
    isVisible = true;
    document.documentElement.classList.add('mouse-active');
    document.body.classList.add('mouse-active');
  });
  
  function render() {
    currentX += (mouseX - currentX) * 0.35; 
    currentY += (mouseY - currentY) * 0.35;
    cursor.style.transform = `translate3d(${currentX - 10}px, ${currentY - 10}px, 0)`;
    
    const dx = mouseX - currentX;
    const dy = mouseY - currentY;
    
    if (Math.abs(dx) < 0.1 && Math.abs(dy) < 0.1) {
      isMoving = false;
    } else {
      requestAnimationFrame(render);
    }
  }
})();
