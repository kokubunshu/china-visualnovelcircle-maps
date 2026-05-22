// Shared configuration and small utility helpers used by app.js.
var CONFIG = window.CONFIG || {
  BASE_WIDTH: 960,
  BASE_HEIGHT: 700,
  API_URL: './data/clubs.json',
  FALLBACK_URLS: ['./data/clubs.json'],
  POLYMERIZATION_URL: '',
  PUBLIC_BASE_URL: 'https://www.map.vnfest.top'
};

var VNFEST_MEDIA_PRELOADS = window.VNFEST_MEDIA_PRELOADS || new Set();
var VNFEST_IMAGE_URL_RE = /\.(?:avif|gif|ico|jpe?g|png|svg|webp)(?:[?#].*)?$/i;

var Utils = window.Utils || {
  isMobileViewport: () => window.matchMedia('(max-width: 720px)').matches,
  extractUrl: (item) => {
    const source = `${item?.name || ''} ${item?.raw_text || ''} ${item?.info || ''}`;
    const match = source.match(/https?:\/\/[^\s]+|discord\.gg\/[^\s]+|discord\.com\/invite\/[^\s]+/i);
    if (!match) return null;
    const raw = match[0];
    return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  },
  normalizeProvinceName: (name) => {
    if (!name) return '';
    return String(name).trim().replace(/(壮族自治区|回族自治区|维吾尔自治区|特别行政区|自治区|省|市)$/g, '');
  },
  getClubProvinceNames: (club) => {
    const values = [];
    if (Array.isArray(club?.provinces)) {
      values.push(...club.provinces);
    } else if (club?.province) {
      values.push(...String(club.province).split(/[+＋/／、,，;；|｜]/));
    } else if (club?.prefecture) {
      values.push(club.prefecture);
    }
    const seen = new Set();
    return values
      .map((value) => Utils.normalizeProvinceName(value))
      .filter((value) => {
        if (!value || seen.has(value)) return false;
        seen.add(value);
        return true;
      });
  },
  groupTypeText: (type) => {
    const map = { school: 'typeSchool', region: 'typeRegion', vnfest: 'typeVnfest' };
    return window.__ ? window.__(map[type] || 'typeSchool') : (map[type] || 'typeSchool');
  },
  typeFilterValue: (type) => ({ school: 'school', region: 'region', vnfest: 'vnfest' }[type] || 'other'),
  formatCreatedAt: (value) => {
    if (!value) return window.__ ? window.__('detailUnknownDate') : '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  },
  escapeHTML: (value) => String(value || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;'),
  resolveMediaUrl: (value) => {
    const url = String(value || '').trim();
    if (!url) return '';
    if (/^(https?:|data:|blob:)/i.test(url)) return url;
    const cleanPath = url.replace(/^\.?\//, '');
    const isBundledClient = window.location.protocol === 'file:' ||
      window.location.protocol === 'capacitor:' ||
      window.location.protocol === 'ionic:' ||
      window.location.protocol === 'app:' ||
      Boolean(window.Capacitor);
    if (isBundledClient && /^(data|uploads)\//.test(cleanPath)) {
      return CONFIG.PUBLIC_BASE_URL.replace(/\/$/, '') + '/' + cleanPath;
    }
    return url;
  },
  preloadMediaUrl: (value) => {
    const url = Utils.resolveMediaUrl(value);
    if (!url || !VNFEST_IMAGE_URL_RE.test(url) || VNFEST_MEDIA_PRELOADS.has(url)) return url;
    VNFEST_MEDIA_PRELOADS.add(url);
    if (typeof Image === 'undefined') return url;
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    return url;
  },
  enhanceImages: (root) => {
    const scope = root && root.querySelectorAll ? root : document;
    const images = scope.tagName === 'IMG' ? [scope] : Array.from(scope.querySelectorAll('img'));
    images.forEach((img) => {
      if (!img.hasAttribute('decoding')) img.setAttribute('decoding', 'async');
      if (
        !img.hasAttribute('loading') &&
        !img.closest('[data-eager-images]') &&
        !img.closest('[style*="display:none"]') &&
        !img.id
      ) {
        img.setAttribute('loading', 'lazy');
      }
    });
  },
  debounce: (fn, delay) => {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }
};

window.CONFIG = CONFIG;
window.Utils = Utils;
window.AppCore = { CONFIG, Utils };
window.VNFEST_MEDIA_PRELOADS = VNFEST_MEDIA_PRELOADS;

function setupVNFestImageDefaults() {
  if (!document.querySelectorAll) return;
  Utils.enhanceImages(document);
  if (!window.MutationObserver) return;
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === 1) Utils.enhanceImages(node);
      });
    });
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupVNFestImageDefaults, { once: true });
  } else {
    setupVNFestImageDefaults();
  }
}
