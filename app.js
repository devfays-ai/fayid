// ══════════════════════════════════════
//  FayID Portfolio — Main App Script
//  Discord OAuth + UI Logic
// ══════════════════════════════════════

// ── Config (Vercel Serverless Functions) ──────────────────────────────────────
// API routes are handled by /api/*.js Vercel Serverless Functions.
// Set environment variables in: Vercel Dashboard → Project → Settings → Environment Variables
//   DISCORD_CLIENT_ID      — Discord Application Client ID
//   DISCORD_CLIENT_SECRET  — Discord Application Client Secret
//   DISCORD_REDIRECT_URI   — https://YOUR_DOMAIN.vercel.app/callback.html
const CONFIG = {
  DISCORD_CLIENT_ID: '',                                 // Fetched from /api/config
  DISCORD_REDIRECT_URI: window.location.origin + '/callback.html',
  DISCORD_SCOPE: 'identify',
  WORKER_URL: '/api',                                    // Vercel /api/* routes
};

// ── State ─────────────────────────────────────────────────────────────────────
let currentUser = null;

// ── Discord OAuth ─────────────────────────────────────────────────────────────
async function fetchConfig() {
  try {
    // Fetch client ID from Cloudflare Worker (keeps it server-side safe)
    const res = await fetch(`${CONFIG.WORKER_URL}/config`);
    if (res.ok) {
      const data = await res.json();
      CONFIG.DISCORD_CLIENT_ID = data.clientId;
    }
  } catch (e) {
    // Fallback: read from meta tag if worker unavailable
    const meta = document.querySelector('meta[name="discord-client-id"]');
    if (meta) CONFIG.DISCORD_CLIENT_ID = meta.content;
  }
}

function handleDiscordLogin() {
  if (!CONFIG.DISCORD_CLIENT_ID) {
    showToast('⚙️ Discord OAuth not configured. Set DISCORD_CLIENT_ID in Vercel Environment Variables.', 'warn');
    // Demo mode for local preview
    demoLogin();
    return;
  }
  const state = generateState();
  sessionStorage.setItem('discord_oauth_state', state);

  const params = new URLSearchParams({
    client_id: CONFIG.DISCORD_CLIENT_ID,
    redirect_uri: CONFIG.DISCORD_REDIRECT_URI,
    response_type: 'code',
    scope: CONFIG.DISCORD_SCOPE,
    state,
  });

  window.location.href = `https://discord.com/api/oauth2/authorize?${params}`;
}

function generateState() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

// Handle OAuth callback (from callback.html postMessage)
window.addEventListener('message', async (e) => {
  if (e.origin !== window.location.origin) return;
  if (e.data?.type === 'DISCORD_CALLBACK') {
    const { code, state } = e.data;
    const savedState = sessionStorage.getItem('discord_oauth_state');
    if (state !== savedState) {
      showToast('❌ OAuth state mismatch!', 'error');
      return;
    }
    await exchangeCode(code);
  }
});

async function exchangeCode(code) {
  try {
    showToast('🔄 Authenticating...', 'info');
    const res = await fetch(`${CONFIG.WORKER_URL}/auth/discord`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, redirect_uri: CONFIG.DISCORD_REDIRECT_URI }),
    });
    if (!res.ok) throw new Error('Auth failed');
    const user = await res.json();
    setUser(user);
  } catch (e) {
    showToast('❌ Login failed. Please try again.', 'error');
  }
}

// Demo login (for local preview without CF Worker)
function demoLogin() {
  const demoUser = {
    id: 'demo_' + Date.now(),
    username: 'DemoUser#0000',
    avatar_url: 'https://cdn.discordapp.com/embed/avatars/0.png',
    discriminator: '0000',
  };
  setUser(demoUser);
}

function setUser(user) {
  currentUser = user;
  localStorage.setItem('fayid_user', JSON.stringify(user));
  updateUserUI();
  showToast(`✅ Welcome, ${user.username}!`, 'success');
  Rating.onLogin(user);
}

function handleLogout() {
  currentUser = null;
  localStorage.removeItem('fayid_user');
  updateUserUI();
  Rating.onLogout();
  showToast('👋 Logged out.', 'info');
}

function updateUserUI() {
  const loginBtn = document.getElementById('discordLoginBtn');
  const userProfile = document.getElementById('userProfile');
  const userAvatar = document.getElementById('userAvatar');
  const userName = document.getElementById('userName');

  if (currentUser) {
    loginBtn?.classList.add('hidden');
    userProfile?.classList.remove('hidden');
    if (userAvatar) userAvatar.src = currentUser.avatar_url || `https://cdn.discordapp.com/embed/avatars/0.png`;
    if (userName) userName.textContent = currentUser.username;
  } else {
    loginBtn?.classList.remove('hidden');
    userProfile?.classList.add('hidden');
  }
}

// ── Restore session ───────────────────────────────────────────────────────────
function restoreSession() {
  try {
    const saved = localStorage.getItem('fayid_user');
    if (saved) {
      currentUser = JSON.parse(saved);
      updateUserUI();
      Rating.onLogin(currentUser);
    }
  } catch (e) {}
}

// ── Typewriter ────────────────────────────────────────────────────────────────
let typewriterTimer = null;
function startTypewriter() {
  const el = document.getElementById('heroTagline');
  if (!el) return;
  clearTimeout(typewriterTimer);

  const taglines = I18n.t('hero.taglines');
  const lines = Array.isArray(taglines) ? taglines : ['DEVELOPER', 'CREATOR'];
  let lineIdx = 0, charIdx = 0, deleting = false;

  function tick() {
    const line = lines[lineIdx];
    if (!deleting) {
      el.textContent = line.slice(0, ++charIdx);
      if (charIdx === line.length) {
        deleting = true;
        typewriterTimer = setTimeout(tick, 1800);
        return;
      }
    } else {
      el.textContent = line.slice(0, --charIdx);
      if (charIdx === 0) {
        deleting = false;
        lineIdx = (lineIdx + 1) % lines.length;
      }
    }
    typewriterTimer = setTimeout(tick, deleting ? 60 : 90);
  }
  tick();
}
window.startTypewriter = startTypewriter;

// ── Scroll Active Nav ─────────────────────────────────────────────────────────
function updateActiveNav() {
  const sections = document.querySelectorAll('.section');
  const navLinks = document.querySelectorAll('.nav-link');
  let current = '';
  sections.forEach(s => {
    if (window.scrollY >= s.offsetTop - 100) current = s.id;
  });
  navLinks.forEach(l => {
    l.classList.toggle('active', l.dataset.section === current);
  });
}

// ── Skill Bar Animation ───────────────────────────────────────────────────────
function animateSkillBars() {
  const bars = document.querySelectorAll('.skill-bar[data-pct]');
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const bar = entry.target;
        const fill = bar.querySelector('.skill-fill');
        const pct = bar.dataset.pct;
        setTimeout(() => {
          fill.style.width = pct + '%';
        }, 200);
        observer.unobserve(bar);
      }
    });
  }, { threshold: 0.3 });
  bars.forEach(b => observer.observe(b));
}

// ── Section Reveal ────────────────────────────────────────────────────────────
function initReveal() {
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) entry.target.classList.add('revealed');
    });
  }, { threshold: 0.1 });
  document.querySelectorAll('.skill-card, .about-card, .about-info, .section-header').forEach(el => {
    el.classList.add('reveal-target');
    observer.observe(el);
  });
}

// ── Custom Cursor ─────────────────────────────────────────────────────────────
function initCursor() {
  const cursor = document.getElementById('cursor');
  const trail = document.getElementById('cursorTrail');
  if (!cursor || window.matchMedia('(pointer: coarse)').matches) return;

  let mx = 0, my = 0, tx = 0, ty = 0;
  document.addEventListener('mousemove', e => {
    mx = e.clientX; my = e.clientY;
    cursor.style.transform = `translate(${mx}px, ${my}px)`;
  });

  function animTrail() {
    tx += (mx - tx) * 0.12;
    ty += (my - ty) * 0.12;
    trail.style.transform = `translate(${tx}px, ${ty}px)`;
    requestAnimationFrame(animTrail);
  }
  animTrail();

  document.querySelectorAll('a, button, .star-opt, .lang-btn').forEach(el => {
    el.addEventListener('mouseenter', () => cursor.classList.add('hovering'));
    el.addEventListener('mouseleave', () => cursor.classList.remove('hovering'));
  });
}

// ── Glitch Effect ─────────────────────────────────────────────────────────────
function initGlitch() {
  const glitchEls = document.querySelectorAll('.glitch-text');
  glitchEls.forEach(el => {
    el.setAttribute('data-text', el.textContent);
  });
}

// ── Mobile Menu ───────────────────────────────────────────────────────────────
function initMobileMenu() {
  const btn = document.getElementById('mobileMenuBtn');
  const menu = document.getElementById('mobileMenu');
  btn?.addEventListener('click', () => {
    menu?.classList.toggle('open');
    btn.textContent = menu?.classList.contains('open') ? '✕' : '☰';
  });
  menu?.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => {
      menu.classList.remove('open');
      btn.textContent = '☰';
    });
  });
}

// ── Smooth scroll ─────────────────────────────────────────────────────────────
function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      const target = document.querySelector(a.getAttribute('href'));
      target?.scrollIntoView({ behavior: 'smooth' });
    });
  });
}

// ── Toast ─────────────────────────────────────────────────────────────────────
let toastTimer;
function showToast(msg, type = 'info') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  clearTimeout(toastTimer);
  toast.textContent = msg;
  toast.className = `toast show ${type}`;
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3500);
}
window.showToast = showToast;

// ── Code Rain (hero) ──────────────────────────────────────────────────────────
function initCodeRain() {
  const container = document.getElementById('codeRain');
  if (!container) return;
  const chars = 'FAYID01GAME∑∂∆∇⟩⟨{}[];:∞⚡★◈';
  for (let i = 0; i < 20; i++) {
    const span = document.createElement('span');
    span.textContent = chars[Math.floor(Math.random() * chars.length)];
    span.className = 'rain-char';
    span.style.cssText = `
      left:${Math.random()*100}%;
      animation-delay:${Math.random()*4}s;
      animation-duration:${2 + Math.random()*3}s;
      opacity:${0.1 + Math.random()*0.4};
      font-size:${10 + Math.random()*14}px;
    `;
    container.appendChild(span);
  }
}

// ── DOMContentLoaded ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await fetchConfig();
  restoreSession();
  initCursor();
  initGlitch();
  initMobileMenu();
  initSmoothScroll();
  initReveal();
  initCodeRain();
  animateSkillBars();
  startTypewriter();

  window.addEventListener('scroll', updateActiveNav, { passive: true });
  updateActiveNav();
});
