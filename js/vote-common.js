'use strict';

function $vote(id) { return document.getElementById(id); }
function escVote(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
  });
}
function toastVote(el, message) {
  if (!el) return;
  el.textContent = message;
  el.classList.add('show');
  setTimeout(function () { el.classList.remove('show'); }, 1800);
}
function apiVote(url, options) {
  return fetch(url, Object.assign({ credentials: 'same-origin', cache: 'no-store' }, options || {})).then(function (r) {
    return r.text().then(function (text) {
      try {
        return JSON.parse(text);
      } catch (e) {
        console.error('[apiVote] JSON parse failed for: ' + url);
        console.error('[apiVote] HTTP status: ' + r.status);
        console.error('[apiVote] Response preview (first 500 chars): ' + text.substring(0, 500));
        throw new Error('JSON parse failed (HTTP ' + r.status + '): ' + text.substring(0, 120));
      }
    });
  }).catch(function (error) {
    if (error && /^JSON parse failed/.test(error.message || '')) throw error;
    throw new Error('网络异常或接口不可用，请稍后重试');
  });
}
function postVote(url, body) {
  return apiVote(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
}
function typeLabelVote(type) { return type === 'moe' ? '萌战' : '十二器'; }
function sourceLabelVote(type) {
  return ({ bangumi_subject: 'Bangumi 作品', bangumi_character: 'Bangumi 角色', vndb_vn: 'VNDB', manual: '手动' })[type] || type || '来源';
}
function statusLabelVote(status) {
  return ({ draft: '草稿', published: '已发布', running: '进行中', ended: '已结束', archived: '已归档', suspended: '已暂停' })[status] || status || '未知';
}
function tokenBadgeVote(type) {
  return '<span class="token ' + (type === 'moe' ? 'moe' : '') + '">' + (type === 'moe' ? '萌' : '12') + '</span>';
}
function openVotingStageVote(stages) {
  return stages.find(function (s) { return s.status === 'open' && s.vote_mode !== 'nomination'; });
}
function openNominationStageVote(stages) {
  return stages.find(function (s) { return s.status === 'open' && s.stage_type === 'nomination'; });
}
function parseConfigVote(s) {
  if (!s) return {};
  if (typeof s === 'object') return s;
  try { return JSON.parse(s); } catch (_) { return {}; }
}

// === Theme ===
(function () {
  var html = document.documentElement;
  var MQ = window.matchMedia('(prefers-color-scheme: dark)');

  function resolveTheme() {
    var saved = localStorage.getItem('themePreference');
    if (saved === 'light' || saved === 'dark') return saved;
    return MQ.matches ? 'dark' : 'light';
  }

  function applyTheme(t) {
    html.setAttribute('data-theme', t);
  }

  function handleChange() {
    var saved = localStorage.getItem('themePreference');
    if (!saved || saved === 'system') applyTheme(resolveTheme());
  }

  applyTheme(resolveTheme());
  if (typeof MQ.addEventListener === 'function') {
    MQ.addEventListener('change', handleChange);
  } else if (typeof MQ.addListener === 'function') {
    MQ.addListener(handleChange);
  }
})();
