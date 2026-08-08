// blob-cursor.js
(function() {
  // Detect touch screens. If touch is supported, abort to keep default behavior and allow normal touch interaction.
  if ('ontouchstart' in window || navigator.maxTouchPoints > 0 || navigator.msMaxTouchPoints > 0) {
    return;
  }

  const cursor = document.createElement('div');
  cursor.className = 'blob-cursor';
  document.body.appendChild(cursor);

  let mouseX = window.innerWidth / 2;
  let mouseY = window.innerHeight / 2;
  let cursorX = mouseX;
  let cursorY = mouseY;
  
  document.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
  });
  
  // Custom requestAnimationFrame loop for ultimate smoothness
  function render() {
    // Interpolation factor increased to 0.85 for ultra-high sensitivity (nearly instantaneous)
    cursorX += (mouseX - cursorX) * 0.85;
    cursorY += (mouseY - cursorY) * 0.85;
    
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
      width: 28px;
      height: 28px;
      margin-left: -14px;
      margin-top: -14px;
      border-radius: 50%;
      background: #a855f7;
      box-shadow: 0 0 20px 10px rgba(168, 85, 247, 0.6), 0 0 40px 20px rgba(168, 85, 247, 0.3), 0 0 60px 30px rgba(168, 85, 247, 0.1);
      pointer-events: none;
      z-index: 999999;
      will-change: transform;
    }
  `;
  document.head.appendChild(style);
})();
