// blob-cursor.js
(function(){
  // Detect touch screens. If touch is supported, abort to keep default behavior and allow normal touch interaction.
  if ('ontouchstart' in window || navigator.maxTouchPoints > 0 || navigator.msMaxTouchPoints > 0) {
    return;
  }

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
      width: 14px; 
      height: 14px;
      border-radius: 50%; 
      background: rgba(124, 106, 247, 1);
      box-shadow: 0 0 15px rgba(124, 106, 247, 0.8), 0 0 35px rgba(124, 106, 247, 0.6);
      pointer-events: none; 
      z-index: 2147483647; 
      transform: translate3d(-100px, -100px, 0);
      opacity: 0;
      transition: opacity 0.3s ease, width 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275), height 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275), background 0.3s ease, box-shadow 0.3s ease;
      will-change: transform, width, height;
      backdrop-filter: blur(1px);
    }
    html.mouse-active, html.mouse-active *, .mouse-active *, .mouse-active body, .mouse-active a, .mouse-active button, .mouse-active input, .mouse-active textarea, .mouse-active select { 
      cursor: none !important; 
    }
    
    a:hover ~ #custom-cursor, button:hover ~ #custom-cursor, .ob-opt:hover ~ #custom-cursor,
    a:hover + #custom-cursor, button:hover + #custom-cursor,
    :hover > #custom-cursor {
      width: 24px !important;
      height: 24px !important;
      background: rgba(244, 114, 182, 0.95);
      box-shadow: 0 0 25px rgba(244, 114, 182, 0.9), 0 0 45px rgba(244, 114, 182, 0.7);
    }
  `;
  document.head.appendChild(style);

  // Use a global class on hover elements to trigger the cursor expansion reliably
  const addHoverClass = () => cursor.classList.add('cursor-hovering');
  const removeHoverClass = () => cursor.classList.remove('cursor-hovering');
  
  // Alternative to CSS combinators which can be flaky: add a class to the cursor when hovering over interactive elements
  style.innerHTML += `
    #custom-cursor.cursor-hovering {
      width: 26px !important;
      height: 26px !important;
      background: rgba(244, 114, 182, 0.95) !important;
      box-shadow: 0 0 25px rgba(244, 114, 182, 0.9), 0 0 45px rgba(244, 114, 182, 0.7) !important;
      margin-left: -6px;
      margin-top: -6px;
    }
  `;

  document.addEventListener('mouseover', (e) => {
    const target = e.target;
    if (target.tagName === 'A' || target.tagName === 'BUTTON' || target.closest('a') || target.closest('button') || target.classList.contains('ob-opt') || target.tagName === 'INPUT' || target.tagName === 'SELECT') {
      addHoverClass();
    }
  });
  
  document.addEventListener('mouseout', (e) => {
    const target = e.target;
    if (target.tagName === 'A' || target.tagName === 'BUTTON' || target.closest('a') || target.closest('button') || target.classList.contains('ob-opt') || target.tagName === 'INPUT' || target.tagName === 'SELECT') {
      removeHoverClass();
    }
  });

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
    // Smooth trailing effect (lowered from 0.35 to 0.15)
    currentX += (mouseX - currentX) * 0.15; 
    currentY += (mouseY - currentY) * 0.15;
    cursor.style.transform = "translate3d(" + (currentX - 7) + "px, " + (currentY - 7) + "px, 0)";
    
    const dx = mouseX - currentX;
    const dy = mouseY - currentY;
    
    if (Math.abs(dx) < 0.1 && Math.abs(dy) < 0.1) {
      isMoving = false;
    } else {
      requestAnimationFrame(render);
    }
  }
})();
