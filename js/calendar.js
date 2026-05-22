// calendar.js - 完整修复版
(function() {
  const state = {
    events: [],
    registrations: [],
    currentUserId: null,
    currentDate: new Date(),
    selectedDateKey: '',
    modalAnimToken: 0,
    activeView: 'calendar',
    activeFilter: 'all',
    lastSaveError: '',
  };

  const EVENTS_FILE = './data/events.json';

  // DOM 元素缓存
  let elements = {};

  function $(id) {
    return document.getElementById(id);
  }

  function formatDateKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function parseEventDate(str) {
    if (!str) return null;
    const m = String(str).match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }

  // 获取事件结束日期（没有 date_end 则等于开始日期）
  function getEventDateEnd(event) {
    if (event.parsedDateEnd) return event.parsedDateEnd;
    return event.parsedDate;
  }

  // 判断事件状态
  function isEventUpcoming(event) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return event.parsedDate > today;
  }

  function isEventOngoing(event) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = getEventDateEnd(event);
    return event.parsedDate <= today && end >= today;
  }

  function isEventEnded(event) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = getEventDateEnd(event);
    return end < today;
  }

  function getEventStatus(event) {
    if (isEventUpcoming(event)) return 'upcoming';
    if (isEventOngoing(event)) return 'ongoing';
    return 'ended';
  }

  function getEventStatusLabel(status) {
    const labels = { upcoming: '即将开始', ongoing: '进行中', ended: '已结束' };
    return labels[status] || '';
  }

  function formatShortDate(dateStr) {
    if (!dateStr) return '';
    const m = String(dateStr).match(/^\d{4}-(\d{1,2})-(\d{1,2})$/);
    if (!m) return dateStr;
    return `${parseInt(m[1])}/${parseInt(m[2])}`;
  }

  function isAdminMode() {
    return typeof hasRole === 'function' && hasRole('manager');
  }

  function isLoggedIn() {
    return typeof currentUser !== 'undefined' && currentUser !== null && currentUser?.logged_in === true;
  }

  // 加载活动数据
  async function loadEvents() {
    try {
      const resp = await fetch(EVENTS_FILE + '?t=' + Date.now(), { cache: 'no-store' });
      if (!resp.ok) {
        console.warn('活动文件不存在或无法读取，使用空数据');
        state.events = [];
        return;
      }
      const json = await resp.json();
      if (Array.isArray(json?.events)) {
        state.events = json.events
          .map((item) => ({
            ...item,
            parsedDate: parseEventDate(item.date),
            parsedDateEnd: parseEventDate(item.date_end),
          }))
          .filter((item) => item.parsedDate instanceof Date && !isNaN(item.parsedDate.getTime()));
      } else {
        state.events = [];
      }
      console.log(`✅ 加载了 ${state.events.length} 个活动`);
    } catch (e) {
      console.error('加载活动失败:', e);
      state.events = [];
    }
    updateAdminUI();
    renderCalendar();
  }

  // 保存活动数据到服务器
  async function saveEvents() {
    if (!isAdminMode()) {
      console.error('无管理员权限');
      return false;
    }

    try {
      const eventsToSave = state.events.map(({ parsedDate, parsedDateEnd, ...rest }) => rest);
      const response = await fetch('./api/events.php?action=replace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: eventsToSave })
      });
      
      if (response.ok) {
        const result = await response.json();
        return result.success === true;
      }
      return false;
    } catch (e) {
      console.error('保存活动失败:', e);
      return false;
    }
  }

  // 添加活动
  async function addEvent(eventData) {
    state.lastSaveError = '';
    if (!isAdminMode()) {
      alert(__('alertAdminModeRequired'));
      return false;
    }

    try {
      const response = await fetch('./api/events.php?action=add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(eventData)
      });
      const result = await response.json();
      if (!result.success || !result.event) {
        state.lastSaveError = result.message || __('alertSaveFailed');
        return false;
      }
      const newEvent = {
        ...result.event,
        parsedDate: parseEventDate(result.event.date),
        parsedDateEnd: parseEventDate(result.event.date_end)
      };
      state.events.push(newEvent);
      renderCalendar();
      return true;
    } catch (e) {
      console.error('添加活动失败:', e);
      state.lastSaveError = __('alertSaveFailed');
      return false;
    }
  }

  // ====== 活动报名功能 ======

  // 加载报名数据
  async function loadRegistrations() {
    try {
      const r = await fetch('./api/events.php?action=registrations');
      const data = await r.json();
      if (data.success) {
        state.registrations = data.registrations || [];
      }
    } catch (e) {
      console.error('加载报名数据失败:', e);
      state.registrations = [];
    }
    // 获取当前用户 ID
    if (window.currentUser?.logged_in && window.currentUser?.user) {
      state.currentUserId = window.currentUser.user.id;
    } else {
      state.currentUserId = null;
    }
  }

  // 检查当前用户是否已报名某活动
  function isRegistered(eventId) {
    if (!state.currentUserId) return false;
    return state.registrations.some(function(r) {
      return r.event_id === eventId && r.user_id === state.currentUserId;
    });
  }

  // 获取某活动的报名人数
  function getRegistrationCount(eventId) {
    return state.registrations.filter(function(r) { return r.event_id === eventId; }).length;
  }

  // 报名
  async function registerForEvent(eventId) {
    if (!isLoggedIn()) {
      alert(__('alertPleaseLoginFirst'));
      return false;
    }
    try {
      const r = await fetch('./api/events.php?action=register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: eventId })
      });
      const data = await r.json();
      if (data.success) {
        await loadRegistrations();
        return true;
      } else {
        alert(data.message || __('alertSignupFail'));
        return false;
      }
    } catch (e) {
      console.error('报名失败:', e);
      return false;
    }
  }

  // 取消报名
  async function unregisterFromEvent(eventId) {
    if (!isLoggedIn()) return false;
    try {
      const r = await fetch('./api/events.php?action=unregister', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: eventId })
      });
      const data = await r.json();
      if (data.success) {
        await loadRegistrations();
        return true;
      } else {
        alert(data.message || __('alertCancelFail'));
        return false;
      }
    } catch (e) {
      console.error('取消报名失败:', e);
      return false;
    }
  }

  // 非管理员直接添加活动（通过 action=add 端点，无需审核）
  async function addEventDirect(eventData) {
    if (!isLoggedIn()) {
      alert(__('alertPleaseLoginFirst'));
      return false;
    }

    try {
      const response = await fetch('./api/events.php?action=add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(eventData)
      });
      const result = await response.json();
      if (result.success && result.event) {
        const newEvent = {
          ...result.event,
          parsedDate: parseEventDate(result.event.date),
          parsedDateEnd: parseEventDate(result.event.date_end)
        };
        state.events.push(newEvent);
        if (state.activeView === 'calendar') renderCalendar();
        else renderListView(state.activeFilter);
        return true;
      }
      return false;
    } catch (e) {
      console.error('添加活动失败:', e);
      return false;
    }
  }

  // 更新活动
  async function updateEvent(eventId, eventData) {
    if (!isAdminMode()) return false;

    const index = state.events.findIndex(e => e.id === eventId);
    if (index === -1) return false;

    state.events[index] = {
      ...state.events[index],
      event: eventData.event,
      date: eventData.date,
      date_end: eventData.date_end || undefined,
      image: eventData.image || '',
      raw_text: eventData.raw_text || '',
      offical: eventData.offical ? 1 : 0,
      description: eventData.description || '',
      link: eventData.link || '',
      updated_at: new Date().toISOString()
    };
    state.events[index].parsedDate = parseEventDate(state.events[index].date);
    state.events[index].parsedDateEnd = parseEventDate(state.events[index].date_end);

    const success = await saveEvents();
    if (success) {
      renderCalendar();
      return true;
    }
    return false;
  }

  // 删除活动
  async function deleteEvent(eventId) {
    if (!isAdminMode()) return false;
    
    if (!confirm(__('confirmDeleteSimple'))) return false;

    const index = state.events.findIndex(e => e.id === eventId);
    if (index === -1) return false;

    state.events.splice(index, 1);
    const success = await saveEvents();
    if (success) {
      renderCalendar();
      return true;
    }
    return false;
  }

  // 打开添加/编辑活动弹窗
  function openEventEditor(editEvent = null) {
    if (!elements.eventEditorModal) {
      console.error('活动编辑器模态框未找到');
      return;
    }

    if (editEvent) {
      if (elements.eventEditorTitle) elements.eventEditorTitle.textContent = '✏️ 编辑活动';
      if (elements.eventEditorId) elements.eventEditorId.value = editEvent.id;
      if (elements.eventEditorName) elements.eventEditorName.value = editEvent.event || '';
      if (elements.eventEditorDate) elements.eventEditorDate.value = editEvent.date || '';
      if (elements.eventEditorDateEnd) elements.eventEditorDateEnd.value = editEvent.date_end || '';
      if (elements.eventEditorRawText) elements.eventEditorRawText.value = editEvent.raw_text || '';
      if (elements.eventEditorImage) elements.eventEditorImage.value = editEvent.image || '';
      if (elements.eventEditorOfficial) elements.eventEditorOfficial.checked = editEvent.offical === 1;
      if (elements.eventEditorDescription) elements.eventEditorDescription.value = editEvent.description || '';
      if (elements.eventEditorLink) elements.eventEditorLink.value = editEvent.link || '';
      if (elements.eventEditorDeleteBtn) elements.eventEditorDeleteBtn.style.display = 'block';
      // 显示已有海报
      const imgUrl = editEvent.image || '';
      if (imgUrl && elements.eventImagePreview) {
        elements.eventImagePreview.src = imgUrl;
        elements.eventImagePreview.style.display = 'block';
      }
      if (elements.eventImageRemoveBtn) elements.eventImageRemoveBtn.style.display = imgUrl ? 'inline-block' : 'none';
    } else {
      if (elements.eventEditorTitle) elements.eventEditorTitle.textContent = '➕ 添加活动';
      if (elements.eventEditorId) elements.eventEditorId.value = '';
      if (elements.eventEditorName) elements.eventEditorName.value = '';
      if (elements.eventEditorDate) elements.eventEditorDate.value = '';
      if (elements.eventEditorDateEnd) elements.eventEditorDateEnd.value = '';
      if (elements.eventEditorRawText) elements.eventEditorRawText.value = '';
      if (elements.eventEditorImage) elements.eventEditorImage.value = '';
      if (elements.eventEditorOfficial) elements.eventEditorOfficial.checked = false;
      if (elements.eventEditorDescription) elements.eventEditorDescription.value = '';
      if (elements.eventEditorLink) elements.eventEditorLink.value = '';
      if (elements.eventEditorDeleteBtn) elements.eventEditorDeleteBtn.style.display = 'none';
      if (elements.eventImagePreview) { elements.eventImagePreview.src = ''; elements.eventImagePreview.style.display = 'none'; }
      if (elements.eventImageRemoveBtn) elements.eventImageRemoveBtn.style.display = 'none';
      if (elements.eventImageStatus) elements.eventImageStatus.textContent = '';
    }

    // 非管理员隐藏"官方活动"选项
    var officialWrap = document.getElementById('eventOfficialWrap');
    if (officialWrap) officialWrap.style.display = isAdminMode() ? '' : 'none';

    elements.eventEditorModal.classList.add('open');
    elements.eventEditorModal.setAttribute('aria-hidden', 'false');
  }

  function closeEventEditor() {
    if (elements.eventEditorModal) {
      elements.eventEditorModal.classList.remove('open');
      elements.eventEditorModal.setAttribute('aria-hidden', 'true');
    }
  }

  // 保存活动（添加或编辑）
  async function saveEventFromEditor() {
    const eventId = elements.eventEditorId?.value;
    const dateEndVal = elements.eventEditorDateEnd?.value || '';
    const eventData = {
      event: elements.eventEditorName?.value.trim() || '',
      date: elements.eventEditorDate?.value || '',
      date_end: dateEndVal || undefined,
      raw_text: elements.eventEditorRawText?.value.trim() || '',
      image: elements.eventEditorImage?.value.trim() || '',
      offical: elements.eventEditorOfficial?.checked || false,
      description: elements.eventEditorDescription?.value.trim() || '',
      link: elements.eventEditorLink?.value.trim() || ''
    };

    if (!eventData.event) {
      alert(__('alertNameRequiredCal'));
      return;
    }
    if (!eventData.date) {
      alert(__('alertDateRequired'));
      return;
    }

    let success;
    state.lastSaveError = '';
    if (eventId) {
      success = await updateEvent(parseInt(eventId), eventData);
    } else if (isAdminMode()) {
      success = await addEvent(eventData);
    } else {
      success = await addEventDirect(eventData);
    }

    if (success) {
      closeEventEditor();
      if (isAdminMode()) {
        alert(eventId ? __('alertUpdateSuccess') : __('alertAddSuccess'));
      } else {
        alert(__('alertAddSuccess'));
      }
    } else {
      alert(state.lastSaveError || __('alertSaveFailed'));
    }
  }

  // 打开活动详情弹窗
  function openEventDetail(eventData) {
    if (!elements.eventDetailModal) {
      console.error('活动详情模态框未找到');
      return;
    }

    if (elements.eventDetailTitle) elements.eventDetailTitle.textContent = eventData.event || '活动详情';
    if (elements.eventDetailDate) {
      let dateText = eventData.date || '日期待定';
      if (eventData.date_end && eventData.date_end !== eventData.date) {
        dateText = `${eventData.date} ~ ${eventData.date_end}`;
      }
      elements.eventDetailDate.textContent = dateText;
    }
    
    if (elements.eventDetailImage) {
      if (eventData.image) {
        elements.eventDetailImage.src = eventData.image;
        elements.eventDetailImage.style.display = 'block';
      } else {
        elements.eventDetailImage.style.display = 'none';
      }
    }
    
    if (elements.eventDetailDescription) {
      elements.eventDetailDescription.textContent = eventData.description || eventData.raw_text || '暂无详细介绍';
    }
    
    if (elements.eventDetailLink) {
      if (eventData.link) {
        elements.eventDetailLink.href = eventData.link;
        elements.eventDetailLink.style.display = 'inline-flex';
      } else {
        elements.eventDetailLink.style.display = 'none';
      }
    }

    const isAdmin = isAdminMode();
    if (elements.eventDetailEditBtn) elements.eventDetailEditBtn.style.display = isAdmin ? 'flex' : 'none';
    if (elements.eventDetailDeleteBtn) elements.eventDetailDeleteBtn.style.display = isAdmin ? 'flex' : 'none';

    if (elements.eventDetailEditBtn) elements.eventDetailEditBtn.dataset.eventId = eventData.id;
    if (elements.eventDetailDeleteBtn) elements.eventDetailDeleteBtn.dataset.eventId = eventData.id;

    // 报名状态
    const loggedIn = isLoggedIn();
    const regCount = getRegistrationCount(eventData.id);
    const userReg = isRegistered(eventData.id);
    if (elements.eventDetailRegSection) {
      elements.eventDetailRegSection.style.display = loggedIn || regCount > 0 ? 'flex' : 'none';
    }
    if (elements.eventDetailRegCount) {
      elements.eventDetailRegCount.textContent = regCount > 0 ? '👥 ' + regCount + ' 人已报名' : '暂无报名';
    }
    if (elements.eventDetailRegBtn) {
      if (loggedIn) {
        elements.eventDetailRegBtn.style.display = '';
        elements.eventDetailRegBtn.dataset.eventId = eventData.id;
        if (userReg) {
          elements.eventDetailRegBtn.textContent = '✓ 已报名（点击取消）';
          elements.eventDetailRegBtn.dataset.action = 'unregister';
          elements.eventDetailRegBtn.style.background = 'var(--md-primary)';
          elements.eventDetailRegBtn.style.color = '#fff';
        } else {
          elements.eventDetailRegBtn.textContent = '📝 报名参加';
          elements.eventDetailRegBtn.dataset.action = 'register';
          elements.eventDetailRegBtn.style.background = '';
          elements.eventDetailRegBtn.style.color = '';
        }
      } else {
        elements.eventDetailRegBtn.style.display = 'none';
      }
    }

    elements.eventDetailModal.classList.add('open');
    elements.eventDetailModal.setAttribute('aria-hidden', 'false');
  }

  function closeEventDetail() {
    if (elements.eventDetailModal) {
      elements.eventDetailModal.classList.remove('open');
      elements.eventDetailModal.setAttribute('aria-hidden', 'true');
    }
  }

  function getEventById(id) {
    return state.events.find(e => e.id === id);
  }

  function updateAdminUI() {
    const isAdmin = isAdminMode();
    const loggedIn = isLoggedIn();
    if (elements.calendarAddEventBtn) {
      elements.calendarAddEventBtn.style.display = isAdmin ? 'flex' : 'none';
    }
  }

  function openCalendar() {
    if (!elements.calendarModal) return;

    // 刷新报名数据
    loadRegistrations();

    // 重置为月历视图
    state.activeView = 'calendar';
    state.activeFilter = 'all';

    elements.calendarModal.classList.add('open');
    elements.calendarModal.setAttribute('aria-hidden', 'false');

    if (!state.selectedDateKey) {
      state.selectedDateKey = formatDateKey(new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), 1));
    }

    // 重置标签状态
    const tabs = document.querySelectorAll('.view-tab');
    tabs.forEach(tab => tab.classList.toggle('active', tab.dataset.view === 'calendar'));
    const filterBtns = document.querySelectorAll('.filter-tab');
    filterBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.filter === 'all'));

    // 显示月历视图，隐藏列表视图
    const gridView = document.getElementById('calendarGridView');
    const listViewEl = document.getElementById('listView');
    if (gridView) gridView.style.display = '';
    if (listViewEl) listViewEl.style.display = 'none';

    renderCalendar();
  }

  function closeCalendar() {
    if (elements.calendarModal) {
      elements.calendarModal.classList.remove('open');
      elements.calendarModal.setAttribute('aria-hidden', 'true');
    }
  }

  // 渲染日历
  function renderCalendar() {
    if (!elements.calendarGrid || !elements.calendarTitle || !elements.calendarEventList) {
      console.warn('日历DOM元素未就绪');
      return;
    }

    const current = state.currentDate;
    const year = current.getFullYear();
    const month = current.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startWeekday = firstDay.getDay();
    const totalDays = lastDay.getDate();

    elements.calendarTitle.textContent = `${year}年${month + 1}月 Galgame活动日历`;

    // 构建事件映射（支持多日活动）
    const eventMap = new Map();
    state.events.forEach((item) => {
      if (!item.parsedDate) return;
      const start = item.parsedDate;
      const end = getEventDateEnd(item);
      // 遍历从 start 到 end 的每一天
      const iter = new Date(start);
      while (iter <= end) {
        const key = formatDateKey(iter);
        if (!eventMap.has(key)) eventMap.set(key, []);
        eventMap.get(key).push(item);
        iter.setDate(iter.getDate() + 1);
      }
    });

    // 构建日历网格
    const weekLabels = ['日', '一', '二', '三', '四', '五', '六'];
    let cells = weekLabels.map((w) => `<div class="calendar-weekday">${w}</div>`);

    for (let i = 0; i < startWeekday; i += 1) {
      cells.push('<div class="calendar-cell empty"></div>');
    }

    for (let day = 1; day <= totalDays; day += 1) {
      const date = new Date(year, month, day);
      const key = formatDateKey(date);
      const events = eventMap.get(key) || [];
      const officialCount = events.filter((item) => Number(item.offical) === 1).length;
      const normalCount = events.length - officialCount;
      const selected = state.selectedDateKey === key ? 'selected' : '';
      
      let dotsHtml = '';
      if (normalCount > 0 || officialCount > 0) {
        dotsHtml = `<span class="calendar-dot-row">
          ${normalCount > 0 ? `<span class="calendar-dot">${normalCount}</span>` : ''}
          ${officialCount > 0 ? `<span class="calendar-dot official-dot">${officialCount}</span>` : ''}
        </span>`;
      }
      
      cells.push(`
        <button class="calendar-cell ${events.length ? 'has-event' : ''} ${selected}" type="button" data-date="${key}">
          <span class="calendar-day">${day}</span>
          ${dotsHtml}
        </button>
      `);
    }

    elements.calendarGrid.innerHTML = cells.join('');

    // 渲染当天活动
    renderSelectedDayEvents(state.selectedDateKey, eventMap);
  }

  function renderSelectedDayEvents(dateKey, eventMap) {
    if (!elements.calendarEventList) return;
    
    const dayEvents = eventMap.get(dateKey) || [];
    if (!dayEvents.length) {
      const current = state.currentDate;
      const year = current.getFullYear();
      const month = current.getMonth();
      const monthEventCount = state.events.filter(
        (item) => item.parsedDate && item.parsedDate.getFullYear() === year && item.parsedDate.getMonth() === month
      ).length;
      elements.calendarEventList.innerHTML = `<div class="calendar-empty">本月有${monthEventCount}个Galgame活动</div>`;
      return;
    }

    const isAdmin = isAdminMode();

    elements.calendarEventList.innerHTML = dayEvents
      .map((item) => {
        const eventKey = encodeURIComponent(JSON.stringify({
          id: item.id,
          event: item.event || '',
          date: item.date || '',
          date_end: item.date_end || '',
          image: item.image || '',
          raw_text: item.raw_text || '',
          description: item.description || '',
          link: item.link || '',
          offical: item.offical || 0
        }));
        const official = Number(item.offical) === 1;
        return `
          <button class="calendar-event-item ${official ? 'official' : ''}" type="button" data-event-key="${eventKey}" data-date="${dateKey}">
            <div class="calendar-event-date">${dateKey}</div>
            <div class="calendar-event-name">${escapeHtml(item.event || '未命名活动')}</div>
            <div class="calendar-event-text">${escapeHtml(item.raw_text || '')}</div>
            ${isAdmin ? `<div class="calendar-event-admin-badge">📝</div>` : ''}
          </button>
        `;
      })
      .join('');
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>]/g, function(m) {
      if (m === '&') return '&amp;';
      if (m === '<') return '&lt;';
      if (m === '>') return '&gt;';
      return m;
    });
  }

  // ====== 列表视图 ======

  function renderListView(filter) {
    const container = document.getElementById('eventListContainer');
    if (!container) return;

    let filtered = [...state.events];

    // 根据筛选条件过滤
    if (filter === 'upcoming') {
      filtered = filtered.filter(e => isEventUpcoming(e));
    } else if (filter === 'ongoing') {
      filtered = filtered.filter(e => isEventOngoing(e));
    } else if (filter === 'ended') {
      filtered = filtered.filter(e => isEventEnded(e));
    }

    // 按开始日期倒序排列（最新的在前）
    filtered.sort((a, b) => b.parsedDate - a.parsedDate);

    if (!filtered.length) {
      container.innerHTML = '<div class="event-list-empty">📭 暂无匹配的活动</div>';
      return;
    }

    container.innerHTML = filtered.map(renderEventListItem).join('');
  }

  function renderEventListItem(event) {
    const status = getEventStatus(event);
    const statusLabel = getEventStatusLabel(status);
    const startDate = event.parsedDate;
    const endDate = getEventDateEnd(event);
    const isMultiDay = endDate > startDate;
    const official = Number(event.offical) === 1;

    // 报名状态
    const regCount = getRegistrationCount(event.id);
    const userRegistered = isRegistered(event.id);
    const loggedIn = isLoggedIn();

    // 格式化日期显示
    const month = String(startDate.getMonth() + 1);
    const day = String(startDate.getDate()).padStart(2, '0');
    const weekday = ['日','一','二','三','四','五','六'][startDate.getDay()];

    // 多日活动日期显示
    let dateDisplay = '';
    if (isMultiDay) {
      const endMonth = endDate.getMonth() + 1;
      const endDay = String(endDate.getDate()).padStart(2, '0');
      dateDisplay = `${month}/${day}~${endMonth}/${endDay}`;
    } else {
      dateDisplay = `${month}/${day}`;
    }

    const eventKey = encodeURIComponent(JSON.stringify({
      id: event.id,
      event: event.event || '',
      date: event.date || '',
      date_end: event.date_end || '',
      image: event.image || '',
      raw_text: event.raw_text || '',
      description: event.description || '',
      link: event.link || '',
      offical: event.offical || 0
    }));

    // 报名按钮 HTML
    let regHtml = '';
    if (loggedIn) {
      if (userRegistered) {
        regHtml = `<button class="event-list-reg-btn registered" data-action="unregister" data-event-id="${event.id}">✓ 已报名 (${regCount})</button>`;
      } else {
        regHtml = `<button class="event-list-reg-btn" data-action="register" data-event-id="${event.id}">📝 报名 (${regCount})</button>`;
      }
    } else if (regCount > 0) {
      regHtml = `<span class="event-list-reg-count">👥 ${regCount} 人报名</span>`;
    }

    return `
      <div class="event-list-item-wrap">
        <button class="event-list-item ${official ? 'official' : ''}" type="button" data-event-key="${eventKey}">
          <div class="event-list-date-block">
            <span class="event-list-date-day">${day}</span>
            <span class="event-list-date-month">${month}月</span>
            ${isMultiDay ? `<span class="event-list-date-range">~${endMonth}/${endDay}</span>` : ''}
          </div>
          <div class="event-list-info">
            <div class="event-list-title">${escapeHtml(event.event || '未命名活动')}</div>
            <div class="event-list-meta">${escapeHtml(event.raw_text || '')}</div>
          </div>
          <span class="event-list-badge ${status}">${statusLabel}</span>
        </button>
        <div class="event-list-reg-section">${regHtml}</div>
      </div>
    `;
  }

  // ====== 视图切换 ======

  function switchView(view) {
    state.activeView = view;

    // 更新标签状态
    const tabs = document.querySelectorAll('.view-tab');
    tabs.forEach(tab => {
      tab.classList.toggle('active', tab.dataset.view === view);
    });

    // 切换视图容器显示
    const gridView = document.getElementById('calendarGridView');
    const listViewEl = document.getElementById('listView');
    if (gridView) gridView.style.display = view === 'calendar' ? '' : 'none';
    if (listViewEl) listViewEl.style.display = view === 'list' ? '' : 'none';

    // 渲染对应视图
    if (view === 'calendar') {
      renderCalendar();
    } else if (view === 'list') {
      renderListView(state.activeFilter);
    }
  }

  function switchFilter(filter) {
    state.activeFilter = filter;

    // 更新筛选按钮状态
    const filterBtns = document.querySelectorAll('.filter-tab');
    filterBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.filter === filter);
    });

    // 重新渲染列表
    renderListView(filter);
  }

  function bindEvents() {
    // 日历按钮 — 顶层卡片和 FAB
    document.querySelectorAll('[data-action="calendar"], #fabCalendar').forEach(btn => {
      btn.addEventListener('click', openCalendar);
    });
    
    if (elements.calendarModalClose) {
      elements.calendarModalClose.addEventListener('click', closeCalendar);
    }
    
    if (elements.calendarModal) {
      elements.calendarModal.addEventListener('click', (e) => {
        if (e.target === elements.calendarModal) closeCalendar();
      });
    }

    // 月份切换
    if (elements.calendarPrevBtn) {
      elements.calendarPrevBtn.addEventListener('click', () => {
        state.currentDate = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth() - 1, 1);
        renderCalendar();
      });
    }

    if (elements.calendarNextBtn) {
      elements.calendarNextBtn.addEventListener('click', () => {
        state.currentDate = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth() + 1, 1);
        renderCalendar();
      });
    }

    // 活动列表点击
    if (elements.calendarEventList) {
      elements.calendarEventList.addEventListener('click', (e) => {
        const item = e.target.closest('.calendar-event-item');
        if (!item) return;
        const rawKey = item.getAttribute('data-event-key');
        if (!rawKey) return;
        try {
          const parsed = JSON.parse(decodeURIComponent(rawKey));
          const eventData = state.events.find((ev) => ev.id === parsed.id) || parsed;
          openEventDetail(eventData);
        } catch (err) {
          console.error('解析活动数据失败:', err);
        }
      });
    }

    // 列表视图事件点击（事件冒泡）
    document.getElementById('eventListContainer')?.addEventListener('click', (e) => {
      const item = e.target.closest('.event-list-item');
      if (!item) return;
      const rawKey = item.getAttribute('data-event-key');
      if (!rawKey) return;
      try {
        const parsed = JSON.parse(decodeURIComponent(rawKey));
        const eventData = state.events.find((ev) => ev.id === parsed.id) || parsed;
        openEventDetail(eventData);
      } catch (err) {
        console.error('解析活动数据失败:', err);
      }
    });

    // 日历格子点击
    if (elements.calendarGrid) {
      elements.calendarGrid.addEventListener('click', (e) => {
        const cell = e.target.closest('.calendar-cell');
        if (!cell) return;
        const dateKey = cell.getAttribute('data-date');
        if (!dateKey) return;
        state.selectedDateKey = dateKey;
        renderCalendar();
      });
    }

    // 视图切换标签
    document.querySelectorAll('.view-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        switchView(tab.dataset.view);
      });
    });

    // 筛选按钮
    document.querySelectorAll('.filter-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        switchFilter(tab.dataset.filter);
      });
    });

    // 添加活动按钮（管理员）
    if (elements.calendarAddEventBtn) {
      elements.calendarAddEventBtn.addEventListener('click', () => {
        if (!isAdminMode()) {
          alert(__('alertAdminModeRequired'));
          return;
        }
        openEventEditor(null);
      });
    }

    // 活动编辑器事件
    if (elements.eventEditorCancelBtn) {
      elements.eventEditorCancelBtn.addEventListener('click', closeEventEditor);
    }
    if (elements.eventEditorSaveBtn) {
      elements.eventEditorSaveBtn.addEventListener('click', saveEventFromEditor);
    }
    if (elements.eventEditorDeleteBtn) {
      elements.eventEditorDeleteBtn.addEventListener('click', async () => {
        const eventId = elements.eventEditorId?.value;
        if (eventId) {
          await deleteEvent(parseInt(eventId));
          closeEventEditor();
        }
      });
    }

    // 活动海报上传
    if (elements.eventImageBtn && elements.eventImageInput) {
      elements.eventImageBtn.addEventListener('click', () => elements.eventImageInput.click());
      elements.eventImageInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const eventId = elements.eventEditorId?.value || 'event_' + Date.now();
        const fd = new FormData();
        fd.append('image', file);
        fd.append('id', eventId);
        if (elements.eventImageStatus) elements.eventImageStatus.textContent = '上传中...';
        try {
          const r = await fetch('./api/club_avatar.php?scope=event', { method: 'POST', body: fd });
          const j = await r.json();
          if (j.success) {
            const imageUrl = window.Utils?.preloadMediaUrl ? window.Utils.preloadMediaUrl(j.image_url) : j.image_url;
            if (elements.eventImagePreview) { elements.eventImagePreview.src = imageUrl; elements.eventImagePreview.style.display = 'block'; }
            if (elements.eventEditorImage) elements.eventEditorImage.value = j.image_url;
            if (elements.eventImageRemoveBtn) elements.eventImageRemoveBtn.style.display = 'inline-block';
            if (elements.eventImageStatus) elements.eventImageStatus.textContent = '✅ 上传成功';
          } else {
            if (elements.eventImageStatus) elements.eventImageStatus.textContent = '❌ ' + (j.message || '上传失败');
          }
        } catch { if (elements.eventImageStatus) elements.eventImageStatus.textContent = '❌ 网络错误'; }
        elements.eventImageInput.value = '';
      });
    }
    if (elements.eventImageRemoveBtn) {
      elements.eventImageRemoveBtn.addEventListener('click', () => {
        if (elements.eventImagePreview) { elements.eventImagePreview.src = ''; elements.eventImagePreview.style.display = 'none'; }
        if (elements.eventEditorImage) elements.eventEditorImage.value = '';
        elements.eventImageRemoveBtn.style.display = 'none';
        if (elements.eventImageStatus) elements.eventImageStatus.textContent = '已移除海报';
      });
    }

    // 活动详情弹窗事件
    if (elements.eventDetailModal) {
      elements.eventDetailModal.addEventListener('click', (e) => {
        if (e.target === elements.eventDetailModal) closeEventDetail();
      });
    }
    if (elements.eventDetailClose) {
      elements.eventDetailClose.addEventListener('click', closeEventDetail);
    }
    
    if (elements.eventDetailEditBtn) {
      elements.eventDetailEditBtn.addEventListener('click', () => {
        const eventId = elements.eventDetailEditBtn.dataset.eventId;
        if (eventId) {
          const eventData = getEventById(parseInt(eventId));
          if (eventData) {
            closeEventDetail();
            openEventEditor(eventData);
          }
        }
      });
    }
    
    if (elements.eventDetailDeleteBtn) {
      elements.eventDetailDeleteBtn.addEventListener('click', async () => {
        const eventId = elements.eventDetailDeleteBtn.dataset.eventId;
        if (eventId) {
          await deleteEvent(parseInt(eventId));
          closeEventDetail();
        }
      });
    }

    // 列表项报名按钮（事件委托）
    const listContainer = document.getElementById('eventListContainer');
    if (listContainer) {
      listContainer.addEventListener('click', async (e) => {
        const btn = e.target.closest('.event-list-reg-btn');
        if (!btn) return;
        const eventId = parseInt(btn.dataset.eventId);
        if (!eventId) return;
        if (btn.dataset.action === 'register') {
          if (await registerForEvent(eventId)) {
            renderListView(state.activeFilter);
          }
        } else if (btn.dataset.action === 'unregister') {
          if (await unregisterFromEvent(eventId)) {
            renderListView(state.activeFilter);
          }
        }
      });
    }

    // 详情弹窗报名/取消按钮
    if (elements.eventDetailRegBtn) {
      elements.eventDetailRegBtn.addEventListener('click', async () => {
        const eventId = parseInt(elements.eventDetailRegBtn.dataset.eventId);
        if (!eventId) return;
        const action = elements.eventDetailRegBtn.dataset.action;
        if (action === 'register') {
          if (await registerForEvent(eventId)) {
            const eventData = getEventById(eventId);
            if (eventData) openEventDetail(eventData);
          }
        } else if (action === 'unregister') {
          if (confirm(__('confirmDeleteSimple'))) {
            if (await unregisterFromEvent(eventId)) {
              const eventData = getEventById(eventId);
              if (eventData) openEventDetail(eventData);
            }
          }
        }
      });
    }

  }

  function initElements() {
    elements = {
      calendarModal: $('calendarModal'),
      calendarModalClose: $('calendarModalClose'),
      calendarPrevBtn: $('calendarPrevBtn'),
      calendarNextBtn: $('calendarNextBtn'),
      calendarTitle: $('calendarTitle'),
      calendarGrid: $('calendarGrid'),
      calendarEventList: $('calendarEventList'),
      calendarAddEventBtn: $('calendarAddEventBtn'),
      eventEditorModal: $('eventEditorModal'),
      eventEditorTitle: $('eventEditorTitle'),
      eventEditorId: $('eventEditorId'),
      eventEditorName: $('eventEditorName'),
      eventEditorDate: $('eventEditorDate'),
      eventEditorDateEnd: $('eventEditorDateEnd'),
      eventEditorRawText: $('eventEditorRawText'),
      eventEditorImage: $('eventEditorImage'),
      eventEditorOfficial: $('eventEditorOfficial'),
      eventEditorDescription: $('eventEditorDescription'),
      eventEditorLink: $('eventEditorLink'),
      eventEditorCancelBtn: $('eventEditorCancelBtn'),
      eventEditorSaveBtn: $('eventEditorSaveBtn'),
      eventEditorDeleteBtn: $('eventEditorDeleteBtn'),
      eventImagePreview: $('eventImagePreview'),
      eventImageInput: $('eventImageInput'),
      eventImageBtn: $('eventImageBtn'),
      eventImageRemoveBtn: $('eventImageRemoveBtn'),
      eventImageStatus: $('eventImageStatus'),
      eventDetailModal: $('eventDetailModal'),
      eventDetailClose: $('eventDetailClose'),
      eventDetailTitle: $('eventDetailTitle'),
      eventDetailDate: $('eventDetailDate'),
      eventDetailImage: $('eventDetailImage'),
      eventDetailDescription: $('eventDetailDescription'),
      eventDetailLink: $('eventDetailLink'),
      eventDetailEditBtn: $('eventDetailEditBtn'),
      eventDetailDeleteBtn: $('eventDetailDeleteBtn'),
      eventDetailRegSection: $('eventDetailRegSection'),
      eventDetailRegCount: $('eventDetailRegCount'),
      eventDetailRegBtn: $('eventDetailRegBtn')
    };
  }

  async function init() {
    console.log('📅 日历模块初始化...');
    initElements();

    await loadEvents();
    await loadRegistrations();
    bindEvents();
    updateAdminUI();
    window.addEventListener('auth:updated', async function() {
      await loadRegistrations();
      updateAdminUI();
      if (state.activeView === 'list') renderListView(state.activeFilter);
    });
    console.log('✅ 日历模块初始化完成');
  }

  // 启动
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
