// ══════════════════════════════════════
//  FayID — Rating System
//  Persisted via localStorage (or CF KV via worker)
// ══════════════════════════════════════

const Rating = (() => {
  const STORAGE_KEY = 'fayid_ratings';
  let user = null;
  let selectedStar = 0;

  // ── Load ratings from localStorage ─────────────────────────────────────────
  function loadRatings() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { reviews: [] };
    } catch {
      return { reviews: [] };
    }
  }

  function saveRatings(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  // ── Sync from Cloudflare Worker KV (if available) ──────────────────────────
  async function syncFromWorker() {
    try {
      const res = await fetch('/api/ratings');
      if (res.ok) {
        const data = await res.json();
        saveRatings(data);
        return data;
      }
    } catch (e) {}
    return loadRatings();
  }

  async function pushToWorker(review) {
    try {
      await fetch('/api/ratings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(review),
      });
    } catch (e) {}
  }

  // ── Compute Stats ───────────────────────────────────────────────────────────
  function computeStats(reviews) {
    if (!reviews.length) return { avg: 0, total: 0, breakdown: { 1:0,2:0,3:0,4:0,5:0 } };
    const breakdown = { 1:0,2:0,3:0,4:0,5:0 };
    let sum = 0;
    reviews.forEach(r => {
      breakdown[r.stars] = (breakdown[r.stars] || 0) + 1;
      sum += r.stars;
    });
    return { avg: (sum / reviews.length).toFixed(1), total: reviews.length, breakdown };
  }

  // ── Render Stats Panel ──────────────────────────────────────────────────────
  function renderStats(stats) {
    const { avg, total, breakdown } = stats;

    const bigNum = document.getElementById('bigRatingNum');
    const bigStars = document.getElementById('bigStars');
    const countEl = document.getElementById('ratingCount');
    const heroAvg = document.getElementById('avgRating');

    if (bigNum) bigNum.textContent = total ? avg : '—';
    if (countEl) countEl.textContent = total;
    if (heroAvg) heroAvg.textContent = total ? avg + '★' : '—';

    if (bigStars) {
      const f = parseFloat(avg);
      bigStars.innerHTML = [1,2,3,4,5].map(i => {
        if (f >= i) return '<span class="star filled">★</span>';
        if (f >= i - 0.5) return '<span class="star half">★</span>';
        return '<span class="star empty">☆</span>';
      }).join('');
    }

    // Breakdown bars
    [1,2,3,4,5].forEach(n => {
      const bar = document.getElementById(`b${n}`);
      const count = document.getElementById(`c${n}`);
      if (bar) bar.style.width = total ? ((breakdown[n] / total) * 100) + '%' : '0%';
      if (count) count.textContent = breakdown[n] || 0;
    });
  }

  // ── Render Reviews List ─────────────────────────────────────────────────────
  function renderReviews(reviews) {
    const list = document.getElementById('reviewsList');
    if (!list) return;

    if (!reviews.length) {
      const noRev = I18n?.t('rating.noReviews') || 'No reviews yet. Be the first!';
      list.innerHTML = `<p class="no-reviews">${noRev}</p>`;
      return;
    }

    const sorted = [...reviews].sort((a, b) => b.timestamp - a.timestamp).slice(0, 20);
    list.innerHTML = sorted.map(r => `
      <div class="review-card">
        <div class="review-header">
          <img class="review-avatar" src="${escapeHtml(r.avatar || 'https://cdn.discordapp.com/embed/avatars/0.png')}" alt="avatar" />
          <div class="review-meta">
            <span class="review-username">${escapeHtml(r.username)}</span>
            <span class="review-stars">${'★'.repeat(r.stars)}${'☆'.repeat(5 - r.stars)}</span>
          </div>
          <span class="review-date">${formatDate(r.timestamp)}</span>
        </div>
        ${r.text ? `<p class="review-text">${escapeHtml(r.text)}</p>` : ''}
      </div>
    `).join('');
  }

  // ── Star Selector ───────────────────────────────────────────────────────────
  function initStarSelector() {
    const stars = document.querySelectorAll('.star-opt');
    const label = document.getElementById('starLabel');
    const submitBtn = document.getElementById('submitRatingBtn');

    const labels = {
      en: ['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent!'],
      id: ['', 'Buruk', 'Cukup', 'Bagus', 'Hebat', 'Luar Biasa!'],
      hi: ['', 'Kharab', 'Theek', 'Achha', 'Bahut Achha', 'Zabardast!'],
    };

    stars.forEach(star => {
      star.addEventListener('mouseenter', () => {
        const val = parseInt(star.dataset.val);
        stars.forEach(s => s.classList.toggle('hovered', parseInt(s.dataset.val) <= val));
      });
      star.addEventListener('mouseleave', () => {
        stars.forEach(s => s.classList.remove('hovered'));
        highlightSelected();
      });
      star.addEventListener('click', () => {
        selectedStar = parseInt(star.dataset.val);
        highlightSelected();
        const lang = I18n?.getLang() || 'en';
        if (label) label.textContent = (labels[lang] || labels.en)[selectedStar];
        if (submitBtn) submitBtn.disabled = false;
      });
    });

    function highlightSelected() {
      stars.forEach(s => s.classList.toggle('selected', parseInt(s.dataset.val) <= selectedStar));
    }
  }

  // ── Submit Rating ───────────────────────────────────────────────────────────
  async function submit() {
    if (!user) { showToast('Please login with Discord first!', 'error'); return; }
    if (!selectedStar) { showToast('Please select a rating!', 'warn'); return; }

    const textEl = document.getElementById('reviewInput');
    const text = (textEl?.value || '').trim().slice(0, 300);

    const data = loadRatings();

    // Check if user already rated
    const existing = data.reviews.findIndex(r => r.userId === user.id);

    const review = {
      userId: user.id,
      username: user.username,
      avatar: user.avatar_url || '',
      stars: selectedStar,
      text,
      timestamp: Date.now(),
    };

    if (existing >= 0) {
      data.reviews[existing] = review;
      showToast('✅ Rating updated!', 'success');
    } else {
      data.reviews.push(review);
      showToast('✅ Rating submitted!', 'success');
    }

    saveRatings(data);
    await pushToWorker(review);

    const stats = computeStats(data.reviews);
    renderStats(stats);
    renderReviews(data.reviews);

    // Reset form
    selectedStar = 0;
    document.querySelectorAll('.star-opt').forEach(s => s.classList.remove('selected', 'hovered'));
    const label = document.getElementById('starLabel');
    if (label) label.textContent = I18n?.t('rating.selectStar') || 'Select a rating';
    const btn = document.getElementById('submitRatingBtn');
    if (btn) btn.disabled = true;
    if (textEl) textEl.value = '';
  }

  // ── Login / Logout hooks ────────────────────────────────────────────────────
  function onLogin(u) {
    user = u;
    document.getElementById('ratingLocked')?.classList.add('hidden');
    document.getElementById('ratingActive')?.classList.remove('hidden');
    initStarSelector();
  }

  function onLogout() {
    user = null;
    selectedStar = 0;
    document.getElementById('ratingLocked')?.classList.remove('hidden');
    document.getElementById('ratingActive')?.classList.add('hidden');
  }

  // ── Init ────────────────────────────────────────────────────────────────────
  async function init() {
    const data = await syncFromWorker();
    const stats = computeStats(data.reviews);
    renderStats(stats);
    renderReviews(data.reviews);
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function escapeHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function formatDate(ts) {
    return new Date(ts).toLocaleDateString(undefined, { year:'numeric', month:'short', day:'numeric' });
  }

  // Auto-init
  document.addEventListener('DOMContentLoaded', init);

  return { onLogin, onLogout, submit };
})();

// Global submit function
function submitRating() { Rating.submit(); }
