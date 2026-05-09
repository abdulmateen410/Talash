/* ══════════════════════════════════════════════════════════════════════════
   TALASH — Frontend Enhancement JS
   Drop-in: include AFTER your existing main.js (just before </body>)
       <script src="{{ url_for('static', filename='js/enhancements.js') }}"></script>
   Adds: live particle background, card spotlight cursor, scroll reveal,
         button ripple, page-change transitions. Backend untouched.
   ══════════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ── 1. Live particle background canvas ───────────────────────────────── */
  function initParticles() {
    if (document.getElementById('talash-bg-canvas')) return;
    const canvas = document.createElement('canvas');
    canvas.id = 'talash-bg-canvas';
    Object.assign(canvas.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100vw',
      height: '100vh',
      zIndex: '-1',
      pointerEvents: 'none',
      display: 'block'
    });
    document.body.prepend(canvas);
    const ctx = canvas.getContext('2d');

    let w, h, particles = [];
    const COUNT = Math.min(80, Math.floor(window.innerWidth / 18));
    const COLORS = ['#3b82f6', '#60a5fa', '#38bdf8', '#818cf8', '#0ea5e9'];

    function resize() {
      w = canvas.width = window.innerWidth * devicePixelRatio;
      h = canvas.height = window.innerHeight * devicePixelRatio;
      canvas.style.width = window.innerWidth + 'px';
      canvas.style.height = window.innerHeight + 'px';
    }
    resize();
    window.addEventListener('resize', resize);

    for (let i = 0; i < COUNT; i++) {
      particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.3 * devicePixelRatio,
        vy: (Math.random() - 0.5) * 0.3 * devicePixelRatio,
        r: (Math.random() * 1.6 + 0.4) * devicePixelRatio,
        c: COLORS[Math.floor(Math.random() * COLORS.length)],
      });
    }

    let mouse = { x: -9999, y: -9999 };
    window.addEventListener('mousemove', (e) => {
      mouse.x = e.clientX * devicePixelRatio;
      mouse.y = e.clientY * devicePixelRatio;
    });

    function draw() {
      ctx.clearRect(0, 0, w, h);

      // links
      for (let i = 0; i < particles.length; i++) {
        const a = particles[i];
        for (let j = i + 1; j < particles.length; j++) {
          const b = particles[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < 130 * devicePixelRatio) {
            ctx.strokeStyle = `rgba(96,165,250,${(1 - d / (130 * devicePixelRatio)) * 0.18})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      // particles
      particles.forEach((p) => {
        // mouse attraction
        const mdx = mouse.x - p.x, mdy = mouse.y - p.y;
        const md = Math.sqrt(mdx * mdx + mdy * mdy);
        if (md < 180 * devicePixelRatio) {
          p.vx += (mdx / md) * 0.02;
          p.vy += (mdy / md) * 0.02;
        }
        p.vx *= 0.98; p.vy *= 0.98;
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = w; if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h; if (p.y > h) p.y = 0;

        ctx.beginPath();
        ctx.fillStyle = p.c;
        ctx.shadowColor = p.c;
        ctx.shadowBlur = 10;
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.shadowBlur = 0;
      requestAnimationFrame(draw);
    }
    draw();
  }

  /* ── 2. Card cursor spotlight ─────────────────────────────────────────── */
  function initSpotlight() {
    document.addEventListener('mousemove', (e) => {
      document.querySelectorAll('.stat-card, .card, .candidate-card, .job-card, .glass-card')
        .forEach((el) => {
          const r = el.getBoundingClientRect();
          if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return;
          el.style.setProperty('--mx', ((e.clientX - r.left) / r.width) * 100 + '%');
          el.style.setProperty('--my', ((e.clientY - r.top) / r.height) * 100 + '%');
        });
    });
  }

  /* ── 3. Button ripple ─────────────────────────────────────────────────── */
  function initRipple() {
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn, button');
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const ripple = document.createElement('span');
      const size = Math.max(rect.width, rect.height);
      Object.assign(ripple.style, {
        position: 'absolute',
        left: e.clientX - rect.left - size / 2 + 'px',
        top: e.clientY - rect.top - size / 2 + 'px',
        width: size + 'px',
        height: size + 'px',
        borderRadius: '50%',
        background: 'rgba(96,165,250,0.35)',
        transform: 'scale(0)',
        animation: 'talash-ripple 0.6s ease-out forwards',
        pointerEvents: 'none',
      });
      const cs = getComputedStyle(btn);
      if (cs.position === 'static') btn.style.position = 'relative';
      if (cs.overflow !== 'hidden') btn.style.overflow = 'hidden';
      btn.appendChild(ripple);
      setTimeout(() => ripple.remove(), 650);
    });
    const style = document.createElement('style');
    style.textContent = '@keyframes talash-ripple { to { transform: scale(2.4); opacity: 0; } }';
    document.head.appendChild(style);
  }

  /* ── 4. Scroll reveal ─────────────────────────────────────────────────── */
  function initReveal() {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) {
          en.target.style.opacity = '1';
          en.target.style.transform = 'translateY(0)';
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.08 });

    const arm = () => {
      document.querySelectorAll('.stat-card, .card, .candidate-card, .job-card, section, .panel')
        .forEach((el) => {
          if (el.dataset.tarm) return;
          el.dataset.tarm = '1';
          el.style.opacity = '0';
          el.style.transform = 'translateY(18px)';
          el.style.transition = 'opacity .6s cubic-bezier(.22,1,.36,1), transform .6s cubic-bezier(.22,1,.36,1)';
          io.observe(el);
        });
    };
    arm();
    new MutationObserver(arm).observe(document.body, { childList: true, subtree: true });
  }

  /* ── 5. Tilt on hover for cards ───────────────────────────────────────── */
  function initTilt() {
    document.addEventListener('mousemove', (e) => {
      const card = e.target.closest('.stat-card, .candidate-card, .job-card');
      if (!card) return;
      const r = card.getBoundingClientRect();
      const cx = (e.clientX - r.left) / r.width - 0.5;
      const cy = (e.clientY - r.top) / r.height - 0.5;
      card.style.transform = `translateY(-4px) perspective(800px) rotateX(${(-cy * 4).toFixed(2)}deg) rotateY(${(cx * 4).toFixed(2)}deg)`;
    });
    document.addEventListener('mouseout', (e) => {
      const card = e.target.closest('.stat-card, .candidate-card, .job-card');
      if (card) card.style.transform = '';
    });
  }

  /* ── Init ─────────────────────────────────────────────────────────────── */
  function start() {
    try { initParticles(); } catch (e) {}
    try { initSpotlight(); } catch (e) {}
    try { initRipple(); } catch (e) {}
    try { initReveal(); } catch (e) {}
    try { initTilt(); } catch (e) {}
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
