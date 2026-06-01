(function () {
  'use strict';
  var $ = $vote, esc = escVote, api = apiVote, post = postVote;
  var toast = function (m) { toastVote($('toast'), m); };
  var typeLabel = typeLabelVote, statusLabel = statusLabelVote, parseConfig = parseConfigVote;

  /* ===== State ===== */
  var state = {
    projects: [],
    selected: null,
    stages: [],
    entries: [],
    matches: [],
    flow: null,
    clubData: null,
    selectedClub: null,
    createType: 'twelve',
    editingStageId: null,
    poolFilter: 'all',
    poolPage: 1,
    poolStageTab: 'all',
    poolGroupTab: 'all',
    nominationQuery: '',
    stageEntriesCache: {},
    rebuildFlowInFlight: false,
    lastSettleIssues: [],
    timedSettleTimer: null,
    timedSettleInFlight: false,
    moeAwardSyncKey: ''
  };
  var POOL_PAGE_SIZE = 16;

  /* ===== Theme Toggle ===== */
  (function () {
    var html = document.documentElement;
    var saved = localStorage.getItem('themePreference') || 'light';
    html.setAttribute('data-theme', saved);
    $('themeToggle').addEventListener('click', function () {
      var next = html.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      html.setAttribute('data-theme', next);
      localStorage.setItem('themePreference', next);
    });
  })();

  /* ===== Club Data ===== */
  function loadClubData() {
    if (state.clubData) return Promise.resolve(state.clubData);
    return Promise.all([
      fetch('../api/clubs.php', { credentials: 'same-origin' }).then(function (r) { return r.json(); }),
      fetch('../api/clubs_japan.php', { credentials: 'same-origin' }).then(function (r) { return r.json(); })
    ]).then(function (results) {
      state.clubData = { china: (results[0] || {}).data || [], japan: (results[1] || {}).data || [] };
      return state.clubData;
    }).catch(function () {
      state.clubData = { china: [], japan: [] };
      return state.clubData;
    });
  }

  function allClubs() {
    if (!state.clubData) return [];
    return (state.clubData.china || []).concat(state.clubData.japan || []);
  }

  function clubDisplayName(clubId, country) {
    var rows = state.clubData ? (state.clubData[country || 'china'] || []) : [];
    var club = rows.find(function (item) { return Number(item.id) === Number(clubId); });
    return club ? (club.name || club.display_name || club.school || ('同好会 ' + clubId)) : ('同好会 ' + clubId);
  }

  /* ===== Project List ===== */
  function loadManageable() {
    return api('../api/vote_projects.php?action=my_manageable').then(function (data) {
      state.projects = data.success ? (data.data || []) : [];
      renderProjectList();
      if (!state.selected && state.projects.length) selectProject(state.projects[0].id);
      return state.projects;
    }).catch(function () {
      $('manageList').innerHTML = '<div class="empty-state"><div class="empty-state-inner"><p>请先登录负责人/管理员账号</p></div></div>';
    });
  }

  function selectProject(id) {
    return api('../api/vote_projects.php?action=get&id=' + encodeURIComponent(id)).then(function (data) {
      if (!data.success) { toast(data.message || '加载失败'); return; }
      state.selected = data.data;
      state.stages = data.stages || [];
      state.poolPage = 1;
      state.poolFilter = 'all';
      state.poolStageTab = 'all';
      state.poolGroupTab = 'all';
      state.nominationQuery = '';
      state.stageEntriesCache = {};
      state.lastSettleIssues = [];
      return Promise.all([
        api('../api/vote_nominations.php?action=list&project_id=' + encodeURIComponent(id)),
        api('../api/vote_matches.php?action=list&project_id=' + encodeURIComponent(id)),
        api('../api/vote_stages.php?action=flow_status&project_id=' + encodeURIComponent(id))
      ]).then(function (results) {
        state.entries = results[0].success ? (results[0].data || []) : [];
        state.matches = results[1].success ? (results[1].data || []) : [];
        state.flow = results[2].success ? results[2] : null;
        return loadMoeMatchesForStages().then(function () {
          renderProjectList();
          renderDetail();
          startTimedSettlePolling();
        });
      });
    });
  }

  function loadMoeMatchesForStages() {
    if (!state.selected || state.selected.project_type !== 'moe') return Promise.resolve();
    var matchStages = state.stages.filter(function (stage) {
      return stage.stage_type === 'bracket' || stage.stage_type === 'final';
    });
    if (!matchStages.length) return Promise.resolve();
    return Promise.all(matchStages.map(function (stage) {
      return api('../api/vote_matches.php?action=list&stage_id=' + encodeURIComponent(stage.id));
    })).then(function (results) {
      var rows = [];
      results.forEach(function (result) {
        if (result && result.success && Array.isArray(result.data)) rows = rows.concat(result.data);
      });
      state.matches = rows;
    }).catch(function () {});
  }

  function stopTimedSettlePolling() {
    if (state.timedSettleTimer) {
      clearInterval(state.timedSettleTimer);
      state.timedSettleTimer = null;
    }
  }

  function startTimedSettlePolling() {
    stopTimedSettlePolling();
    if (!state.selected || state.selected.project_type !== 'moe') return;
    checkTimedSettle();
    state.timedSettleTimer = setInterval(checkTimedSettle, 45000);
  }

  function parseStageEnd(stage) {
    if (!stage || !stage.ends_at) return null;
    var raw = String(stage.ends_at).replace(' ', 'T');
    var time = new Date(raw);
    return isNaN(time.getTime()) ? null : time;
  }

  function checkTimedSettle() {
    if (!state.selected || state.selected.project_type !== 'moe' || state.timedSettleInFlight) return;
    var now = Date.now();
    var due = state.stages.find(function (stage) {
      if (stage.stage_type !== 'bracket' && stage.stage_type !== 'final') return false;
      var end = parseStageEnd(stage);
      if (!end || end.getTime() > now) return false;
      var pool = getFlowPoolForStage(stage);
      if (pool && pool.status === 'settled') return false;
      return state.matches.some(function (m) {
        return Number(m.stage_id) === Number(stage.id) && m.status === 'open';
      });
    });
    if (!due) return;
    state.timedSettleInFlight = true;
    post('../api/vote_matches.php?action=settle_by_votes', { stage_id: Number(due.id) }).then(function (data) {
      var issues = data && data.success ? (data.unresolved || []) : [];
      if (data && data.success) {
        var msg = '定时结算完成 ' + Number(data.settled_count || 0) + ' 场';
        if (Number(data.unresolved_count || 0) > 0) msg += ' · 平票/缺槽 ' + Number(data.unresolved_count || 0) + ' 场';
        toast(msg);
        state.lastSettleIssues = issues;
      }
      if (state.selected) return selectProject(state.selected.id);
    }).finally(function () {
      state.timedSettleInFlight = false;
    });
  }

  function reloadProjectWithQualifierPool(projectId, qualifierId, qualifierEntries) {
    return Promise.all([
      api('../api/vote_projects.php?action=get&id=' + encodeURIComponent(projectId)),
      api('../api/vote_nominations.php?action=list&project_id=' + encodeURIComponent(projectId)),
      api('../api/vote_matches.php?action=list&project_id=' + encodeURIComponent(projectId)),
      api('../api/vote_stages.php?action=flow_status&project_id=' + encodeURIComponent(projectId))
    ]).then(function (results) {
      var projectData = results[0] || {};
      if (!projectData.success) { toast(projectData.message || '加载失败'); return; }
      state.selected = projectData.data;
      state.stages = projectData.stages || [];
      state.entries = results[1].success ? (results[1].data || []) : [];
      state.matches = results[2].success ? (results[2].data || []) : [];
      state.flow = results[3].success ? results[3] : null;
      state.poolPage = 1;
      state.poolFilter = 'all';
      state.poolStageTab = qualifierId ? String(qualifierId) : 'all';
      state.poolGroupTab = 'all';
      state.nominationQuery = '';
      state.stageEntriesCache = {};
      state.lastSettleIssues = [];
      if (qualifierId) {
        state.stageEntriesCache[String(qualifierId)] = qualifierEntries || [];
      }
      return loadMoeMatchesForStages().then(function () {
        renderProjectList();
        renderDetail();
        startTimedSettlePolling();
      });
    });
  }

  function renderProjectList() {
    var host = $('manageList');
    var count = $('projectCount');
    if (count) count.textContent = state.projects.length + ' 个';
    if (!state.projects.length) {
      host.innerHTML = '<div class="empty-state"><div class="empty-state-inner"><p>暂无可管理企划</p></div></div>';
      return;
    }
    host.innerHTML = state.projects.map(function (p) {
      var isMoe = p.project_type === 'moe';
      var active = state.selected && Number(state.selected.id) === Number(p.id);
      return '<div class="project-list-item' + (active ? ' active' : '') + '" data-project-id="' + Number(p.id) + '">' +
        '<span class="project-token ' + (isMoe ? 'moe' : 'twelve') + '">' + (isMoe ? '萌' : '12') + '</span>' +
        '<div class="project-info">' +
          '<div class="project-name">' + esc(p.title) + '</div>' +
          '<div class="project-meta">' + esc(clubDisplayName(p.club_id, p.country || 'china')) + ' · ' + statusLabel(p.status) + '</div>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  /* ===== Create Form ===== */
  $('createType').addEventListener('click', function (e) {
    var btn = e.target.closest('.segmented-btn');
    if (!btn) return;
    var type = btn.dataset.type;
    state.createType = type;
    this.querySelectorAll('.segmented-btn').forEach(function (b) {
      b.classList.remove('active');
      if (b.dataset.type === type) b.classList.add('active');
    });
    $('suffixField').style.display = type === 'twelve' ? 'block' : 'none';
    var submitBtn = $('createBtn');
    submitBtn.className = 'btn-submit ' + type;
    updateTitlePlaceholder();
  });

  $('suffixInput').addEventListener('input', function () {
    var val = this.value.replace(/[^一-龥]/g, '').slice(0, 1);
    this.value = val;
    var preview = $('suffixPreview');
    if (preview) preview.textContent = val || '器';
    updateTitlePlaceholder();
  });

  function updateTitlePlaceholder() {
    var title = $('createTitle');
    var isTwelve = state.createType === 'twelve';
    var suffix = ($('suffixInput').value || '器');
    if (isTwelve) {
      title.placeholder = '例如 2026 年度 Galgame 十二' + suffix + '评选';
    } else {
      title.placeholder = '例如 第二届年度萌王决定战';
    }
  }

  $('createToggle').addEventListener('click', function () {
    $('createCard').classList.toggle('open');
  });

  $('createBtn').addEventListener('click', function () {
    var title = $('createTitle').value.trim();
    if (!title) { toast('请填写标题'); return; }
    if (!state.selectedClub) { toast('请选择所属同好会'); return; }
    var body = {
      project_type: state.createType,
      club_id: Number(state.selectedClub.id),
      country: state.selectedClub.country || $('createCountry').value,
      title: title,
      year_label: $('createYear').value.trim() || String(new Date().getFullYear()),
      visibility: $('createVisibility').value,
      eligibility_mode: $('createEligibility').value,
      description: $('createDescription').value.trim()
    };
    post('../api/vote_projects.php?action=create', body).then(function (data) {
      toast(data.success ? '企划已创建' : (data.message || '创建失败'));
      if (data.success) {
        $('createCard').classList.remove('open');
        $('createTitle').value = '';
        $('createDescription').value = '';
        $('suffixInput').value = '';
        clearClubSelection();
        loadManageable().then(function () {
          if (data.id) selectProject(data.id);
        });
      }
    });
  });

  /* ===== Club Search ===== */
  var clubSearchTimer = null;

  (function initClubSearch() {
    var wrap = $('clubSearchInput');
    var realInput = document.createElement('input');
    realInput.type = 'text';
    realInput.id = 'clubSearchReal';
    realInput.style.cssText = 'border:none;outline:none;background:transparent;flex:1;font-size:12px;color:var(--am-text);min-width:0;';
    realInput.autocomplete = 'off';
    wrap.insertBefore(realInput, wrap.firstChild);

    realInput.addEventListener('input', function () {
      clearTimeout(clubSearchTimer);
      var q = this.value.trim();
      clubSearchTimer = setTimeout(function () { performClubSearch(q); }, 200);
    });

    realInput.addEventListener('focus', function () {
      if (!state.selectedClub) performClubSearch(this.value.trim());
    });

    document.addEventListener('click', function (e) {
      if (!wrap.contains(e.target)) {
        $('clubSearchResults').classList.remove('visible');
      }
    });
  })();

  function performClubSearch(query) {
    var results = $('clubSearchResults');
    var clubs = allClubs();
    if (!clubs.length) {
      results.innerHTML = '<div style="padding:10px;color:var(--am-text-secondary);font-size:12px;">俱乐部数据加载中...</div>';
      results.classList.add('visible');
      return;
    }
    var q = (query || '').toLowerCase();
    var filtered = clubs.filter(function (c) {
      if (!q) return true;
      return (c.name || '').toLowerCase().indexOf(q) !== -1 ||
             (c.school || '').toLowerCase().indexOf(q) !== -1;
    }).slice(0, 8);

    if (!filtered.length) {
      results.innerHTML = '<div style="padding:10px;color:var(--am-text-secondary);font-size:12px;">未找到匹配的同好会</div>';
      results.classList.add('visible');
      return;
    }

    results.innerHTML = filtered.map(function (c) {
      var country = c.country || 'china';
      return '<div class="search-result-item" data-club-id="' + c.id + '" data-club-country="' + country + '" data-club-name="' + esc(c.name || '') + '">' +
        '<div class="search-result-token" style="background:' + (country === 'japan' ? 'rgba(200,60,100,0.1)' : 'rgba(47,111,237,0.1)') + ';color:' + (country === 'japan' ? 'var(--am-moe-color)' : 'var(--am-twelve-color)') + ';">' + (country === 'japan' ? '日' : '中') + '</div>' +
        '<div><div class="search-result-name">' + esc(c.name || '未命名') + '</div>' +
        '<div class="search-result-meta">' + (country === 'japan' ? '日本' : '中国') + '</div></div>' +
      '</div>';
    }).join('');

    results.classList.add('visible');

    results.querySelectorAll('.search-result-item').forEach(function (item) {
      item.addEventListener('click', function () {
        selectClub({
          id: this.dataset.clubId,
          name: this.dataset.clubName,
          country: this.dataset.clubCountry
        });
        results.classList.remove('visible');
        $('clubSearchReal').value = '';
      });
    });
  }

  function selectClub(club) {
    state.selectedClub = club;
    $('clubSearchPlaceholder').style.display = 'none';
    var chip = $('clubSearchChip');
    chip.style.display = 'inline-flex';
    $('clubSearchChipName').textContent = club.name;
    $('clubSearchReal').style.display = 'none';
  }

  function clearClubSelection() {
    state.selectedClub = null;
    $('clubSearchPlaceholder').style.display = '';
    $('clubSearchChip').style.display = 'none';
    $('clubSearchReal').style.display = '';
    $('clubSearchReal').value = '';
  }

  $('clubSearchClear').addEventListener('click', function (e) {
    e.stopPropagation();
    clearClubSelection();
  });

  /* ===== Stage Labels ===== */
  var STAGE_TYPE_LABELS = {
    nomination: '提名期',
    qualifier: '海选池',
    group_vote: '分组投票',
    bracket: '淘汰赛',
    final: '决赛'
  };

  var VOTE_MODE_LABELS = {
    nomination: '提名投票',
    multi_select: '多选投票',
    score: '评分制',
    match_single: '1v1对决'
  };

  /* ===== Detail Rendering ===== */
  function renderDetail() {
    var host = $('detailArea');
    var p = state.selected;
    if (!p) {
      host.innerHTML = '<div class="empty-state"><div class="empty-state-inner"><svg width="48" height="48" viewBox="0 0 48 48" fill="none" style="margin:0 auto 12px;opacity:0.3;"><rect x="8" y="8" width="32" height="32" rx="4" stroke="var(--am-text-secondary)" stroke-width="1.5" fill="none"/><line x1="24" y1="16" x2="24" y2="32" stroke="var(--am-text-secondary)" stroke-width="1.5"/><line x1="16" y1="24" x2="32" y2="24" stroke="var(--am-text-secondary)" stroke-width="1.5"/></svg><p>选择一个企划开始管理</p></div></div>';
      return;
    }
    var isMoe = p.project_type === 'moe';
    var stageRows = state.stages.map(function (s) { return renderStageRow(s, isMoe); }).join('');

    host.innerHTML =
      renderProjectHeader(p) +
      '<div class="card"><div class="card-header"><span>赛程阶段</span></div>' +
      '<div class="card-body" style="display:flex;flex-direction:column;gap:6px;">' + (stageRows || '<div style="text-align:center;padding:12px;color:var(--am-text-secondary);font-size:13px;">暂无阶段数据</div>') + '</div></div>' +
      renderPoolCard() +
      (isMoe ? renderAwardsCard() : '');

    bindDetailEvents();
    renderPoolContent();
    renderMatchContent();
    if (isMoe) loadCurrentMoeKing();
  }

  function renderProjectHeader(p) {
    return '<div class="card"><div class="card-body">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;">' +
        '<div><h3 style="margin:0;font-size:17px;">' + esc(p.title) + '</h3>' +
        '<div style="font-size:12px;color:var(--am-text-secondary);margin-top:3px;">' + typeLabel(p.project_type) + ' · ' + esc(clubDisplayName(p.club_id, p.country || 'china')) + ' · ' + (p.country === 'japan' ? '日本' : '中国') + ' · ' + esc(p.year_label || '') + ' · <span style="color:' + (p.status === 'running' ? 'var(--am-status-open-text)' : 'var(--am-text-secondary)') + ';">' + statusLabel(p.status) + '</span></div></div>' +
        '<div style="display:flex;gap:6px;">' +
          '<button class="stage-btn" data-action="publish">发布</button>' +
          '<button class="stage-btn" data-action="archive">归档</button>' +
          '<button class="stage-btn" style="color:var(--am-danger-text);border-color:rgba(214,69,69,0.3);" data-action="delete">删除</button>' +
        '</div>' +
      '</div></div></div>';
  }

  function deprecatedNominationFlow(btn) {
    return rebuildFlowFromNomination(btn);
    /*
    if (!state.selected) return;
    if (btn) {
      btn.disabled = true;
      btn.textContent = '生成中...';
    }
      if (data.success) {
        state.stageEntriesCache = {};
        var qualifierId = Number(data.qualifier_stage_id || 0);
        return (qualifierId ? loadStageEntries(qualifierId) : Promise.resolve([])).then(function (entries) {
          var msg = data.reseeded
            ? (data.already_seeded ? '已重新生成海选池并打开海选' : '已生成海选池并打开海选')
            : '已打开海选，已保留现有海选池';
          msg += ' · 写入 ' + Number(data.readback_count || data.seeded_count || 0) + ' · 读取 ' + entries.length;
          if (Number(entries.rawCount || entries.length || 0) !== entries.length) {
            msg += ' · 原始 ' + Number(entries.rawCount || 0);
          }
          toast(msg);
          if (state.selected) return reloadProjectWithQualifierPool(state.selected.id, qualifierId, entries);
        });
      } else {
        toast(data.message || '生成海选失败');
      }
      if (state.selected) selectProject(state.selected.id);
    }).catch(function (error) {
      console.error('advance_from_nomination failed', error);
      toast('生成海选失败，请刷新后重试');
      if (btn) {
        btn.disabled = false;
        btn.textContent = '生成海选池并打开海选';
      }
    });
    */
  }

  function rebuildFlowFromNomination(btn) {
    if (!state.selected) return;
    if (state.rebuildFlowInFlight) return;
    state.rebuildFlowInFlight = true;
    if (btn) { btn.disabled = true; btn.textContent = '生成中...'; }
    return post('../api/vote_stages.php?action=rebuild_from_nomination_and_open', { project_id: Number(state.selected.id) }).then(function (data) {
      if (!data.success) {
        toast(data.message || '生成海选池失败');
        if (state.selected) selectProject(state.selected.id);
        return;
      }
      state.stageEntriesCache = {};
      var qualifierId = Number(data.qualifier_stage_id || data.stage_id || data.target_stage_id || 0);
      return (qualifierId ? loadStageEntries(qualifierId) : Promise.resolve([])).then(function (entries) {
        var seeded = Number(data.seeded_count || 0);
        var readback = Number(data.readback_count || entries.rawCount || entries.length || 0);
        if (seeded !== readback || seeded !== entries.length) {
          toast('海选池生成异常：写入 ' + seeded + '，读取 ' + readback + '，请刷新后重试');
          if (state.selected) return selectProject(state.selected.id);
          return;
        }
        toast('已生成并打开海选池 · ' + seeded);
        if (state.selected) return reloadProjectWithQualifierPool(state.selected.id, qualifierId, entries);
      });
    }).catch(function (error) {
      console.error('rebuild_from_nomination_and_open failed', error);
      toast('生成海选池失败，请刷新后重试');
      if (state.selected) selectProject(state.selected.id);
    }).finally(function () {
      state.rebuildFlowInFlight = false;
      if (btn) { btn.disabled = false; btn.textContent = '生成海选池并打开海选'; }
    });
    if (btn) { btn.disabled = true; btn.textContent = '重建中...'; }
    post('../api/vote_stages.php?action=rebuild_from_nomination_and_open', { project_id: Number(state.selected.id) }).then(function (data) {
      toast(data.success ? ('已从有效提名生成海选池 · ' + Number(data.seeded_count || 0)) : (data.message || '重建失败'));
      if (state.selected) selectProject(state.selected.id);
    }).finally(function () {
      if (btn) { btn.disabled = false; btn.textContent = '从当前有效提名重建流程'; }
    });
  }

  function runFlowAction(action, poolId, btn) {
    if (!state.selected || !poolId) return;
    if (action === 'generate_matches') {
      var stage = state.stages.find(function (s) {
        var pool = getFlowPoolForStage(s);
        return pool && Number(pool.id) === Number(poolId);
      });
      if (!stage) return;
      if (btn) { btn.disabled = true; btn.textContent = '生成中...'; }
      post('../api/vote_matches.php?action=generate', { stage_id: Number(stage.id) }).then(function (data) {
        toast(data.success ? '对阵已生成' : (data.message || '生成失败'));
        if (state.selected) selectProject(state.selected.id);
      }).finally(function () {
        if (btn) btn.disabled = false;
      });
      return;
    }
    if (action === 'settle_by_votes') {
      var settleStage = state.stages.find(function (s) {
        var pool = getFlowPoolForStage(s);
        return pool && Number(pool.id) === Number(poolId);
      });
      if (!settleStage) return;
      if (btn) { btn.disabled = true; btn.textContent = '结算中...'; }
      post('../api/vote_matches.php?action=settle_by_votes', { stage_id: Number(settleStage.id) }).then(function (data) {
        var msg = data.success ? ('已按票数结算 ' + Number(data.settled_count || 0) + ' 场') : (data.message || '结算失败');
        if (data.success && Number(data.unresolved_count || 0) > 0) msg += ' · 平票/缺项 ' + Number(data.unresolved_count || 0) + ' 场';
        var issues = data.success ? (data.unresolved || []) : [];
        toast(msg);
        if (state.selected) {
          selectProject(state.selected.id).then(function () {
            state.lastSettleIssues = issues;
            renderMatchContent();
          });
        }
      }).finally(function () {
        if (btn) btn.disabled = false;
      });
      return;
    }
    if (btn) { btn.disabled = true; btn.textContent = '处理中...'; }
    post('../api/vote_stages.php?action=' + encodeURIComponent(action), { pool_id: Number(poolId) }).then(function (data) {
      toast(data.success ? '流程已更新' : (data.message || '操作失败'));
      if (state.selected) selectProject(state.selected.id);
    }).finally(function () {
      if (btn) btn.disabled = false;
    });
  }

  function renderStageRow(s, isMoe) {
    var typeLabelText = STAGE_TYPE_LABELS[s.stage_type] || s.stage_type;
    var typeClass = s.stage_type;
    if (isMoe && s.stage_type === 'qualifier') { typeClass = 'qualifier'; typeLabelText = '海选池'; }
    var summary = buildStageSummary(s);
    var flowPool = getFlowPoolForStage(s);
    var shouldRebuild = s.stage_type === 'qualifier' && !flowPool;
    var primaryAction = shouldRebuild
      ? '<button class="stage-btn primary" data-rebuild-flow>生成海选池并打开海选</button>'
      : (s.status !== 'open' ? '<button class="stage-btn primary" data-stage-action="open" data-stage-id="' + Number(s.id) + '">开放</button>' : '');
    var flowActions = flowPool ? renderStageActions(s).replace('<span class="stage-actions">', '').replace('</span>', '') : '';
    var rowActions = '<button class="stage-btn edit-active" data-stage-edit="' + Number(s.id) + '">编辑</button>' +
      (flowPool ? flowActions : (
        primaryAction +
        (s.status === 'open' ? '<button class="stage-btn" data-stage-action="lock" data-stage-id="' + Number(s.id) + '">锁定</button>' : '') +
        '<button class="stage-btn success" data-stage-action="settle" data-stage-id="' + Number(s.id) + '">结算</button>'
      ));
    return '<div class="stage-row" data-stage-id="' + Number(s.id) + '">' +
      '<span class="stage-tag ' + typeClass + '">' + typeLabelText + '</span>' +
      '<span class="stage-title">' + esc(s.title) + '</span>' +
      '<span class="stage-summary">' + esc(summary) + '</span>' +
      '<span class="stage-status ' + (s.status === 'open' ? 'open' : 'pending') + '">' + (s.status === 'open' ? '开放中' : (s.status === 'locked' ? '已锁定' : '待开放')) + '</span>' +
      '<span class="stage-actions">' +
        rowActions +
      '</span>' +
    '</div>';
  }

  function buildStageSummary(s) {
    var parts = [];
    var modeLabel = VOTE_MODE_LABELS[s.vote_mode] || s.vote_mode;
    parts.push(modeLabel);
    if (s.vote_mode === 'nomination') {
      parts.push('每人' + Number(s.max_select || 1) + '个');
    } else if (s.vote_mode === 'multi_select') {
      parts.push('每人' + Number(s.max_select || 1) + '票');
      if (Number(s.group_count) > 1) parts.push(Number(s.group_count) + '组');
    } else if (s.vote_mode === 'score') {
      parts.push(Number(s.score_min || 1) + '~' + Number(s.score_max || 10) + '分');
      if (Number(s.group_count) > 1) parts.push(Number(s.group_count) + '组');
    } else if (s.vote_mode === 'match_single') {
      var config = parseConfig(s.config_json);
      var size = Number(config.bracket_size || s.advance_count || 16);
      parts.push(size + '强');
    }
    parts.push('晋级' + Number(s.advance_count || 0));
    return parts.join(' · ');
  }

  /* ===== Detail Event Binding ===== */
  function bindDetailEvents() {
    document.querySelectorAll('[data-action]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var action = this.dataset.action;
        if (!state.selected) return;
        if (action === 'delete' && !confirm('确定删除该企划及全部数据？此操作不可撤销。')) return;
        post('../api/vote_projects.php?action=' + action + '&id=' + state.selected.id, {}).then(function (data) {
          toast(data.success ? '操作完成' : (data.message || '操作失败'));
          state.selected = null;
          loadManageable();
        });
      });
    });

    document.querySelectorAll('[data-stage-edit]').forEach(function (btn) {
      btn.addEventListener('click', function () { openStageModal(this.dataset.stageEdit); });
    });

    document.querySelectorAll('[data-stage-action]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var action = this.dataset.stageAction;
        var id = this.dataset.stageId;
        post('../api/vote_stages.php?action=' + action + '&id=' + encodeURIComponent(id), {}).then(function (data) {
          var msg = data.success ? '阶段已更新' : (data.message || '操作失败');
          if (data.success && action === 'open' && data.seeded_count != null) msg += ' · 候选 ' + Number(data.seeded_count);
          if (data.success && action === 'settle' && data.advanced_count != null) msg += ' · 晋级 ' + Number(data.advanced_count);
          toast(msg);
          if (state.selected) selectProject(state.selected.id);
        });
      });
    });

    document.querySelectorAll('[data-rebuild-flow]').forEach(function (btn) {
      if (btn.dataset.boundRebuildFlow === '1') return;
      btn.dataset.boundRebuildFlow = '1';
      btn.addEventListener('click', function () { rebuildFlowFromNomination(btn); });
    });

    document.querySelectorAll('[data-flow-action]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        runFlowAction(this.dataset.flowAction, this.dataset.poolId, btn);
      });
    });

    document.querySelectorAll('[data-match-winner]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        settleMatch(this.dataset.matchWinner, this.dataset.winnerId);
      });
    });
  }

  /* ===== Modal ===== */
  function allowedVoteModesForStage(s) {
    if (!s) return [];
    if (s.stage_type === 'nomination') return [{ value: 'nomination', label: '提名投票' }];
    if (s.stage_type === 'bracket' || (s.stage_type === 'final' && state.selected && state.selected.project_type === 'moe')) {
      return [{ value: 'match_single', label: '1v1 对决' }];
    }
    return [
      { value: 'multi_select', label: '多选投票' },
      { value: 'score', label: '评分制' }
    ];
  }

  function openStageModal(stageId) {
    var s = state.stages.find(function (st) { return Number(st.id) === Number(stageId); });
    if (!s) return;
    state.editingStageId = stageId;
    var config = parseConfig(s.config_json);

    var tag = $('modalStageTag');
    tag.textContent = STAGE_TYPE_LABELS[s.stage_type] || s.stage_type;
    tag.className = 'stage-tag ' + (s.stage_type);
    $('modalStageTitle').textContent = '编辑：' + esc(s.title);

    var voteModes = allowedVoteModesForStage(s);
    if (!voteModes.some(function (m) { return m.value === s.vote_mode; })) s.vote_mode = voteModes[0].value;

    var html = '<div class="form-field" style="margin-bottom:16px;"><label class="field-label">投票方式</label><div class="segmented" id="modalVoteMode">';
    voteModes.forEach(function (m) {
      html += '<button class="segmented-btn' + (s.vote_mode === m.value ? ' active' : '') + '" data-mode="' + m.value + '">' + m.label + '</button>';
    });
    html += '</div></div>';
    html += '<div id="modalFields" style="display:flex;flex-direction:column;gap:10px;">';
    html += buildModalFields(s, config);
    html += '</div>';
    html += '<div class="modal-logic-hint" id="modalLogicHint"></div>';

    $('modalBody').innerHTML = html;
    updateModalFieldVisibility(s.vote_mode);
    updateModalLogicHint(s.vote_mode);

    $('stageModal').style.display = 'flex';

    $('modalVoteMode').addEventListener('click', function (e) {
      var btn = e.target.closest('.segmented-btn');
      if (!btn) return;
      var mode = btn.dataset.mode;
      this.querySelectorAll('.segmented-btn').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      s.vote_mode = mode;
      $('modalFields').innerHTML = buildModalFields(s, config);
      updateModalFieldVisibility(mode);
      updateModalLogicHint(mode);
    });
  }

  function toDateTimeLocalValue(value) {
    if (!value) return '';
    return String(value).replace(' ', 'T').slice(0, 16);
  }

  function normalizeDateTimeLocal(value) {
    if (!value) return null;
    return String(value).replace('T', ' ') + ':00';
  }

  function buildModalFields(s, config) {
    var html = '';
    var mode = s.vote_mode;

    html += '<div class="form-row"><div class="form-field"><label class="field-label">阶段标题</label><input class="form-input" id="mfTitle" value="' + esc(s.title) + '"></div>';
    html += '<div class="form-field"><label class="field-label">晋级数</label><input class="form-input" id="mfAdvance" type="number" min="0" value="' + Number(s.advance_count || 0) + '"></div></div>';
    html += '<div class="form-field"><label class="field-label">结束时间 <span class="modal-field-hint">用于后台定时结算</span></label><input class="form-input" id="mfEndsAt" type="datetime-local" value="' + esc(toDateTimeLocalValue(s.ends_at || '')) + '"></div>';

    if (mode !== 'match_single') {
      var maxLabel = mode === 'nomination' ? '每人可提名' : '每人可选';
      html += '<div class="form-field" data-field-group="multi"><label class="field-label">' + maxLabel + '</label><input class="form-input" id="mfMaxSelect" type="number" min="1" value="' + Number(s.max_select || 1) + '"></div>';
    }

    if (mode === 'multi_select' || mode === 'score') {
      html += '<div class="form-field" data-field-group="group"><label class="field-label">分组数 <span class="modal-field-hint">分组</span></label>';
      html += '<div class="segmented" id="mfGroupCount">';
      var groupOptions = s.stage_type === 'qualifier' ? [2, 4] : [1, 2, 4, 8];
      if (groupOptions.indexOf(Number(s.group_count)) === -1) s.group_count = groupOptions[0];
      groupOptions.forEach(function (n) {
        html += '<button class="segmented-btn' + (Number(s.group_count) === n ? ' active' : '') + '" data-value="' + n + '">' + n + '</button>';
      });
      html += '</div>';
      if (s.stage_type === 'qualifier') {
        html += '<div class="modal-field-hint" id="mfGroupAdvancePreview">每组晋级 ' + Math.floor(Number(s.advance_count || 0) / Number(s.group_count || 1)) + '</div>';
      }
      html += '</div>';
    }

    if (mode === 'score') {
      html += '<div class="form-row"><div class="form-field" data-field-group="score"><label class="field-label">最低分 <span class="modal-field-hint">评分制</span></label><input class="form-input" id="mfScoreMin" type="number" min="1" value="' + Number(s.score_min || 1) + '"></div>';
      html += '<div class="form-field" data-field-group="score"><label class="field-label">最高分 <span class="modal-field-hint">评分制</span></label><input class="form-input" id="mfScoreMax" type="number" min="1" value="' + Number(s.score_max || 10) + '"></div></div>';
    }

    if (mode === 'match_single') {
      var bracketSize = Number(config.bracket_size || s.advance_count || 16);
      html += '<div class="form-field" data-field-group="bracket"><label class="field-label">对阵规模 <span class="modal-field-hint">1v1</span></label>';
      html += '<div class="segmented" id="mfBracketSize">';
      [16, 32].forEach(function (n) {
        html += '<button class="segmented-btn' + (bracketSize === n ? ' active' : '') + '" data-value="' + n + '">' + n + ' 强</button>';
      });
      html += '</div></div>';
    }

    html += '<div class="form-field"><label class="field-label">结果公开</label><select class="form-select" id="mfResultVisibility">' +
      '<option value="live_votes"' + (s.result_visibility === 'live_votes' ? ' selected' : '') + '>实时票数</option>' +
      '<option value="live_rank_only"' + (s.result_visibility === 'live_rank_only' ? ' selected' : '') + '>实时排名</option>' +
      '<option value="after_stage"' + (s.result_visibility === 'after_stage' ? ' selected' : '') + '>阶段后公开</option>' +
      '<option value="after_event"' + (s.result_visibility === 'after_event' ? ' selected' : '') + '>活动结束后公开</option>' +
      '<option value="hidden"' + (s.result_visibility === 'hidden' ? ' selected' : '') + '>隐藏</option>' +
      '</select></div>';

    html += '<div style="display:flex;gap:16px;padding-top:8px;">';
    html += '<label style="display:flex;align-items:center;gap:6px;font-size:13px;"><input type="checkbox" id="mfAllowChange"' + (Number(s.allow_vote_change) ? ' checked' : '') + '> 允许改票</label>';
    html += '<label style="display:flex;align-items:center;gap:6px;font-size:13px;"><input type="checkbox" id="mfZeroFill"' + (config.allow_zero_fill ? ' checked' : '') + '> 0票补位</label>';
    html += '</div>';

    return html;
  }

  function updateModalFieldVisibility(mode) {
    var scoreFields = document.querySelectorAll('[data-field-group="score"]');
    var groupFields = document.querySelectorAll('[data-field-group="group"]');
    var bracketFields = document.querySelectorAll('[data-field-group="bracket"]');
    var multiFields = document.querySelectorAll('[data-field-group="multi"]');

    scoreFields.forEach(function (el) { el.style.display = mode === 'score' ? '' : 'none'; });
    groupFields.forEach(function (el) { el.style.display = (mode === 'multi_select' || mode === 'score') ? '' : 'none'; });
    bracketFields.forEach(function (el) { el.style.display = mode === 'match_single' ? '' : 'none'; });
    multiFields.forEach(function (el) { el.style.display = mode !== 'match_single' ? '' : 'none'; });
  }

  function updateModalLogicHint(mode) {
    var hint = $('modalLogicHint');
    if (!hint) return;
    var hints = {
      nomination: '<strong>提名投票模式：</strong>用户提交提名，自动进入候选池。不涉及评分和分组。',
      multi_select: '<strong>多选投票模式：</strong>用户选择多个条目。可配置分组数（1/2/4/8）。不涉及评分。',
      score: '<strong>评分制模式：</strong>用户对每个条目打分。显示最低分/最高分字段。可配置分组。',
      match_single: '<strong>1v1 对决模式：</strong>两两对决投票。显示对阵规模（16/32强）。不显示评分和分组字段。'
    };
    hint.innerHTML = hints[mode] || '';
  }

  function closeStageModal() {
    $('stageModal').style.display = 'none';
    state.editingStageId = null;
  }

  $('modalClose').addEventListener('click', closeStageModal);
  $('modalCancel').addEventListener('click', closeStageModal);
  $('stageModal').addEventListener('click', function (e) {
    if (e.target === this) closeStageModal();
  });

  $('modalSave').addEventListener('click', function () {
    if (!state.editingStageId) return;
    var s = state.stages.find(function (st) { return Number(st.id) === Number(state.editingStageId); });
    if (!s) return;

    function val(id) { var el = $(id); return el ? (el.type === 'checkbox' ? el.checked : el.value) : ''; }

    var groupCount = Number(s.group_count || 1);
    var groupEl = document.querySelector('#mfGroupCount .segmented-btn.active');
    if (groupEl) groupCount = Number(groupEl.dataset.value);

    var bracketSize = 0;
    var bracketEl = document.querySelector('#mfBracketSize .segmented-btn.active');
    if (bracketEl) bracketSize = Number(bracketEl.dataset.value);

    var body = {
      id: Number(state.editingStageId),
      title: val('mfTitle'),
      ends_at: normalizeDateTimeLocal(val('mfEndsAt')),
      vote_mode: s.vote_mode,
      max_select: Number(val('mfMaxSelect')) || 1,
      advance_count: Number(val('mfAdvance')) || 0,
      group_count: groupCount,
      score_min: Number(val('mfScoreMin')) || 1,
      score_max: Number(val('mfScoreMax')) || 10,
      allow_vote_change: val('mfAllowChange') ? 1 : 0,
      result_visibility: val('mfResultVisibility'),
      config: { allow_zero_fill: val('mfZeroFill') ? true : false, bracket_size: bracketSize, tie_rule: 'manual' }
    };

    post('../api/vote_stages.php?action=update&id=' + encodeURIComponent(state.editingStageId), body).then(function (data) {
      toast(data.success ? '阶段配置已保存' : (data.message || '保存失败'));
      closeStageModal();
      if (state.selected) selectProject(state.selected.id);
    });
  });

  /* ===== Pool Card ===== */
  function renderPoolCard() {
    return '<div class="card" id="poolCard"><div class="card-header"><span>候选池</span><span style="font-size:11px;color:var(--am-text-secondary);font-weight:400;" id="poolStats"></span></div><div class="pool-pipeline" id="poolPipeline"></div><div class="card-body" id="poolContent" style="padding:0;"><div style="text-align:center;padding:20px;color:var(--am-text-secondary);font-size:13px;">加载中...</div></div></div>';
  }

  function renderPoolCard() {
    return '<div class="card" id="poolCard"><div class="card-header"><span>活动工作台</span><span style="font-size:11px;color:var(--am-text-secondary);font-weight:400;" id="poolStats"></span></div><div class="pool-pipeline" id="poolPipeline"></div><div class="card-body activity-workbench" id="poolContent"><div style="text-align:center;padding:20px;color:var(--am-text-secondary);font-size:13px;">加载中...</div></div></div>';
  }

  function getSelectedEntryIds() {
    var key = 'pool-selected-' + (state.selected ? state.selected.id : 0);
    try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) { return []; }
  }

  function setSelectedEntryIds(ids) {
    var key = 'pool-selected-' + (state.selected ? state.selected.id : 0);
    localStorage.setItem(key, JSON.stringify(ids));
  }

  /** Build pipeline: stages flow with entry counts */
  function updatePoolPipeline(p) {
    var el = $('poolPipeline');
    if (!el) return;
    if (!state.stages.length) { el.innerHTML = ''; return; }
    var stageMap = {};
    state.stages.forEach(function (s) { stageMap[s.stage_type] = s; });
    var types = ['nomination', 'qualifier', 'group_vote', 'bracket', 'final'];
    var labels = { nomination: '提名', qualifier: '海选', group_vote: '分组', bracket: '淘汰赛', final: '决赛' };
    var isMoe = p && p.project_type === 'moe';
    var filtered = types.filter(function (t) {
      if (!stageMap[t]) return false;
      if (isMoe && t === 'group_vote') return false;
      if (!isMoe && t === 'bracket') return false;
      return true;
    });
    var steps = filtered.map(function (t) {
      var sid = String(stageMap[t].id);
      var cnt = '?';
      if (t === 'nomination') {
        cnt = state.entries.length;
      } else if (state.stageEntriesCache[sid]) {
        cnt = state.stageEntriesCache[sid].length;
      }
      var active = (t === 'nomination' && state.poolStageTab === 'all') ||
                   state.poolStageTab === sid;
      return '<span class="pipeline-step' + (active ? ' active' : '') + '">' + labels[t] + ' <strong>' + cnt + '</strong></span>';
    });
    el.innerHTML = steps.join('<span class="pipeline-arrow">&rarr;</span>');
  }

  /** Fetch & cache stage entries from backend */
  function loadStageEntries(stageId) {
    if (state.stageEntriesCache[stageId]) {
      return Promise.resolve(state.stageEntriesCache[stageId]);
    }
    return api('../api/vote_stages.php?action=stage_entries&stage_id=' + encodeURIComponent(stageId) + '&_=' + Date.now()).then(function (data) {
      var entries = data.success ? (data.data || []) : [];
      entries.rawCount = Number(data.raw_count || entries.length || 0);
      state.stageEntriesCache[stageId] = entries;
      return entries;
    }).catch(function () {
      state.stageEntriesCache[stageId] = [];
      return [];
    });
  }

  function togglePoolEntry(entryId) {
    var ids = getSelectedEntryIds();
    var idx = ids.indexOf(Number(entryId));
    if (idx === -1) { ids.push(Number(entryId)); }
    else { ids.splice(idx, 1); }
    setSelectedEntryIds(ids);
    renderPoolContent();
  }

  function renderLegacyPoolContentUnused() {
    var content = $('poolContent');
    if (!content) return;
    var p = state.selected;
    if (!p) return;
    var isMoe = p.project_type === 'moe';

    // === Pipeline ===
    updatePoolPipeline(p);

    // === Build tabs from available stages ===
    var stageMap = {};
    state.stages.forEach(function (s) { stageMap[s.stage_type] = s; });

    var TAB_ORDER = ['nomination', 'qualifier', 'group_vote', 'bracket', 'final'];
    var TAB_LABELS = { nomination: '提名候选池', qualifier: '海选池', group_vote: '分组投票', bracket: '淘汰赛', final: '决赛' };

    var tabTypes = TAB_ORDER.filter(function (t) {
      if (!stageMap[t]) return false;
      if (isMoe && t === 'group_vote') return false;
      if (!isMoe && t === 'bracket') return false;
      return true;
    });

    var tabHtml = '<div class="pool-tabs">';
    tabTypes.forEach(function (t) {
      var tabId = t === 'nomination' ? 'all' : String(stageMap[t].id);
      var label = TAB_LABELS[t];
      var active = state.poolStageTab === tabId;
      tabHtml += '<span class="pool-tab' + (active ? ' active' : '') + '" data-stage-tab="' + tabId + '">' + label + '</span>';
    });
    tabHtml += '</div>';

    // === Render content based on active tab ===
    if (state.poolStageTab === 'all') {
      // Nomination pool — current behavior
      var allEntries = state.entries;
      var selectedIds = getSelectedEntryIds();

      var filtered = allEntries.filter(function (e) {
        if (state.poolFilter === 'selected') return selectedIds.indexOf(Number(e.id)) !== -1;
        if (state.poolFilter === 'removed') return e.entry_status === 'removed';
        if (state.poolFilter === 'pending') return e.entry_status !== 'removed' && selectedIds.indexOf(Number(e.id)) === -1;
        return true;
      });

      var total = filtered.length;
      var paged = filtered.slice(0, state.poolPage * POOL_PAGE_SIZE);
      var hasMore = paged.length < total;

      $('poolStats').textContent = allEntries.length + '条 · 已选' + selectedIds.length;

      var html = tabHtml;
      html += '<div class="pool-toolbar">';
      html += '<div class="pool-filter">';
      var filters = [
        { key: 'all', label: '全部 ' + allEntries.length },
        { key: 'selected', label: '已选 ' + selectedIds.length },
        { key: 'pending', label: '待处理' },
        { key: 'removed', label: '已移除' }
      ];
      filters.forEach(function (f) {
        html += '<span class="pool-filter-item' + (state.poolFilter === f.key ? ' active' : '') + '" data-pool-filter="' + f.key + '">' + f.label + '</span>';
      });
      html += '</div>';
      html += '<div style="display:flex;gap:6px;">';
      html += '<button class="stage-btn" id="poolSelectAll">全选</button>';
      html += '<button class="stage-btn primary" id="poolRemove" style="background:var(--am-tag-nomination-text);color:#fff;border-color:transparent;">排除选中</button>';
      html += '<button class="stage-btn" id="poolRestore">恢复选中</button>';
      html += '</div></div>';

      html += '<div class="pool-grid">';
      paged.forEach(function (e) {
        var isSelected = selectedIds.indexOf(Number(e.id)) !== -1;
        var isRemoved = e.entry_status === 'removed';
        html += '<div class="pool-item' + (isSelected ? ' selected' : '') + (isRemoved ? ' removed' : '') + '" data-entry-id="' + Number(e.id) + '">';
        html += '<div class="pool-check"><svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="4"><path d="M20 6L9 17l-5-5"/></svg></div>';
        if (isMoe) {
          html += '<div class="pool-avatar" style="background-image:' + (e.image_url ? 'url(' + esc(e.image_url) + ')' : 'linear-gradient(135deg,#e8d8f0,#d8c8e8)') + ';"></div>';
        } else {
          if (e.image_url) {
            html += '<div class="pool-avatar twelve" style="background-image:url(' + esc(e.image_url) + ');"></div>';
          } else {
            html += '<div class="pool-avatar twelve" style="background-image:linear-gradient(135deg,#2f6fed,#5090f0);display:grid;place-items:center;color:#fff;font-size:8px;">' + esc((e.title || '?').slice(0, 2)) + '</div>';
          }
        }
        html += '<div class="pool-name">' + esc(e.title_cn || e.title || '未命名') + '</div>';
        html += '<div class="pool-work">' + esc(e.source_title || '') + '</div>';
        html += '</div>';
      });

      if (hasMore) {
        html += '<div class="pool-expand" id="poolExpand">+ ' + (total - paged.length) + ' 个<br>展开更多</div>';
      }
      html += '</div>';

      html += '<div class="pool-footer">';
      html += '<span>显示 ' + paged.length + ' / ' + total + ' · <span style="color:var(--am-tag-nomination-text);cursor:pointer;" id="poolShowAll">展开全部</span></span>';
      html += '<span>第 ' + state.poolPage + ' 页</span>';
      html += '</div>';

      content.innerHTML = html;
      bindPoolTabEvents();
      bindPoolEvents();
      return;
    }

    // === Stage-specific pool (qualifier / bracket / group_vote / final) ===
    var stageId = Number(state.poolStageTab);
    var stageEntries = state.stageEntriesCache[stageId];

    if (!stageEntries) {
      content.innerHTML = tabHtml + '<div style="text-align:center;padding:20px;color:var(--am-text-secondary);font-size:13px;">加载中...</div>';
      bindPoolTabEvents();
      loadStageEntries(stageId).then(function () { renderPoolContent(); });
      return;
    }

    var totalStage = stageEntries.length;
    $('poolStats').textContent = totalStage + '条';

    var html = tabHtml;
    html += '<div class="pool-grid">';
    stageEntries.forEach(function (e) {
      var meta = '';
      if (e.group_key) meta += e.group_key + ' · ';
      meta += '#' + Number(e.seed_no || 0);
      if (Number(e.source_result_rank || 0) > 0) meta += ' · R' + Number(e.source_result_rank);

      html += '<div class="pool-item" data-entry-id="' + Number(e.entry_id) + '">';
      if (isMoe) {
        html += '<div class="pool-avatar" style="background-image:' + (e.image_url ? 'url(' + esc(e.image_url) + ')' : 'linear-gradient(135deg,#e8d8f0,#d8c8e8)') + ';"></div>';
      } else {
        if (e.image_url) {
          html += '<div class="pool-avatar twelve" style="background-image:url(' + esc(e.image_url) + ');"></div>';
        } else {
          html += '<div class="pool-avatar twelve" style="background-image:linear-gradient(135deg,#2f6fed,#5090f0);display:grid;place-items:center;color:#fff;font-size:8px;">' + esc((e.title || '?').slice(0, 2)) + '</div>';
        }
      }
      html += '<div class="pool-name">' + esc(e.title_cn || e.title || '未命名') + '</div>';
      html += '<div class="pool-meta">' + esc(meta) + '</div>';
      html += '</div>';
    });
    html += '</div>';

    html += '<div class="pool-footer">';
    html += '<span>共 ' + totalStage + ' 条</span>';
    html += '</div>';

    content.innerHTML = html;
    bindPoolTabEvents();
  }

  function getStageByType(type) {
    return state.stages.find(function (stage) { return stage.stage_type === type; }) || null;
  }

  function getFlowPoolForStage(stage) {
    if (!stage || !state.flow || !Array.isArray(state.flow.pools)) return null;
    return state.flow.pools.find(function (pool) { return Number(pool.stage_id) === Number(stage.id); }) || null;
  }

  function flowActionButton(label, action, pool, cls) {
    return '<button class="stage-btn ' + (cls || '') + '" data-flow-action="' + esc(action) + '" data-pool-id="' + Number(pool.id) + '">' + esc(label) + '</button>';
  }

  function renderStageActions(stage) {
    if (!stage) return '';
    var flowPool = getFlowPoolForStage(stage);
    if (flowPool) {
      var buttons = [];
      if (flowPool.status === 'draft' || flowPool.status === 'locked') {
        buttons.push(flowActionButton('打开阶段池', 'open_pool', flowPool, 'primary'));
      }
      if (flowPool.status === 'open' && stage.vote_mode !== 'match_single') {
        buttons.push(flowActionButton('结算阶段池', 'settle_pool', flowPool, 'success'));
      }
      if (flowPool.status === 'settled' && stage.stage_type !== 'final') {
        buttons.push(flowActionButton('生成下一阶段池', 'generate_next_pool', flowPool, 'primary'));
      }
      if ((stage.stage_type === 'bracket' || stage.stage_type === 'final') && flowPool.status !== 'settled') {
        buttons.push(flowActionButton('生成对阵', 'generate_matches', flowPool, 'primary'));
        buttons.push(flowActionButton('按票数结算对阵', 'settle_by_votes', flowPool, 'success'));
      }
      return '<span class="stage-actions">' + buttons.join('') + '</span>';
    }
    if (stage.stage_type === 'qualifier') {
      return '<span class="stage-actions"><button class="stage-btn primary" data-rebuild-flow>生成海选池并打开海选</button></span>';
    }
    return '<span class="stage-actions">' +
      (stage.status !== 'open' ? '<button class="stage-btn primary" data-workbench-stage-action="open" data-stage-id="' + Number(stage.id) + '">开放</button>' : '') +
      (stage.status === 'open' ? '<button class="stage-btn" data-workbench-stage-action="lock" data-stage-id="' + Number(stage.id) + '">锁定</button>' : '') +
      '<button class="stage-btn success" data-workbench-stage-action="settle" data-stage-id="' + Number(stage.id) + '">结算</button>' +
    '</span>';
  }

  function renderEntryGrid(entries, options) {
    options = options || {};
    var isMoe = state.selected && state.selected.project_type === 'moe';
    if (!entries.length) {
      return '<div class="workbench-empty">' + esc(options.empty || '暂无条目') + '</div>';
    }
    var selectedIds = getSelectedEntryIds();
    var html = '<div class="pool-grid workbench-grid">';
    entries.forEach(function (e) {
      var entryId = Number(e.entry_id || e.id);
      var isSelected = selectedIds.indexOf(entryId) !== -1;
      var isRemoved = e.entry_status === 'removed' || e.status === 'removed';
      var title = e.title_cn || e.title || '未命名';
      var meta = options.meta ? options.meta(e) : (e.subtitle || e.source_title || '');
      html += '<div class="pool-item' + (options.selectable ? ' nomination-pool-item' : '') + (isSelected ? ' selected' : '') + (isRemoved ? ' removed' : '') + '" data-entry-id="' + entryId + '">';
      if (options.selectable) {
        html += '<div class="pool-check"><svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="4"><path d="M20 6L9 17l-5-5"/></svg></div>';
      }
      if (isMoe) {
        html += '<div class="pool-avatar" style="background-image:' + (e.image_url ? 'url(' + esc(e.image_url) + ')' : 'linear-gradient(135deg,#e8d8f0,#d8c8e8)') + ';"></div>';
      } else if (e.image_url) {
        html += '<div class="pool-avatar twelve" style="background-image:url(' + esc(e.image_url) + ');"></div>';
      } else {
        html += '<div class="pool-avatar twelve" style="background-image:linear-gradient(135deg,#2f6fed,#5090f0);display:grid;place-items:center;color:#fff;font-size:8px;">' + esc(title.slice(0, 2)) + '</div>';
      }
      html += '<div class="pool-name">' + esc(title) + '</div>';
      html += '<div class="pool-meta">' + esc(meta) + '</div>';
      html += '</div>';
    });
    html += '</div>';
    return html;
  }

  function renderWorkbenchSection(title, stage, body, hint) {
    return '<section class="workbench-section">' +
      '<div class="workbench-section-header">' +
        '<div><h4>' + esc(title) + '</h4>' + (hint ? '<p>' + esc(hint) + '</p>' : '') + '</div>' +
        '<div class="workbench-section-actions">' + (stage ? '<span class="stage-status ' + (stage.status === 'open' ? 'open' : 'pending') + '">' + esc(stage.status || 'pending') + '</span>' + renderStageActions(stage) : '') + '</div>' +
      '</div>' +
      body +
    '</section>';
  }

  function renderNominationWorkbench() {
    var selectedIds = getSelectedEntryIds();
    var qualifier = getStageByType('qualifier');
    var qualifierEntryIds = {};
    if (qualifier) {
      (state.stageEntriesCache[String(qualifier.id)] || []).forEach(function (e) {
        qualifierEntryIds[Number(e.entry_id || e.id)] = true;
      });
    }
    var entries = state.entries.filter(function (e) {
      var q = state.nominationQuery.toLowerCase();
      var matchesQuery = !q || String(e.title_cn || e.title || '').toLowerCase().indexOf(q) !== -1 || String(e.subtitle || e.source_title || '').toLowerCase().indexOf(q) !== -1;
      if (!matchesQuery) return false;
      if (state.poolFilter === 'removed') return e.entry_status === 'removed';
      if (state.poolFilter === 'selected') return selectedIds.indexOf(Number(e.id)) !== -1;
      return e.entry_status !== 'removed' && e.entry_status !== 'rejected';
    });
    var activeCount = state.entries.filter(function (e) { return e.entry_status !== 'removed' && e.entry_status !== 'rejected'; }).length;
    var removedCount = state.entries.filter(function (e) { return e.entry_status === 'removed'; }).length;
    var body = '<div class="pool-toolbar workbench-toolbar">' +
      '<div class="pool-filter">' +
        '<span class="pool-filter-item' + (state.poolFilter === 'all' ? ' active' : '') + '" data-pool-filter="all">有效 ' + activeCount + '</span>' +
        '<span class="pool-filter-item' + (state.poolFilter === 'selected' ? ' active' : '') + '" data-pool-filter="selected">已选 ' + selectedIds.length + '</span>' +
        '<span class="pool-filter-item' + (state.poolFilter === 'removed' ? ' active' : '') + '" data-pool-filter="removed">已排除 ' + removedCount + '</span>' +
      '</div>' +
      '<input class="form-input workbench-search" id="nominationSearchInput" placeholder="搜索提名" value="' + esc(state.nominationQuery) + '">' +
      '<div style="display:flex;gap:6px;">' +
        '<button class="stage-btn" id="poolSelectAll">全选有效</button>' +
        '<button class="stage-btn primary" id="poolRemove" style="background:var(--am-tag-nomination-text);color:#fff;border-color:transparent;">排除选中</button>' +
        '<button class="stage-btn" id="poolRestore">恢复选中</button>' +
      '</div>' +
    '</div>';
    body += renderEntryGrid(entries, {
      selectable: true,
      empty: state.poolFilter === 'removed' ? '暂无已排除提名' : '暂无有效提名',
      meta: function (e) {
        var entryId = Number(e.id);
        var status = e.entry_status === 'removed' ? '已排除' : (qualifierEntryIds[entryId] ? '已进入海选' : '有效');
        var detail = e.subtitle || e.source_title || '';
        return status + (detail ? ' · ' + detail : '');
      }
    });
    return renderWorkbenchSection('提名列表', null, body, '用户提名默认有效，管理员只需要排除有问题的条目。');
  }

  function getPoolStageTypes() {
    if (!state.selected) return [];
    return state.selected.project_type === 'moe'
      ? ['nomination', 'qualifier', 'bracket', 'final']
      : ['nomination', 'qualifier', 'group_vote', 'final'];
  }

  function renderPoolStageTabs() {
    var labels = { nomination: '提名', qualifier: '海选', group_vote: '分组投票', bracket: '淘汰赛', final: '决赛' };
    var html = '<div class="pool-tabs">';
    getPoolStageTypes().forEach(function (type) {
      var stage = type === 'nomination' ? null : getStageByType(type);
      if (type !== 'nomination' && !stage) return;
      var tabId = type === 'nomination' ? 'all' : String(stage.id);
      html += '<span class="pool-tab' + (state.poolStageTab === tabId ? ' active' : '') + '" data-stage-tab="' + tabId + '">' + esc(labels[type] || type) + '</span>';
    });
    html += '</div>';
    return html;
  }

  function stageTypeForTab(tabId) {
    if (tabId === 'all') return 'nomination';
    var stage = state.stages.find(function (s) { return String(s.id) === String(tabId); });
    return stage ? stage.stage_type : 'nomination';
  }

  function groupKeysForEntries(entries) {
    var keys = [];
    var seen = {};
    entries.forEach(function (entry) {
      var key = entry.group_key || '';
      if (!key || seen[key]) return;
      seen[key] = true;
      keys.push(key);
    });
    return keys;
  }

  function renderPoolGroupTabs(entries) {
    var keys = groupKeysForEntries(entries);
    if (keys.length <= 1) return '';
    var html = '<div class="pool-group-tabs">';
    html += '<span class="pool-group-tab' + (state.poolGroupTab === 'all' ? ' active' : '') + '" data-pool-group="all">全部</span>';
    keys.forEach(function (key) {
      var count = entries.filter(function (entry) { return (entry.group_key || '') === key; }).length;
      html += '<span class="pool-group-tab' + (state.poolGroupTab === key ? ' active' : '') + '" data-pool-group="' + esc(key) + '">' + esc(key) + ' ' + count + '</span>';
    });
    html += '</div>';
    return html;
  }

  function filterEntriesByGroup(entries) {
    if (!state.poolGroupTab || state.poolGroupTab === 'all') return entries;
    return entries.filter(function (entry) { return (entry.group_key || '') === state.poolGroupTab; });
  }

  function renderStageWorkbench(title, stageType, hint) {
    var stage = getStageByType(stageType);
    if (!stage) return '';
    var entries = state.stageEntriesCache[String(stage.id)] || [];
    var visibleEntries = filterEntriesByGroup(entries);
    var flowPool = getFlowPoolForStage(stage);
    var canRebuild = stageType === 'qualifier' && !flowPool;
    var emptyText = canRebuild
      ? '尚未生成，点击生成海选池并打开海选。'
      : (state.poolGroupTab && state.poolGroupTab !== 'all' ? '该分组暂无候选。' : '阶段池尚未生成，请联系负责人。');
    var body = renderPoolGroupTabs(entries);
    body += renderEntryGrid(visibleEntries, {
      empty: emptyText,
      meta: function (e) {
        var parts = [];
        if (e.group_key) parts.push(e.group_key);
        if (e.seed_no) parts.push('#' + Number(e.seed_no));
        if (e.votes != null) parts.push(Number(e.votes || 0) + '票');
        if (e.source_result_rank) parts.push('R' + Number(e.source_result_rank));
        return parts.join(' · ');
      }
    });
    if (canRebuild) {
      body += '<div class="workbench-flow-actions"><button class="stage-btn primary" data-rebuild-flow>生成海选池并打开海选</button></div>';
    }
    return renderWorkbenchSection(title, stage, body, hint);
  }

  function renderPoolContent() {
    var content = $('poolContent');
    if (!content || !state.selected) return;
    updatePoolPipeline(state.selected);
    var isMoe = state.selected.project_type === 'moe';
    var stageTypes = isMoe ? ['qualifier', 'bracket', 'final'] : ['qualifier', 'group_vote', 'final'];
    var stagesToLoad = stageTypes.map(getStageByType).filter(Boolean).filter(function (stage) {
      return !state.stageEntriesCache[String(stage.id)];
    });
    if (stagesToLoad.length) {
      content.innerHTML = '<div style="text-align:center;padding:20px;color:var(--am-text-secondary);font-size:13px;">加载阶段池...</div>';
      Promise.all(stagesToLoad.map(function (stage) { return loadStageEntries(stage.id); })).then(function () {
        renderPoolContent();
      });
      return;
    }
    var validTabs = ['all'];
    stageTypes.map(getStageByType).filter(Boolean).forEach(function (stage) { validTabs.push(String(stage.id)); });
    if (validTabs.indexOf(String(state.poolStageTab)) === -1) {
      state.poolStageTab = 'all';
      state.poolGroupTab = 'all';
    }
    var activeCount = state.entries.filter(function (e) { return e.entry_status !== 'removed' && e.entry_status !== 'rejected'; }).length;
    var qualifier = getStageByType('qualifier');
    var middle = isMoe ? getStageByType('bracket') : getStageByType('group_vote');
    var finalStage = getStageByType('final');
    var counts = [
      '提名 ' + activeCount,
      '海选 ' + (qualifier ? (state.stageEntriesCache[String(qualifier.id)] || []).length : 0),
      (isMoe ? '淘汰赛 ' : '分组 ') + (middle ? (state.stageEntriesCache[String(middle.id)] || []).length : 0),
      '决赛 ' + (finalStage ? (state.stageEntriesCache[String(finalStage.id)] || []).length : 0)
    ];
    var stats = $('poolStats');
    if (stats) stats.textContent = counts.join(' · ');
    var activeType = stageTypeForTab(state.poolStageTab);
    var body = '';
    if (activeType === 'nomination') {
      body = renderNominationWorkbench();
    } else if (activeType === 'qualifier') {
      body = renderStageWorkbench('海选池', 'qualifier', '从剩余有效提名自动生成，用户投票只读取这里的候选。');
    } else if (activeType === 'bracket') {
      body = renderStageWorkbench('淘汰赛池', 'bracket', '海选结算后播种，生成 1v1 对阵。') + renderMoeMatchesWorkbench();
    } else if (activeType === 'group_vote') {
      body = renderStageWorkbench('分组投票', 'group_vote', '海选结算后按后端 group_key 分组。');
    } else if (activeType === 'final') {
      body = renderStageWorkbench('决赛池', 'final', '上一阶段结算后播种最终候选。') + renderMoeMatchesWorkbench();
    }
    content.innerHTML = renderPoolStageTabs() + body;
    bindPoolTabEvents();
    bindPoolEvents();
    renderMatchContent();
  }

  function renderMoeMatchesWorkbench() {
    var activeType = stageTypeForTab(state.poolStageTab);
    var title = activeType === 'final' ? '决赛对阵' : '淘汰赛对阵';
    var hint = activeType === 'final' ? '冠军赛和季军赛在这里结算。' : '按轮次查看状态，平票或缺槽场次需要人工指定胜者。';
    return '<section class="workbench-section"><div class="workbench-section-header"><div><h4>' + esc(title) + '</h4><p>' + esc(hint) + '</p></div><button class="stage-btn primary" id="generateMatchesBtn">生成对阵</button></div><div id="matchContent" class="workbench-match-list"><div class="workbench-empty">暂无对阵数据</div></div></section>';
  }

  function bindPoolTabEvents() {
    document.querySelectorAll('[data-stage-tab]').forEach(function (el) {
      el.addEventListener('click', function () {
        var tabId = this.dataset.stageTab;
        if (tabId === state.poolStageTab) return;
        state.poolStageTab = tabId;
        state.poolGroupTab = 'all';
        state.poolPage = 1;
        renderPoolContent();
      });
    });
  }

  function bindPoolEvents() {
    document.querySelectorAll('[data-pool-filter]').forEach(function (el) {
      el.addEventListener('click', function () {
        state.poolFilter = this.dataset.poolFilter;
        state.poolPage = 1;
        renderPoolContent();
      });
    });

    document.querySelectorAll('[data-pool-group]').forEach(function (el) {
      el.addEventListener('click', function () {
        state.poolGroupTab = this.dataset.poolGroup || 'all';
        renderPoolContent();
      });
    });

    document.querySelectorAll('.nomination-pool-item').forEach(function (el) {
      el.addEventListener('click', function () {
        togglePoolEntry(this.dataset.entryId);
      });
    });

    var searchInput = $('nominationSearchInput');
    if (searchInput) searchInput.addEventListener('input', function () {
      state.nominationQuery = this.value.trim();
      renderPoolContent();
    });

    document.querySelectorAll('[data-rebuild-flow]').forEach(function (btn) {
      if (btn.dataset.boundRebuildFlow === '1') return;
      btn.dataset.boundRebuildFlow = '1';
      btn.addEventListener('click', function () { rebuildFlowFromNomination(btn); });
    });

    document.querySelectorAll('[data-flow-action]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        runFlowAction(this.dataset.flowAction, this.dataset.poolId, btn);
      });
    });

    document.querySelectorAll('[data-workbench-stage-action]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var action = this.dataset.workbenchStageAction;
        var id = this.dataset.stageId;
        post('../api/vote_stages.php?action=' + action + '&id=' + encodeURIComponent(id), {}).then(function (data) {
          var msg = data.success ? '阶段已更新' : (data.message || '操作失败');
          if (data.success && action === 'open' && data.seeded_count != null) msg += ' · 候选 ' + Number(data.seeded_count);
          if (data.success && action === 'settle' && data.advanced_count != null) msg += ' · 晋级 ' + Number(data.advanced_count);
          toast(msg);
          if (state.selected) selectProject(state.selected.id);
        });
      });
    });

    var selectAllBtn = $('poolSelectAll');
    if (selectAllBtn) selectAllBtn.addEventListener('click', function () {
      var allIds = state.entries.filter(function (e) { return e.entry_status !== 'removed'; }).map(function (e) { return Number(e.id); });
      setSelectedEntryIds(allIds);
      renderPoolContent();
    });

    var restoreBtn = $('poolRestore');
    if (restoreBtn) restoreBtn.addEventListener('click', function () {
      var ids = getSelectedEntryIds();
      if (!ids.length) { toast('请先选择条目'); return; }
      Promise.all(ids.map(function (id) {
        return post('../api/vote_nominations.php?action=restore', { entry_id: id });
      })).then(function () {
        toast('已恢复');
        if (state.selected) selectProject(state.selected.id);
      });
    });

    var removeBtn = $('poolRemove');
    if (removeBtn) removeBtn.addEventListener('click', function () {
      var ids = getSelectedEntryIds();
      if (!ids.length) { toast('请先选择条目'); return; }
      Promise.all(ids.map(function (id) {
        return post('../api/vote_nominations.php?action=remove', { entry_id: id });
      })).then(function () {
        setSelectedEntryIds([]);
        toast('已移除');
        if (state.selected) selectProject(state.selected.id);
      });
    });

    var expandBtn = $('poolExpand');
    if (expandBtn) expandBtn.addEventListener('click', function () {
      state.poolPage++;
      renderPoolContent();
    });

    var showAll = $('poolShowAll');
    if (showAll) showAll.addEventListener('click', function () {
      state.poolPage = Math.ceil(state.entries.length / POOL_PAGE_SIZE) + 1;
      renderPoolContent();
    });
  }

  /* ===== Match Card ===== */
  function renderMatchCard() {
    return '<div class="card" id="matchCard"><div class="card-header"><span>萌战对阵</span><button class="stage-btn primary" id="generateMatchesBtn">生成对阵</button></div><div class="card-body" id="matchContent"><div style="text-align:center;padding:20px;color:var(--am-text-secondary);font-size:13px;">暂无对阵数据</div></div></div>';
  }

  function renderTwelveSettleCard() {
    return '<div class="card"><div class="card-header"><span>阶段结算</span></div><div class="card-body"><div style="text-align:center;padding:20px;color:var(--am-text-secondary);font-size:13px;">各阶段结算后根据投票/评分自动产生晋级作品。</div></div></div>';
  }

  function renderMatchContent() {
    var host = $('matchContent');
    if (!host) return;
    var activeType = stageTypeForTab(state.poolStageTab);
    var activeStage = activeType === 'bracket' || activeType === 'final' ? getStageByType(activeType) : null;
    var matches = activeStage
      ? state.matches.filter(function (m) { return Number(m.stage_id) === Number(activeStage.id); })
      : state.matches;
    bindGenerateMatchesButton();
    if (!matches.length) {
      host.innerHTML = '<div class="workbench-empty">暂无对阵数据</div>';
      return;
    }
    var issueMap = {};
    (state.lastSettleIssues || []).forEach(function (issue) {
      issueMap[Number(issue.match_id)] = issue;
    });
    var rounds = {};
    matches.forEach(function (m) {
      var roundNo = Number(m.round_no || 1);
      if (!rounds[roundNo]) rounds[roundNo] = [];
      rounds[roundNo].push(m);
    });
    var html = Object.keys(rounds).sort(function (a, b) { return Number(a) - Number(b); }).map(function (roundKey) {
      var rows = rounds[roundKey];
      var openCount = rows.filter(function (m) { return m.status === 'open'; }).length;
      var settledCount = rows.filter(function (m) { return m.status === 'settled'; }).length;
      var pendingCount = rows.length - openCount - settledCount;
      var roundTitle = activeType === 'final'
        ? (Number(roundKey) === 1 ? '冠军赛' : '季军赛')
        : '第 ' + Number(roundKey) + ' 轮';
      var body = rows.map(function (m) {
        var a = esc(m.slot_a_title_cn || m.slot_a_title || '待定');
        var b = esc(m.slot_b_title_cn || m.slot_b_title || '待定');
        var issue = issueMap[Number(m.id)];
        var issueText = issue ? (issue.reason === 'tie' ? '平票待处理' : '缺槽待处理') : '';
        var missingSlot = !Number(m.slot_a_entry_id || 0) || !Number(m.slot_b_entry_id || 0);
        var controls = m.status === 'settled'
          ? '<span class="stage-status open">胜者：' + esc(m.winner_title_cn || m.winner_title || m.winner_entry_id || '') + '</span>'
          : '<span class="stage-actions"><button class="stage-btn success" data-match-winner="' + Number(m.id) + '" data-winner-id="' + Number(m.slot_a_entry_id || 0) + '"' + (!Number(m.slot_a_entry_id || 0) ? ' disabled' : '') + '>' + a + ' 胜</button><button class="stage-btn success" data-match-winner="' + Number(m.id) + '" data-winner-id="' + Number(m.slot_b_entry_id || 0) + '"' + (!Number(m.slot_b_entry_id || 0) ? ' disabled' : '') + '>' + b + ' 胜</button></span>';
        return '<div style="display:grid;grid-template-columns:64px 1fr auto auto;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--am-card-border);opacity:' + (missingSlot && m.status !== 'settled' ? '.65' : '1') + ';">' +
          '<strong style="font-size:12px;">R' + Number(m.round_no) + '-' + Number(m.match_no) + '</strong>' +
          '<span style="font-size:13px;">' + a + ' vs ' + b + (issueText ? '<em style="font-style:normal;color:#d97706;margin-left:8px;">' + esc(issueText) + '</em>' : '') + '</span>' +
          '<span class="stage-status ' + (m.status === 'open' ? 'open' : 'pending') + '">' + esc(m.status) + '</span>' +
          controls +
        '</div>';
      }).join('');
      return '<div style="padding:10px 0 4px;"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">' +
        '<strong style="font-size:13px;">' + esc(roundTitle) + '</strong>' +
        '<span style="font-size:11px;color:var(--am-text-secondary);">投票中 ' + openCount + ' · 已结算 ' + settledCount + ' · 待开放 ' + pendingCount + '</span>' +
      '</div>' + body + '</div>';
    }).join('');
    if (state.lastSettleIssues && state.lastSettleIssues.length) {
      html = '<div style="margin-bottom:10px;padding:8px 10px;border:1px solid rgba(217,119,6,.25);background:rgba(217,119,6,.08);border-radius:8px;font-size:12px;color:#92400e;">有 ' + state.lastSettleIssues.length + ' 场平票/缺槽，需要人工指定胜者。</div>' + html;
    }
    host.innerHTML = html;
    bindMatchWinnerButtons();

  }

  function bindMatchWinnerButtons() {
    document.querySelectorAll('[data-match-winner]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        settleMatch(this.dataset.matchWinner, this.dataset.winnerId);
      });
    });
  }

  function bindGenerateMatchesButton() {
    var genBtn = $('generateMatchesBtn');
    if (genBtn) genBtn.addEventListener('click', function () {
      if (!state.selected) return;
      var activeType = stageTypeForTab(state.poolStageTab);
      var stage = (activeType === 'bracket' || activeType === 'final') ? getStageByType(activeType) : null;
      if (!stage) stage = state.stages.find(function (s) { return s.stage_type === 'bracket'; }) || state.stages.find(function (s) { return s.vote_mode === 'match_single'; });
      if (!stage) { toast('该企划没有 1v1 阶段'); return; }
      var config = parseConfig(stage.config_json);
      var size = Number(config.bracket_size || stage.advance_count || 16);
      post('../api/vote_matches.php?action=generate', { stage_id: Number(stage.id), size: size }).then(function (data) {
        toast(data.success ? '对阵已生成' : (data.message || '生成失败'));
        if (state.selected) selectProject(state.selected.id);
      });
    });
  }

  function settleMatch(matchId, winnerId) {
    winnerId = Number(winnerId);
    if (!winnerId) { toast('该槽位还没有条目'); return; }
    post('../api/vote_matches.php?action=settle&id=' + encodeURIComponent(matchId), { winner_entry_id: winnerId }).then(function (data) {
      toast(data.success ? '对阵已结算' : (data.message || '结算失败'));
      if (state.selected) selectProject(state.selected.id);
    });
  }

  /* ===== Awards Card ===== */
  function renderAwardsCard() {
    return '<div class="card" id="awardsCard"><div class="card-header"><span>奖项设置</span><span style="font-size:11px;color:var(--am-text-secondary);font-weight:400;">决赛结算后记录</span></div><div class="card-body"><div class="awards-row">' +
      '<div class="award-slot gold"><svg width="28" height="28" viewBox="0 0 48 48" fill="none" style="margin-bottom:4px;"><path d="M24 6L30 14L40 18L32 26L34 36L24 30L14 36L16 26L8 18L18 14L24 6Z" stroke="#c7932b" stroke-width="1.5" fill="rgba(199,147,43,0.15)"/><circle cx="24" cy="22" r="8" stroke="#c7932b" stroke-width="1" fill="none"/></svg><div class="award-title gold">冠军 · 萌王</div><div class="award-value" id="championName">待定</div></div>' +
      '<div class="award-slot silver"><svg width="26" height="26" viewBox="0 0 48 48" fill="none" style="margin-bottom:4px;"><path d="M24 8L28 18L38 20L30 28L32 38L24 32L16 38L18 28L10 20L20 18L24 8Z" stroke="#98a0b0" stroke-width="1.5" fill="rgba(160,160,180,0.1)"/></svg><div class="award-title silver">亚军</div><div class="award-value" id="runnerUpName">待定</div></div>' +
      '<div class="award-slot bronze"><svg width="24" height="24" viewBox="0 0 48 48" fill="none" style="margin-bottom:4px;"><path d="M24 10L26 20L34 22L27 28L28 38L24 34L20 38L21 28L14 22L22 20L24 10Z" stroke="#b08860" stroke-width="1.5" fill="rgba(180,140,100,0.08)"/></svg><div class="award-title bronze">季军</div><div class="award-value" id="thirdPlaceName">待定</div></div>' +
    '</div></div></div>';
  }

  function loadCurrentMoeKing() {
    if (!state.selected || state.selected.project_type !== 'moe') return;
    var finalStage = getStageByType('final');
    if (finalStage) {
      api('../api/vote_votes.php?action=results&stage_id=' + encodeURIComponent(finalStage.id)).then(function (result) {
        var rows = (result && result.data) || [];
        if (rows.length && ((result && result.stage_status) === 'settled' || finalStage.status === 'settled')) {
          renderMoeAwardsFromResults(rows);
          syncChampionToMoeKing(rows[0]);
          return;
        }
        loadStoredMoeKing();
      }).catch(loadStoredMoeKing);
      return;
    }
    loadStoredMoeKing();
  }

  function loadStoredMoeKing() {
    if (!state.selected || state.selected.project_type !== 'moe') return;
    api('../api/club_moe_king.php?action=get&club_id=' + encodeURIComponent(state.selected.club_id) + '&country=' + encodeURIComponent(state.selected.country || 'china')).then(function (data) {
      if (data.success && data.data) {
        var el = $('championName');
        if (el) el.textContent = data.data.name_cn || data.data.name;
      }
    }).catch(function () {});
  }

  function renderMoeAwardsFromResults(rows) {
    var champion = rows.find(function (r) { return Number(r.rank_no) === 1; }) || rows[0];
    var runner = rows.find(function (r) { return Number(r.rank_no) === 2; }) || rows[1];
    var third = rows.find(function (r) { return Number(r.rank_no) === 3; }) || rows[2];
    setAwardText('championName', champion);
    setAwardText('runnerUpName', runner);
    setAwardText('thirdPlaceName', third);
  }

  function setAwardText(id, row) {
    var el = $(id);
    if (!el) return;
    el.textContent = row ? (row.title_cn || row.title || ('#' + row.entry_id)) : '待定';
  }

  function syncChampionToMoeKing(row) {
    if (!state.selected || !row) return;
    var key = state.selected.id + ':' + Number(row.entry_id || row.id || 0);
    if (!Number(row.rank_no || 0) || Number(row.rank_no) !== 1 || state.moeAwardSyncKey === key) return;
    state.moeAwardSyncKey = key;
    post('../api/club_moe_king.php?action=set', {
      club_id: Number(state.selected.club_id),
      country: state.selected.country || 'china',
      character_id: Number(row.source_id || row.entry_id || row.id || 0),
      name: row.title || row.title_cn || ('entry-' + Number(row.entry_id || row.id || 0)),
      name_cn: row.title_cn || row.title || '',
      image_url: row.image_url || '',
      summary: row.summary || '由萌战决赛结果自动同步'
    }).then(function (data) {
      if (!data || !data.success) toast((data && data.message) || '萌王同步失败');
    }).catch(function () {
      toast('萌王同步失败');
    });
  }

  /* ===== Global Click Delegation ===== */
  document.addEventListener('click', function (event) {
    var item = event.target.closest('[data-project-id]');
    if (item) selectProject(item.dataset.projectId);
  });

  /* ===== Init ===== */
  $('createYear').value = String(new Date().getFullYear());
  loadClubData().then(loadManageable);
})();
