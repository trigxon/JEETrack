// blob-cursor.js v11 — "physics rebuild": one spring integrator drives every
// layer, so the blob is mathematically incapable of jumping, clipping or
// stuttering — it can only glide.
//
// WHY v10 STILL FELT GLITCHY (root causes, honestly listed):
//  1. The dot was written synchronously on every mousemove while the glow ran
//     on rAF. Two clocks. When the main thread stalls (GC, layout, blur
//     re-filter), mousemove events queue up; on the next frame the dot JUMPED
//     dozens of px while the glow stayed behind — a visible tear. A burst of
//     events must become continuous motion, not a jump → solve with springs.
//  2. The glow "snap if 220px behind" rule was a teleport — a hard
//     discontinuity the eye reads as the blob glitching/half-vanishing.
//  3. Every mouseover ran a getComputedStyle() ancestor walk (up to 14
//     nodes) to find backdrop-filter glass. Sweeping fast across a complex
//     page fires mouseover on every element boundary → style-recalc storms.
//  4. CSS transitions on the same transforms JS writes = the transition
//     restarts on every write = micro-jitter.
//
// THE v11 ENGINEERING:
//  - ONE requestAnimationFrame loop. Semi-implicit (symplectic) Euler spring
//     integrator with adaptive sub-stepping: h = 1/(ω·1.25), which keeps the
//     integration stable for ANY ω and any frame rate (60fps → 4 substeps for
//     the dot; a 200ms stall → 8 substeps, still stable, no explosion).
//  - Dot spring: ω=150/s, ζ=1 (critically damped) → 90% of a step within
//    ~25ms: perceptually glued to the pointer, but events that arrive in
//    bursts are absorbed into fast, CONTINUOUS catch-up. No jumps, ever.
//  - Glow spring: ω=11/s, ζ=1.05 (slightly overdamped — no overshoot wobble)
//    → the silky blob trail. It is never snapped: spring acceleration scales
//    with distance, so catch-up is fast but always continuous.
//  - Stretch: computed from the glow spring's own velocity vector
//    (v is continuous because x is continuous — physics, not heuristics).
//    Area-preserving elongation (sx = 1+s, sy = 1/(1+s)) along the smoothed
//    velocity angle: the blob "deforms like a fluid", never tears.
//  - Hover scale (dot 1.55×, glow 1.35×) is ALSO a spring — no CSS
//    transitions anywhere on animated transforms.
//  - Layout-engine hygiene: the event handlers only store coordinates and
//    wake the loop. Exactly ONE document.elementFromPoint() per animation
//    frame drives BOTH hover detection and glass (backdrop-filter)
//    suspension, memoized per element in a WeakMap. Zero style recalcs in
//    the event path, zero per-element walks during sweeps.
//  - Constant composited layer bounds: two fixed-size stages (72px dot
//    stage, 192px glow stage). Max glow extent 56px × 1.35 hover × 1.55
//    stretch ≈ 117px < 192px. Scaling can never clip ("half of the blob
//    disappearing" is geometrically impossible).
//  - Idle sleep: springs fully at rest + pointer still 1.2s → rAF stops;
//    any event wakes it with a clean dt. No teleports on wake (springs are
//    already at rest at the pointer).
//  - Kept from v10: touch-only skip + hybrid-touch guard, reduced-motion
//    path, ?blob-lite force flag, scroll glow-fade, modal perf mode
//    (html.blob-perf strips scrim blur), jt-blob-noblur glass suspension,
//    native-cursor hiding.
//  - Removed from v10: adaptive lite mode (one-way visual pops = "blob half
//    disappeared"), the 220px teleport, all event-path style walks.
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
  const GLASS_MIN_MOVE = 6;  // px pointer travel before re-checking glass
  const GLASS_MAX_WAIT = 150;// ms between glass checks while moving
  const HOVER_SLOW_PX = 8;   // px travel before hover target re-evaluation

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
    #custom-cursor .jt-dot {
      position: absolute; width: 14px; height: 14px;
      left: 29px; top: 29px; border-radius: 50%;
      background: rgba(244, 114, 182, 1);
      transform-origin: 50% 50%; will-change: transform;
      box-shadow: 0 0 6px rgba(244, 114, 182, 0.8);
    }
    #custom-cursor .jt-glow-stage {
      position: absolute; width: 192px; height: 192px;
      left: -96px; top: -96px; will-change: transform;
    }
    #custom-cursor .jt-glow {
      position: absolute; width: 56px; height: 56px;
      left: 68px; top: 68px; border-radius: 50%;
      background: radial-gradient(circle,
        rgba(244, 114, 182, 0.50) 0%,
        rgba(244, 114, 182, 0.26) 34%,
        rgba(244, 114, 182, 0.09) 55%,
        rgba(244, 114, 182, 0) 72%);
      transform-origin: 50% 50%; will-change: transform;
    }
    /* Scroll guard: fade the trail while the page scrolls under the pointer. */
    #custom-cursor.blob-scroll .jt-glow { opacity: 0; }
    #custom-cursor .jt-glow { transition: opacity 0.15s ease; }
    /* Glass suspension: while the pointer is over a backdrop-filter panel,
       that panel's blur is lifted (visually imperceptible — panels are
       >=72% opaque) so a moving cursor never forces full-surface re-filters
       ("hanging" on navs, cards, modals). */
    .jt-blob-noblur {
      backdrop-filter: none !important;
      -webkit-backdrop-filter: none !important;
    }
    /* Full-screen scrim perf mode: strip the blur for the whole time a
       modal/auth sheet is open. */
    html.blob-perf .mo, html.blob-perf .mo.open,
    html.blob-perf .auth-modal-scrim, html.blob-perf .auth-modal-scrim.open {
      backdrop-filter: none !important;
      -webkit-backdrop-filter: none !important;
    }
    /* The blob replaces the native cursor on mouse-driven devices. */
    html, html * { cursor: none !important; }
  `;
  document.head.appendChild(style);

  // ---- state -------------------------------------------------------------
  let mx = -200, my = -200;         // pointer target (client px)
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
  // stable region — |λ|max ≈ 0.9) and never capped: at MAX_DT=50ms and
  // ω=150 that is ≤10 substeps of trivial arithmetic. Stability is a
  // property of the scheme, not of the frame rate — slow frames can no
  // longer make the cursor explode (the classic random "glitch").
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
    if (!havePointer) {
      // First contact: snap everything to the pointer — no streaks.
      havePointer = true;
      dx = gx = mx; dy = gy = my;
      dvx = dvy = gvx = gvy = 0;
      wake(true);
    }
    wake(false);
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
      suspendGlass(null);
    });
    document.addEventListener('mouseenter', () => {
      if (recentTouch()) return;
      dx = gx = mx; dy = gy = my;
      dvx = dvy = gvx = gvy = 0;
      visible = true;
      cursor.classList.add('blob-on');
      wake(false);
    });
    // Hybrid touch screens: finger down hides the blob; synthesized mouse
    // events within 1s of a touch are ignored.
    window.addEventListener('touchstart', () => {
      lastTouchAt = Date.now();
      if (visible) {
        visible = false;
        cursor.classList.remove('blob-on');
        stopLoop();
        suspendGlass(null);
      }
    }, { passive: true, capture: true });
  } else {
    // Lite: dot follows the pointer directly on the event — zero loop cost.
    document.addEventListener('mouseleave', () => {
      visible = false;
      cursor.classList.remove('blob-on');
    });
    document.addEventListener('mouseenter', () => {
      if (recentTouch()) return;
      visible = true;
      cursor.classList.add('blob-on');
    });
    window.addEventListener('touchstart', () => {
      lastTouchAt = Date.now();
      visible = false;
      cursor.classList.remove('blob-on');
    }, { passive: true, capture: true });
  }

  let lastTouchAt = 0;
  function recentTouch() { return Date.now() - lastTouchAt < 1000; }

  function liteWrite() {
    if (!visible) return;
    dotStage.style.transform = `translate3d(${mx - DOT_STAGE_HALF}px, ${my - DOT_STAGE_HALF}px, 0)`;
  }
  if (LITE) {
    window.addEventListener('pointermove', liteWrite, { passive: true });
  }

  // ---- glass (backdrop-filter) suspension + hover, 1 hit-test per frame --
  const INTERACTIVE = 'a, button, input, select, textarea, label, [role="button"], .ob-opt, .btn';
  const glassMemo = new WeakMap();
  let suspended = null;

  function glassRootUnder(el) {
    // Memoized ancestor walk — repeated sweeps over known UI cost nothing.
    let n = el, depth = 0;
    const chain = [];
    while (n && n !== document.documentElement && depth++ < 14) {
      const cached = glassMemo.get(n);
      if (cached !== undefined) {
        for (let i = 0; i < chain.length; i++) glassMemo.set(chain[i], cached);
        return cached;
      }
      if (n.nodeType === 1) {
        chain.push(n);
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

  function suspendGlass(el) {
    if (el === suspended) return;
    if (suspended) suspended.classList.remove('jt-blob-noblur');
    suspended = el;
    if (suspended) suspended.classList.add('jt-blob-noblur');
  }

  let lastGlassX = -1, lastGlassY = -1, lastGlassCheck = 0;
  let lastHoverX = -1, lastHoverY = -1;

  function pointerSense(now) {
    if (!visible) { suspendGlass(null); hoverTarget = 1; return; }
    const movedGlass = Math.abs(mx - lastGlassX) + Math.abs(my - lastGlassY) > GLASS_MIN_MOVE;
    const due = now - lastGlassCheck > GLASS_MAX_WAIT;
    if (!movedGlass && !due) return;
    lastGlassX = mx; lastGlassY = my; lastGlassCheck = now;
    const el = document.elementFromPoint(mx, my);
    suspendGlass(el ? glassRootUnder(el) : null);
    // Hover scale: re-evaluate only after real travel (not every frame).
    if (Math.abs(mx - lastHoverX) + Math.abs(my - lastHoverY) > HOVER_SLOW_PX || !el) {
      lastHoverX = mx; lastHoverY = my;
      hoverTarget = (el && el.closest && el.closest(INTERACTIVE)) ? 1.55 : 1;
    }
  }

  // ---- scroll guard -------------------------------------------------------
  let scrollHideTimer = 0;
  window.addEventListener('scroll', () => {
    if (LITE || !visible) return;
    cursor.classList.add('blob-scroll');
    clearTimeout(scrollHideTimer);
    scrollHideTimer = setTimeout(() => cursor.classList.remove('blob-scroll'), 150);
  }, { passive: true, capture: true });

  // ---- the loop -----------------------------------------------------------
  function render(now) {
    rafId = 0;
    if (!visible) return;

    if (!lastT) lastT = now;
    let dt = (now - lastT) / 1000;
    lastT = now;
    if (dt > MAX_DT) dt = MAX_DT;
    if (dt <= 0) { rafId = requestAnimationFrame(render); return; }

    pointerSense(now);

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

    // ---- write (one transform per layer) ----
    dotStage.style.transform = `translate3d(${(dx - DOT_STAGE_HALF).toFixed(2)}px, ${(dy - DOT_STAGE_HALF).toFixed(2)}px, 0)`;
    dot.style.transform = `scale(${dotScale.toFixed(4)})`;
    glowStage.style.transform = `translate3d(${(gx - GLOW_STAGE_HALF).toFixed(2)}px, ${(gy - GLOW_STAGE_HALF).toFixed(2)}px, 0)`;
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
      dotStage.style.transform = `translate3d(${mx - DOT_STAGE_HALF}px, ${my - DOT_STAGE_HALF}px, 0)`;
      glowStage.style.transform = `translate3d(${mx - GLOW_STAGE_HALF}px, ${my - GLOW_STAGE_HALF}px, 0)`;
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
    const pm = !!document.querySelector('.mo.open, .auth-modal-scrim.open');
    if (pm !== perfMode) {
      perfMode = pm;
      cursor.classList.toggle('blob-perf', pm);
      document.documentElement.classList.toggle('blob-perf', pm);
    }
  }, 300);
})();
