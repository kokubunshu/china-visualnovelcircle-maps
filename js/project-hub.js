(function () {
  'use strict';

  const API = {
    projects: './api/projects.php',
    items: './api/project_items.php',
    participations: './api/project_participations.php',
    clubsChina: './api/clubs.php',
    clubsJapan: './api/clubs_japan.php',
    files: './api/project_files.php'
  };

  const TYPE_MAP = { publication: '刊物企划', activity: '活动企划', content: '内容征集', recruit: '协力招募', other: '其他' };
  const TYPE_SHORT = { publication: '刊物', activity: '活动', content: '征集', recruit: '协力', other: '其他' };
  const STATUS_MAP = { draft: '草稿', collecting: '征集中', ongoing: '进行中', completed: '已完成', archived: '已归档' };
  const ITEM_MAP = { submission: '投稿', registration: '报名', collaboration: '申请协力', survey: '填写', voting: '投票', other: '参与' };
  const ITEM_LABEL = { submission: '稿件投稿', registration: '活动报名', collaboration: '协力申请', survey: '问卷填写', voting: '投票', other: '参与项' };
  const PARTICIPATION_STATUS = { submitted: '待审核', reviewing: '审核中', accepted: '已通过', rejected: '已拒绝', withdrawn: '已撤回' };

  let hubProjects = [];
  let hubItems = [];
  let hubParticipants = [];
  let hubClubs = [];
  let hubFilterType = 'all';
  let hubFilterStatus = 'all';
  let hubSelectedId = null;
  let hubSelectedTab = 'overview';
  let loading = false;
  let hubProjectsLoadedAt = 0;
  let hubProjectsRequest = null;

  function esc(value) {
    if (window.Utils && typeof window.Utils.escapeHTML === 'function') return window.Utils.escapeHTML(value);
    return String(value || '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  }

  function mediaUrl(value) {
    return window.Utils && typeof window.Utils.resolveMediaUrl === 'function' ? window.Utils.resolveMediaUrl(value) : String(value || '');
  }

  function apiUrl(url, params) {
    const query = new URLSearchParams(params || {});
    return query.toString() ? url + '?' + query.toString() : url;
  }

  async function request(url, options) {
    const resp = await fetch(url, Object.assign({ credentials: 'same-origin', cache: 'no-store' }, options || {}));
    const text = await resp.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch (e) { data = { success: false, message: text || '接口返回格式错误' }; }
    if (!resp.ok || data.success === false) throw new Error(data.message || ('请求失败：' + resp.status));
    return data;
  }

  function currentUserCanManage(project) {
    if (typeof hasRole === 'function' && hasRole('super_admin')) return true;
    if (!project || !project.organizer_club || typeof canManageClub !== 'function') return false;
    return canManageClub(project.organizer_club.id, project.organizer_club.country || 'china');
  }

  async function loadHubClubs() {
    if (hubClubs.length) return hubClubs;
    const [china, japan] = await Promise.all([
      request(API.clubsChina).catch(() => ({ data: [] })),
      request(API.clubsJapan).catch(() => ({ data: [] }))
    ]);
    hubClubs = []
      .concat((china.data || []).map((club) => Object.assign({}, club, { country: 'china' })))
      .concat((japan.data || []).map((club) => Object.assign({}, club, { country: 'japan' })));
    return hubClubs;
  }

  function manageableClubs() {
    if (typeof hasRole === 'function' && hasRole('super_admin')) return hubClubs;
    if (typeof canManageClub !== 'function') return [];
    return hubClubs.filter((club) => canManageClub(club.id, club.country || 'china'));
  }

  function clubKey(club) {
    return (club?.country || 'china') + ':' + String(club?.id || '');
  }

  function clubOptionLabel(club) {
    const name = club?.name || club?.display_name || club?.school || ('同好会 ' + (club?.id || ''));
    return name + ' · ' + ((club?.country || 'china') === 'japan' ? '日本' : '中国');
  }

  function findClubByKey(key) {
    return hubClubs.find((club) => clubKey(club) === key) || null;
  }

  function pjSelectorOptions(excludeKey) {
    return '<option value="">请选择同好会</option>' + hubClubs
      .filter((club) => clubKey(club) !== excludeKey)
      .map((club) => `<option value="${esc(clubKey(club))}">${esc(clubOptionLabel(club))}</option>`)
      .join('');
  }

  function addPjClubRow(container, excludeKey, selectedValue) {
    const row = document.createElement('div');
    row.className = 'pj-club-row';
    const sel = document.createElement('select');
    sel.className = 'md3-select';
    sel.innerHTML = pjSelectorOptions(excludeKey);
    if (selectedValue) sel.value = selectedValue;
    row.appendChild(sel);
    const rm = document.createElement('button');
    rm.type = 'button';
    rm.className = 'pj-club-remove';
    rm.textContent = '×';
    rm.addEventListener('click', function () { row.remove(); });
    row.appendChild(rm);
    container.appendChild(row);
  }

  function getPjClubKeys() {
    return Array.from(document.querySelectorAll('#pjClubSelectors .md3-select'))
      .map(function (sel) { return sel.value; })
      .filter(Boolean);
  }

  function initPjClubSelectors(modal, project) {
    const container = modal.querySelector('#pjClubSelectors');
    const addBtn = modal.querySelector('#pjClubAddBtn');
    if (!container) return;
    const organizerKey = clubKey(project.organizer_club || {});
    const existing = (project.participant_clubs || []).map(function (club) {
      return clubKey({ id: club.id, country: club.country || 'china' });
    });
    if (existing.length) {
      existing.forEach(function (key) { addPjClubRow(container, organizerKey, key); });
    } else {
      addPjClubRow(container, organizerKey, '');
    }
    if (addBtn) {
      addBtn.addEventListener('click', function () { addPjClubRow(container, organizerKey, ''); });
    }
  }

  function resolveClubName(clubObj) {
    if (clubObj?.name) return clubObj.name;
    if (!clubObj || !clubObj.id) return '未知同好会';
    const list = clubObj.country === 'japan' ? (window.State?.japanRows || []) : (window.State?.bandoriRows || []);
    const found = list.find((club) => parseInt(club.id) === parseInt(clubObj.id));
    return found?.name || found?.school || found?.display_name || ('同好会 #' + clubObj.id);
  }

  function renderClubChip(club, role) {
    if (!club) return '';
    const country = club.country === 'japan' ? '日本' : (club.country === 'overseas' ? '海外' : '中国');
    return `<span class="org-chip ${esc(role || '')}">
      <span class="org-chip-dot"></span>
      <span class="org-chip-main">${esc(resolveClubName(club))}</span>
      <span class="org-chip-meta">${esc(country)}</span>
    </span>`;
  }

  function renderProjectOrgPanel(project) {
    const participants = project.participant_clubs || [];
    return `<div class="detail-org-panel">
      <div class="org-line organizer">
        <div class="org-line-label">发起组织</div>
        <div class="org-line-body">${renderClubChip(project.organizer_club, 'organizer')}</div>
      </div>
      <div class="org-line participants">
        <div class="org-line-label">参与组织</div>
        <div class="org-line-body">
          ${participants.length ? participants.map((club) => renderClubChip(club, 'participant')).join('') : '<span class="org-empty">暂无联合参加同好会</span>'}
        </div>
      </div>
    </div>`;
  }

  function renderProjectPoster(project, compact) {
    if (!project.cover_image) {
      return `<div class="detail-poster empty ${compact ? 'compact' : ''}"><span>暂无宣传图</span></div>`;
    }
    return `<figure class="detail-poster ${compact ? 'compact' : ''}">
      <img src="${esc(mediaUrl(project.cover_image))}" alt="企划宣传图" loading="lazy">
    </figure>`;
  }

  function projectTypeClass(project) {
    const value = project?.project_type || 'other';
    return TYPE_MAP[value] ? value : 'other';
  }

  function itemTypeClass(item) {
    const value = item?.type || 'other';
    return ITEM_MAP[value] ? value : 'other';
  }

  function itemIcon(type) {
    return ({ submission: '✎', registration: '◈', collaboration: '⚒', survey: '☰', voting: '○', other: '·' })[type] || '·';
  }

  async function loadHubProjects(force) {
    const now = Date.now();
    if (!force && hubProjects.length && now - hubProjectsLoadedAt < 60000) {
      return hubProjects;
    }
    if (!force && hubProjectsRequest) {
      return hubProjectsRequest;
    }
    hubProjectsRequest = request(API.projects)
      .then((data) => {
        hubProjects = data.projects || [];
        hubProjectsLoadedAt = Date.now();
        return hubProjects;
      })
      .finally(() => {
        hubProjectsRequest = null;
      });
    return hubProjectsRequest;
  }

  async function loadHubItems(projectId) {
    const data = await request(apiUrl(API.items, { project_id: projectId }));
    hubItems = data.items || [];
  }

  async function loadHubParticipants(projectId) {
    const data = await request(apiUrl(API.participations, { project_id: projectId }));
    hubParticipants = data.participations || [];
  }

  function filteredProjects() {
    return hubProjects.filter((project) => {
      if (hubFilterType !== 'all' && project.project_type !== hubFilterType) return false;
      if (hubFilterStatus !== 'all' && project.status !== hubFilterStatus) return false;
      return !project.deleted_at;
    });
  }

  function renderHubList() {
    const list = document.getElementById('hubProjectList');
    if (!list) return;
    if (loading) {
      list.innerHTML = '<div class="hub-list-loading">加载中...</div>';
      return;
    }
    const rows = filteredProjects();
    if (!rows.length) {
      list.innerHTML = '<div class="hub-list-loading">暂无符合条件的企划</div>';
      return;
    }
    list.innerHTML = rows.map((project) => {
      const type = projectTypeClass(project);
      const status = project.status || 'draft';
      return `
        <button class="hub-card${project.id === hubSelectedId ? ' selected' : ''}" type="button" data-id="${esc(project.id)}">
          <span class="hc-top">
            <span class="hc-top-left"><span class="hc-title">${esc(project.title || '未命名企划')}</span></span>
            <span class="hc-top-right">
              <span class="hc-type ${esc(type)}">${esc(TYPE_SHORT[type] || TYPE_SHORT.other)}</span>
              ${project.is_joint ? '<span class="hc-joint">联合</span>' : ''}
            </span>
          </span>
          <span class="hc-bottom">
            <span class="hc-bottom-left"><span class="hc-org">${esc(resolveClubName(project.organizer_club))}</span></span>
            <span class="hc-bottom-right">
              <span class="hc-status ${esc(status)}">${esc(STATUS_MAP[status] || status)}</span>
              ${project.deadline ? `<span class="hc-deadline">截止 ${esc(project.deadline)}</span>` : ''}
            </span>
          </span>
        </button>`;
    }).join('');
  }

  function renderHubShell() {
    renderHubList();
    document.querySelectorAll('#hubTypeFilterBar .hub-filter-type').forEach((btn) => btn.classList.toggle('active', btn.dataset.type === hubFilterType));
    document.querySelectorAll('#hubStatusFilterBar .hub-filter-status').forEach((btn) => btn.classList.toggle('active', btn.dataset.status === hubFilterStatus));
  }

  async function selectHubProject(projectId) {
    hubSelectedId = parseInt(projectId);
    hubSelectedTab = 'overview';
    renderHubShell();
    const detail = document.getElementById('hubDetailContent');
    const empty = document.getElementById('hubDetailEmpty');
    if (empty) empty.style.display = 'none';
    if (detail) detail.innerHTML = '<div class="hub-detail-loading">加载详情...</div>';
    try {
      await Promise.all([loadHubItems(hubSelectedId), loadHubParticipants(hubSelectedId)]);
      renderHubDetail();
      if (window.innerWidth <= 768) {
        const body = document.querySelector('.hub-body');
        if (body) body.classList.add('hub-show-detail');
      }
    } catch (error) {
      if (detail) detail.innerHTML = '<div class="hub-detail-error">' + esc(error.message) + '</div>';
    }
  }

  function goBackHubList() {
    const body = document.querySelector('.hub-body');
    if (body) body.classList.remove('hub-show-detail');
    hubSelectedId = null;
  }

  function tabButton(tab, label) {
    return `<button class="detail-tab${hubSelectedTab === tab ? ' active' : ''}" type="button" data-tab="${tab}">${label}</button>`;
  }

  function renderHubDetail() {
    const detail = document.getElementById('hubDetailContent');
    const project = hubProjects.find((p) => parseInt(p.id) === parseInt(hubSelectedId));
    if (!detail || !project) return;
    const type = projectTypeClass(project);
    const status = project.status || 'draft';
    const admin = currentUserCanManage(project);
    detail.innerHTML = `
      <div class="detail-scroll">
        <button class="hub-detail-back" type="button" data-hub-action="back-list">← 返回列表</button>
        <div class="detail-hero">
          <div class="detail-hero-info">
            <h3 class="detail-title">${esc(project.title || '未命名企划')}</h3>
            <div class="detail-meta-row">
              <span class="hc-type ${esc(type)}">${esc(TYPE_MAP[type] || TYPE_MAP.other)}</span>
              ${project.is_joint ? '<span class="hc-joint">联合企划</span>' : ''}
              <span class="hc-status ${esc(status)}">${esc(STATUS_MAP[status] || status)}</span>
              ${project.deadline ? `<span class="detail-deadline">截止 ${esc(project.deadline)}</span>` : ''}
            </div>
            <div class="detail-org">发起：${esc(resolveClubName(project.organizer_club))}</div>
            <div class="detail-summary">${esc(project.summary || '')}</div>
          </div>
        </div>
        <div class="detail-tabs" id="hubDetailTabs">
          ${tabButton('overview', '概览')}
          ${tabButton('items', '参与项')}
          ${tabButton('participants', '参与名单')}
          ${tabButton('results', '成果')}
        </div>
        <div id="hubTabPanel">${renderCurrentTab(project, admin)}</div>
      </div>`;
  }

  function renderCurrentTab(project, admin) {
    if (hubSelectedTab === 'items') return renderItemsTab(project, admin);
    if (hubSelectedTab === 'participants') return renderParticipantsTab(project, admin);
    if (hubSelectedTab === 'results') return renderResultsTab(project, admin);
    return renderOverviewTab(project, admin);
  }

  function renderOverviewTab(project, admin) {
    return `
      ${renderProjectPoster(project)}
      ${renderProjectOrgPanel(project)}
      <div class="detail-info-grid">
        <div class="detail-info-item"><div class="label">企划类型</div><div class="value">${esc(TYPE_MAP[project.project_type] || project.project_type)}</div></div>
        <div class="detail-info-item"><div class="label">截止日期</div><div class="value">${esc(project.deadline || '无截止日期')}</div></div>
        <div class="detail-info-item"><div class="label">活动日期</div><div class="value">${esc(project.event_date || '未设置')}${project.event_date_end ? ' - ' + esc(project.event_date_end) : ''}</div></div>
        <div class="detail-info-item"><div class="label">日历同步</div><div class="value">${project.calendar_event_id ? '事件 #' + esc(project.calendar_event_id) : (project.project_type === 'activity' ? '待同步' : '非活动企划')}</div></div>
      </div>
      <div class="detail-desc">${esc(project.description || '暂无详细描述')}</div>
      ${admin ? `<div class="detail-admin-section">
        <button class="admin-btn" type="button" data-hub-action="edit-project">编辑企划</button>
        <button class="admin-btn" type="button" data-hub-action="add-item">新增参与项</button>
        <button class="admin-btn danger" type="button" data-hub-action="delete-project">删除企划</button>
      </div>` : ''}`;
  }

  function renderItemsTab(project, admin) {
    const items = hubItems.filter((item) => parseInt(item.project_id) === parseInt(project.id) && !item.deleted_at);
    if (!items.length) {
      return `<div class="hub-empty-panel">暂无参与项</div>${admin ? '<div class="detail-admin-section"><button class="admin-btn" type="button" data-hub-action="add-item">新增参与项</button></div>' : ''}`;
    }
    return `
      <div class="items-section">
        ${items.map((item) => {
          const type = itemTypeClass(item);
          const closed = item.status === 'closed';
          return `<div class="item-card">
            <div class="item-icon ${esc(type)}">${esc(itemIcon(type))}</div>
            <div class="item-body">
              <div class="item-label">${esc(item.label || ITEM_LABEL[type])}</div>
              <div class="item-desc">${esc(item.description || '')}</div>
            </div>
            <div class="item-meta">
              ${item.deadline ? `<span class="item-deadline">${esc(item.deadline)}</span>` : ''}
              <button class="item-action${closed ? ' secondary' : ''}" type="button" data-hub-action="${closed ? '' : 'participate'}" data-item-id="${esc(item.id)}" ${closed ? 'disabled' : ''}>${closed ? '已截止' : esc(ITEM_MAP[type] || '参与')}</button>
              ${admin ? `<button class="item-action secondary" type="button" data-hub-action="edit-item" data-item-id="${esc(item.id)}">编辑</button>` : ''}
            </div>
          </div>`;
        }).join('')}
      </div>
      ${admin ? '<div class="detail-admin-section"><button class="admin-btn" type="button" data-hub-action="add-item">新增参与项</button></div>' : ''}`;
  }

  function renderParticipantsTab(project, admin) {
    const rows = hubParticipants.filter((row) => parseInt(row.project_id) === parseInt(project.id));
    if (!rows.length) return '<div class="hub-empty-panel">暂无参与记录</div>';
    return rows.map((row) => {
      const status = row.status || 'submitted';
      return `<div class="participant-item">
        <div class="participant-avatar">${esc((row.display_name || '?')[0])}</div>
        <div class="participant-info">
          <div class="participant-name">${esc(row.display_name || '匿名用户')}</div>
          <div class="participant-role">${esc(row.contact || '未填写联系方式')}</div>
          <div class="participant-content">${esc(row.content || '')}</div>
        </div>
        <div class="participant-side">
          <span class="participant-status ${esc(status)}">${esc(PARTICIPATION_STATUS[status] || status)}</span>
          <span class="participant-time">${esc(row.created_at || '')}</span>
          ${admin ? `<div class="participant-actions">
            <button type="button" data-hub-action="review-participation" data-part-id="${esc(row.id)}" data-status="accepted">通过</button>
            <button type="button" data-hub-action="review-participation" data-part-id="${esc(row.id)}" data-status="rejected">拒绝</button>
          </div>` : ''}
        </div>
      </div>`;
    }).join('');
  }

  function renderResultsTab(project, admin) {
    const link = project.results_link ? `<a href="${esc(project.results_link)}" target="_blank" rel="noopener noreferrer">查看成果</a>` : '';
    return `<div class="results-box"><div>${esc(project.results_description || '企划进行中，暂无成果')}</div>${link}</div>${admin ? '<div class="detail-admin-section"><button class="admin-btn" type="button" data-hub-action="edit-project">编辑成果</button></div>' : ''}`;
  }

  async function openHubModal() {
    const modal = document.getElementById('hubModal');
    if (!modal) return;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    loading = !hubProjects.length;
    renderHubShell();
    try {
      await loadHubProjects();
      loading = false;
      const isMobile = window.innerWidth <= 768;
      if (isMobile) {
        hubSelectedId = null;
        renderHubShell();
        const body = document.querySelector('.hub-body');
        if (body) body.classList.remove('hub-show-detail');
      } else {
        if (!hubSelectedId || !hubProjects.some((p) => parseInt(p.id) === parseInt(hubSelectedId))) {
          const first = filteredProjects()[0] || hubProjects[0];
          hubSelectedId = first ? parseInt(first.id) : null;
        }
        renderHubShell();
        if (hubSelectedId) await selectHubProject(hubSelectedId);
      }
    } catch (error) {
      loading = false;
      const list = document.getElementById('hubProjectList');
      if (list) list.innerHTML = '<div class="hub-detail-error">' + esc(error.message) + '</div>';
    }
  }

  function closeHubModal() {
    const modal = document.getElementById('hubModal');
    if (!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
  }

  function openHubFormModal(title, bodyHtml, onSubmit) {
    const modal = document.getElementById('hubFormModal');
    if (!modal) return;
    modal.innerHTML = `<div class="calendar-modal-card hub-form-card" role="dialog" aria-modal="true">
      <button class="calendar-modal-close" type="button" data-hub-form-close>×</button>
      <div class="calendar-modal-scroll"><h3 class="calendar-title">${esc(title)}</h3><form id="hubFormBody" class="hub-form-body">${bodyHtml}</form></div>
    </div>`;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    modal.querySelectorAll('[data-hub-form-close]').forEach((btn) => btn.addEventListener('click', closeHubFormModal));
    bindHubPosterUpload(modal);
    modal.querySelector('#hubFormBody')?.addEventListener('submit', async function (event) {
      event.preventDefault();
      const submit = this.querySelector('[type="submit"]');
      if (submit) submit.disabled = true;
      try {
        await onSubmit(new FormData(this));
        closeHubFormModal();
        await openHubModal();
      } catch (error) {
        alert(error.message);
      } finally {
        if (submit) submit.disabled = false;
      }
    });
  }

  function closeHubFormModal() {
    const modal = document.getElementById('hubFormModal');
    if (!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = '';
  }

  function bindHubPosterUpload(modal) {
    const pickBtn = modal.querySelector('[data-hub-poster-pick]');
    const fileInput = modal.querySelector('[data-hub-poster-file]');
    const removeBtn = modal.querySelector('[data-hub-poster-remove]');
    const urlInput = modal.querySelector('[name="cover_image"]');
    const preview = modal.querySelector('[data-hub-poster-preview]');
    const status = modal.querySelector('[data-hub-poster-status]');
    const uploadBox = modal.querySelector('[data-hub-poster-box]');
    if (!fileInput || !urlInput || !preview) return;

    function setPoster(url) {
      urlInput.value = url || '';
      preview.innerHTML = url
        ? `<img src="${esc(mediaUrl(url))}" alt="企划宣传图预览">`
        : '<span>暂无宣传图</span>';
      if (removeBtn) removeBtn.hidden = !url;
    }

    pickBtn?.addEventListener('click', () => fileInput.click());
    removeBtn?.addEventListener('click', () => {
      setPoster('');
      if (status) status.textContent = '已移除宣传图，保存后生效';
    });
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      if (!allowed.includes(file.type)) {
        if (status) status.textContent = '仅支持 JPEG / PNG / GIF / WebP';
        fileInput.value = '';
        return;
      }
      if (file.size > 2 * 1024 * 1024) {
        if (status) status.textContent = '图片不能超过 2MB';
        fileInput.value = '';
        return;
      }
      const fd = new FormData();
      const organizer = findClubByKey(modal.querySelector('[name="organizer_key"]')?.value || '');
      const uploadId = uploadBox?.dataset.uploadId || ('project_' + (uploadBox?.dataset.projectId || 'draft_' + Date.now()));
      fd.append('id', uploadId);
      fd.append('country', organizer?.country || 'china');
      fd.append('image', file);
      if (status) status.textContent = '上传中...';
      try {
        const resp = await fetch('./api/club_avatar.php?scope=event', { method: 'POST', credentials: 'same-origin', body: fd });
        const data = await resp.json();
        if (!data.success || !data.image_url) throw new Error(data.message || '上传失败');
        if (uploadBox) uploadBox.dataset.uploadId = uploadId;
        setPoster(data.image_url);
        if (status) status.textContent = '宣传图已上传，保存后同步';
      } catch (error) {
        if (status) status.textContent = error.message || '上传失败';
      } finally {
        fileInput.value = '';
      }
    });
  }

  function projectFormFields(project) {
    project = project || {};
    const clubs = manageableClubs();
    const selectedKey = clubKey(project.organizer_club || clubs[0] || {});
    const optionHtml = clubs.length
      ? clubs.map((club) => `<option value="${esc(clubKey(club))}" ${clubKey(club) === selectedKey ? 'selected' : ''}>${esc(clubOptionLabel(club))}</option>`).join('')
      : '<option value="">请先绑定可管理的同好会</option>';
    return `
      <label>绑定同好会<select class="md3-select" name="organizer_key" required>${optionHtml}</select></label>
      <div class="hub-type-picker">${Object.keys(TYPE_MAP).map((type) => `<label class="hub-type-choice ${esc(type)}"><input type="radio" name="project_type" value="${esc(type)}" ${(project.project_type || 'publication') === type ? 'checked' : ''}><span>${esc(TYPE_MAP[type])}</span></label>`).join('')}</div>
      <label>企划名称<input class="md3-input" name="title" value="${esc(project.title || '')}" required maxlength="120"></label>
      <label>联合参加同好会
        <div id="pjClubSelectors" class="pj-club-selectors"></div>
        <button type="button" class="pj-club-add-btn" id="pjClubAddBtn">+ 添加同好会</button>
        <span class="form-hint">发起组织已固定；联合企划可添加多个参加同好会。</span>
      </label>
      <label>宣传图
        <div class="hub-poster-upload" data-hub-poster-box data-project-id="${esc(project.id || '')}">
          <input type="hidden" name="cover_image" value="${esc(project.cover_image || '')}">
          <input type="file" data-hub-poster-file accept="image/jpeg,image/png,image/gif,image/webp" hidden>
          <div class="hub-poster-preview" data-hub-poster-preview>${project.cover_image ? `<img src="${esc(mediaUrl(project.cover_image))}" alt="企划宣传图预览">` : '<span>暂无宣传图</span>'}</div>
          <div class="hub-poster-controls">
            <button class="md3-btn secondary" type="button" data-hub-poster-pick>上传/更换宣传图</button>
            <button class="md3-btn secondary" type="button" data-hub-poster-remove ${project.cover_image ? '' : 'hidden'}>移除</button>
          </div>
          <span class="form-hint" data-hub-poster-status>支持 JPEG / PNG / GIF / WebP，最大 2MB。保存后同步到企划和活动日历。</span>
        </div>
      </label>
      <label>企划简介<textarea class="md3-input" name="summary" rows="2" maxlength="160">${esc(project.summary || '')}</textarea></label>
      <label>截止日期<input class="md3-input" name="deadline" type="date" value="${esc(project.deadline || '')}"></label>
      <div class="hub-form-split">
        <label>活动开始日期<input class="md3-input" name="event_date" type="date" value="${esc(project.event_date || project.deadline || '')}"></label>
        <label>活动结束日期<input class="md3-input" name="event_date_end" type="date" value="${esc(project.event_date_end || '')}"></label>
      </div>
      <label>详细描述<textarea class="md3-input" name="description" rows="5">${esc(project.description || '')}</textarea></label>
      <label>成果描述<textarea class="md3-input" name="results_description" rows="3">${esc(project.results_description || '')}</textarea></label>
      <label>成果链接<input class="md3-input" name="results_link" type="url" value="${esc(project.results_link || '')}"></label>
      <div class="hub-form-actions"><button class="md3-btn" type="submit">保存</button><button class="md3-btn secondary" type="button" data-hub-form-close>取消</button></div>`;
  }

  async function openHubCreateForm(project) {
    await loadHubClubs();
    const isEdit = Boolean(project);
    openHubFormModal(isEdit ? '编辑企划' : '发起新企划', projectFormFields(project), async (fd) => {
      const participantKeys = getPjClubKeys();
      const payload = Object.fromEntries(fd.entries());
      delete payload.participant_keys;
      const selectedClub = findClubByKey(payload.organizer_key);
      delete payload.organizer_key;
      if (!selectedClub) throw new Error('请选择绑定同好会');
      payload.organizer_club = {
        id: Number(selectedClub.id),
        country: selectedClub.country || 'china',
        name: selectedClub.name || selectedClub.display_name || selectedClub.school || ''
      };
      payload.club_name = payload.organizer_club.name;
      const organizerKey = clubKey(payload.organizer_club);
      const participantMap = {};
      participantKeys
        .map(findClubByKey)
        .filter(Boolean)
        .filter((club) => clubKey(club) !== organizerKey)
        .forEach((club) => {
          participantMap[clubKey(club)] = {
            id: Number(club.id),
            country: club.country || 'china',
            name: club.name || club.display_name || club.school || ''
          };
        });
      payload.participant_clubs = Object.values(participantMap);
      payload.is_joint = payload.participant_clubs.length > 0;
      payload.status = project?.status || 'collecting';
      const data = await request(API.projects, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isEdit ? Object.assign({ id: project.id }, payload) : payload)
      });
      hubProjectsLoadedAt = 0;
      if (!isEdit && data.project?.id) {
        await request(API.items, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: data.project.id,
            type: payload.project_type === 'activity' ? 'registration' : 'submission',
            label: payload.project_type === 'activity' ? '活动报名' : '稿件投稿',
            description: '默认参与项，可由管理员编辑。',
            deadline: payload.project_type === 'activity' ? (payload.event_date || payload.deadline || '') : (payload.deadline || '')
          })
        }).catch(() => {});
      }
    });
    initPjClubSelectors(document.getElementById('hubFormModal'), project || {});
  }

  function openHubItemForm(item) {
    const projectId = hubSelectedId;
    item = item || {};
    openHubFormModal(item.id ? '编辑参与项' : '新增参与项', `
      <label>类型<select class="md3-select" name="type">${Object.keys(ITEM_LABEL).map((type) => `<option value="${esc(type)}" ${(item.type || 'submission') === type ? 'selected' : ''}>${esc(ITEM_LABEL[type])}</option>`).join('')}</select></label>
      <label>名称<input class="md3-input" name="label" value="${esc(item.label || '')}" required maxlength="80"></label>
      <label>描述<textarea class="md3-input" name="description" rows="3">${esc(item.description || '')}</textarea></label>
      <label>截止日期<input class="md3-input" name="deadline" type="date" value="${esc(item.deadline || '')}"></label>
      <label>状态<select class="md3-select" name="status"><option value="open" ${item.status !== 'closed' ? 'selected' : ''}>开放</option><option value="closed" ${item.status === 'closed' ? 'selected' : ''}>关闭</option></select></label>
      <div class="hub-form-actions"><button class="md3-btn" type="submit">保存</button><button class="md3-btn secondary" type="button" data-hub-form-close>取消</button></div>`, async (fd) => {
      const payload = Object.fromEntries(fd.entries());
      payload.project_id = projectId;
      if (item.id) payload.id = item.id;
      await request(API.items, { method: item.id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    });
  }

  function openHubParticipationForm(itemId) {
    const project = hubProjects.find((p) => parseInt(p.id) === parseInt(hubSelectedId));
    const item = hubItems.find((it) => it.id === itemId);
    const formatType = item ? itemTypeClass(item) : null;
    const isSubmission = formatType === 'submission';
    const fileHtml = isSubmission ? `
      <label>投稿文件（可选，支持 PDF / 图片 / Word / TXT，最大 50MB）
        <input type="file" id="participationFile" accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.doc,.docx,.txt">
        <div id="participationFileStatus" style="font-size:12px;color:var(--md-on-surface-variant);margin-top:4px;"></div>
      </label>` : '';
    const contentLabel = isSubmission ? '投稿说明' : '参与内容';
    const contentPlaceholder = isSubmission ? '请填写投稿说明' : '请填写投稿说明、报名信息或协力内容';
    openHubFormModal('参与：' + (item?.label || '参与项'), `
      <label>显示名称<input class="md3-input" name="display_name" value="${esc(window.currentUser?.user?.nickname || window.currentUser?.user?.username || '')}" maxlength="80"></label>
      <label>联系方式<input class="md3-input" name="contact" placeholder="QQ / 邮箱 / Discord" maxlength="200"></label>
      ${fileHtml}
      <label>${contentLabel}<textarea class="md3-input" name="content" rows="6" required placeholder="${contentPlaceholder}"></textarea></label>
      <div class="hub-form-actions"><button class="md3-btn" type="submit">提交</button><button class="md3-btn secondary" type="button" data-hub-form-close>取消</button></div>`, async (fd) => {
      if (!project) throw new Error('企划不存在');
      let attachments = [];
      if (isSubmission) {
        const fileInput = document.getElementById('participationFile');
        if (fileInput && fileInput.files && fileInput.files[0]) {
          const fileFd = new FormData();
          fileFd.append('file', fileInput.files[0]);
          fileFd.append('project_id', String(project.id));
          const statusEl = document.getElementById('participationFileStatus');
          if (statusEl) statusEl.textContent = '上传中...';
          const uploadResult = await request(API.files, { method: 'POST', body: fileFd });
          if (uploadResult && uploadResult.file) {
            attachments.push(uploadResult.file);
            if (statusEl) statusEl.textContent = '文件已上传';
          }
        }
      }
      const payload = Object.fromEntries(fd.entries());
      delete payload.participationFile;
      payload.project_id = project.id;
      payload.item_id = itemId;
      if (attachments.length) payload.attachments = attachments;
      await request(API.participations, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    });
  }

  async function deleteCurrentProject() {
    const project = hubProjects.find((p) => parseInt(p.id) === parseInt(hubSelectedId));
    if (!project || !confirm('确定删除「' + (project.title || '未命名企划') + '」吗？')) return;
    await request(API.projects, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: project.id }) });
    hubProjectsLoadedAt = 0;
    hubSelectedId = null;
    await openHubModal();
  }

  async function reviewParticipation(id, status) {
    await request(API.participations, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: id, status: status }) });
    await selectHubProject(hubSelectedId);
  }

  function bindHubEvents() {
    document.getElementById('hubModalClose')?.addEventListener('click', closeHubModal);
    document.getElementById('hubModal')?.addEventListener('click', (event) => { if (event.target === event.currentTarget) closeHubModal(); });
    document.getElementById('hubCreateBtn')?.addEventListener('click', () => openHubCreateForm());
    document.getElementById('hubTypeFilterBar')?.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-type]');
      if (!btn) return;
      hubFilterType = btn.dataset.type;
      hubSelectedId = null;
      renderHubShell();
    });
    document.getElementById('hubStatusFilterBar')?.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-status]');
      if (!btn) return;
      hubFilterStatus = btn.dataset.status;
      hubSelectedId = null;
      renderHubShell();
    });
    document.getElementById('hubProjectList')?.addEventListener('click', (event) => {
      const card = event.target.closest('[data-id]');
      if (card) selectHubProject(card.dataset.id);
    });
    document.getElementById('hubDetailContent')?.addEventListener('click', async (event) => {
      const tab = event.target.closest('[data-tab]');
      if (tab) {
        hubSelectedTab = tab.dataset.tab;
        renderHubDetail();
        return;
      }
      const actionEl = event.target.closest('[data-hub-action]');
      if (!actionEl) return;
      const action = actionEl.dataset.hubAction;
      const project = hubProjects.find((p) => parseInt(p.id) === parseInt(hubSelectedId));
      try {
        if (action === 'participate') openHubParticipationForm(actionEl.dataset.itemId);
        if (action === 'edit-project') openHubCreateForm(project);
        if (action === 'delete-project') await deleteCurrentProject();
        if (action === 'add-item') openHubItemForm();
        if (action === 'edit-item') openHubItemForm(hubItems.find((item) => item.id === actionEl.dataset.itemId));
        if (action === 'back-list') goBackHubList();
        if (action === 'review-participation') await reviewParticipation(parseInt(actionEl.dataset.partId), actionEl.dataset.status);
      } catch (error) {
        alert(error.message);
      }
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        closeHubFormModal();
        closeHubModal();
      }
    });
  }

  window.openHubModal = openHubModal;
  window.closeHubModal = closeHubModal;
  window.openHubCreateForm = openHubCreateForm;
  document.addEventListener('DOMContentLoaded', function () {
    bindHubEvents();
    const prefetch = () => loadHubProjects().catch(() => {});
    if ('requestIdleCallback' in window) window.requestIdleCallback(prefetch, { timeout: 2500 });
    else window.setTimeout(prefetch, 1200);
  });
})();
