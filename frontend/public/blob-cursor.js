// blob-cursor.js v13 — "pop + no outline", user-directed revision of v12.
// The engine underneath is the same proven symplectic spring system (v11/v12):
// ONE rAF loop; semi-implicit Euler with stability-guaranteed substepping
// (omega*h = 0.75, stable at ANY frame rate); dot spring omega=150 critically
// damped (perceptually glued); glow trail omega=11 overdamped (silky flow);
// area-preserving stretch + shortest-arc rotation from the glow's own
// velocity; fixed-size compositor stages; device-pixel snapping; idle sleep;
// robust re-show after leave/touch; touch-only skip; lite/reduced path;
// modal perf mode. Nothing about the core motion changed — it is already
// dt-normalized and frame-rate independent.
//
// What v13 changes (each maps to a direct user request):
//
//  1. "I don't want that outline in blob" —
//     The 1.5px white ring from v12 is DELETED. Visibility is now carried by
//     a 17px dot + layered SOFT glow shadows (no crisp edge to shimmer in
//     compressed video, nothing that reads as an outline). The always-on
//     56px radial glow underneath does the rest.
//
//  2. "I want that pop effect on hovering" —
//     v12 animated hover scale with exponential smoothing (no velocity
//     state) — it could only approach the target asymptotically: a dead
//     fade, never a pop. v13 gives scale its own UNDERDAMPED spring
//     (zeta = 0.5, omega = 24): the blob overshoots ~16% past its target
//     and settles with a visible elastic bounce. Dot pops to 1.65x, glow
//     to 1.4x. The v12 speed-gate is deleted — hover must trigger
//     reliably, not only when the pointer is slow.
//
//  3. Press feedback — pointerdown squeezes the blob to 0.82x, release
//     springs back through the hover target with the same overshoot. The
//     cursor now physically reacts to clicks.
//
//  4. "Not functioning properly" hardening —
//     a. cursor:none is now gated behind html.blob-live, a class added the
//        moment the blob first becomes visible. If the blob can never show
//        (JS blocked, hybrid-device edge case), the native cursor simply
//        stays — there is no scenario left where the user has NO pointer.
//     b. Hover is re-sensed on SCROLL: after a wheel/fling the element
//        under a still pointer changed, and v12 kept the stale hover state.
//     c. Re-sensing is throttled by distance (4px) or time (110ms) — one
//        elementFromPoint max per frame, but no speed gate.
(function(){
  'use strict';

  // Touch-only devices: the primary pointer is a finger — nothing to follow.
  // Laptops that report touch but are mouse-driven still run (hover:hover).
  if (window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse)').matches) return;

  // ---- tuning ------------------------------------------------------------
  const DOT_OMEGA   = 150;   // dot spring stiffness (rad/s) — glued, not welded
  const DOT_ZETA    = 1.0;   // critically damped: fastest settle, zero overshoot
  const GLOW_OMEGA  = 11;    // glow trail stiffness — the flowing blob feel
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
  const HOVER_MIN_MOVE = 4;  // px pointer travel before hover re-evaluation
  const HOVER_MAX_WAIT = 110;// ms between hover re-evaluations while moving
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
    /* The blob replaces the native cursor ONLY once it is actually visible
       (html.blob-live). Until the first real pointer move the native cursor
       stays — the user is never left without a pointer, no matter what. */
    html.blob-live, html.blob-live * { cursor: none !important; }
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
  // comfortably inside the stable region) and never capped: at MAX_DT=50ms
  // and omega=150 that is <=10 substeps of trivial arithmetic. Stability is
  // a property of the scheme, not of the frame rate — slow frames can never
  // make the cursor explode. Same integrator for position AND scale springs.
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

  // ---- events: store + wake. NOTHING else happens here. ------------------
  window.addEventListener('pointermove', (e) => {
    if (recentTouch()) return;
    mx = e.clientX; my = e.clientY;
    lastMoveAt = performance.now();
    // First contact OR re-show after any hide path (mouseleave, touch,
    // recording overlays eating events): snap to the FRESH position and show.
    // This is what makes "cursor disappeared forever" impossible.
    if (!havePointer || !visible) {
      havePointer = true;
      dx = gx = mx; dy = gy = my;
      dvx = dvy = gvx = gvy = 0;
      pmx = mx; pmy = my;
      wake(true);
    } else {
      wake(false);
    }
  }, { passive: true });

  // Press pop: squeeze on down, springy release on up. Pure state — the
  // loop does the animation; if it is asleep, wake it so the squeeze shows.
  window.addEventListener('pointerdown', (e) => {
    if (recentTouch()) return;
    press = PRESS_DOT;
    lastMoveAt = performance.now();
    if (e.clientX || e.clientY) { mx = e.clientX; my = e.clientY; }
    wake(false);
  }, { passive: true, capture: true });
  window.addEventListener('pointerup', () => { press = 1; }, { passive: true });
  window.addEventListener('pointercancel', () => { press = 1; }, { passive: true });

  // Scroll changes what is under a still pointer — re-sense hover on the
  // next frame (v12 kept stale hover state after every scroll).
  let hoverDirty = false;
  window.addEventListener('scroll', () => {
    hoverDirty = true;
    wake(false);
  }, { passive: true, capture: true });

  function wake(showNow) {
    if (showNow && !visible) {
      visible = true;
      cursor.classList.add('blob-on');
      // From this instant on the blob is provably on screen — only now may
      // we hide the native cursor.
      document.documentElement.classList.add('blob-live');
    }
    if (!rafId && visible && !LITE) {
      rafId = requestAnimationFrame(render);
    }
  }

  if (!LITE) {
    document.addEventListener('mouseleave', () => {
      visible = false;
      cursor.classList.remove('blob-on');
      stopLoop();
    });
    document.addEventListener('mouseenter', () => {
      if (recentTouch()) return;
      // Re-arm first-contact: the next real pointermove snaps the blob to the
      // FRESH position and shows it. Snapping to the stale mx here would dart
      // the dot across the screen for a frame (mx is the pre-leave position).
      havePointer = false;
    });
    // Hybrid touch screens: finger down hides the blob; synthesized mouse
    // events within 1s of a touch are ignored. Re-arm first-contact so the
    // next real mouse move re-shows the blob.
    window.addEventListener('touchstart', () => {
      lastTouchAt = Date.now();
      visible = false;
      havePointer = false;
      cursor.classList.remove('blob-on');
      stopLoop();
    }, { passive: true, capture: true });
  } else {
    // Lite: dot follows the pointer directly on the event — zero loop cost.
    document.addEventListener('mouseleave', () => {
      visible = false;
      cursor.classList.remove('blob-on');
    });
    document.addEventListener('mouseenter', () => {
      if (recentTouch()) return;
      havePointer = false; // re-arm: show on the next real move, at its position
    });
    window.addEventListener('touchstart', () => {
      lastTouchAt = Date.now();
      visible = false;
      havePointer = false;
      cursor.classList.remove('blob-on');
    }, { passive: true, capture: true });
    window.addEventListener('pointermove', liteWrite, { passive: true });
  }

  let lastTouchAt = 0;
  function recentTouch() { return Date.now() - lastTouchAt < 1000; }

  function liteWrite() {
    if (!visible) return;
    dotStage.style.transform = `translate3d(${snap(mx) - DOT_STAGE_HALF}px, ${snap(my) - DOT_STAGE_HALF}px, 0)`;
  }

  // ---- hover detection: 1 hit-test per frame max, distance/time throttled.
  // No speed gate (deleted in v13): the pop must trigger reliably even when
  // the pointer arrives fast at a button.
  const INTERACTIVE = 'a, button, input, select, textarea, label, [role="button"], [onclick], .ob-opt, .btn';
  let lastHoverX = -1, lastHoverY = -1, lastHoverCheck = 0;

  function hoverSense(now) {
    if (!visible) { hoverTarget = 1; return; }
    const moved = Math.abs(mx - lastHoverX) + Math.abs(my - lastHoverY) > HOVER_MIN_MOVE;
    const due = now - lastHoverCheck > HOVER_MAX_WAIT;
    if (!moved && !due && !hoverDirty) return;
    hoverDirty = false;
    lastHoverX = mx; lastHoverY = my; lastHoverCheck = now;
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

    hoverSense(now);

    // Dot spring → pointer.
    [dx, dvx] = springStep(dx, dvx, mx, DOT_OMEGA, DOT_ZETA, dt);
    [dy, dvy] = springStep(dy, dvy, my, DOT_OMEGA, DOT_ZETA, dt);
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

  // ---- 300ms housekeeping: modal perf mode only ---------------------------
  // Two classList queries — trivial. Covers every full-screen scrim.
  let perfMode = false;
  setInterval(() => {
    if (document.hidden) return;
    const pm = !!document.querySelector('.mo.open, .auth-modal-scrim.open');
    if (pm !== perfMode) {
      perfMode = pm;
      document.documentElement.classList.toggle('blob-perf', pm);
    }
  }, 300);
})();
