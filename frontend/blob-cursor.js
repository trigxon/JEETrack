// blob-cursor.js — small solid pink cursor with dynamic, smooth, lag-free motion.
// Visuals and dynamics are unchanged: same 14px pink dot, same 1.6x hover
// spring, same directional stretch. The motion engine runs a *continuous*
// rAF loop while the cursor is visible so it never restarts mid-move (no
// micro-hitches when you pause and resume), and delta-time exponential
// smoothing keeps the follow constant at any refresh rate or on heavy pages.
(function(){
  // NOTE: no touch-screen bail-out here on purpose. Many laptops report
  // touch support (maxTouchPoints > 0) while still using a mouse, and on
  // those the native cursor must be hidden too. The blob only becomes
  // visible after a real mouse move, so pure touch devices are unaffected:
  // no mousemove ever fires, the dot stays invisible, and there is no
  // cursor to hide in the first place.

  const FOLLOW_RATE = 40;          // exponential smoothing rate (1/s) — near-instant, lag-free
  const STRETCH_RATE = 16;         // how quickly the dynamic stretch eases (1/s) — slower = silkier
  const MAX_DT = 0.05;             // clamp delta time (50ms) so tab switches don't cause jumps
  const MAX_STRETCH = 1.35;        // max elongation when flicking fast
  const SETTLE_EPS = 0.05;         // px threshold below which the dot is considered settled

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
  let rafId = 0;
  let lastTime = 0;
  let dirty = true;

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
    /* The pink blob replaces the native cursor entirely on devices with a
       mouse. The script aborts on touch screens, so touch devices keep the
       default behavior. */
    html, html * {
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

    if (!isVisible) {
      // Snap to the pointer on the very first move so the dot never streaks
      // across the screen from its off-screen starting position.
      currentX = mouseX;
      currentY = mouseY;
      dirty = true;
      cursor.style.opacity = '1';
      isVisible = true;
      lastTime = 0;
      startLoop();
    }
  }, { passive: true });

  document.addEventListener('mouseleave', () => {
    cursor.style.opacity = '0';
    isVisible = false;
    stopLoop();
  });

  document.addEventListener('mouseenter', () => {
    cursor.style.opacity = '1';
    isVisible = true;
    lastTime = 0;
    startLoop();
  });

  function startLoop() {
    if (!rafId) {
      rafId = requestAnimationFrame(render);
    }
  }

  function stopLoop() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
  }

  function commit() {
    if (!dirty) return;
    dirty = false;
    cursor.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
    stretch.style.transform = `scale(${stretchX.toFixed(4)}, ${stretchY.toFixed(4)})`;
  }

  // Continuous render loop: stays alive while the cursor is on screen so a
  // resumed move glides from a fully settled position without restart jank.
  function render(now) {
    rafId = 0;
    if (!isVisible) return;

    if (!lastTime) lastTime = now;
    let dt = (now - lastTime) / 1000;
    lastTime = now;
    if (dt > MAX_DT) dt = MAX_DT;

    if (dt > 0) {
      // Lag-free, frame-rate independent follow.
      const t = 1 - Math.exp(-FOLLOW_RATE * dt);
      currentX += (mouseX - currentX) * t;
      currentY += (mouseY - currentY) * t;

      // Dynamic stretch: the dot elongates slightly along the direction of
      // movement when flicking fast, then relaxes back to a perfect circle.
      const dx = mouseX - currentX;
      const dy = mouseY - currentY;
      const speed = Math.sqrt(dx * dx + dy * dy);
      const st = 1 - Math.exp(-STRETCH_RATE * dt);

      if (speed > 0.5) {
        const target = Math.min(1 + speed * 0.0045, MAX_STRETCH);
        stretchX += (1 + (target - 1) * (dx / speed) - stretchX) * st;
        stretchY += (1 + (target - 1) * (dy / speed) - stretchY) * st;
      } else {
        stretchX += (1 - stretchX) * st;
        stretchY += (1 - stretchY) * st;
      }

      // Snap exactly when fully settled so there's never residual drift.
      if (speed < SETTLE_EPS && Math.abs(stretchX - 1) < 0.002 && Math.abs(stretchY - 1) < 0.002) {
        currentX = mouseX;
        currentY = mouseY;
        stretchX = 1;
        stretchY = 1;
      }

      dirty = true;
    }

    commit();
    startLoop();
  }
})();