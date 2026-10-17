// blob-cursor.js — small solid pink cursor with dynamic, smooth, lag-free motion.
// Same 14px pink dot, same 1.6x hover spring, same directional stretch.
// The glow is a pre-rendered radial-gradient layer that only ever moves and
// scales via transforms, so cursor motion never triggers a repaint — critical
// on weak GPUs where a repaint above a backdrop-filter layer re-filters the
// whole blur and reads as the cursor "hanging" (modals, glass inputs, …).
// Additional guards: while any full-screen modal (.mo.open) is up, its
// backdrop-filter blur is switched off (html.blob-perf) and the glow hides;
// if the device still sustains slow frames while moving, lite mode drops the
// glow + stretch for the session so the dot stays silky everywhere.
(function(){
  // Touch-only devices (phones/tablets): the primary pointer is a finger,
  // so there is nothing for the blob to follow — skip everything and leave
  // native behavior untouched. We deliberately do NOT bail on
  // `maxTouchPoints > 0`: many laptops report touch support while being
  // driven by a mouse, and the blob must still work there. Hybrids are
  // handled at runtime below: touching the screen hides the blob and
  // mouse events synthesized from a tap are ignored.
  if (window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse)').matches) return;

  const FOLLOW_RATE = 40;          // exponential smoothing rate (1/s) — near-instant, lag-free
  const STRETCH_RATE = 16;         // how quickly the dynamic stretch eases (1/s) — slower = silkier
  const MAX_DT = 0.05;             // clamp delta time (50ms) so tab switches don't cause jumps
  const MAX_STRETCH = 1.35;        // max elongation when flicking fast
  const SETTLE_EPS = 0.05;         // px threshold below which the dot is considered settled

  const cursor = document.createElement('div');
  cursor.id = 'custom-cursor';
  const stretch = document.createElement('div');
  stretch.className = 'cursor-stretch';
  const glow = document.createElement('div');
  glow.className = 'cursor-glow';
  const dot = document.createElement('div');
  dot.className = 'cursor-dot';
  stretch.appendChild(glow);
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
  let perfMode = false;

  // Adaptive lite mode: forceable via ?blob-lite for testing, otherwise
  // engaged automatically when sustained movement runs below ~42fps.
  let liteMode = false;
  let liteAcc = 0, liteN = 0;
  function enableLite() {
    liteMode = true;
    cursor.classList.add('cursor-lite');
    stretchX = 1; stretchY = 1;
    stretch.style.transform = 'scale(1, 1)';
  }

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
    #custom-cursor .cursor-glow {
      position: absolute;
      width: 46px;
      height: 46px;
      left: 0;
      top: 0;
      border-radius: 50%;
      background: radial-gradient(circle,
        rgba(244, 114, 182, 0.55) 0%,
        rgba(244, 114, 182, 0.28) 34%,
        rgba(244, 114, 182, 0.10) 55%,
        rgba(244, 114, 182, 0) 72%);
      transform: translate3d(-50%, -50%, 0) scale(1);
      transform-origin: center;
      transition: transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.22s ease;
      will-change: transform;
      pointer-events: none;
    }
    #custom-cursor .cursor-dot {
      position: relative;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: rgba(244, 114, 182, 1);
      transform: translate3d(-50%, -50%, 0) scale(1);
      transform-origin: center;
      transition: transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.22s ease;
      will-change: transform;
    }
    #custom-cursor.cursor-hovering .cursor-glow {
      transform: translate3d(-50%, -50%, 0) scale(1.5);
    }
    #custom-cursor.cursor-hovering .cursor-dot {
      transform: translate3d(-50%, -50%, 0) scale(1.6);
      background: rgba(251, 113, 133, 1);
    }
    /* Perf mode (engaged while a full-screen modal is open): kill the
       modal's backdrop-filter blur — recompositing a full-screen blur
       every frame is what makes the cursor (and everything else) hang on
       weaker GPUs — and hide the glow. The 80%-black backdrop keeps the
       modal looking essentially identical. */
    html.blob-perf .mo,
    html.blob-perf .mo.open {
      backdrop-filter: none !important;
      -webkit-backdrop-filter: none !important;
    }
    #custom-cursor.cursor-perf .cursor-glow {
      opacity: 0;
    }
    #custom-cursor.cursor-perf .cursor-dot {
      transition: none;
    }
    /* Lite mode (weak devices, or ?blob-lite): dot only — nearly free to
       composite on any machine, so the cursor never hangs anywhere. */
    #custom-cursor.cursor-lite .cursor-glow {
      display: none;
    }
    /* The pink blob replaces the native cursor entirely on devices with a
       mouse. Touch-only devices never run this script, so they keep the
       default behavior. */
    html, html * {
      cursor: none !important;
    }
  `;
  document.head.appendChild(style);

  if (new URLSearchParams(location.search).has('blob-lite')) enableLite();

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
    if (recentTouch()) return; // mousemove synthesized from a finger tap
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
    if (recentTouch()) return; // synthesized by a tap, not a real mouse
    cursor.style.opacity = '1';
    isVisible = true;
    lastTime = 0;
    startLoop();
  });

  // Hybrid touch screens: a finger tap makes the browser synthesize mouse
  // events right after; ignore those so the blob never pops up from touch,
  // and hide the blob if it was visible (mouse user switched to finger).
  let lastTouchAt = 0;
  function recentTouch() { return Date.now() - lastTouchAt < 1000; }
  window.addEventListener('touchstart', () => {
    lastTouchAt = Date.now();
    if (isVisible) {
      cursor.style.opacity = '0';
      isVisible = false;
      stopLoop();
    }
  }, { passive: true, capture: true });

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
    if (!liteMode) {
      stretch.style.transform = `scale(${stretchX.toFixed(4)}, ${stretchY.toFixed(4)})`;
    }
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

    // Engage/disengage perf mode as full-screen modals open and close.
    // One class-selector scan per frame is negligible; reacting inside the
    // loop means the toggle also happens while the pointer is idle.
    const pm = !!document.querySelector('.mo.open');
    if (pm !== perfMode) {
      perfMode = pm;
      cursor.classList.toggle('cursor-perf', pm);
      document.documentElement.classList.toggle('blob-perf', pm);
    }

    if (dt > 0) {
      // Lag-free, frame-rate independent follow.
      const t = 1 - Math.exp(-FOLLOW_RATE * dt);
      currentX += (mouseX - currentX) * t;
      currentY += (mouseY - currentY) * t;

      // Dynamic stretch: the dot elongates slightly along the direction of
      // movement when flicking fast, then relaxes back to a perfect circle.
      // (Skipped in lite mode — pure dot, zero extra layers to composite.)
      const dx = mouseX - currentX;
      const dy = mouseY - currentY;
      const speed = Math.sqrt(dx * dx + dy * dy);

      // Adaptive lite trigger: sampled only while actually moving, so a
      // stalled tab or a paused frame never causes a false positive.
      if (!liteMode && speed > 0.5) {
        liteAcc += dt; liteN++;
        if (liteN >= 50) {
          if (liteAcc / liteN > 0.024) enableLite();   // sustained < ~42fps
          liteAcc = 0; liteN = 0;
        }
      }

      if (!liteMode) {
        const st = 1 - Math.exp(-STRETCH_RATE * dt);
        if (speed > 0.5) {
          const target = Math.min(1 + speed * 0.0045, MAX_STRETCH);
          stretchX += (1 + (target - 1) * (dx / speed) - stretchX) * st;
          stretchY += (1 + (target - 1) * (dy / speed) - stretchY) * st;
        } else {
          stretchX += (1 - stretchX) * st;
          stretchY += (1 - stretchY) * st;
        }
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