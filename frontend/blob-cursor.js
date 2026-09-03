// blob-cursor.js — small solid pink cursor with dynamic, lag-free motion.
// Delta-time exponential smoothing keeps the follow constant and jitter-free
// at any refresh rate; a middle "stretch" layer elongates the dot slightly in
// the direction of fast movement for a lively feel; the inner dot springs on
// interactive elements via its own composited transform.
(function(){
  // Detect touch screens. If touch is supported, abort to keep default behavior and allow normal touch interaction.
  if ('ontouchstart' in window || navigator.maxTouchPoints > 0 || navigator.msMaxTouchPoints > 0) {
    return;
  }

  const FOLLOW_RATE = 40;          // exponential smoothing rate (1/s) — near-instant, lag-free
  const STRETCH_RATE = 22;         // how quickly the dynamic stretch catches up (1/s)
  const MAX_DT = 0.05;             // clamp delta time (50ms) so tab switches don't cause jumps
  const MAX_STRETCH = 1.4;         // max elongation when flicking fast

  const cursor = document.createElement('div');
  cursor.id = 'custom-cursor';
  const stretch = document.createElement('div');
  stretch.className = 'cursor-stretch';
  const dot = document.createElement('div');
  dot.className = 'cursor-dot';
  stretch.appendChild(dot);
  cursor.appendChild(stretch);
  document.body.appendChild(cursor);

  let mouseX = -100, mouseY = -100;
  let currentX = -100, currentY = -100;
  let stretchX = 1, stretchY = 1;
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
      transition: opacity 0.25s ease;
      will-change: transform;
    }
    #custom-cursor .cursor-stretch {
      width: 0;
      height: 0;
      transform: scale(1, 1);
      will-change: transform;
    }
    #custom-cursor .cursor-dot {
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: rgba(244, 114, 182, 1);
      box-shadow: 0 0 12px rgba(244, 114, 182, 0.9), 0 0 26px rgba(244, 114, 182, 0.5);
      transform: translate3d(-50%, -50%, 0) scale(1);
      transform-origin: center;
      transition: transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.22s ease, box-shadow 0.22s ease;
      will-change: transform;
    }
    #custom-cursor.cursor-hovering .cursor-dot {
      transform: translate3d(-50%, -50%, 0) scale(1.6);
      background: rgba(251, 113, 133, 1);
      box-shadow: 0 0 16px rgba(244, 114, 182, 0.95), 0 0 34px rgba(244, 114, 182, 0.6);
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
      // Snap to the pointer on the very first move so the dot never streaks
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

    // Lag-free, frame-rate independent follow.
    const t = 1 - Math.exp(-FOLLOW_RATE * dt);
    currentX += (mouseX - currentX) * t;
    currentY += (mouseY - currentY) * t;

    // Dynamic stretch: the dot elongates slightly along the direction of
    // movement when flicking fast, then relaxes back to a perfect circle.
    const dx = mouseX - currentX;
    const dy = mouseY - currentY;
    const speed = Math.sqrt(dx * dx + dy * dy);
    const target = speed > 0.5 ? Math.min(1 + speed * 0.0045, MAX_STRETCH) : 1;
    const st = 1 - Math.exp(-STRETCH_RATE * dt);
    stretchX += ((dx / speed) * (target - 1) + 1 - stretchX) * st;
    stretchY += ((dy / speed) * (target - 1) + 1 - stretchY) * st;

    cursor.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
    stretch.style.transform = `scale(${stretchX.toFixed(4)}, ${stretchY.toFixed(4)})`;

    if (speed < 0.1 && Math.abs(stretchX - 1) < 0.01 && Math.abs(stretchY - 1) < 0.01) {
      currentX = mouseX;
      currentY = mouseY;
      stretchX = 1;
      stretchY = 1;
      isMoving = false;
    } else {
      requestAnimationFrame(render);
    }
  }
})();