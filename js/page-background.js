(function () {
  var script = document.currentScript;
  if (!script) return;

  var rootUrl = new URL('../', script.src);
  var apiUrl = new URL('api/backgrounds.php', rootUrl);
  var storageKey = 'vnfestWallpaperPreference';
  var layerId = 'vnfestWallpaperLayer';
  var pickerId = 'vnfestWallpaperPicker';
  var styleId = 'vnfestWallpaperStyle';
  var pickerMode = script.getAttribute('data-picker') || '';
  var pickerAnchorId = script.getAttribute('data-anchor') || '';
  var waitForMap = script.hasAttribute('data-after-map');
  var mobileWallpaperQuery = window.matchMedia ? window.matchMedia('(max-width: 720px), (pointer: coarse)') : null;
  var initStarted = false;
  var fallbackImages = [
    { name: '默认壁纸', file: 'fd912ee18f271bb0cb042bda8ca85d8c.jpeg', url: 'images/fd912ee18f271bb0cb042bda8ca85d8c.jpeg' }
  ];

  function isMobileWallpaperDisabled() {
    return !!(mobileWallpaperQuery && mobileWallpaperQuery.matches);
  }

  function removeWallpaperUi() {
    document.documentElement.classList.remove('has-vnfest-wallpaper');
    var layer = document.getElementById(layerId);
    if (layer) layer.remove();
    var picker = document.getElementById(pickerId);
    if (picker) picker.remove();
  }

  function injectStyle() {
    if (document.getElementById(styleId)) return;
    var style = document.createElement('style');
    style.id = styleId;
    style.textContent = [
      'html.has-vnfest-wallpaper body{background:#090909!important;background-attachment:fixed;position:relative;isolation:isolate;}',
      '#vnfestWallpaperLayer{position:fixed;inset:0;z-index:-1;pointer-events:none;background-position:center;background-size:cover;background-repeat:no-repeat;opacity:1;transform:scale(1.015);}',
      '#vnfestWallpaperLayer::before,#vnfestWallpaperLayer::after{content:"";position:absolute;inset:0;pointer-events:none;}',
      '#vnfestWallpaperLayer::before{background-image:linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px);background-size:42px 42px;mask-image:linear-gradient(90deg,transparent,#000 15%,#000 86%,transparent);opacity:.72;}',
      '#vnfestWallpaperLayer::after{background:linear-gradient(90deg,rgba(9,9,9,.91),rgba(9,9,9,.54) 48%,rgba(9,9,9,.90)),linear-gradient(115deg,rgba(231,76,60,.18),transparent 34%),linear-gradient(245deg,rgba(95,183,215,.14),transparent 38%),radial-gradient(circle at 50% 44%,rgba(255,255,255,.08),transparent 34%);}',
      'html[data-theme="light"].has-vnfest-wallpaper body{background:#f4f1ec!important;}',
      'html[data-theme="light"] #vnfestWallpaperLayer::before{background-image:linear-gradient(rgba(92,58,44,.055) 1px,transparent 1px),linear-gradient(90deg,rgba(92,58,44,.055) 1px,transparent 1px);}',
      'html[data-theme="light"] #vnfestWallpaperLayer::after{background:linear-gradient(90deg,rgba(244,241,236,.88),rgba(244,241,236,.52) 48%,rgba(244,241,236,.90)),linear-gradient(115deg,rgba(231,76,60,.12),transparent 34%),linear-gradient(245deg,rgba(40,124,154,.10),transparent 38%),radial-gradient(circle at 50% 44%,rgba(255,255,255,.34),transparent 36%);}',
      'html.has-vnfest-wallpaper #map{background:transparent;isolation:isolate;}',
      'html.has-vnfest-wallpaper #map::before{content:"";position:absolute;inset:0;z-index:0;pointer-events:none;background:radial-gradient(ellipse at 52% 46%,rgba(255,255,255,.18),rgba(255,255,255,.06) 32%,transparent 62%);}',
      'html.has-vnfest-wallpaper #map::after{content:"";position:absolute;inset:0;z-index:0;pointer-events:none;background:linear-gradient(180deg,rgba(255,255,255,.05),transparent 22%,transparent 74%,rgba(0,0,0,.10));}',
      'html.has-vnfest-wallpaper:not([data-theme="light"]) #map::before,html.has-vnfest-wallpaper[data-theme="dark"] #map::before{background:radial-gradient(ellipse at 52% 46%,rgba(255,230,222,.08),rgba(120,70,60,.05) 34%,transparent 64%);}',
      'html.has-vnfest-wallpaper #mapSvg{position:relative;z-index:1;background:transparent;filter:drop-shadow(0 24px 44px rgba(15,23,42,.24)) saturate(.98);}',
      'html.has-vnfest-wallpaper .province{fill:rgba(255,205,201,.82)!important;stroke:rgba(255,255,255,.82);stroke-width:1.15;}',
      'html.has-vnfest-wallpaper .province:hover,html.has-vnfest-wallpaper .province.selected{fill:rgba(231,76,60,.96)!important;stroke:rgba(255,255,255,.98);filter:drop-shadow(0 8px 14px rgba(231,76,60,.28));}',
      'html.has-vnfest-wallpaper:not([data-theme="light"]) .province,html.has-vnfest-wallpaper[data-theme="dark"] .province{fill:rgba(102,45,38,.86)!important;stroke:rgba(255,216,211,.30);}',
      'html.has-vnfest-wallpaper:not([data-theme="light"]) .province:hover,html.has-vnfest-wallpaper:not([data-theme="light"]) .province.selected,html.has-vnfest-wallpaper[data-theme="dark"] .province:hover,html.has-vnfest-wallpaper[data-theme="dark"] .province.selected{fill:rgba(231,76,60,.94)!important;stroke:rgba(255,216,211,.74);}',
      'html.has-vnfest-wallpaper .md3-card,html.has-vnfest-wallpaper .user-info-card,html.has-vnfest-wallpaper .mobile-drawer-content,html.has-vnfest-wallpaper .calendar-modal-card,html.has-vnfest-wallpaper .event-poster-card,html.has-vnfest-wallpaper .notif-center-modal,html.has-vnfest-wallpaper .notif-panel{border-color:rgba(255,255,255,.16);background:linear-gradient(135deg,rgba(255,255,255,.82),rgba(255,255,255,.64));backdrop-filter:blur(20px) saturate(1.28);-webkit-backdrop-filter:blur(20px) saturate(1.28);box-shadow:0 28px 76px rgba(0,0,0,.18),0 8px 22px rgba(231,76,60,.08);}',
      'html.has-vnfest-wallpaper #introCard,html.has-vnfest-wallpaper #selectedCard{border-radius:8px;}',
      'html.has-vnfest-wallpaper #introCard::after,html.has-vnfest-wallpaper #selectedCard::after,html.has-vnfest-wallpaper .user-info-card::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;background:linear-gradient(120deg,rgba(255,255,255,.18),transparent 30%,transparent 70%,rgba(255,255,255,.08));opacity:.56;}',
      'html.has-vnfest-wallpaper .card-title,html.has-vnfest-wallpaper #selectedTitle{letter-spacing:0;text-shadow:0 1px 18px rgba(255,255,255,.22);}',
      'html.has-vnfest-wallpaper:not([data-theme="light"]) .md3-card,html.has-vnfest-wallpaper[data-theme="dark"] .md3-card,html.has-vnfest-wallpaper:not([data-theme="light"]) .user-info-card,html.has-vnfest-wallpaper[data-theme="dark"] .user-info-card{color:rgba(255,248,245,.90);}',
      'html.has-vnfest-wallpaper:not([data-theme="light"]) .card-body,html.has-vnfest-wallpaper[data-theme="dark"] .card-body,html.has-vnfest-wallpaper:not([data-theme="light"]) .gpl-text,html.has-vnfest-wallpaper[data-theme="dark"] .gpl-text,html.has-vnfest-wallpaper:not([data-theme="light"]) .user-name,html.has-vnfest-wallpaper[data-theme="dark"] .user-name{color:rgba(255,248,245,.72);}',
      'html.has-vnfest-wallpaper:not([data-theme="light"]) #siteFooter a,html.has-vnfest-wallpaper[data-theme="dark"] #siteFooter a{background:rgba(255,255,255,.88);color:#ef4f43;box-shadow:0 10px 26px rgba(0,0,0,.28);}',
      'html.has-vnfest-wallpaper .list-mode-view{background:transparent;}',
      'html.has-vnfest-wallpaper .list-mode-inner{position:relative;background:linear-gradient(180deg,rgba(255,255,255,.34),rgba(255,255,255,.12));backdrop-filter:none;-webkit-backdrop-filter:none;}',
      'html.has-vnfest-wallpaper .list-mode-inner::before{content:"";position:absolute;inset:76px 18px 18px;z-index:0;pointer-events:none;border-radius:8px;background:radial-gradient(circle at 50% 24%,rgba(255,255,255,.54),rgba(255,255,255,.20) 38%,rgba(255,255,255,.07) 66%,transparent 82%);box-shadow:0 32px 92px rgba(0,0,0,.14);}',
      'html.has-vnfest-wallpaper .list-top-bar,html.has-vnfest-wallpaper .list-left,html.has-vnfest-wallpaper .list-center,html.has-vnfest-wallpaper .list-content{position:relative;z-index:1;border-color:rgba(255,255,255,.22);background:linear-gradient(135deg,rgba(255,255,255,.78),rgba(255,255,255,.58));backdrop-filter:blur(20px) saturate(1.24);-webkit-backdrop-filter:blur(20px) saturate(1.24);box-shadow:0 24px 64px rgba(0,0,0,.16),0 8px 22px rgba(231,76,60,.07);}',
      'html.has-vnfest-wallpaper .list-top-bar{margin:10px 14px 0;border:1px solid rgba(255,255,255,.22);border-radius:8px;padding:10px 16px;}',
      'html.has-vnfest-wallpaper .list-toolbar{background:rgba(255,255,255,.40);border-bottom-color:rgba(255,255,255,.22);}',
      'html.has-vnfest-wallpaper .club-card{border-color:rgba(255,255,255,.22);background:linear-gradient(135deg,rgba(255,255,255,.72),rgba(255,255,255,.54));box-shadow:0 12px 30px rgba(0,0,0,.10);backdrop-filter:blur(14px) saturate(1.12);-webkit-backdrop-filter:blur(14px) saturate(1.12);}',
      'html.has-vnfest-wallpaper .club-card:hover{background:rgba(255,255,255,.82);box-shadow:0 18px 40px rgba(0,0,0,.14);}',
      'html.has-vnfest-wallpaper .list-province-list .province-index-item:hover,html.has-vnfest-wallpaper .list-ann-item:hover{background:rgba(255,255,255,.55);border-color:rgba(255,255,255,.28);}',
      'html.has-vnfest-wallpaper .list-province-list .province-index-item.active{background:rgba(231,76,60,.16);border-color:rgba(231,76,60,.34);color:var(--md-primary);}',
      'html.has-vnfest-wallpaper .list-search-input,html.has-vnfest-wallpaper .list-type-filter,html.has-vnfest-wallpaper .list-sort-select{border-color:rgba(255,255,255,.30);background:rgba(255,255,255,.64);}',
      'html.has-vnfest-wallpaper .list-empty-state{background:rgba(255,255,255,.44);border-color:rgba(255,255,255,.28);}',
      'html.has-vnfest-wallpaper:not([data-theme="light"]) .list-mode-inner,html.has-vnfest-wallpaper[data-theme="dark"] .list-mode-inner{background:linear-gradient(180deg,rgba(9,9,9,.16),rgba(9,9,9,.30));}',
      'html.has-vnfest-wallpaper:not([data-theme="light"]) .list-mode-inner::before,html.has-vnfest-wallpaper[data-theme="dark"] .list-mode-inner::before{background:radial-gradient(circle at 50% 24%,rgba(40,36,34,.58),rgba(20,18,17,.30) 40%,rgba(10,10,10,.10) 68%,transparent 84%);box-shadow:0 36px 110px rgba(0,0,0,.32);}',
      'html.has-vnfest-wallpaper:not([data-theme="light"]) .list-top-bar,html.has-vnfest-wallpaper[data-theme="dark"] .list-top-bar,html.has-vnfest-wallpaper:not([data-theme="light"]) .list-left,html.has-vnfest-wallpaper[data-theme="dark"] .list-left,html.has-vnfest-wallpaper:not([data-theme="light"]) .list-center,html.has-vnfest-wallpaper[data-theme="dark"] .list-center,html.has-vnfest-wallpaper:not([data-theme="light"]) .list-content,html.has-vnfest-wallpaper[data-theme="dark"] .list-content{border-color:rgba(255,255,255,.12);background:linear-gradient(135deg,rgba(18,17,16,.84),rgba(31,29,28,.62));box-shadow:0 28px 80px rgba(0,0,0,.40),0 10px 28px rgba(231,76,60,.10);}',
      'html.has-vnfest-wallpaper:not([data-theme="light"]) .list-toolbar,html.has-vnfest-wallpaper[data-theme="dark"] .list-toolbar{background:rgba(18,17,16,.38);border-bottom-color:rgba(255,255,255,.10);}',
      'html.has-vnfest-wallpaper:not([data-theme="light"]) .club-card,html.has-vnfest-wallpaper[data-theme="dark"] .club-card{border-color:rgba(255,255,255,.10);background:linear-gradient(135deg,rgba(28,26,25,.78),rgba(36,33,31,.56));box-shadow:0 16px 40px rgba(0,0,0,.32);}',
      'html.has-vnfest-wallpaper:not([data-theme="light"]) .club-card:hover,html.has-vnfest-wallpaper[data-theme="dark"] .club-card:hover{background:rgba(38,35,33,.80);}',
      'html.has-vnfest-wallpaper:not([data-theme="light"]) .list-search-input,html.has-vnfest-wallpaper[data-theme="dark"] .list-search-input,html.has-vnfest-wallpaper:not([data-theme="light"]) .list-type-filter,html.has-vnfest-wallpaper[data-theme="dark"] .list-type-filter,html.has-vnfest-wallpaper:not([data-theme="light"]) .list-sort-select,html.has-vnfest-wallpaper[data-theme="dark"] .list-sort-select{border-color:rgba(255,255,255,.12);background:rgba(10,10,10,.42);color:rgba(255,248,245,.88);}',
      'html.has-vnfest-wallpaper:not([data-theme="light"]) .list-intro-title,html.has-vnfest-wallpaper[data-theme="dark"] .list-intro-title,html.has-vnfest-wallpaper:not([data-theme="light"]) .list-toolbar-title,html.has-vnfest-wallpaper[data-theme="dark"] .list-toolbar-title,html.has-vnfest-wallpaper:not([data-theme="light"]) .club-card-name,html.has-vnfest-wallpaper[data-theme="dark"] .club-card-name{color:rgba(255,248,245,.92);}',
      'html.has-vnfest-wallpaper:not([data-theme="light"]) .list-intro-desc,html.has-vnfest-wallpaper[data-theme="dark"] .list-intro-desc,html.has-vnfest-wallpaper:not([data-theme="light"]) .list-toolbar-subtitle,html.has-vnfest-wallpaper[data-theme="dark"] .list-toolbar-subtitle,html.has-vnfest-wallpaper:not([data-theme="light"]) .club-card-desc,html.has-vnfest-wallpaper[data-theme="dark"] .club-card-desc,html.has-vnfest-wallpaper:not([data-theme="light"]) .club-card-location,html.has-vnfest-wallpaper[data-theme="dark"] .club-card-location{color:rgba(255,248,245,.66);}',
      'html.has-vnfest-wallpaper .group-item{background:rgba(255,255,255,.58);border-color:rgba(255,255,255,.34);backdrop-filter:blur(12px);}',
      'html.has-vnfest-wallpaper .group-item:hover{background:rgba(255,255,255,.76);box-shadow:0 12px 30px rgba(0,0,0,.12);}',
      'html.has-vnfest-wallpaper:not([data-theme="light"]) .md3-card,html.has-vnfest-wallpaper[data-theme="dark"] .md3-card,html.has-vnfest-wallpaper:not([data-theme="light"]) .user-info-card,html.has-vnfest-wallpaper[data-theme="dark"] .user-info-card,html.has-vnfest-wallpaper:not([data-theme="light"]) .mobile-drawer-content,html.has-vnfest-wallpaper[data-theme="dark"] .mobile-drawer-content,html.has-vnfest-wallpaper:not([data-theme="light"]) .calendar-modal-card,html.has-vnfest-wallpaper[data-theme="dark"] .calendar-modal-card,html.has-vnfest-wallpaper:not([data-theme="light"]) .event-poster-card,html.has-vnfest-wallpaper[data-theme="dark"] .event-poster-card,html.has-vnfest-wallpaper:not([data-theme="light"]) .notif-center-modal,html.has-vnfest-wallpaper[data-theme="dark"] .notif-center-modal,html.has-vnfest-wallpaper:not([data-theme="light"]) .notif-panel,html.has-vnfest-wallpaper[data-theme="dark"] .notif-panel{border-color:rgba(255,255,255,.12);background:linear-gradient(135deg,rgba(18,17,16,.86),rgba(31,29,28,.64));box-shadow:0 28px 80px rgba(0,0,0,.42),0 10px 28px rgba(231,76,60,.10);}',
      'html.has-vnfest-wallpaper:not([data-theme="light"]) .group-item,html.has-vnfest-wallpaper[data-theme="dark"] .group-item{background:rgba(26,25,24,.64);border-color:rgba(255,255,255,.10);}',
      'html.has-vnfest-wallpaper:not([data-theme="light"]) .group-item:hover,html.has-vnfest-wallpaper[data-theme="dark"] .group-item:hover{background:rgba(32,31,30,.82);}',
      '.vnfest-wallpaper-picker{position:fixed;right:14px;bottom:14px;z-index:9999;max-width:min(220px,calc(100vw - 28px));min-height:32px;padding:5px 30px 5px 10px;border:1px solid rgba(255,255,255,.16);border-radius:7px;background:rgba(18,17,16,.84);color:#f4f1ec;backdrop-filter:blur(18px) saturate(1.18);font:700 12px "Noto Sans SC",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;box-shadow:0 16px 36px rgba(0,0,0,.22);outline:none;}',
      '.vnfest-wallpaper-picker.is-anchored{position:static;z-index:auto;width:100%;max-width:none;min-height:34px;margin:0 0 10px;background:rgba(255,255,255,.10);color:var(--md-on-surface,#f4f1ec);box-shadow:none;}',
      '.vnfest-wallpaper-picker:focus{border-color:rgba(231,76,60,.68);box-shadow:0 0 0 3px rgba(231,76,60,.16),0 12px 34px rgba(0,0,0,.22);}',
      '.vnfest-wallpaper-picker.is-anchored:focus{box-shadow:0 0 0 3px rgba(231,76,60,.16);}',
      'html[data-theme="light"] .vnfest-wallpaper-picker{background:rgba(255,255,255,.88);color:#2d1e18;border-color:rgba(69,42,32,.12);}',
      'html[data-theme="light"] .vnfest-wallpaper-picker.is-anchored{background:rgba(255,255,255,.50);}',
      '@media(max-width:700px){.vnfest-wallpaper-picker{right:10px;bottom:10px;max-width:170px;}}'
    ].join('');
    document.head.appendChild(style);
  }

  function ensureLayer() {
    var layer = document.getElementById(layerId);
    if (layer) return layer;
    layer = document.createElement('div');
    layer.id = layerId;
    layer.setAttribute('aria-hidden', 'true');
    document.body.prepend(layer);
    return layer;
  }

  function toAbsoluteImageUrl(item) {
    return new URL(item.url, rootUrl).toString();
  }

  function applyWallpaper(url) {
    if (isMobileWallpaperDisabled()) {
      removeWallpaperUi();
      return;
    }
    if (!url) return;
    injectStyle();
    var layer = ensureLayer();
    layer.style.backgroundImage = 'url("' + String(url).replace(/"/g, '\\"') + '")';
    document.documentElement.classList.add('has-vnfest-wallpaper');
  }

  function pickRandom(images) {
    if (!images || !images.length) return null;
    return images[Math.floor(Math.random() * images.length)];
  }

  function findByUrl(images, url) {
    return images.find(function (item) {
      return toAbsoluteImageUrl(item) === url || item.url === url;
    });
  }

  function readPreference() {
    try { return localStorage.getItem(storageKey) || ''; } catch (e) { return ''; }
  }

  function writePreference(value) {
    try {
      if (value && value !== '__random__') localStorage.setItem(storageKey, value);
      else localStorage.removeItem(storageKey);
    } catch (e) {}
  }

  function installPicker(images, activeUrl) {
    if (isMobileWallpaperDisabled()) return;
    if (!pickerMode || document.getElementById(pickerId)) return;
    var select = document.createElement('select');
    select.id = pickerId;
    select.className = 'vnfest-wallpaper-picker';
    select.setAttribute('aria-label', '选择页面壁纸');
    select.title = '选择页面壁纸';

    var randomOption = document.createElement('option');
    randomOption.value = '__random__';
    randomOption.textContent = '随机壁纸';
    select.appendChild(randomOption);

    images.forEach(function (item) {
      var option = document.createElement('option');
      option.value = toAbsoluteImageUrl(item);
      option.textContent = item.name || item.file || '壁纸';
      select.appendChild(option);
    });

    select.value = findByUrl(images, activeUrl) ? activeUrl : '__random__';
    select.addEventListener('change', function () {
      if (select.value === '__random__') {
        writePreference('__random__');
        var random = pickRandom(images);
        if (random) applyWallpaper(toAbsoluteImageUrl(random));
        return;
      }
      writePreference(select.value);
      applyWallpaper(select.value);
    });

    var anchor = pickerAnchorId ? document.getElementById(pickerAnchorId) : null;
    if (anchor) {
      select.classList.add('is-anchored');
      var firstSwitch = anchor.querySelector('.md3-switch');
      anchor.insertBefore(select, firstSwitch || anchor.firstChild);
    } else {
      document.body.appendChild(select);
    }
  }

  function isMapRendered() {
    var svg = document.getElementById('mapSvg');
    return !!(svg && svg.querySelector('.province, path, g, circle'));
  }

  function waitForMapReady() {
    if (!waitForMap) return Promise.resolve();
    if (window.__vnfestMapReady || isMapRendered()) return Promise.resolve();
    return new Promise(function (resolve) {
      var done = false;
      var pollTimer = null;
      var finish = function () {
        if (done) return;
        done = true;
        if (pollTimer) clearInterval(pollTimer);
        window.removeEventListener('vnfest:map-ready', finish);
        resolve();
      };
      window.addEventListener('vnfest:map-ready', finish, { once: true });
      pollTimer = setInterval(function () {
        if (window.__vnfestMapReady || isMapRendered()) finish();
      }, 120);
      setTimeout(finish, 8000);
    });
  }

  async function init() {
    if (initStarted) return;
    if (isMobileWallpaperDisabled()) {
      removeWallpaperUi();
      return;
    }
    initStarted = true;
    await waitForMapReady();
    if (isMobileWallpaperDisabled()) {
      removeWallpaperUi();
      initStarted = false;
      return;
    }
    var images = fallbackImages.slice();
    try {
      var resp = await fetch(apiUrl.toString(), { credentials: 'same-origin' });
      var data = await resp.json();
      if (data && Array.isArray(data.images) && data.images.length) {
        images = data.images;
      }
    } catch (e) {}

    if (!images.length) {
      initStarted = false;
      return;
    }
    var saved = readPreference();
    var selected = saved ? findByUrl(images, saved) : null;
    var item = selected || pickRandom(images);
    if (!item) {
      initStarted = false;
      return;
    }

    var url = toAbsoluteImageUrl(item);
    applyWallpaper(url);
    installPicker(images, selected ? url : '');
    initStarted = false;
  }

  function installMobileWallpaperGuard() {
    if (!mobileWallpaperQuery) return;
    var handleChange = function () {
      if (isMobileWallpaperDisabled()) {
        removeWallpaperUi();
        initStarted = false;
      } else {
        init();
      }
    };
    if (mobileWallpaperQuery.addEventListener) {
      mobileWallpaperQuery.addEventListener('change', handleChange);
    } else if (mobileWallpaperQuery.addListener) {
      mobileWallpaperQuery.addListener(handleChange);
    }
  }

  installMobileWallpaperGuard();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
