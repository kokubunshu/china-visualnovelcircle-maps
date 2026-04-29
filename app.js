// ==========================================
// 1. 常量与全局状态管理
// ==========================================
const CONFIG = {
  BASE_WIDTH: 960,
  BASE_HEIGHT: 700,
  API_URL: './galgame_clubs.json',
  FALLBACK_URLS: ['./galgame_clubs.json'],
  POLYMERIZATION_URL: ''
};

const State = {
  bandoriRows: [],
  provinceGroupsMap: new Map(),
  selectedProvinceKey: null,
  mapViewState: null,
  selectedCardAnimToken: 0,
  activeBubbleState: null,
  bubbleAnimToken: 0,
  invertCtrlBubble: false,
  developerModeEnabled: false,
  globalSearchEnabled: false,
  themePreference: 'system',
  systemThemeMediaQuery: null,
  currentDetailProvinceName: '',
  currentDetailRows: [],
  listQuery: '',
  listType: 'all',
  listSort: 'default',
  currentDataSource: 'none',
  mobileSheetHeightPx: null,
  resetClickBurstCount: 0,
  resetClickBurstTimer: null,
};

// 全局变量
let adminMode = false;
let currentEditClubId = null;
const ADMIN_PASSWORD = 'ciallo';

// ==========================================
// 2. 核心工具函数
// ==========================================
const Utils = {
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
  groupTypeText: (type) => ({ school: '高校同好会', region: '地区高校联合', 'vnfest': '视觉小说学园祭' }[type] || '其他'),
  typeFilterValue: (type) => ({ school: 'school', region: 'region', 'vnfest': 'vnfest' }[type] || 'other'),
  formatCreatedAt: (value) => {
    if (!value) return '成立时间未知';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  },
  escapeHTML: (value) => String(value || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;'),
  debounce: (fn, delay) => {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }
};

// ==========================================
// 3. UI 与 DOM 操作
// ==========================================
function applyMobileModeLayout() {
  const els = {
    map: document.getElementById('map'),
    selectedCard: document.getElementById('selectedCard'),
    overseasBtn: document.getElementById('overseasToggleBtn'),
    sheetHandle: document.getElementById('mobileSheetHandle'),
    controlCard: document.getElementById('controlCard'),
    introCard: document.getElementById('introCard')
  };
  if (!els.map || !els.selectedCard || !els.overseasBtn || !els.controlCard || !els.introCard || !els.sheetHandle) return;

  const nonRegionalBtn = document.getElementById('nonRegionalToggleBtn');
  const calendarBtn = document.getElementById('calendarToggleBtn');

  if (Utils.isMobileViewport()) {
    if (els.overseasBtn.parentElement !== els.selectedCard || els.sheetHandle.parentElement !== els.selectedCard) {
      els.selectedCard.insertBefore(els.sheetHandle, els.selectedCard.firstChild);
      els.selectedCard.insertBefore(els.overseasBtn, els.sheetHandle.nextSibling);
      if (nonRegionalBtn) {
        els.selectedCard.insertBefore(nonRegionalBtn, els.overseasBtn.nextSibling);
      }
      if (calendarBtn) {
        els.selectedCard.insertBefore(calendarBtn, (nonRegionalBtn || els.overseasBtn).nextSibling);
      }
    }
    els.overseasBtn.classList.add('mobile-inside');
    nonRegionalBtn?.classList.add('mobile-inside');
    calendarBtn?.classList.add('mobile-inside');
    els.controlCard.classList.add('mobile-hidden');
    els.introCard.classList.add('collapsed');

    if (State.mobileSheetHeightPx) {
      els.selectedCard.style.height = `${State.mobileSheetHeightPx}px`;
    } else if (!els.selectedCard.style.height) {
      els.selectedCard.style.height = '46vh';
    }
  } else {
    if (els.overseasBtn.parentElement !== els.map) {
      els.map.insertBefore(els.overseasBtn, els.controlCard);
    }
    if (nonRegionalBtn && nonRegionalBtn.parentElement !== els.map) {
      els.map.insertBefore(nonRegionalBtn, els.controlCard);
    }
    if (calendarBtn && calendarBtn.parentElement !== els.map) {
      els.map.insertBefore(calendarBtn, els.controlCard);
    }
    if (els.sheetHandle.parentElement !== els.map) {
      els.map.insertBefore(els.sheetHandle, els.controlCard);
    }
    els.overseasBtn.classList.remove('mobile-inside');
    nonRegionalBtn?.classList.remove('mobile-inside');
    calendarBtn?.classList.remove('mobile-inside');
    els.controlCard.classList.remove('mobile-hidden');
    els.selectedCard.style.height = '';
  }
}

function getPreferredTheme() {
  if (State.themePreference === 'light' || State.themePreference === 'dark') return State.themePreference;
  return State.systemThemeMediaQuery?.matches ? 'dark' : 'light';
}

function updateThemeMetaColor(theme) {
  const metaThemeColor = document.querySelector('meta[name="theme-color"]:not([media])');
  if (!metaThemeColor) return;
  metaThemeColor.setAttribute('content', theme === 'dark' ? '#140913' : '#9b59b6');

  const supportsDynamicThemeColor = window.matchMedia('(display-mode: browser)').matches || window.matchMedia('(display-mode: standalone)').matches;
  if (supportsDynamicThemeColor) {
    document.documentElement.style.setProperty('background-color', theme === 'dark' ? '#140913' : '#fff7fa');
    document.body.style.setProperty('background-color', theme === 'dark' ? '#140913' : '#fff7fa');
  }
}

function updateThemeSwitchUI() {
  const themeSwitch = document.getElementById('themeSwitch');
  const label = document.getElementById('themeSwitchLabel');
  const effectiveTheme = getPreferredTheme();
  if (themeSwitch) themeSwitch.checked = effectiveTheme === 'dark';
  if (label) {
    label.textContent = State.themePreference === 'system'
      ? `暗黑模式（跟随系统：${effectiveTheme === 'dark' ? '开' : '关'}）`
      : `暗黑模式（临时${effectiveTheme === 'dark' ? '开启' : '关闭'}）`;
  }
}

function applyThemePreference() {
  const effectiveTheme = getPreferredTheme();
  if (State.themePreference === 'system') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', effectiveTheme);
  }
  updateThemeMetaColor(effectiveTheme);
  updateThemeSwitchUI();
}

function setThemePreference(preference) {
  State.themePreference = preference;
  applyThemePreference();
}

function initThemePreference() {
  State.systemThemeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

  const handleSystemThemeChange = () => {
    if (State.themePreference === 'system') applyThemePreference();
  };

  if (typeof State.systemThemeMediaQuery.addEventListener === 'function') {
    State.systemThemeMediaQuery.addEventListener('change', handleSystemThemeChange);
  } else if (typeof State.systemThemeMediaQuery.addListener === 'function') {
    State.systemThemeMediaQuery.addListener(handleSystemThemeChange);
  }

  applyThemePreference();
}

function bindMobileSheetResize() {
  const handle = document.getElementById('mobileSheetHandle');
  const card = document.getElementById('selectedCard');
  if (!handle || !card || handle.dataset.bound === 'true') return;
  handle.dataset.bound = 'true';

  let startY = 0;
  let startHeight = 0;
  let dragging = false;

  const minHeight = () => Math.round(window.innerHeight * 0.28);
  const maxHeight = () => Math.round(window.innerHeight * 0.82);

  const updateHeight = (clientY) => {
    const delta = startY - clientY;
    const next = Math.max(minHeight(), Math.min(maxHeight(), startHeight + delta));
    State.mobileSheetHeightPx = next;
    card.style.height = `${next}px`;
  };

  const onMouseMove = (e) => {
    if (!dragging || !Utils.isMobileViewport()) return;
    updateHeight(e.clientY);
  };

  const onTouchMove = (e) => {
    if (!dragging || !Utils.isMobileViewport()) return;
    const touch = e.touches && e.touches[0];
    if (!touch) return;
    updateHeight(touch.clientY);
    e.preventDefault();
  };

  const stopDrag = () => {
    dragging = false;
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', stopDrag);
    document.removeEventListener('touchmove', onTouchMove);
    document.removeEventListener('touchend', stopDrag);
  };

  const startDrag = (clientY) => {
    if (!Utils.isMobileViewport()) return;
    dragging = true;
    startY = clientY;
    startHeight = card.getBoundingClientRect().height;
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', stopDrag);
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', stopDrag);
  };

  handle.addEventListener('mousedown', (e) => startDrag(e.clientY));
  handle.addEventListener('touchstart', (e) => {
    const touch = e.touches && e.touches[0];
    if (!touch) return;
    startDrag(touch.clientY);
  }, { passive: true });
}

function setGlobalSearchEnabled(enabled, options = { resetToDefault: false }) {
  State.globalSearchEnabled = !!enabled;
  const btn = document.getElementById('globalSearchBtn');
  
  if (btn) {
    btn.classList.toggle('active', State.globalSearchEnabled);
    btn.setAttribute('aria-pressed', State.globalSearchEnabled ? 'true' : 'false');
  }

  if (State.globalSearchEnabled) {
    State.selectedProvinceKey = null;
    State.currentDetailProvinceName = '';
    State.currentDetailRows = [];
    if (State.mapViewState?.g) {
      State.mapViewState.g.selectAll('.province').classed('selected', false);
    }
  } else if (options.resetToDefault) {
    State.selectedProvinceKey = null;
    State.currentDetailProvinceName = '';
    State.currentDetailRows = [];
    hideMapBubble();
    updateSummaryUI(State.currentDataSource);
  }
}

function updateSortButtonView() {
  const sortBar = document.getElementById('sortBar');
  if (!sortBar) return;

  sortBar.querySelectorAll('.sort-btn').forEach((btn) => {
    const key = btn.getAttribute('data-sort') || '';
    btn.classList.remove('active');

    const config = {
      default: { text: '默认', active: State.listSort === 'default', next: 'default' },
      time_desc: { text: State.listSort === 'time_asc' ? '成立时间 ↑' : '成立时间 ↓', active: ['time_asc', 'time_desc'].includes(State.listSort), next: State.listSort === 'time_asc' ? 'time_asc' : 'time_desc' },
      name_asc: { text: State.listSort === 'name_desc' ? '首字母 Z→A' : '首字母 A→Z', active: ['name_asc', 'name_desc'].includes(State.listSort), next: State.listSort === 'name_desc' ? 'name_desc' : 'name_asc' },
      type_asc: { text: State.listSort === 'type_desc' ? '类型 Z→A' : '类型 A→Z', active: ['type_asc', 'type_desc'].includes(State.listSort), next: State.listSort === 'type_desc' ? 'type_desc' : 'type_asc' }
    };

    const targetConfig = config[key.split('_')[0] + (key.includes('desc') ? '_desc' : (key === 'default' ? '' : '_asc'))] || config[key];
    
    if (targetConfig) {
      btn.textContent = targetConfig.text;
      if (targetConfig.active) btn.classList.add('active');
      btn.setAttribute('data-sort', targetConfig.next);
    }
  });
}

function getFilteredSortedRows(rows) {
  let result = rows.slice();

  if (State.listType !== 'all') {
    result = result.filter(item => Utils.typeFilterValue(item.type) === State.listType);
  }

  if (State.listQuery) {
    result = result.filter(item => 
      String(item.name || '').toLowerCase().includes(State.listQuery) || 
      String(item.info || '').toLowerCase().includes(State.listQuery)
    );
  }

  const sortStrategies = {
    time_desc: (a, b) => (new Date(b.created_at || 0).getTime() || 0) - (new Date(a.created_at || 0).getTime() || 0),
    time_asc: (a, b) => (new Date(a.created_at || 0).getTime() || 0) - (new Date(b.created_at || 0).getTime() || 0),
    name_asc: (a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN-u-co-pinyin'),
    name_desc: (a, b) => String(b.name || '').localeCompare(String(a.name || ''), 'zh-CN-u-co-pinyin'),
    type_asc: (a, b) => Utils.groupTypeText(a.type).localeCompare(Utils.groupTypeText(b.type), 'zh-CN-u-co-pinyin') || String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN-u-co-pinyin'),
    type_desc: (a, b) => Utils.groupTypeText(b.type).localeCompare(Utils.groupTypeText(a.type), 'zh-CN-u-co-pinyin') || String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN-u-co-pinyin'),
    default: (a, b) => {
      if ((b.verified || 0) !== (a.verified || 0)) return (b.verified || 0) - (a.verified || 0);
      return String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN');
    }
  };

  result.sort(sortStrategies[State.listSort] || sortStrategies.default);
  return result;
}

// ==========================================
// 核心：渲染同好会列表
// ==========================================
function renderGroupList(rows) {
  const listEl = document.getElementById('groupList');
  if (!listEl) return;

  if (!rows.length) {
    listEl.innerHTML = '<div class="empty-text">没有找到相关同好会</div>';
    return;
  }

  listEl.innerHTML = rows.map((item) => {
    const name = Utils.escapeHTML(item.name || '未命名组织');
    const rawText = Utils.escapeHTML(item.raw_text || item.name || '');
    const detectedUrl = Utils.extractUrl(item);
    const rawInfo = detectedUrl || item.info || '';
    const infoText = rawInfo || '无联系方式';
    const info = Utils.escapeHTML(infoText);
    const type = Utils.escapeHTML(Utils.groupTypeText(item.type));
    const verifyMeta = Utils.escapeHTML(item.verified ? '已登记' : '未登记') + ' · 成立时间：' + Utils.escapeHTML(Utils.formatCreatedAt(item.created_at));
    
    // 构建详情数据
    const clubData = encodeURIComponent(JSON.stringify({
      name: name,
      school: item.school || '',
      info: info,
      originalInfo: item.info || '',
      detectedUrl: detectedUrl,
      type: type,
      verifyMeta: verifyMeta,
      province: item.province || '',
      remark: item.remark || '暂无介绍'
    }));
    
    return `
        <article class="group-item" data-club='${clubData}'>
          <div class="group-top">
            <h3 class="group-name" title="${rawText}">${name}</h3>
            <span class="group-chip">${type}</span>
          </div>
          <div class="group-info-row">
            <p class="group-info" data-club='${clubData}'>${info}</p>
            <button class="copy-btn" data-club='${clubData}' type="button">查看详情</button>
          </div>
          <p class="group-meta">${verifyMeta}</p>
        </article>
    `;
  }).join('');

  // 绑定点击事件
  document.querySelectorAll('.group-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.classList.contains('copy-btn')) {
        return;
      }
      const clubData = item.getAttribute('data-club');
      if (clubData) {
        const club = JSON.parse(decodeURIComponent(clubData));
        if (adminMode) {
          openEditPanel(club);
        } else {
          showClubDetail(club);
        }
      }
    });
  });
  
  // 绑定联系方式点击事件
  document.querySelectorAll('.group-info').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const clubData = el.getAttribute('data-club');
      if (clubData) {
        showClubDetail(JSON.parse(decodeURIComponent(clubData)));
      }
    });
  });
  
  // 绑定按钮点击事件
  document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const clubData = btn.getAttribute('data-club');
      if (clubData) {
        showClubDetail(JSON.parse(decodeURIComponent(clubData)));
      }
    });
  });
}

// ==========================================
// 详情弹窗
// ==========================================
function showClubDetail(club) {
  const modal = document.getElementById('clubDetailModal');
  const title = document.getElementById('clubDetailName');
  const content = document.getElementById('clubDetailContent');
  
  if (!modal) {
    console.error('找不到 clubDetailModal 元素');
    return;
  }
  
  title.textContent = club.name;
  
  const contactInfo = club.originalInfo || club.info || '';
  const detectedUrl = club.detectedUrl;
  const isLink = detectedUrl || contactInfo.startsWith('http://') || contactInfo.startsWith('https://') || contactInfo.includes('discord.gg') || contactInfo.includes('discord.com/invite');
  const contactUrl = detectedUrl || (isLink ? contactInfo : null);
  
  const escapeHtml = (str) => {
    if (!str) return '';
    return String(str).replace(/[&<>]/g, function(m) {
      if (m === '&') return '&amp;';
      if (m === '<') return '&lt;';
      if (m === '>') return '&gt;';
      return m;
    });
  };
  
  const safeInfo = escapeHtml(club.info);
  const safeUrl = contactUrl ? escapeHtml(contactUrl) : '';
  
  let contactHtml = '';
  if (isLink && contactUrl) {
    contactHtml = `
      <div style="margin-bottom: 16px; padding: 12px; background: var(--md-surface-container); border-radius: 12px;">
        <strong>群聊号码</strong><br>
        <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" style="font-family: monospace; font-size: 16px; color: var(--md-primary); word-break: break-all;">${safeInfo}</a>
        <div style="margin-top: 12px;">
          <button onclick="window.open('${safeUrl.replace(/'/g, "\\'")}', '_blank')" style="margin-right: 10px; padding: 6px 16px; background: var(--md-primary); color: white; border: none; border-radius: 8px; cursor: pointer;">打开链接</button>
          <button onclick="navigator.clipboard.writeText('${safeUrl.replace(/'/g, "\\'")}')" style="padding: 6px 16px; background: var(--md-surface-container-high); color: var(--md-primary); border: 1px solid var(--md-outline); border-radius: 8px; cursor: pointer;">复制链接</button>
        </div>
      </div>
    `;
  } else {
    const safeInfoForCopy = safeInfo.replace(/'/g, "\\'");
    contactHtml = `
      <div style="margin-bottom: 16px; padding: 12px; background: var(--md-surface-container); border-radius: 12px;">
        <strong>群聊号码</strong><br>
        <span style="font-family: monospace; font-size: 16px; word-break: break-all;">${safeInfo || '无联系方式'}</span>
        ${safeInfo ? `<button onclick="navigator.clipboard.writeText('${safeInfoForCopy}')" style="margin-left: 10px; padding: 4px 12px; background: var(--md-primary); color: white; border: none; border-radius: 8px; cursor: pointer;">复制</button>` : ''}
      </div>
    `;
  }
  
  content.innerHTML = `
    <div style="margin-bottom: 16px; padding: 12px; background: var(--md-surface-container); border-radius: 12px;">
      <div style="display: flex; flex-wrap: wrap; gap: 16px;">
        <div style="flex: 1;">
          <strong>所在省份</strong><br>
          ${escapeHtml(club.province || '未填写')}
        </div>
        <div style="flex: 1;">
          <strong>同好会类型</strong><br>
          ${escapeHtml(club.type || '其他')}
        </div>
      </div>
    </div>
    
    ${contactHtml}
    
    <div style="margin-bottom: 16px; padding: 12px; background: var(--md-surface-container); border-radius: 12px;">
      <strong>${escapeHtml(club.verifyMeta || '成立时间未知')}</strong>
    </div>
    
    <div style="padding: 12px; background: var(--md-surface-container); border-radius: 12px;">
      <strong>介绍</strong><br>
      <div style="margin-top: 8px; line-height: 1.6;">${escapeHtml(club.remark || '暂无介绍，欢迎补充~')}</div>
    </div>
  `;
  
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  
  const closeBtn = document.getElementById('clubDetailClose');
  if (closeBtn) {
    const newCloseBtn = closeBtn.cloneNode(true);
    closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
    newCloseBtn.onclick = () => {
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
    };
  }
  
  modal.onclick = (e) => {
    if (e.target === modal) {
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
    }
  };
}

// ==========================================
// 继续其他函数...
// ==========================================
function renderCurrentDetail() {
  if (!State.currentDetailProvinceName && !State.globalSearchEnabled) return;

  const sourceRows = State.globalSearchEnabled ? State.bandoriRows : State.currentDetailRows;
  const filtered = getFilteredSortedRows(sourceRows);
  
  const schoolCount = filtered.filter(x => x.type === 'school').length;
  const regionCount = filtered.filter(x => x.type === 'region').length;
  const otherCount = filtered.length - schoolCount - regionCount;

  animateSelectedCardUpdate(() => {
    let displayTitle = State.currentDetailProvinceName;
    if (displayTitle === '非地区') {
      displayTitle = '国内同好会';
    }
    document.getElementById('selectedTitle').textContent = State.globalSearchEnabled ? '全局搜索 · 同好会详情' : `${displayTitle} · 同好会详情`;
    document.getElementById('selectedProvince').textContent = `${filtered.length} / ${sourceRows.length} 个组织`;
    document.getElementById('selectedMeta').textContent = `范围 ${State.globalSearchEnabled ? '全局' : State.currentDetailProvinceName || '未选择'} · 地区高校联合 ${regionCount} · 高校同好会 ${schoolCount} · 全国联合 ${otherCount}`;
    renderGroupList(filtered);
  });
}

function updateSummaryUI(source, animate = true) {
  const applySummary = () => {
    const mainlandTotal = Array.from(State.provinceGroupsMap.keys()).reduce((sum, key) => key === '海外' ? sum : sum + (State.provinceGroupsMap.get(key)?.length || 0), 0);
    
    document.getElementById('selectedTitle').textContent = '全国Galgame同好会数据';
    document.getElementById('selectedProvince').textContent = `${mainlandTotal} 个组织`;
    document.getElementById('selectedMeta').textContent = `数据源：${source}`;
    document.getElementById('groupList').innerHTML = '<div class="empty-text">点击地图省份查看该地区同好会信息</div>';
  };

  if (animate) animateSelectedCardUpdate(applySummary);
  else applySummary();

  document.getElementById('searchInput').value = '';
  document.getElementById('typeFilter').value = 'all';
  State.listQuery = '';
  State.listType = 'all';
  State.listSort = 'default';
  State.currentDetailProvinceName = '';
  State.currentDetailRows = [];
  
  updateSortButtonView();
  setGlobalSearchEnabled(false, { resetToDefault: false });
  document.getElementById('overseasToggleBtn')?.classList.remove('active');
  document.getElementById('nonRegionalToggleBtn')?.classList.remove('active');
}

function showProvinceDetails(provinceName) {
  const key = Utils.normalizeProvinceName(provinceName);
  State.currentDetailProvinceName = provinceName;
  
  if (provinceName === '国内同好会') {
    State.currentDetailRows = State.provinceGroupsMap.get('__non_regional__') || [];
  } else {
    State.currentDetailRows = State.provinceGroupsMap.get(key) || [];
  }
  renderCurrentDetail();

  const overseasBtn = document.getElementById('overseasToggleBtn');
  const nonRegionalBtn = document.getElementById('nonRegionalToggleBtn');
  if (overseasBtn) overseasBtn.classList.toggle('active', key === '海外');
  if (nonRegionalBtn) nonRegionalBtn.classList.toggle('active', provinceName === '国内同好会');
}

function animateSelectedCardUpdate(updateFn) {
  const card = document.getElementById('selectedCard');
  if (!card) return updateFn();

  State.selectedCardAnimToken++;
  const myToken = State.selectedCardAnimToken;

  const startHeight = card.getBoundingClientRect().height;
  card.style.height = `${startHeight}px`;
  card.classList.add('switching');

  updateFn();

  card.style.height = 'auto';
  const targetHeight = card.getBoundingClientRect().height;
  
  card.style.height = `${startHeight}px`;
  void card.offsetHeight;

  requestAnimationFrame(() => {
    if (myToken !== State.selectedCardAnimToken) return;
    card.style.height = `${targetHeight}px`;
  });

  const clear = () => {
    if (myToken !== State.selectedCardAnimToken) return;
    card.style.height = '';
    card.classList.remove('switching');
    card.removeEventListener('transitionend', clear);
  };
  card.addEventListener('transitionend', clear);
  setTimeout(clear, 560);
}

function hideMapBubble() {
  document.getElementById('badgeBubble')?.classList.remove('open');
  State.activeBubbleState = null;
}

function placeMapBubble(anchorX, anchorY) {
  if (!State.mapViewState) return;
  const bubble = document.getElementById('badgeBubble');
  if (!bubble) return;

  const transform = d3.zoomTransform(State.mapViewState.svg.node());
  bubble.style.left = `${transform.x + anchorX * transform.k}px`;
  bubble.style.top = `${transform.y + anchorY * transform.k}px`;
}

function showMapBubbleByProvince(provinceName, anchorX, anchorY) {
  const bubble = document.getElementById('badgeBubble');
  if (!bubble) return;

  const key = Utils.normalizeProvinceName(provinceName);
  const rows = State.provinceGroupsMap.get(key) || [];
  if (!rows.length) return hideMapBubble();

  State.bubbleAnimToken++;
  const myToken = State.bubbleAnimToken;
  const isCurrentlyOpen = bubble.classList.contains('open');
  let startRect;

  if (!isCurrentlyOpen) {
    bubble.classList.add('instant-place');
  }

  if (isCurrentlyOpen) {
    startRect = bubble.getBoundingClientRect();
    bubble.style.width = `${startRect.width}px`;
    bubble.style.height = `${startRect.height}px`;
  }

  bubble.innerHTML = `
    <div class="map-bubble-scroll">
      <h3 class="map-bubble-title">${Utils.escapeHTML(provinceName)} · ${rows.length} 个组织</h3>
      ${rows.slice(0, 12).map(item => `
        <article class="map-bubble-item" data-copy="${encodeURIComponent(String(item.info || ''))}" title="点击复制联系方式">
          <div class="bubble-name-wrap"><span class="bubble-name">${Utils.escapeHTML(item.name || '未命名')}</span></div>
          <div class="bubble-id">${Utils.escapeHTML(String(item.info || '无联系方式'))}</div>
        </article>
      `).join('')}
    </div>
  `;

  State.activeBubbleState = { provinceName, anchorX, anchorY };
  placeMapBubble(anchorX, anchorY);

  bubble.style.width = 'auto';
  bubble.style.height = 'auto';

  if (isCurrentlyOpen) {
    const targetRect = bubble.getBoundingClientRect();
    bubble.style.width = `${startRect.width}px`;
    bubble.style.height = `${startRect.height}px`;
    void bubble.offsetHeight;

    requestAnimationFrame(() => {
      if (myToken !== State.bubbleAnimToken) return;
      bubble.style.width = `${targetRect.width}px`;
      bubble.style.height = `${targetRect.height}px`;
    });

    setTimeout(() => {
      if (myToken === State.bubbleAnimToken) {
        bubble.style.width = '';
        bubble.style.height = '';
      }
    }, 420);
  }

  requestAnimationFrame(() => {
    bubble.classList.add('open');
    bubble.querySelectorAll('.bubble-name').forEach(el => {
      el.classList.toggle('marquee', el.scrollWidth > el.parentElement.clientWidth + 4);
    });

    if (!isCurrentlyOpen) {
      void bubble.offsetHeight;
      bubble.classList.remove('instant-place');
    }
  });
}

const MapUtils = {
  colorByCount: (count, maxCount) => {
    if (!count) return '#ffdce9';
    const ratio = Math.max(0, Math.min(1, count / Math.max(1, maxCount)));
    return ratio > 0.75 ? '#c2185b' : ratio > 0.5 ? '#d94f84' : ratio > 0.25 ? '#ec78a5' : '#f59cc0';
  },
  getBadgeOffset: (id) => ({ sh: { dx: 16, dy: -10 }, hk: { dx: 20, dy: -12 }, mc: { dx: -18, dy: 10 }, hb: { dx: 0, dy: 20 }, im: { dx: 0, dy: 0 } }[id] || { dx: 0, dy: 0 }),
  ensurePointInsideProvince: (pathNode, box, preferred) => {
    const svg = pathNode?.ownerSVGElement;
    if (!pathNode || !svg || typeof pathNode.isPointInFill !== 'function') return preferred;

    const test = (x, y) => {
      const pt = svg.createSVGPoint(); pt.x = x; pt.y = y;
      return pathNode.isPointInFill(pt);
    };

    const candidates = [
      [preferred.cx, preferred.cy],
      [box.x + box.width * 0.5, box.y + box.height * 0.62],
      [box.x + box.width * 0.35, box.y + box.height * 0.62],
      [box.x + box.width * 0.65, box.y + box.height * 0.62]
    ];

    for (let [x, y] of candidates) if (test(x, y)) return { cx: x, cy: y };
    return preferred;
  }
};

function renderChinaMap() {
  const mapEl = document.getElementById('map');
  const svgEl = document.getElementById('mapSvg');
  if (!mapEl || !svgEl) return;

  const w = mapEl.clientWidth || window.innerWidth;
  const h = mapEl.clientHeight || window.innerHeight;
  svgEl.innerHTML = '';

  const fitScale = Math.min(w / CONFIG.BASE_WIDTH, h / CONFIG.BASE_HEIGHT) * 0.95;
  const offsetX = (w - CONFIG.BASE_WIDTH * fitScale) / 2;
  const offsetY = (h - CONFIG.BASE_HEIGHT * fitScale) / 2;

  china().width(w).height(h).scale(1).language('cn').colorDefault('#ffdce9').colorLake('#ffffff').draw('#mapSvg');

  const svg = d3.select('#mapSvg');
  const g = svg.select('g');

  const allCounts = Array.from(State.provinceGroupsMap.entries()).filter(([k]) => k !== '海外').map(([, arr]) => arr.length);
  const maxCount = allCounts.length ? Math.max(...allCounts) : 1;

  g.selectAll('.province').each(function (d) {
    const count = State.provinceGroupsMap.get(Utils.normalizeProvinceName(d.name))?.length || 0;
    d3.select(this).style('fill', MapUtils.colorByCount(count, maxCount));
  });

  const badgeLayer = g.append('g').attr('class', 'count-layer');
  
  g.selectAll('.province').each(function (d) {
    const count = State.provinceGroupsMap.get(Utils.normalizeProvinceName(d.name))?.length || 0;
    if (!count) return;

    const box = this.getBBox();
    const preferredAnchor = { cx: box.x + box.width / (d.id === 'im' ? 2.8 : 2), cy: box.y + box.height / (d.id === 'im' ? 1.5 : 2) };
    const insideAnchor = MapUtils.ensurePointInsideProvince(this, box, preferredAnchor);
    const offset = MapUtils.getBadgeOffset(d.id);
    
    const cx = Math.max(14, Math.min(CONFIG.BASE_WIDTH - 14, insideAnchor.cx + offset.dx));
    const cy = Math.max(14, Math.min(CONFIG.BASE_HEIGHT - 14, insideAnchor.cy + offset.dy));

    const badge = badgeLayer.append('g').attr('class', 'count-badge')
      .attr('transform', `translate(${cx},${cy})`);
      
    badge.append('circle').attr('r', count > 99 ? 13 : 11);
    badge.append('text').attr('text-anchor', 'middle').attr('dy', '0.35em').text(count > 99 ? '99+' : count);

    badge.on('click', (event) => {
      event.stopPropagation();
      const shouldShowBubble = State.invertCtrlBubble ? !!event.ctrlKey : !event.ctrlKey;
      
      if (!shouldShowBubble) {
        setGlobalSearchEnabled(false);
        State.selectedProvinceKey = Utils.normalizeProvinceName(d.name);
        g.selectAll('.province').classed('selected', p => p.id === d.id);
        showProvinceDetails(d.name);
        hideMapBubble();
      } else {
        showMapBubbleByProvince(d.name, cx, cy);
      }
    });
  });

  g.selectAll('.province').on('click', function (event, d) {
    setGlobalSearchEnabled(false);
    State.selectedProvinceKey = Utils.normalizeProvinceName(d.name);
    g.selectAll('.province').classed('selected', false);
    d3.select(this).classed('selected', true);
    showProvinceDetails(d.name);
    hideMapBubble();
  });

  if (State.selectedProvinceKey) {
    g.selectAll('.province').classed('selected', d => Utils.normalizeProvinceName(d.name) === State.selectedProvinceKey);
  }

  const zoom = d3.zoom().scaleExtent([fitScale, fitScale * 12])
    .on('zoom', (event) => {
      g.attr('transform', event.transform);
      if (State.activeBubbleState) placeMapBubble(State.activeBubbleState.anchorX, State.activeBubbleState.anchorY);
    });

  svg.call(zoom).on('dblclick.zoom', null);
  svg.call(zoom.transform, d3.zoomIdentity.translate(offsetX, offsetY).scale(fitScale));

  State.mapViewState = { svg, g, zoom, width: w, height: h, minScale: fitScale, maxScale: fitScale * 12, baseScale: fitScale, baseTranslate: [offsetX, offsetY] };
  if (State.activeBubbleState) placeMapBubble(State.activeBubbleState.anchorX, State.activeBubbleState.anchorY);
}

async function reloadBandoriData() {
  let rows = [], source = 'none';
  
  // 优先从在线 API 获取
  try {
    const resp = await fetch('./api.php', { cache: 'no-store' });
    if (resp.ok) {
      const json = await resp.json();
      if (json?.data && Array.isArray(json.data) && json.data.length > 0) {
        rows = json.data;
        source = '在线API';
        console.log('✅ 从在线API加载数据成功');
      }
    }
  } catch (e) {
    console.log('在线API请求失败:', e);
  }
  
  // 如果在线API失败或没有数据，从本地 JSON 文件加载（兜底）
  if (!rows.length) {
    for (const url of [CONFIG.API_URL, ...CONFIG.FALLBACK_URLS]) {
      try {
        const resp = await fetch(url, { cache: 'no-store' });
        if (!resp.ok) continue;
        const json = await resp.json();
        if (json?.data && Array.isArray(json.data)) {
          rows = json.data;
          source = '本地JSON';
          console.log('✅ 从本地JSON加载数据成功');
          break;
        }
      } catch (e) {}
    }
  }

  if (rows.length) {
    // 去重逻辑
    const dedupedMap = new Map();
    rows.forEach((item) => {
      const key = String(item.info || '').trim();
      if (!key) {
        dedupedMap.set(Symbol('no-info'), item);
        return;
      }
      const prev = dedupedMap.get(key);
      if (!prev) {
        dedupedMap.set(key, item);
        return;
      }
      const prevTime = new Date(prev.created_at || 0).getTime() || 0;
      const currTime = new Date(item.created_at || 0).getTime() || 0;
      if (currTime >= prevTime) {
        dedupedMap.set(key, item);
      }
    });
    rows = Array.from(dedupedMap.values());
  }

  State.bandoriRows = rows;
  State.currentDataSource = source;
  State.provinceGroupsMap = new Map();
  
  rows.forEach(item => {
    const key = item.type === 'non-regional'
      ? '__non_regional__'
      : Utils.normalizeProvinceName(item.province);
    if (!key) return;
    if (!State.provinceGroupsMap.has(key)) State.provinceGroupsMap.set(key, []);
    State.provinceGroupsMap.get(key).push(item);
  });

  updateSummaryUI(source, false);
  renderChinaMap();
  if (State.selectedProvinceKey === '海外') showProvinceDetails('海外');
}

// ==========================================
// 4. 事件绑定
// ==========================================
function bindAllStaticEvents() {
  // 复制/打开链接事件
  document.addEventListener('click', async (e) => {
    const linkTrigger = e.target.closest('.copy-number[data-href]');
    if (linkTrigger) {
      const href = linkTrigger.getAttribute('data-href');
      if (href) window.open(href, '_blank', 'noopener,noreferrer');
      return;
    }

    const trigger = e.target.closest('.copy-btn, .copy-number, .map-bubble-item');
    if (!trigger) return;
    
    const text = decodeURIComponent(trigger.getAttribute('data-copy') || '');
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      const targetEl = trigger.querySelector('.bubble-id') || trigger;
      const oldText = targetEl.textContent;
      targetEl.textContent = '已复制';
      setTimeout(() => targetEl.textContent = oldText, 900);
    } catch (err) {}
  });

  // 搜索和筛选
  document.getElementById('searchInput')?.addEventListener('input', (e) => { 
    State.listQuery = e.target.value.trim().toLowerCase(); 
    renderCurrentDetail(); 
  });
  
  document.getElementById('typeFilter')?.addEventListener('change', (e) => { 
    State.listType = e.target.value || 'all'; 
    renderCurrentDetail(); 
  });
  
  document.getElementById('globalSearchBtn')?.addEventListener('click', () => { 
    setGlobalSearchEnabled(!State.globalSearchEnabled, { resetToDefault: true }); 
    renderCurrentDetail(); 
  });
  
  document.getElementById('sortBar')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.sort-btn');
    if (btn) { 
      State.listSort = btn.getAttribute('data-sort') || 'default'; 
      updateSortButtonView(); 
      renderCurrentDetail(); 
    }
  });

  // 地图缩放控件
  const stepScale = (factor) => {
    if (!State.mapViewState) return;
    const { svg, zoom, minScale, maxScale, width, height } = State.mapViewState;
    const currentTransform = d3.zoomTransform(svg.node());
    const nextScale = Math.max(minScale, Math.min(maxScale, currentTransform.k * factor));
    const center = [width / 2, height / 2];
    const nextTransform = d3.zoomIdentity
      .translate(currentTransform.x, currentTransform.y)
      .scale(currentTransform.k)
      .translate(center[0], center[1])
      .scale(nextScale / currentTransform.k)
      .translate(-center[0], -center[1]);
    svg.call(zoom.transform, nextTransform);
  };

  document.getElementById('zoomInBtn')?.addEventListener('click', () => stepScale(1.2));
  document.getElementById('zoomOutBtn')?.addEventListener('click', () => stepScale(1 / 1.2));
  
  document.getElementById('resetViewBtn')?.addEventListener('click', () => {
    State.resetClickBurstCount++;
    clearTimeout(State.resetClickBurstTimer);
    State.resetClickBurstTimer = setTimeout(() => State.resetClickBurstCount = 0, 1400);
    
    if (State.resetClickBurstCount >= 6) {
      State.developerModeEnabled = !State.developerModeEnabled;
      State.resetClickBurstCount = 0;
      const btn = document.getElementById('resetViewBtn');
      if(btn) {
        btn.textContent = State.developerModeEnabled ? '重置（开发者）' : '重置';
        btn.title = State.developerModeEnabled ? '允许右键' : '禁止右键';
      }
      
      const floatingAdminBtn = document.getElementById('floatingAdminBtn');
      if (State.developerModeEnabled) {
        document.body.classList.add('developer-mode');
        if (floatingAdminBtn) floatingAdminBtn.style.display = 'flex';
        console.log('🔓 开发者模式已开启，管理员按钮已显示');
        alert('开发者模式已开启！\n👑 管理员按钮已出现在右下角');
      } else {
        document.body.classList.remove('developer-mode');
        if (floatingAdminBtn) floatingAdminBtn.style.display = 'none';
        if (adminMode) toggleAdminMode();
        console.log('🔒 开发者模式已关闭，管理员按钮已隐藏');
      }
    }

    if (State.mapViewState) {
      const { svg, zoom, baseScale, baseTranslate } = State.mapViewState;
      svg.call(zoom.transform, d3.zoomIdentity.translate(baseTranslate[0], baseTranslate[1]).scale(baseScale));
    }
  });

  // 海外/国内同好会按钮
  document.getElementById('overseasToggleBtn')?.addEventListener('click', () => {
    setGlobalSearchEnabled(false);
    State.selectedProvinceKey = '海外';
    showProvinceDetails('海外');
    hideMapBubble();
    State.mapViewState?.g.selectAll('.province').classed('selected', false);
  });

  document.getElementById('nonRegionalToggleBtn')?.addEventListener('click', () => {
    setGlobalSearchEnabled(false);
    const allDomesticRows = State.bandoriRows.filter(item => item.province !== '海外');
    State.currentDetailProvinceName = '国内同好会';
    State.currentDetailRows = allDomesticRows;
    renderCurrentDetail();
    hideMapBubble();
    State.mapViewState?.g.selectAll('.province').classed('selected', false);
  });

  // 日历按钮
  document.getElementById('calendarToggleBtn')?.addEventListener('click', () => {
    document.getElementById('calendarModal')?.classList.add('open');
    document.getElementById('calendarModal')?.setAttribute('aria-hidden', 'false');
  });

  // 点击地图其他地方隐藏气泡
  document.getElementById('map')?.addEventListener('click', (e) => {
    if (!e.target.closest('#badgeBubble') && !e.target.closest('.count-badge')) hideMapBubble();
  });

  // 刷新按钮
  const refreshBtn = document.getElementById('refreshApiBtn');
  refreshBtn?.addEventListener('click', async () => {
    refreshBtn.textContent = '刷新中...';
    refreshBtn.disabled = true;
    await reloadBandoriData();
    refreshBtn.disabled = false;
    refreshBtn.textContent = '刷新数据';
    refreshBtn.classList.remove('show');
  });

  // 简介卡片收起/展开
  document.getElementById('introCloseBtn')?.addEventListener('click', () => document.getElementById('introCard')?.classList.add('collapsed'));
  document.getElementById('introExpandBtn')?.addEventListener('click', () => document.getElementById('introCard')?.classList.remove('collapsed'));
  
  // 反转操作开关
  const invertSwitch = document.getElementById('invertCtrlSwitch');
  invertSwitch?.addEventListener('change', () => {
    State.invertCtrlBubble = !!invertSwitch.checked;
    const label = document.getElementById('invertCtrlLabel');
    if(label) label.textContent = State.invertCtrlBubble ? '反转操作（已开启）' : '反转操作（默认关）';
  });

  // 主题切换
  const themeSwitch = document.getElementById('themeSwitch');
  themeSwitch?.addEventListener('change', () => {
    const currentEffectiveTheme = getPreferredTheme();
    const nextTheme = currentEffectiveTheme === 'dark' ? 'light' : 'dark';
    setThemePreference(nextTheme);
  });

  themeSwitch?.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    setThemePreference('system');
  });

  // 反馈弹窗
  const feedbackModal = document.getElementById('feedbackModal');
  document.getElementById('feedbackModalBtn')?.addEventListener('click', () => { 
    feedbackModal?.classList.add('open'); 
    feedbackModal?.setAttribute('aria-hidden', 'false'); 
  });
  document.getElementById('feedbackModalClose')?.addEventListener('click', () => { 
    feedbackModal?.classList.remove('open'); 
    feedbackModal?.setAttribute('aria-hidden', 'true'); 
  });
  feedbackModal?.addEventListener('click', (e) => { 
    if (e.target === feedbackModal) feedbackModal.classList.remove('open'); 
  });

  // 右键菜单
  document.addEventListener('contextmenu', (e) => {
    if (State.developerModeEnabled) return;
    e.preventDefault();

    if (e.target.closest('#siteFooter')) {
      document.getElementById('siteFooter')?.classList.add('site-footer-hidden');
      return;
    }

    if (refreshBtn) {
      const nextLeft = `${Math.min(Math.max(8, window.innerWidth - 120), e.clientX + 8)}px`;
      const nextTop = `${Math.min(Math.max(8, window.innerHeight - 48), e.clientY + 8)}px`;
      const wasOpen = refreshBtn.classList.contains('show');

      if (!wasOpen) refreshBtn.classList.add('instant-place');

      refreshBtn.style.left = nextLeft;
      refreshBtn.style.top = nextTop;
      refreshBtn.classList.add('show');

      if (!wasOpen) {
        void refreshBtn.offsetHeight;
        refreshBtn.classList.remove('instant-place');
      }
    }
  }, true);
  
  document.addEventListener('click', (e) => { 
    if (e.target !== refreshBtn) refreshBtn?.classList.remove('show'); 
  }, true);

  // 彩蛋
  let easterClickCount = 0, easterTimer = null;
  document.getElementById('introTitle')?.addEventListener('click', () => {
    easterClickCount++;
    clearTimeout(easterTimer);
    easterTimer = setTimeout(() => easterClickCount = 0, 2600);
    if (easterClickCount >= 10) {
      easterClickCount = 0;
      const modal = document.getElementById('easterModal');
      document.getElementById('easterText').textContent = '彩蛋内容';
      modal?.classList.add('open');
    }
  });
  document.getElementById('easterModalClose')?.addEventListener('click', () => document.getElementById('easterModal')?.classList.remove('open'));

  // 移动端触摸优化
  document.addEventListener('touchmove', (e) => { 
    if (Utils.isMobileViewport() && e.touches.length >= 2 && !e.target.closest('#map')) e.preventDefault(); 
  }, { passive: false });
  ['gesturestart', 'gesturechange'].forEach(evt => document.addEventListener(evt, (e) => { 
    if (Utils.isMobileViewport() && !e.target.closest('#map')) e.preventDefault(); 
  }, { passive: false }));
}

// ==========================================
// 5. 管理员模式
// ==========================================

function toggleAdminMode() {
  if (!State.developerModeEnabled) {
    alert('请先连续点击「重置」按钮6次开启开发者模式');
    return false;
  }
  
  // 保存/清除 token
  if (!adminMode) {
    localStorage.setItem('admin_token', 'ciallo');
  } else {
    localStorage.removeItem('admin_token');
  }
  
  adminMode = !adminMode;
  const floatingAdminBtn = document.getElementById('floatingAdminBtn');
  const addClubBtn = document.getElementById('addClubBtn');
  
  if (adminMode) {
    floatingAdminBtn?.classList.add('admin-active');
    floatingAdminBtn.title = '退出管理员模式';
    if (addClubBtn) addClubBtn.style.display = 'flex';
    document.body.classList.add('admin-mode');
    console.log('✅ 管理员模式已开启');
  } else {
    floatingAdminBtn?.classList.remove('admin-active');
    floatingAdminBtn.title = '管理员模式';
    if (addClubBtn) addClubBtn.style.display = 'none';
    document.body.classList.remove('admin-mode');
    console.log('✅ 管理员模式已关闭');
  }
  return true;
}

function openEditPanel(club = null, isNew = false) {
  const adminPanel = document.getElementById('adminPanel');
  const adminPanelTitle = document.getElementById('adminPanelTitle');
  const editId = document.getElementById('editId');
  const editName = document.getElementById('editName');
  const editProvince = document.getElementById('editProvince');
  const editType = document.getElementById('editType');
  const editInfo = document.getElementById('editInfo');
  const editRemark = document.getElementById('editRemark');
  const editSchool = document.getElementById('editSchool');
  const adminDeleteBtn = document.getElementById('adminDeleteBtn');
  
  if (!adminPanel) return;
  
  if (isNew) {
    adminPanelTitle.textContent = '➕ 添加同好会';
    if (editId) editId.value = '';
    if (editName) editName.value = '';
    if (editProvince) editProvince.value = '';
    if (editType) editType.value = 'school';
    if (editInfo) editInfo.value = '';
    if (editRemark) editRemark.value = '';
    if (editSchool) editSchool.value = '';
    if (adminDeleteBtn) adminDeleteBtn.style.display = 'none';
    currentEditClubId = null;
  } else if (club) {
    adminPanelTitle.textContent = '✏️ 编辑同好会';
    if (editId) editId.value = club.id || '';
    if (editName) editName.value = club.name || '';
    if (editProvince) editProvince.value = club.province || '';
    if (editType) editType.value = club.type || 'school';
    if (editInfo) editInfo.value = club.originalInfo || club.info || '';
    if (editRemark) editRemark.value = club.remark || '';
    if (editSchool) editSchool.value = club.school || '';
    if (adminDeleteBtn) adminDeleteBtn.style.display = 'block';
    currentEditClubId = club.id;
  }
  
  adminPanel.classList.add('open');
}

function closeAdminPanel() {
  const adminPanel = document.getElementById('adminPanel');
  if (adminPanel) adminPanel.classList.remove('open');
  currentEditClubId = null;
}

async function saveClub() {
  const editId = document.getElementById('editId');
  const editName = document.getElementById('editName');
  const editProvince = document.getElementById('editProvince');
  const editType = document.getElementById('editType');
  const editInfo = document.getElementById('editInfo');
  const editRemark = document.getElementById('editRemark');
  const editSchool = document.getElementById('editSchool');
  
  const clubData = {
    name: editName?.value.trim() || '',
    province: editProvince?.value.trim() || '',
    type: editType?.value || 'school',
    info: editInfo?.value.trim() || '',
    remark: editRemark?.value.trim() || '',
    school: editSchool?.value.trim() || '',
    verified: 1
  };
  
  if (!clubData.name) {
    alert('请填写组织名称');
    return;
  }
  if (!clubData.province) {
    alert('请填写省份');
    return;
  }
  if (!clubData.info) {
    alert('请填写联系方式');
    return;
  }
  
  const isEdit = currentEditClubId !== null;
  const adminToken = localStorage.getItem('admin_token');
  
  try {
    let response;
    if (isEdit) {
      // 更新
      clubData.id = currentEditClubId;
      response = await fetch('./api.php', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Token': adminToken
        },
        body: JSON.stringify(clubData)
      });
    } else {
      // 添加
      response = await fetch('./api.php', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Token': adminToken
        },
        body: JSON.stringify(clubData)
      });
    }
    
    const result = await response.json();
    
    if (result.success) {
      alert(isEdit ? '✅ 更新成功！' : '✅ 添加成功！');
      await reloadBandoriData();  // 重新加载数据
      closeAdminPanel();
    } else {
      alert('保存失败：' + (result.message || '未知错误'));
    }
  } catch (err) {
    console.error('保存失败：', err);
    alert('保存失败，请检查网络连接或 API 配置');
  }
}

function exportData() {
  const dataStr = JSON.stringify(State.bandoriRows, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `galgame_clubs_backup_${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
  alert('📁 数据已导出！');
}
// 删除同好会（添加到 exportData 函数后面）
async function deleteClub() {
  if (!confirm('⚠️ 确定要删除这个同好会吗？此操作不可撤销！')) return;
  
  const adminToken = localStorage.getItem('admin_token');
  
  try {
    const response = await fetch('./api.php', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Token': adminToken
      },
      body: JSON.stringify({ id: currentEditClubId })
    });
    
    const result = await response.json();
    
    if (result.success) {
      alert('✅ 删除成功！');
      await reloadBandoriData();
      closeAdminPanel();
    } else {
      alert('删除失败：' + (result.message || '未知错误'));
    }
  } catch (err) {
    console.error('删除失败：', err);
    alert('删除失败，请检查网络连接');
  }
}
function initAdminEvents() {
  const floatingAdminBtn = document.getElementById('floatingAdminBtn');
  if (!floatingAdminBtn) {
    setTimeout(initAdminEvents, 100);
    return;
  }
  
  const addClubBtn = document.getElementById('addClubBtn');
  const adminCancelBtn = document.getElementById('adminCancelBtn');
  const adminSaveBtn = document.getElementById('adminSaveBtn');
  const adminDeleteBtn = document.getElementById('adminDeleteBtn');
  const adminPanel = document.getElementById('adminPanel');
  
  floatingAdminBtn.style.display = State.developerModeEnabled ? 'flex' : 'none';
  
  floatingAdminBtn.addEventListener('click', () => {
    if (!State.developerModeEnabled) {
      alert('请先连续点击「重置」按钮6次开启开发者模式');
      return;
    }
    if (!adminMode) {
      const pwd = prompt('🔐 请输入管理员密码：');
      if (pwd !== ADMIN_PASSWORD) {
        alert('❌ 密码错误！');
        return;
      }
    }
    toggleAdminMode();
  });
  
  if (addClubBtn) {
    addClubBtn.addEventListener('click', () => {
      if (!State.developerModeEnabled) {
        alert('请先开启开发者模式');
        return;
      }
      openEditPanel(null, true);
    });
  }
  
  if (adminCancelBtn) adminCancelBtn.addEventListener('click', closeAdminPanel);
  if (adminSaveBtn) adminSaveBtn.addEventListener('click', saveClub);
  if (adminDeleteBtn) adminDeleteBtn.addEventListener('click', deleteClub);
  
  if (adminPanel) {
    adminPanel.addEventListener('click', (e) => {
      if (e.target === adminPanel) closeAdminPanel();
    });
  }
  
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'e' && adminMode) {
      e.preventDefault();
      exportData();
    }
  });
  
  console.log('✅ 管理员事件已初始化');
}



// ==========================================
// 6. 启动应用
// ==========================================
async function init() {
    initThemePreference();
    bindAllStaticEvents();
    bindMobileSheetResize();
    applyMobileModeLayout();
    await reloadBandoriData();
    initAdminEvents();
}

// 页面加载时启动
init();