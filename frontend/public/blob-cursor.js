// blob-cursor.js v25 — "the iframe law".
//
//  16. THE v25 LAWS (report #17: "the blob and the native mouse both are
//      coming and i cant click anything using the blob" — PROVEN on
//      production with an event-level probe, scripts/jt_r17_iframe_probe.mjs):
//
//      (a) THE IFRAME / DOCUMENT-EXIT LAW. The site renders CHILD FRAMES at
//          the most critical moments: the Cloudflare Turnstile widget inside
//          the login/signup modal and the Razorpay checkout overlay (full-
//          screen iframe) at payment time. A child frame is a SEPARATE
//          document: while the pointer is over it, the parent window receives
//          ZERO pointermove events, and cursor styles never cross documents
//          (the parent's html.blob-live * { cursor:none } cannot reach it).
//          Measured on production: the pointer crossed into a test iframe and
//          the engine kept blob-live SET (native arrow hidden on the parent),
//          kept the blob VISIBLE, and the dot FROZE at the last parent-side
//          position — while the iframe showed its own native arrow and got
//          every click. The user literally sees BOTH pointers (a frozen pink
//          blob + a live native arrow over the frame) and aiming the frozen
//          blob clicks nothing — the exact report. v25 treats "the pointer
//          left this document" (into the OS, or into a child frame) exactly
//          like a window exit: capture-phase pointerout/mouseout hooks detect
//          the crossing (relatedTarget null, in another document, or the
//          iframe element itself — all three shapes Chromium emits), hideNow()
//          fires, and the blob re-arms for the next real parent move. The
//          300ms housekeeping tick additionally checks the pointer's last
//          position: if an IFRAME is the top-most element there (the Razorpay
//          overlay APPEARING under a still pointer), the blob hides too.
//          Over any frame the user now gets the frame's own native cursor —
//          honest aim — and the blob returns the moment the pointer comes
//          back (zero-lag, at the fresh position).
//
//      (b) THE CONSISTENCY LAW. blob-on (blob visible) and blob-live (native
//          cursor hidden) are engine-internal state; any external writer (a
//          theme engine rewriting documentElement.className, an extension,
//          a future refactor) can break the pairing and produce either ghost:
//          "blob AND native arrow both visible" or its inverse (cursor:none
//          with NO blob anywhere = pointerless). The 300ms housekeeping tick
//          now reconciles both classes to the engine's `visible` flag, so
//          neither ghost can PERSIST, whatever exotic path produced it.
//
//  17. THE v26 SOLO-CURSOR LAW (owner directive: "disable the native cursor
//      and let the blob cursor act as the main cursor for that whole
//      website"). The desktop path already hides the OS arrow behind the
//      proof-of-life gate (blob-live) the instant the mouse moves. The HOLE
//      was the touch path: on a touchscreen laptop every tap shows the pink
//      glow WHILE Windows teleports the system arrow to the tap point —
//      v23 deliberately kept cursor:none OFF there (the hybrid-ghost fix),
//      which meant "the blob AND the native mouse both are coming" on
//      exactly the device the owner uses. Now:
//
//      (a) THE TOUCH-GLOW CURSOR LAW. While the tap glow is on screen
//          (tg-on) the html element carries blob-touch-live — the same
//          cursor:none !important coverage as blob-live — so during every
//          tap/drag the glow IS the one and only visible pointer. The class
//          lifecycle is EXACTLY the glow's lifecycle (show/move-re-show
//          add it, hide strips it BEFORE the element hides — a glowless
//          cursor:none state is structurally impossible), so a phone is a
//          no-op (no cursor rendered) and a hybrid gets the arrow back the
//          moment the glow fades, which is correct: between touches it is
//          the device's only persistent pointer indicator.
//
//      (b) THE DRIFT REPAIR. The desktop 300ms tick also reconciles
//          blob-touch-live against the glow's actual tg-on state, so an
//          external writer (extension, refactor) cannot leave the arrow
//          hidden next to a vanished glow — or glowing next to the arrow.
//
//      PHYSICAL LIMITS (honest): (1) before the very first mouse move the
//      engine cannot know where to put the blob, so the arrow shows until
//      then — hiding it earlier would risk a pointerless page; (2) over a
//      cross-origin child frame (Turnstile, Razorpay) the frame's own
//      document draws its own cursor and no parent CSS can reach it — the
//      v25 iframe law steps the blob aside so the aim there is honest.
//
//  18. THE v27 BOOT-EVERYWHERE LAW (owner follow-up: "still the blob is not
//      working"). The v22 routing refused to boot the desktop cursor engine
//      on matchMedia('(hover: none) and (pointer: coarse)') — but that
//      query reports the PRIMARY pointer and real devices lie: Windows
//      tablet mode, 2-in-1s with the keyboard detached, some touchscreen
//      laptops and DeX/OTG setups all report coarse/no-hover with a REAL
//      mouse attached. On those the desktop engine never booted — the
//      mouse moved and nothing followed, invisible to desktop automation
//      and unfixable by any tracking/watchdog code (there was no engine to
//      repair). v27: the desktop engine boots on EVERY device. Where no
//      mouse exists it is self-neutralizing — the v23 pointerType guards
//      drop every touch event (EV_MOVE/EV_DOWN/heartbeat), so a phone pays
//      two idle timers and shows nothing new, and the instant ANY mouse/
//      trackpad/DeX/OTG pointer appears, the blob follows it.
//
//      (c) THE TOGGLE TEARDOWN LAW (v24 settings switch hardening). The
//          cross-tab storage path could leave a tab pointerless: tab A turns
//          the blob OFF (tab B tears down, tornDown=true), tab A turns it ON
//          — tab B's storage event cleared `disabled` but its engine DOM was
//          already removed, so the next mouse move re-added blob-live with NO
//          blob in the DOM (arrow hidden, nothing visible, the OFF toggle in
//          that tab could not fix it because tornDown skipped the teardown).
//          Now: turning OFF always strips the visible state (even when
//          tornDown), and turning ON in any tab whose engines are gone or
//          never booted reloads that tab ONCE for a clean boot. The heartbeat
//          and the freeze watchdog also refuse to paint into a detached DOM.
//
//  15. THE v23 LAWS (report #15):
//      (a) STATUS PILL REMOVED at the owner's request — the bottom-left
//          'cursor v22' / 'tap glow v22' badge is gone from every page.
//          The engine still self-identifies via window.__BLOB_CURSOR_VERSION
//          and the admin engine chip; the SCREEN stays clean.
//      (b) HYBRID GHOST FIXED — the real v22 regression. On a touchscreen
//          laptop, Windows TELEPORTS the system cursor to the touch point,
//          which fires genuine mouse pointermove events inside the engine's
//          1s post-touch swallow window. The engine correctly ignored them,
//          but the v22 FREEZE HEARTBEAT recorded them anyway — so 2s later
//          the watchdog saw "fresh pointer activity, dot elsewhere" and
//          RESURRECTED the deliberately hidden desktop blob as a frozen
//          pink dot at the tap point: "a blob seen but not functioning".
//          The heartbeat now applies the SAME swallow window as the engine,
//          so it can only ever see events the engine itself accepts — the
//          watchdog fires exclusively on TRUE engine death again.
//      (c) TOUCH DRAG RE-SHOW — if the 3s watchdog fades a held-still glow
//          and the finger then MOVES without lifting (pointermove of the
//          tracked id = finger demonstrably down), the glow returns
//          instead of staying invisible for the rest of the drag.
//      (d) MOBILE PROPORTIONS — on touch-only devices the glow halo and
//          dot shrink to fit a phone viewport (halo 192→132px, dot 18→15px).
//          Desktop and hybrid cursor sizes are untouched.
//  14. THE v22 LAWS (report #14: "the blob is only seen but it is not
//      functioning" — on BOTH the phone and the laptop). Four real defect
//      paths found, all closed structurally:
//      (a) TOUCH STUCK-PID: if a pointerup is ever missed (in-app webviews,
//          multi-touch races, id quirks) the old code kept pid != null
//          forever — the glow froze at the last tap AND the pid-guard
//          blocked every future tap. Now a pointerdown ALWAYS re-targets
//          (newest finger wins, a stale pid can never block a tap), a
//          pointermove from a drifted id is ADOPTED after 1.5s, and the
//          watchdog hides any glow with no live touch for 3s.
//      (b) HYBRID (touchscreen laptop): the desktop engine HIDES the blob
//          on touchstart and nothing ever showed for taps — a laptop user
//          touching the screen got zero blob feedback. The tap-glow module
//          now runs on EVERY device with touch (maxTouchPoints > 0), not
//          just touch-only phones; it ignores mouse pointers, so the
//          desktop cursor engine coexists untouched.
//      (c) DESKTOP FREEZE: an independent capture-phase heartbeat records
//          the pointer even if every engine listener dies (extensions,
//          stopImmediatePropagation); a 2s watchdog compares it with the
//          painted dot and RESURRECTS tracking via __BLOB_REPAINT when they
//          disagree while activity is fresh. "Seen but frozen" on a laptop
//          is now structurally impossible.
//      (d) STATUS PILL (RETIRED in v23): a tiny always-on badge (bottom-left)
//          that showed green 'cursor v22' / 'tap glow v22' whenever a healthy
//          engine ran. The owner asked for it to be removed completely — the
//          engine version remains visible in the console banner, the admin
//          engine chip and window.__BLOB_CURSOR_VERSION.
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
  // v24: register the live teardown used by the Settings off-switch
  if (window.__jtBlobStore && window.__jtBlobStore.teardownFns) {
    window.__jtBlobStore.teardownFns.push(function () {
      try { clearTimeout(fadeTimer); } catch (e) {}
      // v26: hide() strips blob-touch-live — the Settings kill-switch must
      // never leave cursor:none behind with the glow gone (pointerless).
      try { hide(); } catch (e) {}
      try { wrap.remove(); } catch (e) {}
    });
  }

  // v23 MOBILE PROPORTIONS: on a touch-only device the halo stage is 53% of
  // a 360px viewport — the tap feedback reads as an oversized bloom. Phones
  // get a fitted size; hybrids/desktop keep the exact desktop dimensions.
  const TG_SMALL = window.matchMedia
    && window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  const TG_DOT_STAGE = TG_SMALL ? 56 : 76;    // dot stage box
  const TG_GLOW_STAGE = TG_SMALL ? 132 : 192; // glow stage box
  const TG_DOT = TG_SMALL ? 15 : 18;          // dot diameter
  const TG_GLOW = TG_SMALL ? 52 : 64;         // glow core diameter

  const style = document.createElement('style');
  style.textContent = `
    #jt-touch-glow {
      position: fixed; top: 0; left: 0; width: 0; height: 0;
      pointer-events: none; z-index: 2147483646;
      opacity: 0; transition: opacity 0.3s ease;
    }
    #jt-touch-glow.tg-on { opacity: 1; }
    #jt-touch-glow .tg-dot-stage {
      position: absolute; width: ${TG_DOT_STAGE}px; height: ${TG_DOT_STAGE}px;
      left: ${-TG_DOT_STAGE / 2}px; top: ${-TG_DOT_STAGE / 2}px; will-change: transform;
    }
    #jt-touch-glow .tg-dot {
      position: absolute; width: ${TG_DOT}px; height: ${TG_DOT}px;
      left: ${(TG_DOT_STAGE - TG_DOT) / 2}px; top: ${(TG_DOT_STAGE - TG_DOT) / 2}px; border-radius: 50%;
      background: rgba(244, 114, 182, 1);
      transform-origin: 50% 50%; will-change: transform;
      box-shadow:
        0 2px 12px rgba(244, 114, 182, 0.85),
        0 0 26px rgba(244, 114, 182, 0.40);
    }
    #jt-touch-glow .tg-glow-stage {
      position: absolute; width: ${TG_GLOW_STAGE}px; height: ${TG_GLOW_STAGE}px;
      left: ${-TG_GLOW_STAGE / 2}px; top: ${-TG_GLOW_STAGE / 2}px; will-change: transform;
    }
    #jt-touch-glow .tg-glow {
      position: absolute; width: ${TG_GLOW}px; height: ${TG_GLOW}px;
      left: ${(TG_GLOW_STAGE - TG_GLOW) / 2}px; top: ${(TG_GLOW_STAGE - TG_GLOW) / 2}px; border-radius: 50%;
      background: radial-gradient(circle,
        rgba(244, 114, 182, 0.50) 0%,
        rgba(244, 114, 182, 0.26) 34%,
        rgba(244, 114, 182, 0.09) 55%,
        rgba(244, 114, 182, 0) 72%);
      transform-origin: 50% 50%; will-change: transform;
    }
    /* v26 SOLO-CURSOR LAW (touch path): while the tap glow is on screen it
       IS the pointer — the native arrow (teleported to the tap point on
       touchscreen laptops, nonexistent on phones) must step aside for
       exactly as long as the glow is visible. Same coverage as the desktop
       engine's blob-live rule: every element, pseudo-elements included,
       !important so site cursor styles can never resurrect the arrow. */
    html.blob-touch-live, html.blob-touch-live *,
    html.blob-touch-live *::before, html.blob-touch-live *::after {
      cursor: none !important;
    }
  `;
  document.head.appendChild(style);

  const dpr = () => Math.max(1, window.devicePixelRatio || 1);
  const snap = (v) => Math.round(v * dpr()) / dpr();
  const DOT_HALF = TG_DOT_STAGE / 2, GLOW_HALF = TG_GLOW_STAGE / 2;
  const GLOW_OMEGA = 22, GLOW_ZETA = 1.05;   // same hair-overdamped trail
  const SCALE_OMEGA = 22, SCALE_ZETA = 0.5;  // same underdamped pop
  const PRESS = 0.82, MAX_DT = 0.05;

  let pid = null;                    // tracked pointer/touch id
  let visible = false, fadeTimer = 0;
  let lastAct = 0;                   // last real down/move (the v22 freeze law)
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
    lastAct = performance.now();
    mx = gx = x; my = gy = y; gvx = gvy = 0;
    scale = 0.6; scaleVel = 0; target = PRESS;  // born small, pops in
    clearTimeout(fadeTimer);
    if (!visible) {
      visible = true;
      // v26 SOLO-CURSOR LAW: the glow is about to be the only pointer on
      // screen — hide the native arrow for exactly its lifetime.
      document.documentElement.classList.add('blob-touch-live');
      wrap.classList.add('tg-on');
    }
    paintDot(); paintGlow();
    wake();
  }
  function move(x, y) {
    mx = x; my = y;
    lastAct = performance.now();
    // v23 DRAG RE-SHOW: a pointermove of the tracked id means the finger is
    // demonstrably still down. If the 3s watchdog faded a held-still glow,
    // the rest of the drag must not run glow-less — bring it back.
    if (!visible) {
      clearTimeout(fadeTimer);
      visible = true;
      document.documentElement.classList.add('blob-touch-live'); // v26 law
      wrap.classList.add('tg-on');
      gx = mx; gy = my; gvx = gvy = 0;
    }
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
    // v26: strip the cursor law FIRST — if anything below throws, the worst
    // state is the old one (glow + arrow), never the pointerless inverse.
    document.documentElement.classList.remove('blob-touch-live');
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
    // v22 STUCK-PID LAW: a pointerdown ALWAYS re-targets. The old
    // `if (pid !== null) return` guard meant one missed pointerup (webview
    // quirks, multi-touch races) froze the glow forever AND blocked every
    // future tap — literally "seen but not functioning". The newest finger
    // always wins; a stale pid can never block a tap again.
    window.addEventListener('pointerdown', (e) => {
      if (window.__jtBlobStore && window.__jtBlobStore.disabled) return; // v24 settings off
      if (e.pointerType === 'mouse') return;    // a real mouse on a hybrid
      show(e.clientX, e.clientY, e.pointerId);
    }, { passive: true, capture: true });
    window.addEventListener('pointermove', (e) => {
      if (window.__jtBlobStore && window.__jtBlobStore.disabled) return; // v24 settings off
      if (e.pointerId !== pid) {
        // v22 ID-DRIFT ADOPTION: some webviews/pens change the pointerId
        // between down and move — the glow would appear at the tap and
        // then never follow ("seen but not functioning"). If the glow is
        // live but the tracked id has gone quiet, adopt the mover.
        if (visible && performance.now() - lastAct > 1500) {
          show(e.clientX, e.clientY, e.pointerId);
        }
        return;
      }
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
  // Watchdog (v22): any glow with no live touch for 3s gets faded — whether
  // the pointerup was missed (pid stuck non-null) or the finger truly left.
  // The old check (pid === null) could NEVER fire in exactly the stuck case
  // it was built for. A finger held still >3s loses the glow — acceptable:
  // the tap feedback has long since played, and a frozen glow that sits on
  // screen forever reads as "the blob is broken".
  setInterval(() => {
    if (visible && (pid === null || performance.now() - lastAct > 3000)) hide();
  }, 2500);
}

(function(){
  'use strict';

  // v22 DOUBLE-BOOT GUARD: if this file ever executes twice (an old SW or a
  // misbuilt page loading it two times), two engines would stack — one dot
  // follows, the other sits frozen = literally "a blob seen but not
  // functioning". The first boot wins; later boots bail.
  if (window.__jtBlobBooted) return;
  window.__jtBlobBooted = true;

  // Support marker (see header note 13): the admin engine chip reads this
  // out of the SERVED file and compares it with the ?v= the page loaded.
  window.__BLOB_CURSOR_VERSION = 'v27';
  try {
    console.info('%c\u25C8 JEE ADV OSINT \u2014 cursor engine v27 (boot-everywhere, solo-cursor law)',
      'color:#f472b6;font-weight:700');
  } catch (e) {}

  // ---- AUTO-HEAL (v21) ----------------------------------------------------
  // Reports #8-#13 keep reducing to ONE root cause on the owner's devices:
  // a service worker from an old deploy still controlling the page and
  // serving an old engine (old caches, or an ancient cache-first SW whose
  // update cycle never fired). The v19 admin chip fixed this with a manual
  // tap, but the owner browses the APP, not the admin panel — so the repair
  // must happen by itself, on every page, without anyone's involvement.
  //
  // The law: the page loads this file as /blob-cursor.js?v=N. If the file
  // that is actually SERVED under that exact URL does not identify itself
  // as vN, the site's cache chain is broken (stale SW), and this page's
  // whole asset set is suspect. Repair ONCE per browser session: purge
  // every CacheStorage bucket, nudge every SW registration to update, and
  // reload. The sessionStorage guard makes a reload loop structurally
  // impossible — even if the server itself were serving garbage, the user
  // sees at most one extra reload, never a bounce.
  (function healCheck() {
    try {
      var expected = null;
      try { expected = document.currentScript
        ? new URL(document.currentScript.src).searchParams.get('v') : null;
      } catch (e) {}
      if (!expected || !window.fetch || !window.caches) return;
      var GUARD = 'blobHeal:' + expected;
      try { if (sessionStorage.getItem(GUARD)) return; } catch (e) {}
      fetch('/blob-cursor.js?v=' + expected + '&heal=' + Date.now(),
            { cache: 'no-store' })
        .then(function (r) { return r && r.ok ? r.text() : null; })
        .then(function (txt) {
          if (!txt) return;                       // offline / 404 — stay silent
          var m = txt.match(/__BLOB_CURSOR_VERSION\s*=\s*['"]([^'"]+)['"]/);
          var served = m && m[1];
          if (served === 'v' + expected) return;  // cache chain healthy
          // STALE ENGINE CONFIRMED — one self-limited repair.
          try { sessionStorage.setItem(GUARD, '1'); } catch (e) {}
          console.warn('[blob] stale cursor engine (served ' + served +
            ', page wants v' + expected + ') — purging caches, updating SW, reloading');
          var purge = caches.keys()
            .then(function (keys) {
              return Promise.all(keys.map(function (k) { return caches.delete(k); }));
            });
          var swUpdate = (navigator.serviceWorker &&
            navigator.serviceWorker.getRegistrations)
            ? navigator.serviceWorker.getRegistrations().then(function (regs) {
                regs.forEach(function (r) { try { r.update(); } catch (e) {} });
              })
            : Promise.resolve();
          Promise.allSettled([purge, swUpdate])
            .then(function () { location.reload(); });
        })
        .catch(function () {});                   // never let heal break the page
    } catch (e) {}
  })();

  // ---- STATUS PILL — REMOVED (v23) -----------------------------------------
  // The v22 bottom-left engine badge ('cursor v22' / 'tap glow v22') was
  // retired at the owner's request: no debug overlay renders anywhere, and
  // nothing re-creates it on reload. Engine identity stays available via
  // window.__BLOB_CURSOR_VERSION, the console banner and the admin chip.

  // Escape hatch 1: ?blob-off runs the page with the native cursor and no blob
  // at all (debugging / personal preference). Nothing is created or hidden.
  if (new URLSearchParams(location.search).has('blob-off')) return;

  // Escape hatch 2 (v24): the owner-facing Settings toggle. localStorage
  // 'jt_blob' === 'off' behaves exactly like ?blob-off — engine never boots.
  // The Settings page dispatches window 'jt-blob-change' events; the
  // jtBlobSettingChange() handler below tears the running engines down live
  // (no reload needed to turn OFF) and reloads once when turning back ON.
  const BLOB_OFF = (() => {
    try { return localStorage.getItem('jt_blob') === 'off'; } catch (e) { return false; }
  })();

  // Shared runtime store for both engines (touch glow + desktop cursor).
  // Hot paths check `store.disabled` first, so a live teardown is respected
  // even by already-registered listeners.
  window.__jtBlobStore = window.__jtBlobStore || { disabled: false, tornDown: false };
  const store = window.__jtBlobStore;
  store.disabled = BLOB_OFF;
  if (!store.teardownFns) store.teardownFns = [];
  if (!window.__jtBlobSettingWired) {
    window.__jtBlobSettingWired = true;
    window.addEventListener('jt-blob-change', () => jtBlobSettingChange());
    window.addEventListener('storage', (e) => { if (e.key === 'jt_blob') jtBlobSettingChange(); });
  }
  function jtBlobSettingChange() {
    let off = false;
    try { off = localStorage.getItem('jt_blob') === 'off'; } catch (e) {}
    store.disabled = off;
    if (off) {
      // v25: ALWAYS strip the visible state, even when the full teardown
      // already ran once (tornDown guard) — blob-live must never outlive the
      // toggle, whatever state the tab is in. hideNow touches consts that do
      // not exist on a tab that booted with the setting off — TDZ error is
      // expected there and caught (that tab has nothing to strip).
      try { hideNow(); } catch (e) {}
      try { stopLoop(); } catch (e) {}
      if (!store.tornDown) {
        store.teardownFns.forEach(function (fn) { try { fn(); } catch (e) {} });
        store.tornDown = true;
        try { console.info('%c\u25C8 cursor engine disabled from Settings', 'color:#f472b6'); } catch (e) {}
      }
    } else if (store.tornDown || window.__jtBlobBootSkipped) {
      // v25: the engines in THIS tab are gone (torn down live) or never
      // booted (setting was off at load). Only a clean boot brings them
      // back. The tab that flipped the toggle reloads via jt-blob-enable;
      // every OTHER tab learns it from this storage event and reloads here
      // — exactly once.
      store.tornDown = false;
      window.__jtBlobBootSkipped = false;
      try { location.reload(); } catch (e) {}
    }
  }
  if (!store.offListenerWired) {
    // Turning it back ON needs a clean boot — one reload, once.
    store.offListenerWired = true;
    window.addEventListener('jt-blob-enable', function () {
      try { location.reload(); } catch (e) {}
    });
  }

  if (BLOB_OFF) {
    try { console.info('%c\u25C8 JEE ADV OSINT \u2014 cursor engine off (Settings)', 'color:#94a3b8'); } catch (e) {}
    // v25: mark the skip so a storage-event ON from another tab can bring
    // this tab back with exactly one clean reload (jtBlobSettingChange).
    window.__jtBlobBootSkipped = true;
    return;
  }

  // ---- ROUTING (v22, REWRITTEN in v27): the desktop engine boots EVERYWHERE
  // v22's routing keyed the desktop cursor engine on
  // matchMedia('(hover: none) and (pointer: coarse)') — "touch-only devices
  // get glow only". But that media query describes the PRIMARY pointer, and
  // real devices lie: Windows tablet mode, 2-in-1s with the keyboard
  // detached, some touchscreen laptops and TV/DeX/OTG setups all report
  // coarse/no-hover while a REAL mouse exists — on those the desktop engine
  // never booted at all, the mouse moved and NOTHING followed = literally
  // "the blob is not working" on the owner's machine, invisible to desktop
  // automation. The v27 law: boot the desktop engine on EVERY device. It is
  // self-neutralizing where no mouse exists — touch pointers are dropped by
  // the v23 pointerType guards (EV_MOVE/EV_DOWN/heartbeat all skip 'touch'),
  // so on a phone the engine sits dormant at zero visual cost, and the
  // moment a mouse/trackpad/DeX/OTG pointer appears the blob follows it.
  // Every device with touch also gets the tap-glow (below); on hybrids both
  // run and ignore each other's pointers — the proven v23 coexistence.
  const HAS_TOUCH = (navigator.maxTouchPoints || 0) > 0;
  if (HAS_TOUCH) initTouchGlow();

  // The desktop cursor engine — all devices. (Touch-only phones: dormant.)

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

  // ---- INDEPENDENT HEARTBEAT (v22, cannot-be-frozen law) -----------------
  // A dumb capture-phase listener that ONLY records where the pointer is.
  // It shares no state with the engine below; even if every engine
  // listener dies (an extension calling stopImmediatePropagation, a
  // poisoned handler, anything), this keeps recording. The watchdog at the
  // bottom of the file compares it with the painted dot and resurrects
  // tracking when they disagree. First-registered = last to be silenced.
  const HB = { x: -1, y: -1, t: 0 };
  window.__BLOB_HB = HB;
  window.addEventListener('pointermove', (e) => {
    if (window.__jtBlobStore && window.__jtBlobStore.disabled) return; // v25: a torn-down engine records nothing
    if (e.pointerType === 'touch') return; // hybrids: the tap-glow owns fingers
    // v23: apply the SAME post-touch swallow window as the engine. On a
    // touchscreen laptop Windows teleports the system cursor to the touch
    // point, firing REAL mouse pointermove events the engine intentionally
    // ignores (recentTouch). If this heartbeat recorded them anyway, the
    // watchdog would "resurrect" the deliberately hidden desktop blob as a
    // frozen dot at the tap point — the exact "seen but not functioning"
    // ghost. Heartbeat and engine must agree on what counts as activity:
    // only events the engine accepts are recorded here.
    if (Date.now() - lastTouchAt < 1000) return;
    HB.x = e.clientX; HB.y = e.clientY; HB.t = performance.now();
  }, { passive: true, capture: true });

  // Resurrection hook: repaint the dot at an externally supplied position
  // and un-hide. Used by the watchdog; exposed for support/debug.
  window.__BLOB_REPAINT = function (x, y) {
    try {
      mx = x; my = y; dx = x; dy = y; dvx = dvy = 0;
      if (!havePointer || !visible) { gx = x; gy = y; gvx = gvy = 0; pmx = x; pmy = y; }
      lastMoveAt = performance.now();
      paintDot();
      wake(true);
    } catch (e) {}
  };

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
    // v23: this engine is the MOUSE cursor. Touch pointers belong to the
    // tap-glow; a finger drag must never drive (or repaint) the desktop dot.
    // (recentTouch alone can't cover the pointerdown-before-touchstart race.)
    if (window.__jtBlobStore && window.__jtBlobStore.disabled) return; // v24 settings off
    if (hasPE && e.pointerType === 'touch') return;
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
    // v23: same law as EV_MOVE — a touch press is tap-glow territory. It
    // must not paint the desktop dot at the tap point either: pointerdown
    // fires BEFORE touchstart, so recentTouch() is still false here, and a
    // dot moved to the tap point while hidden is exactly the fake
    // "mismatch" evidence the freeze watchdog used to resurrect the blob
    // from (the hybrid ghost).
    if (window.__jtBlobStore && window.__jtBlobStore.disabled) return; // v24 settings off
    if (hasPE && e.pointerType === 'touch') return;
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

  // v24: register the live teardown used by the Settings off-switch. It
  // restores the native cursor the same instant (blob-live stripped) and
  // removes every element + interval the engine created. The two real
  // interval ids are captured at their creation sites below.
  let engineIntervalIds = [];
  if (window.__jtBlobStore && window.__jtBlobStore.teardownFns) {
    window.__jtBlobStore.teardownFns.push(function () {
      hideNow();
      stopLoop();
      engineIntervalIds.forEach(function (id) { try { clearInterval(id); } catch (e) {} });
      try { cursor.remove(); } catch (e) {}
      try { style.remove(); } catch (e) {}
    });
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

  // ---- THE IFRAME / DOCUMENT-EXIT LAW (v25) -------------------------------
  // A child frame (Turnstile in the auth modal, the Razorpay checkout
  // overlay, any embed) is a SEPARATE document: while the pointer is over
  // it this window receives ZERO pointermove events and cursor:none can
  // never reach it. Proven on production (jt_r17_iframe_probe): the engine
  // kept blob-live SET and the dot FROZEN at the boundary — the user saw
  // the frozen pink blob AND the frame's own native arrow and could not
  // click with either. So: "the pointer left this document" must hide the
  // blob exactly like a window exit. Chromium announces the crossing with
  // pointerout/mouseout whose relatedTarget is (a) null, (b) a node from
  // another document, or (c) the IFRAME element itself — all three shapes
  // are handled; a routine move inside this document has a same-document
  // element target and never triggers the law. Capture phase is REQUIRED:
  // mouseleave/out do not bubble, so the engine's bubble-phase document
  // listeners never saw these events (that was the whole bug).
  function pointerLeftOurDocument(e) {
    if (window.__jtBlobStore && window.__jtBlobStore.disabled) return;
    const rt = e.relatedTarget;
    if (rt && rt.nodeType === 1 && rt.ownerDocument === document && rt.tagName !== 'IFRAME') return;
    // The pointer is gone — into the OS, or into a child frame. Same
    // contract as mouseleave on the document: hide, stop the loop, re-arm,
    // and let the next REAL parent-side pointermove re-show at its position.
    havePointer = false;
    hideNow();
    stopLoop();
  }
  if (hasPE) window.addEventListener('pointerout', pointerLeftOurDocument, { passive: true, capture: true });
  window.addEventListener('mouseout', pointerLeftOurDocument, { passive: true, capture: true });

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
  let lastHoverEval = 0; // v24: hit-test throttle timestamp

  function hoverSense(now) {
    if (!visible) { hoverTarget = 1; return; }
    if (now - lastScrollAt < SCROLL_SUPPRESS_MS) { hoverTarget = 1; return; }
    if (now < fastUntil) { hoverTarget = 1; return; }
    // v24 LIGHT-TOUCH HOVER: elementFromPoint forces a synchronous style
    // recalc + layout flush. Run per-frame on a heavy page (the dashboard
    // mutates DOM constantly) and the ENGINE itself becomes the jank the
    // user feels while moving the cursor. 10 Hz is imperceptible for a pop
    // that plays when the pointer STOPS, and cuts worst-case hit-tests
    // from ~60/s to ~10/s.
    if (now - lastHoverEval < 100) return;
    lastHoverEval = now;
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
  engineIntervalIds.push(setInterval(() => {
    if (document.hidden) return;
    const pm = !!document.querySelector('.mo.open, .auth-modal-scrim.open');
    if (pm !== perfMode) {
      perfMode = pm;
      document.documentElement.classList.toggle('blob-perf', pm);
    }
    // v25 IFRAME LAW, fallback hook: an overlay iframe that APPEARS under a
    // still pointer (the Razorpay checkout opening at the click point) never
    // produces a boundary event — there was no pointer movement. ONE cheap
    // hit-test per tick (shared with the stale-pop check below so the total
    // stays inside the 15/s perf budget: ~10Hz hover + ~3.3Hz here): if the
    // pointer's last position now resolves to an IFRAME, the pointer is
    // effectively in that document — hide exactly like the capture hooks do.
    let tickEl = null;
    if (visible && havePointer) {
      try {
        tickEl = document.elementFromPoint(mx, my);
        if (tickEl && tickEl.tagName === 'IFRAME') {
          havePointer = false;
          hideNow();
          stopLoop();
        }
      } catch (e) {}
    }
    // v25 CONSISTENCY LAW: blob-on (blob visible) and blob-live (native
    // cursor hidden) must ALWAYS agree with the engine's `visible` flag.
    // Any external writer (a theme engine rewriting documentElement
    // classes, an extension, a future refactor) gets repaired within one
    // tick — neither "blob AND native arrow both visible" nor its inverse
    // (cursor:none with NO blob = pointerless) can PERSIST.
    if (visible) {
      if (!cursor.classList.contains('blob-on')) cursor.classList.add('blob-on');
      if (!document.documentElement.classList.contains('blob-live')) {
        document.documentElement.classList.add('blob-live');
      }
    } else {
      if (cursor.classList.contains('blob-on')) cursor.classList.remove('blob-on');
      if (document.documentElement.classList.contains('blob-live')) {
        document.documentElement.classList.remove('blob-live');
      }
    }
    // v26 SOLO-CURSOR LAW, drift repair: the touch module owns
    // blob-touch-live synchronously with the glow's tg-on lifecycle; this
    // tick only repairs external writers — an arrow hidden next to a
    // vanished glow, or a glow shining next to the arrow.
    try {
      var tglow = document.getElementById('jt-touch-glow');
      var tglowOn = !!(tglow && tglow.classList.contains('tg-on'));
      if (tglowOn !== document.documentElement.classList.contains('blob-touch-live')) {
        document.documentElement.classList.toggle('blob-touch-live', tglowOn);
      }
    } catch (e) {}
    if (visible && hoverTarget > 1
        && performance.now() - lastMoveAt > 500
        && performance.now() - lastScrollAt > SCROLL_SUPPRESS_MS) {
      const el = tickEl || document.elementFromPoint(mx, my); // v25: reuse the tick's hit-test
      if (!(el && el.closest && el.closest(INTERACTIVE))) {
        hoverTarget = 1;
        wake(false); // loop may be asleep — wake it so the relax animates
      }
    }
  }, 300));

  // ---- THE FREEZE WATCHDOG (v22) ------------------------------------------
  // Every 2s: if the pointer has REAL fresh activity (heartbeat) but the
  // painted dot is not at that position, the engine's tracking is dead —
  // repaint from the heartbeat and un-hide. This closes the last possible
  // "blob seen but not functioning" path on desktop: dead listeners,
  // spurious mouseleave, a loop that never woke, any stuck state. A healthy
  // engine matches the heartbeat to the pixel and the check is a no-op.
  // v23: the check is SKIPPED inside the post-touch swallow window (+0.5s
  // margin). During that window the engine is intentionally idle — every
  // dot/heartbeat disagreement there is self-inflicted by the tap sequence,
  // never engine death, and "repairing" it resurrects a blob the user just
  // dismissed by touching the screen (the hybrid ghost).
  setInterval(() => {
    try {
      if (window.__jtBlobStore && window.__jtBlobStore.disabled) return; // v24 settings off
      if (document.hidden) return;
      if (Date.now() - lastTouchAt < 1500) return;   // v23: swallow window
      if (!document.body || !document.body.contains(dotStage)) return; // v25: never repaint into a detached DOM
      const now = performance.now();
      if (HB.t <= 0 || now - HB.t > 3000) return;  // no fresh pointer activity
      const tf = getComputedStyle(dotStage).transform;
      let px = -99999, py = -99999;
      if (tf && tf !== 'none') {
        const m = new DOMMatrix(tf);
        px = m.m41 + DOT_STAGE_HALF; py = m.m42 + DOT_STAGE_HALF;
      }
      if (Math.hypot(px - HB.x, py - HB.y) > 3) window.__BLOB_REPAINT(HB.x, HB.y);
    } catch (e) {}
  }, 2000);
})();
