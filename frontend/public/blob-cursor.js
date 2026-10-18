// blob-cursor.js — small solid pink cursor with a trailing glow, built so the
// part the eye tracks (the dot) can never lag or stutter: its position is
// written synchronously on every mousemove, exactly like the native cursor.
// The soft glow is the only smoothed layer (the "blob" feel) and it moves,
// scales and fades via transforms alone — no repaints, no filters.
//
// v9 — "butterly smooth everywhere" overhaul (user still felt v8 glitching):
//  - Zero-lag dot: v8 eased the dot toward the pointer (~4 frames behind on
//    fast flicks — reads as glitch/stutter). v9 writes the dot position
//    directly inside the mousemove handler, so the dot is glued to the
//    pointer at event speed even if rAF stalls. The GLOW now does the
//    trailing, which is where a soft delay looks intentional, not broken.
//  - Event-driven glass detection: v8 walked getComputedStyle ancestors at
//    5Hz — a forced style recalc on a timer is a periodic frame spike while
//    moving (the "glitch every few hundred ms" feel). v9 checks only on
//    mouseover (element boundary crossings) with a WeakMap memo, so it costs
//    nothing while moving over already-seen UI and nothing while idle.
//  - Scroll guard: a 46px glow compositing over scrolling content is the
//    classic jank moment — the glow now fades out for 150ms during any
//    scroll and returns when scrolling stops. The dot stays exact.
//  - Lite mode is now event-driven only: on weak devices the rAF loop stops
//    entirely and the cursor costs literally zero continuous CPU/GPU.
//  - Streak snap: if the glow ever falls >160px behind (tab stall, alt-tab,
//    hiccup), it teleports instead of streaking across the screen.
// Kept from v8: hover same-root flicker fix, modal perf mode (backdrop blur
// off while a modal is open), idle sleep, touch-only skip, reduced motion,
// ?blob-lite force flag.
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
  const LITE_WINDOW = 30;          // moving frames per lite-mode sample
  const LITE_MAX_DT = 0.030;       // avg dt above this (~<33fps) engages lite
  const SPIKE_DT = 0.11;           // a single frame slower than this is a spike
  const SPIKES_TO_LITE = 2;        // consecutive spikes -> engage lite immediately

  // Reduced motion (vestibular accessibility): a plain pink dot that sits
  // under the pointer — same instant-follow as everyone now, minus glow,
  // stretch and transitions. Zero induced motion.
  const REDUCED_MOTION = window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const cursor = document.createElement('div');
  cursor.id = 'custom-cursor';
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

  // Adaptive lite mode: forceable via ?blob-lite, otherwise engaged
  // automatically when sustained movement runs below ~33fps (or on
  // repeated frame spikes). Lite = dot only, fully event-driven, no rAF.
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
    #custom-cursor .cursor-stretch {
      width: 0;
      height: 0;
      transform: scale(1, 1);
      will-change: transform;
    }
    #custom-cursor .cursor-glowwrap {
      position: absolute;
      width: 0;
      height: 0;
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
      left: -7px;
      top: -7px;
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
    /* Glass-aware glow: pointer is above a backdrop-filter surface — hide
       the glow so the GPU never re-filters the blur while it moves. The
       dot (14px) stays: tiny composite area, negligible over any blur. */
    #custom-cursor.cursor-nogl .cursor-glow {
      opacity: 0;
    }
    /* Scroll guard: glow hides while the page is scrolling (a moving glow
       over moving content is the classic jank moment), comes back when
       scrolling stops. */
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
  function interactiveRoot(target) {
    return target && (target instanceof Element) ? target.closest(INTERACTIVE) : null;
  }

  function addHoverClass() { cursor.classList.add('cursor-hovering'); }
  function removeHoverClass() { cursor.classList.remove('cursor-hovering'); }

  // Hover flicker fix (kept from v8): moving between a control and its own
  // child (icon, label span, svg…) fires mouseout on the parent then
  // mouseover on the child. If both resolve to the SAME interactive root,
  // ignore the pair — otherwise the 1.6x spring transition re-starts on
  // every boundary and reads as a pulse while sweeping across dense UI.
  // The glass check rides along on mouseover: it only ever runs when the
  // pointer crosses into a different element (never on a timer, never
  // while sweeping inside one element), and results are memoized per
  // element in a WeakMap so re-crossing known UI is free.
  const glassMemo = new WeakMap();
  function glassUnder(el) {
    let n = el, depth = 0;
    const chain = [];
    while (n && n !== document.documentElement && depth++ < 14) {
      const cached = glassMemo.get(n);
      if (cached !== undefined) {
        for (let i = 0; i < chain.length; i++) glassMemo.set(chain[i], cached);
        return cached;
      }
      chain.push(n);
      const s = getComputedStyle(n);
      const bf = s.backdropFilter || s.webkitBackdropFilter;
      if (bf && bf !== 'none') {
        for (let i = 0; i < chain.length; i++) glassMemo.set(chain[i], true);
        return true;
      }
      n = n.parentElement;
    }
    for (let i = 0; i < chain.length; i++) glassMemo.set(chain[i], false);
    return false;
  }
  let glassOn = false;
  function setGlass(on) {
    if (on === glassOn) return;
    glassOn = on;
    cursor.classList.toggle('cursor-nogl', on);
  }

  document.addEventListener('mouseover', (e) => {
    if (isInteractive(e.target)) addHoverClass();
    if (!liteMode && !REDUCED_MOTION && isVisible && e.target instanceof Element) {
      setGlass(glassUnder(e.target));
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

    // THE core of v9: the dot position is written synchronously, right here,
    // at mouse-event speed. No rAF wait, no easing — the dot is exactly
    // where the pointer is, on every event, even if the rAF loop is stalled.
    cursor.style.transform = `translate3d(${mouseX}px, ${mouseY}px, 0)`;

    if (liteMode) {
      // Event-driven mode: glow and stretch don't exist, so there is
      // literally nothing left to animate. Zero continuous work.
      return;
    }

    if (glassOn) {
      // The pointer just moved on a glass surface — the element under it
      // may have changed between boundary events (hover popups). mouseover
      // will catch real crossings; nothing per-move here on purpose.
    }

    startLoop(); // wakes/keeps the glow+stretch animation loop
  }, { passive: true });

  document.addEventListener('mouseleave', () => {
    cursor.style.opacity = '0';
    isVisible = false;
    lastTime = 0;
    stopLoop();
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

      // Adaptive lite trigger: sampled only while actually moving, so a
      // stalled tab or a paused frame never causes a false positive.
      if (!REDUCED_MOTION && speed > 0.5) {
        liteAcc += dt; liteN++;
        if (dt > SPIKE_DT) {
          liteSpikes++;
          if (liteSpikes >= SPIKES_TO_LITE) { enableLite(); return; }
        } else {
          liteSpikes = 0;
        }
        if (liteN >= LITE_WINDOW) {
          if (liteAcc / liteN > LITE_MAX_DT) { enableLite(); return; }  // sustained < ~33fps
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

  // ---- 300ms housekeeping: modal perf mode only (v9) ----
  // v8 also ran its glass walk here; glass detection is now event-driven
  // (mouseover + WeakMap memo). What remains is a single classList query —
  // no style flush, no layout, trivial at any frequency.
  setInterval(() => {
    const pm = !!document.querySelector('.mo.open');
    if (pm !== perfMode) {
      perfMode = pm;
      cursor.classList.toggle('cursor-perf', pm);
      document.documentElement.classList.toggle('blob-perf', pm);
    }
  }, 300);
})();
