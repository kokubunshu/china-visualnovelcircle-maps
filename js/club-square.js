(function () {
  'use strict';

  var state = { projects: [], selected: null, stages: [], entries: [], results: [], matches: [], sourceResults: [], selectedSource: null };
  var $ = function (id) { return document.getElementById(id); };
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function toast(message) {
    var el = $('toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    setTimeout(function () { el.classList.remove('show'); }, 1800);
  }
  function api(url, options) {
    return fetch(url, Object.assign({ credentials: 'same-origin' }, options || {})).then(function (r) { return r.json(); });
  }
  function post(url, body) {
    return api(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  }
  function typeLabel(type) { return type === 'moe' ? '萌战' : '十二器'; }
  function sourceLabel(type) {
    return ({ bangumi_subject: 'Bangumi 作品', bangumi_character: 'Bangumi 角色', vndb_vn: 'VNDB', manual: '手动' })[type] || type || '来源';
  }
  function statusLabel(status) {
    return ({ draft: '草稿', published: '已发布', running: '进行中', ended: '已结束', archived: '已归档', suspended: '已暂停' })[status] || status || '未知';
  }
  function token(type) { return '<span class="token ' + (type === 'moe' ? 'moe' : '') + '">' + (type === 'moe' ? '萌' : '12') + '</span>'; }

  function filteredProjects() {
    var type = $('typeFilter').value;
    var keyword = $('keywordFilter').value.trim().toLowerCase();
    return state.projects.filter(function (item) {
      if (type && item.project_type !== type) return false;
      if (keyword && String(item.title || '').toLowerCase().indexOf(keyword) === -1) return false;
      return true;
    });
  }

  function renderList() {
    var list = $('projectList');
    var rows = filteredProjects();
    if (!rows.length) {
      list.innerHTML = '<div class="empty">暂无公开企划。</div>';
      return;
    }
    list.innerHTML = rows.map(function (item) {
      return '<button class="project-card ' + (state.selected && Number(state.selected.id) === Number(item.id) ? 'active' : '') + '" data-project-id="' + Number(item.id) + '">' +
        token(item.project_type) +
        '<span class="project-title"><strong>' + esc(item.title) + '</strong><span class="muted">' + esc(item.year_label || '') + ' · 同好会 #' + Number(item.club_id) + '</span></span>' +
        '<span class="pills"><span class="pill">' + typeLabel(item.project_type) + '</span><span class="pill">' + statusLabel(item.status) + '</span></span>' +
      '</button>';
    }).join('');
  }

  function openStage() {
    return state.stages.find(function (s) { return s.status === 'open' && s.vote_mode !== 'nomination'; });
  }
  function openNominationStage() {
    return state.stages.find(function (s) { return s.status === 'open' && s.stage_type === 'nomination'; });
  }

  function renderStageRows() {
    if (!state.stages.length) return '<div class="empty">暂无阶段。</div>';
    return state.stages.map(function (s) {
      return '<div class="stage-row"><span><strong>' + esc(s.title) + '</strong><br><span class="muted">' + esc(s.stage_type) + ' · ' + esc(s.vote_mode) + '</span></span><span class="pill">' + esc(s.status) + '</span></div>';
    }).join('');
  }

  function renderEntries() {
    if (!state.entries.length) return '<div class="empty">暂无提名。</div>';
    return state.entries.slice(0, 10).map(function (e) {
      return '<div class="entry-card"><img src="' + esc(e.image_url || '') + '" alt=""><span><strong>' + esc(e.title_cn || e.title) + '</strong><br><span class="muted">' + esc(e.subtitle || sourceLabel(e.source_type)) + '</span></span><span class="pill">' + esc(e.entry_status) + '</span></div>';
    }).join('');
  }

  function renderVoteBox(stage) {
    if (!stage) return '<div class="empty">当前没有开放的投票阶段。</div>';
    if (stage.vote_mode === 'match_single') {
      var matches = state.matches.filter(function (m) { return Number(m.stage_id) === Number(stage.id) && m.status !== 'settled' && m.slot_a_entry_id && m.slot_b_entry_id; });
      if (!matches.length) return '<div class="empty">当前没有可投票的 1v1 对阵。</div>';
      return matches.map(function (m) {
        return '<div class="match-row"><strong>R' + Number(m.round_no) + '-' + Number(m.match_no) + '</strong><div class="actions">' +
          '<button class="btn" data-cast-match="' + Number(m.id) + '" data-entry-id="' + Number(m.slot_a_entry_id) + '">' + esc(m.slot_a_title_cn || m.slot_a_title || 'A') + '</button>' +
          '<button class="btn" data-cast-match="' + Number(m.id) + '" data-entry-id="' + Number(m.slot_b_entry_id) + '">' + esc(m.slot_b_title_cn || m.slot_b_title || 'B') + '</button>' +
        '</div></div>';
      }).join('');
    }
    var rows = state.results.length ? state.results : state.entries.filter(function (e) { return e.entry_status === 'approved'; });
    if (!rows.length) return '<div class="empty">当前阶段候选池为空。</div>';
    return '<div class="vote-list">' + rows.map(function (r) {
      var id = Number(r.entry_id || r.id);
      var score = stage.vote_mode === 'score'
        ? '<input class="input score-input" data-score-entry="' + id + '" type="number" min="' + Number(stage.score_min || 1) + '" max="' + Number(stage.score_max || 10) + '" value="' + Number(stage.score_min || 1) + '">'
        : '';
      return '<label class="entry-card vote-choice"><img src="' + esc(r.image_url || '') + '" alt=""><span><strong>' + esc(r.title_cn || r.title) + '</strong><br><span class="muted">' + Number(r.votes || 0) + ' 票</span></span><input type="checkbox" data-vote-entry="' + id + '">' + score + '</label>';
    }).join('') + '</div><button class="btn success" id="submitVoteBtn">提交投票</button>';
  }

  function renderDetail() {
    var host = $('projectDetail');
    var item = state.selected;
    if (!item) {
      host.className = 'empty';
      host.innerHTML = '选择一个企划查看阶段、提名和结果。';
      return;
    }
    var votingStage = openStage();
    host.className = '';
    host.innerHTML =
      '<div class="detail-head"><div><h2>' + esc(item.title) + '</h2><div class="muted">' + typeLabel(item.project_type) + ' · ' + statusLabel(item.status) + ' · 同好会 #' + Number(item.club_id) + '</div></div>' +
      '<span class="pills"><span class="pill">' + esc(item.eligibility_mode || 'club_member') + '</span><span class="pill">' + esc(item.visibility || 'public') + '</span></span></div>' +
      '<p class="muted">' + esc(item.description || '暂无说明。') + '</p>' +
      '<h2>阶段</h2><div class="stage-list">' + renderStageRows() + '</div>' +
      '<h2 style="margin-top:16px;">提名池</h2><div class="entry-list">' + renderEntries() + '</div>' +
      '<div style="margin-top:14px;" class="actions"><button class="btn primary" id="nominateBtn">提交提名</button><button class="btn" id="refreshResultsBtn">刷新结果</button></div>' +
      '<div id="nominateBox" style="display:none;margin-top:12px;">' +
        '<div class="form-grid"><label class="field full">搜索 Bangumi / VNDB / 手动提名<input id="sourceKeyword" class="input" placeholder="' + (item.project_type === 'moe' ? '角色名' : '作品名') + '"></label><button class="btn" id="sourceSearchBtn">搜索</button></div>' +
        '<div id="sourceResults" class="source-results"></div>' +
        '<div class="form-grid" style="margin-top:10px;"><label class="field full">补充说明<input id="nomSubtitle" class="input" placeholder="所属作品 / 社团 / 备注"></label><button class="btn success" id="submitNomBtn">提交</button></div>' +
      '</div>' +
      '<h2 style="margin-top:16px;">当前投票</h2><div id="voteBox">' + renderVoteBox(votingStage) + '</div>';
    $('nominateBtn').onclick = function () {
      if (!openNominationStage()) {
        toast('当前没有开放的提名阶段');
        return;
      }
      $('nominateBox').style.display = $('nominateBox').style.display === 'none' ? 'block' : 'none';
    };
    $('sourceSearchBtn').onclick = searchSources;
    $('submitNomBtn').onclick = submitNomination;
    $('refreshResultsBtn').onclick = loadResults;
    var voteBtn = $('submitVoteBtn');
    if (voteBtn) voteBtn.onclick = submitVote;
    host.querySelectorAll('[data-cast-match]').forEach(function (btn) {
      btn.onclick = function () { castMatchVote(btn.dataset.castMatch, btn.dataset.entryId); };
    });
  }

  function renderSourceResults() {
    var host = $('sourceResults');
    if (!host) return;
    if (!state.sourceResults.length) {
      host.innerHTML = '<div class="empty">输入关键词后搜索。</div>';
      return;
    }
    host.innerHTML = state.sourceResults.map(function (item, index) {
      var active = state.selectedSource === item ? ' active' : '';
      return '<button class="source-option' + active + '" data-source-index="' + index + '"><img src="' + esc(item.image_url || '') + '" alt=""><span><strong>' + esc(item.title_cn || item.title) + '</strong><span class="muted">' + sourceLabel(item.source_type) + ' · ' + esc(item.subtitle || '') + '</span></span></button>';
    }).join('');
    host.querySelectorAll('[data-source-index]').forEach(function (btn) {
      btn.onclick = function () {
        state.selectedSource = state.sourceResults[Number(btn.dataset.sourceIndex)];
        renderSourceResults();
      };
    });
  }

  async function loadProjects() {
    var params = new URLSearchParams();
    params.set('action', 'list');
    params.set('country', $('countryFilter').value || 'all');
    if ($('statusFilter').value) params.set('status', $('statusFilter').value);
    var data = await api('./api/vote_projects.php?' + params.toString());
    state.projects = data.success ? (data.data || []) : [];
    renderList();
    if (!state.selected && state.projects.length) selectProject(state.projects[0].id);
  }

  async function selectProject(id) {
    var data = await api('./api/vote_projects.php?action=get&id=' + encodeURIComponent(id));
    if (!data.success) {
      toast(data.message || '加载失败');
      return;
    }
    state.selected = data.data;
    state.stages = data.stages || [];
    state.sourceResults = [];
    state.selectedSource = null;
    var entries = await api('./api/vote_nominations.php?action=list&project_id=' + encodeURIComponent(id));
    state.entries = entries.success ? (entries.data || []) : [];
    var votingStage = openStage();
    state.results = [];
    if (votingStage) {
      var results = await api('./api/vote_votes.php?action=results&stage_id=' + encodeURIComponent(votingStage.id));
      state.results = results.success ? (results.data || []) : [];
    }
    var matches = await api('./api/vote_matches.php?action=list&project_id=' + encodeURIComponent(id));
    state.matches = matches.success ? (matches.data || []) : [];
    renderList();
    renderDetail();
  }

  async function searchSources() {
    if (!state.selected) return;
    var keyword = $('sourceKeyword').value.trim();
    if (!keyword) {
      toast('请输入搜索关键词');
      return;
    }
    var params = new URLSearchParams({ action: 'search', project_type: state.selected.project_type, keyword: keyword, limit: '10' });
    var data = await api('./api/vote_sources.php?' + params.toString());
    state.sourceResults = data.success ? (data.data || []) : [];
    state.selectedSource = state.sourceResults[0] || null;
    renderSourceResults();
  }

  async function submitNomination() {
    if (!state.selected) return;
    if (!state.selectedSource) {
      var keyword = $('sourceKeyword').value.trim();
      if (!keyword) {
        toast('请先搜索并选择提名条目');
        return;
      }
      state.selectedSource = { source_type: 'manual', source_id: '', title: keyword, title_cn: keyword };
    }
    var body = Object.assign({}, state.selectedSource, {
      project_id: state.selected.id,
      subtitle: $('nomSubtitle').value.trim() || state.selectedSource.subtitle || ''
    });
    var data = await post('./api/vote_nominations.php?action=submit', body);
    toast(data.success ? '已提交提名，等待审核' : (data.message || '提交失败'));
    if (data.success) selectProject(state.selected.id);
  }

  async function submitVote() {
    var stage = openStage();
    if (!stage) return;
    var checked = Array.from(document.querySelectorAll('[data-vote-entry]:checked'));
    var entryIds = checked.map(function (el) { return Number(el.dataset.voteEntry); });
    var body = { stage_id: Number(stage.id), entry_ids: entryIds };
    if (stage.vote_mode === 'score') {
      body.scores = {};
      entryIds.forEach(function (id) {
        var scoreEl = document.querySelector('[data-score-entry="' + id + '"]');
        body.scores[id] = Number(scoreEl ? scoreEl.value : stage.score_min || 1);
      });
    }
    var data = await post('./api/vote_votes.php?action=cast', body);
    toast(data.success ? '投票已提交' : (data.message || '投票失败'));
    if (data.success) selectProject(state.selected.id);
  }

  async function castMatchVote(matchId, entryId) {
    var stage = openStage();
    if (!stage) return;
    var data = await post('./api/vote_votes.php?action=cast', { stage_id: Number(stage.id), match_id: Number(matchId), entry_id: Number(entryId) });
    toast(data.success ? '投票已提交' : (data.message || '投票失败'));
    if (data.success) selectProject(state.selected.id);
  }

  async function loadResults() {
    if (!state.selected) return;
    var stage = openStage() || state.stages[state.stages.length - 1];
    if (!stage) return;
    var data = await api('./api/vote_votes.php?action=results&stage_id=' + encodeURIComponent(stage.id));
    state.results = data.success ? (data.data || []) : [];
    toast(data.success ? '结果已刷新' : (data.message || '结果加载失败'));
    renderDetail();
  }

  document.addEventListener('click', function (event) {
    var card = event.target.closest('[data-project-id]');
    if (card) selectProject(card.datasetProjectId || card.dataset.projectId);
  });
  ['typeFilter', 'countryFilter', 'statusFilter'].forEach(function (id) {
    $(id).addEventListener('change', id === 'typeFilter' ? renderList : loadProjects);
  });
  $('keywordFilter').addEventListener('input', renderList);
  loadProjects().catch(function () {
    $('projectList').innerHTML = '<div class="empty">企划加载失败。</div>';
  });
})();
