// blob-cursor.js
(function(){
  // Detect touch screens. If touch is supported, abort to keep default behavior and allow normal touch interaction.
  if ('ontouchstart' in window || navigator.maxTouchPoints > 0 || navigator.msMaxTouchPoints > 0) {
    return;
  }

  // Near-instant (lag-free) but still silky: a high exponential smoothing
  // rate computed from delta time, so the pink dot tracks the pointer almost
  // 1:1 with a whisper of easing and no per-frame jitter, at any refresh
  // rate or on heavy pages where frames get dropped.
  const FOLLOW_RATE = 40;          // exponential smoothing rate (1/s) — higher = tighter follow
  const MAX_DT = 0.05;             // clamp delta time (50ms) so tab switches don't cause jumps

  const cursor = document.createElement('div');
  cursor.id = 'custom-cursor';
  const dot = document.createElement('div');
  dot.className = 'cursor-dot';
  cursor.appendChild(dot);
  document.body.appendChild(cursor);

  let mouseX = -100, mouseY = -100;
  let currentX = -100, currentY = -100;
  let isVisible = false;
  let isMoving = false;
  let lastTime = 0;
  let started = false;

  const style = document.createElement('style');
  style.textContent = `
    #custom-cursor {
      position: fixed;
      top: 0;
      left: 0;
      width: 0;
      height: 0;
      pointer-events: none;
      z-index: 2147483647;
      transform: translate3d(-100px, -100px, 0);
      opacity: 0;
      transition: opacity 0.3s ease;
      will-change: transform;
    }
    #custom-cursor .cursor-dot {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: rgba(168, 85, 247, 1);
      box-shadow: 0 0 12px rgba(168, 85, 247, 0.9), 0 0 28px rgba(168, 85, 247, 0.45);
      transform: translate3d(-50%, -50%, 0) scale(1);
      transform-origin: center;
      transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275), background 0.2s ease, box-shadow 0.2s ease;
      will-change: transform;
    }
    #custom-cursor.cursor-hovering .cursor-dot {
      transform: translate3d(-50%, -50%, 0) scale(1.5);
      background: rgba(168, 85, 247, 0.85);
      box-shadow: 0 0 18px rgba(168, 85, 247, 0.9), 0 0 40px rgba(168, 85, 247, 0.55);
    }
    html.mouse-active, html.mouse-active * {
      cursor: none !important;
    }
  `;
  document.head.appendChild(style);

  const INTERACTIVE = 'a, button, input, select, textarea, label, [role="button"], .ob-opt, .btn';

  function isInteractive(target) {
    return target && (target instanceof Element) && target.closest(INTERACTIVE);
  }

  function addHoverClass() { cursor.classList.add('cursor-hovering'); }
  function removeHoverClass() { cursor.classList.remove('cursor-hovering'); }

  document.addEventListener('mouseover', (e) => {
    if (isInteractive(e.target)) addHoverClass();
  });

  document.addEventListener('mouseout', (e) => {
    if (isInteractive(e.target)) removeHoverClass();
  });

  window.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;

    if (!started) {
      // Snap to the pointer on the very first move so the blob never streaks
      // across the screen from its off-screen starting position.
      currentX = mouseX;
      currentY = mouseY;
      cursor.style.transform = `translate3d(${mouseX}px, ${mouseY}px, 0)`;
      started = true;
    }

    if (!isVisible) {
      document.documentElement.classList.add('mouse-active');
      cursor.style.opacity = '1';
      isVisible = true;
    }

    if (!isMoving) {
      isMoving = true;
      lastTime = 0;
      requestAnimationFrame(render);
    }
  }, { passive: true });

  document.addEventListener('mouseleave', () => {
    cursor.style.opacity = '0';
    isVisible = false;
    document.documentElement.classList.remove('mouse-active');
  });

  document.addEventListener('mouseenter', () => {
    cursor.style.opacity = '1';
    isVisible = true;
    document.documentElement.classList.add('mouse-active');
  });

  function render(now) {
    if (!lastTime) lastTime = now;
    let dt = (now - lastTime) / 1000;
    lastTime = now;
    if (dt > MAX_DT) dt = MAX_DT;

    // Frame-rate independent exponential smoothing: the blob moves the same
    // distance per unit of time, so it never speeds up or stutters when the
    // page is heavy (tables, charts, animations) and frames get dropped.
    const t = 1 - Math.exp(-FOLLOW_RATE * dt);
    currentX += (mouseX - currentX) * t;
    currentY += (mouseY - currentY) * t;

    cursor.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;

    const dx = mouseX - currentX;
    const dy = mouseY - currentY;

    if (Math.abs(dx) < 0.1 && Math.abs(dy) < 0.1) {
      currentX = mouseX;
      currentY = mouseY;
      isMoving = false;
    } else {
      requestAnimationFrame(render);
    }
  }
})();