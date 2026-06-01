(function () {
  'use strict';

  var STORAGE_KEY = 'language';
  var translations = {
    '返回地图': '地図に戻る',
    '返回': '戻る',
    '主题': 'テーマ',
    '切换主题': 'テーマ切替',
    '浅色模式': 'ライトモード',
    '深色模式': 'ダークモード',
    '退出登录': 'ログアウト',
    '正在进入用户中心': 'ユーザーセンターに移動しています',
    '正在确认登录状态。': 'ログイン状態を確認しています。',
    '用户中心加载失败': 'ユーザーセンターの読み込みに失敗しました',
    '刷新页面后仍失败时，请稍后再试。': '再読み込みしても失敗する場合は、時間をおいてお試しください。',
    'VNFest 用户中心': 'VNFest ユーザーセンター',
    '个人驾驶舱 · 账户、社群、活动集中处理': 'アカウント、サークル、イベントをまとめて管理',
    '用户': 'ユーザー',
    '这个人很懒，还没有填写签名。': 'まだ自己紹介が設定されていません。',
    '访客': 'ゲスト',
    '邮箱已绑定': 'メール連携済み',
    '邮箱未绑定': 'メール未連携',
    '未绑定邮箱': 'メール未連携',
    'QQ 已绑定': 'QQ 連携済み',
    'QQ 未绑定': 'QQ 未連携',
    'Discord 已绑定': 'Discord 連携済み',
    'Discord 未绑定': 'Discord 未連携',
    '已绑定': '連携済み',
    '未绑定': '未連携',
    '账号完整度': 'アカウント完成度',
    '用户中心统计': 'ユーザーセンター統計',
    '我的同好会': '参加中の同好会',
    '未读通知': '未読通知',
    '今日待办': '今日のタスク',
    '待处理申请': '処理待ち申請',
    '同好会成员绑定审批': '同好会メンバー連携の承認',
    '审核、绑定、系统消息': '審査、連携、システム通知',
    '已报名活动': '申込済みイベント',
    '来自活动日历报名记录': 'イベントカレンダーの申込記録',
    '编辑资料': 'プロフィール編集',
    '昵称、签名、头像': 'ニックネーム、自己紹介、アイコン',
    '账户安全': 'アカウント安全',
    '邮箱、密码、社交绑定': 'メール、パスワード、外部連携',
    '显示与壁纸': '表示と壁紙',
    '主题、页面壁纸': 'テーマ、ページ壁紙',
    '绑定同好会': '同好会を連携',
    '绑定码加入、查看身份': '連携コードで参加、権限を確認',
    '高阶模块': '拡張機能',
    '活动投稿': 'イベント投稿',
    '提交活动到日历': 'イベントをカレンダーに投稿',
    'GalOnly 通道': 'GalOnly 申請',
    '高校专属摊位申请': '高校向けブース申請',
    '同好会管理': '同好会管理',
    '负责人可用': '代表者が利用可能',
    '刊物管理': '刊行物管理',
    '负责人 / 超管可用': '代表者 / 管理者が利用可能',
    'GalOnly 审核': 'GalOnly 審査',
    '审核员可用': '審査担当が利用可能',
    '总览': '概要',
    '账户': 'アカウント',
    '同好会': '同好会',
    '通知': '通知',
    '查看': '表示',
    '最近通知': '最近の通知',
    '报名活动': '申込済みイベント',
    '活动日历': 'イベントカレンダー',
    '个人资料': 'プロフィール',
    '公开展示信息': '公開プロフィール',
    '头像': 'アイコン',
    '确认使用这张头像？': 'このアイコンを使用しますか？',
    '确认上传': 'アップロード確定',
    '取消': 'キャンセル',
    '昵称': 'ニックネーム',
    '签名': '自己紹介',
    '保存资料': 'プロフィール保存',
    '邮箱与密码': 'メールとパスワード',
    '用于找回账号与重要通知': 'アカウント復旧と重要通知に使用',
    '解绑': '解除',
    '绑定/更换邮箱': 'メール連携 / 変更',
    '验证码': '認証コード',
    '发送验证码': '認証コード送信',
    '绑定邮箱': 'メール連携',
    '当前密码': '現在のパスワード',
    '新密码': '新しいパスワード',
    '修改密码': 'パスワード変更',
    '社交账号': '外部アカウント',
    '第三方登录绑定': '外部ログイン連携',
    '绑定': '連携',
    '本机偏好': 'この端末の設定',
    '颜色模式': 'カラーモード',
    '深色 / 浅色会保存在当前浏览器': 'ダーク / ライトはこのブラウザに保存されます',
    '页面壁纸': 'ページ壁紙',
    '选择后同步到支持壁纸的页面': '対応ページに壁紙設定を同期します',
    '使用负责人提供的绑定码': '代表者から受け取った連携コードを使用',
    '绑定码': '連携コード',
    '输入绑定码': '連携コードを入力',
    '加入同好会': '同好会に参加',
    '成员申请': 'メンバー申請',
    '进入': '開く',
    '管理': '管理',
    '通知中心': '通知センター',
    '全部已读': 'すべて既読',
    '暂无同好会': '同好会はまだありません',
    '绑定后会显示在这里。': '連携するとここに表示されます。',
    '暂无通知': '通知はありません',
    '没有需要处理的新消息。': '処理が必要な新着通知はありません。',
    '松开刷新': '離して更新',
    '下拉刷新': '下に引いて更新',
    '刷新中...': '更新中...',
    '上传中...': 'アップロード中...',
    '保存中...': '保存中...',
    '保存': '保存',
    '通过': '承認',
    '拒绝': '拒否',
    '查看详情': '詳細を見る',
    '联系负责人': '代表者に連絡',
    '退出同好会': '同好会を退会',

    'VNFest Observatory': 'VNFest Observatory',
    '个人星图观测台': '個人星図観測台',
    '联合星图观测台': '連合星図観測台',
    '拖拽移动星域，滚轮或底部控件缩放。点选星点查看同好会，切换到联合星图可维护地区高校联合。': '星域をドラッグで移動し、ホイールまたは下部コントロールで拡大縮小できます。星点を選ぶと同好会を確認でき、連合星図では地域の高校連合を管理できます。',
    '展示已加入的同好会星点，快速查看资料、联系方式与所属学校。': '参加中の同好会を星点として表示し、プロフィール、連絡先、所属学校を素早く確認できます。',
    '按地区联合组织同好会，维护成员、绑定群组并生成星图连接。': '地域連合ごとに同好会を整理し、メンバー、連携グループ、星図のつながりを管理します。',
    '星点': '星点',
    '连接': '接続',
    '联合': '連合',
    '个人星图': '個人星図',
    '联合星图': '連合星図',
    '搜索同好会 / 联合': '同好会 / 連合を検索',
    '搜索同好会或联合': '同好会または連合を検索',
    '清空搜索': '検索をクリア',
    '创建联合': '連合を作成',
    '+ 创建联合': '+ 連合を作成',
    '还没有可观测的星点': '観測できる星点はまだありません',
    '个人星域尚未点亮': '個人星域はまだ点灯していません',
    '加入同好会后，它们会成为你的星点；也可以先切换到联合星图探索现有高校联合。': '同好会に参加すると星点として表示されます。先に連合星図へ切り替えて既存の高校連合を探索することもできます。',
    '联合星域等待建立': '連合星域はまだ作成されていません',
    '点击右上角创建联合，绑定群组并添加成员同好会，星图会自动生成连接关系。': '右上の連合作成からグループを連携し、メンバー同好会を追加すると、星図の接続が自動生成されます。',
    '联合详情': '連合詳細',
    '编辑联合': '連合を編集',
    '删除联合': '連合を削除',
    '确认删除？': '削除しますか？',
    '创建联合': '連合を作成',
    '联合名称': '連合名',
    '例如：北京高校联合': '例：東京高校連合',
    '地区标签': '地域ラベル',
    '例如：华北、华东、全国': '例：関東、関西、全国',
    '联合说明': '連合説明',
    '描述这个联合...': 'この連合について説明...',
    '绑定群组': 'グループ連携',
    '搜索要绑定的同好会群...': '連携する同好会グループを検索...',
    '星点颜色': '星点カラー',
    '金色': 'ゴールド',
    '白色': 'ホワイト',
    '蓝色': 'ブルー',
    '紫色': 'パープル',
    '青色': 'シアン',
    '粉色': 'ピンク',
    '成员同好会': 'メンバー同好会',
    '搜索同好会': '同好会を検索',
    '搜索学校': '学校を検索',
    '搜索同好会...': '同好会を検索...',
    '搜索学校名称...': '学校名を検索...',
    '未找到匹配的星点': '一致する星点が見つかりません',
    '加载中...': '読み込み中...',
    '复制': 'コピー',
    '已复制': 'コピーしました',
    '移除': '削除',
    '删除联合': '連合を削除',
    '复位': 'リセット',
    '聚焦': 'フォーカス',
    '沉浸': '没入',
    '显示': '表示',
    '缩小': '縮小',
    '放大': '拡大',
    '复位视图': '表示をリセット',
    '聚焦选中星体': '選択中の星点へ移動',
    '隐藏辅助面板': '補助パネルを隠す',

    '刷新': '更新'
  };

  function getLang() {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'ja' ? 'ja' : 'zh';
    } catch (error) {
      return 'zh';
    }
  }

  function setLang(lang) {
    var previous = getLang();
    var next = lang === 'ja' ? 'ja' : 'zh';
    try { localStorage.setItem(STORAGE_KEY, lang === 'ja' ? 'ja' : 'zh'); } catch (error) {}
    if (previous === 'ja' && next === 'zh') {
      window.location.reload();
      return;
    }
    apply();
    installObserver();
    window.dispatchEvent(new CustomEvent('language:changed', { detail: { language: getLang() } }));
  }

  function translate(value) {
    if (getLang() !== 'ja') return value;
    return Object.prototype.hasOwnProperty.call(translations, value) ? translations[value] : value;
  }

  function translateText(value) {
    if (getLang() !== 'ja' || !value) return value;
    var leading = value.match(/^\s*/)[0];
    var trailing = value.match(/\s*$/)[0];
    var core = value.trim();
    return leading + translate(core) + trailing;
  }

  function shouldSkip(node) {
    var parent = node.parentElement;
    if (!parent) return true;
    return !!parent.closest('script,style,textarea,code,pre,[data-i18n-skip]');
  }

  function applyText(root) {
    var walker = document.createTreeWalker(root || document.body, NodeFilter.SHOW_TEXT);
    var nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(function (node) {
      if (shouldSkip(node)) return;
      var next = translateText(node.nodeValue);
      if (next !== node.nodeValue) node.nodeValue = next;
    });
  }

  function applyAttrs(root) {
    var attrs = ['placeholder', 'title', 'aria-label', 'alt'];
    var scope = root || document;
    var elements = [];
    if (scope.nodeType === 1 && scope.matches && scope.matches('[placeholder],[title],[aria-label],[alt]')) {
      elements.push(scope);
    }
    if (scope.querySelectorAll) {
      scope.querySelectorAll('[placeholder],[title],[aria-label],[alt]').forEach(function (el) {
        elements.push(el);
      });
    }
    elements.forEach(function (el) {
      attrs.forEach(function (attr) {
        var value = el.getAttribute(attr);
        var next = translate(value);
        if (next !== value) el.setAttribute(attr, next);
      });
    });
  }

  function updateButtons() {
    document.querySelectorAll('[data-i18n-lang]').forEach(function (button) {
      var active = button.getAttribute('data-i18n-lang') === getLang();
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function installStyles() {
    if (document.getElementById('pageI18nStyle')) return;
    var style = document.createElement('style');
    style.id = 'pageI18nStyle';
    style.textContent = [
      '.page-lang-switch{display:inline-flex;align-items:center;gap:3px;padding:3px;border:1px solid var(--border,rgba(0,0,0,.14));border-radius:8px;background:var(--input-bg,rgba(255,255,255,.35));}',
      '.page-lang-switch button{min-height:28px;padding:4px 9px;border:0;border-radius:6px;background:transparent;color:var(--muted,#6c665f);font:inherit;font-size:12px;font-weight:800;cursor:pointer;}',
      '.page-lang-switch button.active{background:var(--primary,#d94135);color:#fff;}',
      '.page-lang-switch button:focus-visible{outline:2px solid var(--primary,#d94135);outline-offset:2px;}'
    ].join('');
    document.head.appendChild(style);
  }

  function apply() {
    document.documentElement.lang = getLang() === 'ja' ? 'ja' : 'zh-CN';
    installStyles();
    applyText(document.body);
    applyAttrs(document);
    updateButtons();
  }

  var observer = null;
  var observerTimer = 0;
  var pendingRoots = [];

  function disconnectObserver() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    clearTimeout(observerTimer);
    observerTimer = 0;
    pendingRoots = [];
  }

  function mutationRoot(node) {
    if (!node) return null;
    if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
    if (!node || !node.closest) return null;
    if (node.closest('script,style,textarea,code,pre,[data-i18n-skip]')) return null;
    return node;
  }

  function queueMutationRoot(node) {
    var root = mutationRoot(node);
    if (!root) return;
    pendingRoots.push(root);
  }

  function applyPendingRoots() {
    var roots = pendingRoots;
    pendingRoots = [];
    var uniqueRoots = [];
    roots.forEach(function (root) {
      if (!root || !document.body || !document.body.contains(root)) return;
      for (var i = 0; i < uniqueRoots.length; i++) {
        if (uniqueRoots[i] === root || uniqueRoots[i].contains(root)) return;
        if (root.contains(uniqueRoots[i])) uniqueRoots.splice(i--, 1);
      }
      uniqueRoots.push(root);
    });
    uniqueRoots.forEach(function (root) {
      applyText(root);
      applyAttrs(root);
    });
    updateButtons();
  }

  function installObserver() {
    if (getLang() !== 'ja') {
      disconnectObserver();
      return;
    }
    if (observer || !window.MutationObserver || !document.body) return;
    observer = new MutationObserver(function (mutations) {
      if (getLang() !== 'ja') {
        disconnectObserver();
        return;
      }
      mutations.forEach(function (mutation) {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach(queueMutationRoot);
          if (!mutation.addedNodes.length) queueMutationRoot(mutation.target);
        } else {
          queueMutationRoot(mutation.target);
        }
      });
      if (!pendingRoots.length) return;
      clearTimeout(observerTimer);
      observerTimer = setTimeout(function () {
        observerTimer = 0;
        applyPendingRoots();
      }, 80);
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  window.PageI18n = { t: translate, apply: apply, getLang: getLang, setLang: setLang };

  document.addEventListener('click', function (event) {
    var button = event.target.closest('[data-i18n-lang]');
    if (!button) return;
    setLang(button.getAttribute('data-i18n-lang'));
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      apply();
      installObserver();
    });
  } else {
    apply();
    installObserver();
  }
})();
