/**
 * Canvas backdrop: precipitation, stars, fog and lightning driven by the
 * live condition family. Budget-conscious — capped DPR, capped particle
 * counts, paused when the tab is hidden, disabled under reduced-motion.
 */

const QUIET = matchMedia('(prefers-reduced-motion: reduce)');

/** No-op stand-in so callers never have to null-check. */
const INERT = { set() {}, stop() {} };

export function createSky(canvas) {
  const ctx = canvas?.getContext?.('2d', { alpha: true });
  if (!ctx) return INERT;   // canvas unsupported or disabled — skip the scene

  let w = 0, h = 0, dpr = 1;
  let drops = [], flakes = [], stars = [], haze = [];
  let fam = 'clear', night = false;
  let flash = 0, nextFlash = 0;
  let raf = null, last = 0;

  /* ── sizing ─────────────────────────────────────────────── */
  function resize() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seed();
  }

  const rand = (a, b) => a + Math.random() * (b - a);
  /** Particle budget scales with viewport area, hard-capped. */
  const budget = per1k => Math.min(Math.round((w * h) / 1000 * per1k), 420);

  function seed() {
    const heavy = /heavy|violent/.test(fam);

    drops = fam === 'rain' || fam === 'storm'
      ? Array.from({ length: budget(fam === 'storm' ? 0.34 : 0.26) }, () => ({
          x: rand(0, w), y: rand(-h, h),
          len: rand(9, 26), vy: rand(620, 1150), vx: rand(-70, -20),
          a: rand(0.12, 0.42)
        }))
      : [];

    flakes = fam === 'snow'
      ? Array.from({ length: budget(0.16) }, () => ({
          x: rand(0, w), y: rand(-h, h),
          r: rand(1, 3.2), vy: rand(26, 74), drift: rand(0.4, 1.6),
          phase: rand(0, Math.PI * 2), a: rand(0.3, 0.85)
        }))
      : [];

    stars = night && (fam === 'clear' || fam === 'cloud')
      ? Array.from({ length: budget(0.075) }, () => ({
          x: rand(0, w), y: rand(0, h * 0.82),
          r: rand(0.4, 1.5), tw: rand(0.6, 2.4), phase: rand(0, Math.PI * 2)
        }))
      : [];

    haze = fam === 'fog' || fam === 'cloud'
      ? Array.from({ length: 7 }, (_, i) => ({
          x: rand(-0.2, 1) * w, y: rand(0.08, 0.92) * h,
          r: rand(140, 320), vx: rand(6, 20) * (i % 2 ? 1 : -1),
          a: fam === 'fog' ? rand(0.05, 0.11) : rand(0.025, 0.055)
        }))
      : [];

    if (heavy) drops.forEach(d => { d.vy *= 1.2; });
  }

  /* ── frame ──────────────────────────────────────────────── */
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.05) || 0.016; // clamp tab-switch jumps
    last = now;

    ctx.clearRect(0, 0, w, h);

    // stars
    for (const s of stars) {
      s.phase += s.tw * dt;
      const a = 0.35 + Math.abs(Math.sin(s.phase)) * 0.6;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(226,240,255,${a.toFixed(3)})`;
      ctx.fill();
    }

    // fog / cloud banks
    for (const g of haze) {
      g.x += g.vx * dt;
      if (g.x - g.r > w) g.x = -g.r;
      if (g.x + g.r < 0) g.x = w + g.r;
      const grd = ctx.createRadialGradient(g.x, g.y, 0, g.x, g.y, g.r);
      grd.addColorStop(0, `rgba(188,206,232,${g.a})`);
      grd.addColorStop(1, 'rgba(188,206,232,0)');
      ctx.fillStyle = grd;
      ctx.fillRect(g.x - g.r, g.y - g.r, g.r * 2, g.r * 2);
    }

    // rain
    if (drops.length) {
      ctx.lineWidth = 1.1;
      ctx.lineCap = 'round';
      for (const d of drops) {
        d.y += d.vy * dt;
        d.x += d.vx * dt;
        if (d.y > h + d.len) { d.y = -d.len; d.x = rand(0, w + 120); }
        if (d.x < -40) d.x = w + 40;
        const sx = d.vx * 0.02;
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x + sx, d.y + d.len);
        ctx.strokeStyle = `rgba(173,222,255,${d.a})`;
        ctx.stroke();
      }
    }

    // snow
    for (const f of flakes) {
      f.phase += dt * f.drift;
      f.y += f.vy * dt;
      f.x += Math.sin(f.phase) * 16 * dt;
      if (f.y > h + f.r) { f.y = -f.r; f.x = rand(0, w); }
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(236,249,255,${f.a})`;
      ctx.fill();
    }

    // lightning
    if (fam === 'storm') {
      nextFlash -= dt;
      if (nextFlash <= 0) { flash = 1; nextFlash = rand(3.5, 11); }
      if (flash > 0) {
        flash = Math.max(0, flash - dt * 3.6);
        const e = flash * flash * 0.5;
        ctx.fillStyle = `rgba(206,196,255,${e.toFixed(3)})`;
        ctx.fillRect(0, 0, w, h);
      }
    }
  }

  /* ── lifecycle ──────────────────────────────────────────── */
  function start() {
    if (raf != null || QUIET.matches) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    if (raf != null) cancelAnimationFrame(raf);
    raf = null;
    ctx.clearRect(0, 0, w, h);
  }

  let rt;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(resize, 160); }, { passive: true });
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  QUIET.addEventListener('change', () => (QUIET.matches ? stop() : start()));

  resize();
  start();

  return {
    /** Switch the active weather scene. */
    set(nextFam, isNight) {
      if (nextFam === fam && isNight === night) return;
      fam = nextFam || 'clear';
      night = !!isNight;
      nextFlash = 1.2;
      seed();
      start();
    },
    stop
  };
}
