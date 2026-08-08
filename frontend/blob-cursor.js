// blob-cursor.js
(function() {
  const cursor = document.createElement('div');
  cursor.className = 'blob-cursor';
  document.body.appendChild(cursor);

  let mouseX = window.innerWidth / 2;
  let mouseY = window.innerHeight / 2;
  let cursorX = mouseX;
  let cursorY = mouseY;
  
  // No touch device checks - just run it for mouse movement
  document.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
  });
  
  // Custom requestAnimationFrame loop for ultimate smoothness
  function render() {
    // Interpolation factor
    cursorX += (mouseX - cursorX) * 0.15;
    cursorY += (mouseY - cursorY) * 0.15;
    
    // Apply translate3d instead of left/top for GPU acceleration
    cursor.style.transform = `translate3d(${cursorX}px, ${cursorY}px, 0)`;
    
    requestAnimationFrame(render);
  }
  
  // Start loop
  requestAnimationFrame(render);

  // Inject styles for the blob cursor
  const style = document.createElement('style');
  style.innerHTML = `
    body * { cursor: none !important; }
    .blob-cursor {
      position: fixed;
      top: 0;
      left: 0;
      width: 16px;
      height: 16px;
      margin-left: -8px;
      margin-top: -8px;
      border-radius: 50%;
      background: rgba(25, 25, 25, 0.95);
      box-shadow: 0 0 10px rgba(0, 0, 0, 0.9), 0 0 20px rgba(0, 0, 0, 0.7), inset 0 0 0 1px rgba(255, 255, 255, 0.1);
      pointer-events: none;
      z-index: 999999;
      will-change: transform;
    }
  `;
  document.head.appendChild(style);
})();
