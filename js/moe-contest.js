(function () {
  'use strict';
  var $ = $vote, esc = escVote, api = apiVote, post = postVote, toast = function (m) { toastVote($('toast'), m); };

  // State
  var HUB_STATE = { filter: 'running', page: 1, projects: [], total: 0 };
  var CONTEST_STATE = { project: null, stages: [], currentStage: null, entries: [], matches: [], myVotes: {}, myNominations: [], groups: [], currentGroup: 0, resultRows: [], resultMap: {} };

  // Select mode state for batch withdraw
  var SELECT_MODE = false;
  var SELECTED_ENTRIES = new Set();

  // Stage display config
  var STAGE_META = {
    nomination:  { label: '提名阶段', color: 'nomination', cls: 'nomination' },
    qualifier:   { label: '资格赛', color: 'pool', cls: 'pool' },
    group_vote:  { label: '海选投票', color: 'pool', cls: 'pool' },
    bracket:     { label: '淘汰赛', color: 'bracket', cls: 'bracket' },
    final:       { label: '决赛', color: 'final', cls: 'final' }
  };

  // Avatar gradient presets (8 colors)
  var AVATAR_GRADIENTS = [
    'linear-gradient(135deg,#fce4ec,#f8bbd0)', 'linear-gradient(135deg,#ede9fe,#d8cef8)',
    'linear-gradient(135deg,#fefce8,#fef08a)', 'linear-gradient(135deg,#f1f5f9,#e2e8f0)',
    'linear-gradient(135deg,#e8f5e9,#c8e6c9)', 'linear-gradient(135deg,#fff3e0,#ffe0b2)',
    'linear-gradient(135deg,#f3e5f5,#e1bee7)', 'linear-gradient(135deg,#e0f2f1,#b2dfdb)'
  ];

  function avatarGradient(idx) { return AVATAR_GRADIENTS[idx % 8]; }

  // Determine page mode
  function isHub() { return !!document.getElementById('moCardList'); }

  // ==================== HUB ====================
  function initHub() {
    document.getElementById('moChips').addEventListener('click', function (e) {
      var chip = e.target.closest('.mo-chip');
      if (!chip) return;
      var chips = document.querySelectorAll('.mo-chip');
      for (var i = 0; i < chips.length; i++) chips[i].classList.remove('active');
      chip.classList.add('active');
      HUB_STATE.filter = chip.dataset.status;
      HUB_STATE.page = 1;
      loadHubProjects();
    });
    document.getElementById('moLoadMore').addEventListener('click', function () {
      HUB_STATE.page++;
      loadHubProjects(true);
    });
    loadHubProjects();
  }

  function loadHubProjects(append) {
    if (!append) document.getElementById('moCardList').innerHTML = '<div class="mo-loading">加载中...</div>';
    var params = '?action=list&project_type=moe&status=' + HUB_STATE.filter + '&page=' + HUB_STATE.page;
    api('../api/moe_contests.php' + params).then(function (data) {
      var projects = (data && data.data) || [];
      if (!projects.length) {
        if (!append) document.getElementById('moCardList').innerHTML = '<div class="mo-empty">暂无活动</div>';
        return;
      }
      HUB_STATE.total = data.total || projects.length;
      HUB_STATE.projects = append ? HUB_STATE.projects.concat(projects) : projects;
      renderHubCards(projects, append);
      document.getElementById('moLoadMore').style.display = (projects.length >= 20) ? '' : 'none';
      updateHubStats();
    }).catch(function () {
      document.getElementById('moCardList').innerHTML = '<div class="mo-empty">加载失败，请刷新重试</div>';
    });
  }

  function renderHubCards(projects, append) {
    var list = document.getElementById('moCardList');
    if (!append) list.innerHTML = '';
    if (!projects || !projects.length) {
      if (!append) list.innerHTML = '<div class="mo-empty">暂无活动</div>';
      return;
    }
    for (var i = 0; i < projects.length; i++) {
      var p = projects[i];
      var stageType = (p.current_stage && p.current_stage.stage_type) || 'nomination';
      var meta = STAGE_META[stageType] || STAGE_META.nomination;
      var isEnded = p.status === 'ended';
      var stageCls = meta.cls;
      // Map qualifier/group_vote to pool class
      if (stageCls === 'qualifier' || stageCls === 'group_vote') stageCls = 'pool';
      var card = document.createElement('div');
      card.className = 'mo-card' + (isEnded ? ' mo-card--dim' : '');
      card.setAttribute('data-id', p.id);
      card.innerHTML =
        '<div class="mo-card-bar ' + stageCls + '"></div>' +
        '<div class="mo-card-body">' +
          '<div class="mo-card-row">' +
            '<span class="mo-card-tag">萌战</span>' +
            '<span class="mo-card-club">同好会 #' + esc(p.club_id) + '</span>' +
            '<span class="mo-card-stage ' + stageCls + '">' + meta.label + '</span>' +
          '</div>' +
          '<div class="mo-card-title">' + esc(p.title) + '</div>' +
          '<div class="mo-card-desc">' + buildHubDesc(p) + '</div>' +
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
      var cfg = parseConfigVote(stage.config_json);
      if (stage.stage_type === 'nomination') parts.push((cfg.max_nominations || 0) + '名角色参选');
      else if (stage.stage_type === 'group_vote' || stage.stage_type === 'qualifier') parts.push((p.entry_count || '多') + '名角色角逐');
      else if (stage.stage_type === 'bracket' || stage.stage_type === 'final') parts.push((cfg.bracket_size || 16) + '强对阵');
    }
    if (stage && stage.end_time) {
      var remaining = Math.max(0, Math.ceil((new Date(stage.end_time) - Date.now()) / 86400000));
      parts.push('剩余 ' + remaining + ' 天');
    }
    return parts.join(' · ') || '即将开始';
  }

  function updateHubStats() {
    api('../api/moe_contests.php?action=list&project_type=moe&status=running').then(function (d) {
      var el = document.getElementById('moStatRunning');
      if (el) el.textContent = (d && d.data) ? d.data.length : 0;
    }).catch(function () {});
    api('../api/moe_contests.php?action=list&project_type=moe').then(function (d) {
      var el = document.getElementById('moStatTotal');
      if (el) el.textContent = (d && d.data) ? d.data.length : 0;
    }).catch(function () {});
    // Club count — approximate from unique club_ids in current list
    var clubs = {};
    for (var i = 0; i < HUB_STATE.projects.length; i++) {
      if (HUB_STATE.projects[i].club_id) clubs[HUB_STATE.projects[i].club_id] = true;
    }
    var el = document.getElementById('moStatClubs');
    if (el) el.textContent = Object.keys(clubs).length || '-';
  }

  // ==================== CONTEST ====================
  function initContest() {
    var id = new URLSearchParams(window.location.search).get('id');
    if (!id) { document.getElementById('moContestContent').innerHTML = '<div class="mo-empty">缺少活动ID</div>'; return; }
    loadContestData(id);
  }

  function loadContestData(projectId) {
    api('../api/moe_contests.php?action=get&project_id=' + projectId).then(function (data) {
      if (!data || !data.data) {
        document.getElementById('moContestContent').innerHTML = '<div class="mo-empty">活动不存在</div>'; return;
      }
      CONTEST_STATE.project = data.data;
      document.getElementById('moContestTitle').textContent = data.data.title;
      loadContestStages(projectId);
    }).catch(function () {
      document.getElementById('moContestContent').innerHTML = '<div class="mo-empty">加载失败</div>';
    });
  }

  function loadContestStages(projectId) {
    api('../api/moe_stages.php?action=list&project_id=' + projectId).then(function (data) {
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
        document.getElementById('moContestContent').innerHTML = '<div class="mo-empty">当前没有进行中的阶段</div>';
        return;
      }
      CONTEST_STATE.currentStage = openStage;
      var meta = STAGE_META[openStage.stage_type] || {};
      document.getElementById('moContestSub').textContent = meta.label || '';
      renderStage(openStage);
    }).catch(function () {
      document.getElementById('moContestContent').innerHTML = '<div class="mo-empty">加载失败</div>';
    });
  }

  function renderStage(stage) {
    switch (stage.stage_type) {
      case 'nomination': renderNomination(stage); break;
      case 'qualifier':
      case 'group_vote': renderVoting(stage); break;
      case 'bracket': renderBracket(stage); break;
      case 'final': renderFinal(stage); break;
      default: document.getElementById('moContestContent').innerHTML = '<div class="mo-empty">未知阶段类型</div>';
    }
  }

  // ==================== NOMINATION ====================
  function renderNomination(stage) {
    var maxNoms = Number(stage.max_select) || 3;
    var content = document.getElementById('moContestContent');
    content.innerHTML =
      '<div class="mo-action">' +
        '<div class="mo-action-row">' +
          '<input class="mo-action-input" id="moNomSearch" placeholder="搜索角色名称..." autocomplete="off">' +
          '<button class="mo-btn mo-btn--pink" id="moNomBtn">搜索并提名</button>' +
        '</div>' +
        '<div class="mo-action-hint">每人可提名 <strong style="color:var(--mo-pink)">' + maxNoms + '</strong> 个角色 · 已提名 <strong style="color:var(--mo-pink)" id="moNomCount">0</strong> 个</div>' +
      '</div>' +
      '<div class="mo-char-grid" id="moNomGrid"><div class="mo-loading" style="grid-column:1/-1">加载中...</div></div>';

    // Show select mode toggle in header
    var headerBtn = document.getElementById('moHeaderSubmit');
    if (headerBtn) {
      headerBtn.style.display = '';
      headerBtn.className = 'mo-btn mo-btn--select';
      headerBtn.textContent = '选择';
      headerBtn.onclick = function () { toggleSelectMode(stage, maxNoms); };
    }
    // Inject select bar if not present
    var selectBar = document.getElementById('moSelectBar');
    if (!selectBar) {
      selectBar = document.createElement('div');
      selectBar.id = 'moSelectBar';
      selectBar.className = 'mo-select-bar';
      selectBar.innerHTML = '<span class="mo-select-hint" id="moSelectHint">已选 0 个</span><button class="mo-btn mo-btn--pink" id="moSelectDelete" disabled>删除选中</button>';
      var bottomBar = document.getElementById('moBottomBar');
      if (bottomBar) { bottomBar.parentNode.insertBefore(selectBar, bottomBar); }
      else { content.appendChild(selectBar); }
      document.getElementById('moSelectDelete').addEventListener('click', function () {
        batchWithdrawNominations(stage, maxNoms);
      });
    }
    selectBar.style.display = 'none';
    SELECT_MODE = false;
    SELECTED_ENTRIES.clear();

    // Bind delegated click once on the grid for withdraw and select-mode clicks
    var grid = document.getElementById('moNomGrid');
    grid.onclick = function (ev) {
      var target = ev.target;
      // Withdraw button (×) in browse mode
      if (!SELECT_MODE && target.classList.contains('mo-char-remove')) {
        var entryId = target.getAttribute('data-entry-id');
        if (!entryId) return;
        if (!confirm('确定撤销对该角色的提名吗？')) return;
        target.style.opacity = '0.3';
        target.style.pointerEvents = 'none';
        post('../api/moe_candidates.php?action=withdraw_nomination', { entry_id: Number(entryId) }).then(function (r) {
          target.style.opacity = '';
          target.style.pointerEvents = '';
          if (r && r.success) {
            toast('已撤销提名');
            loadMyMoNominations(stage).then(function () {
              return api('../api/moe_candidates.php?action=list&contest_id=' + CONTEST_STATE.project.id);
            }).then(function (data) {
              CONTEST_STATE.entries = (data && data.data) || [];
              renderNomGrid(CONTEST_STATE.entries, maxNoms);
            });
          } else {
            toast((r && r.message) || '撤销失败');
          }
        }).catch(function () {
          target.style.opacity = '';
          target.style.pointerEvents = '';
          toast('撤销失败');
        });
        return;
      }
      // Select mode: toggle check on mine items
      if (SELECT_MODE && target.closest('.mo-char-item--mine')) {
        var item = target.closest('.mo-char-item--mine');
        var eid = item.getAttribute('data-entry-id');
        if (!eid) return;
        if (SELECTED_ENTRIES.has(eid)) {
          SELECTED_ENTRIES.delete(eid);
          item.classList.remove('mo-char-item--checked');
        } else {
          SELECTED_ENTRIES.add(eid);
          item.classList.add('mo-char-item--checked');
        }
        updateSelectBar();
      }
    };

    // Chain: load my nominations → load entries → render grid
    loadMyMoNominations(stage).then(function () {
      return api('../api/moe_candidates.php?action=list&contest_id=' + CONTEST_STATE.project.id);
    }).then(function (data) {
      CONTEST_STATE.entries = (data && data.data) || [];
      renderNomGrid(CONTEST_STATE.entries, maxNoms);
    }).catch(function () {
      document.getElementById('moNomGrid').innerHTML = '<div class="mo-empty" style="grid-column:1/-1">加载失败</div>';
    });

    document.getElementById('moNomSearch').addEventListener('input', function () {
      var q = this.value.trim().toLowerCase();
      var filtered = q ? CONTEST_STATE.entries.filter(function (e) {
        return (e.title || '').toLowerCase().indexOf(q) !== -1;
      }) : CONTEST_STATE.entries;
      renderNomGrid(filtered, maxNoms);
    });

    document.getElementById('moNomBtn').addEventListener('click', function () {
      var q = document.getElementById('moNomSearch').value.trim();
      if (!q) { toast('请输入角色名称'); return; }
      searchMoCharacter(q, stage, maxNoms);
    });
  }

  function loadMyMoNominations(stage) {
    return api('../api/moe_candidates.php?action=my_nominations&contest_id=' + CONTEST_STATE.project.id).then(function (data) {
      var noms = (data && data.data) || [];
      CONTEST_STATE.myNominations = noms;
      var countEl = document.getElementById('moNomCount');
      if (countEl) countEl.textContent = noms.length;
    }).catch(function () {
      var countEl = document.getElementById('moNomCount');
      if (countEl) countEl.textContent = '加载失败';
    });
  }

  function searchMoCharacter(keyword, stage, maxNoms) {
    var grid = document.getElementById('moNomGrid');
    if (grid) grid.innerHTML = '<div class="mo-loading" style="grid-column:1/-1">搜索中...</div>';
    var btn = document.getElementById('moNomBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="mo-spinner"></span>搜索中...'; }

    api('../api/bangumi_proxy.php?action=search_character&keyword=' + encodeURIComponent(keyword)).then(function (data) {
      var results = (data && data.data) || [];
      if (!results.length) {
        if (grid) grid.innerHTML = '<div class="mo-empty" style="grid-column:1/-1">未找到匹配角色</div>';
        return;
      }
      if (grid) {
        grid.innerHTML = '';
        for (var i = 0; i < Math.min(results.length, 12); i++) {
          (function (ch, idx) {
            var div = document.createElement('div');
            div.className = 'mo-char-item mo-char-search-result';
            div.innerHTML =
              '<div class="mo-char-avatar" style="background-image:' + (ch.image_url ? 'url(' + esc(ch.image_url) + ')' : avatarGradient(idx)) + '">' +
                '<div class="mo-char-check"><svg width="7" height="7" viewBox="0 0 16 16" fill="none" stroke="#fff" stroke-width="3"><polyline points="3,8 7,12 13,4"/></svg></div>' +
              '</div>' +
              '<div class="mo-char-name">' + esc(ch.name_cn || ch.name || '?') + '</div>' +
              '<div class="mo-char-work">' + esc(ch.relation || '') + '</div>';
            div.addEventListener('click', function () {
              div.classList.add('mo-char-item--loading');
              nominateMoCharacter(ch, stage, maxNoms, div);
            });
            grid.appendChild(div);
          })(results[i], i);
        }
      }
    }).catch(function () {
      if (grid) grid.innerHTML = '<div class="mo-empty" style="grid-column:1/-1">搜索失败，请重试</div>';
    }).then(function () {
      if (btn) { btn.disabled = false; btn.textContent = '搜索并提名'; }
    });
  }

  function nominateMoCharacter(ch, stage, maxNoms, cardEl) {
    var currentCount = CONTEST_STATE.myNominations.length;
    if (currentCount >= maxNoms) { toast('已达到最大提名数（' + maxNoms + '个）'); return; }

    function cleanupCard() { if (cardEl) cardEl.classList.remove('mo-char-item--loading'); }

    // 若搜索结果无图片但有角色 ID，先抓取详情补图片
    function resolveImage() {
      if (ch.image_url_raw) return Promise.resolve(ch.image_url_raw);
      if (!ch.character_id) return Promise.resolve('');
      return api('../api/bangumi_proxy.php?action=get_character&id=' + ch.character_id).then(function (data) {
        if (data && data.data && data.data.images) {
          var imgs = data.data.images;
          var raw = imgs.medium || imgs.large || imgs.small || imgs.grid || '';
          if (raw) return raw;
        }
        return '';
      });
    }

    resolveImage().then(function (imageUrl) {
      var payload = {
        project_id: CONTEST_STATE.project.id,
        contest_id: CONTEST_STATE.project.id,
        stage_id: stage.id,
        title: ch.name_cn || ch.name || '',
        title_cn: ch.name || '',
        subtitle: ch.relation || '',
        image_url: imageUrl,
        source_type: 'bangumi_character',
        source_id: String(ch.character_id || '')
      };
      return post('../api/moe_candidates.php?action=submit', payload);
    }).then(function (r) {
      cleanupCard();
      if (r && r.success) {
        toast('提名成功');
        loadMyMoNominations(stage).then(function () {
          return api('../api/moe_candidates.php?action=list&contest_id=' + CONTEST_STATE.project.id);
        }).then(function (data) {
          CONTEST_STATE.entries = (data && data.data) || [];
          renderNomGrid(CONTEST_STATE.entries, maxNoms);
        });
      } else {
        toast((r && r.message) || '提名失败');
      }
    }).catch(function () { cleanupCard(); toast('提名失败'); });
  }

  function toggleSelectMode(stage, maxNoms) {
    SELECT_MODE = !SELECT_MODE;
    SELECTED_ENTRIES.clear();
    var headerBtn = document.getElementById('moHeaderSubmit');
    var selectBar = document.getElementById('moSelectBar');
    if (SELECT_MODE) {
      if (headerBtn) { headerBtn.textContent = '取消选择'; headerBtn.className = 'mo-btn mo-btn--cancel'; }
      document.body.classList.add('mo-select-mode');
      if (selectBar) selectBar.style.display = 'flex';
    } else {
      if (headerBtn) { headerBtn.textContent = '选择'; headerBtn.className = 'mo-btn mo-btn--select'; }
      document.body.classList.remove('mo-select-mode');
      if (selectBar) selectBar.style.display = 'none';
    }
    // Re-render grid with select mode state
    var q = document.getElementById('moNomSearch').value.trim().toLowerCase();
    var filtered = q ? CONTEST_STATE.entries.filter(function (e) {
      return (e.title || '').toLowerCase().indexOf(q) !== -1;
    }) : CONTEST_STATE.entries;
    renderNomGrid(filtered, maxNoms);
  }

  function updateSelectBar() {
    var hint = document.getElementById('moSelectHint');
    var btn = document.getElementById('moSelectDelete');
    var count = SELECTED_ENTRIES.size;
    if (hint) hint.textContent = '已选 ' + count + ' 个';
    if (btn) { btn.disabled = count === 0; btn.textContent = count > 0 ? '删除选中（' + count + '）' : '删除选中'; }
  }

  function batchWithdrawNominations(stage, maxNoms) {
    if (!SELECTED_ENTRIES.size) return;
    if (!confirm('确定撤销选中的 ' + SELECTED_ENTRIES.size + ' 个提名吗？')) return;
    var ids = Array.from(SELECTED_ENTRIES).map(Number);
    var done = 0;
    var failed = 0;
    var delBtn = document.getElementById('moSelectDelete');
    if (delBtn) { delBtn.disabled = true; delBtn.innerHTML = '<span class="mo-spinner"></span>处理中...'; }
    function withdrawNext() {
      if (done >= ids.length) {
        if (delBtn) { delBtn.disabled = false; delBtn.textContent = '删除选中'; }
        if (failed) toast('已撤销 ' + (done - failed) + ' 个，' + failed + ' 个失败');
        else toast('已撤销 ' + done + ' 个提名');
        SELECTED_ENTRIES.clear();
        toggleSelectMode(stage, maxNoms);
        loadMyMoNominations(stage).then(function () {
          return api('../api/moe_candidates.php?action=list&contest_id=' + CONTEST_STATE.project.id);
        }).then(function (data) {
          CONTEST_STATE.entries = (data && data.data) || [];
          renderNomGrid(CONTEST_STATE.entries, maxNoms);
        });
        return;
      }
      post('../api/moe_candidates.php?action=withdraw_nomination', { entry_id: ids[done] }).then(function (r) {
        if (!r || !r.success) failed++;
      }).catch(function () { failed++; }).finally(function () {
        done++;
        withdrawNext();
      });
    }
    withdrawNext();
  }

  function renderNomGrid(entries, maxNoms) {
    var grid = document.getElementById('moNomGrid');
    if (!grid) return;
    if (!entries.length) { grid.innerHTML = '<div class="mo-empty" style="grid-column:1/-1">暂无可提名角色</div>'; return; }

    // Build a lookup of entry_ids the current user has nominated
    var myEntryIds = {};
    for (var ni = 0; ni < CONTEST_STATE.myNominations.length; ni++) {
      var nom = CONTEST_STATE.myNominations[ni];
      if (nom.status !== 'withdrawn') myEntryIds[String(nom.entry_id)] = true;
    }

    grid.innerHTML = '';
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      var isMine = myEntryIds[String(e.id)];
      var isChecked = SELECT_MODE && SELECTED_ENTRIES.has(String(e.id));
      var cls = 'mo-char-item';
      if (isMine) cls += ' mo-char-item--mine';
      if (isChecked) cls += ' mo-char-item--checked';
      var div = document.createElement('div');
      div.className = cls;
      if (isMine) div.setAttribute('data-entry-id', Number(e.id));
      div.innerHTML =
        '<div class="mo-char-avatar" style="background-image:' + (e.image_url ? 'url(' + esc(e.image_url) + ')' : avatarGradient(i)) + '">' +
          '<div class="mo-char-check"><svg width="7" height="7" viewBox="0 0 16 16" fill="none" stroke="#fff" stroke-width="3"><polyline points="3,8 7,12 13,4"/></svg></div>' +
        '</div>' +
        '<div class="mo-char-name">' + esc(e.title || '?') + '</div>' +
        '<div class="mo-char-work">' + esc(e.subtitle || '') + '</div>' +
        (isMine && !SELECT_MODE ? '<div class="mo-char-remove" data-entry-id="' + Number(e.id) + '">×</div>' : '');
      grid.appendChild(div);
    }
  }

  // ==================== VOTING (qualifier / group_vote) ====================
  function normalizeStageEntry(row) {
    row.id = Number(row.entry_id || row.id);
    return row;
  }

  function loadMyStageVotes(stage) {
    return api('../api/moe_votes.php?action=my_votes&project_id=' + CONTEST_STATE.project.id).then(function (data) {
      var rows = (data && data.data) || [];
      return rows.filter(function (v) { return Number(v.stage_id) === Number(stage.id); });
    }).catch(function () {
      return [];
    });
  }

  function loadStageResults(stage) {
    return api('../api/moe_votes.php?action=results&stage_id=' + stage.id).then(function (data) {
      var rows = (data && data.data) || [];
      var map = {};
      for (var i = 0; i < rows.length; i++) {
        map[Number(rows[i].entry_id || rows[i].id)] = rows[i];
      }
      CONTEST_STATE.resultRows = rows;
      CONTEST_STATE.resultMap = map;
      return data || { data: [], match_results: [] };
    }).catch(function () {
      CONTEST_STATE.resultRows = [];
      CONTEST_STATE.resultMap = {};
      return { data: [], match_results: [] };
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

  function applyResultStats(entries, rows) {
    var map = {};
    for (var i = 0; i < (rows || []).length; i++) map[Number(rows[i].entry_id || rows[i].id)] = rows[i];
    return entries.map(function (entry) {
      var stat = map[Number(entry.id)] || {};
      entry.votes = Number(stat.votes || 0);
      entry.rank_no = stat.rank_no ? Number(stat.rank_no) : null;
      entry.advanced = Number(stat.advanced || 0);
      return entry;
    });
  }

  function groupEntriesByKey(entries, groupCount) {
    var buckets = {};
    var order = [];
    var count = Math.max(1, Number(groupCount || 1));
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      var key = String(entry.group_key || entry.group || '');
      if (!key || key === 'null' || key === 'undefined') key = count > 1 ? ('G' + ((i % count) + 1)) : 'all';
      if (!buckets[key]) {
        buckets[key] = { key: key, label: key === 'all' ? '全部' : key, entries: [] };
        order.push(key);
      }
      buckets[key].entries.push(entry);
    }
    return order.map(function (key) { return buckets[key]; });
  }

  function renderVoteGroupTabs(maxVotes, locked, showVotes) {
    var tabs = document.getElementById('moGroupTabs');
    if (!tabs) return;
    tabs.innerHTML = '';
    for (var i = 0; i < CONTEST_STATE.groups.length; i++) {
      (function (idx) {
        var group = CONTEST_STATE.groups[idx];
        var tab = document.createElement('button');
        tab.type = 'button';
        tab.className = 'mo-group-tab' + (idx === CONTEST_STATE.currentGroup ? ' active' : '');
        tab.textContent = group.label || ('G' + (idx + 1));
        tab.addEventListener('click', function () {
          CONTEST_STATE.currentGroup = idx;
          var buttons = tabs.querySelectorAll('.mo-group-tab');
          for (var j = 0; j < buttons.length; j++) buttons[j].classList.remove('active');
          tab.classList.add('active');
          renderVoteGrid(group.entries, maxVotes, locked, showVotes);
        });
        tabs.appendChild(tab);
      })(i);
    }
  }

  function renderVoting(stage) {
    var maxVotes = Number(stage.max_select) || 8;
    var content = document.getElementById('moContestContent');
    CONTEST_STATE.myVotes = {};
    content.innerHTML =
      '<div class="mo-action">' +
        '<div class="mo-action-hint">每人可选 <strong style="color:var(--mo-purple)">' + maxVotes + '</strong> 个角色 · 已选 <strong style="color:var(--mo-purple)" id="moVoteCount">0</strong> 个</div>' +
        '<button class="mo-btn mo-btn--purple mo-btn--full" id="moVoteSubmit" style="margin-top:8px;">提交投票</button>' +
      '</div>' +
      '<div class="mo-char-grid" id="moVoteGrid"><div class="mo-loading" style="grid-column:1/-1">加载中...</div></div>';

    Promise.all([
      api('../api/moe_stages.php?action=stage_entries&stage_id=' + stage.id),
      loadMyStageVotes(stage),
      loadStageResults(stage)
    ]).then(function (results) {
      var entries = ((results[0] && results[0].data) || []).map(normalizeStageEntry);
      var votes = results[1] || [];
      var resultData = results[2] || {};
      var showVotes = canShowVoteNumbers(stage, resultData);
      entries = applyResultStats(entries, resultData.data || []);
      for (var i = 0; i < votes.length; i++) {
        CONTEST_STATE.myVotes[Number(votes[i].entry_id)] = true;
      }
      CONTEST_STATE.groups = groupEntriesByKey(entries, stage.group_count);
      CONTEST_STATE.currentGroup = 0;
      if (CONTEST_STATE.groups.length > 1) {
        var action = content.querySelector('.mo-action');
        if (action && !document.getElementById('moGroupTabs')) {
          action.insertAdjacentHTML('afterend', '<div class="mo-group-tabs" id="moGroupTabs"></div>');
        }
        renderVoteGroupTabs(maxVotes, votes.length > 0, showVotes);
        renderVoteGrid(CONTEST_STATE.groups[0].entries, maxVotes, votes.length > 0, showVotes);
      } else {
        renderVoteGrid(entries, maxVotes, votes.length > 0, showVotes);
      }
    }).catch(function () {
      document.getElementById('moVoteGrid').innerHTML = '<div class="mo-empty" style="grid-column:1/-1">加载失败</div>';
    });

    document.getElementById('moVoteSubmit').addEventListener('click', function () {
      var selected = Object.keys(CONTEST_STATE.myVotes).filter(function (k) { return CONTEST_STATE.myVotes[k]; });
      if (!selected.length) { toast('请至少选择一个角色'); return; }
      var btn = document.getElementById('moVoteSubmit');
      if (btn) { btn.disabled = true; btn.innerHTML = '<span class="mo-spinner"></span>提交中...'; }
      post('../api/moe_votes.php?action=cast', { stage_id: stage.id, entry_ids: selected.map(Number) }).then(function (r) {
        if (r && r.success) { if (btn) { btn.disabled = true; btn.innerHTML = '<span class="mo-spinner"></span>已投票'; } toast('投票成功'); }
        else { if (btn) { btn.disabled = false; btn.textContent = '提交投票'; } toast((r && r.message) || '投票失败'); }
      }).catch(function () { if (btn) { btn.disabled = false; btn.textContent = '提交投票'; } toast('投票失败'); });
    });
  }

  function renderVoteGrid(entries, maxVotes, locked, showVotes) {
    var grid = document.getElementById('moVoteGrid');
    if (!grid) return;
    if (!entries.length) { grid.innerHTML = '<div class="mo-empty" style="grid-column:1/-1">阶段池尚未生成，请联系负责人</div>'; return; }
    grid.innerHTML = '';
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      (function (entry, idx) {
        var div = document.createElement('div');
        div.className = 'mo-char-item' + (CONTEST_STATE.myVotes[entry.id] ? ' selected' : '');
        div.setAttribute('data-entry-id', entry.id);
        div.innerHTML =
          '<div class="mo-char-avatar" style="background-image:' + (entry.image_url ? 'url(' + esc(entry.image_url) + ')' : avatarGradient(idx)) + '">' +
            '<div class="mo-char-check"><svg width="7" height="7" viewBox="0 0 16 16" fill="none" stroke="#fff" stroke-width="3"><polyline points="3,8 7,12 13,4"/></svg></div>' +
          '</div>' +
          '<div class="mo-char-name">' + esc(entry.title || '?') + '</div>' +
          '<div class="mo-char-work">' + esc(entry.subtitle || '') + '</div>' +
          (showVotes ? '<div class="mo-char-work">票数 ' + Number(entry.votes || 0) + (entry.rank_no ? ' · #' + Number(entry.rank_no) : '') + '</div>' : '');
        div.addEventListener('click', function () {
          if (locked) return;
          var count = Object.keys(CONTEST_STATE.myVotes).filter(function (k) { return CONTEST_STATE.myVotes[k]; }).length;
          if (CONTEST_STATE.myVotes[entry.id]) {
            CONTEST_STATE.myVotes[entry.id] = false; div.classList.remove('selected');
          } else if (count < maxVotes) {
            CONTEST_STATE.myVotes[entry.id] = true; div.classList.add('selected');
          }
          var newCount = Object.keys(CONTEST_STATE.myVotes).filter(function (k) { return CONTEST_STATE.myVotes[k]; }).length;
          var countEl = document.getElementById('moVoteCount');
          if (countEl) countEl.textContent = newCount;
          if (newCount >= maxVotes) {
            var items = grid.querySelectorAll('.mo-char-item');
            for (var j = 0; j < items.length; j++) {
              if (!items[j].classList.contains('selected')) items[j].classList.add('mo-char-item--dimmed');
            }
          } else {
            var items2 = grid.querySelectorAll('.mo-char-item.mo-char-item--dimmed');
            for (var k = 0; k < items2.length; k++) items2[k].classList.remove('mo-char-item--dimmed');
          }
        });
        grid.appendChild(div);
      })(e, i);
    }
    var selectedCount = Object.keys(CONTEST_STATE.myVotes).filter(function (k) { return CONTEST_STATE.myVotes[k]; }).length;
    var countEl = document.getElementById('moVoteCount');
    var submitBtn = document.getElementById('moVoteSubmit');
    if (countEl) countEl.textContent = selectedCount;
    if (locked && submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = '已投票';
    }
  }

  function mergeMatchStats(matches, stats, showVotes) {
    var map = {};
    for (var i = 0; i < (stats || []).length; i++) map[Number(stats[i].id)] = stats[i];
    return (matches || []).map(function (match) {
      var stat = map[Number(match.id)] || {};
      match.slot_a_votes = Number(stat.slot_a_votes || 0);
      match.slot_b_votes = Number(stat.slot_b_votes || 0);
      match.total_votes = Number(stat.total_votes || 0);
      match._show_votes = !!showVotes;
      return match;
    });
  }

  // ==================== BRACKET (32-8) ====================
  function matchHasBothSlots(match) {
    return Number(match.slot_a_entry_id || 0) > 0 && Number(match.slot_b_entry_id || 0) > 0;
  }

  function bracketRoundLabel(roundNo, bracketSize) {
    var size = Math.max(2, Math.floor(Number(bracketSize || 0) / Math.pow(2, Math.max(0, Number(roundNo || 1) - 1))));
    if (size === 4) return '半决赛';
    if (size === 2) return '最终轮';
    return size + ' 强';
  }

  function currentOpenRoundMatches(matches) {
    var voteable = (matches || []).filter(function (m) {
      return m.status === 'open' && matchHasBothSlots(m);
    });
    if (!voteable.length) return [];
    var roundNo = Math.min.apply(null, voteable.map(function (m) { return Number(m.round_no || 1); }));
    return voteable.filter(function (m) { return Number(m.round_no || 1) === roundNo; });
  }

  function hydrateMatchVoteState(matches, votes) {
    CONTEST_STATE.myVotes = {};
    var matchMap = {};
    (matches || []).forEach(function (m) { matchMap[Number(m.id)] = m; });
    (votes || []).forEach(function (vote) {
      var matchId = Number(vote.match_id || 0);
      var match = matchMap[matchId];
      if (!match) return;
      var entryId = Number(vote.entry_id || 0);
      if (entryId === Number(match.slot_a_entry_id || 0)) CONTEST_STATE.myVotes[matchId] = 'a';
      if (entryId === Number(match.slot_b_entry_id || 0)) CONTEST_STATE.myVotes[matchId] = 'b';
    });
    CONTEST_STATE.preVotedCurrentRound = (matches || []).length > 0 && Object.keys(CONTEST_STATE.myVotes).length >= (matches || []).length;
  }

  function renderReadonlyMatchSummary(matches, bracketSize, activeRoundNo) {
    if (!matches || !matches.length) return '';
    var html = '<div class="mo-action" style="margin-top:10px;"><div class="mo-action-hint">赛程概览 · 已结算对阵显示胜者，未开放对阵仅作预览</div></div>';
    var byRound = {};
    matches.forEach(function (m) {
      var roundNo = Number(m.round_no || 1);
      if (!byRound[roundNo]) byRound[roundNo] = [];
      byRound[roundNo].push(m);
    });
    Object.keys(byRound).sort(function (a, b) { return Number(a) - Number(b); }).forEach(function (roundKey) {
      var roundNo = Number(roundKey);
      var weak = activeRoundNo && roundNo !== Number(activeRoundNo);
      var roundMatches = byRound[roundKey].filter(function (m) {
        return !(activeRoundNo && roundNo === Number(activeRoundNo) && m.status === 'open' && matchHasBothSlots(m));
      });
      if (!roundMatches.length) return;
      html += '<div style="padding:10px 12px 4px;color:var(--mo-muted);font-size:12px;font-weight:700;">' + esc(bracketRoundLabel(roundNo, bracketSize)) + '</div>';
      html += '<div class="mo-match-list" style="' + (weak ? 'opacity:.68;' : '') + '">';
      roundMatches.forEach(function (m) {
        var a = esc(m.slot_a_title_cn || m.slot_a_title || '待定');
        var b = esc(m.slot_b_title_cn || m.slot_b_title || '待定');
        var winner = m.status === 'settled' ? esc(m.winner_title_cn || m.winner_title || m.winner_entry_id || '') : '';
        var votes = m._show_votes ? ' · ' + Number(m.slot_a_votes || 0) + ':' + Number(m.slot_b_votes || 0) + '票' : '';
        html += '<div class="mo-match-row" style="pointer-events:none;">' +
          '<span class="mo-match-num">R' + roundNo + '-' + Number(m.match_no || 0) + '</span>' +
          '<div class="mo-match-side"><span class="mo-match-name">' + a + '</span></div>' +
          '<span class="mo-match-vs">VS</span>' +
          '<div class="mo-match-side"><span class="mo-match-name">' + b + '</span></div>' +
          '<span class="mo-match-name" style="min-width:88px;font-size:11px;color:var(--mo-muted);">' + esc(m.status || 'pending') + (winner ? ' · 胜者 ' + winner : '') + votes + '</span>' +
        '</div>';
      });
      html += '</div>';
    });
    return html;
  }

  function renderBracket(stage) {
    var cfg = parseConfigVote(stage.config_json);
    var bracketSize = cfg.bracket_size || 16;
    CONTEST_STATE.myVotes = {};
    var content = document.getElementById('moContestContent');
    content.innerHTML = '<div class="mo-loading">加载对阵中...</div>';

    Promise.all([
      api('../api/moe_matches.php?action=list&stage_id=' + stage.id),
      loadStageResults(stage),
      loadMyStageVotes(stage)
    ]).then(function (results) {
      var data = results[0] || {};
      var resultData = results[1] || {};
      var votes = results[2] || [];
      var matchStats = resultData.match_results || [];
      var matches = (data && data.data) || [];
      var showVotes = canShowVoteNumbers(stage, resultData);
      matches = mergeMatchStats(matches, matchStats, showVotes);
      var currentMatches = currentOpenRoundMatches(matches);
      CONTEST_STATE.allMatches = matches;
      CONTEST_STATE.matches = currentMatches;
      if (!matches.length) {
        content.innerHTML = '<div class="mo-empty">淘汰赛对阵尚未生成，请联系负责人在管理端生成对阵</div>'; return;
      }
      if (!currentMatches.length) {
        var bottom = document.getElementById('moBottomBar');
        var header = document.getElementById('moHeaderSubmit');
        if (bottom) bottom.style.display = 'none';
        if (header) header.style.display = 'none';
        if ((resultData.data || []).length) {
          renderStageResults(stage);
          return;
        }
        content.innerHTML = '<div class="mo-empty">当前没有开放中的淘汰赛对阵，等待负责人结算或开放下一轮。</div>' +
          renderReadonlyMatchSummary(matches, bracketSize, null);
        return;
      }
      hydrateMatchVoteState(currentMatches, votes);
      buildMatchList(currentMatches, bracketSize, matches);
      (function() { var el = document.getElementById('moBottomBar'); if (el) el.style.display = 'flex'; })();
      document.getElementById('moHeaderSubmit').style.display = '';
      // Bind bottom bar submit
      bindSubmit(stage);
    }).catch(function () {
      content.innerHTML = '<div class="mo-empty">加载失败</div>';
    });
  }

  function buildMatchList(matches, bracketSize, allMatches) {
    var content = document.getElementById('moContestContent');
    var avatarSize = bracketSize <= 8 ? 40 : (bracketSize <= 32 ? 32 : 28);
    var totalMatches = matches.length;
    var roundNo = matches[0] ? Number(matches[0].round_no || 1) : 1;
    var html = '<div class="mo-action"><div class="mo-action-hint">当前轮次：<strong style="color:var(--mo-pink)">' + esc(bracketRoundLabel(roundNo, bracketSize)) + '</strong> · 请选择本轮全部开放对阵</div></div>';
    html += '<div class="mo-match-list" id="moMatchList">';
    for (var i = 0; i < matches.length; i++) {
      var m = matches[i];
      var selectedSide = CONTEST_STATE.myVotes[Number(m.id)];
      html +=
        '<div class="mo-match-row" data-match-id="' + m.id + '">' +
          '<span class="mo-match-num">#' + (i + 1) + '</span>' +
          '<div class="mo-match-side' + (selectedSide === 'a' ? ' winner' : (selectedSide === 'b' ? ' loser' : '')) + '" data-side="a" data-match-id="' + m.id + '">' +
            '<div class="mo-match-avatar" style="background:' + (m.slot_a_image ? 'url(' + esc(m.slot_a_image) + ') center/cover' : avatarGradient(i * 2)) + ';width:' + avatarSize + 'px;height:' + avatarSize + 'px;"></div>' +
            '<span class="mo-match-name">' + esc(m.slot_a_title || '角色A') + '</span>' +
            (m._show_votes ? '<span class="mo-match-name" style="font-size:10px;color:var(--mo-muted);">' + Number(m.slot_a_votes || 0) + '票</span>' : '') +
            '<div class="mo-match-check"><svg width="7" height="7" viewBox="0 0 16 16" fill="none" stroke="#fff" stroke-width="3"><polyline points="3,8 7,12 13,4"/></svg></div>' +
          '</div>' +
          '<span class="mo-match-vs">VS</span>' +
          '<div class="mo-match-side' + (selectedSide === 'b' ? ' winner' : (selectedSide === 'a' ? ' loser' : '')) + '" data-side="b" data-match-id="' + m.id + '">' +
            '<div class="mo-match-avatar" style="background:' + (m.slot_b_image ? 'url(' + esc(m.slot_b_image) + ') center/cover' : avatarGradient(i * 2 + 1)) + ';width:' + avatarSize + 'px;height:' + avatarSize + 'px;"></div>' +
            '<span class="mo-match-name">' + esc(m.slot_b_title || '角色B') + '</span>' +
            (m._show_votes ? '<span class="mo-match-name" style="font-size:10px;color:var(--mo-muted);">' + Number(m.slot_b_votes || 0) + '票</span>' : '') +
            '<div class="mo-match-check"><svg width="7" height="7" viewBox="0 0 16 16" fill="none" stroke="#fff" stroke-width="3"><polyline points="3,8 7,12 13,4"/></svg></div>' +
          '</div>' +
        '</div>';
    }
    html += '</div>';
    html += renderReadonlyMatchSummary(allMatches || matches, bracketSize, roundNo);
    content.innerHTML = html;

    // Bind click events to each side
    var rows = document.querySelectorAll('.mo-match-row');
    for (var r = 0; r < rows.length; r++) {
      var sides = rows[r].querySelectorAll('.mo-match-side');
      var matchId = rows[r].getAttribute('data-match-id');
      sides[0].addEventListener('click', function (ev) {
        selectMatchSide(ev.currentTarget.getAttribute('data-match-id'), 'a', totalMatches);
      });
      sides[1].addEventListener('click', function (ev) {
        selectMatchSide(ev.currentTarget.getAttribute('data-match-id'), 'b', totalMatches);
      });
    }
    updateBottomBar(totalMatches, false);
  }

  function selectMatchSide(matchId, side, totalMatches) {
    CONTEST_STATE.preVotedCurrentRound = false;
    CONTEST_STATE.myVotes[matchId] = side;
    var row = document.querySelector('.mo-match-row[data-match-id="' + matchId + '"]');
    if (!row) return;
    var sides = row.querySelectorAll('.mo-match-side');
    if (side === 'a') {
      sides[0].classList.add('winner'); sides[0].classList.remove('loser');
      sides[1].classList.add('loser'); sides[1].classList.remove('winner');
    } else {
      sides[1].classList.add('winner'); sides[1].classList.remove('loser');
      sides[0].classList.add('loser'); sides[0].classList.remove('winner');
    }
    updateBottomBar(totalMatches, false);
  }

  // ==================== FINAL ====================
  function renderFinal(stage) {
    CONTEST_STATE.myVotes = {};
    var content = document.getElementById('moContestContent');
    content.innerHTML = '<div class="mo-loading">加载对阵中...</div>';

    Promise.all([
      api('../api/moe_matches.php?action=list&stage_id=' + stage.id),
      loadStageResults(stage)
    ]).then(function (results) {
      var data = results[0] || {};
      var resultData = results[1] || {};
      var matchStats = resultData.match_results || [];
      var matches = (data && data.data) || [];
      matches = mergeMatchStats(matches, matchStats, canShowVoteNumbers(stage, resultData));
      CONTEST_STATE.matches = matches;
      if (!matches.length) { content.innerHTML = '<div class="mo-empty">决赛对阵尚未生成，请联系负责人在管理端生成对阵</div>'; return; }
      content.innerHTML = '';
      for (var i = 0; i < matches.length; i++) {
        var m = matches[i];
        var isChampion = (m.match_type === 'final' || i === 0);
        var card = buildMatchCard(m, i, isChampion ? 'final' : 'third');
        content.appendChild(card);
      }
      (function() { var el = document.getElementById('moBottomBar'); if (el) el.style.display = 'flex'; })();
      document.getElementById('moHeaderSubmit').style.display = '';
      bindSubmit(stage);
    }).catch(function () {
      content.innerHTML = '<div class="mo-empty">加载失败</div>';
    });
  }

  function buildMatchCard(match, idx, type) {
    var card = document.createElement('div');
    card.className = 'mo-match-card';
    card.style.margin = '0 12px 14px';
    var headerCls = type === 'final' ? 'final' : 'third';
    var headerLabel = type === 'final' ? '冠军争夺战' : '季军争夺战';
    var headerIcon = type === 'final'
      ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#eab308" stroke-width="2"><path d="M8 21h8M12 3v12M8 7h8M6 11h12"/><circle cx="12" cy="16" r="3"/></svg>'
      : '<svg width="12" height="12" viewBox="0 0 24 24" fill="#cd7f32"><circle cx="12" cy="12" r="10" opacity="0.15"/><circle cx="12" cy="12" r="6" opacity="0.25"/><circle cx="12" cy="12" r="3"/></svg>';
    var avatarSize = type === 'final' ? '72px' : '48px';
    card.setAttribute('data-match-id', match.id);
    card.innerHTML =
      '<div class="mo-match-card-header ' + headerCls + '">' + headerIcon + ' ' + headerLabel + '</div>' +
      '<div class="mo-match-card-body">' +
        '<div class="mo-match-card-side" data-side="a" data-match-id="' + match.id + '">' +
          '<div class="mo-match-avatar" style="background:' + (match.slot_a_image ? 'url(' + esc(match.slot_a_image) + ') center/cover' : avatarGradient(idx * 2)) + ';width:' + avatarSize + ';height:' + avatarSize + ';margin:0 auto 8px;border-radius:50%;"></div>' +
          '<div style="font-size:' + (type === 'final' ? '14px' : '12px') + ';font-weight:700;">' + esc(match.slot_a_title || '角色A') + '</div>' +
          '<div style="font-size:9px;color:var(--mo-muted);">' + esc(match.slot_a_title_cn || '') + '</div>' +
          (match._show_votes ? '<div style="font-size:10px;color:var(--mo-muted);margin-top:4px;">' + Number(match.slot_a_votes || 0) + '票</div>' : '') +
        '</div>' +
        '<span style="font-size:15px;font-weight:800;color:var(--mo-weak);">VS</span>' +
        '<div class="mo-match-card-side" data-side="b" data-match-id="' + match.id + '">' +
          '<div class="mo-match-avatar" style="background:' + (match.slot_b_image ? 'url(' + esc(match.slot_b_image) + ') center/cover' : avatarGradient(idx * 2 + 1)) + ';width:' + avatarSize + ';height:' + avatarSize + ';margin:0 auto 8px;border-radius:50%;"></div>' +
          '<div style="font-size:' + (type === 'final' ? '14px' : '12px') + ';font-weight:700;">' + esc(match.slot_b_title || '角色B') + '</div>' +
          '<div style="font-size:9px;color:var(--mo-muted);">' + esc(match.slot_b_title_cn || '') + '</div>' +
          (match._show_votes ? '<div style="font-size:10px;color:var(--mo-muted);margin-top:4px;">' + Number(match.slot_b_votes || 0) + '票</div>' : '') +
        '</div>' +
      '</div>';

    var sides = card.querySelectorAll('.mo-match-card-side');
    sides[0].addEventListener('click', function () { selectMatchCardSide(match.id, 'a'); });
    sides[1].addEventListener('click', function () { selectMatchCardSide(match.id, 'b'); });
    return card;
  }

  function selectMatchCardSide(matchId, side) {
    CONTEST_STATE.myVotes[matchId] = side;
    var card = document.querySelector('.mo-match-card[data-match-id="' + matchId + '"]');
    if (!card) return;
    var sides = card.querySelectorAll('.mo-match-card-side');
    if (side === 'a') {
      sides[0].style.border = '2px solid var(--mo-gold)'; sides[0].style.background = 'var(--mo-gold-bg)'; sides[0].style.borderRadius = 'var(--mo-radius-md)';
      sides[1].style.border = '1px solid transparent'; sides[1].style.background = 'transparent'; sides[1].style.opacity = '0.4';
    } else {
      sides[1].style.border = '2px solid var(--mo-gold)'; sides[1].style.background = 'var(--mo-gold-bg)'; sides[1].style.borderRadius = 'var(--mo-radius-md)';
      sides[0].style.border = '1px solid transparent'; sides[0].style.background = 'transparent'; sides[0].style.opacity = '0.4';
    }
    updateFinalBottomBar();
  }

  function updateFinalBottomBar() {
    var selected = Object.keys(CONTEST_STATE.myVotes).length;
    var total = CONTEST_STATE.matches.length;
    var hint = document.getElementById('moBottomHint');
    var btn = document.getElementById('moBottomSubmit');
    var championPicked = CONTEST_STATE.matches[0] && CONTEST_STATE.myVotes[CONTEST_STATE.matches[0].id];
    var thirdPicked = CONTEST_STATE.matches[1] && CONTEST_STATE.myVotes[CONTEST_STATE.matches[1].id];
    if (hint) hint.innerHTML = '冠军赛 <strong style="color:var(--mo-gold)">' + (championPicked ? '已选' : '待选') + '</strong> · 季军赛 <strong style="color:var(--mo-muted)">' + (thirdPicked ? '已选' : '待选') + '</strong>';
    if (btn) { btn.className = 'mo-btn mo-btn--gold'; btn.style.opacity = selected >= total ? '1' : '0.5'; btn.disabled = selected < total; }
  }

  function updateBottomBar(totalMatches, isFinal) {
    var selected = Object.keys(CONTEST_STATE.myVotes).length;
    var hint = document.getElementById('moBottomHint');
    var btn = document.getElementById('moBottomSubmit');
    var complete = selected >= totalMatches;
    var voted = !!CONTEST_STATE.preVotedCurrentRound && complete;
    if (hint) hint.innerHTML = (voted ? '本轮已投票' : (complete ? '本轮已选完' : '已选')) + ' <strong style="color:var(--mo-pink)">' + selected + '</strong> / ' + totalMatches + ' 组';
    if (btn) {
      btn.disabled = !complete;
      btn.style.opacity = complete ? '1' : '0.5';
      btn.textContent = voted ? '已投票' : (complete ? '提交本轮投票' : '选择本轮全部对阵');
    }
  }

  // ==================== SUBMIT ====================
  function bindSubmit(stage) {
    var bottomBtn = document.getElementById('moBottomSubmit');
    if (bottomBtn) {
      bottomBtn.onclick = function () { submitVotes(stage); };
    }
    var headerBtn = document.getElementById('moHeaderSubmit');
    if (headerBtn) {
      headerBtn.onclick = function () { submitVotes(stage); };
    }
  }

  function submitVotes(stage) {
    var requiredMatches = CONTEST_STATE.matches || [];
    var requiredMap = {};
    requiredMatches.forEach(function (m) { requiredMap[Number(m.id)] = true; });
    var matchIds = Object.keys(CONTEST_STATE.myVotes).filter(function (id) { return requiredMap[Number(id)]; });
    if (matchIds.length < requiredMatches.length) { toast('请选择本轮全部对阵'); return; }
    var bottomBtn = document.getElementById('moBottomSubmit');
    var headerBtn = document.getElementById('moHeaderSubmit');
    if (bottomBtn) { bottomBtn.disabled = true; bottomBtn.innerHTML = '<span class="mo-spinner"></span>提交中...'; }
    if (headerBtn) { headerBtn.disabled = true; headerBtn.innerHTML = '<span class="mo-spinner"></span>提交中...'; }
    var matches = CONTEST_STATE.matches;
    var done = 0, failed = 0;
    function submitOne() {
      if (done >= matchIds.length) {
        if (bottomBtn) { bottomBtn.disabled = true; bottomBtn.textContent = failed ? ('失败 ' + failed + ' 个') : '已投票'; }
        if (headerBtn && !failed) { headerBtn.style.display = 'none'; }
        if (failed) toast(failed + ' 个对阵投票失败');
        else toast('全部投票成功');
        return;
      }
      var matchId = Number(matchIds[done]);
      var side = CONTEST_STATE.myVotes[matchId];
      var match = null;
      for (var i = 0; i < matches.length; i++) {
        if (Number(matches[i].id) === matchId) { match = matches[i]; break; }
      }
      if (!match) { failed++; done++; submitOne(); return; }
      var entryId = side === 'a' ? Number(match.slot_a_entry_id) : Number(match.slot_b_entry_id);
      if (!entryId) { failed++; done++; submitOne(); return; }
      post('../api/moe_votes.php?action=cast', { stage_id: stage.id, match_id: matchId, entry_ids: [entryId] }).then(function (r) {
        if (!r || !r.success) failed++;
      }).catch(function () { failed++; }).finally(function () {
        done++;
        submitOne();
      });
    }
    submitOne();
  }

  function renderStageResults(stage) {
    var content = document.getElementById('moContestContent');
    var bottom = document.getElementById('moBottomBar');
    var header = document.getElementById('moHeaderSubmit');
    if (bottom) bottom.style.display = 'none';
    if (header) header.style.display = 'none';
    content.innerHTML = '<div class="mo-loading">加载结果中...</div>';
    loadStageResults(stage).then(function (data) {
      var rows = (data && data.data) || [];
      var showVotes = canShowVoteNumbers(stage, data);
      if (!rows.length) {
        content.innerHTML = '<div class="mo-empty">暂无结算结果</div>';
        return;
      }
      var html = '<div class="mo-action"><div class="mo-action-hint">' + (stage.stage_type === 'final' ? '最终名次' : '阶段结果') + '</div></div>';
      html += '<div class="mo-char-grid">';
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        var rank = Number(row.rank_no || i + 1);
        var medal = rank === 1 ? '冠军' : (rank === 2 ? '亚军' : (rank === 3 ? '季军' : ('#' + rank)));
        html += '<div class="mo-char-item selected">' +
          '<div class="mo-char-avatar" style="background-image:' + (row.image_url ? 'url(' + esc(row.image_url) + ')' : avatarGradient(i)) + '">' +
            '<div class="mo-char-check">' + rank + '</div>' +
          '</div>' +
          '<div class="mo-char-name">' + esc(row.title_cn || row.title || '?') + '</div>' +
          '<div class="mo-char-work">' + medal + (showVotes ? ' · ' + Number(row.votes || 0) + '票' : '') + '</div>' +
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
