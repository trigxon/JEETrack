// blob-cursor.js v19 — "touch-glow + self-heal".
//
//  12. THE MOBILE LAW (7th usability report: "the blob is still not
//      functioning, using the blob i cant click anything" — sent from the
//      phone). On a touch-only device the v18 gate skipped init ENTIRELY:
//      mobile had NO blob at all. "Not functioning" was literal. v19 gives
//      touch its own blob — the touch-glow module below: it appears where
//      the finger lands, tracks it synchronously (the v16 zero-lag law),
//      squeezes on press, springs back with a pop on release, and fades the
//      instant the finger lifts. Pure decoration: passive listeners,
//      pointer-events:none on every layer, no cursor classes, nothing
//      intercepted — it CANNOT affect a tap, only decorate it. A watchdog
//      fade guarantees a stuck mobile dot is impossible.
//      Desktop keeps v18 exactly as verified (36/36 + live: the blob IS the
//      cursor behind the proof-of-life gate; touchstart on hybrids still
//      hides it and restores the arrow).
//
//  13. SUPPORT SELF-HEAL — the root cause of reports #8-#10 was stale
//      engines (SW/HTTP cache lag), invisible from the outside. v19 exposes
//      window.__BLOB_CURSOR_VERSION + a console badge, and the admin panel
//      gained an engine chip that compares the served blob-cursor.js
//      against the page's own ?v= reference and offers a one-tap SW
//      repair (purge caches + update + reload) when they disagree.
//
// v18 history — "true-cursor, proven-alive": cursor:none restored but
// scoped to html.blob-live * (!important, every element); gate opens only
// in wake(true) after a real pointermove painted the dot; hideNow() strips
// it on every hide path; mouse-event fallback for ancient browsers;
// GLOW_OMEGA 16->24.
//
//  11. THE OWNERSHIP LAW (6th usability report: "the blob is only seen but
//      not functioning, as the old desktop mouse is also coming with it").
//      v17's always-visible arrow made the blob decoration — the owner
//      rejected that: the blob IS the cursor of this site. The aim failures
//      of v13-v15 were real, but v16's fix (dot = pointer, painted
//      synchronously in the event) already removes their cause — and the
//      timeline shows the user never actually received v16 (their reports
//      #8/#9 arrived on stale engines; #10's visible arrow proves they
//      finally got v17). So v18 restores the swap, but EARNS it:
//
//        THE BLOB IS THE CURSOR — BUT ONLY WHILE THE ENGINE IS PROVABLY
//        ALIVE ON THIS DEVICE. THE MOMENT ANYTHING IS ANOMALOUS, THE
//        NATIVE CURSOR RETURNS. IF THE ENGINE NEVER PROVES ALIVE, THE
//        NATIVE CURSOR IS NEVER HIDDEN AT ALL.
//
//      The gate is the proof-of-life mechanism that already exists:
//      html.blob-live is added ONLY inside wake(true) — i.e. after a real
//      pointermove has painted the dot — and hideNow() removes it on every
//      hide path (mouseleave, touchstart, tab switch). cursor:none is now
//      scoped to `html.blob-live *` with !important so NO element-level
//      cursor style (buttons, links, inputs — "the old desktop mouse is
//      also coming with it") can resurrect the arrow over the very things
//      the user is trying to click. A device where pointer events never
//      fire never gets blob-live, so it keeps its native cursor forever;
//      ancient browsers without PointerEvent fall back to mouse events so
//      the gate can still open there. Worst case on ANY device is a
//      missing decoration, never a missing pointer.
//      Also: GLOW_OMEGA 16→24 — the pink mass hugs the aim point tighter
//      (steady trail at a 300px/s glide: ~26px, was ~39px), so even a user
//      who aims the mass rather than the bright dot lands their click.
//
//  10. THE USABILITY LAW (5th usability report). v17 removed the swap
//      entirely (native cursor always visible, blob = decoration) after
//      v16's zero-lag dot still drew a "can't click" report. Superseded
//      by law 11, but its defense-in-depth is kept: pointer-events:none is
//      set INLINE on every blob layer (container + both stages) in
//      addition to CSS, killing any old-engine composited-layer
//      pointer-events inheritance bug.
//
// v16 — "aim-true": the dot IS the pointer.
//
//  9. AIM MISMATCH — the real "I can't use it to click anything" defect.
//     v11's spring rebuild put the DOT on a position spring (omega=150): at
//     real hand speeds the visible dot trailed the true pointer by
//     ~13px per 1000px/s of hand speed, and the glow by ~190px per 1000px/s
//     (steady-state trail = 2*zeta/omega * v). The native cursor was hidden
//     (cursor:none), so the user aimed the PINK MASS at a button and
//     clicked — but the click lands at the TRUE pointer, dozens of px ahead
//     of the blob they were looking at. Miss, retry, miss: "the blob is
//     malfunctioning a lot, I can't click anything". v9 already knew the
//     law ("dot written synchronously in mousemove — zero lag by
//     construction"); v16 restores it as the prime directive:
//
//       THE DOT'S POSITION IS THE POINTER'S POSITION. ALWAYS. SYNCHRONOUSLY.
//
//     pointermove/pointerdown paint the dot stage INLINE in the event (no
//     rAF round-trip, no spring state to lag). Every drop of liquid feel is
//     kept: the glow trail spring (tightened omega 11→16 so the pink mass
//     hugs the aim point instead of lagging a third of the screen behind),
//     velocity stretch + rotation, and the underdamped pop/press scale
//     springs. Aim is native-exact; the blob flows around it.
//
// v15 — "pointer never disappears": v14's pop engine and its
// four hardening fixes are kept exactly as shipped; v15 fixed the ONE defect
// class the live adversarial probe confirmed (the real "malfunction"):
//
//  5. INVISIBLE POINTER — v13/v14 added html.blob-live (cursor:none) the
//     moment the blob first showed, but NEVER removed it on hide paths. After
//     mouseleave (pointer leaves the window / recorder overlay / second
//     monitor), a touchstart on hybrid laptops, or a tab switch, the blob was
//     hidden while cursor:none STILL applied — the user had NO pointer at
//     all until they happened to move again. v15: every hide path goes
//     through hideNow(), which removes blob-live and hands control back to
//     the native cursor the instant the blob is not on screen. Re-shown on
//     the next real pointer move (blob-live re-added only when visible).
//  6. Stale pop — v14 senses hover only on pointer travel, so DOM changing
//     under a STILL popped pointer (SPA view switch, modal opening, element
//     removal) left the blob big forever. v15: the 300ms housekeeping tick
//     re-verifies a popped target and relaxes it when the element is gone.
//     A still pointer over a real target never pulses — the check only
//     corrects popped→flat, never flat→popped.
//  7. Touch dead-zone — touchstart still swallows mouse moves for 1s (this
//     filters Chrome's synthesized compatibility events), but the native
//     cursor is now RESTORED during the swallow, so a hybrid-laptop user is
//     never pointerless.
//  8. Sweep hysteresis — the v14 speed gate computed speed per frame, so a
//     momentary zero-delta frame mid-sweep (hand hesitation, discrete event
//     bursts) opened the gate and flashed a pop. v15: crossing the speed
//     limit holds the gate shut for 90ms; only a genuine stop opens it.
//
// v14 history — scroll relaxes hover + 250ms pop suppression (no wheel
// breathing), hover sensed ONLY on pointer travel (no phantom pulsing),
// release/cancel/blur wakes the spring, non-primary buttons excluded, mild
// speed gate restored, ?blob-off escape hatch.
//
// v13 history — "pop + no outline": white ring deleted (soft glow shadows
// only), underdamped scale spring (omega=24, zeta=0.5, ~16% overshoot) for
// hover + press, cursor:none gated on html.blob-live (never pointerless).

// ---- v19 TOUCH-GLOW ------------------------------------------------------
// The mobile blob (header note 12). Appears at the finger on contact, tracks
// it synchronously while it moves (zero lag by construction — the same law
// as the desktop dot), squeezes on press, springs back with a small pop on
// release, and dissolves ~140ms after lift. Guarantees:
//   - pointer-events:none inline on every layer; listeners passive — it can
//     never intercept or delay a tap;
//   - no html.blob-live, no cursor styles — the desktop cursor-swap can
//     never leak into touch;
//   - hide on up/cancel/leave/tab-hide + a 2.5s watchdog — a stuck mobile
//     dot is impossible (the v15 lesson, enforced structurally).
function initTouchGlow(){
  'use strict';
  if (window.__jtTouchGlow) return;
  window.__jtTouchGlow = true;
  if (!document.body) {
    document.addEventListener('DOMContentLoaded', initTouchGlow, { once: true });
    return;
  }

  const REDUCED = window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const wrap = document.createElement('div');
  wrap.id = 'jt-touch-glow';
  const glowStage = document.createElement('div');
  glowStage.className = 'tg-glow-stage';
  const glow = document.createElement('div');
  glow.className = 'tg-glow';
  glowStage.appendChild(glow);
  const dotStage = document.createElement('div');
  dotStage.className = 'tg-dot-stage';
  const dot = document.createElement('div');
  dot.className = 'tg-dot';
  dotStage.appendChild(dot);
  wrap.appendChild(glowStage);
  wrap.appendChild(dotStage);
  document.body.appendChild(wrap);
  wrap.style.pointerEvents = 'none';
  glowStage.style.pointerEvents = 'none';
  dotStage.style.pointerEvents = 'none';

  const style = document.createElement('style');
  style.textContent = `
    #jt-touch-glow {
      position: fixed; top: 0; left: 0; width: 0; height: 0;
      pointer-events: none; z-index: 2147483646;
      opacity: 0; transition: opacity 0.3s ease;
    }
    #jt-touch-glow.tg-on { opacity: 1; }
    #jt-touch-glow .tg-dot-stage {
      position: absolute; width: 76px; height: 76px;
      left: -38px; top: -38px; will-change: transform;
    }
    #jt-touch-glow .tg-dot {
      position: absolute; width: 18px; height: 18px;
      left: 29px; top: 29px; border-radius: 50%;
      background: rgba(244, 114, 182, 1);
      transform-origin: 50% 50%; will-change: transform;
      box-shadow:
        0 2px 12px rgba(244, 114, 182, 0.85),
        0 0 26px rgba(244, 114, 182, 0.40);
    }
    #jt-touch-glow .tg-glow-stage {
      position: absolute; width: 192px; height: 192px;
      left: -96px; top: -96px; will-change: transform;
    }
    #jt-touch-glow .tg-glow {
      position: absolute; width: 64px; height: 64px;
      left: 64px; top: 64px; border-radius: 50%;
      background: radial-gradient(circle,
        rgba(244, 114, 182, 0.50) 0%,
        rgba(244, 114, 182, 0.26) 34%,
        rgba(244, 114, 182, 0.09) 55%,
        rgba(244, 114, 182, 0) 72%);
      transform-origin: 50% 50%; will-change: transform;
    }
  `;
  document.head.appendChild(style);

  const dpr = () => Math.max(1, window.devicePixelRatio || 1);
  const snap = (v) => Math.round(v * dpr()) / dpr();
  const DOT_HALF = 38, GLOW_HALF = 96;
  const GLOW_OMEGA = 22, GLOW_ZETA = 1.05;   // same hair-overdamped trail
  const SCALE_OMEGA = 22, SCALE_ZETA = 0.5;  // same underdamped pop
  const PRESS = 0.82, MAX_DT = 0.05;

  let pid = null;                    // tracked pointer/touch id
  let visible = false, fadeTimer = 0;
  let mx = -300, my = -300;
  let gx = -300, gy = -300, gvx = 0, gvy = 0;
  let scale = 1, scaleVel = 0, target = 1;
  let rafId = 0, lastT = 0;

  // Same stability-guaranteed integrator as the desktop engine.
  function springStep(pos, vel, tgt, omega, zeta, dt) {
    let n = Math.ceil((dt * omega) / 0.75);
    if (n < 1) n = 1;
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      const a = omega * omega * (tgt - pos) - 2 * zeta * omega * vel;
      vel += a * h;
      pos += vel * h;
    }
    return [pos, vel];
  }

  function paintDot() {
    dotStage.style.transform =
      `translate3d(${snap(mx) - DOT_HALF}px, ${snap(my) - DOT_HALF}px, 0)`;
  }
  function paintGlow() {
    glowStage.style.transform =
      `translate3d(${snap(gx) - GLOW_HALF}px, ${snap(gy) - GLOW_HALF}px, 0)`;
  }

  function show(x, y, id) {
    pid = id;
    mx = gx = x; my = gy = y; gvx = gvy = 0;
    scale = 0.6; scaleVel = 0; target = PRESS;  // born small, pops in
    clearTimeout(fadeTimer);
    if (!visible) { visible = true; wrap.classList.add('tg-on'); }
    paintDot(); paintGlow();
    wake();
  }
  function move(x, y) {
    mx = x; my = y;
    paintDot();                    // zero lag, the prime directive
    wake();
  }
  function lift() {
    pid = null;
    target = 1.45;                 // release pop (springs over, fades out)
    clearTimeout(fadeTimer);
    fadeTimer = setTimeout(hide, 140);
    wake();
  }
  function hide() {
    visible = false;
    wrap.classList.remove('tg-on');
  }
  function wake() {
    if (!rafId && visible && !REDUCED) {
      lastT = 0;
      rafId = requestAnimationFrame(render);
    }
  }
  function render(now) {
    rafId = 0;
    if (!visible) return;
    if (!lastT) lastT = now;
    let dt = (now - lastT) / 1000;
    lastT = now;
    if (dt > MAX_DT) dt = MAX_DT;
    if (dt <= 0) { rafId = requestAnimationFrame(render); return; }

    [gx, gvx] = springStep(gx, gvx, mx, GLOW_OMEGA, GLOW_ZETA, dt);
    [gy, gvy] = springStep(gy, gvy, my, GLOW_OMEGA, GLOW_ZETA, dt);
    [scale, scaleVel] = springStep(scale, scaleVel, target, SCALE_OMEGA, SCALE_ZETA, dt);
    target += (1 - target) * (1 - Math.exp(-9 * dt)); // release pop decays to rest

    paintGlow();
    dot.style.transform = `scale(${scale.toFixed(4)})`;
    glow.style.transform = `scale(${(scale * 1.06).toFixed(4)})`;
    rafId = requestAnimationFrame(render);
  }

  const hasPE = typeof window.PointerEvent === 'function';
  if (hasPE) {
    window.addEventListener('pointerdown', (e) => {
      if (pid !== null) return;                 // already tracking a finger
      if (e.pointerType === 'mouse') return;    // a real mouse on a hybrid
      show(e.clientX, e.clientY, e.pointerId);
    }, { passive: true, capture: true });
    window.addEventListener('pointermove', (e) => {
      if (e.pointerId !== pid) return;
      move(e.clientX, e.clientY);
    }, { passive: true });
    const end = (e) => { if (e.pointerId === pid) lift(); };
    window.addEventListener('pointerup', end, { passive: true });
    window.addEventListener('pointercancel', end, { passive: true });
  } else {
    window.addEventListener('touchstart', (e) => {
      const t = e.changedTouches && e.changedTouches[0];
      if (t) show(t.clientX, t.clientY, t.identifier);
    }, { passive: true, capture: true });
    window.addEventListener('touchmove', (e) => {
      const t = e.changedTouches && e.changedTouches[0];
      if (t) move(t.clientX, t.clientY);
    }, { passive: true });
    window.addEventListener('touchend', lift, { passive: true });
    window.addEventListener('touchcancel', lift, { passive: true });
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) hide(); });
  // Watchdog: anything anomalous that leaves the glow visible with no live
  // pointer for one tick gets faded. Belt and braces over the 140ms timer.
  setInterval(() => { if (visible && pid === null) hide(); }, 2500);
}

(function(){
  'use strict';

  // Support marker (see header note 13): the admin engine chip reads this
  // out of the SERVED file and compares it with the ?v= the page loaded.
  window.__BLOB_CURSOR_VERSION = 'v20';
  try {
    console.info('%c\u25C8 JEE ADV OSINT \u2014 cursor engine v20 (touch-glow)',
      'color:#f472b6;font-weight:700');
  } catch (e) {}

  // Escape hatch: ?blob-off runs the page with the native cursor and no blob
  // at all (debugging / personal preference). Nothing is created or hidden.
  if (new URLSearchParams(location.search).has('blob-off')) return;

  // Touch-only devices: the desktop cursor-swap must never run here (a
  // finger has no hover and cursor semantics are meaningless), but the blob
  // itself SHOULD live here — v19's touch-glow module. It builds its own
  // DOM, never touches html.blob-live, and hides on every lift.
  if (window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse)').matches) {
    initTouchGlow();
    return;
  }

  // ---- tuning ------------------------------------------------------------
  // v16: the dot has NO position spring — its position IS the pointer's
  // position, painted synchronously in the event (zero lag by construction,
  // the v9 law). Only the glow springs.
  const GLOW_OMEGA  = 24;    // glow trail stiffness — still the flowing blob
                             // feel, but the mass hugs the aim point (steady
                             // trail = 2*zeta/omega * speed: ~26px at a
                             // 300px/s glide, was ~39px at omega=16)
  const GLOW_ZETA   = 1.05;  // hair overdamped: no rubber-band wobble
  const SCALE_OMEGA = 24;    // hover/press scale spring stiffness
  const SCALE_ZETA  = 0.5;   // UNDERDAMPED: ~16% overshoot = the pop
  const GLOW_SCALE_ZETA = 0.6; // glow pops slightly calmer
  const MAX_DT      = 0.05;  // clamp frame delta (50ms) — stalls never explode
  const STRETCH_MAX = 0.42;  // max elongation (+42% along motion)
  const STRETCH_GAIN = 0.00016; // px/s of glow velocity → stretch amount
  const STRETCH_ON  = 90;    // px/s: glow speed above which stretch engages
  const ANGLE_RATE  = 14;    // 1/s — velocity-angle smoothing
  const VEL_SMOOTH  = 10;    // 1/s — glow-velocity smoothing for stretch
  const IDLE_MS     = 1200;  // at rest this long → sleep rAF
  const HOVER_MIN_MOVE = 2;  // px pointer travel before hover re-evaluation
  const HOVER_SLOW_PXMS = 1.5; // px/ms — pointer faster than this relaxes, no pops
  const FAST_HOLD_MS = 90;   // hysteresis: once fast, gate stays shut 90ms — a
                             // momentary zero-delta frame mid-sweep (hand
                             // hesitation, discrete event bursts) can never
                             // flash a pop; only a REAL stop opens the gate
  const SCROLL_SUPPRESS_MS = 250; // ms after any scroll: hover stays relaxed
  const HOVER_DOT   = 1.65;  // dot scale target while on interactive elements
  const HOVER_GLOW  = 1.40;  // glow scale target while hovering
  const PRESS_DOT   = 0.82;  // dot scale while pointer is down
  const PRESS_GLOW  = 0.90;  // glow scale while pointer is down

  const REDUCED_MOTION = window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const FORCE_LITE = new URLSearchParams(location.search).has('blob-lite');
  // Lite / reduced: dot glued to the pointer (event-driven), no glow, no loop.
  const LITE = FORCE_LITE || REDUCED_MOTION;

  // ---- DOM: two fixed-size stages, one transform write per layer per frame
  // v17: pointer-events:none is set INLINE on every layer as well as in CSS —
  // belt and braces against old-engine composited-layer inheritance bugs.
  const cursor = document.createElement('div');
  cursor.id = 'custom-cursor';
  const dotStage = document.createElement('div');
  dotStage.className = 'jt-dot-stage';
  const dot = document.createElement('div');
  dot.className = 'jt-dot';
  dotStage.appendChild(dot);
  const glowStage = document.createElement('div');
  glowStage.className = 'jt-glow-stage';
  const glow = document.createElement('div');
  glow.className = 'jt-glow';
  glowStage.appendChild(glow);
  if (!LITE) cursor.appendChild(glowStage);
  cursor.appendChild(dotStage);
  document.body.appendChild(cursor);
  cursor.style.pointerEvents = 'none';
  dotStage.style.pointerEvents = 'none';
  glowStage.style.pointerEvents = 'none';

  const style = document.createElement('style');
  style.textContent = `
    #custom-cursor {
      position: fixed; top: 0; left: 0; width: 0; height: 0;
      pointer-events: none; z-index: 2147483647;
      transform: translate3d(-200px, -200px, 0);
      opacity: 0; transition: opacity 0.2s ease;
    }
    #custom-cursor.blob-on { opacity: 1; }
    /* Fixed-size compositor stages — constant layer bounds, transform-only. */
    #custom-cursor .jt-dot-stage {
      position: absolute; width: 72px; height: 72px;
      left: -36px; top: -36px; will-change: transform;
    }
    /* 17px dot, NO outline/ring (user request). Visibility comes from size
       plus layered soft glow shadows — soft edges never read as an outline
       and cannot shimmer in compressed screen recordings. */
    #custom-cursor .jt-dot {
      position: absolute; width: 17px; height: 17px;
      left: 27.5px; top: 27.5px; border-radius: 50%;
      background: rgba(244, 114, 182, 1);
      transform-origin: 50% 50%; will-change: transform;
      box-shadow:
        0 2px 12px rgba(244, 114, 182, 0.85),
        0 0 26px rgba(244, 114, 182, 0.40);
    }
    #custom-cursor .jt-glow-stage {
      position: absolute; width: 192px; height: 192px;
      left: -96px; top: -96px; will-change: transform;
    }
    #custom-cursor .jt-glow {
      position: absolute; width: 56px; height: 56px;
      left: 68px; top: 68px; border-radius: 50%;
      background: radial-gradient(circle,
        rgba(244, 114, 182, 0.55) 0%,
        rgba(244, 114, 182, 0.28) 34%,
        rgba(244, 114, 182, 0.10) 55%,
        rgba(244, 114, 182, 0) 72%);
      transform-origin: 50% 50%; will-change: transform;
    }
    /* Full-screen scrim perf mode: strip the blur for the whole time a
       modal/auth sheet is open. Static state — no toggling while open. */
    html.blob-perf .mo, html.blob-perf .mo.open,
    html.blob-perf .auth-modal-scrim, html.blob-perf .auth-modal-scrim.open {
      backdrop-filter: none !important;
      -webkit-backdrop-filter: none !important;
    }
    /* v18 THE TRUE-CURSOR LAW: while the blob is provably alive and on
       screen (html.blob-live) it IS the cursor. The rule must cover EVERY
       element — a bare html{cursor:none} is silently overridden by the
       site's own button/link/input cursor styles, which resurrects the
       native arrow over exactly the things the user is trying to click
       ("the old desktop mouse is also coming with it"). The gate is
       proof-of-life: blob-live is only added after a real pointermove
       painted the dot, and hideNow() strips it on every hide path — a
       device where tracking never worked keeps its native cursor forever. */
    html.blob-live, html.blob-live *,
    html.blob-live *::before, html.blob-live *::after {
      cursor: none !important;
    }
  `;
  document.head.appendChild(style);

  // ---- device-pixel snapping ---------------------------------------------
  // Fractional translate3d coordinates make the compositor resample a small
  // layer every frame — a barely-visible shimmer. Snapping to the device
  // pixel grid makes the dot rock-solid at any DPI.
  let dpr = Math.max(1, window.devicePixelRatio || 1);
  window.addEventListener('resize', () => { dpr = Math.max(1, window.devicePixelRatio || 1); }, { passive: true });
  const snap = (v) => Math.round(v * dpr) / dpr;

  // ---- state -------------------------------------------------------------
  let mx = -200, my = -200;         // pointer target (client px)
  let pmx = -200, pmy = -200;       // pointer at previous frame
  let havePointer = false;
  let visible = false;
  let rafId = 0, lastT = 0, lastMoveAt = 0;

  // dot spring
  let dx = -200, dy = -200, dvx = 0, dvy = 0;
  // glow spring
  let gx = -200, gy = -200, gvx = 0, gvy = 0;
  // stretch + angle (driven by glow velocity)
  let stretch = 0, angle = 0, vSmooth = 0;
  // hover + press scale springs (with velocity — that's what makes a pop)
  let dotScale = 1, dotScaleVel = 0;
  let glowScale = 1, glowScaleVel = 0;
  let hoverTarget = 1;   // 1 or HOVER_DOT/HOVER_GLOW
  let press = 1;         // 1 or PRESS_DOT/PRESS_GLOW

  const DOT_STAGE_HALF = 36, GLOW_STAGE_HALF = 96;

  // ---- spring integrator (semi-implicit Euler, stability-guaranteed) -----
  // For zeta near 1 symplectic Euler's error eigenvalue crosses |lambda|=1 at
  // omega*h = 0.91. Substep h is DERIVED from omega (omega*h = 0.75,
  // comfortably inside the stable region) and never capped, so even the
  // stiffest spring here stays within a handful of trivial substeps at
  // MAX_DT. Stability is a property of the scheme, not of the frame rate —
  // slow frames can never make the cursor explode. Same integrator for the
  // glow position AND the scale springs.
  function springStep(pos, vel, target, omega, zeta, dt) {
    let n = Math.ceil((dt * omega) / 0.75);
    if (n < 1) n = 1;
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      const a = omega * omega * (target - pos) - 2 * zeta * omega * vel;
      vel += a * h;
      pos += vel * h;
    }
    return [pos, vel];
  }

  // ---- THE v16 PRIME DIRECTIVE -------------------------------------------
  // The dot's position is the pointer's position, painted SYNCHRONOUSLY in
  // the event — no rAF round-trip, no spring state. A click can never land
  // anywhere but exactly under the dot the user is aiming with.
  function paintDot() {
    dotStage.style.transform =
      `translate3d(${snap(mx) - DOT_STAGE_HALF}px, ${snap(my) - DOT_STAGE_HALF}px, 0)`;
  }

  // ---- events: store + paint dot + wake ----------------------------------
  // v18: browsers without PointerEvent fall back to mouse events — the same
  // handlers drive the same paths, so the proof-of-life gate still opens
  // there. A browser with NEITHER event model never shows the blob, and
  // since blob-live is only added by a tracked pointermove, its native
  // cursor is never hidden either.
  const hasPE = typeof window.PointerEvent === 'function';
  const EV_MOVE = hasPE ? 'pointermove' : 'mousemove';
  const EV_DOWN = hasPE ? 'pointerdown' : 'mousedown';
  const EV_UP   = hasPE ? 'pointerup' : 'mouseup';
  window.addEventListener(EV_MOVE, (e) => {
    if (recentTouch()) return;
    mx = e.clientX; my = e.clientY;
    lastMoveAt = performance.now();
    // Zero lag BY CONSTRUCTION: dot = pointer, painted inline, every event,
    // even while the render loop is asleep.
    dx = mx; dy = my; dvx = dvy = 0;
    paintDot();
    // First contact OR re-show after any hide path (mouseleave, touch,
    // recording overlays eating events): snap the GLOW to the FRESH position
    // and show. This is what makes "cursor disappeared forever" impossible.
    if (!havePointer || !visible) {
      havePointer = true;
      gx = mx; gy = my;
      gvx = gvy = 0;
      pmx = mx; pmy = my;
      wake(true);
    } else {
      wake(false);
    }
  }, { passive: true });

  // Press pop: squeeze on down, springy release on up. Pure state — the
  // loop does the animation; if it is asleep, wake it so the squeeze shows.
  window.addEventListener(EV_DOWN, (e) => {
    if (recentTouch() || (e.button !== undefined && e.button !== 0)) return;
    press = PRESS_DOT;
    lastMoveAt = performance.now();
    if (e.clientX || e.clientY) { mx = e.clientX; my = e.clientY; dx = mx; dy = my; }
    paintDot(); // the dot is EXACTLY under the click point at click time
    wake(false);
  }, { passive: true, capture: true });
  window.addEventListener(EV_UP, () => { press = 1; wake(false); }, { passive: true });
  if (hasPE) window.addEventListener('pointercancel', () => { press = 1; wake(false); }, { passive: true });
  // Alt-tab / window switch while holding a button: release the squeeze so
  // the blob can never come back stuck small.
  window.addEventListener('blur', () => { press = 1; }, { passive: true });

  // Scroll: RELAX hover and suppress re-popping for a beat (native-OS
  // style). v13 re-sensed what was under the still pointer after every
  // scroll, so wheeling popped the blob in/out rhythmically — reads as a
  // malfunction. Now scroll clears hover, and no new pops until the pointer
  // itself moves again.
  let lastScrollAt = -1e9;
  window.addEventListener('scroll', () => {
    lastScrollAt = performance.now();
    hoverTarget = 1;
    wake(false);
  }, { passive: true, capture: true });

  function wake(showNow) {
    if (showNow && !visible) {
      visible = true;
      cursor.classList.add('blob-on');
      // From this instant on the blob is provably on screen (state marker
      // only — the native cursor was never hidden and stays visible).
      document.documentElement.classList.add('blob-live');
    }
    if (!rafId && visible && !LITE) {
      rafId = requestAnimationFrame(render);
    }
  }

  // THE v18 CONTRACT: blob-live (and with it cursor:none on every element)
  // exists ONLY while the blob is provably on screen and tracking — it is
  // added in wake(true), which is only reachable from a real pointermove
  // that just painted the dot. Every hide path (mouseleave, touchstart,
  // tab switch) calls hideNow(), which strips blob-live the same instant
  // the blob leaves — the native cursor is back before the user can miss
  // it. A device where pointer events never fire never gets blob-live at
  // all: worst case is a missing decoration, never a missing pointer.
  function hideNow() {
    visible = false;
    cursor.classList.remove('blob-on');
    document.documentElement.classList.remove('blob-live');
  }

  if (!LITE) {
    document.addEventListener('mouseleave', () => {
      hideNow();
      stopLoop();
    });
    document.addEventListener('mouseenter', () => {
      if (recentTouch()) return;
      // Re-arm first-contact: the next real pointermove snaps the blob to the
      // FRESH position and shows it. Snapping to the stale mx here would dart
      // the dot across the screen for a frame (mx is the pre-leave position).
      havePointer = false;
    });
    // Hybrid touch screens: finger down hides the blob (and restores the
    // native cursor); synthesized mouse events within 1s of a touch are
    // ignored. Re-arm first-contact so the next real mouse move re-shows
    // the blob.
    window.addEventListener('touchstart', () => {
      lastTouchAt = Date.now();
      havePointer = false;
      hideNow();
      stopLoop();
    }, { passive: true, capture: true });
  } else {
    // Lite: the main pointermove handler already paints the dot inline
    // (paintDot) — zero loop cost, zero lag, same code path as full mode.
    document.addEventListener('mouseleave', hideNow);
    document.addEventListener('mouseenter', () => {
      if (recentTouch()) return;
      havePointer = false; // re-arm: show on the next real move, at its position
    });
    window.addEventListener('touchstart', () => {
      lastTouchAt = Date.now();
      havePointer = false;
      hideNow();
    }, { passive: true, capture: true });
  }

  let lastTouchAt = 0;
  function recentTouch() { return Date.now() - lastTouchAt < 1000; }

  // ---- hover detection: native-OS semantics — hover = pointer AT REST over
  // a target. Re-sense ONLY on real pointer travel (no periodic re-sense:
  // animated content under a still pointer can never pulse the blob);
  // scroll suppresses pops for SCROLL_SUPPRESS_MS; a fast pointer relaxes
  // instead of popping (calm across menus/text; pops the instant it lands).
  const INTERACTIVE = 'a, button, input, select, textarea, label, summary, [role="button"], [role="radio"], [role="tab"], [role="menuitem"], [role="link"], [role="checkbox"], [onclick], .ob-opt, .btn';
  let lastHoverX = -1, lastHoverY = -1;
  let fastUntil = 0; // pointer is "fast" until this timestamp (hysteresis)

  function hoverSense(now) {
    if (!visible) { hoverTarget = 1; return; }
    if (now - lastScrollAt < SCROLL_SUPPRESS_MS) { hoverTarget = 1; return; }
    if (now < fastUntil) { hoverTarget = 1; return; }
    const moved = Math.abs(mx - lastHoverX) + Math.abs(my - lastHoverY) > HOVER_MIN_MOVE;
    if (!moved) return;
    lastHoverX = mx; lastHoverY = my;
    const el = document.elementFromPoint(mx, my);
    const hit = el && el.closest && el.closest(INTERACTIVE);
    hoverTarget = hit ? HOVER_DOT : 1;
  }

  // ---- the loop -----------------------------------------------------------
  function render(now) {
    rafId = 0;
    if (!visible) return;

    if (!lastT) lastT = now;
    let dt = (now - lastT) / 1000;
    lastT = now;
    if (dt > MAX_DT) dt = MAX_DT;
    if (dt <= 0) { rafId = requestAnimationFrame(render); return; }

    // Pointer speed for the hover gate: one cheap hypot on the raw pointer
    // delta per frame (frame-rate independent — px per MILLISECOND). Crossing
    // the speed limit holds the gate shut for FAST_HOLD_MS; only a genuine
    // stop re-opens it (hysteresis — no flicker from momentary pauses).
    const pdx = mx - pmx, pdy = my - pmy;
    pmx = mx; pmy = my;
    const speed = dt > 0 ? (Math.hypot(pdx, pdy) / (dt * 1000)) : 0;
    if (speed > HOVER_SLOW_PXMS) fastUntil = now + FAST_HOLD_MS;
    const pointerFast = now < fastUntil;

    hoverSense(now);

    // Dot: position = pointer (v16 prime directive — painted synchronously
    // in the event; synced here too so every path stays coherent). Only the
    // SCALE springs below give the dot its pop.
    dx = mx; dy = my;
    // Defensive sanity clamp — physically unreachable, but a bad state must
    // never be able to paint the blob off-screen.
    if (Math.abs(dx - mx) > 4000 || Math.abs(dy - my) > 4000) {
      dx = mx; dy = my; dvx = dvy = 0;
      gx = mx; gy = my; gvx = gvy = 0;
    }

    // Glow spring → pointer (the trail).
    [gx, gvx] = springStep(gx, gvx, mx, GLOW_OMEGA, GLOW_ZETA, dt);
    [gy, gvy] = springStep(gy, gvy, my, GLOW_OMEGA, GLOW_ZETA, dt);

    // Stretch from the glow spring's own (continuous) velocity.
    const v = Math.hypot(gvx, gvy);
    vSmooth += (v - vSmooth) * (1 - Math.exp(-VEL_SMOOTH * dt));
    const sTarget = vSmooth > STRETCH_ON
      ? Math.min(vSmooth * STRETCH_GAIN, STRETCH_MAX)
      : 0;
    stretch += (sTarget - stretch) * (1 - Math.exp(-ANGLE_RATE * dt));
    if (v > 120) {
      // shortest-arc smoothing — the blob never spins the long way round
      const target = Math.atan2(gvy, gvx);
      let delta = target - angle;
      while (delta > Math.PI) delta -= 2 * Math.PI;
      while (delta < -Math.PI) delta += 2 * Math.PI;
      angle += delta * (1 - Math.exp(-ANGLE_RATE * dt));
    }

    // ---- hover/press scale springs (the POP) ----
    // Real underdamped springs with velocity state: they overshoot the
    // target (~16% at zeta=0.5) and settle with an elastic bounce. This is
    // the physical definition of a pop — exponential smoothing cannot do it.
    const dT = hoverTarget * press;                    // press < 1 squeezes
    const gT = (hoverTarget > 1 ? HOVER_GLOW : 1) * (press < 1 ? PRESS_GLOW : 1);
    [dotScale, dotScaleVel] = springStep(dotScale, dotScaleVel, dT, SCALE_OMEGA, SCALE_ZETA, dt);
    [glowScale, glowScaleVel] = springStep(glowScale, glowScaleVel, gT, SCALE_OMEGA, GLOW_SCALE_ZETA, dt);

    // ---- write (one transform per layer, device-pixel snapped) ----
    dotStage.style.transform = `translate3d(${(snap(dx) - DOT_STAGE_HALF)}px, ${(snap(dy) - DOT_STAGE_HALF)}px, 0)`;
    dot.style.transform = `scale(${dotScale.toFixed(4)})`;
    glowStage.style.transform = `translate3d(${(snap(gx) - GLOW_STAGE_HALF)}px, ${(snap(gy) - GLOW_STAGE_HALF)}px, 0)`;
    const sx = (1 + stretch) * glowScale;
    const sy = (1 / (1 + stretch)) * glowScale;
    glow.style.transform = `rotate(${angle.toFixed(4)}rad) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`;

    // Idle sleep: everything at rest + pointer quiet → stop burning cycles.
    const settled = Math.abs(dx - mx) + Math.abs(dy - my) < 0.1
      && Math.abs(gx - mx) + Math.abs(gy - my) < 0.15
      && vSmooth < 8 && stretch < 0.004
      && Math.abs(dotScale - dT) < 0.004 && Math.abs(dotScaleVel) < 0.05
      && Math.abs(glowScale - gT) < 0.004 && Math.abs(glowScaleVel) < 0.05;
    if (settled && now - lastMoveAt > IDLE_MS) {
      lastT = 0;
      dx = mx; dy = my; gx = mx; gy = my;
      dotStage.style.transform = `translate3d(${snap(mx) - DOT_STAGE_HALF}px, ${snap(my) - DOT_STAGE_HALF}px, 0)`;
      glowStage.style.transform = `translate3d(${snap(mx) - GLOW_STAGE_HALF}px, ${snap(my) - GLOW_STAGE_HALF}px, 0)`;
      return; // rAF stays stopped; next pointermove wakes us
    }
    rafId = requestAnimationFrame(render);
  }

  function stopLoop() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    lastT = 0;
  }

  // ---- 300ms housekeeping: modal perf mode + stale-pop correction -------
  // Two classList queries — trivial. Covers every full-screen scrim.
  // v15 stale-pop correction: hover is sensed only on pointer travel, so if
  // the DOM changes under a STILL popped pointer (SPA view switch, modal
  // opening, element removal) the pop would never relax. While popped and
  // the pointer has been quiet for 500ms, re-verify the target once per
  // tick; relax only popped→flat — a still pointer over a real target can
  // never be pulsed by this.
  let perfMode = false;
  setInterval(() => {
    if (document.hidden) return;
    const pm = !!document.querySelector('.mo.open, .auth-modal-scrim.open');
    if (pm !== perfMode) {
      perfMode = pm;
      document.documentElement.classList.toggle('blob-perf', pm);
    }
    if (visible && hoverTarget > 1
        && performance.now() - lastMoveAt > 500
        && performance.now() - lastScrollAt > SCROLL_SUPPRESS_MS) {
      const el = document.elementFromPoint(mx, my);
      if (!(el && el.closest && el.closest(INTERACTIVE))) {
        hoverTarget = 1;
        wake(false); // loop may be asleep — wake it so the relax animates
      }
    }
  }, 300);
})();
