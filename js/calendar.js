// calendar.js - dual-pane activity calendar
(function() {
  const state = {
    events: [],
    registrations: [],
    currentUserId: null,
    currentDate: new Date(),
    selectedDateKey: '',
    activeView: 'calendar',
    activeFilter: 'all',
    activePanel: 'list',
    selectedEventId: null,
    editingEventId: null,
    lastSaveError: ''
  };

  const EVENTS_API = './api/events.php?action=list';
  const REGISTRATIONS_API = './api/events.php?action=registrations';

  let elements = {};

  function shouldSkipRemoteEvents() {
    return window.location.protocol === 'file:';
  }

  function $(id) {
    return document.getElementById(id);
  }

  function text(key, fallback) {
    if (typeof window.__ === 'function') {
      const value = window.__(key);
      if (value && value !== key) return value;
    }
    return fallback;
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, function(ch) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[ch];
    });
  }

  function formatDateKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function parseEventDate(value) {
    if (!value) return null;
    const match = String(value).match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!match) return null;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    date.setHours(0, 0, 0, 0);
    return date;
  }

  function getToday() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  }

  function normalizeEvent(item) {
    return {
      ...item,
      id: Number(item.id),
      parsedDate: parseEventDate(item.date),
      parsedDateEnd: parseEventDate(item.date_end)
    };
  }

  function getEventEnd(event) {
    return event.parsedDateEnd || event.parsedDate;
  }

  function eventContainsDate(event, dateKey) {
    const date = parseEventDate(dateKey);
    if (!date || !event.parsedDate) return false;
    return event.parsedDate <= date && getEventEnd(event) >= date;
  }

  function getEventStatus(event) {
    const today = getToday();
    const end = getEventEnd(event);
    if (event.parsedDate > today) return 'upcoming';
    if (event.parsedDate <= today && end >= today) return 'ongoing';
    return 'ended';
  }

  function getStatusLabel(status) {
    return {
      upcoming: '即将开始',
      ongoing: '进行中',
      ended: '已结束'
    }[status] || '';
  }

  function formatMonthTitle(date) {
    return `${date.getFullYear()}年${date.getMonth() + 1}月`;
  }

  function formatDateRange(event) {
    if (!event.date) return '日期待定';
    if (event.date_end && event.date_end !== event.date) return `${event.date} ~ ${event.date_end}`;
    return event.date;
  }

  function formatShortRange(event) {
    if (!event.parsedDate) return '';
    const start = event.parsedDate;
    const end = getEventEnd(event);
    const startText = `${start.getMonth() + 1}/${String(start.getDate()).padStart(2, '0')}`;
    if (end > start) return `${startText}~${end.getMonth() + 1}/${String(end.getDate()).padStart(2, '0')}`;
    return startText;
  }

  function getRegistrationCount(eventId) {
    return state.registrations.filter(function(reg) {
      return Number(reg.event_id) === Number(eventId);
    }).length;
  }

  function isRegistered(eventId) {
    if (!state.currentUserId) return false;
    return state.registrations.some(function(reg) {
      return Number(reg.event_id) === Number(eventId) && Number(reg.user_id) === Number(state.currentUserId);
    });
  }

  function getAuthState() {
    if (typeof currentUser !== 'undefined' && currentUser) return currentUser;
    return window.currentUser || null;
  }

  function isLoggedIn() {
    return getAuthState()?.logged_in === true;
  }

  function isAdminMode() {
    return typeof window.hasRole === 'function' && window.hasRole('manager');
  }

  function getEventById(eventId) {
    return state.events.find(function(event) {
      return Number(event.id) === Number(eventId);
    });
  }

  function sortEventsAscending(events) {
    return events.slice().sort(function(a, b) {
      return (a.parsedDate || 0) - (b.parsedDate || 0);
    });
  }

  function buildEventMap() {
    const map = new Map();
    state.events.forEach(function(event) {
      if (!event.parsedDate) return;
      const end = getEventEnd(event);
      const iter = new Date(event.parsedDate);
      while (iter <= end) {
        const key = formatDateKey(iter);
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(event);
        iter.setDate(iter.getDate() + 1);
      }
    });
    map.forEach(function(events, key) {
      map.set(key, sortEventsAscending(events));
    });
    return map;
  }

  async function loadEvents() {
    if (shouldSkipRemoteEvents()) {
      state.events = [];
      return;
    }
    try {
      const response = await fetch(`${EVENTS_API}&t=${Date.now()}`, { cache: 'no-store' });
      const payload = await response.json();
      state.events = Array.isArray(payload.events)
        ? payload.events.map(normalizeEvent).filter(function(event) {
            return event.id && event.parsedDate && !Number.isNaN(event.parsedDate.getTime());
          })
        : [];
    } catch (error) {
      state.events = [];
    }
  }

  async function loadRegistrations() {
    if (shouldSkipRemoteEvents()) {
      state.registrations = [];
      state.currentUserId = null;
      return;
    }
    try {
      const response = await fetch(`${REGISTRATIONS_API}&t=${Date.now()}`, { cache: 'no-store' });
      const payload = await response.json();
      state.registrations = payload.success && Array.isArray(payload.registrations) ? payload.registrations : [];
    } catch (error) {
      state.registrations = [];
    }

    const authState = getAuthState();
    if (authState?.logged_in && authState?.user?.id) {
      state.currentUserId = Number(authState.user.id);
    } else {
      state.currentUserId = null;
    }
  }

  function updateAdminUI() {
    if (elements.calendarAddEventBtn) {
      elements.calendarAddEventBtn.style.display = isAdminMode() ? 'inline-flex' : 'none';
    }
  }

  function setPanel(panel, eventId) {
    state.activePanel = panel;
    if (eventId !== undefined) state.selectedEventId = eventId;

    elements.calendarListPanel?.classList.toggle('active', panel === 'list');
    elements.calendarDetailPanel?.classList.toggle('active', panel === 'detail');
    elements.calendarEditorPanel?.classList.toggle('active', panel === 'edit');

    if (panel === 'list') {
      state.editingEventId = null;
      renderSelectedEvents();
    } else if (panel === 'detail') {
      renderEventDetail(getEventById(state.selectedEventId));
    } else if (panel === 'edit') {
      renderEventEditor(eventId ? getEventById(eventId) : null);
    }
  }

  function renderCalendar() {
    if (!elements.calendarGrid || !elements.calendarMonthTitle) return;

    const year = state.currentDate.getFullYear();
    const month = state.currentDate.getMonth();
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const eventMap = buildEventMap();

    elements.calendarMonthTitle.textContent = formatMonthTitle(state.currentDate);

    const selectedMonthMatches =
      state.selectedDateKey &&
      state.selectedDateKey.startsWith(`${year}-${String(month + 1).padStart(2, '0')}`);
    if (!selectedMonthMatches) {
      state.selectedDateKey = formatDateKey(new Date(year, month, 1));
    }

    const weekLabels = ['日', '一', '二', '三', '四', '五', '六'];
    const cells = weekLabels.map(function(label) {
      return `<div class="calendar-weekday">${label}</div>`;
    });

    for (let i = 0; i < first.getDay(); i += 1) {
      cells.push('<div class="calendar-cell empty" aria-hidden="true"></div>');
    }

    for (let day = 1; day <= last.getDate(); day += 1) {
      const date = new Date(year, month, day);
      const key = formatDateKey(date);
      const events = eventMap.get(key) || [];
      const selected = state.selectedDateKey === key ? 'selected' : '';
      const today = key === formatDateKey(getToday()) ? 'today' : '';
      const officialCount = events.filter(function(event) { return Number(event.offical) === 1; }).length;

      cells.push(`
        <button class="calendar-cell ${events.length ? 'has-event' : ''} ${selected} ${today}" type="button" data-date="${key}">
          <span class="calendar-day">${day}</span>
          ${events.length ? `<span class="calendar-dot-row">
            <span class="calendar-dot">${events.length}</span>
            ${officialCount ? `<span class="calendar-dot official-dot">${officialCount}</span>` : ''}
          </span>` : ''}
        </button>
      `);
    }

    elements.calendarGrid.innerHTML = cells.join('');
    renderSelectedEvents();
  }

  function getVisibleEventsForList() {
    let visible = state.events.slice();
    if (state.activeFilter !== 'all') {
      visible = visible.filter(function(event) {
        return getEventStatus(event) === state.activeFilter;
      });
    }
    return visible.sort(function(a, b) {
      return (a.parsedDate || 0) - (b.parsedDate || 0);
    });
  }

  function renderSelectedEvents() {
    if (!elements.calendarEventList || !elements.calendarListTitle || !elements.calendarListSubtitle) return;

    const eventMap = buildEventMap();
    let events = state.activeView === 'calendar'
      ? (eventMap.get(state.selectedDateKey) || [])
      : getVisibleEventsForList();

    if (state.activeView === 'calendar') {
      const day = parseEventDate(state.selectedDateKey);
      const title = day ? `${day.getMonth() + 1}月${day.getDate()}日` : '选中日期';
      elements.calendarListTitle.textContent = `${title} · ${events.length} 个活动`;
      elements.calendarListSubtitle.textContent = '点击活动查看详情，管理员可在详情中编辑。';
    } else {
      elements.calendarListTitle.textContent = '活动列表';
      elements.calendarListSubtitle.textContent = `${events.length} 个活动符合当前筛选`;
    }

    if (!events.length) {
      elements.calendarEventList.innerHTML = `
        <div class="calendar-empty-state">
          <strong>暂无活动</strong>
          <span>${state.activeView === 'calendar' ? '这一天还没有登记活动。' : '当前筛选下没有活动。'}</span>
        </div>
      `;
      return;
    }

    elements.calendarEventList.innerHTML = events.map(renderEventCard).join('');
  }

  function renderEventCard(event) {
    const status = getEventStatus(event);
    const official = Number(event.offical) === 1;
    const regCount = getRegistrationCount(event.id);
    const selected = Number(state.selectedEventId) === Number(event.id) ? 'selected' : '';
    const description = event.raw_text || event.description || '暂无活动简介';

    return `
      <button class="calendar-event-card ${official ? 'official' : ''} ${selected}" type="button" data-event-id="${event.id}">
        <span class="event-card-main">
          <span class="event-card-title">${escapeHtml(event.event || '未命名活动')}</span>
          <span class="event-card-desc">${escapeHtml(description)}</span>
          <span class="event-card-meta">
            <span class="event-date-inline">${escapeHtml(formatShortRange(event))}</span>
            <span class="event-status-chip ${status}">${getStatusLabel(status)}</span>
            ${official ? '<span class="event-status-chip official">官方</span>' : ''}
            <span>${regCount} 人报名</span>
          </span>
        </span>
      </button>
    `;
  }

  function renderEventDetail(event) {
    if (!event || !elements.calendarDetailPanel) {
      setPanel('list');
      return;
    }

    const status = getEventStatus(event);
    const official = Number(event.offical) === 1;
    const regCount = getRegistrationCount(event.id);
    const registered = isRegistered(event.id);
    const canManage = isAdminMode();
    const description = event.description || event.raw_text || '暂无详细介绍';

    elements.calendarDetailPanel.innerHTML = `
      <div class="calendar-panel-head">
        <button class="calendar-text-btn" type="button" data-action="back-list">返回列表</button>
        <div class="calendar-panel-actions">
          ${canManage ? '<button class="calendar-ghost-btn" type="button" data-action="edit-event">编辑</button>' : ''}
        </div>
      </div>
      ${event.image ? `<img class="event-detail-image" src="${escapeHtml(event.image)}" alt="${escapeHtml(event.event || '活动海报')}" loading="lazy">` : '<div class="event-detail-image placeholder">活动海报</div>'}
      <div class="event-detail-body">
        <div class="event-detail-kicker">
          <span class="event-status-chip ${status}">${getStatusLabel(status)}</span>
          ${official ? '<span class="event-status-chip official">官方</span>' : ''}
        </div>
        <h3 class="event-detail-title">${escapeHtml(event.event || '未命名活动')}</h3>
        <div class="event-detail-date">${escapeHtml(formatDateRange(event))}</div>
        <p class="event-detail-desc">${escapeHtml(description)}</p>
        <div class="event-detail-reg">
          <span>${regCount > 0 ? `${regCount} 人已报名` : '暂无报名'}</span>
          ${isLoggedIn() ? `<button class="calendar-primary-btn ${registered ? 'registered' : ''}" type="button" data-action="${registered ? 'unregister' : 'register'}">${registered ? '已报名，点击取消' : '报名参加'}</button>` : '<button class="calendar-primary-btn" type="button" data-action="login">登录后报名</button>'}
        </div>
        <div class="event-detail-links">
          ${event.link ? `<a class="calendar-outline-link" href="${escapeHtml(event.link)}" target="_blank" rel="noopener noreferrer">访问活动页面</a>` : ''}
          ${canManage ? '<button class="calendar-danger-btn" type="button" data-action="delete-event">删除活动</button>' : ''}
        </div>
      </div>
    `;
  }

  function renderEventEditor(event) {
    state.editingEventId = event?.id || null;
    if (!elements.calendarEditorPanel) return;

    elements.calendarEditorPanel.innerHTML = `
      <div class="calendar-panel-head">
        <button class="calendar-text-btn" type="button" data-action="${event ? 'back-detail' : 'back-list'}">${event ? '返回详情' : '返回列表'}</button>
      </div>
      <div class="event-editor-shell">
        <h3>${event ? '编辑活动' : '新增活动'}</h3>
        <input type="hidden" id="calendarEditId" value="${event ? event.id : ''}">
        <label class="calendar-field">
          <span>活动名称 *</span>
          <input type="text" id="calendarEditName" class="md3-input" value="${escapeHtml(event?.event || '')}" placeholder="例如：上海 Galgame Only">
        </label>
        <div class="calendar-field-grid">
          <label class="calendar-field">
            <span>开始日期 *</span>
            <input type="date" id="calendarEditDate" class="md3-input" value="${escapeHtml(event?.date || '')}">
          </label>
          <label class="calendar-field">
            <span>结束日期</span>
            <input type="date" id="calendarEditDateEnd" class="md3-input" value="${escapeHtml(event?.date_end || '')}">
          </label>
        </div>
        <label class="calendar-field">
          <span>活动简介</span>
          <textarea id="calendarEditRawText" class="md3-input" rows="2" placeholder="用于活动卡片展示">${escapeHtml(event?.raw_text || '')}</textarea>
        </label>
        <label class="calendar-field">
          <span>详细介绍</span>
          <textarea id="calendarEditDescription" class="md3-input" rows="4" placeholder="活动内容、参与方式、地点等">${escapeHtml(event?.description || '')}</textarea>
        </label>
        <label class="calendar-field">
          <span>活动链接</span>
          <input type="url" id="calendarEditLink" class="md3-input" value="${escapeHtml(event?.link || '')}" placeholder="https://...">
        </label>
        <label class="calendar-field">
          <span>海报图片地址</span>
          <div class="calendar-image-row">
            <input type="hidden" id="calendarEditImage" value="${escapeHtml(event?.image || '')}">
            <input type="file" id="calendarEditImageInput" accept="image/jpeg,image/png,image/gif,image/webp" hidden>
            <button class="calendar-ghost-btn" type="button" data-action="upload-image">上传海报</button>
            <button class="calendar-ghost-btn" type="button" data-action="remove-image">移除</button>
            <span id="calendarEditImageStatus">${event?.image ? '已有海报' : ''}</span>
          </div>
          <img id="calendarEditImagePreview" class="event-editor-preview" src="${escapeHtml(event?.image || '')}" alt="" style="${event?.image ? '' : 'display:none;'}">
        </label>
        <label class="calendar-check-row">
          <input type="checkbox" id="calendarEditOfficial" ${Number(event?.offical) === 1 ? 'checked' : ''}>
          <span>官方活动</span>
        </label>
        <div class="calendar-editor-actions">
          <button class="calendar-primary-btn" type="button" data-action="save-editor">保存</button>
          ${event ? '<button class="calendar-danger-btn" type="button" data-action="delete-editor">删除</button>' : ''}
        </div>
      </div>
    `;
  }

  function readEditorData() {
    const name = $('calendarEditName')?.value.trim() || '';
    const date = $('calendarEditDate')?.value || '';
    const dateEnd = $('calendarEditDateEnd')?.value || '';
    return {
      event: name,
      date,
      date_end: dateEnd || null,
      raw_text: $('calendarEditRawText')?.value.trim() || '',
      image: $('calendarEditImage')?.value.trim() || '',
      offical: $('calendarEditOfficial')?.checked ? 1 : 0,
      description: $('calendarEditDescription')?.value.trim() || '',
      link: $('calendarEditLink')?.value.trim() || ''
    };
  }

  function validateEditorData(data) {
    if (!data.event) return '请填写活动名称';
    if (!data.date) return '请选择开始日期';
    if (data.date_end && data.date_end < data.date) return '结束日期不能早于开始日期';
    return '';
  }

  async function postJson(url, body) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return response.json();
  }

  async function addEvent(data) {
    const result = await postJson('./api/events.php?action=add', data);
    if (!result.success) throw new Error(result.message || '新增活动失败');
    const event = normalizeEvent(result.event);
    state.events.push(event);
    state.selectedEventId = event.id;
    state.selectedDateKey = event.date;
    return event;
  }

  async function updateEvent(eventId, data) {
    const result = await postJson('./api/events.php?action=update', { event_id: eventId, ...data });
    if (!result.success) throw new Error(result.message || '保存活动失败');
    const index = state.events.findIndex(function(event) { return Number(event.id) === Number(eventId); });
    if (index !== -1) {
      state.events[index] = normalizeEvent({ ...state.events[index], ...data, id: eventId });
    }
    return getEventById(eventId);
  }

  async function deleteEvent(eventId) {
    const result = await postJson('./api/events.php?action=delete', { event_id: eventId });
    if (!result.success) throw new Error(result.message || '删除活动失败');
    state.events = state.events.filter(function(event) { return Number(event.id) !== Number(eventId); });
    state.selectedEventId = null;
  }

  async function registerForEvent(eventId) {
    const result = await postJson('./api/events.php?action=register', { event_id: eventId });
    if (!result.success) throw new Error(result.message || '报名失败');
    await loadRegistrations();
  }

  async function unregisterFromEvent(eventId) {
    const result = await postJson('./api/events.php?action=unregister', { event_id: eventId });
    if (!result.success) throw new Error(result.message || '取消报名失败');
    await loadRegistrations();
  }

  async function saveEditor() {
    if (!isAdminMode()) {
      alert(text('alertAdminModeRequired', '需要管理员权限'));
      return;
    }

    const data = readEditorData();
    const validationError = validateEditorData(data);
    if (validationError) {
      alert(validationError);
      return;
    }

    try {
      let event;
      if (state.editingEventId) {
        event = await updateEvent(state.editingEventId, data);
      } else {
        event = await addEvent(data);
      }
      renderCalendar();
      setPanel('detail', event.id);
    } catch (error) {
      alert(error.message || '保存活动失败');
    }
  }

  async function handleImageUpload(file) {
    if (!file) return;
    const status = $('calendarEditImageStatus');
    const id = state.editingEventId || `event_${Date.now()}`;
    const form = new FormData();
    form.append('image', file);
    form.append('id', id);
    if (status) status.textContent = '上传中...';

    try {
      const response = await fetch('./api/club_avatar.php?scope=event', { method: 'POST', body: form });
      const payload = await response.json();
      if (!payload.success) throw new Error(payload.message || '上传失败');
      const imageUrl = window.Utils?.preloadMediaUrl ? window.Utils.preloadMediaUrl(payload.image_url) : payload.image_url;
      const input = $('calendarEditImage');
      const preview = $('calendarEditImagePreview');
      if (input) input.value = payload.image_url;
      if (preview) {
        preview.src = imageUrl;
        preview.style.display = 'block';
      }
      if (status) status.textContent = '上传成功';
    } catch (error) {
      if (status) status.textContent = error.message || '上传失败';
    }
  }

  function switchView(view) {
    state.activeView = view;
    document.querySelectorAll('.view-tab').forEach(function(tab) {
      tab.classList.toggle('active', tab.dataset.view === view);
    });
    elements.calendarGridPane?.classList.toggle('list-mode', view === 'list');
    elements.calendarFilterBar?.classList.toggle('visible', view === 'list');
    setPanel('list');
  }

  function switchFilter(filter) {
    state.activeFilter = filter;
    document.querySelectorAll('.filter-tab').forEach(function(tab) {
      tab.classList.toggle('active', tab.dataset.filter === filter);
    });
    renderSelectedEvents();
  }

  async function openCalendar() {
    await Promise.all([loadEvents(), loadRegistrations()]);
    updateAdminUI();
    state.activeView = 'calendar';
    state.activeFilter = 'all';
    state.selectedDateKey = state.selectedDateKey || formatDateKey(getToday());
    elements.calendarModal?.classList.add('open');
    elements.calendarModal?.setAttribute('aria-hidden', 'false');
    switchView('calendar');
    renderCalendar();
  }

  function closeCalendar() {
    elements.calendarModal?.classList.remove('open');
    elements.calendarModal?.setAttribute('aria-hidden', 'true');
    setPanel('list');
  }

  function bindEvents() {
    document.querySelectorAll('[data-action="calendar"], #fabCalendar').forEach(function(button) {
      button.addEventListener('click', openCalendar);
    });

    elements.calendarModalClose?.addEventListener('click', closeCalendar);
    elements.calendarModal?.addEventListener('click', function(event) {
      if (event.target === elements.calendarModal) closeCalendar();
    });

    elements.calendarPrevBtn?.addEventListener('click', function() {
      state.currentDate = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth() - 1, 1);
      renderCalendar();
    });

    elements.calendarNextBtn?.addEventListener('click', function() {
      state.currentDate = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth() + 1, 1);
      renderCalendar();
    });

    elements.calendarGrid?.addEventListener('click', function(event) {
      const cell = event.target.closest('.calendar-cell[data-date]');
      if (!cell) return;
      state.selectedDateKey = cell.dataset.date;
      setPanel('list');
      renderCalendar();
    });

    elements.calendarEventList?.addEventListener('click', function(event) {
      const card = event.target.closest('.calendar-event-card[data-event-id]');
      if (!card) return;
      setPanel('detail', Number(card.dataset.eventId));
    });

    document.querySelectorAll('.view-tab').forEach(function(tab) {
      tab.addEventListener('click', function() {
        switchView(tab.dataset.view);
      });
    });

    document.querySelectorAll('.filter-tab').forEach(function(tab) {
      tab.addEventListener('click', function() {
        switchFilter(tab.dataset.filter);
      });
    });

    elements.calendarAddEventBtn?.addEventListener('click', function() {
      if (!isAdminMode()) {
        alert(text('alertAdminModeRequired', '需要管理员权限'));
        return;
      }
      setPanel('edit', null);
    });

    elements.calendarDetailPanel?.addEventListener('click', async function(event) {
      const action = event.target.closest('[data-action]')?.dataset.action;
      if (!action) return;
      const selected = getEventById(state.selectedEventId);
      if (!selected) return;

      try {
        if (action === 'back-list') setPanel('list');
        if (action === 'edit-event') setPanel('edit', selected.id);
        if (action === 'login' && typeof window.openAccountModal === 'function') window.openAccountModal('login');
        if (action === 'register') {
          await registerForEvent(selected.id);
          renderCalendar();
          setPanel('detail', selected.id);
        }
        if (action === 'unregister') {
          if (!confirm('确定取消报名这个活动吗？')) return;
          await unregisterFromEvent(selected.id);
          renderCalendar();
          setPanel('detail', selected.id);
        }
        if (action === 'delete-event') {
          if (!confirm(text('confirmDeleteSimple', '确定删除吗？'))) return;
          await deleteEvent(selected.id);
          renderCalendar();
          setPanel('list');
        }
      } catch (error) {
        alert(error.message || '操作失败');
      }
    });

    elements.calendarEditorPanel?.addEventListener('click', async function(event) {
      const action = event.target.closest('[data-action]')?.dataset.action;
      if (!action) return;

      if (action === 'back-list') setPanel('list');
      if (action === 'back-detail') setPanel('detail', state.editingEventId);
      if (action === 'save-editor') saveEditor();
      if (action === 'delete-editor') {
        if (!state.editingEventId || !confirm(text('confirmDeleteSimple', '确定删除吗？'))) return;
        try {
          await deleteEvent(state.editingEventId);
          renderCalendar();
          setPanel('list');
        } catch (error) {
          alert(error.message || '删除活动失败');
        }
      }
      if (action === 'upload-image') $('calendarEditImageInput')?.click();
      if (action === 'remove-image') {
        const input = $('calendarEditImage');
        const preview = $('calendarEditImagePreview');
        const status = $('calendarEditImageStatus');
        if (input) input.value = '';
        if (preview) {
          preview.removeAttribute('src');
          preview.style.display = 'none';
        }
        if (status) status.textContent = '已移除';
      }
    });

    elements.calendarEditorPanel?.addEventListener('change', function(event) {
      if (event.target?.id === 'calendarEditImageInput') {
        handleImageUpload(event.target.files?.[0]);
        event.target.value = '';
      }
    });
  }

  function initElements() {
    elements = {
      calendarModal: $('calendarModal'),
      calendarModalClose: $('calendarModalClose'),
      calendarPrevBtn: $('calendarPrevBtn'),
      calendarNextBtn: $('calendarNextBtn'),
      calendarMonthTitle: $('calendarMonthTitle'),
      calendarGrid: $('calendarGrid'),
      calendarGridPane: $('calendarGridPane'),
      calendarFilterBar: $('calendarFilterBar'),
      calendarEventList: $('calendarEventList'),
      calendarListTitle: $('calendarListTitle'),
      calendarListSubtitle: $('calendarListSubtitle'),
      calendarListPanel: $('calendarListPanel'),
      calendarDetailPanel: $('calendarDetailPanel'),
      calendarEditorPanel: $('calendarEditorPanel'),
      calendarAddEventBtn: $('calendarAddEventBtn')
    };
  }

  async function init() {
    initElements();
    bindEvents();
    await Promise.all([loadEvents(), loadRegistrations()]);
    updateAdminUI();
    state.selectedDateKey = formatDateKey(getToday());
    renderCalendar();

    window.addEventListener('auth:updated', async function() {
      await loadRegistrations();
      updateAdminUI();
      renderCalendar();
      if (state.activePanel === 'detail') renderEventDetail(getEventById(state.selectedEventId));
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
