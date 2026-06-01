(function () {
  'use strict';
  var $ = $vote, esc = escVote, api = apiVote, post = postVote, toast = function (m) { toastVote($('toast'), m); };

  // State
  var HUB_STATE = { filter: 'running', page: 1, projects: [], total: 0 };
  var CONTEST_STATE = { project: null, stages: [], currentStage: null, works: [], myVotes: {}, myScores: {}, myNominations: [], groups: [], currentGroup: 0, resultRows: [], resultMap: {} };

  // Stage display config
  var STAGE_META = {
    nomination:  { label: '提名期', color: 'nomination' },
    qualifier:   { label: '海选', color: 'qualifier' },
    group_vote:  { label: '分组投票', color: 'group_vote' },
    final:       { label: '最终十二器', color: 'final' }
  };

  // Cover gradient presets (8 colors)
  var COVER_GRADIENTS = [
    'linear-gradient(135deg,#dbeafe,#bfdbfe)', 'linear-gradient(135deg,#ede9fe,#d8cef8)',
    'linear-gradient(135deg,#fefce8,#fef08a)', 'linear-gradient(135deg,#f1f5f9,#e2e8f0)',
    'linear-gradient(135deg,#e8f5e9,#c8e6c9)', 'linear-gradient(135deg,#fff3e0,#ffe0b2)',
    'linear-gradient(135deg,#f3e5f5,#e1bee7)', 'linear-gradient(135deg,#ccfbf1,#99f6e4)'
  ];

  function coverGradient(idx) { return COVER_GRADIENTS[idx % 8]; }

  // Determine page mode
  function isHub() { return !!document.getElementById('twCardList'); }

  // Check mark SVG
  var CHECK_SVG = '<svg width="7" height="7" viewBox="0 0 16 16" fill="none" stroke="#fff" stroke-width="3"><polyline points="3,8 7,12 13,4"/></svg>';

  // ==================== HUB ====================
  function initHub() {
    var chips = document.getElementById('twChips');
    if (chips) {
      chips.addEventListener('click', function (e) {
        var chip = e.target.closest('.tw-chip');
        if (!chip) return;
        var all = chips.querySelectorAll('.tw-chip');
        for (var i = 0; i < all.length; i++) all[i].classList.remove('active');
        chip.classList.add('active');
        HUB_STATE.filter = chip.dataset.status;
        HUB_STATE.page = 1;
        loadHubProjects();
      });
    }
    var loadMore = document.getElementById('twLoadMore');
    if (loadMore) {
      loadMore.addEventListener('click', function () {
        HUB_STATE.page++;
        loadHubProjects(true);
      });
    }
    loadHubProjects();
  }

  function loadHubProjects(append) {
    if (!append) document.getElementById('twCardList').innerHTML = '<div class="tw-loading">加载中...</div>';
    var params = '?action=list&project_type=twelve&status=' + HUB_STATE.filter + '&page=' + HUB_STATE.page;
    api('../api/twelve_contests.php' + params).then(function (data) {
      var projects = (data && data.data) || [];
      if (!projects.length) {
        if (!append) document.getElementById('twCardList').innerHTML = '<div class="tw-empty">暂无活动</div>';
        return;
      }
      HUB_STATE.total = data.total || projects.length;
      HUB_STATE.projects = append ? HUB_STATE.projects.concat(projects) : projects;
      renderHubCards(projects, append);
      document.getElementById('twLoadMore').style.display = (projects.length >= 20) ? '' : 'none';
      updateHubStats();
    }).catch(function () {
      document.getElementById('twCardList').innerHTML = '<div class="tw-empty">加载失败，请刷新重试</div>';
    });
  }

  function renderHubCards(projects, append) {
    var list = document.getElementById('twCardList');
    if (!append) list.innerHTML = '';
    if (!projects.length && !append) {
      list.innerHTML = '<div class="tw-empty">暂无活动</div>'; return;
    }
    for (var i = 0; i < projects.length; i++) {
      var p = projects[i];
      var stageType = (p.current_stage && p.current_stage.stage_type) || 'nomination';
      var meta = STAGE_META[stageType] || STAGE_META.nomination;
      var isEnded = p.status === 'ended';
      var card = document.createElement('div');
      card.className = 'tw-card' + (isEnded ? ' tw-card--dim' : '');
      card.setAttribute('data-id', p.id);
      card.innerHTML =
        '<div class="tw-card-bar ' + meta.color + '"></div>' +
        '<div class="tw-card-body">' +
          '<div class="tw-card-row">' +
            '<span class="tw-card-tag">十二器</span>' +
            '<span class="tw-card-club">同好会 #' + esc(p.club_id) + '</span>' +
            '<span class="tw-card-stage ' + meta.color + '">' + meta.label + '</span>' +
          '</div>' +
          '<div class="tw-card-title">' + esc(p.title) + '</div>' +
          '<div class="tw-card-desc">' + buildHubDesc(p) + '</div>' +
        '</div>';
      card.addEventListener('click', function () {
        window.location.href = 'contest.html?id=' + this.getAttribute('data-id');
      });
      list.appendChild(card);
    }
  }

  function buildHubDesc(p) {
    var parts = [];
    var stage = p.current_stage;
    if (stage) {
      if (stage.stage_type !== 'nomination') {
        parts.push((p.entry_count || '多') + '部作品参选');
      }
    }
    if (stage && stage.end_time) {
      var remaining = Math.max(0, Math.ceil((new Date(stage.end_time) - Date.now()) / 86400000));
      parts.push('剩余 ' + remaining + ' 天');
    }
    return parts.join(' · ') || '即将开始';
  }

  function updateHubStats() {
    api('../api/twelve_contests.php?action=list&project_type=twelve&status=running').then(function (d) {
      var el = document.getElementById('twStatRunning');
      if (el) el.textContent = (d && d.data) ? d.data.length : 0;
    }).catch(function () {});
    api('../api/twelve_contests.php?action=list&project_type=twelve').then(function (d) {
      var el1 = document.getElementById('twStatTotal');
      var el2 = document.getElementById('twStatClubs');
      if (el1) el1.textContent = (d && d.data) ? d.data.length : 0;
      if (el2) el2.textContent = (d && d.data) ? d.data.map(function (p) { return p.club_id; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).length : 0;
    }).catch(function () {});
  }

  // ==================== CONTEST ====================
  function initContest() {
    var id = new URLSearchParams(window.location.search).get('id');
    if (!id) { document.getElementById('twContestContent').innerHTML = '<div class="tw-empty">缺少活动ID</div>'; return; }
    bindSubmit();
    loadContestData(id);
  }

  function loadContestData(projectId) {
    api('../api/twelve_contests.php?action=get&project_id=' + projectId).then(function (data) {
      if (!data || !data.data) {
        document.getElementById('twContestContent').innerHTML = '<div class="tw-empty">活动不存在</div>'; return;
      }
      CONTEST_STATE.project = data.data;
      document.getElementById('twContestTitle').textContent = data.data.title;
      loadContestStages(projectId);
    }).catch(function () {
      document.getElementById('twContestContent').innerHTML = '<div class="tw-empty">加载失败，请刷新重试</div>';
    });
  }

  function loadContestStages(projectId) {
    api('../api/twelve_rounds.php?action=list&project_id=' + projectId).then(function (data) {
      CONTEST_STATE.stages = (data && data.data) || [];
      var openStage = null;
      for (var i = 0; i < CONTEST_STATE.stages.length; i++) {
        if (CONTEST_STATE.stages[i].status === 'open') { openStage = CONTEST_STATE.stages[i]; break; }
      }
      if (!openStage) {
        var resultStage = null;
        for (var j = CONTEST_STATE.stages.length - 1; j >= 0; j--) {
          if (CONTEST_STATE.stages[j].status === 'settled' || CONTEST_STATE.stages[j].status === 'reviewing') { resultStage = CONTEST_STATE.stages[j]; break; }
        }
        if (resultStage) {
          CONTEST_STATE.currentStage = resultStage;
          renderStageResults(resultStage);
          return;
        }
        document.getElementById('twContestContent').innerHTML = '<div class="tw-empty">当前没有进行中的阶段</div>';
        return;
      }
      CONTEST_STATE.currentStage = openStage;
      document.getElementById('twContestSub').textContent =
        (STAGE_META[openStage.stage_type] || {}).label + ' · 剩余计算中...';
      renderStage(openStage);
    }).catch(function () {
      document.getElementById('twContestContent').innerHTML = '<div class="tw-empty">加载失败</div>';
    });
  }

  function renderStage(stage) {
    if (stage.vote_mode === 'score' && stage.stage_type !== 'nomination') {
      renderScoreVoting(stage);
      return;
    }
    switch (stage.stage_type) {
      case 'nomination': renderNomination(stage); break;
      case 'qualifier': renderVoting(stage); break;
      case 'group_vote': renderGroupVote(stage); break;
      case 'final': renderFinal(stage); break;
      default: document.getElementById('twContestContent').innerHTML = '<div class="tw-empty">未知阶段类型</div>';
    }
  }

  // ==================== NOMINATION ====================
  function renderNomination(stage) {
    var maxNoms = Number(stage.max_select) || 1;
    var content = document.getElementById('twContestContent');
    content.innerHTML =
      '<div class="tw-action">' +
        '<div class="tw-action-row">' +
          '<input class="tw-action-input" id="twNomSearch" placeholder="搜索作品名，如 沙耶の唄" autocomplete="off">' +
          '<button class="tw-btn tw-btn--blue" id="twNomBtn">搜索</button>' +
        '</div>' +
        '<div class="tw-action-hint">每人可提名 <strong style="color:var(--tw-blue)">' + maxNoms + '</strong> 个作品 · 已提名 <strong style="color:var(--tw-blue)" id="twNomCount">0</strong> 个</div>' +
      '</div>' +
      '<div class="tw-search-results" id="twSearchResults" style="display:none;"></div>' +
      '<div class="tw-nom-list" id="twNomList">' +
        '<div class="tw-nom-empty">尚未提名，请搜索并提交作品</div>' +
      '</div>';

    loadMyNominations(stage);

    document.getElementById('twNomBtn').addEventListener('click', function () {
      var q = document.getElementById('twNomSearch').value.trim();
      if (!q) { toast('请输入作品名'); return; }
      searchAndNominate(q, stage);
    });

    // Enter key in search input triggers search
    document.getElementById('twNomSearch').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        var q = this.value.trim();
        if (!q) { toast('请输入作品名'); return; }
        searchAndNominate(q, stage);
      }
    });
  }

  function loadMyNominations(stage) {
    return api('../api/twelve_works.php?action=my_nominations&contest_id=' + CONTEST_STATE.project.id).then(function (data) {
      var noms = data.data || [];
      CONTEST_STATE.myNominations = noms;
      var list = document.getElementById('twNomList');
      var countEl = document.getElementById('twNomCount');
      if (countEl) countEl.textContent = noms.length;
      if (!list) return;
      if (!noms.length) {
        list.innerHTML = '<div class="tw-nom-empty">尚未提名，请搜索并提交作品</div>';
        return;
      }
      list.innerHTML = '';
      for (var i = 0; i < noms.length; i++) {
        var n = noms[i];
        var item = document.createElement('div');
        item.className = 'tw-nom-item';
        item.innerHTML =
          '<div class="tw-nom-cover" style="background:' + (n.image_url ? 'url(' + esc(n.image_url) + ') center/cover' : coverGradient(i)) + '"></div>' +
          '<div class="tw-nom-info">' +
            '<div class="tw-nom-name">' + esc(n.title) + '</div>' +
            '<div class="tw-nom-meta">' + esc(n.subtitle || '') + '</div>' +
          '</div>' +
          '<span class="tw-nom-status ' + (n.status || 'pending') + '">' + esc(n.status || '待审核') + '</span>' +
          '<button class="tw-nom-remove" data-entry-id="' + Number(n.entry_id) + '" title="撤销提名">&times;</button>';
        list.appendChild(item);
      }
      // Bind withdraw handlers
      var removeBtns = list.querySelectorAll('.tw-nom-remove');
      for (var r = 0; r < removeBtns.length; r++) {
        removeBtns[r].addEventListener('click', function (e) {
          e.stopPropagation();
          var entryId = this.getAttribute('data-entry-id');
          if (!entryId) return;
          if (!confirm('确定撤销该提名吗？')) return;
          post('../api/twelve_works.php?action=withdraw_nomination', { entry_id: Number(entryId), contest_id: CONTEST_STATE.project.id }).then(function (r) {
            if (r && r.success) {
              toast('已撤销提名');
              loadMyNominations(CONTEST_STATE.currentStage);
            } else {
              toast((r && r.message) || '撤销失败');
            }
          }).catch(function () { toast('撤销失败'); });
        });
      }
    }).catch(function () {
      var countEl = document.getElementById('twNomCount');
      if (countEl) countEl.textContent = '加载失败';
    });
  }

  function searchAndNominate(keyword, stage) {
    var panel = document.getElementById('twSearchResults');
    // Fallback: create panel if it doesn't exist
    if (!panel) {
      var nomList = document.getElementById('twNomList');
      if (!nomList) return;
      panel = document.createElement('div');
      panel.id = 'twSearchResults';
      panel.className = 'tw-search-results';
      nomList.parentNode.insertBefore(panel, nomList);
    }
    panel.style.display = '';
    panel.innerHTML = '<div class="tw-nom-empty">搜索中...</div>';

    api('../api/bangumi_proxy.php?action=search_subject&type=4&keyword=' + encodeURIComponent(keyword)).then(function (data) {
      var results = (data && data.data) || [];
      results = results.slice(0, 12);
      if (!results.length) {
        panel.innerHTML = '<div class="tw-nom-empty">未找到匹配作品，请尝试其他关键词</div>';
        return;
      }
      renderSearchResults(results, stage);
    }).catch(function (err) {
      panel.innerHTML = '<div class="tw-nom-empty">搜索失败：网络异常或服务器未响应</div>';
    });
  }

  function renderSearchResults(results, stage) {
    var panel = document.getElementById('twSearchResults');
    if (!panel) return;

    var maxNoms = Number(stage.max_select) || 1;
    var currentCount = CONTEST_STATE.myNominations.length;
    var remaining = Math.max(0, maxNoms - currentCount);

    var html = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;padding:0 4px;">' +
      '<span style="font-size:11px;color:var(--tw-muted);">搜索到 <strong>' + results.length + '</strong> 个结果' + (remaining > 0 ? '（还可提名 <strong>' + remaining + '</strong> 个）' : '（已达上限）') + '</span>' +
      '<button style="font-size:10px;padding:3px 10px;border:1px solid var(--tw-border-light);border-radius:8px;background:var(--tw-card);color:var(--tw-muted);cursor:pointer;" id="twClearSearch">清除结果</button>' +
      '</div>';

    for (var i = 0; i < results.length; i++) {
      var work = results[i];
      var year = work.air_date ? String(work.air_date).slice(0, 4) : '';
      html +=
        '<div class="tw-nom-item tw-nom-search-result" style="cursor:pointer;" data-idx="' + i + '">' +
          '<div class="tw-nom-cover" style="background:' + (work.image_url ? 'url(' + esc(work.image_url) + ') center/cover' : coverGradient(i)) + '"></div>' +
          '<div class="tw-nom-info">' +
            '<div class="tw-nom-name">' + esc(work.title_cn || work.title || '') + '</div>' +
            '<div class="tw-nom-meta">' + esc(work.title && work.title_cn ? work.title : '') + (year ? ' · ' + year : '') + '</div>' +
          '</div>' +
          '<span class="tw-nom-status" style="background:var(--tw-blue);color:#fff;font-size:9px;padding:2px 8px;border-radius:10px;">提名</span>' +
        '</div>';
    }
    panel.innerHTML = html;

    // Bind click handlers after setting innerHTML
    var items = panel.querySelectorAll('.tw-nom-search-result');
    for (var j = 0; j < items.length; j++) {
      (function (work, el) {
        el.addEventListener('click', function () {
          nominateWork(work, stage);
        });
      })(results[j], items[j]);
    }

    // Clear results button
    var clearBtn = document.getElementById('twClearSearch');
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        panel.style.display = 'none';
        panel.innerHTML = '';
      });
    }
  }

  function nominateWork(work, stage) {
    var maxNoms = Number(stage.max_select) || 1;
    var currentCount = CONTEST_STATE.myNominations.length;
    if (currentCount >= maxNoms) { toast('已达到最大提名数（' + maxNoms + '个）'); return; }
    var payload = {
      contest_id: CONTEST_STATE.project.id,
      title: work.title_cn || work.title || '',
      title_cn: work.title || '',
      subtitle: work.title && work.title_cn ? work.title : '',
      source_type: 'bangumi_subject',
      source_id: String(work.bangumi_id || ''),
      image_url: work.image_url || '',
      summary: work.summary || '',
      external_url: 'https://bgm.tv/subject/' + (work.bangumi_id || '')
    };
    post('../api/twelve_works.php?action=nominate', payload).then(function (r) {
      if (r && r.success) {
        toast('提名成功');
        loadMyNominations(stage);
      } else {
        toast((r && r.message) || '提名失败');
      }
    }).catch(function () {
      toast('提名提交失败');
    });
  }

  // ==================== QUALIFIER VOTING ====================
  function normalizeStageWork(row) {
    row.id = Number(row.entry_id || row.id);
    return row;
  }

  function loadStageWorks(stage) {
    return api('../api/twelve_rounds.php?action=stage_entries&stage_id=' + stage.id).then(function (data) {
      return ((data && data.data) || []).map(normalizeStageWork);
    });
  }

  function loadMyStageVotes(stage) {
    return api('../api/twelve_votes.php?action=my_votes&project_id=' + CONTEST_STATE.project.id).then(function (data) {
      var rows = (data && data.data) || [];
      return rows.filter(function (v) { return Number(v.stage_id) === Number(stage.id); });
    }).catch(function () {
      return [];
    });
  }

  function loadStageResults(stage) {
    return api('../api/twelve_votes.php?action=results&stage_id=' + stage.id).then(function (data) {
      var rows = (data && data.data) || [];
      var map = {};
      for (var i = 0; i < rows.length; i++) map[Number(rows[i].entry_id || rows[i].id)] = rows[i];
      CONTEST_STATE.resultRows = rows;
      CONTEST_STATE.resultMap = map;
      return data || { data: [] };
    }).catch(function (error) {
      CONTEST_STATE.resultRows = [];
      CONTEST_STATE.resultMap = {};
      return { data: [], error: error && error.message ? error.message : '结果加载失败' };
    });
  }

  function canShowVoteNumbers(stage, resultData) {
    var visibility = stage.result_visibility || (resultData && resultData.result_visibility) || 'live_rank_only';
    var status = (resultData && resultData.stage_status) || stage.status || '';
    if (visibility === 'hidden') return false;
    if (visibility === 'live_votes') return true;
    if (visibility === 'after_stage') return status === 'settled';
    if (visibility === 'after_event') return CONTEST_STATE.project && CONTEST_STATE.project.status === 'ended';
    return false;
  }

  function applyResultStats(works, rows) {
    var map = {};
    for (var i = 0; i < (rows || []).length; i++) map[Number(rows[i].entry_id || rows[i].id)] = rows[i];
    return works.map(function (work) {
      var stat = map[Number(work.id)] || {};
      work.votes = Number(stat.votes || 0);
      work.score_avg = stat.score_avg != null ? Number(stat.score_avg) : null;
      work.rank_no = stat.rank_no ? Number(stat.rank_no) : null;
      work.advanced = Number(stat.advanced || 0);
      return work;
    });
  }

  function isScoreStage(stage) {
    return stage && stage.vote_mode === 'score';
  }

  function scoreBounds(stage) {
    return {
      min: Number(stage.score_min || 1),
      max: Number(stage.score_max || 10)
    };
  }

  function selectedVoteIds() {
    return Object.keys(CONTEST_STATE.myVotes).filter(function (k) { return CONTEST_STATE.myVotes[k]; });
  }

  function renderScoreVoting(stage) {
    var maxVotes = Number(stage.max_select || 12);
    var bounds = scoreBounds(stage);
    CONTEST_STATE.myVotes = {};
    CONTEST_STATE.myScores = {};
    CONTEST_STATE.votingLocked = false;
    document.getElementById('twContestContent').innerHTML =
      '<div class="tw-action">' +
        '<div class="tw-action-hint">选择最多 <strong style="color:var(--tw-purple)">' + maxVotes + '</strong> 部作品，并为已选作品评分（' + bounds.min + '-' + bounds.max + ' 分） · 已选 <strong style="color:var(--tw-purple)" id="twVoteCount">0</strong> 部</div>' +
      '</div>' +
      '<div class="tw-work-grid" id="twScoreGrid"><div class="tw-loading" style="grid-column:1/-1">加载中...</div></div>';
    showBottomBar(stage, maxVotes);

    Promise.all([loadStageWorks(stage), loadMyStageVotes(stage), loadStageResults(stage)]).then(function (results) {
      var works = results[0] || [];
      var votes = results[1] || [];
      var resultData = results[2] || {};
      var showVotes = canShowVoteNumbers(stage, resultData);
      CONTEST_STATE.works = applyResultStats(works, resultData.data || []);
      votes.forEach(function (vote) {
        var entryId = Number(vote.entry_id);
        CONTEST_STATE.myVotes[entryId] = true;
        CONTEST_STATE.myScores[entryId] = Number(vote.score_value || bounds.max);
      });
      CONTEST_STATE.votingLocked = votes.length > 0;
      renderScoreGrid(CONTEST_STATE.works, maxVotes, bounds, CONTEST_STATE.votingLocked, showVotes);
    }).catch(function (error) {
      document.getElementById('twScoreGrid').innerHTML = '<div class="tw-empty" style="grid-column:1/-1">' + esc(error && error.message ? error.message : '评分加载失败') + '</div>';
    });
  }

  function renderScoreGrid(works, maxVotes, bounds, locked, showVotes) {
    var grid = document.getElementById('twScoreGrid');
    if (!grid) return;
    grid.innerHTML = '';
    if (!works.length) {
      grid.innerHTML = '<div class="tw-empty" style="grid-column:1/-1">阶段池尚未生成，请联系负责人</div>';
      return;
    }
    works.forEach(function (work, idx) {
      var selected = !!CONTEST_STATE.myVotes[work.id];
      var score = Number(CONTEST_STATE.myScores[work.id] || bounds.max);
      var div = document.createElement('div');
      div.className = 'tw-work-item' + (selected ? ' selected' : '');
      div.setAttribute('data-work-id', work.id);
      div.innerHTML =
        '<div class="tw-work-cover" style="background:' + (work.image_url ? 'url(' + esc(work.image_url) + ') center/cover' : coverGradient(idx)) + '">' +
          '<div class="tw-work-check">' + CHECK_SVG + '</div>' +
        '</div>' +
        '<div class="tw-work-name">' + esc(work.title) + '</div>' +
        '<div class="tw-work-brand">' + esc(work.subtitle || '') + '</div>' +
        (showVotes ? '<div class="tw-work-brand">' + (work.score_avg != null ? '均分 ' + work.score_avg.toFixed(2) : '暂无均分') + ' · ' + Number(work.votes || 0) + '票' + (work.rank_no ? ' · #' + Number(work.rank_no) : '') + '</div>' : '') +
        '<div class="tw-work-brand" style="margin-top:6px;display:' + (selected ? 'block' : 'none') + ';" data-score-panel="' + Number(work.id) + '">' +
          '<label style="display:flex;align-items:center;gap:6px;justify-content:center;">评分 <input class="tw-score-input" type="number" min="' + bounds.min + '" max="' + bounds.max + '" step="1" value="' + score + '" data-score-entry="' + Number(work.id) + '" style="width:56px;text-align:center;border:1px solid var(--tw-border-light);border-radius:8px;padding:4px;background:var(--tw-card);color:var(--tw-text);"></label>' +
        '</div>';
      div.addEventListener('click', function (event) {
        if (locked || event.target.closest('[data-score-entry]')) return;
        toggleScoreSelection(work.id, div, maxVotes, bounds);
      });
      grid.appendChild(div);
    });
    grid.querySelectorAll('[data-score-entry]').forEach(function (input) {
      input.addEventListener('input', function () {
        var entryId = Number(this.dataset.scoreEntry);
        var value = Math.max(bounds.min, Math.min(bounds.max, Number(this.value || bounds.min)));
        CONTEST_STATE.myScores[entryId] = value;
        updateBottomBar(selectedVoteIds().length, maxVotes);
      });
    });
    updateVoteCount(maxVotes);
    updateScorePanels(bounds);
    if (locked) {
      var btn = document.getElementById('twBottomSubmit');
      var hdr = document.getElementById('twHeaderSubmit');
      if (btn) { btn.disabled = true; btn.textContent = '已投票'; }
      if (hdr) { hdr.disabled = true; hdr.textContent = '已投票'; }
    }
  }

  function toggleScoreSelection(workId, el, maxVotes, bounds) {
    var count = selectedVoteIds().length;
    if (CONTEST_STATE.myVotes[workId]) {
      CONTEST_STATE.myVotes[workId] = false;
      delete CONTEST_STATE.myScores[workId];
      el.classList.remove('selected');
    } else if (count < maxVotes) {
      CONTEST_STATE.myVotes[workId] = true;
      CONTEST_STATE.myScores[workId] = Number(CONTEST_STATE.myScores[workId] || bounds.max);
      el.classList.add('selected');
    }
    updateVoteCount(maxVotes);
    updateGridDimmed('twScoreGrid', maxVotes);
    updateScorePanels(bounds);
  }

  function updateScorePanels(bounds) {
    document.querySelectorAll('[data-score-panel]').forEach(function (panel) {
      var entryId = Number(panel.getAttribute('data-score-panel'));
      panel.style.display = CONTEST_STATE.myVotes[entryId] ? 'block' : 'none';
      var input = panel.querySelector('[data-score-entry]');
      if (input && CONTEST_STATE.myVotes[entryId]) {
        var value = Number(CONTEST_STATE.myScores[entryId] || bounds.max);
        input.value = String(Math.max(bounds.min, Math.min(bounds.max, value)));
      }
    });
  }

  function renderVoting(stage) {
    var maxVotes = Number(stage.max_select || 12);
    CONTEST_STATE.myVotes = {};
    document.getElementById('twContestContent').innerHTML =
      '<div class="tw-action">' +
        '<div class="tw-action-hint">每人可选 <strong style="color:var(--tw-purple)">' + maxVotes + '</strong> 部 · 已选 <strong style="color:var(--tw-purple)" id="twVoteCount">0</strong> 部</div>' +
      '</div>' +
      '<div class="tw-work-grid" id="twVoteGrid"><div class="tw-loading" style="grid-column:1/-1">加载中...</div></div>';

    showBottomBar(stage, maxVotes);

    Promise.all([loadStageWorks(stage), loadMyStageVotes(stage), loadStageResults(stage)]).then(function (results) {
      CONTEST_STATE.works = results[0] || [];
      var votes = results[1] || [];
      var resultData = results[2] || {};
      var showVotes = canShowVoteNumbers(stage, resultData);
      CONTEST_STATE.showVotes = showVotes;
      CONTEST_STATE.works = applyResultStats(CONTEST_STATE.works, resultData.data || []);
      for (var i = 0; i < votes.length; i++) {
        CONTEST_STATE.myVotes[Number(votes[i].entry_id)] = true;
      }
      if (!CONTEST_STATE.works.length) {
        document.getElementById('twVoteGrid').innerHTML = '<div class="tw-empty" style="grid-column:1/-1">阶段池尚未生成，请联系负责人</div>';
        return;
      }
      var groups = groupWorksByKey(CONTEST_STATE.works, Number(stage.group_count || 1));
      if (groups.length > 1) {
        CONTEST_STATE.groups = groups;
        CONTEST_STATE.currentGroup = 0;
        CONTEST_STATE.votingLocked = votes.length > 0;
        document.getElementById('twContestContent').innerHTML =
          '<div class="tw-group-tabs" id="twGroupTabs"></div>' +
          '<div class="tw-action"><div class="tw-action-hint" id="twGroupHint"></div></div>' +
          '<div class="tw-work-grid--group" id="twGroupGrid"></div>';
        renderStageGroupTabs(maxVotes);
        renderGroupGrid(groups[0], maxVotes, showVotes);
        if (votes.length) {
          var btn = document.getElementById('twBottomSubmit');
          var hdr = document.getElementById('twHeaderSubmit');
          if (btn) { btn.disabled = true; btn.textContent = '已投票'; }
          if (hdr) { hdr.disabled = true; hdr.textContent = '已投票'; }
        }
        return;
      }
      renderWorkGrid(CONTEST_STATE.works, maxVotes, 'twVoteGrid', 'tw-work-grid', stage, votes.length > 0, showVotes);
    });
  }

  function renderWorkGrid(works, maxVotes, gridId, gridClass, stage, locked, showVotes) {
    var grid = document.getElementById(gridId);
    if (!grid) return;
    grid.className = gridClass;
    grid.innerHTML = '';
    if (!works.length) {
      grid.innerHTML = '<div class="tw-empty" style="grid-column:1/-1">阶段池尚未生成，请联系负责人</div>';
      return;
    }
    for (var i = 0; i < works.length; i++) {
      (function (work, idx) {
        var div = document.createElement('div');
        div.className = 'tw-work-item' + (CONTEST_STATE.myVotes[work.id] ? ' selected' : '');
        div.setAttribute('data-work-id', work.id);
        div.innerHTML =
          '<div class="tw-work-cover" style="background:' + (work.image_url ? 'url(' + esc(work.image_url) + ') center/cover' : coverGradient(idx)) + '">' +
            '<div class="tw-work-check">' + CHECK_SVG + '</div>' +
          '</div>' +
          '<div class="tw-work-name">' + esc(work.title) + '</div>' +
          '<div class="tw-work-brand">' + esc(work.subtitle || '') + '</div>' +
          (showVotes ? '<div class="tw-work-brand">票数 ' + Number(work.votes || 0) + (work.rank_no ? ' · #' + Number(work.rank_no) : '') + '</div>' : '');
        div.addEventListener('click', function () {
          if (locked) return;
          toggleWorkSelection(work.id, div, maxVotes, gridId);
        });
        grid.appendChild(div);
      })(works[i], i);
    }
    updateVoteCount(maxVotes);
    if (locked) {
      var btn = document.getElementById('twBottomSubmit');
      var hdr = document.getElementById('twHeaderSubmit');
      if (btn) { btn.disabled = true; btn.textContent = '已投票'; }
      if (hdr) { hdr.disabled = true; hdr.textContent = '已投票'; }
    }
  }

  function toggleWorkSelection(workId, el, maxVotes, gridId) {
    var count = Object.keys(CONTEST_STATE.myVotes).filter(function (k) { return CONTEST_STATE.myVotes[k]; }).length;
    if (CONTEST_STATE.myVotes[workId]) {
      CONTEST_STATE.myVotes[workId] = false;
      el.classList.remove('selected');
    } else if (count < maxVotes) {
      CONTEST_STATE.myVotes[workId] = true;
      el.classList.add('selected');
    }
    updateVoteCount(maxVotes);
    updateGridDimmed(gridId, maxVotes);
  }

  function updateVoteCount(maxVotes) {
    var count = Object.keys(CONTEST_STATE.myVotes).filter(function (k) { return CONTEST_STATE.myVotes[k]; }).length;
    var countEl = document.getElementById('twVoteCount');
    if (countEl) countEl.textContent = count;
    updateBottomBar(count, maxVotes);
  }

  function updateGridDimmed(gridId, maxVotes) {
    var grid = document.getElementById(gridId);
    if (!grid) return;
    var count = Object.keys(CONTEST_STATE.myVotes).filter(function (k) { return CONTEST_STATE.myVotes[k]; }).length;
    var items = grid.querySelectorAll('.tw-work-item');
    for (var j = 0; j < items.length; j++) {
      if (count >= maxVotes && !items[j].classList.contains('selected')) {
        items[j].classList.add('tw-work-item--dimmed');
      } else {
        items[j].classList.remove('tw-work-item--dimmed');
      }
    }
  }

  function showBottomBar(stage, maxVotes) {
    var bar = document.getElementById('twBottomBar');
    if (bar) bar.style.display = 'flex';
    updateBottomBar(0, maxVotes);
  }

  function updateBottomBar(count, maxVotes) {
    var hint = document.getElementById('twBottomHint');
    var btn = document.getElementById('twBottomSubmit');
    if (hint) hint.innerHTML = '已选 <strong style="color:var(--tw-blue)">' + count + '</strong> / ' + maxVotes;
    if (btn) {
      btn.disabled = count === 0;
      btn.style.opacity = count === 0 ? '0.5' : '1';
    }
  }

  // ==================== GROUP VOTE ====================
  function renderStageGroupTabs(maxVotes) {
    var tabs = document.getElementById('twGroupTabs');
    if (!tabs) return;
    tabs.innerHTML = '';
    for (var t = 0; t < CONTEST_STATE.groups.length; t++) {
      (function (idx) {
        var tab = document.createElement('span');
        tab.className = 'tw-group-tab' + (idx === CONTEST_STATE.currentGroup ? ' active' : '');
        tab.textContent = '第' + (idx + 1) + '组';
        tab.addEventListener('click', function () {
          CONTEST_STATE.currentGroup = idx;
          var allTabs = tabs.querySelectorAll('.tw-group-tab');
          for (var a = 0; a < allTabs.length; a++) allTabs[a].classList.remove('active');
          tab.classList.add('active');
          renderGroupGrid(CONTEST_STATE.groups[idx], maxVotes, CONTEST_STATE.showVotes);
        });
        tabs.appendChild(tab);
      })(t);
    }
  }

  function renderGroupVote(stage) {
    var maxVotes = Number(stage.max_select || 12);
    var groupCount = Number(stage.group_count || 4);
    CONTEST_STATE.myVotes = {};
    CONTEST_STATE.votingLocked = false;
    CONTEST_STATE.currentGroup = 0;

    document.getElementById('twContestContent').innerHTML =
      '<div class="tw-group-tabs" id="twGroupTabs"></div>' +
      '<div class="tw-action">' +
        '<div class="tw-action-hint" id="twGroupHint"></div>' +
      '</div>' +
      '<div class="tw-work-grid--group" id="twGroupGrid"><div class="tw-loading" style="grid-column:1/-1">加载中...</div></div>';

    Promise.all([loadStageWorks(stage), loadMyStageVotes(stage), loadStageResults(stage)]).then(function (results) {
      var works = results[0] || [];
      var votes = results[1] || [];
      var resultData = results[2] || {};
      var showVotes = canShowVoteNumbers(stage, resultData);
      works = applyResultStats(works, resultData.data || []);
      CONTEST_STATE.showVotes = showVotes;
      CONTEST_STATE.works = works;
      for (var i = 0; i < votes.length; i++) {
        CONTEST_STATE.myVotes[Number(votes[i].entry_id)] = true;
      }
      CONTEST_STATE.votingLocked = votes.length > 0;

      CONTEST_STATE.groups = groupWorksByKey(works, groupCount);

      // Render group tabs
      var tabs = document.getElementById('twGroupTabs');
      tabs.innerHTML = '';
      for (var t = 0; t < CONTEST_STATE.groups.length; t++) {
        (function (idx) {
          var tab = document.createElement('span');
          tab.className = 'tw-group-tab' + (idx === 0 ? ' active' : '');
          tab.textContent = '第' + (idx + 1) + '组';
          tab.addEventListener('click', function () {
            CONTEST_STATE.currentGroup = idx;
            var allTabs = tabs.querySelectorAll('.tw-group-tab');
            for (var a = 0; a < allTabs.length; a++) allTabs[a].classList.remove('active');
            tab.classList.add('active');
            renderGroupGrid(CONTEST_STATE.groups[idx], maxVotes, CONTEST_STATE.showVotes);
          });
          tabs.appendChild(tab);
        })(t);
      }

      if (!CONTEST_STATE.groups.length) {
        document.getElementById('twGroupGrid').innerHTML = '<div class="tw-empty" style="grid-column:1/-1">暂无候选作品</div>';
        return;
      }
      renderGroupGrid(CONTEST_STATE.groups[0], maxVotes, showVotes);
      if (votes.length) {
        var btn = document.getElementById('twBottomSubmit');
        var hdr = document.getElementById('twHeaderSubmit');
        if (btn) { btn.disabled = true; btn.textContent = '已投票'; }
        if (hdr) { hdr.disabled = true; hdr.textContent = '已投票'; }
      }
    });

    showBottomBar(stage, maxVotes);
  }

  function groupWorksByKey(works, groupCount) {
    var index = {};
    var groups = [];
    for (var i = 0; i < works.length; i++) {
      var key = works[i].group_key || ('G' + ((i % Math.max(1, groupCount)) + 1));
      if (!index[key]) {
        index[key] = [];
        groups.push(index[key]);
      }
      index[key].push(works[i]);
    }
    return groups;
  }

  function renderGroupGrid(groupWorks, maxVotes, showVotes) {
    var grid = document.getElementById('twGroupGrid');
    var hint = document.getElementById('twGroupHint');
    var gIdx = CONTEST_STATE.currentGroup;
    var totalCount = Object.keys(CONTEST_STATE.myVotes).filter(function (k) { return CONTEST_STATE.myVotes[k]; }).length;
    if (hint) hint.innerHTML = '第' + (gIdx + 1) + '组 · 总计已选 <strong style="color:var(--tw-teal)">' + totalCount + '</strong> / ' + maxVotes + ' 部';

    grid.innerHTML = '';
    if (!groupWorks.length) {
      grid.innerHTML = '<div class="tw-empty" style="grid-column:1/-1">该组暂无作品</div>';
      return;
    }
    for (var i = 0; i < groupWorks.length; i++) {
      (function (work, idx) {
        var div = document.createElement('div');
        div.className = 'tw-work-item';
        div.setAttribute('data-work-id', work.id);
        if (CONTEST_STATE.myVotes[work.id]) div.classList.add('selected');
        div.innerHTML =
          '<div class="tw-work-cover" style="background:' + (work.image_url ? 'url(' + esc(work.image_url) + ') center/cover' : coverGradient(gIdx * groupWorks.length + idx)) + '">' +
            '<div class="tw-work-check">' + CHECK_SVG + '</div>' +
          '</div>' +
          '<div class="tw-work-name">' + esc(work.title) + '</div>' +
          '<div class="tw-work-brand">' + esc(work.subtitle || '') + '</div>' +
          (showVotes ? '<div class="tw-work-brand">票数 ' + Number(work.votes || 0) + (work.rank_no ? ' · #' + Number(work.rank_no) : '') + '</div>' : '');
        div.addEventListener('click', function () {
          toggleGroupSelection(work.id, div, maxVotes);
        });
        grid.appendChild(div);
      })(groupWorks[i], i);
    }
  }

  function toggleGroupSelection(workId, el, maxVotes) {
    if (CONTEST_STATE.votingLocked) return;
    var count = Object.keys(CONTEST_STATE.myVotes).filter(function (k) { return CONTEST_STATE.myVotes[k]; }).length;
    if (CONTEST_STATE.myVotes[workId]) {
      CONTEST_STATE.myVotes[workId] = false;
      el.classList.remove('selected');
    } else if (count < maxVotes) {
      CONTEST_STATE.myVotes[workId] = true;
      el.classList.add('selected');
    }
    var newCount = Object.keys(CONTEST_STATE.myVotes).filter(function (k) { return CONTEST_STATE.myVotes[k]; }).length;
    var hint = document.getElementById('twGroupHint');
    var gIdx = CONTEST_STATE.currentGroup;
    if (hint) hint.innerHTML = '第' + (gIdx + 1) + '组 · 总计已选 <strong style="color:var(--tw-teal)">' + newCount + '</strong> / ' + maxVotes + ' 部';
    updateBottomBar(newCount, maxVotes);
    // Dim if max reached
    if (newCount >= maxVotes) {
      var items = document.getElementById('twGroupGrid').querySelectorAll('.tw-work-item');
      for (var j = 0; j < items.length; j++) {
        if (!items[j].classList.contains('selected')) items[j].classList.add('tw-work-item--dimmed');
      }
    } else {
      var items2 = document.getElementById('twGroupGrid').querySelectorAll('.tw-work-item.tw-work-item--dimmed');
      for (var k = 0; k < items2.length; k++) items2[k].classList.remove('tw-work-item--dimmed');
    }
  }

  // ==================== FINAL ====================
  function renderFinal(stage) {
    var maxVotes = Number(stage.max_select || 12);
    CONTEST_STATE.myVotes = {};

    document.getElementById('twContestContent').innerHTML =
      '<div class="tw-action">' +
        '<div style="padding:8px 12px;border-radius:10px;background:var(--tw-gold-bg);border:1px solid rgba(234,179,8,0.12);font-size:10px;color:#8a7030;display:flex;align-items:center;gap:6px;">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#eab308" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>' +
          '选出你心中最优秀的 <strong style="color:#b45309;">' + maxVotes + '部</strong> 作品 · 已选 <strong style="color:#b45309;" id="twVoteCount">0</strong> 部' +
        '</div>' +
      '</div>' +
      '<div class="tw-work-grid" id="twFinalGrid"><div class="tw-loading" style="grid-column:1/-1">加载中...</div></div>';

    // Gold-themed bottom bar
    var bar = document.getElementById('twBottomBar');
    if (bar) bar.style.display = 'flex';
    var btn = document.getElementById('twBottomSubmit');
    if (btn) { btn.className = 'tw-btn tw-btn--gold'; btn.style.background = 'linear-gradient(135deg, var(--tw-gold), #d97706)'; btn.style.fontWeight = '700'; }
    var headerBtn = document.getElementById('twHeaderSubmit');
    if (headerBtn) { headerBtn.style.display = ''; headerBtn.style.background = 'linear-gradient(135deg, var(--tw-gold), #d97706)'; }
    updateBottomBar(0, maxVotes);

    Promise.all([loadStageWorks(stage), loadMyStageVotes(stage), loadStageResults(stage)]).then(function (results) {
      CONTEST_STATE.works = results[0] || [];
      var votes = results[1] || [];
      var resultData = results[2] || {};
      var showVotes = canShowVoteNumbers(stage, resultData);
      CONTEST_STATE.works = applyResultStats(CONTEST_STATE.works, resultData.data || []);
      for (var i = 0; i < votes.length; i++) {
        CONTEST_STATE.myVotes[Number(votes[i].entry_id)] = true;
      }
      renderWorkGrid(CONTEST_STATE.works, maxVotes, 'twFinalGrid', 'tw-work-grid', stage, votes.length > 0, showVotes);
      overrideGridToGold();
    });
  }

  function overrideGridToGold() {
    var style = document.createElement('style');
    style.id = 'tw-final-gold-style';
    style.textContent =
      '.tw-work-item.selected .tw-work-cover { border-color: var(--tw-gold) !important; box-shadow: 0 2px 6px rgba(234,179,8,0.15); }' +
      '.tw-work-item.selected .tw-work-check { background: var(--tw-gold) !important; }';
    var old = document.getElementById('tw-final-gold-style');
    if (old) old.parentNode.removeChild(old);
    document.head.appendChild(style);
  }

  // ==================== SUBMIT ====================
  function bindSubmit() {
    var bottomBtn = document.getElementById('twBottomSubmit');
    if (bottomBtn) {
      bottomBtn.addEventListener('click', function () {
        var stage = CONTEST_STATE.currentStage;
        if (!stage) return;
        var selectedIds = Object.keys(CONTEST_STATE.myVotes).filter(function (k) { return CONTEST_STATE.myVotes[k]; });
        if (!selectedIds.length) { toast('请至少选择一个作品'); return; }
        var payload = {
          stage_id: Number(stage.id),
          entry_ids: selectedIds.map(Number)
        };
        if (isScoreStage(stage)) {
          var bounds = scoreBounds(stage);
          var scores = {};
          for (var i = 0; i < selectedIds.length; i++) {
            var entryId = Number(selectedIds[i]);
            var score = Number(CONTEST_STATE.myScores[entryId] || 0);
            if (score < bounds.min || score > bounds.max) {
              toast('请为已选作品填写 ' + bounds.min + '-' + bounds.max + ' 分');
              return;
            }
            scores[entryId] = score;
          }
          payload.scores = scores;
        }
        post('../api/twelve_votes.php?action=cast', payload).then(function (r) {
          if (r && r.success) {
            toast('投票成功');
            bottomBtn.disabled = true;
            bottomBtn.textContent = '已投票';
            var hdr = document.getElementById('twHeaderSubmit');
            if (hdr) { hdr.disabled = true; hdr.textContent = '已投票'; }
          } else {
            toast((r && r.message) || '投票失败');
          }
        }).catch(function (error) {
          toast(error && error.message ? error.message : '投票提交失败');
          bottomBtn.disabled = false;
        });
      });
    }

    var headerBtn = document.getElementById('twHeaderSubmit');
    if (headerBtn) {
      headerBtn.addEventListener('click', function () {
        var bb = document.getElementById('twBottomSubmit');
        if (bb) bb.click();
      });
    }
  }

  function renderStageResults(stage) {
    var content = document.getElementById('twContestContent');
    var bottom = document.getElementById('twBottomBar');
    var header = document.getElementById('twHeaderSubmit');
    if (bottom) bottom.style.display = 'none';
    if (header) header.style.display = 'none';
    content.innerHTML = '<div class="tw-loading">加载结果中...</div>';
    loadStageResults(stage).then(function (data) {
      var rows = (data && data.data) || [];
      var showVotes = canShowVoteNumbers(stage, data);
      if (!rows.length) {
        content.innerHTML = '<div class="tw-empty">暂无结算结果</div>';
        return;
      }
      var title = stage.stage_type === 'final' ? '最终十二器排行榜' : '阶段结果';
      if (stage.stage_type === 'final') rows = rows.slice(0, 12);
      var html = '<div class="tw-action"><div class="tw-action-hint">' + title + '</div></div>';
      html += '<div class="tw-work-grid">';
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        var rank = Number(row.rank_no || i + 1);
        html += '<div class="tw-work-item selected">' +
          '<div class="tw-work-cover" style="background:' + (row.image_url ? 'url(' + esc(row.image_url) + ') center/cover' : coverGradient(i)) + '">' +
            '<div class="tw-work-check">' + rank + '</div>' +
          '</div>' +
          '<div class="tw-work-name">' + esc(row.title_cn || row.title || '?') + '</div>' +
          '<div class="tw-work-brand">#' + rank + (showVotes ? ' · ' + (row.score_avg != null ? '均分 ' + Number(row.score_avg).toFixed(2) + ' · ' : '') + Number(row.votes || 0) + '票' : '') + '</div>' +
        '</div>';
      }
      html += '</div>';
      content.innerHTML = html;
    });
  }

  // ==================== INIT ====================
  if (isHub()) { initHub(); }
  else { initContest(); }
})();
