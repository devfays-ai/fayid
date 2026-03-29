// ══════════════════════════════════════
//  i18n — Internationalization System
// ══════════════════════════════════════

const I18n = (() => {
  let translations = {};
  let currentLang = localStorage.getItem('fayid_lang') || 'en';

  async function load() {
    try {
      const res = await fetch('js/translations.json');
      translations = await res.json();
    } catch (e) {
      console.warn('Could not load translations, using fallback.');
      translations = { en: {}, id: {}, hi: {} };
    }
  }

  function t(key) {
    const lang = translations[currentLang] || translations['en'] || {};
    return lang[key] || translations['en']?.[key] || key;
  }

  function setLang(lang) {
    if (!['en', 'id', 'hi'].includes(lang)) return;
    currentLang = lang;
    localStorage.setItem('fayid_lang', lang);
    applyTranslations();
    updateLangButtons();
    document.documentElement.setAttribute('data-lang', lang);
    // Re-run typewriter
    if (window.startTypewriter) window.startTypewriter();
  }

  function getLang() { return currentLang; }

  function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      const val = t(key);
      if (val) el.textContent = val;
    });

    // Placeholder translations
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      el.placeholder = t(key);
    });
  }

  function updateLangButtons() {
    document.querySelectorAll('.lang-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.lang === currentLang);
    });
  }

  async function init() {
    await load();
    applyTranslations();
    updateLangButtons();
    document.documentElement.setAttribute('data-lang', currentLang);

    // Attach lang buttons
    document.querySelectorAll('.lang-btn').forEach(btn => {
      btn.addEventListener('click', () => setLang(btn.dataset.lang));
    });
  }

  return { init, t, setLang, getLang, applyTranslations };
})();

document.addEventListener('DOMContentLoaded', () => I18n.init());
