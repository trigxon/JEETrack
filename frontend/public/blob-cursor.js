// blob-cursor.js — small solid pink cursor with a trailing glow, built so the
// part the eye tracks (the dot) can never lag or stutter: its position is
// written synchronously on every mousemove, exactly like the native cursor.
// The soft glow is the only smoothed layer (the "blob" feel) and it moves,
// scales and fades via transforms alone — no repaints, no filters.
//
// v10 — "never glitches, never half-disappears, never hangs" overhaul:
//  - STABLE LAYER BOUNDS: the stretch wrapper is now a real 160x160 box
//    (v9 nested everything in 0x0 elements). Compositor layers with a
//    constant size never resize mid-flight, which is what made the glow
//    visibly CLIP ("half of the blob disappearing") on fast flicks when
//    stretch + hover-scale stacked up. Max extent needed: glow 46px x
//    hover 1.5 x stretch 1.35 = 93px < 160px, with margin to spare.
//  - BLUR SUSPENSION: v9 tried to dodge glass panels by hiding the glow —
//    but the DOT still moved above backdrop-filter surfaces, forcing a
//    full-surface blur re-filter every frame. That is the "hangs on the
//    home page / signup page" feel (land-nav blur(32px), auth scrim,
//    every glass panel). v10 instead SUSPENDS the backdrop-filter of the
//    panel under the pointer for exactly as long as the pointer is over
//    it (event-driven, memoized, restored on leave). The backgrounds are
//    >=72% opaque, so the visual difference is imperceptible — and the
//    GPU cost of moving above them drops to zero.
//  - THE GLOW NEVER VANISHES ANYMORE: lite mode (weak devices) used to
//    display:none the glow — one-way — so a couple of slow frames on a
//    heavy page made the blob "half disappear" for the rest of the
//    session. Lite now keeps the glow glued to the dot (no trail, no
//    rAF, near-zero cost) and its triggers were made much harder to
//    trip (6 consecutive spikes / sustained <38fps over 50 frames).
//  - NO HOVER PULSE SPAM WHILE SWEEPING: crossing interactive elements
//    at speed no longer re-triggers the 1.6x spring on every boundary —
//    hover scaling only engages when the pointer is moving slowly or
//    has arrived. This was the "glitching very much" on fast moves.
//  - Modal perf mode now covers BOTH full-screen scrims (.mo and the
//    auth modal) and strips their blur while open.
// Kept from v9: zero-lag event-driven dot, event-driven glass detection
// with WeakMap memo, scroll guard, idle sleep, touch-only skip, reduced
// motion, ?blob-lite force flag.
(function(){
  // Touch-only devices (phones/tablets): the primary pointer is a finger,
  // so there is nothing for the blob to follow — skip everything and leave
  // native behavior untouched. We deliberately do NOT bail on
  // `maxTouchPoints > 0`: many laptops report touch support while being
  // driven by a mouse, and the blob must still work there. Hybrids are
  // handled at runtime below: touching the screen hides the blob and
  // mouse events synthesized from a tap are ignored.
  if (window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse)').matches) return;

  const GLOW_RATE = 18;            // glow trail smoothing (1/s) — soft, silky tail
  const STRETCH_RATE = 16;         // how quickly the dynamic stretch eases (1/s)
  const MAX_DT = 0.05;             // clamp delta time (50ms) so stalls never snap
  const MAX_STRETCH = 1.35;        // max elongation when flicking fast
  const SNAP_DIST = 220;           // glow this far behind while pointer is STILL -> teleport
  const SETTLE_EPS = 0.05;         // px — glow settled when offsets are below this
  const IDLE_STOP_MS = 1400;       // settled + pointer idle this long -> stop rAF
  const LITE_WINDOW = 50;          // moving frames per lite-mode sample
  const LITE_MAX_DT = 0.026;       // avg dt above this (~<38fps sustained) engages lite
  const SPIKE_DT = 0.11;           // a single frame slower than this is a spike
  const SPIKES_TO_LITE = 6;        // consecutive spikes -> engage lite
  const HOVER_MAX_SPEED = 1.1;     // px/ms — above this, hover pulses stay off
  const SPEED_WINDOW_MS = 90;      // hover-speed memory window

  // Reduced motion (vestibular accessibility): a plain pink dot that sits
  // under the pointer — same instant-follow as everyone now, minus glow,
  // stretch and transitions. Zero induced motion.
  const REDUCED_MOTION = window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const cursor = document.createElement('div');
  cursor.id = 'custom-cursor';
  // 160x160 real-sized stage centered on the pointer: constant composited
  // layer bounds, so scaling the children can never clip ("half blob").
  const stretch = document.createElement('div');
  stretch.className = 'cursor-stretch';
  const glowWrap = document.createElement('div');
  glowWrap.className = 'cursor-glowwrap';
  const glow = document.createElement('div');
  glow.className = 'cursor-glow';
  const dot = document.createElement('div');
  dot.className = 'cursor-dot';
  glowWrap.appendChild(glow);
  stretch.appendChild(glowWrap);
  stretch.appendChild(dot);
  cursor.appendChild(stretch);
  document.body.appendChild(cursor);

  let mouseX = -100, mouseY = -100;
  let glowX = -100, glowY = -100;   // absolute glow position (eases toward pointer)
  let stretchX = 1, stretchY = 1;
  let prevMX = -100, prevMY = -100; // pointer position at previous frame
  let isVisible = false;
  let rafId = 0;
  let lastTime = 0;
  let lastMoveAt = 0;
  let perfMode = false;

  // Recent pointer speed (px/ms), decayed on a short window — used to keep
  // hover pulses off during fast sweeps without touching the dot's tracking.
  let speedPXms = 0;
  let lastHoverCheck = 0;
  function noteHoverSpeed(now) {
    if (lastHoverCheck) {
      const dt = Math.max(1, now - lastHoverCheck);
      const d = Math.hypot(mouseX - prevMX, mouseY - prevMY);
      const inst = d / dt;
      // decay previous value so a single fast flick doesn't stick around
      speedPXms = Math.max(inst, speedPXms * Math.exp(-dt / SPEED_WINDOW_MS));
    }
    lastHoverCheck = now;
  }
  function movingFast() { return speedPXms > HOVER_MAX_SPEED; }

  // Adaptive lite mode: forceable via ?blob-lite, otherwise engaged only on
  // SUSTAINED slowness. Lite = dot + static glow glued to the dot, fully
  // event-driven, zero continuous rAF/GPU work.
  let liteMode = false;
  let liteAcc = 0, liteN = 0, liteSpikes = 0;
  function enableLite() {
    if (liteMode) return;
    liteMode = true;
    cursor.classList.add('cursor-lite');
    stretchX = 1; stretchY = 1;
    stretch.style.transform = 'scale(1, 1)';
    glowX = mouseX; glowY = mouseY;
    glow.style.transform = 'translate3d(0, 0, 0)';
    stopLoop(); // dot is event-driven; nothing left to animate
  }

  if (REDUCED_MOTION) {
    cursor.classList.add('cursor-reduced');
    liteMode = true; // reuse the event-driven fast path
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
    /* Real-sized stage: constant composited layer bounds. Scaling radiates
       from its center, which sits exactly on the pointer. */
    #custom-cursor .cursor-stretch {
      position: absolute;
      width: 160px;
      height: 160px;
      left: -80px;
      top: -80px;
      transform: scale(1, 1);
      transform-origin: 50% 50%;
      will-change: transform;
    }
    #custom-cursor .cursor-glowwrap {
      position: absolute;
      width: 0;
      height: 0;
      left: 80px;
      top: 80px;
      transform: scale(1);
      transform-origin: center;
      transition: transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
      will-change: transform;
      pointer-events: none;
    }
    #custom-cursor.cursor-hovering .cursor-glowwrap {
      transform: scale(1.5);
    }
    #custom-cursor .cursor-glow {
      position: absolute;
      width: 46px;
      height: 46px;
      left: -23px;
      top: -23px;
      border-radius: 50%;
      background: radial-gradient(circle,
        rgba(244, 114, 182, 0.55) 0%,
        rgba(244, 114, 182, 0.28) 34%,
        rgba(244, 114, 182, 0.10) 55%,
        rgba(244, 114, 182, 0) 72%);
      transform: translate3d(0, 0, 0);
      transition: opacity 0.15s ease;
      will-change: transform;
      pointer-events: none;
    }
    #custom-cursor .cursor-dot {
      position: absolute;
      width: 14px;
      height: 14px;
      left: 73px;
      top: 73px;
      border-radius: 50%;
      background: rgba(244, 114, 182, 1);
      transform: scale(1);
      transform-origin: center;
      transition: transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.22s ease;
      will-change: transform;
    }
    #custom-cursor.cursor-hovering .cursor-dot {
      transform: scale(1.6);
      background: rgba(251, 113, 133, 1);
    }
    /* Blur suspension: the glass panel currently under the pointer gets its
       backdrop-filter removed for exactly as long as the pointer is over it.
       A moving cursor above a live blur forces a full-surface re-filter every
       frame — the single biggest cause of cursor "hanging" on pages with
       glass navs and modal scrims. These panels are >=72% opaque, so the
       visual change is imperceptible while it is active. */
    .jt-blob-noblur {
      backdrop-filter: none !important;
      -webkit-backdrop-filter: none !important;
    }
    /* Perf mode (a full-screen scrim is open): strip the scrim's blur for
       the whole time it is visible. Covers the generic .mo dialogs AND the
       auth (signup/login) modal — v9 only knew about .mo. */
    html.blob-perf .mo,
    html.blob-perf .mo.open,
    html.blob-perf .auth-modal-scrim,
    html.blob-perf .auth-modal-scrim.open {
      backdrop-filter: none !important;
      -webkit-backdrop-filter: none !important;
    }
    #custom-cursor.cursor-perf .cursor-dot {
      transition: none;
    }
    /* Scroll guard: glow hides while the page is scrolling (a moving glow
       over moving content is the classic jank moment), comes back when
       scrolling stops. The dot is event-driven and stays exact. */
    #custom-cursor.cursor-scroll .cursor-glow {
      opacity: 0;
    }
    /* Reduced motion: dot-only, no transitions, glow never rendered. */
    #custom-cursor.cursor-reduced .cursor-glow {
      display: none;
    }
    #custom-cursor.cursor-reduced .cursor-dot {
      transition: none;
    }
    /* Lite mode (weak devices, or ?blob-lite): the glow stays but is glued
       to the dot (no trail animation). The blob keeps its full look at a
       near-zero, fully event-driven cost — v9 hid the glow entirely here,
       which read as "half of the blob disappearing". */
    #custom-cursor.cursor-lite .cursor-glowwrap {
      transition: none;
    }
    #custom-cursor.cursor-lite .cursor-dot {
      transition: none;
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
  function interactiveRoot(target) {
    return target && (target instanceof Element) ? target.closest(INTERACTIVE) : null;
  }

  function addHoverClass() { cursor.classList.add('cursor-hovering'); }
  function removeHoverClass() { cursor.classList.remove('cursor-hovering'); }

  // Hover flicker fix (from v8/v9): moving between a control and its own
  // child fires mouseout on the parent then mouseover on the child. If both
  // resolve to the SAME interactive root, ignore the pair.
  const glassMemo = new WeakMap();
  // Returns the nearest ancestor carrying a backdrop-filter (the element to
  // suspend), memoized per element so sweeping over known UI costs nothing.
  function glassRootUnder(el) {
    let n = el, depth = 0;
    const chain = [];
    while (n && n !== document.documentElement && depth++ < 14) {
      const cached = glassMemo.get(n);
      if (cached !== undefined) {
        for (let i = 0; i < chain.length; i++) glassMemo.set(chain[i], cached);
        return cached;
      }
      chain.push(n);
      if (n.nodeType === 1) {
        const s = getComputedStyle(n);
        const bf = s.backdropFilter || s.webkitBackdropFilter;
        if (bf && bf !== 'none') {
          for (let i = 0; i < chain.length; i++) glassMemo.set(chain[i], n);
          return n;
        }
      }
      n = n.parentElement;
    }
    for (let i = 0; i < chain.length; i++) glassMemo.set(chain[i], null);
    return null;
  }

  // One suspended panel at a time; restored the moment the pointer leaves it.
  let suspended = null;
  function suspendGlass(el) {
    if (el === suspended) return;
    if (suspended) suspended.classList.remove('jt-blob-noblur');
    suspended = el;
    if (suspended) suspended.classList.add('jt-blob-noblur');
  }

  document.addEventListener('mouseover', (e) => {
    // Fast sweeps: skip the hover spring entirely (no pulsing while the
    // pointer is flying across menus — this was the "glitching very much").
    if (isInteractive(e.target) && !movingFast()) addHoverClass();
    if (!REDUCED_MOTION && isVisible && e.target instanceof Element) {
      suspendGlass(glassRootUnder(e.target));
    }
  });
  document.addEventListener('mouseout', (e) => {
    const from = interactiveRoot(e.target);
    if (!from) return;
    const to = interactiveRoot(e.relatedTarget);
    if (to === from) return; // still inside the same control — keep the spring
    removeHoverClass();
  });

  window.addEventListener('mousemove', (e) => {
    if (recentTouch()) return; // mousemove synthesized from a finger tap
    mouseX = e.clientX;
    mouseY = e.clientY;
    lastMoveAt = Date.now();
    noteHoverSpeed(lastMoveAt);

    if (!isVisible) {
      // Snap to the pointer on the very first move so nothing ever streaks
      // across the screen from an off-screen starting position.
      prevMX = mouseX; prevMY = mouseY;
      glowX = mouseX; glowY = mouseY;
      glow.style.transform = 'translate3d(0, 0, 0)';
      cursor.style.opacity = '1';
      isVisible = true;
      lastTime = 0;
    }

    // THE core: the dot position is written synchronously, right here,
    // at mouse-event speed. No rAF wait, no easing — the dot is exactly
    // where the pointer is, on every event, even if the rAF loop is stalled.
    cursor.style.transform = `translate3d(${mouseX}px, ${mouseY}px, 0)`;

    if (liteMode) {
      // Event-driven mode: the glow is glued to the dot (its transform was
      // reset on enable), stretch is neutral — literally nothing left to
      // animate. Zero continuous work, full blob look.
      return;
    }

    startLoop(); // wakes/keeps the glow+stretch animation loop
  }, { passive: true });

  document.addEventListener('mouseleave', () => {
    cursor.style.opacity = '0';
    isVisible = false;
    lastTime = 0;
    stopLoop();
    suspendGlass(null);
    removeHoverClass();
  });

  document.addEventListener('mouseenter', () => {
    if (recentTouch()) return; // synthesized by a tap, not a real mouse
    cursor.style.opacity = '1';
    isVisible = true;
    lastTime = 0;
    // Snap the glow to the pointer on re-entry — it may have been frozen
    // mid-trail while the pointer was outside the window.
    if (!liteMode) {
      glowX = mouseX; glowY = mouseY;
      glow.style.transform = 'translate3d(0, 0, 0)';
      startLoop();
    }
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
      lastTime = 0;
      stopLoop();
      suspendGlass(null);
      removeHoverClass();
    }
  }, { passive: true, capture: true });

  // Scroll guard: any scrolling (wheel, momentum, keyboard, scrollbar drag,
  // scroll-into-view) briefly hides the glow. The dot is event-driven and
  // stays exact through all of it.
  let scrollHideTimer = 0;
  window.addEventListener('scroll', () => {
    if (liteMode || REDUCED_MOTION || !isVisible) return;
    cursor.classList.add('cursor-scroll');
    clearTimeout(scrollHideTimer);
    scrollHideTimer = setTimeout(() => cursor.classList.remove('cursor-scroll'), 150);
  }, { passive: true, capture: true });

  function startLoop() {
    if (!rafId) {
      rafId = requestAnimationFrame(render);
    }
  }

  function stopLoop() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
  }

  // Continuous loop — only animates the GLOW trail and the stretch. The dot
  // never waits for this loop. Once the glow is fully settled and the
  // pointer rests ~1.4s, the loop stops entirely (idle sleep); the next
  // mousemove restarts it with a clean dt so there is never a resume jump.
  function render(now) {
    rafId = 0;
    if (!isVisible || liteMode) return;

    if (!lastTime) lastTime = now;
    let dt = (now - lastTime) / 1000;
    lastTime = now;
    if (dt > MAX_DT) dt = MAX_DT;

    let settled = false;

    if (dt > 0) {
      // Pointer velocity for this frame (drives stretch + lite detection).
      const mvx = mouseX - prevMX;
      const mvy = mouseY - prevMY;
      prevMX = mouseX; prevMY = mouseY;
      const speed = Math.sqrt(mvx * mvx + mvy * mvy);

      // Adaptive lite trigger: sampled only while actually moving, and much
      // harder to trip than v9 (6 consecutive spikes, or sustained <38fps
      // across 50 moving frames) so a GC pause pair can't kill the trail.
      if (!REDUCED_MOTION && speed > 0.5) {
        liteAcc += dt; liteN++;
        if (dt > SPIKE_DT) {
          liteSpikes++;
          if (liteSpikes >= SPIKES_TO_LITE) { enableLite(); return; }
        } else {
          liteSpikes = 0;
        }
        if (liteN >= LITE_WINDOW) {
          if (liteAcc / liteN > LITE_MAX_DT) { enableLite(); return; }
          liteAcc = 0; liteN = 0;
        }
      }

      // Glow trail: exponential ease toward the pointer, frame-rate
      // independent, with a hard snap if it ever falls too far behind.
      const t = 1 - Math.exp(-GLOW_RATE * dt);
      glowX += (mouseX - glowX) * t;
      glowY += (mouseY - glowY) * t;

      // Dynamic stretch: elongates slightly along the movement direction
      // when flicking fast, then relaxes back to a perfect circle.
      if (speed > 0.5 && (mvx !== 0 || mvy !== 0)) {
        const target = Math.min(1 + speed * 0.0045, MAX_STRETCH);
        const nx = mvx / speed, ny = mvy / speed;
        const st = 1 - Math.exp(-STRETCH_RATE * dt);
        stretchX += (1 + (target - 1) * nx - stretchX) * st;
        stretchY += (1 + (target - 1) * ny - stretchY) * st;
      } else {
        const st = 1 - Math.exp(-STRETCH_RATE * dt);
        stretchX += (1 - stretchX) * st;
        stretchY += (1 - stretchY) * st;
      }

      // Stall snap: if the pointer has been STILL for >120ms and the glow
      // is still far away (rAF was frozen by a tab stall / GC pause /
      // alt-tab), teleport it instead of gliding across the page. While the
      // pointer is actively moving we NEVER snap — long soft trails on fast
      // flicks are the intended blob feel, and snapping mid-flick would
      // itself read as a glitch.
      const gdx = mouseX - glowX, gdy = mouseY - glowY;
      const gapSq = gdx * gdx + gdy * gdy;
      if (gapSq > SNAP_DIST * SNAP_DIST && Date.now() - lastMoveAt > 120) {
        glowX = mouseX; glowY = mouseY;
      }

      // Snap exactly when fully settled so there's never residual drift.
      if (Math.abs(gdx) < SETTLE_EPS && Math.abs(gdy) < SETTLE_EPS
          && Math.abs(stretchX - 1) < 0.002 && Math.abs(stretchY - 1) < 0.002) {
        glowX = mouseX; glowY = mouseY;
        stretchX = 1; stretchY = 1;
        settled = true;
      }

      glow.style.transform = `translate3d(${(glowX - mouseX).toFixed(2)}px, ${(glowY - mouseY).toFixed(2)}px, 0)`;
      stretch.style.transform = `scale(${stretchX.toFixed(4)}, ${stretchY.toFixed(4)})`;
    }

    // Idle sleep: fully settled and the pointer hasn't moved in a while —
    // stop burning rAF/GPU cycles. Modal perf mode keeps working via the
    // housekeeping timer below; the dot keeps following via mousemove.
    if (settled && Date.now() - lastMoveAt > IDLE_STOP_MS) {
      lastTime = 0;
      return;
    }
    startLoop();
  }

  // ---- 300ms housekeeping: modal perf mode only ----
  // A single pair of classList queries — no style flush, no layout,
  // trivial at any frequency. Covers every full-screen scrim in the app.
  setInterval(() => {
    const pm = !!document.querySelector('.mo.open, .auth-modal-scrim.open');
    if (pm !== perfMode) {
      perfMode = pm;
      cursor.classList.toggle('cursor-perf', pm);
      document.documentElement.classList.toggle('blob-perf', pm);
    }
  }, 300);
})();
