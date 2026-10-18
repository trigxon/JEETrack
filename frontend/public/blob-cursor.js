// blob-cursor.js v12 — "physics rebuild, part 2": keeps the v11 spring engine
// (symplectic sub-stepped integrator — mathematically stable at any frame
// rate) and fixes the two things the user still experienced after v11:
//
//  1. "I can't see the cursor in that video" —
//     v11's dot was 14px pink with no outline; the glow faded out during
//     scrolling and disappeared in lite mode. On the dark glass dashboard a
//     screen recording then shows a lone 14px dot (often mid-fade) — invisible.
//     v12: 16px dot with a 1.5px white ring (visible over pink accents, dark
//     glass, white surfaces, compressed video — any background), and the glow
//     NEVER fades: not while scrolling, not while sweeping. (A 56px static
//     gradient layer costs the compositor nothing — the fade was solving a
//     non-problem while hiding the one thing the user wants to see.)
//
//  2. "Still glitching very much" —
//     v11 kept the v10 glass BLUR SUSPENSION (jt-blob-noblur): every time the
//     pointer crossed onto/off a backdrop-filter panel, that panel's blur was
//     stripped and restored INSTANTLY — the entire panel visibly pops. On the
//     glass-heavy dashboard a sweep flicks whole panels on/off. That is the
//     page glitching, not the cursor. v12 deletes blur suspension entirely:
//     the cursor never mutates the page. The blob layers are tiny static
//     composited textures moved by transforms only — there is nothing left to
//     spike. (Detection cost drops to zero too: no elementFromPoint walk for
//     glass, no per-element getComputedStyle memo, nothing.)
//
// Also in v12: dot + glow stage positions are snapped to the device-pixel
// grid (no subpixel shimmer on 1x displays), and hover scale is gated by
// pointer speed (no scale-breathing while sweeping across menus).
//
// Kept from v11 (the engine): ONE rAF loop; symplectic Euler with stability-
// guaranteed substepping (h = 1/(ω·1.25)); dot spring ω=150 critically damped
// (perceptually glued, absorbs event bursts into continuous motion); glow
// spring ω=11 slightly overdamped (the silky trail, no teleports, no snaps);
// area-preserving stretch + shortest-arc rotation from the glow's own
// velocity; hover scale as springs (no CSS transform transitions anywhere);
// fixed-size compositor stages (clipping geometrically impossible); idle
// sleep; touch-only skip + hybrid guards; reduced-motion path; ?blob-lite;
// modal perf mode (html.blob-perf strips scrim blur); native-cursor hiding.
// Removed from v11: adaptive auto-lite, the 220px teleport (both already
// gone), and now blur suspension + scroll glow-fade.
(function(){
  'use strict';

  // Touch-only devices: the primary pointer is a finger — nothing to follow.
  // Laptops that report touch but are mouse-driven still run (hover:hover).
  if (window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse)').matches) return;

  // ---- tuning ------------------------------------------------------------
  const DOT_OMEGA   = 150;   // dot spring stiffness (rad/s) — glued, not welded
  const DOT_ZETA    = 1.0;   // critically damped: fastest settle, zero overshoot
  const GLOW_OMEGA  = 11;    // glow trail stiffness — the blob feel
  const GLOW_ZETA   = 1.05;  // hair overdamped: no rubber-band wobble
  const SCALE_OMEGA = 26;    // hover scale spring
  const MAX_DT      = 0.05;  // clamp frame delta (50ms) — stalls never explode
  const STRETCH_MAX = 0.42;  // max elongation (+42% along motion)
  const STRETCH_GAIN = 0.00016; // px/s of glow velocity → stretch amount
  const STRETCH_ON  = 90;    // px/s: glow speed above which stretch engages
  const ANGLE_RATE  = 14;    // 1/s — velocity-angle smoothing
  const VEL_SMOOTH  = 10;    // 1/s — glow-velocity smoothing for stretch
  const IDLE_MS     = 1200;  // at rest this long → sleep rAF
  const HOVER_MIN_MOVE = 6;  // px pointer travel before hover re-evaluation
  const HOVER_MAX_WAIT = 150;// ms between hover re-evaluations while moving
  const HOVER_SLOW_PXMS = 1.1; // px/ms — pointer faster than this: hover scale off

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
    /* 16px dot + white ring: visible over pink accents, dark glass, white
       surfaces and in compressed screen recordings — any background. */
    #custom-cursor .jt-dot {
      position: absolute; width: 16px; height: 16px;
      left: 28px; top: 28px; border-radius: 50%;
      background: rgba(244, 114, 182, 1);
      transform-origin: 50% 50%; will-change: transform;
      box-shadow:
        0 0 0 1.5px rgba(255, 255, 255, 0.92),
        0 2px 12px rgba(244, 114, 182, 0.85);
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
    /* The blob replaces the native cursor on mouse-driven devices. */
    html, html * { cursor: none !important; }
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
  // hover scale springs
  let dotScale = 1, glowScale = 1, hoverTarget = 1;

  const DOT_STAGE_HALF = 36, GLOW_STAGE_HALF = 96, GLOW_OFF = 68;

  // ---- spring integrator (semi-implicit Euler, stability-guaranteed) -----
  // For ζ≈1 symplectic Euler the error eigenvalue crosses |λ|=1 at ω·h≈0.91.
  // Substep h is therefore DERIVED from ω (ω·h = 0.75, comfortably inside the
  // stable region) and never capped: at MAX_DT=50ms and ω=150 that is ≤10
  // substeps of trivial arithmetic. Stability is a property of the scheme,
  // not of the frame rate — slow frames can never make the cursor explode.
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

  function wake(showNow) {
    if (showNow && !visible) {
      visible = true;
      cursor.classList.add('blob-on');
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
    // next real mouse move re-shows the blob (v11 bug: it stayed hidden
    // forever after any touch until reload).
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

  // ---- hover detection: 1 hit-test per frame max, speed-gated ------------
  const INTERACTIVE = 'a, button, input, select, textarea, label, [role="button"], .ob-opt, .btn';
  let lastHoverX = -1, lastHoverY = -1, lastHoverCheck = 0;
  let pointerFast = false; // updated per frame in render()

  function hoverSense(now) {
    if (!visible) { hoverTarget = 1; return; }
    // Sweeping fast across menus: hover scale stays off (no breathing).
    if (pointerFast) { hoverTarget = 1; return; }
    const moved = Math.abs(mx - lastHoverX) + Math.abs(my - lastHoverY) > HOVER_MIN_MOVE;
    const due = now - lastHoverCheck > HOVER_MAX_WAIT;
    if (!moved && !due) return;
    lastHoverX = mx; lastHoverY = my; lastHoverCheck = now;
    const el = document.elementFromPoint(mx, my);
    hoverTarget = (el && el.closest && el.closest(INTERACTIVE)) ? 1.55 : 1;
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

    // Pointer speed for the hover gate (per frame — one cheap decay calc).
    const pdx = mx - pmx, pdy = my - pmy;
    pmx = mx; pmy = my;
    const pdist = Math.sqrt(pdx * pdx + pdy * pdy);
    pointerFast = (pdist / (dt * 1000)) > HOVER_SLOW_PXMS;

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

    // Hover scale springs.
    const dotST = hoverTarget;
    const glowST = hoverTarget > 1 ? 1.35 : 1;
    dotScale += (dotST - dotScale) * (1 - Math.exp(-SCALE_OMEGA * dt));
    glowScale += (glowST - glowScale) * (1 - Math.exp(-SCALE_OMEGA * dt));

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
      && Math.abs(dotScale - dotST) < 0.004;
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
