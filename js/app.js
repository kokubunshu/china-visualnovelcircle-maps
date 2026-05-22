// ==========================================
// 全国 Galgame 同好会地图 - 完整版
// ==========================================

// ==========================================
// 1. 常量与全局状态管理
// ==========================================
const State = {
  bandoriRows: [],
  provinceGroupsMap: new Map(),
  selectedProvinceKey: null,
  mapViewState: null,
  mapSwitchToken: 0,
  selectedCardAnimToken: 0,
  activeBubbleState: null,
  bubbleAnimToken: 0,
  invertCtrlBubble: false,
  globalSearchEnabled: false,
  themePreference: 'system',
  systemThemeMediaQuery: null,
  currentDetailProvinceName: '',
  currentDetailRows: [],
  listQuery: '',
  listType: 'all',
  listSort: 'default',
  listRegionFilter: 'china',
  currentDataSource: 'none',
  mobileSheetHeightPx: null,
  viewMode: 'map',
  currentCountry: 'china',
  japanRows: [],
  japanGroupsMap: new Map()
};

let currentUser = null;
let currentEditClubId = null;
let wikiIndexCache = null;
let wikiIndexPromise = null;

// 顶层用户信息框元素引用
function getTopEls() {
  return {
    avatar: document.getElementById('topUserAvatar'),
    name: document.getElementById('topUserName'),
    badge: document.getElementById('topUserRoleBadge'),
    loginBtn: document.getElementById('topLoginBtn'),
    accountBtn: document.getElementById('topAccountBtn'),
    adminBtn: document.getElementById('topAdminBtn'),
    navRow: document.getElementById('userNavRow'),
    card: document.getElementById('userInfoCard')
  };
}

const ROLE_HIERARCHY = { visitor: 0, member: 1, manager: 2, representative: 3, super_admin: 4 };

async function checkAuth() {
    try {
        const resp = await fetch('./api/auth.php?action=me', { credentials: 'same-origin' });
        const data = await resp.json();
        currentUser = data;
    } catch {
        currentUser = { logged_in: false, user: null };
    }
    updateUserUI();
    window.dispatchEvent(new CustomEvent('auth:updated'));
    return currentUser;
}

function getEffectiveLevel() {
    // 取系统角色与俱乐部角色中的最高等级
    let level = ROLE_HIERARCHY[currentUser?.user?.role] ?? -1;
    if (currentUser?.memberships) {
        for (const m of currentUser.memberships) {
            if (m.status === 'active') {
                const clubLevel = ROLE_HIERARCHY[m.role] ?? -1;
                if (clubLevel > level) level = clubLevel;
            }
        }
    }
    return level;
}

function getEffectiveRole() {
    const level = getEffectiveLevel();
    for (const [role, lv] of Object.entries(ROLE_HIERARCHY)) {
        if (lv === level) return role;
    }
    return currentUser?.user?.role || 'visitor';
}

function hasRole(minRole) {
    if (!currentUser?.logged_in || !currentUser?.user) return false;
    const requiredLevel = ROLE_HIERARCHY[minRole] ?? 99;
    return getEffectiveLevel() >= requiredLevel;
}

function updateUserUI() {
    // 更新顶层用户信息框
    const top = getTopEls();
    if (!top.name || !top.loginBtn || !top.accountBtn) return;
    if (currentUser?.logged_in && currentUser?.user) {
        top.loginBtn.style.display = 'none';
        top.accountBtn.style.display = '';
        // Update avatar
        if (top.avatar) {
            if (currentUser.user.avatar_url) {
                top.avatar.innerHTML = '<img src="' + Utils.escapeHTML(Utils.resolveMediaUrl(currentUser.user.avatar_url)) + '" alt="" />';
            } else {
                top.avatar.textContent = (currentUser.user.nickname || currentUser.user.username || 'U')[0].toUpperCase();
                top.avatar.style.background = 'linear-gradient(135deg,#667eea,#764ba2)';
                top.avatar.style.color = '#fff';
            }
        }
        if (top.name) top.name.textContent = currentUser.user.nickname || currentUser.user.username || '用户';
        // Role badge
        if (top.badge) {
            const roleNames = {
                visitor: __('settingsRoleVisitor'),
                member: __('settingsRoleMember'),
                manager: __('settingsRoleManager'),
                representative: __('settingsRoleRep'),
                super_admin: __('settingsRoleAdmin')
            };
            const roleColors = {
                visitor: { bg: 'rgba(128,128,128,0.12)', color: '#888' },
                member: { bg: 'rgba(76,175,80,0.12)', color: '#4caf50' },
                manager: { bg: 'rgba(33,150,243,0.12)', color: '#2196f3' },
                representative: { bg: 'rgba(255,152,0,0.12)', color: '#ff9800' },
                super_admin: { bg: 'rgba(233,30,99,0.12)', color: '#e91e63' }
            };
            var text, s;
            if (currentUser.user.is_audit) {
                text = __('roleAudit');
                s = { bg: 'rgba(233,30,99,0.12)', color: '#e91e63' };
            } else {
                const role = getEffectiveRole();
                text = roleNames[role] || '';
                s = roleColors[role] || roleColors.visitor;
            }
            top.badge.textContent = text;
            top.badge.style.display = text ? '' : 'none';
            top.badge.style.background = s.bg;
            top.badge.style.color = s.color;
        }
        // Audit badge (for is_audit users) — using same element as role badge
        var oldAuditBadge = document.getElementById('topAuditBadge');
        if (oldAuditBadge) oldAuditBadge.style.display = 'none';
        // Admin button
        if (top.adminBtn) {
            top.adminBtn.style.display = hasRole('manager') ? '' : 'none';
        }
        // 通知铃铛（登录时显示）
        var bellWrap = document.getElementById('notifBellWrap');
        if (bellWrap) bellWrap.style.display = '';
    } else {
        top.loginBtn.style.display = '';
        top.accountBtn.style.display = 'none';
        if (top.adminBtn) top.adminBtn.style.display = 'none';
        if (top.avatar) {
            top.avatar.textContent = '?';
            top.avatar.style.background = '#e0e0e0';
            top.avatar.style.color = '#999';
            top.avatar.innerHTML = '';
        }
        if (top.name) top.name.textContent = __('settingsRoleVisitor');
        if (top.badge) top.badge.style.display = 'none';
        // 通知铃铛（未登录时隐藏）
        var bellWrap = document.getElementById('notifBellWrap');
        if (bellWrap) { bellWrap.style.display = 'none'; stopNotificationPolling(); }
    }
}

function openAccountModal(view) {
    const modal = document.getElementById('accountModal');
    if (!modal) return;
    document.getElementById('accountLoginForm').style.display = view === 'login' ? 'block' : 'none';
    document.getElementById('accountRegisterForm').style.display = view === 'register' ? 'block' : 'none';
    document.getElementById('accountSettings').style.display = view === 'settings' ? 'block' : 'none';
    document.getElementById('accountChangePasswordForm').style.display = 'none';
    document.getElementById('accountBindEmailForm').style.display = 'none';
    const lm = document.getElementById('accLoginMessage');
    const rm = document.getElementById('accRegMessage');
    if (lm) lm.textContent = '';
    if (rm) rm.textContent = '';
    // 触发 OAuth 配置检测
    if (view === 'login') checkOAuthConfig();
    if (view === 'settings') {
        // 默认激活档案标签
        const defaultTab = document.querySelector('.vn-tab[data-tab="profile"]');
        if (defaultTab) switchVnTab(defaultTab);
        renderVNProfile();
        // 填充签名输入框
        var bioInput = document.getElementById('accBioInput');
        if (bioInput && currentUser?.user) {
            bioInput.value = currentUser.user.profile_bio || '';
        }
    }
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
}

function closeAccountModal() {
    const modal = document.getElementById('accountModal');
    if (!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    // 关闭时销毁裁剪实例
    destroyCropper();
    document.getElementById('avatarCropModal').style.display = 'none';
}

function goUserCenter(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === 'function') {
            event.stopImmediatePropagation();
        }
    }
    window.location.assign('./user.html');
}

document.addEventListener('click', function(event) {
    var target = event.target;
    if (target && target.closest && target.closest('#topAccountBtn, #listAccountBtn')) {
        goUserCenter(event);
    }
}, true);

// 页面加载时检查登录状态
checkAuth();

// 关闭弹窗
document.addEventListener('click', (e) => {
    if (e.target.id === 'accountModalClose') {
        closeAccountModal();
    }
});

// 点击遮罩关闭
document.addEventListener('click', (e) => {
    const modal = document.getElementById('accountModal');
    if (e.target === modal && modal?.classList.contains('open')) {
        closeAccountModal();
    }
});

// 申请绑定弹窗 — 关闭
document.addEventListener('click', (e) => {
    if (e.target.id === 'membershipApplyClose') {
        closeMembershipApplyModal();
    }
});
// 申请绑定弹窗 — 点击遮罩关闭
document.addEventListener('click', (e) => {
    const modal = document.getElementById('membershipApplyModal');
    if (e.target === modal && modal?.classList.contains('open')) {
        closeMembershipApplyModal();
    }
});
// 申请绑定弹窗 — 提交
document.addEventListener('click', (e) => {
    if (e.target.id === 'membershipApplySubmitBtn') {
        submitMembershipApply();
    }
});

// 切换 → 注册视图
document.addEventListener('click', (e) => {
    if (e.target.id === 'accShowRegisterBtn') {
        document.getElementById('accountLoginForm').style.display = 'none';
        document.getElementById('accountRegisterForm').style.display = 'block';
    }
});

// 切换 → 登录视图
document.addEventListener('click', (e) => {
    if (e.target.id === 'accShowLoginBtn') {
        document.getElementById('accountRegisterForm').style.display = 'none';
        document.getElementById('accountLoginForm').style.display = 'block';
    }
});

// 账号弹窗 — 登录
document.addEventListener('click', async (e) => {
    if (e.target.id === 'accLoginBtn') {
        const username = document.getElementById('accLoginUsername')?.value.trim();
        const password = document.getElementById('accLoginPassword')?.value;
        const msgEl = document.getElementById('accLoginMessage');
        if (!username || !password) { if (msgEl) { msgEl.textContent = '请输入用户名/邮箱和密码'; msgEl.style.color = '#e74c3c'; } return; }
        if (password.length < 6) { if (msgEl) { msgEl.textContent = '密码至少 6 位'; msgEl.style.color = '#e74c3c'; } return; }
        if (password.length < 6) { if (msgEl) { msgEl.textContent = '密码至少 6 位'; msgEl.style.color = '#e74c3c'; } return; }
        try {
            const resp = await fetch('./api/auth.php?action=login_local', {
                method: 'POST', credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await resp.json();
            if (data.success) {
                currentUser = { logged_in: true, user: data.user, memberships: data.memberships || [] };
                closeAccountModal();
                setTimeout(() => location.reload(), 100);
            } else {
                if (msgEl) { msgEl.textContent = data.message || '登录失败'; msgEl.style.color = '#e74c3c'; }
            }
        } catch { if (msgEl) { msgEl.textContent = '网络错误，请重试'; msgEl.style.color = '#e74c3c'; } }
    }
});

let registerCodeTimer = null;

document.addEventListener('click', async (e) => {
    if (e.target.id === 'accRegSendCodeBtn') {
        const email = document.getElementById('accRegEmail')?.value.trim();
        const msgEl = document.getElementById('accRegMessage');
        if (!email) {
            if (msgEl) { msgEl.textContent = '请输入邮箱地址'; msgEl.style.color = '#e74c3c'; }
            return;
        }
        const btn = document.getElementById('accRegSendCodeBtn');
        btn.disabled = true;
        btn.textContent = '发送中...';
        if (msgEl) msgEl.textContent = '';
        try {
            const resp = await fetch('./api/auth.php?action=send_register_code', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            });
            const data = await resp.json();
            if (data.success) {
                if (msgEl) { msgEl.textContent = data.message || '验证码已发送'; msgEl.style.color = '#27ae60'; }
                document.getElementById('accRegCode')?.focus();
                let countdown = 60;
                const tick = () => {
                    btn.textContent = countdown + 's';
                    if (--countdown <= 0) {
                        btn.disabled = false;
                        btn.textContent = '重新发送';
                        if (registerCodeTimer) { clearInterval(registerCodeTimer); registerCodeTimer = null; }
                    }
                };
                if (registerCodeTimer) clearInterval(registerCodeTimer);
                registerCodeTimer = setInterval(tick, 1000);
                tick();
            } else {
                if (msgEl) { msgEl.textContent = data.message || '发送失败'; msgEl.style.color = '#e74c3c'; }
                btn.disabled = false;
                btn.textContent = '重新发送';
            }
        } catch {
            if (msgEl) { msgEl.textContent = '网络错误'; msgEl.style.color = '#e74c3c'; }
            btn.disabled = false;
            btn.textContent = '重新发送';
        }
    }
});

// 账号弹窗 — 注册
document.addEventListener('click', async (e) => {
    if (e.target.id === 'accRegisterBtn') {
        const username = document.getElementById('accRegUsername')?.value.trim();
        const password = document.getElementById('accRegPassword')?.value;
        const email = document.getElementById('accRegEmail')?.value.trim();
        const code = document.getElementById('accRegCode')?.value.trim();
        const msgEl = document.getElementById('accRegMessage');
        if (!username || !password || !email || !code) { if (msgEl) { msgEl.textContent = '请填写用户名、密码、邮箱和验证码'; msgEl.style.color = '#e74c3c'; } return; }
        if (username.length < 2 || username.length > 20) { if (msgEl) { msgEl.textContent = '用户名需 2-20 个字符'; msgEl.style.color = '#e74c3c'; } return; }
        if (password.length < 6) { if (msgEl) { msgEl.textContent = '密码至少 6 位'; msgEl.style.color = '#e74c3c'; } return; }
        if (!/^\d{6}$/.test(code)) { if (msgEl) { msgEl.textContent = '请输入 6 位邮箱验证码'; msgEl.style.color = '#e74c3c'; } return; }
        try {
            const resp = await fetch('./api/auth.php?action=register_local', {
                method: 'POST', credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password, email, code })
            });
            const data = await resp.json();
            if (data.success) {
                currentUser = { logged_in: true, user: data.user, memberships: data.memberships || [] };
                closeAccountModal();
                setTimeout(() => location.reload(), 100);
            } else {
                if (msgEl) { msgEl.textContent = data.message || '注册失败'; msgEl.style.color = '#e74c3c'; }
            }
        } catch { if (msgEl) { msgEl.textContent = '网络错误，请重试'; msgEl.style.color = '#e74c3c'; } }
    }
});

// 账号弹窗 — 退出登录
document.addEventListener('click', async (e) => {
    if (e.target.id === 'accLogoutBtn') {
        try {
            await fetch('./api/auth.php?action=logout', { credentials: 'same-origin' });
        } catch {}
        currentUser = { logged_in: false, user: null };
        closeAccountModal();
        setTimeout(() => location.reload(), 100);
    }
});

// VN 档案标签切换
document.addEventListener('click', function(e) {
    var tab = e.target.closest('.vn-tab');
    if (tab) { switchVnTab(tab); return; }
    var colTab = e.target.closest('.vn-collection-tab');
    if (colTab) { renderCollection(colTab.dataset.collection); return; }
});

// ====== 个人设置刷新 ======
async function refreshProfile() {
    if (!currentUser?.logged_in || !currentUser?.user) return;

    const user = currentUser.user;
    const roleNames = { visitor: __('settingsRoleVisitor'), member: __('settingsRoleMember'), manager: __('settingsRoleManager'), representative: __('settingsRoleRep'), super_admin: __('settingsRoleAdmin') };
    const clubRoleNames = { member: __('settingsRoleMember'), manager: __('settingsRoleManager'), representative: __('settingsRoleRep') };
    const effectiveRole = getEffectiveRole();

    // 头像
    const avatar = document.getElementById('accUserAvatar');
    if (avatar) avatar.src = Utils.resolveMediaUrl(user.avatar_url || '');

    // 昵称
    const nicknameInput = document.getElementById('accNicknameInput');
    if (nicknameInput) nicknameInput.value = user.nickname || user.username || '';

    // 用户名（只读）
    const usernameEl = document.getElementById('accSettingsUsername');
    if (usernameEl) usernameEl.textContent = user.username || '';

    // 等级
    const roleEl = document.getElementById('accSettingsRole');
    if (roleEl) roleEl.textContent = roleNames[effectiveRole] || roleNames[user.role] || '';

    // 邮箱
    const emailEl = document.getElementById('accSettingsEmail');
    const bindEmailBtn = document.getElementById('accSettingsBindEmailBtn');
    const unbindEmailBtn = document.getElementById('accSettingsUnbindEmailBtn');
    if (emailEl) {
        if (user.email) {
            emailEl.textContent = user.email;
            emailEl.className = 'settings-value';
            if (bindEmailBtn) bindEmailBtn.textContent = '更换';
            if (unbindEmailBtn) unbindEmailBtn.style.display = '';
        } else {
            emailEl.textContent = '未绑定';
            emailEl.className = 'settings-value idle';
            if (bindEmailBtn) bindEmailBtn.textContent = '绑定';
            if (unbindEmailBtn) unbindEmailBtn.style.display = 'none';
        }
    }

    // 第三方绑定状态
    loadSocialBindStatus();

    // 管理按钮
    const clubManageBtn = document.getElementById('accClubManageBtn');
    if (clubManageBtn) clubManageBtn.style.display = hasRole('manager') ? '' : 'none';
    const pubManageBtn = document.getElementById('accPublicationManageBtn');
    if (pubManageBtn) pubManageBtn.style.display = hasRole('manager') ? '' : 'none';

    // 加载同好会列表
    renderClubMemberships();

    // 绑定码加入
    const bindCodeBtn = document.getElementById('bindCodeJoinBtn');
    const bindCodeInput = document.getElementById('bindCodeInput');
    const bindCodeMsg = document.getElementById('bindCodeMessage');
    if (bindCodeBtn && bindCodeInput) {
      const doBindRedeem = async () => {
        const code = bindCodeInput.value.trim().toUpperCase();
        if (!code) { bindCodeMsg.textContent = '请输入绑定码'; return; }
        bindCodeMsg.textContent = '⏳ 验证中...';
        bindCodeBtn.disabled = true;
        try {
          const resp = await fetch('api/club_codes.php?action=redeem', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code }),
            credentials: 'same-origin',
          });
          const data = await resp.json();
          if (data.success) {
            bindCodeMsg.textContent = '✅ ' + data.message;
            bindCodeInput.value = '';
            renderClubMemberships(); // 刷新列表
          } else {
            bindCodeMsg.textContent = '❌ ' + (data.message || '加入失败');
          }
        } catch (e) {
          bindCodeMsg.textContent = '❌ 网络错误';
        } finally {
          bindCodeBtn.disabled = false;
        }
      };
      bindCodeBtn.addEventListener('click', doBindRedeem);
      bindCodeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doBindRedeem(); });
    }
    // 更新 VN 档案卡
    renderVNProfile();
}

// ====== VN 账号页标签切换 ======
function switchVnTab(tabEl) {
    if (!tabEl) return;
    var tabBar = tabEl.closest('.vn-tab-bar');
    if (!tabBar) return;
    tabBar.querySelectorAll('.vn-tab').forEach(function(t) { t.classList.remove('active'); });
    document.querySelectorAll('.vn-tab-content').forEach(function(c) { c.classList.remove('active'); });
    tabEl.classList.add('active');
    var tabName = tabEl.dataset.tab;
    var targetMap = { profile: 'vnProfileTab', collection: 'vnCollectionTab', settings: 'vnSettingsTab' };
    var target = document.getElementById(targetMap[tabName]);
    if (target) target.classList.add('active');
    if (tabName === 'profile') renderVNProfile();
    if (tabName === 'collection') renderCollection('clubs');
}

// ====== VN 档案卡渲染 ======
function renderVNProfile() {
    if (!currentUser?.logged_in || !currentUser?.user) return;
    var user = currentUser.user;
    var memberships = currentUser.memberships || [];
    var activeMemberships = memberships.filter(function(m) { return m.status === 'active'; });

    // 角色名
    var nameEl = document.getElementById('vnCharName');
    if (nameEl) nameEl.textContent = user.nickname || user.username || '';

    // 称号
    var titleEl = document.getElementById('vnCharTitle');
    var roleNames = {
        visitor: __('vnRoleVisitor'),
        member: __('vnRoleMember'),
        manager: __('vnRoleManager'),
        representative: __('vnRoleRep'),
        super_admin: __('vnRoleAdmin')
    };
    var effectiveRole = getEffectiveRole();
    if (titleEl) titleEl.textContent = '—— ' + (roleNames[effectiveRole] || __('vnRoleDefault')) + ' ——';

    // 头像
    var avatarEl = document.getElementById('vnAvatar');
    if (avatarEl) {
        var frame = avatarEl.parentElement;
        var fallback = frame.querySelector('.vn-avatar-fallback');
        if (!fallback) {
            fallback = document.createElement('span');
            fallback.className = 'vn-avatar-fallback';
            frame.appendChild(fallback);
        }
        if (user.avatar_url) {
            avatarEl.src = Utils.resolveMediaUrl(user.avatar_url);
            avatarEl.style.display = '';
            fallback.textContent = '';
            frame.style.background = '';
        } else {
            avatarEl.style.display = 'none';
            fallback.textContent = (user.nickname || user.username || 'U')[0].toUpperCase();
            frame.style.background = '#e74c3c';
            frame.style.color = '#fff';
            frame.style.display = 'flex';
            frame.style.alignItems = 'center';
            frame.style.justifyContent = 'center';
            frame.style.fontSize = '28px';
            frame.style.fontWeight = '700';
        }
    }

    // 个性签名
    var sigEl = document.getElementById('vnSignature');
    if (sigEl) {
        sigEl.textContent = user.profile_bio
            ? '“' + user.profile_bio + '”'
            : __('vnSignatureEmpty');
    }

    // === 同好会 ===
    var clubList = document.getElementById('vnClubList');
    var statClubs = document.getElementById('statClubs');
    var clubCount = 0;
    if (clubList) {
        if (activeMemberships.length === 0) {
            clubList.innerHTML = '<div style="padding:14px;text-align:center;font-size:12px;color:var(--md-on-surface-variant);">' + __('vnNoClub') + '</div>';
        } else {
            var allClubs = [];
            if (typeof State !== 'undefined') {
                allClubs = (State.bandoriRows || []).concat(State.japanRows || []);
            }
            clubCount = activeMemberships.length;
            var roleClassMap = { member: 'vn-role-member', manager: 'vn-role-manager', representative: 'vn-role-representative', visitor: 'vn-role-visitor', super_admin: 'vn-role-super_admin' };
            var roleLabels = {
                member: __('memberRoleMember'),
                manager: __('memberRoleManager'),
                representative: __('memberRoleRep'),
                visitor: __('settingsRoleVisitor'),
                super_admin: __('settingsRoleAdmin')
            };
            clubList.innerHTML = activeMemberships.map(function(m) {
                var club = allClubs.find(function(c) { return parseInt(c.id) === parseInt(m.club_id) && (c.country || 'china') === (m.country || 'china'); });
                var clubName = club ? (club.display_name || club.name) : ('同好会 #' + m.club_id);
                var avatarHtml = club && club.logo_url
                    ? '<img src="' + escapeHtml(Utils.resolveMediaUrl(club.logo_url)) + '" alt="" class="vn-club-avatar" loading="lazy">'
                    : '<span class="vn-club-avatar">' + (clubName[0] || '?') + '</span>';
                var roleClass = roleClassMap[m.role] || 'vn-role-member';
                var roleLabel = roleLabels[m.role] || m.role;
                var joinDate = m.created_at ? m.created_at.split(' ')[0] : '';
                return '<div class="vn-club-item">' +
                    avatarHtml +
                    '<div class="vn-club-info"><div class="vn-club-name">' + escapeHtml(clubName) + '</div>' +
                    (joinDate ? '<div class="vn-club-date">' + joinDate + ' ' + __('vnJoined') + '</div>' : '') +
                    '</div>' +
                    '<span class="vn-club-role ' + roleClass + '">' + roleLabel + '</span>' +
                    '</div>';
            }).join('');
        }
    }
    if (statClubs) statClubs.textContent = String(clubCount);

    // 统计数据
    var statPubs = document.getElementById('statPubs');
    if (statPubs) statPubs.textContent = '0';
    var statEvents = document.getElementById('statEvents');
    if (statEvents) {
        var userId = user.id;
        fetch('./api/events.php?action=registrations').then(function(r) { return r.json(); }).then(function(d) {
            var count = (d.registrations || []).filter(function(r) { return r.user_id === userId; }).length;
            if (statEvents) statEvents.textContent = String(count);
        }).catch(function() {});
    }
    var statDays = document.getElementById('statDays');
    if (statDays) statDays.textContent = '0';

    // 底部
    var memberSince = document.getElementById('vnMemberSince');
    if (memberSince) {
        var since = user.created_at || '';
        memberSince.textContent = since ? since.split(' ')[0] + ' ' + __('vnJoined') : '';
    }
    var lastActive = document.getElementById('vnLastActive');
    if (lastActive) {
        lastActive.textContent = user.last_login_at ? user.last_login_at.split(' ')[0] + ' ' + __('vnActive') : '';
    }
}

// ====== 图鉴渲染 ======
function renderCollection(type) {
    var grid = document.getElementById('vnCollectionGrid');
    if (!grid) return;

    // 更新子标签状态
    document.querySelectorAll('.vn-collection-tab').forEach(function(t) {
        t.classList.toggle('active', t.dataset.collection === type);
    });

    if (type === 'clubs') {
        var memberships = currentUser?.memberships || [];
        var activeMemberships = memberships.filter(function(m) { return m.status === 'active'; });
        if (activeMemberships.length === 0) {
            grid.innerHTML = '<div class="vn-collection-empty">' + __('vnCollectionEmptyClubs') + '</div>';
            return;
        }
        var allClubs = [];
        if (typeof State !== 'undefined') {
            allClubs = (State.bandoriRows || []).concat(State.japanRows || []);
        }
        grid.innerHTML = activeMemberships.map(function(m) {
            var club = allClubs.find(function(c) { return parseInt(c.id) === parseInt(m.club_id) && (c.country || 'china') === (m.country || 'china'); });
            var clubName = club ? club.name : ('同好会 #' + m.club_id);
            var roleLabels = { member: __('memberRoleMember'), manager: __('memberRoleManager'), representative: __('memberRoleRep') };
            var iconHtml = club && club.logo_url
                ? '<img src="' + escapeHtml(Utils.resolveMediaUrl(club.logo_url)) + '" alt="" loading="lazy">'
                : '🏫';
            return '<div class="vn-collection-card">' +
                '<div class="vn-cc-icon">' + iconHtml + '</div>' +
                '<span class="vn-cc-name">' + escapeHtml(clubName) + '</span>' +
                '<span class="vn-cc-meta">' + (roleLabels[m.role] || m.role) + '</span>' +
                '</div>';
        }).join('');
    } else if (type === 'publications') {
        grid.innerHTML = '<div class="vn-collection-empty">' + __('vnCollectionPublicationsSoon') + '</div>';
    } else if (type === 'events') {
        var userId = currentUser?.user?.id;
        if (!userId) {
            grid.innerHTML = '<div class="vn-collection-empty">' + __('vnCollectionLoginFirst') + '</div>';
            return;
        }
        // 同时获取报名数据和活动数据
        Promise.all([
            fetch('./api/events.php?action=registrations').then(function(r) { return r.json(); }),
            fetch('./data/events.json').then(function(r) { return r.json(); })
        ]).then(function(results) {
            var regData = results[0];
            var eventsData = results[1];
            var myRegs = (regData.registrations || []).filter(function(r) { return r.user_id === userId; });
            var allEvents = eventsData.events || [];
            if (myRegs.length === 0) {
                grid.innerHTML = '<div class="vn-collection-empty">📅 还没有报名过活动，去日历看看吧！</div>';
                return;
            }
            grid.innerHTML = myRegs.map(function(r) {
                var ev = allEvents.find(function(e) { return e.id === r.event_id; });
                var evName = ev ? ev.event : ('活动 #' + r.event_id);
                return '<div class="vn-collection-card">' +
                    '<div class="vn-cc-icon">📅</div>' +
                    '<span class="vn-cc-name">' + escapeHtml(evName) + '</span>' +
                    '<span class="vn-cc-meta">' + (r.registered_at || '').split(' ')[0] + '</span>' +
                    '</div>';
            }).join('');
        }).catch(function() {
            grid.innerHTML = '<div class="vn-collection-empty">加载失败</div>';
        });
    }
}

// ====== 第三方绑定状态显示 ======
function loadSocialBindStatus() {
    const user = currentUser?.user;
    if (!user) return;

    const qqStatus = document.getElementById('accQQStatus');
    const qqBindBtn = document.getElementById('accQQBindBtn');
    const qqUnbindBtn = document.getElementById('accQQUnbindBtn');
    const discordStatus = document.getElementById('accDiscordStatus');
    const discordBindBtn = document.getElementById('accDiscordBindBtn');
    const discordUnbindBtn = document.getElementById('accDiscordUnbindBtn');

    if (qqStatus && qqBindBtn && qqUnbindBtn) {
        const qqBound = !!user.qq_bound;
        qqStatus.textContent = qqBound ? '已绑定' : '未绑定';
        qqStatus.className = 'social-bind-status ' + (qqBound ? 'bound' : 'unbound');
        qqBindBtn.style.display = qqBound ? 'none' : '';
        qqUnbindBtn.style.display = qqBound ? '' : 'none';
    }

    if (discordStatus && discordBindBtn && discordUnbindBtn) {
        const dcBound = !!user.discord_bound;
        discordStatus.textContent = dcBound ? '已绑定' : '未绑定';
        discordStatus.className = 'social-bind-status ' + (dcBound ? 'bound' : 'unbound');
        discordBindBtn.style.display = dcBound ? 'none' : '';
        discordUnbindBtn.style.display = dcBound ? '' : 'none';
    }
}

// ====== 更新昵称 ======
async function updateNickname() {
    const input = document.getElementById('accNicknameInput');
    const nickname = input?.value.trim();
    if (!nickname) { alert('昵称不能为空'); return; }
    if (nickname.length > 30) { alert('昵称不能超过 30 个字符'); return; }
    try {
        const resp = await fetch('./api/auth.php?action=update_profile', {
            method: 'POST', credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nickname }),
        });
        const data = await resp.json();
        if (data.success) {
            currentUser.user.nickname = nickname;
            updateUserUI();
            alert('昵称已更新');
        } else {
            alert(data.message || '更新失败');
        }
    } catch { alert(__('alertNetworkError')); }
}

// ====== OAuth 绑定/解绑 ======
function initiateQQBind() {
    window.location.href = './api/auth.php?action=qq_auth&mode=bind';
}

function initiateDiscordBind() {
    window.location.href = './api/auth.php?action=discord_auth&mode=bind';
}

async function unbindQQ() {
    if (!confirm(__('confirmUnbind'))) return;
    try {
        const resp = await fetch('./api/auth.php?action=unbind_qq', {
            method: 'POST', credentials: 'same-origin',
        });
        const data = await resp.json();
        if (data.success) {
            currentUser.user.qq_bound = false;
            loadSocialBindStatus();
            alert('QQ 已解绑');
        } else {
            alert(data.message || '解绑失败');
        }
    } catch { alert(__('alertNetworkError')); }
}

async function unbindDiscord() {
    if (!confirm(__('confirmUnbind'))) return;
    try {
        const resp = await fetch('./api/auth.php?action=unbind_discord', {
            method: 'POST', credentials: 'same-origin',
        });
        const data = await resp.json();
        if (data.success) {
            currentUser.user.discord_bound = false;
            loadSocialBindStatus();
            alert('Discord 已解绑');
        } else {
            alert(data.message || '解绑失败');
        }
    } catch { alert(__('alertNetworkError')); }
}

// ====== 退出同好会 ======
async function leaveClub(membershipId, clubName) {
    if (!confirm(__('confirmLeaveClub', clubName))) return;
    try {
        const resp = await fetch('./api/membership.php?action=leave', {
            method: 'POST', credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ membership_id: membershipId }),
        });
        const data = await resp.json();
        if (data.success) {
            alert(__('alertLeaveSuccess'));
            renderClubMemberships();
        } else {
            alert(data.message || __('alertOperationFailed'));
        }
    } catch { alert(__('alertNetworkError')); }
}

// ====== 修改成员角色（负责人操作） ======
async function changeMemberRole(membershipId, newRole) {
    const roleName = newRole === 'manager' ? __('memberRoleManager') : __('memberRoleMember');
    if (!confirm(__('confirmChangeRole', roleName))) return;
    try {
        const resp = await fetch('./api/membership.php?action=change_role', {
            method: 'POST', credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ membership_id: membershipId, role: newRole }),
        });
        const data = await resp.json();
        if (data.success) {
            alert(__('alertRoleUpdated'));
            // 刷新成员列表
            const modal = document.getElementById('memberListModal');
            const cid = parseInt(modal?.dataset?.clubId);
            if (cid) openMemberList(cid);
        } else {
            alert(data.message || __('alertOperationFailed'));
        }
    } catch { alert(__('alertNetworkError')); }
}

// ====== 踢出成员 ======
async function kickMember(membershipId, username) {
    if (!confirm(__('confirmKickMember', username))) return;
    try {
        const resp = await fetch('./api/membership.php?action=kick', {
            method: 'POST', credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ membership_id: membershipId }),
        });
        const data = await resp.json();
        if (data.success) {
            alert(__('alertKickSuccess'));
            const modal = document.getElementById('memberListModal');
            const cid = parseInt(modal?.dataset?.clubId);
            if (cid) openMemberList(cid);
        } else {
            alert(data.message || __('alertOperationFailed'));
        }
    } catch { alert(__('alertNetworkError')); }
}

// ====== 转让负责人 ======
async function transferRepresentative(targetMembershipId, clubId, targetName) {
    if (!confirm(__('confirmTransferRep', targetName))) return;
    try {
        const resp = await fetch('./api/membership.php?action=transfer', {
            method: 'POST', credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ membership_id: targetMembershipId, club_id: clubId }),
        });
        const data = await resp.json();
        if (data.success) {
            alert('✅ 负责人已成功转让给 ' + targetName);
            // 刷新成员列表
            const modal = document.getElementById('memberListModal');
            const cid = parseInt(modal?.dataset?.clubId);
            if (cid) openMemberList(cid);
            // 刷新当前用户状态（角色变了）
            await fetchCurrentUser();
        } else {
            alert(data.message || __('alertOperationFailed'));
        }
    } catch { alert(__('alertNetworkError')); }
}

// ====== 渲染同好会列表 ======
async function renderClubMemberships() {
    const container = document.getElementById('accClubList');
    if (!container) return;
    try {
        const resp = await fetch('./api/membership.php?action=my', { credentials: 'same-origin' });
        const data = await resp.json();
        if (!data.success || !data.memberships) {
            container.innerHTML = '<div class="settings-empty">' + __('noClub') + '</div>';
            return;
        }
        const active = data.memberships.filter(m => m.status === 'active');
        const allClubs = [...(State.bandoriRows || []), ...(State.japanRows || [])];
        const clubRoleNames = { member: __('settingsRoleMember'), manager: __('settingsRoleManager'), representative: __('settingsRoleRep') };

        if (active.length === 0) {
            container.innerHTML = '<div class="settings-empty">' + __('noClub') + '</div>';
            return;
        }

        container.innerHTML = active.map(m => {
            const club = allClubs.find(c => parseInt(c.id) === parseInt(m.club_id) && (c.country || 'china') === (m.country || 'china'));
            const clubName = club ? club.name : ('# ' + m.club_id);
            const roleName = clubRoleNames[m.role] || m.role;
            const canLeave = m.role === 'member';
            return `
                <div class="club-membership-item">
                    <div class="club-membership-info">
                        <span class="club-membership-name">${escapeHtml(clubName)}</span>
                        <span class="club-membership-role">${escapeHtml(roleName)}</span>
                    </div>
                    <div class="club-membership-actions">
                        ${canLeave ? `<button class="btn-small btn-danger" onclick="leaveClub(${m.id}, '${escapeHtml(clubName).replace(/'/g, "\\'")}')">${__('detailBtnLeave')}</button>` : ''}
                    </div>
                </div>
            `;
        }).join('');
    } catch {
        container.innerHTML = '<div class="settings-empty">' + __('memberLoadError') + '</div>';
    }
}

// ====== OAuth 配置检测 ======
async function checkOAuthConfig() {
    const container = document.getElementById('accSocialLogin');
    if (!container) return;
    try {
        const resp = await fetch('./api/auth.php?action=oauth_config', { credentials: 'same-origin' });
        const data = await resp.json();
        if (!data.success) return;
        container.style.display = (data.qq_configured || data.discord_configured) ? 'block' : 'none';
        const qqBtn = document.getElementById('qqLoginBtn');
        const dcBtn = document.getElementById('discordLoginBtn');
        if (qqBtn) qqBtn.style.display = data.qq_configured ? '' : 'none';
        if (dcBtn) dcBtn.style.display = data.discord_configured ? '' : 'none';
    } catch {}
}

// ====== OAuth 回调消息处理 ======
function handleOAuthCallback() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('oauth') === 'success') {
        const msg = params.get('message') || '操作成功';
        const toast = document.createElement('div');
        toast.className = 'oauth-toast success';
        toast.textContent = msg;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
        // 更新登录状态
        checkAuth();
        // 清理 URL
        const url = new URL(window.location);
        url.searchParams.delete('oauth');
        url.searchParams.delete('message');
        window.history.replaceState({}, '', url);
    } else if (params.get('oauth') === 'error') {
        const msg = params.get('message') || '操作失败';
        const toast = document.createElement('div');
        toast.className = 'oauth-toast error';
        toast.textContent = msg;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
        const url = new URL(window.location);
        url.searchParams.delete('oauth');
        url.searchParams.delete('message');
        window.history.replaceState({}, '', url);
    }
}

// ====== 头像上传 ======
document.addEventListener('click', (e) => {
    if (e.target.id === 'accAvatarWrap' || e.target.closest('#accAvatarWrap')) {
        document.getElementById('accAvatarInput')?.click();
    }
});
document.addEventListener('change', (e) => {
    if (e.target.id === 'accAvatarInput') {
        const file = e.target.files?.[0];
        const statusEl = document.getElementById('accAvatarStatus');
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) {
            if (statusEl) { statusEl.textContent = '图片不能超过 2MB'; statusEl.style.color = '#e74c3c'; }
            e.target.value = '';
            return;
        }
        const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (!allowed.includes(file.type)) {
            if (statusEl) { statusEl.textContent = '仅支持 JPEG/PNG/GIF/WebP'; statusEl.style.color = '#e74c3c'; }
            e.target.value = '';
            return;
        }
        // 显示裁剪弹窗
        const cropImg = document.getElementById('cropImage');
        cropImg.onload = function () {
            document.getElementById('avatarCropModal').style.display = 'flex';
            initCropper(cropImg);
        };
        cropImg.src = URL.createObjectURL(file);
        e.target.value = '';
    }
});

// ====== 头像裁剪 ======
let cropperInstance = null;
let _clubAvatarCropClubId = null;
let _clubAvatarCropCountry = 'china';

function initCropper(img) {
    destroyCropper();
    cropperInstance = new Cropper(img, {
        aspectRatio: 1,
        viewMode: 1,
        dragMode: 'move',
        autoCropArea: 1,
        cropBoxMovable: false,
        cropBoxResizable: false,
        toggleDragModeOnDblclick: false,
        background: false,
    });
}

function destroyCropper() {
    if (cropperInstance) {
        cropperInstance.destroy();
        cropperInstance = null;
    }
}

document.addEventListener('click', (e) => {
    if (e.target.id === 'cropConfirmBtn') {
        if (!cropperInstance) return;
        const canvas = cropperInstance.getCroppedCanvas({
            width: 256,
            height: 256,
            imageSmoothingEnabled: true,
            imageSmoothingQuality: 'high',
        });
        document.getElementById('avatarCropModal').style.display = 'none';
        destroyCropper();
        const clubId = _clubAvatarCropClubId;
        const clubCountry = _clubAvatarCropCountry || 'china';
        _clubAvatarCropClubId = null;
        _clubAvatarCropCountry = 'china';
        canvas.toBlob(async (blob) => {
            // 同好会头像上传
            if (clubId) {
                const statusEl = document.getElementById('editClubAvatarStatus');
                const fd = new FormData();
                fd.append('image', blob, 'avatar.png');
                fd.append('id', clubId);
                fd.append('country', clubCountry);
                if (statusEl) statusEl.textContent = '上传中...';
                try {
                    const r = await fetch('./api/club_avatar.php?scope=club', { method: 'POST', credentials: 'same-origin', body: fd });
                    const j = await r.json();
                    if (j.success) {
                        document.getElementById('editClubAvatar').src = Utils.preloadMediaUrl(j.image_url);
                        document.getElementById('editClubAvatarUrl').value = j.image_url;
                        const rmBtn = document.getElementById('editClubAvatarRemoveBtn');
                        if (rmBtn) rmBtn.style.display = '';
                        if (statusEl) { statusEl.textContent = '✅ 上传成功'; statusEl.style.color = '#27ae60'; }
                        setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 3000);
                    } else {
                        if (statusEl) { statusEl.textContent = '❌ ' + (j.message || '上传失败'); statusEl.style.color = '#e74c3c'; }
                    }
                } catch {
                    if (statusEl) { statusEl.textContent = '❌ 网络错误'; statusEl.style.color = '#e74c3c'; }
                }
                return;
            }
            // 用户头像上传
            const formData = new FormData();
            formData.append('avatar', blob, 'avatar.png');
            const statusEl = document.getElementById('accAvatarStatus');
            if (statusEl) { statusEl.textContent = '上传中...'; statusEl.style.color = ''; }
            try {
                const resp = await fetch('./api/avatar.php?action=upload', {
                    method: 'POST', credentials: 'same-origin', body: formData,
                });
                const data = await resp.json();
                if (data.success && currentUser?.user) {
                    currentUser.user.avatar_url = data.avatar_url;
                    document.getElementById('accUserAvatar').src = Utils.preloadMediaUrl(data.avatar_url);
                    renderVNProfile();
                    if (statusEl) { statusEl.textContent = '✅ 头像更新成功'; statusEl.style.color = '#27ae60'; }
                    setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 3000);
                } else {
                    if (statusEl) { statusEl.textContent = '❌ ' + (data.message || '上传失败'); statusEl.style.color = '#e74c3c'; }
                }
            } catch (err) {
                if (statusEl) { statusEl.textContent = '❌ 网络错误'; statusEl.style.color = '#e74c3c'; }
            }
        }, 'image/png');
    }
    if (e.target.id === 'cropCancelBtn') {
        document.getElementById('avatarCropModal').style.display = 'none';
        destroyCropper();
        _clubAvatarCropClubId = null;
        _clubAvatarCropCountry = 'china';
        document.getElementById('accAvatarInput').value = '';
    }
});

// ====== 工具函数 ======
function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML.replace(/"/g, '&quot;');
}

// ====== OAuth 回调检测 ======
handleOAuthCallback();

// ====== 昵称保存 ======
document.addEventListener('click', (e) => {
    if (e.target.id === 'accNicknameSaveBtn') {
        updateNickname();
    }
});

// ====== QQ / Discord 登录 ======
document.addEventListener('click', (e) => {
    if (e.target.id === 'qqLoginBtn') {
        window.location.href = './api/auth.php?action=qq_auth&mode=login';
    }
});
document.addEventListener('click', (e) => {
    if (e.target.id === 'discordLoginBtn') {
        window.location.href = './api/auth.php?action=discord_auth&mode=login';
    }
});

// ====== QQ 绑定/解绑 ======
document.addEventListener('click', (e) => {
    if (e.target.id === 'accQQBindBtn') {
        initiateQQBind();
    }
});
document.addEventListener('click', (e) => {
    if (e.target.id === 'accQQUnbindBtn') {
        unbindQQ();
    }
});

// ====== Discord 绑定/解绑 ======
document.addEventListener('click', (e) => {
    if (e.target.id === 'accDiscordBindBtn') {
        initiateDiscordBind();
    }
});
document.addEventListener('click', (e) => {
    if (e.target.id === 'accDiscordUnbindBtn') {
        unbindDiscord();
    }
});

// ====== 账户面板管理入口 ======
document.addEventListener('click', (e) => {
    if (e.target.id === 'accClubManageBtn') {
        window.open('./admin/club_manager.html', '_blank');
    }
});
document.addEventListener('click', (e) => {
    if (e.target.id === 'accPublicationManageBtn') {
        window.open('./admin/publication_manager.html', '_blank');
    }
});

// ====== 修改密码 ======
document.addEventListener('click', (e) => {
    if (e.target.id === 'accSettingsChangePwdBtn') {
        document.getElementById('accountSettings').style.display = 'none';
        document.getElementById('accountChangePasswordForm').style.display = 'block';
        document.getElementById('accPwdMessage').textContent = '';
    }
});
document.addEventListener('click', (e) => {
    if (e.target.id === 'accPwdCancelBtn') {
        document.getElementById('accountChangePasswordForm').style.display = 'none';
        document.getElementById('accountSettings').style.display = 'block';
    }
});
document.addEventListener('click', async (e) => {
    if (e.target.id === 'accChangePwdSaveBtn') {
        const current = document.getElementById('accPwdCurrent')?.value || '';
        const newPwd = document.getElementById('accPwdNew')?.value || '';
        const confirm = document.getElementById('accPwdConfirm')?.value || '';
        const msgEl = document.getElementById('accPwdMessage');
        if (!current || !newPwd || !confirm) {
            if (msgEl) { msgEl.textContent = '请填完所有字段'; msgEl.style.color = '#e74c3c'; }
            return;
        }
        if (newPwd !== confirm) {
            if (msgEl) { msgEl.textContent = '两次输入的新密码不一致'; msgEl.style.color = '#e74c3c'; }
            return;
        }
        if (newPwd.length < 6) {
            if (msgEl) { msgEl.textContent = '新密码至少 6 位'; msgEl.style.color = '#e74c3c'; }
            return;
        }
        try {
            const resp = await fetch('./api/auth.php?action=change_password', {
                method: 'POST', credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ current_password: current, new_password: newPwd }),
            });
            const data = await resp.json();
            if (msgEl) {
                msgEl.textContent = data.message || (data.success ? '修改成功' : '修改失败');
                msgEl.style.color = data.success ? '#27ae60' : '#e74c3c';
            }
            if (data.success) {
                document.getElementById('accPwdCurrent').value = '';
                document.getElementById('accPwdNew').value = '';
                document.getElementById('accPwdConfirm').value = '';
            }
        } catch {
            if (msgEl) { msgEl.textContent = '网络错误'; msgEl.style.color = '#e74c3c'; }
        }
    }
});

// ====== 绑定邮箱（含验证码） ======
let sendCodeTimer = null;
document.addEventListener('click', (e) => {
    if (e.target.id === 'accSettingsBindEmailBtn') {
        document.getElementById('accountSettings').style.display = 'none';
        document.getElementById('accountBindEmailForm').style.display = 'block';
        document.getElementById('accEmailMessage').textContent = '';
        document.getElementById('accEmailInput').value = '';
        document.getElementById('accCodeInput').value = '';
        document.getElementById('accCodeInput').style.display = 'none';
        document.getElementById('accEmailSaveBtn').style.display = 'none';
        document.getElementById('accSendCodeBtn').disabled = false;
        document.getElementById('accSendCodeBtn').textContent = '发送验证码';
    }
});
document.addEventListener('click', (e) => {
    if (e.target.id === 'accEmailCancelBtn') {
        if (sendCodeTimer) { clearInterval(sendCodeTimer); sendCodeTimer = null; }
        document.getElementById('accountBindEmailForm').style.display = 'none';
        document.getElementById('accountSettings').style.display = 'block';
    }
});
document.addEventListener('click', async (e) => {
    if (e.target.id === 'accSendCodeBtn') {
        const email = document.getElementById('accEmailInput')?.value.trim();
        const msgEl = document.getElementById('accEmailMessage');
        if (!email) {
            if (msgEl) { msgEl.textContent = '请输入邮箱地址'; msgEl.style.color = '#e74c3c'; }
            return;
        }
        const btn = document.getElementById('accSendCodeBtn');
        btn.disabled = true;
        btn.textContent = '发送中...';
        if (msgEl) { msgEl.textContent = ''; }
        try {
            const resp = await fetch('./api/auth.php?action=send_code', {
                method: 'POST', credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            });
            const data = await resp.json();
            if (data.success) {
                if (msgEl) { msgEl.textContent = data.message || '验证码已发送'; msgEl.style.color = '#27ae60'; }
                document.getElementById('accCodeInput').style.display = 'block';
                document.getElementById('accEmailSaveBtn').style.display = 'block';
                document.getElementById('accCodeInput').focus();
                // 60 秒倒计时
                let countdown = 60;
                const tick = () => {
                    btn.textContent = countdown + 's';
                    if (--countdown <= 0) {
                        btn.disabled = false;
                        btn.textContent = '重新发送';
                        if (sendCodeTimer) { clearInterval(sendCodeTimer); sendCodeTimer = null; }
                    }
                };
                if (sendCodeTimer) { clearInterval(sendCodeTimer); }
                sendCodeTimer = setInterval(tick, 1000);
                tick();
            } else {
                if (msgEl) { msgEl.textContent = data.message || '发送失败'; msgEl.style.color = '#e74c3c'; }
                btn.disabled = false;
                btn.textContent = '重新发送';
            }
        } catch {
            if (msgEl) { msgEl.textContent = '网络错误'; msgEl.style.color = '#e74c3c'; }
            btn.disabled = false;
            btn.textContent = '重新发送';
        }
    }
});
document.addEventListener('click', async (e) => {
    if (e.target.id === 'accEmailSaveBtn') {
        const email = document.getElementById('accEmailInput')?.value.trim();
        const code = document.getElementById('accCodeInput')?.value.trim();
        const msgEl = document.getElementById('accEmailMessage');
        if (!email) {
            if (msgEl) { msgEl.textContent = '请输入邮箱地址'; msgEl.style.color = '#e74c3c'; }
            return;
        }
        if (!code || !/^\d{6}$/.test(code)) {
            if (msgEl) { msgEl.textContent = '请输入 6 位验证码'; msgEl.style.color = '#e74c3c'; }
            return;
        }
        try {
            const resp = await fetch('./api/auth.php?action=bind_email', {
                method: 'POST', credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, code }),
            });
            const data = await resp.json();
            if (msgEl) {
                msgEl.textContent = data.message || (data.success ? '绑定成功' : '绑定失败');
                msgEl.style.color = data.success ? '#27ae60' : '#e74c3c';
            }
            if (data.success && currentUser?.user) {
                currentUser.user.email = data.email || email;
                if (sendCodeTimer) { clearInterval(sendCodeTimer); sendCodeTimer = null; }
                setTimeout(() => {
                    document.getElementById('accountBindEmailForm').style.display = 'none';
                    document.getElementById('accountSettings').style.display = 'block';
                    refreshProfile();
                }, 1000);
            }
        } catch {
            if (msgEl) { msgEl.textContent = '网络错误'; msgEl.style.color = '#e74c3c'; }
        }
    }
});
document.addEventListener('click', async (e) => {
    if (e.target.id === 'accSettingsUnbindEmailBtn') {
        if (!confirm(__('confirmUnbind'))) return;
        try {
            const resp = await fetch('./api/auth.php?action=unbind_email', {
                method: 'POST', credentials: 'same-origin',
            });
            const data = await resp.json();
            if (data.success && currentUser?.user) {
                currentUser.user.email = '';
                refreshProfile();
            } else {
                alert(data.message || '解绑失败');
            }
        } catch {
            alert(__('alertNetworkError'));
        }
    }
});

// ====== 个性签名保存 ======
document.addEventListener('click', function(e) {
    if (e.target.id === 'accBioSaveBtn') {
        var input = document.getElementById('accBioInput');
        if (!input) return;
        var bio = input.value.trim();
        if (bio.length > 300) {
            alert('个性签名不能超过 300 个字符');
            return;
        }
        fetch('./api/auth.php?action=update_profile', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ profile_bio: bio })
        })
        .then(function(r) { return r.json(); })
        .then(function(d) {
            if (d.success && currentUser?.user) {
                currentUser.user.profile_bio = bio;
                renderVNProfile();
                var statusEl = document.getElementById('accBioStatus');
                if (statusEl) { statusEl.textContent = '✅ 保存成功'; statusEl.style.color = '#27ae60'; }
                setTimeout(function() { if (statusEl) statusEl.textContent = ''; }, 2000);
            } else {
                alert(d.message || __('alertSaveFailed'));
            }
        })
        .catch(function() { alert(__('alertNetworkError')); });
    }
});

// ====== 点击签名直接编辑 ======
document.addEventListener('click', function(e) {
    if (e.target.id === 'vnSignature' && currentUser?.logged_in) {
        var settingsTab = document.querySelector('.vn-tab[data-tab="settings"]');
        if (settingsTab) settingsTab.click();
        var bioInput = document.getElementById('accBioInput');
        if (bioInput) {
            bioInput.value = currentUser.user.profile_bio || '';
            bioInput.focus();
        }
    }
});

// ====== 成员名单模态框 ======
document.addEventListener('click', (e) => {
    if (e.target.id === 'memberListModalClose') {
        document.getElementById('memberListModal').classList.remove('open');
        document.getElementById('memberListModal').setAttribute('aria-hidden', 'true');
    }
});
document.addEventListener('click', (e) => {
    const modal = document.getElementById('memberListModal');
    if (e.target === modal) {
        modal.classList.remove('open');
        modal.setAttribute('aria-hidden', 'true');
    }
});

async function openMemberList(clubId, country) {
    const modal = document.getElementById('memberListModal');
    const content = document.getElementById('memberListContent');
    if (!modal || !content) return;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    modal.dataset.clubId = clubId;
    content.innerHTML = '<p style="text-align: center; opacity: 0.6;">' + __('memberLoading') + '</p>';
    try {
        const cc = country || 'china';
        const resp = await fetch('./api/membership.php?action=members&club_id=' + clubId + '&country=' + cc, { credentials: 'same-origin' });
        const data = await resp.json();
        if (!data.success) {
            content.innerHTML = '<p style="text-align: center; color: #e74c3c;">' + (data.message || __('memberLoadError')) + '</p>';
            return;
        }
        if (!data.members || data.members.length === 0) {
            content.innerHTML = '<p style="text-align: center; opacity: 0.6;">' + __('memberEmpty') + '</p>';
            return;
        }

        // 获取当前用户在该俱乐部中的角色
        const myMembership = currentUser?.memberships?.find(m => parseInt(m.club_id) === clubId && (m.country || 'china') === cc && m.status === 'active');
        const myClubRole = myMembership?.role || '';
        const isSuperAdmin = currentUser?.user?.role === 'super_admin';
        const currentUserId = currentUser?.user?.id;

        content.innerHTML = '<div style="display: flex; flex-direction: column; gap: 8px;">' +
            data.members.map(m => {
                const isSelf = m.user_id === currentUserId;
                // 踢出按钮条件
                let showKick = false;
                if (!isSelf && (isSuperAdmin || myClubRole === 'representative' || myClubRole === 'manager')) {
                    if (isSuperAdmin) showKick = true;
                    else if (myClubRole === 'representative') showKick = m.role !== 'representative';
                    else if (myClubRole === 'manager') showKick = m.role === 'member';
                }
                // 角色变更条件
                const canChangeRole = !isSelf && (isSuperAdmin || myClubRole === 'representative');
                const showRoleUp = canChangeRole && m.role === 'member';
                const showRoleDown = canChangeRole && m.role === 'manager';
                // 转让负责人条件：仅当前负责人可见，目标非自己、非负责人
                const showTransfer = !isSelf && myClubRole === 'representative' && m.role !== 'representative';

                return '<div style="display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: var(--md-surface-container); border-radius: 10px;">' +
                    '<img src="' + Utils.escapeHTML(Utils.resolveMediaUrl(m.avatar_url || '')) + '" alt="" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover;" onerror="this.style.display=\'none\'" />' +
                    '<span style="flex: 1; font-weight: 500;">' + Utils.escapeHTML(m.username) + '</span>' +
                    '<span style="font-size: 12px; opacity: 0.7;">' + ({
                        member: __('memberRoleMember'), manager: __('memberRoleManager'), representative: __('memberRoleRep')
                    }[m.role] || m.role) + '</span>' +
                    '<span style="font-size: 11px; opacity: 0.5;">' + (m.joined_at ? m.joined_at.split(' ')[0] : '') + '</span>' +
                    (showRoleUp ? '<button class="btn-small" onclick="event.stopPropagation();changeMemberRole(' + m.id + ',\'manager\')" style="font-size:11px;padding:2px 8px;">' + __('memberBtnPromote') + '</button>' : '') +
                    (showRoleDown ? '<button class="btn-small" onclick="event.stopPropagation();changeMemberRole(' + m.id + ',\'member\')" style="font-size:11px;padding:2px 8px;">' + __('memberBtnDemote') + '</button>' : '') +
                    (showTransfer ? '<button class="btn-small btn-danger" onclick="event.stopPropagation();transferRepresentative(' + m.id + ',' + clubId + ',\'' + Utils.escapeHTML(m.username) + '\')" style="font-size:11px;padding:2px 8px;">' + __('memberBtnTransfer') + '</button>' : '') +
                    (showKick ? '<button class="btn-small btn-danger" onclick="event.stopPropagation();kickMember(' + m.id + ',\'' + Utils.escapeHTML(m.username) + '\')" style="font-size:11px;padding:2px 8px;">' + __('memberBtnKick') + '</button>' : '') +
                    '</div>';
            }).join('') + '</div>';
    } catch {
        content.innerHTML = '<p style="text-align: center; color: #e74c3c;">' + __('memberNetworkError') + '</p>';
    }
}

function showToast(message, duration = 2000) {
    let toast = document.getElementById('mobileToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'mobileToast';
        toast.style.cssText = `
            position: fixed;
            bottom: 100px;
            left: 50%;
            transform: translateX(-50%) scale(0.9);
            background: rgba(0,0,0,0.85);
            backdrop-filter: blur(8px);
            color: white;
            padding: 10px 20px;
            border-radius: 40px;
            font-size: 13px;
            z-index: 1000;
            opacity: 0;
            transition: all 0.2s ease;
            pointer-events: none;
            text-align: center;
            line-height: 1.4;
            white-space: nowrap;
        `;
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) scale(1)';
    setTimeout(function() {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) scale(0.9)';
    }, duration);
}

// ==========================================
// 多语言配置
// ==========================================
const translations = {
    zh: {
        // 标题与简介
        title: '全国Galgame同好会地图',
        introTitle: '全国Galgame同好会地图',
        intro: '本网站聚合展示全国各省、高校及海外地区的 Galgame / 视觉小说同好组织信息。支持地图缩放拖拽、分省查看、分类筛选、关键词搜索，一键复制联系方式，帮助同好快速找到组织。',
        dataSource: '数据源：',
        
        // 搜索与筛选
        searchPlaceholder: '搜索组织名 / 群号 / 学校',
        typeAll: '全部',
        typeRegion: '地区高校联合',
        typeSchool: '高校同好会',
        typeVnfest: '视觉小说学园祭',
        sortDefault: '默认排序',
        sortTime: '成立时间',
        sortName: '名称排序',
        sortType: '类型排序',
        globalSearch: '全局搜索',
        
        // 地图按钮
        chinaBtn: '中国同好会',
        japanBtn: '日本同好会',
        otherBtn: '海外同好会',
        calendarBtn: '活动日历',
        publicationBtn: '刊物投稿',
        
        // 地图控件
        zoomIn: '放大 +',
        zoomOut: '缩小 -',
        reset: '重置视图',
        clubCount: '个组织',
        mapControls: '地图控件',
        
        // 链接与提交
        openSource: '开源仓库',
        submitClub: '提交同好会',
        submitEvent: '添加活动',
        submitPublication: '投稿刊物征集',
        
        // 开关
        invertCtrl: '反转操作 (Ctrl+点击查看详情)',
        invertCtrlOn: '反转操作已开启',
        themeMode: '深色模式 (跟随系统)',
        themeLight: '深色模式 (开启)',
        themeDark: '深色模式 (关闭)',
        
        // 卡片提示
        clickExpand: '点击展开',
        clickCollapse: '点击收起',
        noData: '点击地图上的地区查看同好会信息',
        noClub: '暂无同好会信息，欢迎提交~',
        noPublication: '暂无刊物信息，欢迎投稿~',
        
        // 弹窗
        feedback: '反馈',
        easterEgg: '🎉 彩蛋',
        
        // 详情面板
        detailProvince: '所在地',
        detailType: '组织类型',
        detailContact: '联系方式',
        detailCopy: '复制',
        detailOpenLink: '打开链接',
        detailCopyLink: '复制链接',
        detailIntro: '介绍',
        detailNoRemark: '暂无介绍，欢迎补充~',
        detailEstablished: '成立时间',
        detailVerified: '已认证',
        detailUnverified: '未认证',
        
        // 管理员面板
        adminAddTitle: '➕ 添加同好会',
        adminEditTitle: '✏️ 编辑同好会',
        adminName: '组织名称 *',
        adminProvince: '省份 *',
        adminPrefecture: '都道府县 *',
        adminCountry: '国家',
        adminType: '组织类型',
        adminContact: '联系方式 *',
        adminRemark: '详细介绍...',
        adminSchool: '学校/组织',
        adminCancel: '取消',
        adminSave: '保存',
        adminDelete: '删除',
        
        // 日历
        calendarTitle: 'Galgame 活动日历',
        calendarPrev: '‹ 上月',
        calendarNext: '下月 ›',
        calendarAddEvent: '➕ 添加活动',
        calendarEventName: '活动名称',
        calendarEventDate: '活动日期',
        calendarEventDesc: '活动简介',
        calendarEventImage: '宣传图文件名',
        calendarEventLink: '活动链接',
        calendarEventDetail: '详细介绍',
        calendarOfficial: '官方活动',
        calendarNoEvent: '本月有 {{count}} 个 Galgame 活动',
        
        // 刊物
        publicationTitle: '📖 同好会刊物列表',
        publicationAdd: '➕ 添加刊物',
        publicationName: '刊物名称',
        publicationClub: '主办同好会',
        publicationStatus: '制作状态',
        publicationStatusPlanning: '📋 策划中',
        publicationStatusWriting: '✍️ 征稿中',
        publicationStatusEditing: '🔧 编辑中',
        publicationStatusPublishing: '📢 即将发布',
        publicationStatusCompleted: '✅ 已发布',
        publicationStatusSuspended: '⏸️ 暂停',
        publicationSubmitLink: '投稿入口',
        publicationDeadline: '截止日期',
        publicationDesc: '刊物介绍',
        
        // 提交表单
        submitTitle: '提交同好会信息',
        submitSubtitle: '你的贡献将帮助更多同好找到组织 ✨',
        submitSuccess: '✅ 提交成功！感谢你的贡献，我们会尽快审核。',
        submitError: '❌ 提交失败，请稍后重试或联系管理员。',
        submitName: '学校/组织名称 *',
        submitCountry: '所属国家 *',
        submitProvince: '省份 *',
        submitPrefecture: '都道府县 *',
        submitContact: '联系方式 *',
        submitContactHint: 'QQ群、微信群、Discord、Telegram 等均可',
        submitType: '组织类型 *',
        submitTypeSchool: '高校同好会',
        submitTypeRegion: '地区高校联合',
        submitTypeVnfest: '视觉小说学园祭',
        submitCreatedAt: '成立时间',
        submitRemark: '群简介 / 备注',
        submitSubmitter: '你的联系方式',
        submitSubmitterHint: '仅用于审核沟通，不会公开',
        submitButton: '✉️ 提交信息',
        submitInfo: '⭐ 提交后，管理员会尽快审核',

        // 详情面板 - 扩展
        detailTypeRegion: '地区联合',
        detailTypeSchool: '高校同好会',
        detailTypeVnfest: '学园祭',
        detailUnfilled: '未填写',
        detailSectionIntro: '同好会简介',
        detailSectionExt: '对外平台',
        detailSectionContact: '联系方式',
        detailSectionActions: '操作',
        detailSectionWiki: '同好会维基',
        detailContactLockedLogin: '联系方式仅对绑定成员公开\n请先登录后申请绑定同好会',
        detailContactLocked: '联系方式仅对绑定成员公开',
        detailContactPending: '⏳ 绑定申请已提交，等待管理员审核',
        detailContactRejected: '❌ 绑定申请已被拒绝',
        detailContactBound: '✅ 你已绑定该同好会，请重新打开查看联系方式',
        detailContactApply: '申请绑定后可查看联系方式',
        detailContactQueryFail: '❌ 查询失败，请刷新重试',
        detailBtnApplyClub: '📝 申请绑定同好会',
        detailBtnEdit: '✏️ 编辑同好会信息',
        detailBtnMembers: '👥 成员名单',
        detailBtnWiki: '📖 查看维基页面',
        detailBtnEditWiki: '✏️ 编辑维基内容',
        detailBtnTransfer: '🔄 转让负责人',
        detailBtnLeave: '🚪 退出同好会',
        detailBtnApply: '📝 申请绑定',
        detailUnknownDate: '成立时间未知',
        detailNoContact: '无联系方式',
        detailRegistered: '✓ 已登记',
        detailLoading: '⏳ 查询绑定状态中...',

        // 列表项
        listEmptyFilter: '没有找到相关同好会',
        listNoName: '未命名组织',
        listNoContact: '无联系方式',
        listInfoHidden: '🔒 申请绑定后可见',
        listVerified: '已登记',
        listUnverified: '未登记',
        listBound: '✅ 已绑定',
        listApply: '申请绑定',
        listNoRemark: '暂无介绍',
        listEstablished: '· 成立时间：',

        // 成员列表
        memberLoading: '加载中...',
        memberLoadError: '加载失败',
        memberEmpty: '暂无成员',
        memberRoleMember: '成员',
        memberRoleManager: '管理员',
        memberRoleRep: '负责人',
        memberBtnPromote: '升为管理',
        memberBtnDemote: '设为成员',
        memberBtnTransfer: '转让',
        memberBtnKick: '踢出',
        memberNetworkError: '网络错误',

        // 排序按钮
        sortDefaultShort: '默认',
        sortTimeAsc: '成立时间 ↑',
        sortTimeDesc: '成立时间 ↓',
        sortNameAZ: '首字母 A→Z',
        sortNameZA: '首字母 Z→A',
        sortTypeAZ: '类型 A→Z',
        sortTypeZA: '类型 Z→A',

        // 面板标题
        renderTitleDetail: '{0} · 同好会详情',
        renderTitleSearch: '🔍 全局搜索 · {0}同好会',
        renderTitleSummary: '全国Galgame同好会数据',
        renderMetaDataSource: '数据源：{0}',
        renderMetaSearch: '搜索 "{0}" · 找到 {1} 个结果 · ',
        renderMetaRange: '范围 {0} · 高校同好会 {1} · 地区联合 {2}',
        renderMetaVnfest: '· 学园祭 {0}',
        renderMetaSummary: '范围 全局 · 高校同好会 {0} · 地区联合 {1}',

        // 设置面板角色
        settingsRoleVisitor: '访客',
        settingsRoleMember: '成员',
        settingsRoleManager: '管理员',
        settingsRoleRep: '负责人',
        settingsRoleAdmin: '超级管理员',

        // 通用状态
        statusRefresh: '刷新数据',
        statusRefreshing: '刷新中...',
        statusEasterEgg: '彩蛋内容',

        // 审批面板
        approvalEmpty: '✅ 暂无待审批的绑定申请',
        approvalLoadError: '❌ 加载失败，请重试',
        approvalTime: '申请时间：',
        approvalCenter: '绑定审批',
        approvalApprove: '批准',
        approvalReject: '拒绝',

        // 数据源
        sourceLocalJSON: '本地JSON',
        sourceMock: '模拟数据',

        // 地区/国家名称
        countryJapan: '日本',
        countryOverseas: '海外',
        countryAll: '全国',
        countryNotSelected: '未选择',
        domesticClubs: '国内同好会',

        // 通用 alert 提示
        alertNetworkError: '网络错误',
        alertPermissionDenied: '权限不足',
        alertOperationFailed: '操作失败',
        alertSaveFailed: '保存失败',
        alertDeleteFailed: '删除失败',
        alertSubmitFailed: '提交失败',
        alertSaveSuccess: '✅ 保存成功',
        alertDeleteSuccess: '✅ 删除成功',
        alertAddSuccess: '✅ 添加成功',
        alertUpdateSuccess: '✅ 更新成功',
        alertPleaseLogin: '请先登录',
        alertPleaseLoginFirst: '请先登录后再操作',
        alertNameRequired: '请填写组织名称',
        alertContactRequired: '请填写联系方式',
        alertAdminModeRequired: '请先开启管理员模式',
        alertSignupFail: '报名失败',
        alertCancelFail: '取消失败',
        alertNameRequiredCal: '请填写活动名称',
        alertDateRequired: '请选择活动日期',

        // 通用 confirm 提示
        confirmDelete: '确定要删除吗？此操作不可撤销！',
        confirmDeleteSimple: '确定要删除吗？',
        confirmLeaveClub: '确定退出同好会「{0}」吗？',
        confirmUnbind: '确定解绑吗？',
        confirmChangeRole: '确定将此成员的角色改为「{0}」吗？',
        confirmKickMember: '确定将「{0}」踢出同好会吗？',
        confirmTransferRep: '⚠️ 确定将负责人身份转让给「{0}」吗？\n\n转让后你将变为管理员。此操作不可撤销！',
    },
    ja: {
        // タイトルと紹介
        title: '全国ギャルゲー同好会マップ',
        introTitle: '全国ギャルゲー同好会マップ',
        intro: '全国の大学、地域、海外のギャルゲー・ビジュアルノベル同好会情報を集約したマップです。地図の拡大縮小、ドラッグ、都道府県別表示、カテゴリ絞り込み、キーワード検索、連絡先のコピーが可能です。',
        dataSource: 'データソース：',
        
        // 検索と絞り込み
        searchPlaceholder: '団体名 / グループID / 学校名で検索',
        typeAll: 'すべて',
        typeRegion: '地域大学連合',
        typeSchool: '大学同好会',
        typeVnfest: 'ビジュアルノベル祭',
        sortDefault: 'デフォルト',
        sortTime: '設立日順',
        sortName: '名前順',
        sortType: 'タイプ順',
        globalSearch: '全体検索',
        
        // 地図ボタン
        chinaBtn: '中国サークル',
        japanBtn: '日本サークル',
        otherBtn: '他のサークル',
        calendarBtn: 'カレンダー',
        publicationBtn: '投稿募集',
        
        // 地図コントロール
        zoomIn: '拡大 +',
        zoomOut: '縮小 -',
        reset: 'リセット',
        clubCount: '団体',
        mapControls: '地図操作',
        
        // リンクと投稿
        openSource: 'オープンソース',
        submitClub: '同好会を投稿',
        submitEvent: 'イベントを追加',
        submitPublication: '投稿を募集',
        
        // スイッチ
        invertCtrl: '操作反転 (Ctrl+クリックで詳細表示)',
        invertCtrlOn: '操作反転オン',
        themeMode: 'ダークモード (システム連動)',
        themeLight: 'ダークモード (オン)',
        themeDark: 'ダークモード (オフ)',
        
        // カード表示
        clickExpand: 'クリックで展開',
        clickCollapse: 'クリックで閉じる',
        noData: '地図上の地域をクリックして同好会情報を表示',
        noClub: '同好会情報はまだありません。投稿をお待ちしています～',
        noPublication: '出版物情報はまだありません。投稿をお待ちしています～',
        
        // モーダル
        feedback: 'フィードバック',
        easterEgg: '🎉 イースターエッグ',
        
        // 詳細パネル
        detailProvince: '所在地',
        detailType: '団体タイプ',
        detailContact: '連絡先',
        detailCopy: 'コピー',
        detailOpenLink: 'リンクを開く',
        detailCopyLink: 'リンクをコピー',
        detailIntro: '紹介',
        detailNoRemark: '紹介文はありません。募集しています～',
        detailEstablished: '設立日',
        detailVerified: '認証済み',
        detailUnverified: '未認証',
        
        // 管理者パネル
        adminAddTitle: '➕ 同好会を追加',
        adminEditTitle: '✏️ 同好会を編集',
        adminName: '団体名 *',
        adminProvince: '省 *',
        adminPrefecture: '都道府県 *',
        adminCountry: '国',
        adminType: '団体タイプ',
        adminContact: '連絡先 *',
        adminRemark: '詳細紹介...',
        adminSchool: '学校/団体',
        adminCancel: 'キャンセル',
        adminSave: '保存',
        adminDelete: '削除',
        
        // カレンダー
        calendarTitle: 'ギャルゲー イベントカレンダー',
        calendarPrev: '‹ 前月',
        calendarNext: '次月 ›',
        calendarAddEvent: '➕ イベントを追加',
        calendarEventName: 'イベント名',
        calendarEventDate: '開催日',
        calendarEventDesc: 'イベント概要',
        calendarEventImage: '画像ファイル名',
        calendarEventLink: 'イベントリンク',
        calendarEventDetail: '詳細説明',
        calendarOfficial: '公式イベント',
        calendarNoEvent: '今月は {{count}} 件のギャルゲーイベントがあります',
        
        // 出版物
        publicationTitle: '📖 同好会出版物リスト',
        publicationAdd: '➕ 出版物を追加',
        publicationName: '出版物名',
        publicationClub: '主催同好会',
        publicationStatus: '制作状況',
        publicationStatusPlanning: '📋 企画中',
        publicationStatusWriting: '✍️ 募集中',
        publicationStatusEditing: '🔧 編集中',
        publicationStatusPublishing: '📢 近日公開',
        publicationStatusCompleted: '✅ 公開済み',
        publicationStatusSuspended: '⏸️ 休止中',
        publicationSubmitLink: '投稿はこちら',
        publicationDeadline: '締切日',
        publicationDesc: '出版物紹介',
        
        // 投稿フォーム
        submitTitle: '同好会情報を投稿',
        submitSubtitle: 'あなたの貢献で仲間が見つかります ✨',
        submitSuccess: '✅ 投稿成功！ご協力ありがとうございます。審査後、公開されます。',
        submitError: '❌ 投稿失敗。しばらく経ってから再試行するか、管理者に連絡してください。',
        submitName: '学校/団体名 *',
        submitCountry: '国 *',
        submitProvince: '省 *',
        submitPrefecture: '都道府県 *',
        submitContact: '連絡先 *',
        submitContactHint: 'QQグループ、WeChat、Discord、Telegramなど',
        submitType: '団体タイプ *',
        submitTypeSchool: '大学同好会',
        submitTypeRegion: '地域大学連合',
        submitTypeVnfest: 'ビジュアルノベル祭',
        submitCreatedAt: '設立日',
        submitRemark: '団体紹介 / 備考',
        submitSubmitter: 'あなたの連絡先',
        submitSubmitterHint: '審査連絡用（公開されません）',
        submitButton: '✉️ 投稿する',
        submitInfo: '⭐ 投稿後、管理者が審査します',
        // 詳細パネル - 拡張
        detailTypeRegion: '地域大学連合',
        detailTypeSchool: '大学同好会',
        detailTypeVnfest: 'ビジュアルノベル祭',
        detailUnfilled: '未入力',
        detailSectionIntro: 'サークル紹介',
        detailSectionExt: '外部プラットフォーム',
        detailSectionContact: '連絡先',
        detailSectionActions: '操作',
        detailSectionWiki: '同好会维基',
        detailContactLockedLogin: '連絡先はメンバーのみ公開されています\nログインしてから申請してください',
        detailContactLocked: '連絡先はメンバーのみ公開されています',
        detailContactPending: '⏳ 申請中です。管理者の承認をお待ちください',
        detailContactRejected: '❌ 申請が拒否されました',
        detailContactBound: '✅ このサークルに加入済みです。再表示してください',
        detailContactApply: '申請後に連絡先を表示できます',
        detailContactQueryFail: '❌ 照会失敗。再読み込みしてください',
        detailBtnApplyClub: '📝 サークルに参加申請',
        detailBtnEdit: '✏️ サークル情報を編集',
        detailBtnMembers: '👥 メンバー一覧',
        detailBtnWiki: '📖 Wikiページを見る',
        detailBtnEditWiki: '✏️ Wiki内容を編集',
        detailBtnTransfer: '🔄 代表者を譲渡',
        detailBtnLeave: '🚪 サークルを退出',
        detailBtnApply: '📝 申請する',
        detailUnknownDate: '設立日不明',
        detailNoContact: '連絡先なし',
        detailRegistered: '✓ 登録済み',
        detailLoading: '⏳ 状態を確認中...',

        // リスト項目
        listEmptyFilter: '該当するサークルが見つかりません',
        listNoName: '名称未設定',
        listNoContact: '連絡先なし',
        listInfoHidden: '🔒 申請後に表示',
        listVerified: '登録済み',
        listUnverified: '未登録',
        listBound: '✅ 加入済み',
        listApply: '申請する',
        listNoRemark: '紹介文なし',
        listEstablished: '· 設立：',

        // メンバー一覧
        memberLoading: '読み込み中...',
        memberLoadError: '読み込み失敗',
        memberEmpty: 'メンバーがいません',
        memberRoleMember: 'メンバー',
        memberRoleManager: '管理者',
        memberRoleRep: '代表者',
        memberBtnPromote: '管理者に昇格',
        memberBtnDemote: 'メンバーに降格',
        memberBtnTransfer: '譲渡',
        memberBtnKick: '追放',
        memberNetworkError: 'ネットワークエラー',

        // ソートボタン
        sortDefaultShort: 'デフォルト',
        sortTimeAsc: '設立日 ↑',
        sortTimeDesc: '設立日 ↓',
        sortNameAZ: '名前 A→Z',
        sortNameZA: '名前 Z→A',
        sortTypeAZ: 'タイプ A→Z',
        sortTypeZA: 'タイプ Z→A',

        // パネルタイトル
        renderTitleDetail: '{0} · サークル詳細',
        renderTitleSearch: '🔍 全体検索 · {0}サークル',
        renderTitleSummary: '全国ギャルゲー同好会マップ',
        renderMetaDataSource: 'データソース：{0}',
        renderMetaSearch: '検索 "{0}" · {1} 件 · ',
        renderMetaRange: '範囲 {0} · 大学同好会 {1} · 地域連合 {2}',
        renderMetaVnfest: '· ビジュアルノベル祭 {0}',
        renderMetaSummary: '範囲 全体 · 大学同好会 {0} · 地域連合 {1}',

        // 設定パネル役割
        settingsRoleVisitor: 'ゲスト',
        settingsRoleMember: 'メンバー',
        settingsRoleManager: '管理者',
        settingsRoleRep: '代表者',
        settingsRoleAdmin: 'スーパー管理者',

        // 共通ステータス
        statusRefresh: 'データを更新',
        statusRefreshing: '更新中...',
        statusEasterEgg: 'イースターエッグ',

        // 承認パネル
        approvalEmpty: '✅ 承認待ちの申請はありません',
        approvalLoadError: '❌ 読み込み失敗。再試行してください',
        approvalTime: '申請日時：',
        approvalCenter: '参加申請の承認',
        approvalApprove: '承認',
        approvalReject: '拒否',

        // データソース
        sourceLocalJSON: 'ローカルJSON',
        sourceMock: 'モックデータ',

        // 地域/国名
        countryJapan: '日本',
        countryOverseas: '海外',
        countryAll: '全国',
        countryNotSelected: '未選択',
        domesticClubs: '国内サークル',

        // 汎用アラート
        alertNetworkError: 'ネットワークエラー',
        alertPermissionDenied: '権限がありません',
        alertOperationFailed: '操作に失敗しました',
        alertSaveFailed: '保存に失敗しました',
        alertDeleteFailed: '削除に失敗しました',
        alertSubmitFailed: '送信に失敗しました',
        alertSaveSuccess: '✅ 保存しました',
        alertDeleteSuccess: '✅ 削除しました',
        alertAddSuccess: '✅ 追加しました',
        alertUpdateSuccess: '✅ 更新しました',
        alertPleaseLogin: 'ログインしてください',
        alertPleaseLoginFirst: 'ログインしてください',
        alertNameRequired: '団体名を入力してください',
        alertContactRequired: '連絡先を入力してください',
        alertAdminModeRequired: '管理者モードを有効にしてください',
        alertSignupFail: '登録に失敗しました',
        alertCancelFail: 'キャンセルに失敗しました',
        alertNameRequiredCal: 'イベント名を入力してください',
        alertDateRequired: '日付を選択してください',

        // 汎用確認ダイアログ
        confirmDelete: '削除してもよろしいですか？この操作は取り消せません！',
        confirmDeleteSimple: '削除してもよろしいですか？',
        confirmLeaveClub: 'サークル「{0}」を退会してもよろしいですか？',
        confirmUnbind: '連携を解除してもよろしいですか？',
        confirmChangeRole: 'このメンバーの役割を「{0}」に変更してもよろしいですか？',
        confirmKickMember: '「{0}」をサークルから追放してもよろしいですか？',
        confirmTransferRep: '⚠️ 代表者を「{0}」に譲渡してもよろしいですか？\n\n譲渡後、あなたは管理者になります。この操作は取り消せません！',
    }
};

Object.assign(translations.zh, {
    listPanelHeading: '站点信息',
    themeMode: '主题：跟随系统',
    themeLight: '主题：浅色',
    themeDark: '主题：深色',
    listIntroDesc1: '本网站用于聚合展示全国各省、高校及海外地区的 Galgame / 视觉小说同好组织信息，支持地图缩放、拖拽、分省查看、切换分类与一键复制联系方式，帮助同好快速找到组织。',
    listIntroDesc2: '数据来自各高校同好会及公开信息，欢迎提交新的同好会资料。',
    listInvertCtrl: '反转操作（默认关）',
    listThemeSwitch: '暗黑模式（跟随系统）',
    listSubmitClub: '提交同好会信息',
    listSubmitEvent: '添加活动信息',
    listSubmitPublication: '投稿刊物征集',
    listGalonly: 'GalOnly 高校专属通道',
    listOpenSource: '开源仓库',
    listAnnouncements: '公告',
    listProvinceHeader: '地区索引',
    listProvinceHint: '按收录数量排序',
    listAllRegions: '全部',
    listToolbarAll: '全部同好会',
    listToolbarSubtitle: '选择地区后查看同好会，也可以按名称、群号或类型快速筛选。',
    listSearchPlaceholder: '搜索组织名 / 群号',
    listAllTypes: '全部类型',
    listSortTimeDesc: '登记时间 ↓',
    listSortNameAsc: '名称 A→Z',
    listSortTypeAsc: '类型 A→Z',
    listCountSuffix: '个同好会',
    listContactLabel: '联系',
    listRemarkLabel: '备注',
    listContactPrivate: '联系方式未公开',
    listUnknownProvince: '未分类',
    modeMap: '地图',
    modeList: '列表',
    modeStarmap: '星图',
    topLogin: '登录 / 注册',
    topAccount: '账号',
    topAdmin: '同好会管理',
    roleAudit: '活动审核',
    vnRoleVisitor: '见习同好',
    vnRoleMember: '同好会成员',
    vnRoleManager: '同好会管理员',
    vnRoleRep: '同好会会长',
    vnRoleAdmin: '超级管理员',
    vnRoleDefault: '同好',
    vnSignatureEmpty: '“这个人很懒，还没有填写签名”',
    vnNoClub: '还没有加入同好会',
    vnJoined: '加入',
    vnActive: '活跃',
    vnCollectionEmptyClubs: '还没有加入同好会，去地图上找一个吧！',
    vnCollectionPublicationsSoon: '📖 刊物收集功能开发中',
    vnCollectionLoginFirst: '请先登录',
    alertLeaveSuccess: '已退出同好会',
    alertRoleUpdated: '角色已更新',
    alertKickSuccess: '已踢出成员',
    commentPlaceholder: '写下你对这个同好会的评价…',
    confirmDeleteClub: '⚠️ 确定要删除这个同好会吗？此操作不可撤销！',
});

Object.assign(translations.ja, {
    title: '全国ギャルゲー・ビジュアルノベル同好会マップ',
    introTitle: '全国ギャルゲー・ビジュアルノベル同好会マップ',
    intro: '全国の大学・地域・海外にあるギャルゲー / ビジュアルノベル同好会の情報をまとめたマップです。地図表示、地域別表示、カテゴリ絞り込み、キーワード検索、連絡先コピーに対応しています。',
    searchPlaceholder: '同好会名・グループID・学校名で検索',
    typeRegion: '地域合同サークル',
    typeSchool: '大学同好会',
    typeVnfest: 'ビジュアルノベル学園祭',
    sortDefault: '標準',
    sortTime: '登録順',
    sortName: '名称順',
    sortType: '種別順',
    chinaBtn: '中国の同好会',
    japanBtn: '日本の同好会',
    otherBtn: '海外の同好会',
    calendarBtn: 'イベントカレンダー',
    publicationBtn: '刊行物投稿',
    clubCount: '件',
    openSource: 'ソースコード',
    submitClub: '同好会を登録',
    submitEvent: 'イベントを登録',
    submitPublication: '刊行物の募集を投稿',
    invertCtrl: '操作を反転（Ctrl+クリックで詳細）',
    invertCtrlOn: '操作反転：オン',
    themeMode: 'テーマ：システムに合わせる',
    themeLight: 'テーマ：ライト',
    themeDark: 'テーマ：ダーク',
    noClub: '同好会情報はまだありません。登録をお待ちしています。',
    noPublication: '刊行物情報はまだありません。投稿をお待ちしています。',
    detailTypeRegion: '地域合同サークル',
    detailTypeSchool: '大学同好会',
    detailTypeVnfest: 'ビジュアルノベル学園祭',
    detailSectionIntro: '同好会紹介',
    detailSectionExt: '外部リンク',
    detailSectionContact: '連絡先',
    detailSectionActions: 'アクション',
    detailSectionWiki: 'サークルWiki',
    detailContactLockedLogin: '連絡先は参加メンバーのみに公開されています。\nログイン後、同好会への参加申請を送ってください。',
    detailContactLocked: '連絡先は参加メンバーのみに公開されています。',
    detailContactPending: '⏳ 参加申請を送信済みです。管理者の承認をお待ちください。',
    detailContactRejected: '❌ 参加申請は却下されました。',
    detailContactBound: '✅ この同好会に参加済みです。もう一度開くと連絡先を確認できます。',
    detailContactApply: '参加申請後に連絡先を確認できます。',
    detailBtnApplyClub: '📝 参加申請を送る',
    detailBtnEdit: '✏️ 同好会情報を編集',
    detailBtnMembers: '👥 メンバー一覧',
    detailBtnWiki: '📖 Wikiページを見る',
    detailBtnEditWiki: '✏️ Wiki内容を編集',
    detailBtnTransfer: '🔄 代表者を引き継ぐ',
    detailBtnLeave: '🚪 同好会を退会',
    detailBtnApply: '📝 申請する',
    detailNoRemark: '紹介文はまだありません。情報提供をお待ちしています。',
    detailNoContact: '連絡先は未登録です',
    detailRegistered: '✓ 登録済み',
    listEmptyFilter: '条件に合う同好会が見つかりません',
    listNoName: '名称未設定',
    listNoContact: '連絡先なし',
    listInfoHidden: '🔒 参加申請後に表示',
    listVerified: '登録済み',
    listUnverified: '未登録',
    listBound: '✅ 参加済み',
    listApply: '参加申請',
    listNoRemark: '紹介文はまだありません',
    listEstablished: '・設立：',
    memberBtnPromote: '管理者にする',
    memberBtnDemote: 'メンバーにする',
    memberBtnTransfer: '引き継ぐ',
    memberBtnKick: '退会させる',
    renderTitleDetail: '{0}・同好会詳細',
    renderTitleSearch: '🔍 全体検索・{0}件',
    renderTitleSummary: '全国ギャルゲー・ビジュアルノベル同好会データ',
    renderMetaRange: '範囲 {0}・大学同好会 {1}・地域合同 {2}',
    renderMetaSummary: '範囲 全体・大学同好会 {0}・地域合同 {1}',
    settingsRoleManager: '管理者',
    settingsRoleRep: '代表者',
    settingsRoleAdmin: 'スーパー管理者',
    domesticClubs: '国内同好会',
    countryOverseas: '海外',
    countryAll: '全体',
    confirmKickMember: '「{0}」を同好会から退会させますか？',
    confirmTransferRep: '⚠️ 代表者を「{0}」に引き継ぎますか？\n\n引き継ぎ後、あなたは管理者になります。この操作は取り消せません。',
    listPanelHeading: 'サイト情報',
    listIntroDesc1: '全国の大学・地域・海外にある Galgame / ビジュアルノベル同好会の情報をまとめています。地図表示、地域別表示、カテゴリ切り替え、連絡先コピーに対応しています。',
    listIntroDesc2: 'データは各同好会および公開情報をもとに掲載しています。新しい同好会情報の登録も歓迎しています。',
    listInvertCtrl: '操作反転（通常はオフ）',
    listThemeSwitch: 'ダークテーマ（システム連動）',
    listSubmitClub: '同好会情報を登録',
    listSubmitEvent: 'イベント情報を登録',
    listSubmitPublication: '刊行物募集を投稿',
    listGalonly: 'GalOnly 大学専用窓口',
    listOpenSource: 'ソースコード',
    listAnnouncements: 'お知らせ',
    listProvinceHeader: '地域インデックス',
    listProvinceHint: '掲載数の多い順',
    listAllRegions: 'すべて',
    listToolbarAll: 'すべての同好会',
    listToolbarSubtitle: '地域を選ぶと同好会を表示します。名称、グループID、種別でも絞り込めます。',
    listSearchPlaceholder: '同好会名 / グループID',
    listAllTypes: 'すべての種別',
    listSortTimeDesc: '登録順 ↓',
    listSortNameAsc: '名称 A→Z',
    listSortTypeAsc: '種別 A→Z',
    listCountSuffix: '件',
    listContactLabel: '連絡先',
    listRemarkLabel: '備考',
    listContactPrivate: '連絡先は未公開です',
    listUnknownProvince: '未分類',
    modeMap: '地図',
    modeList: 'リスト',
    modeStarmap: '星図',
    topLogin: 'ログイン / 登録',
    topAccount: 'アカウント',
    topAdmin: '同好会管理',
    roleAudit: 'イベント審査',
    vnRoleVisitor: '見習い同好',
    vnRoleMember: '同好会メンバー',
    vnRoleManager: '同好会管理者',
    vnRoleRep: '同好会代表',
    vnRoleAdmin: 'スーパー管理者',
    vnRoleDefault: '同好',
    vnSignatureEmpty: '“まだ自己紹介はありません”',
    vnNoClub: '参加中の同好会はありません',
    vnJoined: '参加',
    vnActive: '最終ログイン',
    vnCollectionEmptyClubs: '参加中の同好会はありません。地図から探してみましょう。',
    vnCollectionPublicationsSoon: '📖 刊行物コレクションは準備中です',
    vnCollectionLoginFirst: 'ログインしてください',
    alertLeaveSuccess: '同好会を退会しました',
    alertRoleUpdated: '役割を更新しました',
    alertKickSuccess: 'メンバーを退会させました',
    commentPlaceholder: 'この同好会へのコメントを書いてください…',
    confirmDeleteClub: '⚠️ この同好会を削除しますか？この操作は取り消せません。',
});

let currentLang = 'zh';

// 全局翻译辅助函数：可在任何地方使用，支持 {0} {1} 占位符
function __(key, ...args) {
    const t = translations[currentLang];
    if (!t || t[key] === undefined) {
        const zh = translations.zh;
        return zh && zh[key] !== undefined ? zh[key] : key;
    }
    let val = t[key];
    if (args.length) {
        args.forEach((arg, i) => { val = val.replace(new RegExp('\\{' + i + '\\}', 'g'), arg); });
    }
    return val;
}

// 平台图标映射
const PLATFORM_ICONS = {
  'b站': '📺', 'bilibili': '📺',
  'twitter': '🐦', 'x': '🐦',
  'bangumi': '📖',
  '微博': '📱', 'weibo': '📱',
  'discord': '💬',
  'qq': '💬', '微信': '💬', 'wechat': '💬',
  'github': '💻',
  '知乎': '📕', 'zhihu': '📕',
  '小红书': '📕', 'xiaohongshu': '📕',
  '豆瓣': '📕', 'douban': '📕',
  '贴吧': '📕', 'tieba': '📕',
  'niconico': '🎵', 'nico': '🎵',
  'youtube': '▶️', 'yt': '▶️',
  'pixiv': '🎨',
  'lofter': '📝',
  'fanbox': '💝', 'patreon': '💝', 'fantia': '💝',
  '官网': '🌐', 'website': '🌐', 'homepage': '🌐',
};
function getPlatformIcon(platform) {
  return PLATFORM_ICONS[platform.toLowerCase().trim()] || '🔗';
}

function updateUILanguage() {
    const t = translations[currentLang];
    if (!t) return;
    
    document.getElementById('selectedTitle').textContent = t.title;
    const introTitle = document.getElementById('introTitle');
    if (introTitle) introTitle.textContent = t.introTitle;
    const introBody = document.querySelector('#introCard .card-body');
    if (introBody) introBody.textContent = t.intro;
    
    const invertLabel = document.getElementById('invertCtrlLabel');
    if (invertLabel) {
        if (State.invertCtrlBubble) {
            invertLabel.textContent = t.invertCtrlOn;
        } else {
            invertLabel.textContent = t.invertCtrl;
        }
    }
    
    const themeLabel = document.getElementById('themeSwitchLabel');
    if (themeLabel) {
        const effectiveTheme = getPreferredTheme();
        if (State.themePreference === 'system') {
            themeLabel.textContent = t.themeMode;
        } else {
            themeLabel.textContent = effectiveTheme === 'dark' ? t.themeDark : t.themeLight;
        }
    }
    
    // side toggle buttons have been removed; nav is in top card
    

    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.placeholder = t.searchPlaceholder;
    
    const typeFilter = document.getElementById('typeFilter');
    if (typeFilter && typeFilter.options) {
        if (typeFilter.options[0]) typeFilter.options[0].text = t.typeAll;
        if (typeFilter.options[1]) typeFilter.options[1].text = t.typeRegion;
        if (typeFilter.options[2]) typeFilter.options[2].text = t.typeSchool;
        if (typeFilter.options[3]) typeFilter.options[3].text = t.typeVnfest;
    }
    
    const sortBtns = document.querySelectorAll('.sort-btn');
    if (sortBtns.length >= 4) {
        sortBtns[0].textContent = t.sortDefault;
        sortBtns[1].textContent = t.sortTime;
        sortBtns[2].textContent = t.sortName;
        sortBtns[3].textContent = t.sortType;
    }
    
    const searchModeBtn = document.getElementById('globalSearchBtn');
    if (searchModeBtn) {
        const label = searchModeBtn.querySelector('.search-label');
        if (label) label.textContent = t.globalSearch;
    }
    
    const selectedMeta = document.getElementById('selectedMeta');
    if (selectedMeta && State.currentDataSource) {
        selectedMeta.textContent = t.dataSource + State.currentDataSource;
    }
    
    const selectedProvince = document.getElementById('selectedProvince');
    if (selectedProvince) {
        const match = selectedProvince.textContent.match(/\d+/);
        if (match) {
            selectedProvince.textContent = match[0] + ' ' + t.clubCount;
        }
    }
    
    const submitClubBtn = document.getElementById('submitClubBtn');
    const submitEventBtn = document.getElementById('submitEventBtn');
    if (submitClubBtn) submitClubBtn.innerHTML = `📝 ${t.submitClub}`;
    if (submitEventBtn) submitEventBtn.innerHTML = `📅 ${t.submitEvent}`;
    const submitPublicationBtn = document.getElementById('submitPublicationBtn');
    if (submitPublicationBtn) submitPublicationBtn.innerHTML = `📖 ${t.submitPublication}`;
    setTextById('topLoginBtn', __('topLogin'));
    setTextById('topAccountBtn', __('topAccount'));
    setTextById('topAdminBtn', __('topAdmin'));
    if (!currentUser?.logged_in) setTextById('topUserName', __('settingsRoleVisitor'));
    
    const emptyTexts = document.querySelectorAll('.empty-text');
    emptyTexts.forEach(el => {
        if (el.textContent.includes('点击地图省份')) {
            el.textContent = t.noData;
        } else if (el.textContent.includes('暂无同好会信息')) {
            el.textContent = t.noClub;
        } else if (el.textContent.includes('暂无刊物信息')) {
            el.textContent = t.noPublication;
        }
    });
    
    const zhBtn = document.getElementById('langZhBtn');
    const jaBtn = document.getElementById('langJaBtn');
    if (zhBtn && jaBtn) {
        if (currentLang === 'zh') {
            zhBtn.classList.add('active');
            jaBtn.classList.remove('active');
        } else {
            zhBtn.classList.remove('active');
            jaBtn.classList.add('active');
        }
    }

    // 同步列表模式语言按钮状态
    const listZhBtn = document.getElementById('listLangZhBtn');
    const listJaBtn = document.getElementById('listLangJaBtn');
    if (listZhBtn && listJaBtn) {
        if (currentLang === 'zh') {
            listZhBtn.classList.add('active');
            listJaBtn.classList.remove('active');
        } else {
            listZhBtn.classList.remove('active');
            listJaBtn.classList.add('active');
        }
    }
    
    // 更新 HTML lang 属性
    document.documentElement.lang = currentLang === 'ja' ? 'ja' : 'zh-CN';

    // 更新导航按钮
    const navKeyMap = { china: 'chinaBtn', japan: 'japanBtn', overseas: 'otherBtn', calendar: 'calendarBtn', publication: 'publicationBtn' };
    document.querySelectorAll('.user-nav-btn').forEach(btn => {
        const key = navKeyMap[btn.dataset.action];
        if (key) btn.textContent = t[key];
    });

    // 更新抽屉面板文本
    const drawerTitle = document.getElementById('drawerTitle');
    if (drawerTitle) drawerTitle.textContent = t.title;
    const drawerDesc1 = document.getElementById('drawerDesc1');
    if (drawerDesc1) drawerDesc1.textContent = t.intro;
    const drawerOpenSource = document.querySelector('#mobileDrawer .submit-btn[href*="github"]');
    if (drawerOpenSource) drawerOpenSource.innerHTML = `📦 ${t.openSource}`;
    ['submitClubBtnDrawer', 'submitEventBtnDrawer', 'submitPublicationBtnDrawer'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = '📝 ' + t[id.replace('BtnDrawer', '').replace('submit', 'submit')];
    });

    updateListModeLanguage();

    // 更新排序按钮文字和详情面板
    updateSortButtonView();
    renderCurrentDetail();
}

function setTextById(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function updateSelectOptionText(selectId, labels) {
    const select = document.getElementById(selectId);
    if (!select || !select.options) return;
    labels.forEach(function(label, index) {
        if (select.options[index]) select.options[index].text = label;
    });
}

function updateListModeLanguage() {
    if (!currentUser?.logged_in) setTextById('listUserName', __('settingsRoleVisitor'));
    setTextById('listLoginBtn', __('topLogin'));
    setTextById('listAccountBtn', __('topAccount'));
    setTextById('listAdminBtn', __('topAdmin'));
    setTextById('listIntroTitle', __('introTitle'));
    const listToolbarTitle = document.getElementById('listToolbarTitle');
    if (listToolbarTitle && (!listToolbarTitle.textContent || /全部同好会|すべての同好会/.test(listToolbarTitle.textContent))) {
        listToolbarTitle.textContent = __('listToolbarAll');
    }

    const listPanelHeading = document.querySelector('.list-panel-heading');
    if (listPanelHeading) listPanelHeading.textContent = __('listPanelHeading');
    const listIntroDescs = document.querySelectorAll('.list-intro-desc');
    if (listIntroDescs[0]) listIntroDescs[0].textContent = __('listIntroDesc1');
    if (listIntroDescs[1]) listIntroDescs[1].textContent = __('listIntroDesc2');
    const listSwitchLabels = document.querySelectorAll('.list-switch .md3-switch-label');
    if (listSwitchLabels[0]) listSwitchLabels[0].textContent = __('listInvertCtrl');
    if (listSwitchLabels[1]) listSwitchLabels[1].textContent = __('listThemeSwitch');
    setTextById('listSubmitClubBtn', '📝 ' + __('listSubmitClub'));
    setTextById('listSubmitEventBtn', '📅 ' + __('listSubmitEvent'));
    setTextById('listSubmitPublicationBtn', '📖 ' + __('listSubmitPublication'));
    setTextById('listSubmitGalonlyBtn', __('listGalonly'));
    const listOpenSource = document.querySelector('.list-intro-links .submit-btn[href*="github"]');
    if (listOpenSource) listOpenSource.textContent = '📦 ' + __('listOpenSource');
    const annHeader = document.querySelector('.list-announcements-header');
    if (annHeader) annHeader.textContent = __('listAnnouncements');
    const provinceHeader = document.querySelector('.list-province-header span');
    if (provinceHeader) provinceHeader.textContent = __('listProvinceHeader');
    const provinceHint = document.querySelector('.list-province-header small');
    if (provinceHint) provinceHint.textContent = __('listProvinceHint');
    const toolbarSubtitle = document.querySelector('.list-toolbar-subtitle');
    if (toolbarSubtitle) toolbarSubtitle.textContent = __('listToolbarSubtitle');
    const toolbarCount = document.getElementById('listToolbarCount');
    if (toolbarCount) {
        const count = toolbarCount.textContent.match(/\d+/);
        if (count) toolbarCount.textContent = count[0] + ' ' + __('listCountSuffix');
    }

    const listSearchInput = document.getElementById('listSearchInput');
    if (listSearchInput) listSearchInput.placeholder = __('listSearchPlaceholder');
    updateSelectOptionText('listTypeFilter', [__('listAllTypes'), __('typeRegion'), __('typeSchool'), __('typeVnfest')]);
    updateSelectOptionText('listSortSelect', [__('sortDefault'), __('listSortTimeDesc'), __('listSortNameAsc'), __('listSortTypeAsc')]);

    document.querySelectorAll('.mode-tab[data-mode="map"] .mode-tab-label').forEach(function(el) { el.textContent = __('modeMap'); });
    document.querySelectorAll('.mode-tab[data-mode="list"] .mode-tab-label').forEach(function(el) { el.textContent = __('modeList'); });
    document.querySelectorAll('.mode-tab[data-mode="starmap"] .mode-tab-label').forEach(function(el) { el.textContent = __('modeStarmap'); });
}

// ==========================================
// UI 与 DOM 操作函数
// ==========================================
function applyMobileModeLayout() {
  const els = {
    map: document.getElementById('map'),
    selectedCard: document.getElementById('selectedCard'),
    sheetHandle: document.getElementById('mobileSheetHandle'),
    introCard: document.getElementById('introCard')
  };
  if (!els.map || !els.selectedCard || !els.introCard || !els.sheetHandle) return;

  if (Utils.isMobileViewport()) {
    if (els.sheetHandle.parentElement !== els.selectedCard) {
      els.selectedCard.insertBefore(els.sheetHandle, els.selectedCard.firstChild);
    }

    els.introCard.classList.add('collapsed');

    if (State.mobileSheetHeightPx) {
      els.selectedCard.style.height = `${State.mobileSheetHeightPx}px`;
    } else if (!els.selectedCard.style.height) {
      els.selectedCard.style.height = '46vh';
    }
  } else {
    if (els.sheetHandle.parentElement !== els.map) {
      els.map.insertBefore(els.sheetHandle, els.map.firstChild);
    }

    els.selectedCard.style.height = '';
  }
}

function getPreferredTheme() {
  if (State.themePreference === 'light' || State.themePreference === 'dark') return State.themePreference;
  return State.systemThemeMediaQuery?.matches ? 'dark' : 'light';
}

function updateThemeMetaColor(theme) {
  const themeColor = theme === 'dark' ? '#140913' : '#9b59b6';
  document.querySelectorAll('meta[name="theme-color"]:not([media])').forEach(meta => {
    meta.setAttribute('content', themeColor);
  });
  document.documentElement.style.colorScheme = theme;

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
    label.textContent = __(effectiveTheme === 'dark' ? 'themeDark' : 'themeLight');
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
  try { localStorage.setItem('themePreference', preference); } catch {}
  applyThemePreference();
}

function initThemePreference() {
  // 从 localStorage 恢复主题偏好
  try {
    const saved = localStorage.getItem('themePreference');
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
      State.themePreference = saved;
    }
  } catch {}

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
        // 进入全局搜索模式
        State.selectedProvinceKey = null;
        State.currentDetailProvinceName = '';
        State.currentDetailRows = [];
        
        if (State.mapViewState?.g) {
            State.mapViewState.g.selectAll('.province').classed('selected', false);
        }
        
        // 清空搜索输入框的占位提示，但保留搜索词
        renderCurrentDetail();
    } else if (options.resetToDefault) {
        // 退出全局搜索模式，恢复默认
        State.selectedProvinceKey = null;
        State.currentDetailProvinceName = '';
        State.currentDetailRows = [];
        hideMapBubble();
        updateSummaryUI(State.currentDataSource);
        renderCurrentDetail();
    }
}

function updateSortButtonView() {
  const sortBar = document.getElementById('sortBar');
  if (!sortBar) return;

  sortBar.querySelectorAll('.sort-btn').forEach((btn) => {
    const key = btn.getAttribute('data-sort') || '';
    btn.classList.remove('active');

    const config = {
      default: { text: __('sortDefaultShort'), active: State.listSort === 'default', next: 'default' },
      time_desc: { text: State.listSort === 'time_asc' ? __('sortTimeAsc') : __('sortTimeDesc'), active: ['time_asc', 'time_desc'].includes(State.listSort), next: State.listSort === 'time_asc' ? 'time_asc' : 'time_desc' },
      name_asc: { text: State.listSort === 'name_desc' ? __('sortNameZA') : __('sortNameAZ'), active: ['name_asc', 'name_desc'].includes(State.listSort), next: State.listSort === 'name_desc' ? 'name_desc' : 'name_asc' },
      type_asc: { text: State.listSort === 'type_desc' ? __('sortTypeZA') : __('sortTypeAZ'), active: ['type_asc', 'type_desc'].includes(State.listSort), next: State.listSort === 'type_desc' ? 'type_desc' : 'type_asc' }

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
    if (!rows || !Array.isArray(rows)) return [];
    
    let result = [...rows];
    
    // 类型筛选
    if (State.listType !== 'all') {
        result = result.filter(item => {
            if (State.listType === 'region') return item.type === 'region';
            if (State.listType === 'school') return item.type === 'school';
            if (State.listType === 'vnfest') return item.type === 'vnfest';
            return true;
        });
    }
    
    // 搜索筛选
    if (State.listQuery && State.listQuery.trim()) {
        const query = State.listQuery.toLowerCase().trim();
        result = result.filter(item => 
            (item.name || '').toLowerCase().includes(query) ||
            (item.info || '').toLowerCase().includes(query) ||
            (item.school || '').toLowerCase().includes(query)
        );
    }
    
    // 排序
    const sortStrategies = {
        default: (a, b) => {
            // 类型优先级: vnfest(0) > region(1) > school(2) > other(3)
            const typeOrder = { vnfest: 0, region: 1, school: 2 };
            const orderA = typeOrder[a.type] ?? 3;
            const orderB = typeOrder[b.type] ?? 3;
            if (orderA !== orderB) return orderA - orderB;
            // 同类型内: 已认证优先，再按名称拼音排序
            if ((b.verified || 0) !== (a.verified || 0)) return (b.verified || 0) - (a.verified || 0);
            return String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN-u-co-pinyin');
        },
        time_desc: (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0),
        time_asc: (a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0),
        name_asc: (a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN-u-co-pinyin'),
        name_desc: (a, b) => String(b.name || '').localeCompare(String(a.name || ''), 'zh-CN-u-co-pinyin'),
        type_asc: (a, b) => {
            const typeA = Utils.groupTypeText(a.type);
            const typeB = Utils.groupTypeText(b.type);
            return typeA.localeCompare(typeB, 'zh-CN-u-co-pinyin');
        },
        type_desc: (a, b) => {
            const typeA = Utils.groupTypeText(a.type);
            const typeB = Utils.groupTypeText(b.type);
            return typeB.localeCompare(typeA, 'zh-CN-u-co-pinyin');
        }
    };
    
    result.sort(sortStrategies[State.listSort] || sortStrategies.default);
    return result;
}

/**
 * 检查当前用户是否可管理指定俱乐部（前端版）
 */
function canManageClub(clubId, country) {
  if (!currentUser?.logged_in || !currentUser?.memberships) return false;
  return currentUser.memberships.some(m =>
    parseInt(m.club_id) === parseInt(clubId) &&
    (country ? (m.country || 'china') === country : true) &&
    m.status === 'active' &&
    (m.role === 'manager' || m.role === 'representative')
  );
}

/**
 * 检查当前用户是否已绑定指定俱乐部
 */
function isClubMember(clubId, country) {
  if (!currentUser?.logged_in || !currentUser?.memberships) return false;
  return currentUser.memberships.some(m =>
    parseInt(m.club_id) === parseInt(clubId) && (country ? (m.country || 'china') === country : true) && m.status === 'active'
  );
}

/**
 * 获取当前用户对指定俱乐部的绑定状态
 */
function getClubMembership(clubId, country) {
  if (!currentUser?.logged_in || !currentUser?.memberships) return null;
  if (country) {
    return currentUser.memberships.find(m =>
      parseInt(m.club_id) === parseInt(clubId) && (m.country || 'china') === country
    ) || null;
  }
  return currentUser.memberships.find(m => parseInt(m.club_id) === parseInt(clubId)) || null;
}

/**
 * 解析外部链接为 HTML
 */
function renderExternalLinks(externalLinksStr) {
  if (!externalLinksStr || !externalLinksStr.trim()) return '';
  const links = externalLinksStr.trim().split('\n')
    .map(line => {
      const idx = line.indexOf(': ');
      return idx > 0 ? { platform: line.substring(0, idx).trim(), url: line.substring(idx + 2).trim() } : null;
    })
    .filter(Boolean);
  if (!links.length) return '';
  return links.map(l => {
    const icon = getPlatformIcon(l.platform);
    const cleanUrl = l.url.replace(/\/+$/, '');
    const display = cleanUrl.replace(/^https?:\/\//, '');
    return `<a href="${Utils.escapeHTML(cleanUrl)}" target="_blank" rel="noopener noreferrer" class="group-ext-link">${icon} ${Utils.escapeHTML(l.platform)}：${Utils.escapeHTML(display)}</a>`;
  }).join('');
}

// ===== 地图/列表模式切换 =====
function switchViewMode(mode) {
  if (mode === 'starmap') {
    window.location.href = './star_map.html';
    return;
  }
  if (mode === State.viewMode) return;
  State.viewMode = mode;

  // 更新标签 UI
  document.querySelectorAll('.mode-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.mode === mode);
    t.setAttribute('aria-selected', t.dataset.mode === mode);
  });

  if (mode === 'list') {
    animateToListView();
  } else {
    animateToMapView();
  }
}

function animateToListView() {
  const mapSvg = document.getElementById('mapSvg');
  const card = document.getElementById('selectedCard');
  const listView = document.getElementById('listModeView');
  if (!listView) return;

  const leftPanel = document.querySelector('.list-left');
  const centerPanel = document.querySelector('.list-center');
  const clubGrid = document.getElementById('clubGrid');
  const toolbar = document.getElementById('listToolbar');

  // 重置动画状态到初始位置
  const resetStyle = (el, prop, val) => { if (el) { el.style.transition = 'none'; el.style[prop] = val; } };
  if (leftPanel) {
    leftPanel.style.transition = 'none';
    leftPanel.style.transform = 'translateX(-100%)';
    leftPanel.style.opacity = '0';
  }
  if (centerPanel) {
    centerPanel.style.transition = 'none';
    centerPanel.style.transform = 'translateX(-100%)';
    centerPanel.style.opacity = '0';
  }
  resetStyle(clubGrid, 'transform', 'translateX(30px)');
  resetStyle(clubGrid, 'opacity', '0');
  if (toolbar) { toolbar.style.transition = 'none'; toolbar.style.opacity = '0'; }

  // Phase 1 (T+0ms): 地图 + 悬浮元素 淡出
  if (mapSvg) { mapSvg.style.transition = 'opacity 0.3s ease'; mapSvg.style.opacity = '0'; }
  if (card) {
    card.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    card.style.opacity = '0';
    card.style.transform = 'translateX(20px)';
  }
  // 隐藏原始悬浮元素
  var uc = document.getElementById('userInfoCard');
  if (uc) { uc.style.setProperty('opacity', '0', 'important'); uc.classList.remove('view-list'); }
  var ic = document.getElementById('introCard');
  if (ic) { ic.style.setProperty('opacity', '0', 'important'); }

  // Phase 2 (T+150ms): 三区同时激活
  setTimeout(() => {
    document.documentElement.classList.add('list-mode-active');
    listView.style.display = 'block';
    // 进入列表模式时默认显示中国同好会
    State.listRegionFilter = 'china';
    renderListView();
    // 激活「中国同好会」导航按钮
    document.querySelectorAll('.list-nav-row .user-nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.list-nav-row .user-nav-btn[data-action="china"]')?.classList.add('active');

    // 强制回流确保动画触发
    void listView.offsetHeight;

    // ① 左面板滑入（简介+公告）
    if (leftPanel) {
      leftPanel.style.transition = 'transform 0.35s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.3s ease';
      leftPanel.style.transform = 'translateX(0)';
      leftPanel.style.opacity = '1';
    }

    // ①-② 中间列滑入（省份索引）
    if (centerPanel) {
      centerPanel.style.transition = 'transform 0.35s cubic-bezier(0.22, 1, 0.36, 1) 0.05s, opacity 0.3s ease 0.05s';
      centerPanel.style.transform = 'translateX(0)';
      centerPanel.style.opacity = '1';
    }

    // ② 右面板滑入（主视觉）
    if (clubGrid) {
      clubGrid.style.transition = 'transform 0.4s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.35s ease';
      clubGrid.style.transform = 'translateX(0)';
      clubGrid.style.opacity = '1';
    }

    // ③ 工具栏渐入
    if (toolbar) {
      toolbar.style.transition = 'opacity 0.3s ease 0.1s';
      toolbar.style.opacity = '1';
    }

    // ④ 卡片交错入场 (350ms 后，30ms 间隔)
    setTimeout(() => {
      const ccards = document.querySelectorAll('.club-card');
      ccards.forEach((c, i) => {
        setTimeout(() => { c.classList.add('visible'); }, i * 30);
      });
    }, 350);
  }, 150);
}

function animateToMapView() {
  const mapSvg = document.getElementById('mapSvg');
  const card = document.getElementById('selectedCard');
  const listView = document.getElementById('listModeView');
  const userInfo = document.getElementById('userInfoCard');
  if (!listView) return;

  const leftPanel = document.querySelector('.list-left');
  const centerPanel = document.querySelector('.list-center');
  const clubGrid = document.getElementById('clubGrid');
  const toolbar = document.getElementById('listToolbar');

  // Phase 1 (T+0ms): 卡片反向交错淡出
  const cards = document.querySelectorAll('.club-card.visible');
  cards.forEach((c, i) => {
    setTimeout(() => { c.classList.remove('visible'); }, (cards.length - 1 - i) * 20);
  });

  // Phase 2 (T+150ms): 工具栏淡出
  setTimeout(() => {
    if (toolbar) { toolbar.style.transition = 'opacity 0.2s ease'; toolbar.style.opacity = '0'; }
  }, 150);

  // Phase 3 (T+200ms): 左面板 + 中间列滑出
  setTimeout(() => {
    if (leftPanel) {
      leftPanel.style.transition = 'transform 0.2s ease, opacity 0.2s ease';
      leftPanel.style.transform = 'translateX(-100%)';
      leftPanel.style.opacity = '0';
    }
    if (centerPanel) {
      centerPanel.style.transition = 'transform 0.2s ease, opacity 0.2s ease';
      centerPanel.style.transform = 'translateX(-100%)';
      centerPanel.style.opacity = '0';
    }
  }, 200);

  // Phase 4 (T+250ms): 右面板滑出
  setTimeout(() => {
    if (clubGrid) {
      clubGrid.style.transition = 'transform 0.25s ease, opacity 0.2s ease';
      clubGrid.style.transform = 'translateX(30px)';
      clubGrid.style.opacity = '0';
    }
  }, 250);

  // Phase 5 (T+450ms): 隐藏列表容器，地图恢复
  setTimeout(() => {
    document.documentElement.classList.remove('list-mode-active');
    listView.style.display = 'none';
    if (mapSvg) { mapSvg.style.transition = 'opacity 0.3s ease'; mapSvg.style.opacity = '1'; }
    if (card) {
      card.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      card.style.opacity = '1';
      card.style.transform = 'translateX(0)';
    }

    // 重置动画样式以备下次进入
    [leftPanel, centerPanel, clubGrid].forEach(el => {
      if (el) { el.style.transition = 'none'; el.style.transform = ''; el.style.opacity = ''; }
    });

    // 恢复悬浮元素（移除内联 opacity）
    var uc = document.getElementById('userInfoCard');
    if (uc) { uc.style.removeProperty('opacity'); uc.classList.remove('view-list'); }
    var ic = document.getElementById('introCard');
    if (ic) { ic.style.removeProperty('opacity'); }
  }, 450);
}

function renderListAnnouncements() {
  const listEl = document.getElementById('listAnnouncementsList');
  if (!listEl) return;

  // 复用顶部公告横幅的公告数据
  const bannerItems = document.querySelectorAll('#announcementBannerBody .announcement-item');
  if (bannerItems.length > 0) {
    listEl.innerHTML = Array.from(bannerItems).map(item => {
      const title = item.dataset.title || '';
      const date = item.dataset.time || '';
      const dateDisplay = date ? date.split(' ')[0] : '';
      const content = item.dataset.content || '';
      return '<div class="list-ann-item" data-title="' + Utils.escapeHTML(title) + '" data-content="' + Utils.escapeHTML(content) + '" data-time="' + date + '">' +
        '<div class="ann-title">' + Utils.escapeHTML(title) + '</div>' +
        '<div class="ann-date">' + dateDisplay + '</div></div>';
    }).join('');

    // 绑定点击事件（复用公告详情弹窗）
    listEl.querySelectorAll('.list-ann-item').forEach(el => {
      el.addEventListener('click', function () {
        var title = this.dataset.title || '';
        var content = this.dataset.content || '';
        var time = this.dataset.time || '';
        if (typeof openAnnounceDetail === 'function') {
          openAnnounceDetail(title, content, time);
        }
      });
    });
  } else {
    listEl.innerHTML = '<div class="list-ann-item" style="color:var(--md-on-surface-variant);font-size:11px;">暂无公告</div>';
  }
}

function syncListModeUserState() {
  const mapAvatar = document.getElementById('topUserAvatar');
  const mapName = document.getElementById('topUserName');
  const mapBadge = document.getElementById('topUserRoleBadge');
  const mapLoginBtn = document.getElementById('topLoginBtn');
  const mapAccountBtn = document.getElementById('topAccountBtn');
  const mapAdminBtn = document.getElementById('topAdminBtn');

  const listAvatar = document.getElementById('listUserAvatar');
  const listName = document.getElementById('listUserName');
  const listBadge = document.getElementById('listRoleBadge');
  const listLoginBtn = document.getElementById('listLoginBtn');
  const listAccountBtn = document.getElementById('listAccountBtn');
  const listAdminBtn = document.getElementById('listAdminBtn');

  if (listAvatar && mapAvatar) {
    listAvatar.innerHTML = mapAvatar.innerHTML;
    listAvatar.style.cssText = mapAvatar.style.cssText;
  }
  if (listName && mapName) listName.textContent = mapName.textContent;
  if (listBadge && mapBadge) {
    listBadge.style.display = mapBadge.style.display;
    listBadge.textContent = mapBadge.textContent;
    listBadge.style.background = mapBadge.style.background;
    listBadge.style.color = mapBadge.style.color;
  }
  if (listLoginBtn && mapLoginBtn) listLoginBtn.style.display = mapLoginBtn.style.display;
  if (listAccountBtn && mapAccountBtn) listAccountBtn.style.display = mapAccountBtn.style.display;
  if (listAdminBtn && mapAdminBtn) listAdminBtn.style.display = mapAdminBtn.style.display;
  if (listLoginBtn) listLoginBtn.textContent = __('topLogin');
  if (listAccountBtn) listAccountBtn.textContent = __('topAccount');
  if (listAdminBtn) listAdminBtn.textContent = __('topAdmin');

  // 同步公告横幅
  const mapBanner = document.getElementById('announcementBanner');
  const listBanner = document.getElementById('listAnnBanner');
  if (listBanner && mapBanner) {
    listBanner.style.display = mapBanner.style.display;
    const mapBody = document.getElementById('announcementBannerBody');
    const listBody = document.getElementById('listAnnBannerBody');
    if (listBody && mapBody) listBody.innerHTML = mapBody.innerHTML;
  }

  // 同步主题开关状态
  const themeSwitch = document.getElementById('themeSwitch');
  const listThemeSwitch = document.getElementById('listThemeSwitch');
  if (listThemeSwitch && themeSwitch) listThemeSwitch.checked = themeSwitch.checked;

  // 同步反转控制开关状态
  const invertSwitch = document.getElementById('invertCtrlSwitch');
  const listInvertCtrl = document.getElementById('listInvertCtrl');
  if (listInvertCtrl && invertSwitch) listInvertCtrl.checked = invertSwitch.checked;

  // 同步语言
  const introTitle = document.getElementById('introTitle');
  const listIntroTitle = document.getElementById('listIntroTitle');
  if (listIntroTitle && introTitle) listIntroTitle.textContent = introTitle.textContent;
}

var _listControlsBound = false;

function bindListModeControls() {
  if (_listControlsBound) return;
  _listControlsBound = true;

  document.getElementById('listInvertCtrl')?.addEventListener('change', function() {
    var main = document.getElementById('invertCtrlSwitch');
    if (main) {
      main.checked = this.checked;
      main.dispatchEvent(new Event('change'));
    }
  });

  document.getElementById('listThemeSwitch')?.addEventListener('change', function() {
    var main = document.getElementById('themeSwitch');
    if (main) {
      main.checked = this.checked;
      main.dispatchEvent(new Event('change'));
    }
  });

  ['submitClubBtn', 'submitEventBtn', 'submitPublicationBtn', 'submitGalonlyBtn'].forEach(function(name) {
    var listBtn = document.getElementById('list' + name.charAt(0).toUpperCase() + name.slice(1));
    if (listBtn) {
      listBtn.addEventListener('click', function() {
        var main = document.getElementById(name);
        if (main) main.click();
      });
    }
  });

  document.getElementById('listLoginBtn')?.addEventListener('click', function() {
    openAccountModal('login');
  });

  document.getElementById('listAccountBtn')?.addEventListener('click', function(e) {
    goUserCenter(e);
  });

  // 列表模式导航按钮（区域筛选）
  document.querySelectorAll('.list-nav-row .user-nav-btn').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      e.preventDefault();
      var action = this.dataset.action;
      switch (action) {
        case 'china':
          State.listRegionFilter = 'china';
          break;
        case 'japan':
          State.listRegionFilter = 'japan';
          break;
        case 'overseas':
          State.listRegionFilter = 'overseas';
          break;
        case 'calendar':
          document.getElementById('calendarModal')?.classList.add('open');
          document.getElementById('calendarModal')?.setAttribute('aria-hidden', 'false');
          return; // 不重新渲染
        case 'publication':
          (function() {
            var pubModal = document.getElementById('publicationModal');
            if (pubModal) {
              if (typeof renderPublicationList === 'function') renderPublicationList();
              var addBtn = document.getElementById('addPublicationBtn');
              if (addBtn) addBtn.style.display = hasRole('manager') ? 'flex' : 'none';
              pubModal.classList.add('open');
              pubModal.setAttribute('aria-hidden', 'false');
            }
          })();
          return; // 不重新渲染
      }
      // 更新按钮激活样式
      document.querySelectorAll('.list-nav-row .user-nav-btn').forEach(function(b) {
        b.classList.remove('active');
      });
      this.classList.add('active');
      // 重新渲染列表
      renderListView();
    });
  });

  // 列表模式语言切换
  document.getElementById('listLangZhBtn')?.addEventListener('click', function() {
    currentLang = 'zh';
    localStorage.setItem('language', 'zh');
    updateUILanguage();
    renderCurrentDetail();
  });
  document.getElementById('listLangJaBtn')?.addEventListener('click', function() {
    currentLang = 'ja';
    localStorage.setItem('language', 'ja');
    updateUILanguage();
    renderCurrentDetail();
  });

  // 列表模式视图切换按钮
  document.querySelectorAll('.list-top-bar .mode-tab').forEach(tab => {
    tab.addEventListener('click', function(e) {
      e.stopPropagation();
      var mode = this.dataset.mode;
      if (mode === State.viewMode) return;
      switchViewMode(mode);
    });
  });
}

function normalizeProvince(name) {
  return Utils.normalizeProvinceName(name);
}

function getClubProvinceNames(club) {
  return Utils.getClubProvinceNames(club);
}

function getClubProvinceLabel(club) {
  const names = getClubProvinceNames(club);
  return names.length ? names.join('、') : normalizeProvince(club?.province || club?.prefecture || '');
}

function isJapanClub(club) {
  return club?.country === 'japan' || Boolean(club?.prefecture);
}

function addClubToProvinceMap(map, item) {
  if (item.type === 'non-regional') {
    if (!map.has('__non_regional__')) map.set('__non_regional__', []);
    map.get('__non_regional__').push(item);
    return;
  }
  getClubProvinceNames(item).forEach(function(key) {
    if (!key) return;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  });
}

const LIST_ALL_REGION_KEY = '__all_regions__';

function renderListView() {
  const provinceIndexList = document.getElementById('provinceIndexList');
  const clubGrid = document.getElementById('clubGrid');
  const toolbarTitle = document.getElementById('listToolbarTitle');
  const toolbarCount = document.getElementById('listToolbarCount');
  if (!provinceIndexList || !clubGrid) return;

  // 渲染左面板公告
  renderListAnnouncements();

  // 同步用户状态到列表模式
  syncListModeUserState();
  bindListModeControls();

  // 获取所有同好会数据（按区域过滤）
  const allClubs = [];
  const japanSet = new Set();
  const filter = State.listRegionFilter || 'all';
  if (filter === 'japan') {
    (State.japanRows || []).forEach(function(c) { allClubs.push(c); japanSet.add(c); });
  } else if (filter === 'overseas') {
    (State.bandoriRows || []).forEach(function(c) { if (getClubProvinceNames(c).includes('海外')) allClubs.push(c); });
  } else if (filter === 'china') {
    (State.bandoriRows || []).forEach(function(c) { if (!getClubProvinceNames(c).includes('海外')) allClubs.push(c); });
  } else {
    (State.japanRows || []).forEach(function(c) { allClubs.push(c); japanSet.add(c); });
    (State.bandoriRows || []).forEach(function(c) { allClubs.push(c); });
  }
  const totalCount = allClubs.length;

  // 构建省份/都道府县索引（统一去掉"省""市"后缀防重复）
  const provinces = new Map();
  allClubs.forEach(club => {
    const names = japanSet.has(club) ? [normalizeProvince(club.prefecture || club.province || __('japanBtn'))] : getClubProvinceNames(club);
    (names.length ? names : [__('listUnknownProvince')]).forEach(function(p) {
      if (!provinces.has(p)) provinces.set(p, []);
      provinces.get(p).push(club);
    });
  });

  provinces.set(LIST_ALL_REGION_KEY, allClubs);
  const sortedProvinces = [
    [LIST_ALL_REGION_KEY, allClubs],
    ...Array.from(provinces.entries())
      .filter(([province]) => province !== LIST_ALL_REGION_KEY)
      .sort((a, b) => b[1].length - a[1].length)
  ];

  const getProvinceLabel = (province) => province === LIST_ALL_REGION_KEY ? __('listAllRegions') : province;

  // 渲染省份索引
  provinceIndexList.innerHTML = sortedProvinces.map(([province, rows]) =>
    `<div class="province-index-item" data-province="${Utils.escapeHTML(province)}">
      <span>${Utils.escapeHTML(getProvinceLabel(province))}</span>
      <span class="province-index-count">${rows.length}</span>
    </div>`
  ).join('');

  // 省份索引点击事件
  provinceIndexList.querySelectorAll('.province-index-item').forEach(item => {
    item.addEventListener('click', function() {
      provinceIndexList.querySelectorAll('.province-index-item').forEach(i => i.classList.remove('active'));
      this.classList.add('active');
      const province = this.dataset.province;
      const rows = provinces.get(province) || [];
      renderClubCards(rows);
      // 让新卡片可见（直接可见，无入场动画）
      document.querySelectorAll('.club-card').forEach(card => card.classList.add('visible'));
      if (toolbarTitle) toolbarTitle.textContent = getProvinceLabel(province);
      if (toolbarCount) toolbarCount.textContent = rows.length + ' ' + __('listCountSuffix');
    });
  });

  // 默认选中第一个省份
  if (sortedProvinces.length > 0) {
    const firstItem = provinceIndexList.querySelector('.province-index-item');
    if (firstItem) {
      firstItem.classList.add('active');
      renderClubCards(sortedProvinces[0][1]);
      // 新卡片直接可见（无入场动画）
      document.querySelectorAll('.club-card').forEach(function(c) { c.classList.add('visible'); });
      if (toolbarTitle) toolbarTitle.textContent = getProvinceLabel(sortedProvinces[0][0]);
      if (toolbarCount) toolbarCount.textContent = sortedProvinces[0][1].length + ' ' + __('listCountSuffix');
    }
  }

  // 绑定列表搜索/筛选/排序事件
  const searchInput = document.getElementById('listSearchInput');
  const typeFilter = document.getElementById('listTypeFilter');
  const sortSelect = document.getElementById('listSortSelect');

  if (searchInput) {
    searchInput.addEventListener('input', Utils.debounce(() => {
      State.listQuery = searchInput.value;
      refilterCards(provinces);
    }, 300));
  }
  if (typeFilter) {
    typeFilter.addEventListener('change', () => {
      State.listType = typeFilter.value;
      refilterCards(provinces);
    });
  }
  if (sortSelect) {
    sortSelect.addEventListener('change', () => {
      State.listSort = sortSelect.value;
      refilterCards(provinces);
    });
  }
}

function renderClubCards(rows) {
  const grid = document.getElementById('clubGrid');
  if (!grid) return;

  const filtered = getFilteredSortedRows(rows);

  if (!filtered.length) {
    grid.innerHTML = '<div class="list-empty-state">' + __('listEmptyFilter') + '</div>';
    return;
  }

  grid.innerHTML = filtered.map((item, index) => {
    const name = Utils.escapeHTML(item.name || __('listNoName'));
    const type = Utils.escapeHTML(Utils.groupTypeText(item.type));
    const province = Utils.escapeHTML(isJapanClub(item) ? normalizeProvince(item.prefecture || item.province || '') : getClubProvinceLabel(item));
    const contactInfo = Utils.escapeHTML(item.info || '');
    const schoolInfo = Utils.escapeHTML(item.school || item.remark || __('listNoRemark'));
    const verified = item.verified;
    const logoUrl = Utils.resolveMediaUrl(item.logo_url || '');
    const initial = name.charAt(0);

    // 基于名称生成稳定头像色，避免列表刷新时视觉跳动
    const hue = (name.split('').reduce((a, c) => a + c.charCodeAt(0), 0) * 37) % 360;

    const avatarHtml = logoUrl
      ? `<img src="${Utils.escapeHTML(logoUrl)}" alt="" loading="lazy">`
      : initial;

    return `
      <article class="club-card" style="transition-delay:${index * 30}ms" data-index="${index}">
        <div class="club-card-top">
          <div class="club-card-avatar" style="background: hsl(${hue}, 48%, 46%);">
            ${avatarHtml}
          </div>
          <div class="club-card-info">
            <div class="club-card-name" title="${name}">${name}</div>
            <div class="club-card-tags">
              <span class="club-card-tag type-tag">${type}</span>
              ${verified ? '<span class="club-card-tag verified-tag">' + __('listVerified') + '</span>' : ''}
            </div>
            <div class="club-card-location">${province}</div>
          </div>
        </div>
        <div class="club-card-divider"></div>
        <div class="club-card-meta">
          <div class="club-card-meta-row">
            <span class="club-card-meta-label">${__('listContactLabel')}</span>
            <span class="club-card-contact">${contactInfo || __('listContactPrivate')}</span>
          </div>
          <div class="club-card-meta-row">
            <span class="club-card-meta-label">${__('listRemarkLabel')}</span>
            <span class="club-card-desc">${schoolInfo}</span>
          </div>
        </div>
      </article>
    `;
  }).join('');

  // 点击卡片 - 在列表模式下直接打开详情弹窗
  grid.querySelectorAll('.club-card').forEach((el, i) => {
    el.addEventListener('click', () => {
      const clubData = filtered[i];
      if (!clubData) return;
      if (typeof showClubDetail === 'function') {
        showClubDetail(clubData);
      }
    });
  });
}

function refilterCards(provinces) {
  const activeProvince = document.querySelector('.province-index-item.active');
  if (activeProvince) {
    const provinceName = activeProvince.dataset.province;
    const rows = (provinces.get(provinceName) || []);
    renderClubCards(rows);
    // 使过滤后的卡片可见
    document.querySelectorAll('.club-card').forEach(card => card.classList.add('visible'));
  }
}

function renderGroupList(rows) {
  const listEl = document.getElementById('groupList');
  if (!listEl) return;

  if (!rows.length) {
    listEl.innerHTML = '<div class="empty-text">' + __('listEmptyFilter') + '</div>';
    return;
  }

  listEl.innerHTML = rows.map((item) => {
    const name = Utils.escapeHTML(item.name || __('listNoName'));
    const rawText = Utils.escapeHTML(item.raw_text || item.name || '');
    const isHidden = item.info_hidden === true;
    const canApply = item.can_apply === true;
    const clubId = parseInt(item.id);
    const member = getClubMembership(clubId, item.country);
    const isMember = member && member.status === 'active';

    let infoHtml, infoText;
    if (isMember || !isHidden) {
      const contactInfo = item.info || '';
      const detectedUrl = Utils.extractUrl(item) || (/^https?:\/\//.test(contactInfo) ? contactInfo : null);
      if (detectedUrl) {
        infoHtml = `<a href="${Utils.escapeHTML(detectedUrl)}" target="_blank" rel="noopener noreferrer" style="color:var(--md-primary);text-decoration:none">${Utils.escapeHTML(contactInfo)}</a>`;
        infoText = contactInfo;
      } else {
        infoHtml = Utils.escapeHTML(contactInfo || __('listNoContact'));
        infoText = contactInfo;
      }
    } else {
      infoHtml = '<span style="opacity:0.5">' + __('listInfoHidden') + '</span>';
      infoText = __('listInfoHidden');
    }

    const extLinksHtml = renderExternalLinks(item.external_links);
    const type = Utils.escapeHTML(Utils.groupTypeText(item.type));
    const verifyMeta = Utils.escapeHTML(item.verified ? __('listVerified') : __('listUnverified')) + __('listEstablished') + Utils.escapeHTML(Utils.formatCreatedAt(item.created_at));

    const clubData = encodeURIComponent(JSON.stringify({
      id: item.id,
      name: name,
      school: item.school || '',
      info: infoText,
      originalInfo: item.info || '',
      detectedUrl: '',
      infoHidden: isHidden,
      canApply: canApply,
      type: type,
      rawType: item.type,
      verifyMeta: verifyMeta,
      province: item.province || '',
      provinces: item.provinces || [],
      remark: item.remark || __('listNoRemark'),
      country: item.country || 'china',
      logo_url: item.logo_url || '',
      external_links: item.external_links || '',
    }));

    const statusBadge = isMember
      ? '<span style="font-size:11px;color:#4CAF50;white-space:nowrap">' + __('listBound') + '</span>'
      : canApply
        ? `<button class="apply-mini-btn" data-club='${clubData}' type="button" style="font-size:11px;padding:4px 10px;border-radius:6px;border:none;background:var(--md-primary);color:#fff;cursor:pointer;white-space:nowrap">${__('listApply')}</button>`
        : '';

    const province = Utils.escapeHTML(getClubProvinceLabel(item));

    const avatarHtml = item.logo_url
        ? `<img src="${Utils.escapeHTML(Utils.resolveMediaUrl(item.logo_url))}" alt="" class="club-avatar" loading="lazy">`
        : `<div class="club-avatar club-avatar-fallback">🏫</div>`;

    return `
        <article class="group-item" data-club='${clubData}'>
          <div class="group-main">
            ${avatarHtml}
            <div class="group-header">
              <h3 class="group-name" title="${rawText}">${name}</h3>
              <div class="group-top-tags">
                <span class="group-chip">${type}</span>
                <span class="group-chip-outline">${province}</span>
              </div>
            </div>
          </div>
          <div class="group-divider"></div>
          <div class="group-footer">
            <div class="group-footer-left">
              <span class="group-info" data-club='${clubData}'>${infoHtml}</span>
              ${extLinksHtml ? `<div class="group-ext-links">${extLinksHtml}</div>` : ''}
            </div>
            <div class="group-footer-right">${statusBadge}</div>
          </div>
        </article>
    `;
  }).join('');

  // 点击列表项 → 打开详情或编辑
  document.querySelectorAll('.group-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.classList.contains('apply-mini-btn') || e.target.closest('.apply-mini-btn')) return;
      const clubData = item.getAttribute('data-club');
      if (clubData) {
        const club = JSON.parse(decodeURIComponent(clubData));
        showClubDetail(club);
      }
    });
  });

  // 点击 info → 打开详情
  document.querySelectorAll('.group-info').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const clubData = el.getAttribute('data-club');
      if (clubData) showClubDetail(JSON.parse(decodeURIComponent(clubData)));
    });
  });

  // 列表内申请绑定按钮
  document.querySelectorAll('.apply-mini-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const clubData = btn.getAttribute('data-club');
      if (clubData) {
        const club = JSON.parse(decodeURIComponent(clubData));
        openMembershipApplyModal(club);
      }
    });
  });
}

function getClubWikiKey(club) {
  const country = club.country || State.currentCountry || 'china';
  return country + '-' + club.id;
}

async function loadWikiIndex() {
  if (wikiIndexCache) return wikiIndexCache;
  if (!wikiIndexPromise) {
    wikiIndexPromise = fetch('./wiki/index.json', { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) return {};
        return r.json();
      })
      .catch(function () {
        return {};
      })
      .then(function (data) {
        wikiIndexCache = data || {};
        return wikiIndexCache;
      });
  }
  return wikiIndexPromise;
}

async function hydrateClubWikiLink(club) {
  const wrap = document.getElementById('clubWikiActionWrap');
  if (!wrap) return;
  const index = await loadWikiIndex();
  const wikiKey = getClubWikiKey(club);
  const item = index[wikiKey];
  const clubId = parseInt(club.id);
  const clubCountry = club.country || State.currentCountry || 'china';
  const canEditWiki = canManageClub(clubId, clubCountry) || hasRole('super_admin');
  if ((!item || !item.url) && !canEditWiki) return;

  const links = [];
  const wikiLangParam = currentLang === 'ja' ? 'lang=ja' : 'lang=zh';
  if (item && item.url) {
    const cleanUrl = String(item.url).replace(/^\.?\//, '');
    links.push('<a class="club-detail-btn primary full" href="./wiki/' +
      Utils.escapeHTML(cleanUrl) +
      '?' + wikiLangParam +
      '" style="margin-bottom:4px" target="_blank" rel="noopener noreferrer">' +
      Utils.escapeHTML(__('detailBtnWiki')) +
      '</a>');
  }
  if (canEditWiki) {
    const editPath = 'admin/wiki_editor.html?club_key=' + encodeURIComponent(wikiKey) + '&' + wikiLangParam;
    const isBundledClient = window.location.protocol === 'file:' ||
      window.location.protocol === 'capacitor:' ||
      window.location.protocol === 'ionic:' ||
      window.location.protocol === 'app:' ||
      Boolean(window.Capacitor);
    const editUrl = isBundledClient
      ? CONFIG.PUBLIC_BASE_URL.replace(/\/$/, '') + '/' + editPath
      : './' + editPath;
    links.push('<a class="club-detail-btn secondary full" href="' +
      Utils.escapeHTML(editUrl) +
      '" style="margin-bottom:4px" target="_blank" rel="noopener noreferrer">' +
      Utils.escapeHTML(__('detailBtnEditWiki')) +
      '</a>');
  }
  wrap.innerHTML = links.join('');
  const section = document.getElementById('clubWikiSection');
  if (section) section.style.display = '';
}

function showClubDetail(club) {
  const modal = document.getElementById('clubDetailModal');
  const content = document.getElementById('clubDetailContent');
  if (!modal) return;

  const esc = (str) => {
    if (!str) return '';
    return String(str).replace(/[&<>]/g, (m) => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
  };

  const clubId = parseInt(club.id);
  const clubCountry = club.country || 'china';
  const isClubManager = canManageClub(clubId, clubCountry);
  const isBound = isClubMember(clubId, clubCountry);
  const isInfoHidden = club.infoHidden === true || club.info === '申请绑定后可见';
  const canApply = club.canApply === true && !isBound;

  // ——— Header ———
  const avatarHtml = club.logo_url
    ? `<img src="${esc(Utils.resolveMediaUrl(club.logo_url))}" alt="" class="club-detail-avatar">`
    : `<div class="club-detail-avatar club-detail-avatar-fallback">🏫</div>`;
  const rawType = club.rawType || club.type;
  const typeLabel = rawType === 'region' ? __('detailTypeRegion') : rawType === 'vnfest' ? __('detailTypeVnfest') : __('detailTypeSchool');
  const provinceLabel = club.country === 'japan'
    ? (club.prefecture || club.province || __('detailUnfilled'))
    : (getClubProvinceLabel(club) || __('detailUnfilled'));
  const headerHtml = `
    <div class="club-detail-header">
      ${avatarHtml}
      <div class="club-detail-header-info">
        <div class="club-detail-name">${esc(club.name)}</div>
        <div class="club-detail-meta-row">
          <span class="club-detail-chip">${esc(provinceLabel)}</span>
          <span class="club-detail-chip primary">${esc(typeLabel)}</span>
          <span class="club-detail-chip verified">${__('detailRegistered')}</span>
        </div>
      </div>
    </div>
  `;

  // ——— 简介 ———
  const descHtml = `
    <div class="club-detail-section">
      <div class="club-detail-section-title">${__('detailSectionIntro')}</div>
      <div class="club-detail-card">
        <div class="club-detail-description">${esc(club.remark || '暂无介绍，欢迎补充~')}</div>
      </div>
    </div>
  `;

  // ——— 对外平台（内联链接样式） ———
  const parseExternalLinks = () => {
    if (!club.external_links || !club.external_links.trim()) return '';
    const links = club.external_links.trim().split('\n')
      .map(line => {
        const idx = line.indexOf(': ');
        return idx > 0 ? { platform: line.substring(0, idx).trim(), url: line.substring(idx + 2).trim() } : null;
      })
      .filter(Boolean);
    if (!links.length) return '';
    return `
      <div class="club-detail-section">
        <div class="club-detail-section-title">${__('detailSectionExt')}</div>
        <div class="club-detail-card club-detail-ext-list">
          ${links.map(l => {
            const icon = getPlatformIcon(l.platform);
            const cleanUrl = l.url.replace(/\/+$/, '');
            const display = cleanUrl.replace(/^https?:\/\//, '');
            return `<div class="club-detail-ext-item"><a href="${esc(cleanUrl)}" target="_blank" rel="noopener noreferrer" class="club-detail-ext-link">${icon} ${esc(l.platform)}：${esc(display)}</a></div>`;
          }).join('')}
        </div>
      </div>
    `;
  };
  const extHtml = parseExternalLinks();

  // ——— 联系方式 ———
  let contactHtml = '';
  if (isInfoHidden && !isBound) {
    if (!currentUser?.logged_in) {
      contactHtml = `
        <div class="club-detail-section">
          <div class="club-detail-section-title">${__('detailSectionContact')}</div>
          <div class="club-detail-hidden-placeholder">
            <div class="lock-icon">🔒</div>
            <p>${__('detailContactLockedLogin')}</p>
          </div>
        </div>
      `;
    } else if (canApply) {
      contactHtml = `
        <div class="club-detail-section">
          <div class="club-detail-section-title">${__('detailSectionContact')}</div>
          <div class="club-detail-hidden-placeholder">
            <div class="lock-icon">🔒</div>
            <p id="membershipStatus">⏳ 查询绑定状态中...</p>
          </div>
        </div>
      `;
      // 异步查询
      (async () => {
        try {
          const resp = await fetch('./api/membership.php?action=my', { credentials: 'same-origin' });
          const data = await resp.json();
          const ms = data.memberships || [];
          const match = ms.find(m => parseInt(m.club_id) === clubId && (m.country || 'china') === clubCountry);
          const statusEl = document.getElementById('membershipStatus');
          if (!statusEl) return;
          if (match) {
            if (match.status === 'pending') statusEl.innerHTML = __('detailContactPending');
            else if (match.status === 'rejected') statusEl.innerHTML = __('detailContactRejected');
            else if (match.status === 'active') statusEl.innerHTML = __('detailContactBound');
          } else {
            statusEl.innerHTML = __('detailContactApply');
            const parent = statusEl.closest('.club-detail-hidden-placeholder');
            if (parent) {
              const btn = document.createElement('button');
              btn.textContent = __('detailBtnApply');
              btn.className = 'club-detail-btn primary full';
              btn.onclick = () => openMembershipApplyModal(club);
              parent.appendChild(btn);
            }
          }
        } catch {
          const statusEl = document.getElementById('membershipStatus');
          if (statusEl) statusEl.textContent = __('detailContactQueryFail');
        }
      })();
    } else {
      contactHtml = `
        <div class="club-detail-section">
          <div class="club-detail-section-title">${__('detailSectionContact')}</div>
          <div class="club-detail-hidden-placeholder">
            <div class="lock-icon">🔒</div>
            <p>${__('detailContactLocked')}</p>
          </div>
        </div>
      `;
    }
  } else {
    // 可见联系方式（已绑定或公开）
    const contactInfo = esc(club.originalInfo || club.info || '');
    const detectedUrl = club.detectedUrl || (/^https?:\/\//.test(club.originalInfo || club.info) ? club.originalInfo || club.info : null);
    const isLink = detectedUrl || /discord\.(gg|com\/invite)/.test(contactInfo);
    const contactUrl = detectedUrl || (isLink ? contactInfo : null);

    if (isLink && contactUrl) {
      contactHtml = `
        <div class="club-detail-section">
          <div class="club-detail-section-title">${__('detailSectionContact')}</div>
          <div class="club-detail-card">
            <div class="club-detail-contact">${contactInfo}</div>
            <div class="club-detail-contact-actions">
              <a href="${esc(contactUrl)}" target="_blank" rel="noopener noreferrer" class="club-detail-btn primary">🔗 打开链接</a>
              <button onclick="navigator.clipboard.writeText('${contactUrl.replace(/'/g, "\\'")}')" class="club-detail-btn secondary">📋 复制</button>
            </div>
          </div>
        </div>
      `;
    } else {
      const safeCopy = contactInfo.replace(/'/g, "\\'");
      contactHtml = `
        <div class="club-detail-section">
          <div class="club-detail-section-title">${__('detailSectionContact')}</div>
          <div class="club-detail-card">
            <div class="club-detail-contact">${contactInfo || __('detailNoContact')}</div>
            ${contactInfo ? `<div class="club-detail-contact-actions"><button onclick="navigator.clipboard.writeText('${safeCopy}')" class="club-detail-btn primary">📋 复制群号</button></div>` : ''}
          </div>
        </div>
      `;
    }
  }

  // ——— 操作区（纵向按钮） ———
  const actionBtns = [];

  // 已登录 + 未绑定 + 可申请 → 申请绑定
  if (canApply) {
    actionBtns.push(`<button data-action="apply-club" class="club-detail-btn primary full" style="margin-bottom:4px">${__('detailBtnApplyClub')}</button>`);
  }

  // 可管理该俱乐部 → 编辑 + 成员名单
  if (isClubManager || hasRole('super_admin')) {
    actionBtns.push(`<button data-action="edit-club" class="club-detail-btn warning full" style="margin-bottom:4px">${__('detailBtnEdit')}</button>`);
    actionBtns.push(`<button data-action="member-list" class="club-detail-btn secondary full" style="margin-bottom:4px">${__('detailBtnMembers')}</button>`);
  }

  // 当前用户是该俱乐部的负责人 → 转让负责人
  if (isClubManager && getClubMembership(clubId, clubCountry)?.role === 'representative') {
    actionBtns.push(`<button data-action="transfer" class="club-detail-btn warning full" style="margin-bottom:4px">🔄 转让负责人</button>`);
  }

  // 已绑定 → 退出
  if (isBound) {
    actionBtns.push(`<button data-action="leave-club" class="club-detail-btn secondary full" style="margin-bottom:4px">🚪 退出同好会</button>`);
  }

  const wikiActionHtml = `<div class="club-detail-section" id="clubWikiSection" style="display:none">
    <div class="club-detail-section-title">${__('detailSectionWiki')}</div>
    <div class="club-detail-actions" id="clubWikiActionWrap"></div>
  </div>`;

  const actionHtml = actionBtns.length
    ? `<div class="club-detail-section"><div class="club-detail-section-title">${__('detailSectionActions')}</div><div class="club-detail-actions club-detail-action-buttons">${actionBtns.join('')}</div></div>`
    : '';

  // ——— 底部元信息 ———
  const footerHtml = `
    <div class="club-detail-meta-footer">
      <span>📅 ${esc(club.verifyMeta || __('detailUnknownDate'))}</span>
    </div>
  `;

  // ========== 左栏：基本信息 ==========
  const leftHtml = `
    <div class="club-detail-left">
      ${headerHtml}
      ${descHtml}
      ${extHtml}
      ${contactHtml}
      ${wikiActionHtml}
      ${actionHtml}
      ${footerHtml}
    </div>
  `;

  // ========== 右栏：神器推荐榜 + 留言板 ==========
  const recContainerId = 'recContainer_' + clubId;
  const commentContainerId = 'commentContainer_' + clubId;
  const rightHtml = `
    <div class="club-detail-right">
      <!-- ⭐ 神器推荐榜 -->
      <div class="club-recommendation-section">
        <div class="club-detail-section-title">⭐ 神器推荐榜</div>
        <div id="${recContainerId}">
          <div class="rec-empty" style="border:none;background:transparent;">⏳ 加载中...</div>
        </div>
      </div>
      <!-- 💬 留言板 -->
      <div class="club-comment-section">
        <div class="club-detail-section-title">💬 留言板</div>
        <div id="${commentContainerId}">
          <div class="comment-login-hint">⏳ 加载留言...</div>
        </div>
      </div>
    </div>
  `;

  // ——— 组装注入 ———
  content.innerHTML = leftHtml + rightHtml;

  // ——— 操作按钮事件绑定 ———
  const actionsContainer = content.querySelector('.club-detail-action-buttons');
  hydrateClubWikiLink(club);
  if (actionsContainer) {
    actionsContainer.querySelector('[data-action="apply-club"]')?.addEventListener('click', () => openMembershipApplyModal(club));
    actionsContainer.querySelector('[data-action="edit-club"]')?.addEventListener('click', () => openClubEditor(club));
    actionsContainer.querySelector('[data-action="member-list"]')?.addEventListener('click', () => openMemberList(clubId, club.country || 'china'));
    actionsContainer.querySelector('[data-action="transfer"]')?.addEventListener('click', () => openMemberList(clubId, club.country || 'china'));
    actionsContainer.querySelector('[data-action="leave-club"]')?.addEventListener('click', () => confirmLeaveClub(clubId, club.name, club.country));
  }

  // ——— 异步加载推荐榜 ———
  (async (containerId) => {
    try {
      const resp = await fetch(`api/club_recommendations.php?action=list&club_id=${clubId}&country=${clubCountry}`);
      const data = await resp.json();
      const container = document.getElementById(containerId);
      if (!container) return;
      if (!data.success || !data.data || data.data.length === 0) {
        container.innerHTML = '<div class="rec-empty">暂无推荐</div>';
        return;
      }
      container.innerHTML = '<div class="recommendation-grid">' +
        data.data.map(item => `
          <div class="rec-card" title="${esc(item.title)}">
            ${item.image_url
              ? `<img src="${esc(item.image_url)}" alt="${esc(item.title)}" class="rec-cover" loading="lazy">`
              : `<div class="rec-cover-placeholder">🎮</div>`
            }
            <div class="rec-info">
              <div class="rec-title">${esc(item.title)}</div>
              ${item.rating ? `<div class="rec-rating">${parseFloat(item.rating).toFixed(1)}</div>` : ''}
            </div>
          </div>
        `).join('') +
      '</div>';
    } catch (e) {
      const container = document.getElementById(containerId);
      if (container) container.innerHTML = '<div class="rec-empty">加载失败</div>';
    }
  })(recContainerId);

  // ——— 异步加载留言板 ———
  (async function loadComments(containerId) {
    try {
      const resp = await fetch(`api/club_comments.php?action=list&club_id=${clubId}&country=${clubCountry}&limit=20`);
      const result = await resp.json();
      const container = document.getElementById(containerId);
      if (!container) return;

      const userId = currentUser?.id ? parseInt(currentUser.id) : 0;
      const isLoggedIn = !!currentUser?.logged_in;

      // 输入区（仅成员可见）
      let inputHtml = '';
      if (isBound) {
        inputHtml = `
          <div class="comment-input-area">
            <textarea id="commentInput_${clubId}" placeholder="${__('commentPlaceholder')}" maxlength="1000"></textarea>
            <div class="comment-input-footer">
              <span class="comment-char-count" id="commentCount_${clubId}">0 / 1000</span>
              <button class="comment-submit-btn" id="commentSubmit_${clubId}">发表</button>
            </div>
          </div>
        `;
      } else if (isLoggedIn) {
        inputHtml = `<div class="comment-login-hint">🔒 加入同好会后即可留言</div>`;
      } else {
        inputHtml = `<div class="comment-login-hint">🔒 登录并加入同好会后即可留言</div>`;
      }

      // 留言列表
      const comments = result.data || [];
      let listHtml = '';
      if (comments.length === 0) {
        listHtml = '<div class="comment-login-hint">暂无留言，来写第一条吧</div>';
      } else {
        listHtml = '<div class="comment-list">' +
          comments.map(c => {
            const isOwner = userId > 0 && parseInt(c.user_id) === userId;
            const canDelete = isOwner || isClubManager || hasRole('super_admin');
            const avatarText = (c.nickname || c.username || '?')[0];
            return `
              <div class="comment-card" data-comment-id="${esc(c.id)}">
                <div class="comment-avatar">${esc(avatarText)}</div>
                <div class="comment-body">
                  <div class="comment-meta">
                    <span class="comment-username">${esc(c.nickname || c.username)}</span>
                    <span class="comment-time">${esc(c.created_at || '')}</span>
                    ${canDelete ? `<button class="comment-delete-btn" data-action="delete-comment" data-id="${esc(c.id)}">×</button>` : ''}
                  </div>
                  <div class="comment-content">${esc(c.content)}</div>
                </div>
              </div>
            `;
          }).join('') +
        '</div>';
        if (result.total > comments.length) {
          listHtml += `<div class="comment-load-more" data-action="load-more-comments" data-page="1" data-club-id="${clubId}" data-country="${clubCountry}">加载更多留言…</div>`;
        }
      }

      container.innerHTML = inputHtml + listHtml;

      // 绑定留言提交事件
      if (isBound) {
        const textarea = document.getElementById('commentInput_' + clubId);
        const submitBtn = document.getElementById('commentSubmit_' + clubId);
        const countEl = document.getElementById('commentCount_' + clubId);

        if (textarea && countEl) {
          textarea.addEventListener('input', () => {
            const len = textarea.value.length;
            countEl.textContent = len + ' / 1000';
            if (submitBtn) submitBtn.disabled = len === 0 || len > 1000;
          });
        }
        if (submitBtn && textarea) {
          submitBtn.addEventListener('click', async () => {
            const content = textarea.value.trim();
            if (!content) return;
            submitBtn.disabled = true;
            try {
              const postResp = await fetch('api/club_comments.php?action=add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ club_id: clubId, country: clubCountry, content }),
                credentials: 'same-origin',
              });
              const postData = await postResp.json();
              if (postData.success) {
                textarea.value = '';
                countEl.textContent = '0 / 1000';
                // 刷新留言列表
                document.getElementById(containerId).innerHTML = '<div class="comment-login-hint">⏳ 刷新中...</div>';
                // re-trigger this whole IIFE
                loadComments(containerId);
              } else {
                alert(postData.message || '留言失败');
              }
            } catch (e) {
              alert('网络错误');
            } finally {
              submitBtn.disabled = false;
            }
          });
        }
      }

      // 绑定删除事件
      container.querySelectorAll('[data-action="delete-comment"]').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('确定删除此留言？')) return;
          try {
            const delResp = await fetch('api/club_comments.php?action=delete', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: parseInt(btn.dataset.id) }),
              credentials: 'same-origin',
            });
            const delData = await delResp.json();
            if (delData.success) {
              const card = btn.closest('.comment-card');
              if (card) card.style.display = 'none';
            } else {
              alert(delData.message || '删除失败');
            }
          } catch (e) {
            alert('网络错误');
          }
        });
      });

      // 绑定加载更多
      container.querySelector('[data-action="load-more-comments"]')?.addEventListener('click', async (e) => {
        const el = e.currentTarget;
        const page = parseInt(el.dataset.page) + 1;
        el.textContent = '加载中…';
        try {
          const moreResp = await fetch(`api/club_comments.php?action=list&club_id=${clubId}&country=${clubCountry}&page=${page}&limit=20`);
          const moreData = await moreResp.json();
          const list = container.querySelector('.comment-list');
          if (list && moreData.data) {
            moreData.data.forEach(c => {
              const isOwner = userId > 0 && parseInt(c.user_id) === userId;
              const canDelete = isOwner || isClubManager || hasRole('super_admin');
              const avatarText = (c.nickname || c.username || '?')[0];
              const html = `
                <div class="comment-card" data-comment-id="${esc(c.id)}">
                  <div class="comment-avatar">${esc(avatarText)}</div>
                  <div class="comment-body">
                    <div class="comment-meta">
                      <span class="comment-username">${esc(c.nickname || c.username)}</span>
                      <span class="comment-time">${esc(c.created_at || '')}</span>
                      ${canDelete ? `<button class="comment-delete-btn" data-action="delete-comment" data-id="${esc(c.id)}">×</button>` : ''}
                    </div>
                    <div class="comment-content">${esc(c.content)}</div>
                  </div>
                </div>
              `;
              list.insertAdjacentHTML('beforeend', html);
            });
          }
          if (moreData.data && moreData.data.length < 20) {
            el.remove();
          } else {
            el.dataset.page = page;
            el.textContent = '加载更多留言…';
          }
        } catch (e) {
          el.textContent = '加载失败，点击重试';
        }
      });

    } catch (e) {
      const container = document.getElementById(containerId);
      if (container) container.innerHTML = '<div class="comment-login-hint">留言加载失败</div>';
    }
  })(commentContainerId);

  // ——— 弹窗开关 ———
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');

  const closeBtn = document.getElementById('clubDetailClose');
  if (closeBtn) {
    const newBtn = closeBtn.cloneNode(true);
    closeBtn.parentNode.replaceChild(newBtn, closeBtn);
    newBtn.onclick = () => {
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
    };
  }
  modal.onclick = (e) => {
    if (e.target === modal) { modal.classList.remove('open'); modal.setAttribute('aria-hidden', 'true'); }
  };
}

// ====== 同好会绑定申请弹窗 ======
function openMembershipApplyModal(club) {
  const modal = document.getElementById('membershipApplyModal');
  if (!modal) return;
  document.getElementById('membershipApplyClubName').textContent = club.name || __('listNoName');
  document.getElementById('applyQQ').value = '';
  document.getElementById('applyRole').value = 'member';
  document.getElementById('applyIsStudent').checked = true;
  const msg = document.getElementById('membershipApplyMessage');
  if (msg) msg.textContent = '';
  modal._clubId = club.id;
  modal._country = club.country || 'china';
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
}

function closeMembershipApplyModal() {
  const modal = document.getElementById('membershipApplyModal');
  if (!modal) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
}

async function submitMembershipApply() {
  const modal = document.getElementById('membershipApplyModal');
  const msg = document.getElementById('membershipApplyMessage');
  const btn = document.getElementById('membershipApplySubmitBtn');
  if (!modal || !msg || !btn) return;

  const clubId = modal._clubId;
  const country = modal._country || 'china';
  const qqAccount = document.getElementById('applyQQ')?.value.trim() || '';
  const applyRole = document.getElementById('applyRole')?.value || 'member';
  const isStudent = document.getElementById('applyIsStudent')?.checked ? 1 : 0;

  btn.disabled = true;
  btn.textContent = '提交中...';
  msg.textContent = '';

  try {
    const resp = await fetch('./api/membership.php?action=apply', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        club_id: clubId,
        country: country,
        qq_account: qqAccount,
        apply_role: applyRole,
        is_student: isStudent
      })
    });
    const result = await resp.json();
    if (result.success) {
      msg.innerHTML = '✅ ' + (result.message || '申请已提交');
      btn.textContent = '已完成';
      setTimeout(() => {
        closeMembershipApplyModal();
        btn.disabled = false;
        btn.textContent = '提交申请';
      }, 1500);
    } else {
      msg.innerHTML = '❌ ' + (result.message || '申请失败');
      btn.disabled = false;
      btn.textContent = '提交申请';
    }
  } catch {
    msg.innerHTML = '❌ 网络错误，请重试';
    btn.disabled = false;
    btn.textContent = '提交申请';
  }
}

// ====== 退出同好会 ======
function confirmLeaveClub(clubId, clubName, country) {
  if (!confirm(__('confirmLeaveClub', clubName))) return;
  fetch('./api/membership.php?action=leave', {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ club_id: clubId, country: country || 'china' })
  })
  .then(r => r.json())
  .then(data => {
    if (data.success) {
      alert('✅ 已退出同好会');
      location.reload();
    } else {
      alert('❌ ' + (data.message || __('alertOperationFailed')));
    }
  })
  .catch(() => alert('❌ 网络错误，请重试'));
}

function renderCurrentDetail() {
    // 🔥 关键：根据是否全局搜索和当前国家获取正确数据
    let sourceRows = [];
    
    if (State.globalSearchEnabled) {
        // 全局搜索模式
        if (State.currentCountry === 'japan') {
            sourceRows = State.japanRows || [];
        } else {
            sourceRows = State.bandoriRows || [];
        }
    } else {
        // 省份模式
        sourceRows = State.currentDetailRows || [];
    }
    
    // 如果数据为空，显示提示
    if (!sourceRows.length && !State.globalSearchEnabled) {
        let provinceName = State.currentDetailProvinceName || (State.currentCountry === 'japan' ? __('countryJapan') : State.currentCountry === 'overseas' ? __('countryOverseas') : __('countryNotSelected'));
        if (provinceName === '国内同好会') provinceName = __('domesticClubs');
        if (provinceName === '日本') provinceName = __('countryJapan');
        if (provinceName === '海外') provinceName = __('countryOverseas');
        document.getElementById('selectedTitle').textContent = __('renderTitleDetail', provinceName);
        document.getElementById('selectedProvince').textContent = '0 ' + __('clubCount');
        document.getElementById('selectedMeta').textContent = __('renderMetaRange', provinceName, '0', '0');
        document.getElementById('groupList').innerHTML = '<div class="empty-text">' + __('noClub') + '</div>';
        return;
    }
    
    // 应用筛选和排序
    const filtered = getFilteredSortedRows(sourceRows);
    
    const schoolCount = filtered.filter(x => x.type === 'school').length;
    const regionCount = filtered.filter(x => x.type === 'region').length;
    const vnfestCount = filtered.filter(x => x.type === 'vnfest').length;
    
    let displayTitle = State.currentDetailProvinceName;
    if (displayTitle === '非地区' || displayTitle === '国内同好会') displayTitle = __('domesticClubs');
    if (displayTitle === '日本') displayTitle = __('countryJapan');
    if (displayTitle === '海外') displayTitle = __('countryOverseas');
    
    if (State.globalSearchEnabled) {
        const countryName = State.currentCountry === 'japan' ? __('countryJapan') : State.currentCountry === 'overseas' ? __('countryOverseas') : __('countryAll');
        document.getElementById('selectedTitle').textContent = __('renderTitleSearch', countryName);
        let metaText = __('renderMetaSummary', schoolCount, regionCount);
        if (vnfestCount > 0) metaText += __('renderMetaVnfest', vnfestCount);
        if (State.listQuery) {
            metaText = __('renderMetaSearch', State.listQuery, filtered.length) + metaText;
        }
        document.getElementById('selectedMeta').textContent = metaText;
    } else {
        document.getElementById('selectedTitle').textContent = __('renderTitleDetail', displayTitle);
        document.getElementById('selectedMeta').textContent = __('renderMetaRange', displayTitle, schoolCount, regionCount);
    }
    
    document.getElementById('selectedProvince').textContent = `${filtered.length} ` + __('clubCount');
    renderGroupListWithLocation(filtered);
}

function updateSummaryUI(source, animate = true) {
  const applySummary = () => {
    const mainlandTotal = (State.bandoriRows || []).filter(item => !getClubProvinceNames(item).includes('海外')).length;
    document.getElementById('selectedTitle').textContent = __('renderTitleSummary');
    document.getElementById('selectedProvince').textContent = `${mainlandTotal} ` + __('clubCount');
    document.getElementById('selectedMeta').textContent = __('renderMetaDataSource', source);
    document.getElementById('groupList').innerHTML = '<div class="empty-text">' + __('noData') + '</div>';
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

// 渲染列表（带地区显示）
function renderGroupListWithLocation(rows) {
    const listEl = document.getElementById('groupList');
    if (!listEl) return;

    if (!rows.length) {
        listEl.innerHTML = '<div class="empty-text">' + __('listEmptyFilter') + '</div>';
        return;
    }

    const isJapan = State.currentCountry === 'japan';

    listEl.innerHTML = rows.map((item) => {
        const name = Utils.escapeHTML(item.name || __('listNoName'));
        const rawText = Utils.escapeHTML(item.raw_text || item.name || '');
        const isHidden = item.info_hidden === true;
        const canApply = item.can_apply === true;
        const clubId = parseInt(item.id);
        const member = getClubMembership(clubId, item.country || (isJapan ? 'japan' : 'china'));
        const isBound = member && member.status === 'active';

        let infoHtml;
        if (isBound || !isHidden) {
            const contactInfo = item.info || '';
            const detectedUrl = Utils.extractUrl(item) || (/^https?:\/\//.test(contactInfo) ? contactInfo : null);
            if (detectedUrl) {
                infoHtml = `<a href="${Utils.escapeHTML(detectedUrl)}" target="_blank" rel="noopener noreferrer" style="color:var(--md-primary);text-decoration:none">${Utils.escapeHTML(contactInfo)}</a>`;
            } else {
                infoHtml = Utils.escapeHTML(contactInfo || __('listNoContact'));
            }
        } else {
            infoHtml = '<span style="opacity:0.5">' + __('listInfoHidden') + '</span>';
        }

        const extLinksHtml = renderExternalLinks(item.external_links);
        const type = Utils.escapeHTML(Utils.groupTypeText(item.type));
        const verifyMeta = Utils.escapeHTML(item.verified ? __('listVerified') : __('listUnverified')) + __('listEstablished') + Utils.escapeHTML(Utils.formatCreatedAt(item.created_at));

        // 地区显示
        let locationText = isJapan ? (item.prefecture || item.province || '') : getClubProvinceLabel(item);

        const clubData = encodeURIComponent(JSON.stringify({
            id: item.id,
            name: name,
            school: item.school || '',
            info: Utils.escapeHTML(isHidden ? __('listInfoHidden') : (item.info || __('listNoContact'))),
            originalInfo: item.info || '',
            infoHidden: isHidden,
            canApply: canApply,
            detectedUrl: '',
            type: type,
            rawType: item.type,
            verifyMeta: verifyMeta,
            province: locationText,
            provinces: item.provinces || [],
            remark: item.remark || __('listNoRemark'),
            country: isJapan ? 'japan' : 'china',
            logo_url: item.logo_url || '',
            external_links: item.external_links || ''
        }));

        const avatarHtml = item.logo_url
            ? `<img src="${Utils.escapeHTML(Utils.resolveMediaUrl(item.logo_url))}" alt="" class="club-avatar" loading="lazy">`
            : `<div class="club-avatar club-avatar-fallback">🏫</div>`;

        const statusBadge = isBound
            ? '<span style="font-size:11px;color:#4CAF50;white-space:nowrap">' + __('listBound') + '</span>'
            : canApply
                ? `<button class="apply-mini-btn" data-club='${clubData}' type="button" style="font-size:11px;padding:4px 10px;border-radius:6px;border:none;background:var(--md-primary);color:#fff;cursor:pointer;white-space:nowrap">${__('listApply')}</button>`
                : '';

        return `
            <article class="group-item" data-club='${clubData}'>
                <div class="group-main">
                    ${avatarHtml}
                    <div class="group-header">
                        <h3 class="group-name" title="${rawText}">${name}</h3>
                        <div class="group-top-tags">
                          <span class="group-chip">${type}</span>
                          <span class="group-chip-outline">${Utils.escapeHTML(locationText)}</span>
                        </div>
                    </div>
                </div>
                <div class="group-divider"></div>
                <div class="group-footer">
                    <div class="group-footer-left">
                        <span class="group-info" data-club='${clubData}'>${infoHtml}</span>
                        ${extLinksHtml ? `<div class="group-ext-links">${extLinksHtml}</div>` : ''}
                    </div>
                    <div class="group-footer-right">${statusBadge}</div>
                </div>
            </article>
        `;
    }).join('');

    // 绑定事件
    document.querySelectorAll('.group-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (e.target.classList.contains('apply-mini-btn') || e.target.closest('.apply-mini-btn')) return;
            const clubData = item.getAttribute('data-club');
            if (clubData) {
                const club = JSON.parse(decodeURIComponent(clubData));
                showClubDetail(club);
            }
        });
    });

    document.querySelectorAll('.group-info').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            const clubData = el.getAttribute('data-club');
            if (clubData) showClubDetail(JSON.parse(decodeURIComponent(clubData)));
        });
    });

    // 申请绑定按钮
    document.querySelectorAll('.apply-mini-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const clubData = btn.getAttribute('data-club');
            if (clubData) {
                const club = JSON.parse(decodeURIComponent(clubData));
                openMembershipApplyModal(club);
            }
        });
    });
}

function showProvinceDetails(provinceName) {
    console.log('点击省份:', provinceName, '当前国家:', State.currentCountry);
    
    const key = Utils.normalizeProvinceName(provinceName);
    State.currentDetailProvinceName = provinceName;
    
    // 🔥 关键：根据当前国家获取正确的数据
    if (State.currentCountry === 'japan') {
        State.currentDetailRows = State.japanGroupsMap.get(provinceName) || [];
    } else {
        if (provinceName === '国内同好会') {
            State.currentDetailRows = State.provinceGroupsMap.get('__non_regional__') || [];
        } else if (provinceName === '海外') {
            State.currentDetailRows = State.provinceGroupsMap.get('海外') || State.bandoriRows.filter(item => getClubProvinceNames(item).includes('海外')) || [];
        } else {
            State.currentDetailRows = State.provinceGroupsMap.get(key) || [];
        }
    }
    
    console.log('获取到数据:', State.currentDetailRows.length, '条');
    
    // 关闭全局搜索
    if (State.globalSearchEnabled) {
        State.globalSearchEnabled = false;
        const btn = document.getElementById('globalSearchBtn');
        if (btn) btn.classList.remove('active');
    }
    
    // 🔥 使用动画更新右侧面板
    animateSelectedCardUpdate(() => {
        renderCurrentDetail();
    });
    
    // 更新按钮状态
    const overseasBtn = document.getElementById('overseasToggleBtn');
    const nonRegionalBtn = document.getElementById('nonRegionalToggleBtn');
    if (overseasBtn) overseasBtn.classList.toggle('active', key === '海外');
    if (nonRegionalBtn) nonRegionalBtn.classList.toggle('active', provinceName === '国内同好会');
}

// 右侧面板更新动画
function animateSelectedCardUpdate(updateFn) {
    const card = document.getElementById('selectedCard');
    if (!card) return updateFn();

    State.selectedCardAnimToken++;
    const myToken = State.selectedCardAnimToken;

    // 记录当前高度
    const startHeight = card.getBoundingClientRect().height;
    card.style.height = `${startHeight}px`;
    card.classList.add('switching');

    // 执行更新
    updateFn();

    // 获取更新后的高度
    card.style.height = 'auto';
    const targetHeight = card.getBoundingClientRect().height;
    
    // 重置回起始高度
    card.style.height = `${startHeight}px`;
    void card.offsetHeight; // 强制重绘

    // 动画到目标高度
    requestAnimationFrame(() => {
        if (myToken !== State.selectedCardAnimToken) return;
        card.style.height = `${targetHeight}px`;
    });

    // 动画结束后清理
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

// 显示中国地图省份气泡（带动画）
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

    // 如果当前是关闭状态，先瞬间定位（避免闪现）
    if (!isCurrentlyOpen) bubble.classList.add('instant-place');
    
    // 如果当前是打开状态，记录当前尺寸用于动画
    if (isCurrentlyOpen) {
        startRect = bubble.getBoundingClientRect();
        bubble.style.width = `${startRect.width}px`;
        bubble.style.height = `${startRect.height}px`;
    }

    // 更新气泡内容
    bubble.innerHTML = `
        <div class="map-bubble-scroll">
            <h3 class="map-bubble-title">${Utils.escapeHTML(provinceName)} · ${rows.length} ${__('clubCount')}</h3>
            ${rows.slice(0, 12).map(item => {
              const bubbleInfo = item.info_hidden ? __('listInfoHidden') : (item.info || __('listNoContact'));
              return `
                <article class="map-bubble-item" data-copy="${encodeURIComponent(String(item.info || ''))}" title="点击复制联系方式">
                    <div class="bubble-name-wrap"><span class="bubble-name">${Utils.escapeHTML(item.name || __('listNoName'))}</span></div>
                    <div class="bubble-id">${Utils.escapeHTML(bubbleInfo)}</div>
                </article>
              `;
            }).join('')}
            ${rows.length > 12 ? `<div class="map-bubble-more" style="margin-top: 8px; font-size: 12px; color: var(--md-primary); text-align: center;">还有 ${rows.length - 12} 个组织，点击地图查看全部</div>` : ''}
        </div>
    `;

    State.activeBubbleState = { provinceName, anchorX, anchorY, isChina: true };
    placeMapBubble(anchorX, anchorY);

    // 重置为自动尺寸
    bubble.style.width = 'auto';
    bubble.style.height = 'auto';

    // 如果之前是打开状态，执行平滑尺寸过渡动画
    if (isCurrentlyOpen) {
        const targetRect = bubble.getBoundingClientRect();
        bubble.style.width = `${startRect.width}px`;
        bubble.style.height = `${startRect.height}px`;
        void bubble.offsetHeight; // 强制重绘

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

    // 显示气泡
    requestAnimationFrame(() => {
        bubble.classList.add('open');
        // 处理长名称滚动
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

  china().width(w).height(h).scale(1).language('cn')
    .colorDefault('#ffdce9').colorLake('#ffffff')
    .draw('#mapSvg');

  setTimeout(() => {
    const svg = d3.select('#mapSvg');
    const g = svg.select('g');
    if (g.empty()) {
      console.error('❌ 地图绘制失败');
      return;
    }

    const idToName = {
      'hlj': '黑龙江', 'jl': '吉林', 'ln': '辽宁', 'hb': '河北', 'sd': '山东',
      'js': '江苏', 'zj': '浙江', 'ah': '安徽', 'hn': '河南', 'sx': '山西',
      'snx': '陕西', 'gs': '甘肃', 'hub': '湖北', 'jx': '江西', 'hun': '湖南',
      'gz': '贵州', 'sc': '四川', 'yn': '云南', 'qh': '青海', 'han': '海南',
      'cq': '重庆', 'tj': '天津', 'bj': '北京', 'nx': '宁夏', 'im': '内蒙古',
      'gx': '广西', 'xj': '新疆', 'tb': '西藏', 'sh': '上海', 'fj': '福建',
      'gd': '广东', 'hk': '香港', 'mc': '澳门', 'tw': '台湾'
    };

    const allCounts = Array.from(State.provinceGroupsMap.entries())
      .filter(([k]) => k !== '海外').map(([, arr]) => arr.length);
    const maxCount = allCounts.length ? Math.max(...allCounts) : 1;

    // 更新颜色
    g.selectAll('.province').each(function() {
      const provinceName = idToName[this.id];
      const count = State.provinceGroupsMap.get(provinceName)?.length || 0;
      d3.select(this).style('fill', MapUtils.colorByCount(count, maxCount));
    });

    g.selectAll('.count-layer').remove();
    const badgeLayer = g.append('g').attr('class', 'count-layer');

    // 添加徽章 - 恢复原来的位置计算
    g.selectAll('.province').each(function() {
      const provinceName = idToName[this.id];
      const count = State.provinceGroupsMap.get(provinceName)?.length || 0;
      if (!count) return;

      const box = this.getBBox();
      if (!box.width || !box.height) return;

      // 恢复原来的位置计算
      const preferredAnchor = { 
        cx: box.x + box.width / (this.id === 'im' ? 2.8 : 2), 
        cy: box.y + box.height / (this.id === 'im' ? 1.5 : 2) 
      };
      const insideAnchor = MapUtils.ensurePointInsideProvince(this, box, preferredAnchor);
      const offset = MapUtils.getBadgeOffset(this.id);
      
      const cx = Math.max(14, Math.min(CONFIG.BASE_WIDTH - 14, insideAnchor.cx + offset.dx));
      const cy = Math.max(14, Math.min(CONFIG.BASE_HEIGHT - 14, insideAnchor.cy + offset.dy));

      const badge = badgeLayer.append('g')
        .attr('class', 'count-badge')
        .attr('transform', `translate(${cx},${cy})`);
        
      badge.append('circle')
        .attr('r', count > 99 ? 13 : 11)
        .attr('fill', 'var(--md-primary)')
        .attr('stroke', '#ffffff')
        .attr('stroke-width', 1.5);
        
      badge.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', '0.35em')
        .attr('font-size', count > 99 ? '10px' : '12px')
        .attr('fill', '#ffffff')
        .attr('font-weight', 'bold')
        .text(count > 99 ? '99+' : count);

      // 徽章点击事件
      badge.on('click', function(event) {
        event.stopPropagation();
        const shouldShowBubble = State.invertCtrlBubble ? !!event.ctrlKey : !event.ctrlKey;
        
        if (!shouldShowBubble) {
          setGlobalSearchEnabled(false);
          State.selectedProvinceKey = provinceName;
          g.selectAll('.province').classed('selected', false);
          g.selectAll('.province').classed('selected', function() {
            return idToName[this.id] === provinceName;
          });
          showProvinceDetails(provinceName);
          hideMapBubble();
        } else {
          showMapBubbleByProvince(provinceName, cx, cy);
        }
      });
    });

    const zoom = d3.zoom().scaleExtent([fitScale, fitScale * 12])
      .on('zoom', (e) => { g.attr('transform', e.transform); });

    svg.call(zoom).on('dblclick.zoom', null);
    svg.call(zoom.transform, d3.zoomIdentity.translate(offsetX, offsetY).scale(fitScale));

    if (State.selectedProvinceKey) {
      g.selectAll('.province').classed('selected', function() {
        return idToName[this.id] === State.selectedProvinceKey;
      });
    }

    State.mapViewState = { svg, g, zoom, width: w, height: h, 
      minScale: fitScale, maxScale: fitScale * 12, 
      baseScale: fitScale, baseTranslate: [offsetX, offsetY] };
    
    console.log('✅ 中国地图渲染完成');
  }, 50);
}

function renderJapanMap() {
  const mapEl = document.getElementById('map');
  const svgEl = document.getElementById('mapSvg');
  if (!mapEl || !svgEl) return;

  const w = mapEl.clientWidth || window.innerWidth;
  const h = mapEl.clientHeight || window.innerHeight;
  svgEl.innerHTML = '';

  const japanWidth = Math.max(w, 1200);
  const japanHeight = Math.max(h, 1100);

const japanNameMap = {
    'JP-01': '北海道',      // 保持不变（汉字相同）
    'JP-02': '青森県',      // 青森县 → 青森県
    'JP-03': '岩手県',      // 岩手县 → 岩手県
    'JP-04': '宮城県',      // 宫城县 → 宮城県
    'JP-05': '秋田県',      // 秋田县 → 秋田県
    'JP-06': '山形県',      // 山形县 → 山形県
    'JP-07': '福島県',      // 福岛县 → 福島県
    'JP-08': '茨城県',      // 茨城县 → 茨城県
    'JP-09': '栃木県',      // 栃木县 → 栃木県
    'JP-10': '群馬県',      // 群马县 → 群馬県
    'JP-11': '埼玉県',      // 埼玉县 → 埼玉県
    'JP-12': '千葉県',      // 千叶县 → 千葉県
    'JP-13': '東京都',      // 东京都 → 東京都
    'JP-14': '神奈川県',    // 神奈川县 → 神奈川県
    'JP-15': '新潟県',      // 新潟县 → 新潟県
    'JP-16': '富山県',      // 富山县 → 富山県
    'JP-17': '石川県',      // 石川县 → 石川県
    'JP-18': '福井県',      // 福井县 → 福井県
    'JP-19': '山梨県',      // 山梨县 → 山梨県
    'JP-20': '長野県',      // 长野县 → 長野県
    'JP-21': '岐阜県',      // 岐阜县 → 岐阜県
    'JP-22': '静岡県',      // 静冈县 → 静岡県
    'JP-23': '愛知県',      // 爱知县 → 愛知県
    'JP-24': '三重県',      // 三重县 → 三重県
    'JP-25': '滋賀県',      // 滋贺县 → 滋賀県
    'JP-26': '京都府',      // 京都府 → 京都府
    'JP-27': '大阪府',      // 大阪府 → 大阪府
    'JP-28': '兵庫県',      // 兵库县 → 兵庫県
    'JP-29': '奈良県',      // 奈良县 → 奈良県
    'JP-30': '和歌山県',    // 和歌山县 → 和歌山県
    'JP-31': '鳥取県',      // 鸟取县 → 鳥取県
    'JP-32': '島根県',      // 岛根县 → 島根県
    'JP-33': '岡山県',      // 冈山县 → 岡山県
    'JP-34': '広島県',      // 广岛县 → 広島県
    'JP-35': '山口県',      // 山口县 → 山口県
    'JP-36': '徳島県',      // 德岛县 → 徳島県
    'JP-37': '香川県',      // 香川县 → 香川県
    'JP-38': '愛媛県',      // 爱媛县 → 愛媛県
    'JP-39': '高知県',      // 高知县 → 高知県
    'JP-40': '福岡県',      // 福冈县 → 福岡県
    'JP-41': '佐賀県',      // 佐贺县 → 佐賀県
    'JP-42': '長崎県',      // 长崎县 → 長崎県
    'JP-43': '熊本県',      // 熊本县 → 熊本県
    'JP-44': '大分県',      // 大分县 → 大分県
    'JP-45': '宮崎県',      // 宫崎县 → 宮崎県
    'JP-46': '鹿児島県',    // 鹿儿岛县 → 鹿児島県
    'JP-47': '沖縄県'       // 冲绳县 → 沖縄県
};

  japan().width(japanWidth).height(japanHeight).scale(1).language('cn')
    .colorDefault('#ffdce9')
    .colorLake('#ffffff')
    .draw('#mapSvg');

  setTimeout(() => {
    const svg = d3.select('#mapSvg');
    const g = svg.select('g');
    
    if (g.empty()) {
      console.error('❌ 日本地图绘制失败');
      return;
    }

    const allCounts = Array.from(State.japanGroupsMap.values()).map(arr => arr.length);
    const maxCount = allCounts.length ? Math.max(...allCounts) : 1;
    const BASE_SCREEN_RADIUS = 8;

    g.selectAll('.province').each(function() {
      const chineseName = japanNameMap[this.id];
      if (!chineseName) return;
      const count = State.japanGroupsMap.get(chineseName)?.length || 0;
      d3.select(this)
        .style('fill', MapUtils.colorByCount(count, maxCount))
        .style('cursor', 'pointer');
    });

    g.selectAll('.count-layer').remove();
    const badgeLayer = g.append('g').attr('class', 'count-layer');

    g.selectAll('.province').each(function() {
      const chineseName = japanNameMap[this.id];
      if (!chineseName) return;
      const count = State.japanGroupsMap.get(chineseName)?.length || 0;
      if (!count) return;

      const box = this.getBBox();
      if (!box.width || !box.height) return;

      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;

      const currentTransform = d3.zoomTransform(svg.node());
      const currentScale = currentTransform.k || 1;

      const radius = BASE_SCREEN_RADIUS / currentScale;
      const finalRadius = Math.max(6, Math.min(25, radius));
      const finalFontSize = Math.max(3, Math.min(18, radius * 0.7));

      const badge = badgeLayer.append('g')
        .attr('class', 'count-badge')
        .attr('data-count', count)
        .attr('data-name', chineseName)
        .attr('data-cx', cx)
        .attr('data-cy', cy)
        .attr('transform', `translate(${cx},${cy})`);

      badge.append('circle')
        .attr('r', finalRadius)
        .attr('fill', 'var(--md-primary)')
        .attr('stroke', '#ffffff')
        .attr('stroke-width', 1.5);

      badge.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', '0.35em')
        .attr('font-size', `${finalFontSize}px`)
        .attr('fill', '#ffffff')
        .attr('font-weight', 'bold')
        .text(count > 99 ? '99+' : count);

      // 小球点击：显示气泡（二级菜单）
      badge.on('click', (event) => {
        event.stopPropagation();
        const shouldShowBubble = State.invertCtrlBubble ? !!event.ctrlKey : !event.ctrlKey;
        
        if (!shouldShowBubble) {
          showJapanProvinceDetails(chineseName);
          hideMapBubble();
        } else {
          showJapanMapBubble(chineseName, cx, cy);
        }
      });
    });

    // 省份区域点击：显示右侧列表
    g.selectAll('.province').each(function() {
      const chineseName = japanNameMap[this.id];
      if (!chineseName) return;
      const provinceElement = this;

      provinceElement.onclick = null;
    });

    const fitScale = Math.min(w / japanWidth, h / japanHeight) * 1.25;
    const offsetX = (w - japanWidth * fitScale) / 2 + japanWidth * fitScale * 0.14;
    const offsetY = (h - japanHeight * fitScale) / 2 + japanHeight * fitScale * 0.12;

    const zoom = d3.zoom().scaleExtent([fitScale * 0.6, fitScale * 20])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
        const currentScale = event.transform.k;
        
        badgeLayer.selectAll('.count-badge').each(function() {
          const badge = d3.select(this);
          const count = parseInt(badge.attr('data-count')) || 0;
          const radius = BASE_SCREEN_RADIUS / currentScale;
          const finalRadius = Math.max(6, Math.min(25, radius));
          const finalFontSize = Math.max(2, Math.min(18, radius * 0.7));
          badge.select('circle').attr('r', finalRadius);
          badge.select('text')
            .attr('font-size', `${finalFontSize}px`)
            .text(count > 99 ? '99+' : count);
        });
        
        if (State.activeBubbleState && State.activeBubbleState.isJapan) {
          placeMapBubble(State.activeBubbleState.anchorX, State.activeBubbleState.anchorY);
        }
      });

    svg.call(zoom).on('dblclick.zoom', null);
    svg.call(zoom.transform, d3.zoomIdentity.translate(offsetX, offsetY).scale(fitScale));

    setTimeout(() => {
      const initialTransform = d3.zoomTransform(svg.node());
      badgeLayer.selectAll('.count-badge').each(function() {
        const badge = d3.select(this);
        const count = parseInt(badge.attr('data-count')) || 0;
        const radius = BASE_SCREEN_RADIUS / initialTransform.k;
        const finalRadius = Math.max(6, Math.min(25, radius));
        const finalFontSize = Math.max(2, Math.min(18, radius * 0.7));
        badge.select('circle').attr('r', finalRadius);
        badge.select('text')
          .attr('font-size', `${finalFontSize}px`)
          .text(count > 99 ? '99+' : count);
      });
    }, 50);

    State.mapViewState = { svg, g, zoom, badgeLayer, width: w, height: h, minScale: fitScale * 0.6, maxScale: fitScale * 20, baseScale: fitScale, baseTranslate: [offsetX, offsetY] };
    
    console.log('✅ 日本地图渲染完成，省份数量:', g.selectAll('.province').size());
    bindMapTooltip();
  }, 50);
  
}

// 显示日本县详情（已经有动画，保持原样）
function showJapanProvinceDetails(prefectureName) {
    const rows = State.japanGroupsMap.get(prefectureName) || [];
    State.currentDetailProvinceName = prefectureName;
    
    // 已有动画，保持不变
    animateSelectedCardUpdate(() => {
        State.currentDetailRows = rows;
        document.getElementById('selectedTitle').textContent = __('renderTitleDetail', prefectureName);
        document.getElementById('selectedProvince').textContent = `${rows.length} ` + __('clubCount');
        document.getElementById('selectedMeta').textContent = __('countryJapan') + ' · ' + prefectureName;
        if (rows.length) {
            renderGroupList(getFilteredSortedRows(rows));
        } else {
            document.getElementById('groupList').innerHTML = '<div class="empty-text">' + __('noClub') + '</div>';
        }
    });
}

// 显示日本地图的省份气泡（二级菜单）
function showJapanMapBubble(provinceName, anchorX, anchorY) {
  const bubble = document.getElementById('badgeBubble');
  if (!bubble) return;

  const rows = State.japanGroupsMap.get(provinceName) || [];
  if (!rows.length) return hideMapBubble();

  State.bubbleAnimToken++;
  const myToken = State.bubbleAnimToken;
  const isCurrentlyOpen = bubble.classList.contains('open');
  let startRect;

  if (!isCurrentlyOpen) bubble.classList.add('instant-place');
  if (isCurrentlyOpen) {
    startRect = bubble.getBoundingClientRect();
    bubble.style.width = `${startRect.width}px`;
    bubble.style.height = `${startRect.height}px`;
  }

  bubble.innerHTML = `
    <div class="map-bubble-scroll">
      <h3 class="map-bubble-title">${Utils.escapeHTML(provinceName)} · ${rows.length} ${__('clubCount')}</h3>
      ${rows.slice(0, 12).map(item => `
        <article class="map-bubble-item" data-club='${encodeURIComponent(JSON.stringify({
          id: item.id,
          name: item.name,
          info: item.info,
          originalInfo: item.info || '',
          infoHidden: item.info_hidden === true,
          canApply: item.can_apply === true,
          detectedUrl: '',
          type: item.type,
          province: provinceName,
          prefecture: item.prefecture || provinceName,
          school: item.school || '',
          remark: item.remark || __('listNoRemark'),
          verifyMeta: (item.verified ? '已登记' : '未登记') + ' · 成立时间：' + Utils.formatCreatedAt(item.created_at),
          country: 'japan', logo_url: item.logo_url || '', external_links: item.external_links || ''
        }))}'>
          <div class="bubble-name-wrap"><span class="bubble-name">${Utils.escapeHTML(item.name || __('listNoName'))}</span></div>
          <div class="bubble-id">${Utils.escapeHTML(item.info_hidden ? __('listInfoHidden') : String(item.info || __('listNoContact')))}</div>
        </article>
      `).join('')}
      ${rows.length > 12 ? `<div class="map-bubble-more" style="margin-top: 8px; font-size: 12px; color: var(--md-primary); text-align: center;">还有 ${rows.length - 12} 个组织，点击地图查看全部</div>` : ''}
    </div>
  `;

  State.activeBubbleState = { provinceName, anchorX, anchorY, isJapan: true };
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

  setTimeout(() => {
    bubble.querySelectorAll('.map-bubble-item').forEach(el => {
      el.onclick = (e) => {
        e.stopPropagation();
        const clubData = el.getAttribute('data-club');
        if (clubData) {
          const club = JSON.parse(decodeURIComponent(clubData));
          showClubDetail(club);
          hideMapBubble();
        }
      };
    });
  }, 50);
}

function resetMapListFilters() {
    State.globalSearchEnabled = false;
    State.listQuery = '';
    State.listType = 'all';
    State.listSort = 'default';

    if (document.getElementById('searchInput')) document.getElementById('searchInput').value = '';
    if (document.getElementById('typeFilter')) document.getElementById('typeFilter').value = 'all';
    updateSortButtonView();

    const globalBtn = document.getElementById('globalSearchBtn');
    if (globalBtn) globalBtn.classList.remove('active');
}

function animateMapCountrySwitch(renderMap, afterRender) {
    const svgEl = document.getElementById('mapSvg');
    State.mapSwitchToken += 1;
    const switchToken = State.mapSwitchToken;
    const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    hideMapBubble();

    const completeSwitch = () => {
        if (switchToken !== State.mapSwitchToken) return;

        if (svgEl) {
            svgEl.classList.remove('map-switch-out', 'map-switch-in');
            svgEl.innerHTML = '';
        }

        renderMap();
        bindMapTooltip();
        afterRender();

        if (svgEl && !prefersReducedMotion) {
            void svgEl.offsetHeight;
            svgEl.classList.add('map-switch-in');
            window.setTimeout(() => {
                if (switchToken === State.mapSwitchToken) {
                    svgEl.classList.remove('map-switch-in');
                }
            }, 440);
        }
    };

    if (!svgEl || prefersReducedMotion) {
        completeSwitch();
        return;
    }

    svgEl.classList.remove('map-switch-in');
    void svgEl.offsetHeight;
    svgEl.classList.add('map-switch-out');
    window.setTimeout(completeSwitch, 180);
}

function switchToChinaMap() {
    if (State.currentCountry === 'china') return;
    State.currentCountry = 'china';
    resetMapListFilters();
    animateMapCountrySwitch(renderChinaMap, () => {
        // 直接显示国内同好会列表
        State.currentDetailProvinceName = '国内同好会';
        State.currentDetailRows = State.bandoriRows.filter(item => !getClubProvinceNames(item).includes('海外'));
        renderCurrentDetail();
    });
}

// 切换到日本地图（数据已预加载）
function switchToJapanMap() {
    if (State.currentCountry === 'japan') return;

    console.log('切换到日本地图');
    State.currentCountry = 'japan';
    resetMapListFilters();
    animateMapCountrySwitch(renderJapanMap, () => {
        // 直接显示日本同好会列表
        State.currentDetailProvinceName = '日本';
        State.currentDetailRows = State.japanRows || [];
        renderCurrentDetail();
    });
}

function switchToOverseas() {
    if (State.currentCountry === 'overseas') return;

    setGlobalSearchEnabled(false);
    State.currentCountry = 'overseas';
    State.mapSwitchToken += 1;

    // 清除地图
    const svgEl = document.getElementById('mapSvg');
    if (svgEl) {
        svgEl.classList.remove('map-switch-out', 'map-switch-in');
        svgEl.innerHTML = '';
    }

    // 重置筛选条件
    State.listType = 'all';
    State.listQuery = '';
    State.listSort = 'default';
    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.value = '';
    const typeFilter = document.getElementById('typeFilter');
    if (typeFilter) typeFilter.value = 'all';
    updateSortButtonView();
    document.getElementById('nonRegionalToggleBtn')?.classList.remove('active');

    // 显示海外同好会列表
    State.currentDetailProvinceName = '海外';
    State.selectedProvinceKey = '海外';
    State.currentDetailRows = State.provinceGroupsMap.get('海外') || State.bandoriRows.filter(item => getClubProvinceNames(item).includes('海外')) || [];
    console.log('海外同好会列表:', State.currentDetailRows.length, '条');

    hideMapBubble();
    renderCurrentDetail();
}


function useMockJapanData() {
  State.japanRows = [
    { id: 1, name: "东京大学视觉小说研究会", prefecture: "东京都", info: "https://discord.gg/example", type: "school", created_at: "2026-05-07", external_links: "Twitter: https://x.com/ut_vinos\n官网: https://example.com/ut-vinos" },
    { id: 2, name: "京都大学Galgame同好会", prefecture: "京都府", info: "123456789", type: "school", created_at: "2026-05-07" },
    { id: 3, name: "大阪大学动漫研究社", prefecture: "大阪府", info: "987654321", type: "school", created_at: "2026-05-07", external_links: "Twitter: https://x.com/example_osaka" },
    { id: 4, name: "北海道大学视觉小说部", prefecture: "北海道", info: "111222333", type: "school", created_at: "2026-05-07" },
    { id: 5, name: "名古屋大学Galgame部", prefecture: "爱知县", info: "444555666", type: "school", created_at: "2026-05-07" }
  ];
  State.japanGroupsMap = new Map();
  State.japanRows.forEach(item => {
    const prefecture = item.prefecture;
    if (!prefecture) return;
    if (!State.japanGroupsMap.has(prefecture)) State.japanGroupsMap.set(prefecture, []);
    State.japanGroupsMap.get(prefecture).push(item);
  });
  console.log('📝 使用日本模拟数据，共', State.japanRows.length, '条');
}

async function reloadBandoriData() {
  let rows = [], source = 'none';
  
  try {
    const resp = await fetch('./data/clubs.json', { cache: 'no-store' });
    if (resp.ok) {
      const json = await resp.json();
      if (json?.data && Array.isArray(json.data)) {
        rows = json.data;
        source = '本地JSON';
        console.log('✅ 从本地JSON加载数据成功');
      }
    }
  } catch (e) {
    console.log('数据加载失败:', e);
  }

  State.bandoriRows = rows;
  State.currentDataSource = source;
  State.provinceGroupsMap = new Map();
  
  rows.forEach(item => addClubToProvinceMap(State.provinceGroupsMap, item));

  updateSummaryUI(source, false);
  renderChinaMap();
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

// ==========================================
// 事件绑定
// ==========================================
function bindAllStaticEvents() {
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



  document.getElementById('map')?.addEventListener('click', (e) => {
    if (!e.target.closest('#badgeBubble') && !e.target.closest('.count-badge')) hideMapBubble();
  });

  const refreshBtn = document.getElementById('refreshApiBtn');
  refreshBtn?.addEventListener('click', async () => {
    refreshBtn.textContent = '刷新中...';
    refreshBtn.disabled = true;
    await reloadBandoriData();
    refreshBtn.disabled = false;
    refreshBtn.textContent = '刷新数据';
    refreshBtn.classList.remove('show');
  });

  document.getElementById('introCloseBtn')?.addEventListener('click', () => document.getElementById('introCard')?.classList.add('collapsed'));
  document.getElementById('introExpandBtn')?.addEventListener('click', () => document.getElementById('introCard')?.classList.remove('collapsed'));
  
  const invertSwitch = document.getElementById('invertCtrlSwitch');
  invertSwitch?.addEventListener('change', () => {
    State.invertCtrlBubble = !!invertSwitch.checked;
    const label = document.getElementById('invertCtrlLabel');
    if(label) label.textContent = State.invertCtrlBubble ? '反转操作（已开启）' : '反转操作（默认关）';
  });

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

  document.addEventListener('contextmenu', (e) => {
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

  let easterClickCount = 0, easterTimer = null;
  document.getElementById('introTitle')?.addEventListener('click', () => {
    easterClickCount++;
    clearTimeout(easterTimer);
    easterTimer = setTimeout(() => easterClickCount = 0, 2600);
    if (easterClickCount >= 10) {
      easterClickCount = 0;
      const modal = document.getElementById('easterModal');
      document.getElementById('easterText').textContent = __('statusEasterEgg');
      modal?.classList.add('open');
    }
  });
  document.getElementById('easterModalClose')?.addEventListener('click', () => document.getElementById('easterModal')?.classList.remove('open'));

  document.addEventListener('touchmove', (e) => { 
    if (Utils.isMobileViewport() && e.touches.length >= 2 && !e.target.closest('#map')) e.preventDefault(); 
  }, { passive: false });
  ['gesturestart', 'gesturechange'].forEach(evt => document.addEventListener(evt, (e) => { 
    if (Utils.isMobileViewport() && !e.target.closest('#map')) e.preventDefault(); 
  }, { passive: false }));

  document.getElementById('map')?.addEventListener('click', function(e) {
        const provincePath = e.target.closest('.province');
        if (!provincePath) return;
        
        const chinaIdToName = {
            'hlj': '黑龙江', 'jl': '吉林', 'ln': '辽宁', 'hb': '河北', 'sd': '山东',
            'js': '江苏', 'zj': '浙江', 'ah': '安徽', 'hn': '河南', 'sx': '山西',
            'snx': '陕西', 'gs': '甘肃', 'hub': '湖北', 'jx': '江西', 'hun': '湖南',
            'gz': '贵州', 'sc': '四川', 'yn': '云南', 'qh': '青海', 'han': '海南',
            'cq': '重庆', 'tj': '天津', 'bj': '北京', 'nx': '宁夏', 'im': '内蒙古',
            'gx': '广西', 'xj': '新疆', 'tb': '西藏', 'sh': '上海', 'fj': '福建',
            'gd': '广东', 'hk': '香港', 'mc': '澳门', 'tw': '台湾'
        };
        
        const japanIdToName = {
            'JP-01': '北海道', 'JP-02': '青森県', 'JP-03': '岩手県', 'JP-04': '宮城県',
            'JP-05': '秋田県', 'JP-06': '山形県', 'JP-07': '福島県', 'JP-08': '茨城県',
            'JP-09': '栃木県', 'JP-10': '群馬県', 'JP-11': '埼玉県', 'JP-12': '千葉県',
            'JP-13': '東京都', 'JP-14': '神奈川県', 'JP-15': '新潟県', 'JP-16': '富山県',
            'JP-17': '石川県', 'JP-18': '福井県', 'JP-19': '山梨県', 'JP-20': '長野県',
            'JP-21': '岐阜県', 'JP-22': '静岡県', 'JP-23': '愛知県', 'JP-24': '三重県',
            'JP-25': '滋賀県', 'JP-26': '京都府', 'JP-27': '大阪府', 'JP-28': '兵庫県',
            'JP-29': '奈良県', 'JP-30': '和歌山県', 'JP-31': '鳥取県', 'JP-32': '島根県',
            'JP-33': '岡山県', 'JP-34': '広島県', 'JP-35': '山口県', 'JP-36': '徳島県',
            'JP-37': '香川県', 'JP-38': '愛媛県', 'JP-39': '高知県', 'JP-40': '福岡県',
            'JP-41': '佐賀県', 'JP-42': '長崎県', 'JP-43': '熊本県', 'JP-44': '大分県',
'JP-45': '宮崎県', 'JP-46': '鹿児島県', 'JP-47': '沖縄県'
        };
        
        let provinceName = chinaIdToName[provincePath.id];
        if (!provinceName) {
            provinceName = japanIdToName[provincePath.id];
        }
        
        if (provinceName) {
            console.log('🗺️ 点击地区:', provinceName);
            showProvinceDetails(provinceName);
        }
    });
    // =======================================
}

// 解析外部链接字符串为数组
function parseExternalLinksStr(str) {
  if (!str || !str.trim()) return [];
  return str.trim().split('\n')
    .map(line => {
      const idx = line.indexOf(': ');
      return idx > 0 ? { platform: line.substring(0, idx).trim(), url: line.substring(idx + 2).trim().replace(/\/+$/, '') } : null;
    })
    .filter(Boolean);
}

// 从结构化输入行收集外部链接，拼接为 "平台: URL" 格式
function getExternalLinksStr() {
  const platforms = document.querySelectorAll('.ext-link-platform');
  const urls = document.querySelectorAll('.ext-link-url');
  const pairs = [];
  platforms.forEach((sel, i) => {
    const p = sel.value.trim();
    const u = (urls[i]?.value.trim() || '').replace(/\/+$/, '');
    if (p && u) pairs.push(`${p}: ${u}`);
  });
  return pairs.join('\n');
}

const CHINA_PROVINCE_OPTIONS = [
  '北京', '天津', '河北', '山西', '内蒙古', '辽宁', '吉林', '黑龙江',
  '上海', '江苏', '浙江', '安徽', '福建', '江西', '山东', '河南',
  '湖北', '湖南', '广东', '广西', '海南', '重庆', '四川', '贵州',
  '云南', '西藏', '陕西', '甘肃', '青海', '宁夏', '新疆',
  '香港', '澳门', '台湾'
];

function parseProvinceInput(value) {
  const seen = new Set();
  return String(value || '')
    .split(/[+＋/／、,，;；|｜\s]+/)
    .map(item => item.trim())
    .filter(item => {
      if (!item || seen.has(item)) return false;
      seen.add(item);
      return true;
    });
}

function formatProvinceInput(values) {
  return (values || [])
    .filter(Boolean)
    .join('、');
}

function normalizeProvincePickerValues(values) {
  const canonicalByKey = new Map(CHINA_PROVINCE_OPTIONS.map(name => [normalizeProvince(name), name]));
  const seen = new Set();
  return (values || [])
    .map(value => {
      const key = normalizeProvince(value);
      return canonicalByKey.get(key) || key || String(value || '').trim();
    })
    .filter(value => {
      const key = normalizeProvince(value);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function getProvincePickerSelection() {
  return normalizeProvincePickerValues(parseProvinceInput(document.getElementById('editProvince')?.value || ''));
}

function setProvincePickerSelection(values) {
  const editProvince = document.getElementById('editProvince');
  if (!editProvince) return;
  editProvince.value = formatProvinceInput(normalizeProvincePickerValues(values));
  renderProvincePicker();
}

function renderProvincePicker() {
  const buttonText = document.getElementById('provincePickerText');
  const optionsWrap = document.getElementById('provincePickerOptions');
  const searchInput = document.getElementById('provincePickerSearch');
  const tagsWrap = document.getElementById('provincePickerTags');
  if (!buttonText || !optionsWrap || !tagsWrap) return;

  const selected = getProvincePickerSelection();
  const selectedKeys = new Set(selected.map(normalizeProvince));
  const query = normalizeProvince(searchInput?.value || '');
  const filteredOptions = CHINA_PROVINCE_OPTIONS.filter(name => !query || normalizeProvince(name).includes(query));

  buttonText.textContent = selected.length ? '已选 ' + selected.join('、') : '请选择省份';
  tagsWrap.innerHTML = selected.map(name => (
    `<button type="button" class="province-picker-tag" data-province="${Utils.escapeHTML(name)}">${Utils.escapeHTML(name)}<span>×</span></button>`
  )).join('');
  optionsWrap.innerHTML = filteredOptions.map(name => {
    const selectedClass = selectedKeys.has(normalizeProvince(name)) ? ' selected' : '';
    return `<button type="button" class="province-picker-option${selectedClass}" data-province="${Utils.escapeHTML(name)}">${Utils.escapeHTML(name)}</button>`;
  }).join('');
}

function bindProvincePicker() {
  const picker = document.getElementById('provincePicker');
  if (!picker || picker.dataset.bound === '1') return;
  picker.dataset.bound = '1';

  const button = document.getElementById('provincePickerButton');
  const menu = document.getElementById('provincePickerMenu');
  const searchInput = document.getElementById('provincePickerSearch');
  const optionsWrap = document.getElementById('provincePickerOptions');
  const tagsWrap = document.getElementById('provincePickerTags');
  const clearBtn = document.getElementById('provincePickerClear');

  button?.addEventListener('click', () => {
    if (!menu) return;
    menu.hidden = !menu.hidden;
    renderProvincePicker();
    if (!menu.hidden) searchInput?.focus();
  });
  searchInput?.addEventListener('input', renderProvincePicker);
  optionsWrap?.addEventListener('click', event => {
    const option = event.target.closest('.province-picker-option');
    if (!option) return;
    const province = option.dataset.province || '';
    const selected = getProvincePickerSelection();
    const key = normalizeProvince(province);
    const next = selected.some(item => normalizeProvince(item) === key)
      ? selected.filter(item => normalizeProvince(item) !== key)
      : selected.concat(province);
    setProvincePickerSelection(next);
  });
  tagsWrap?.addEventListener('click', event => {
    const tag = event.target.closest('.province-picker-tag');
    if (!tag) return;
    const key = normalizeProvince(tag.dataset.province || '');
    setProvincePickerSelection(getProvincePickerSelection().filter(item => normalizeProvince(item) !== key));
  });
  clearBtn?.addEventListener('click', () => setProvincePickerSelection([]));
  document.addEventListener('click', event => {
    if (menu && !menu.hidden && !picker.contains(event.target)) menu.hidden = true;
  });
}

function editableCountryForClub(club) {
  if (club?.country === 'japan' || club?.prefecture) return 'japan';
  if (club?.country === 'overseas' || club?.province === '海外' || club?.province === '娴峰') return 'overseas';
  return 'china';
}

async function loadEditableClubSnapshot(club) {
  const country = editableCountryForClub(club);
  const clubId = parseInt(club?.id, 10);
  if (!clubId) return { ...club, country };

  try {
    const response = country === 'japan'
      ? await fetch('./data/clubs_japan.json', { cache: 'no-store' })
      : await fetch('./data/clubs.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const rawClub = (payload.data || []).find(item => parseInt(item.id, 10) === clubId);
    if (rawClub) {
      const resolvedCountry = country === 'overseas' ? 'overseas' : (rawClub.country || country);
      return {
        ...club,
        ...rawClub,
        country: resolvedCountry,
        originalInfo: rawClub.info ?? club.originalInfo ?? club.info ?? ''
      };
    }
  } catch (err) {
    console.warn('Failed to load editable club snapshot, falling back to current club data.', err);
  }

  return { ...club, country };
}

async function openClubEditor(club) {
  if (!club) {
    openEditPanel(null, true);
    return;
  }
  const snapshot = await loadEditableClubSnapshot(club);
  openEditPanel(snapshot, false);
}

function openEditPanel(club = null, isNew = false) {
  const adminPanel = document.getElementById('adminPanel');
  const adminPanelTitle = document.getElementById('adminPanelTitle');
  const editId = document.getElementById('editId');
  const editCountry = document.getElementById('editCountry');
  const editName = document.getElementById('editName');
  const editProvince = document.getElementById('editProvince');
  const editPrefecture = document.getElementById('editPrefecture');
  const editType = document.getElementById('editType');
  const editInfo = document.getElementById('editInfo');
  const editRemark = document.getElementById('editRemark');
  const editSchool = document.getElementById('editSchool');
  const editCreatedAt = document.getElementById('editCreatedAt');
  const adminDeleteBtn = document.getElementById('adminDeleteBtn');
  const provinceGroup = document.getElementById('provinceGroup');
  const prefectureGroup = document.getElementById('prefectureGroup');
  
  if (!adminPanel) return;
  bindProvincePicker();
  
  function toggleRegionFields(country) {
    if (country === 'japan') {
      if (provinceGroup) provinceGroup.style.display = 'none';
      if (prefectureGroup) prefectureGroup.style.display = 'block';
      if (editProvince) editProvince.required = false;
      if (editPrefecture) editPrefecture.required = true;
    } else if (country === 'overseas') {
      if (provinceGroup) provinceGroup.style.display = 'none';
      if (prefectureGroup) prefectureGroup.style.display = 'none';
      if (editProvince) editProvince.required = false;
      if (editPrefecture) editPrefecture.required = false;
    } else {
      if (provinceGroup) provinceGroup.style.display = 'block';
      if (prefectureGroup) prefectureGroup.style.display = 'none';
      if (editProvince) editProvince.required = true;
      if (editPrefecture) editPrefecture.required = false;
    }
  }
  
  function setSelectValue(select, value) {
    if (!select || !value) return;
    for (let i = 0; i < select.options.length; i++) {
      if (select.options[i].value === value || select.options[i].text === value) {
        select.selectedIndex = i;
        break;
      }
    }
  }

  const privacyRadios = document.querySelectorAll('input[name="privacyLevel"]');

  if (isNew) {
    adminPanelTitle.textContent = '➕ 添加同好会';
    if (editId) editId.value = '';
    if (editCountry) editCountry.value = 'china';
    if (editName) editName.value = '';
    setProvincePickerSelection([]);
    if (editPrefecture) editPrefecture.value = '';
    if (editType) editType.value = 'school';
    if (editInfo) editInfo.value = '';
    if (editRemark) editRemark.value = '';
    if (editSchool) editSchool.value = '';
    if (editCreatedAt) editCreatedAt.value = '';
    document.querySelectorAll('.ext-link-url').forEach(el => el.value = '');
    document.querySelectorAll('.ext-link-platform').forEach(el => el.value = '');
    // 新同好会默认"成员以上可见"
    const privacyRadioMembers = document.querySelector('input[name="privacyLevel"][value="members"]');
    if (privacyRadioMembers) privacyRadioMembers.checked = true;
    if (adminDeleteBtn) adminDeleteBtn.style.display = 'none';
    currentEditClubId = null;
    toggleRegionFields('china');
  } else if (club) {
    adminPanelTitle.textContent = '✏️ 编辑同好会';
    if (editId) editId.value = club.id || '';
    const country = club.country || (club.prefecture ? 'japan' : (club.province === '海外' ? 'overseas' : 'china'));
    if (editCountry) editCountry.value = country;
    if (editName) editName.value = club.name || '';
    setProvincePickerSelection(club.provinces || (club.province ? [club.province] : []));
    if (club.prefecture) setSelectValue(editPrefecture, club.prefecture);
    if (editType) editType.value = club.rawType || club.type || 'school';
    if (editInfo) editInfo.value = club.originalInfo || club.info || '';
    if (editRemark) editRemark.value = club.remark || '';
    if (editSchool) editSchool.value = club.school || '';
    if (editCreatedAt) editCreatedAt.value = club.created_at || '';
    // 隐私三选一回显
    let privacyValue = 'members';
    if (club.visible_by_default === true) privacyValue = 'public';
    else if (club.protected === true) privacyValue = 'protected';
    privacyRadios.forEach(r => { if (r.value === privacyValue) r.checked = true; });
    if (adminDeleteBtn) adminDeleteBtn.style.display = 'block';
    currentEditClubId = club.id;
    toggleRegionFields(country);
    // 加载同好会头像
    const avatarImg = document.getElementById('editClubAvatar');
    const avatarUrlField = document.getElementById('editClubAvatarUrl');
    const avatarRemoveBtn = document.getElementById('editClubAvatarRemoveBtn');
    if (avatarImg && avatarUrlField) {
      if (club.logo_url) {
        avatarImg.src = Utils.resolveMediaUrl(club.logo_url);
        avatarUrlField.value = club.logo_url;
        if (avatarRemoveBtn) avatarRemoveBtn.style.display = '';
      } else {
        avatarImg.src = '';
        avatarUrlField.value = '';
        if (avatarRemoveBtn) avatarRemoveBtn.style.display = 'none';
      }
    }
    // 加载对外平台链接到结构化输入行
    const extPlatforms = document.querySelectorAll('.ext-link-platform');
    const extUrls = document.querySelectorAll('.ext-link-url');
    const links = parseExternalLinksStr(club.external_links || '');
    extPlatforms.forEach((sel, i) => {
      if (links[i]) { sel.value = links[i].platform; extUrls[i].value = links[i].url; }
      else { sel.value = ''; extUrls[i].value = ''; }
    });
  }

  if (editCountry) {
    editCountry.onchange = function() {
      toggleRegionFields(this.value);
    };
  }
  adminPanel.classList.add('open');
}

function closeAdminPanel() {
  const adminPanel = document.getElementById('adminPanel');
  if (adminPanel) adminPanel.classList.remove('open');
  currentEditClubId = null;
}

async function openClubEditFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const editClubId = parseInt(params.get('edit_club') || '', 10);
  if (!editClubId) return;

  const country = params.get('country') === 'japan' ? 'japan' : 'china';
  const list = country === 'japan' ? State.japanRows : State.bandoriRows;
  const club = (list || []).find(item => parseInt(item.id, 10) === editClubId);
  if (!club) {
    alert('未找到要编辑的同好会');
    return;
  }
  club.country = country;
  await openClubEditor(club);
}

async function saveClub() {
  const editId = document.getElementById('editId');
  const editCountry = document.getElementById('editCountry');
  const editName = document.getElementById('editName');
  const editProvince = document.getElementById('editProvince');
  const editPrefecture = document.getElementById('editPrefecture');
  const editType = document.getElementById('editType');
  const editInfo = document.getElementById('editInfo');
  const editRemark = document.getElementById('editRemark');
  const editSchool = document.getElementById('editSchool');
  const editCreatedAt = document.getElementById('editCreatedAt');

  const country = editCountry?.value || 'china';
  
  const clubData = {
    name: editName?.value.trim() || '',
    type: editType?.value || 'school',
    info: editInfo?.value.trim() || '',
    remark: editRemark?.value.trim() || '',
    school: editSchool?.value.trim() || '',
    created_at: editCreatedAt?.value || '',
    verified: 1,
    country: country,
    visible_by_default: document.querySelector('input[name="privacyLevel"]:checked')?.value === 'public',
    protected: document.querySelector('input[name="privacyLevel"]:checked')?.value === 'protected',
    logo_url: document.getElementById('editClubAvatarUrl')?.value || '',
    external_links: getExternalLinksStr(),
  };
  
  if (country === 'japan') {
    const prefectureSelect = editPrefecture;
    clubData.prefecture = prefectureSelect?.options[prefectureSelect.selectedIndex]?.text || '';
    if (!clubData.prefecture) {
      alert('请选择日本县/都/府/道');
      return;
    }
  } else if (country === 'overseas') {
    clubData.province = '海外';
  } else {
    const selectedProvinces = parseProvinceInput(editProvince?.value || '');
    if (!selectedProvinces.length) {
      alert('请填写至少一个省份');
      return;
    }
    clubData.provinces = selectedProvinces;
    clubData.province = selectedProvinces[0];
  }
  
  if (!clubData.name) {
    alert('请填写组织名称');
    return;
  }
  if (!clubData.info) {
    alert('请填写联系方式');
    return;
  }
  
  const isEdit = currentEditClubId !== null;
  const apiUrl = country === 'japan' ? './api/clubs_japan.php' : './api/clubs.php';
  
  try {
    let response;
    if (isEdit) {
      clubData.id = currentEditClubId;
      response = await fetch(apiUrl, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(clubData)
      });
    } else {
      response = await fetch(apiUrl, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(clubData)
      });
    }
    
    const result = await response.json();
    
    if (result.success) {
      alert(isEdit ? '✅ 更新成功！' : '✅ 添加成功！');
      if (country === 'japan') {
        await loadJapanData();
        if (State.currentCountry === 'japan') {
          renderJapanMap();
        }
      } else {
        await reloadBandoriData();
      }
      closeAdminPanel();
    } else {
      alert('保存失败：' + (result.message || '未知错误'));
    }
  } catch (err) {
    console.error('保存失败：', err);
    alert('保存失败，请检查网络连接或 API 配置');
  }
}

async function deleteClub() {
    if (!confirm(__('confirmDeleteClub'))) return;
    const country = document.getElementById('editCountry')?.value || 'china';
    const apiUrl = country === 'japan' ? './api/clubs_japan.php' : './api/clubs.php';
    try {
        const response = await fetch(apiUrl, {
            method: 'DELETE',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: currentEditClubId })
        });
        const result = await response.json();
        if (result.success) {
            alert('✅ 删除成功！');
            if (country === 'japan') {
                await loadJapanData();
            } else {
                await reloadBandoriData();
            }
            closeAdminPanel();
        } else {
            alert('删除失败：' + (result.message || '未知错误'));
        }
    } catch (err) {
        console.error('删除失败：', err);
        alert('删除失败，请检查网络连接');
    }
}

async function renderPendingApprovals() {
  const container = document.getElementById('membershipPendingList');
  if (!container) return;
  container.innerHTML = '<p style="text-align: center; color: var(--md-on-surface-variant);">加载中...</p>';
  try {
    const resp = await fetch('./api/membership.php?action=pending', { credentials: 'same-origin' });
    const data = await resp.json();
    const list = data.memberships || [];
    if (!list.length) {
      container.innerHTML = '<p style="text-align: center; color: var(--md-on-surface-variant);">✅ 暂无待审批的绑定申请</p>';
      return;
    }
    container.innerHTML = list.map(m => `
      <div style="padding: 12px; margin-bottom: 8px; border-radius: 8px; background: var(--md-surface-container); display: flex; align-items: center; justify-content: space-between;">
        <div>
          <strong>${Utils.escapeHTML(m.username)}</strong>
          <span style="font-size: 12px; color: var(--md-on-surface-variant); margin-left: 8px;">同好会 #${m.club_id}</span>
          <br><span style="font-size: 11px; color: var(--md-on-surface-variant);">申请时间：${Utils.escapeHTML(m.joined_at)}</span>
        </div>
        <div style="display: flex; gap: 6px;">
          <button class="approve-btn" data-id="${m.id}" style="padding: 4px 12px; background: #2ecc71; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 12px;">批准</button>
          <button class="reject-btn" data-id="${m.id}" style="padding: 4px 12px; background: #e74c3c; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 12px;">拒绝</button>
        </div>
      </div>
    `).join('');

    // 批准事件
    container.querySelectorAll('.approve-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        btn.disabled = true;
        try {
          const resp = await fetch('./api/membership.php?action=approve', {
            method: 'POST', credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ membership_id: parseInt(id) })
          });
          const result = await resp.json();
          alert(result.message || (result.success ? '已批准' : '操作失败'));
          if (result.success) renderPendingApprovals();
        } catch { alert(__('alertNetworkError')); btn.disabled = false; }
      });
    });

    // 拒绝事件
    container.querySelectorAll('.reject-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        btn.disabled = true;
        try {
          const resp = await fetch('./api/membership.php?action=reject', {
            method: 'POST', credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ membership_id: parseInt(id) })
          });
          const result = await resp.json();
          alert(result.message || (result.success ? '已拒绝' : '操作失败'));
          if (result.success) renderPendingApprovals();
        } catch { alert(__('alertNetworkError')); btn.disabled = false; }
      });
    });
  } catch {
    container.innerHTML = '<p style="text-align: center; color: #e74c3c;">❌ 加载失败，请重试</p>';
  }
}

function initAdminEvents() {

	  const addClubBtn = document.getElementById("addClubBtn");
	  const adminCancelBtn = document.getElementById("adminCancelBtn");
	  const adminSaveBtn = document.getElementById("adminSaveBtn");
	  const adminDeleteBtn = document.getElementById("adminDeleteBtn");
	  const adminPanel = document.getElementById("adminPanel");

	  if (addClubBtn) {
	    addClubBtn.addEventListener("click", () => {
	      if (!hasRole("manager")) { alert(__('alertPermissionDenied')); return; }
	      openEditPanel(null, true);
	    });
	  }

	  if (adminCancelBtn) adminCancelBtn.addEventListener("click", closeAdminPanel);
	  if (adminSaveBtn) adminSaveBtn.addEventListener("click", saveClub);
    if (adminDeleteBtn) adminDeleteBtn.addEventListener("click", deleteClub);
	  // 编辑面板关闭按钮和遮罩层
	  const adminPanelClose = document.getElementById("adminPanelClose");
	  if (adminPanelClose) adminPanelClose.addEventListener("click", closeAdminPanel);
	  const adminBackdrop = document.getElementById("adminPanelBackdrop");
	  if (adminBackdrop) adminBackdrop.addEventListener("click", closeAdminPanel);
	  document.addEventListener("keydown", (e) => {
		if (e.key === "Escape") {
			const panel = document.getElementById("adminPanel");
			if (panel?.classList.contains("open")) closeAdminPanel();
		}
	  });

	  if (adminPanel) {
	    adminPanel.addEventListener("click", (e) => { if (e.target === adminPanel) closeAdminPanel(); });
	  }

	  // 绑定审批按钮
	  const membershipBtn = document.getElementById("membershipBtn");
	  if (membershipBtn) {
	    membershipBtn.addEventListener("click", () => {
	      if (!hasRole("manager")) { alert(__('alertPermissionDenied')); return; }
	      const modal = document.getElementById("membershipModal");
	      if (!modal) return;
	      modal.classList.add("open");
	      modal.setAttribute("aria-hidden", "false");
	      renderPendingApprovals();
	    });
	    membershipBtn.title = __('approvalCenter');
	  }

	  // 审核中心按钮
	  const reviewsBtn = document.getElementById("reviewsBtn");
	  if (reviewsBtn) {
	    reviewsBtn.addEventListener("click", () => {
	      window.open("./admin/reviews.html", "_blank");
	    });
	    reviewsBtn.title = currentLang === 'ja' ? '審査センター' : '审核中心';
	  }

	  // 同好会管理按钮
	  const clubManageBtn = document.getElementById("clubManageBtn");
	  if (clubManageBtn) {
	    clubManageBtn.addEventListener("click", () => {
	      window.open("./admin/club_manager.html", "_blank");
	    });
	    clubManageBtn.title = __('topAdmin');
	  }

	  // 绑定审批弹窗关闭
	  const membershipModalClose = document.getElementById("membershipModalClose");
	  if (membershipModalClose) {
	    membershipModalClose.onclick = () => {
	      const modal = document.getElementById("membershipModal");
	      modal?.classList.remove("open");
	      modal?.setAttribute("aria-hidden", "true");
	    };
	  }
	  const membershipModal = document.getElementById("membershipModal");
	  if (membershipModal) {
	    membershipModal.addEventListener("click", (e) => {
	      if (e.target === membershipModal) {
	        membershipModal.classList.remove("open");
	        membershipModal.setAttribute("aria-hidden", "true");
	      }
	    });
	  }

	  document.addEventListener("keydown", (e) => {
	    if (e.ctrlKey && e.key === "e" && hasRole("manager")) { e.preventDefault(); exportData(); }
	  });

	  // 同好会头像上传
	  const editClubAvatarBtn = document.getElementById("editClubAvatarBtn");
	  const editClubAvatarInput = document.getElementById("editClubAvatarInput");
	  const editClubAvatarRmBtn = document.getElementById("editClubAvatarRemoveBtn");
	  const editClubAvatarSt = document.getElementById("editClubAvatarStatus");

	  editClubAvatarBtn?.addEventListener("click", () => editClubAvatarInput?.click());

	  editClubAvatarInput?.addEventListener("change", (e) => {
	    const file = e.target.files[0];
	    if (!file) return;
	    const cid = document.getElementById("editId")?.value;
	    if (!cid) {
	      if (editClubAvatarSt) editClubAvatarSt.textContent = "请先保存同好会后再上传头像";
	      editClubAvatarInput.value = "";
	      return;
	    }
	    // 校验文件
	    if (file.size > 2 * 1024 * 1024) {
	      if (editClubAvatarSt) { editClubAvatarSt.textContent = "图片不能超过 2MB"; editClubAvatarSt.style.color = '#e74c3c'; }
	      editClubAvatarInput.value = "";
	      return;
	    }
	    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
	    if (!allowed.includes(file.type)) {
	      if (editClubAvatarSt) { editClubAvatarSt.textContent = "仅支持 JPEG/PNG/GIF/WebP"; editClubAvatarSt.style.color = '#e74c3c'; }
	      editClubAvatarInput.value = "";
	      return;
	    }
	    // 打开裁剪弹窗
	    const cropImg = document.getElementById('cropImage');
	    cropImg.onload = function () {
	      document.getElementById('avatarCropModal').style.display = 'flex';
	      initCropper(cropImg);
	      _clubAvatarCropClubId = cid;
	      _clubAvatarCropCountry = document.getElementById("editCountry")?.value || "china";
	      if (editClubAvatarSt) editClubAvatarSt.textContent = '';
	    };
	    cropImg.src = URL.createObjectURL(file);
	    editClubAvatarInput.value = "";
	  });

	  editClubAvatarRmBtn?.addEventListener("click", () => {
	    document.getElementById("editClubAvatar").src = "";
	    document.getElementById("editClubAvatarUrl").value = "";
	    editClubAvatarRmBtn.style.display = "none";
	    if (editClubAvatarSt) editClubAvatarSt.textContent = "已移除头像";
	  });

	  console.log("✅ 管理员事件已初始化");
	}

// ==========================================
// 刊物管理模块
// ==========================================
let publications = [];
let currentPubFilter = 'all';
// 同好会名称/头像映射（用于刊物列表解析 club_ids）
let clubDataCn = [];
let clubDataJp = [];

async function loadPublications() {
  try {
    const resp = await fetch('./data/publications.json', { cache: 'no-store' });
    if (resp.ok) {
      const json = await resp.json();
      publications = json.publications || [];
    } else {
      publications = [];
    }
  } catch (e) {
    console.error('加载刊物失败:', e);
    publications = [];
  }
  renderPublicationList();
}

async function loadClubDataForPublications() {
  try {
    const [cn, jp] = await Promise.all([
      fetch('./data/clubs.json', { cache: 'no-store' }).then(r => r.json()),
      fetch('./data/clubs_japan.json', { cache: 'no-store' }).then(r => r.json())
    ]);
    clubDataCn = cn.data || [];
    clubDataJp = jp.data || [];
  } catch (e) {
    console.error('加载俱乐部数据失败:', e);
  }
}

function getClubInfo(clubId, country) {
  const list = country === 'japan' ? clubDataJp : clubDataCn;
  const club = list.find(c => c.id === clubId);
  if (!club) return { name: '同好会 #' + clubId, logo_url: '' };
  return {
    name: club.name || club.school || '未知',
    logo_url: club.logo_url || ''
  };
}

const statusMap = {
  'planning': { text: '📋 策划中', class: 'planning' },
  'writing': { text: '✍️ 征稿中', class: 'writing' },
  'editing': { text: '🔧 编辑中', class: 'editing' },
  'publishing': { text: '📢 即将发布', class: 'publishing' },
  'completed': { text: '✅ 已发布', class: 'completed' },
  'suspended': { text: '⏸️ 暂停', class: 'suspended' }
};

let selectedClubIds = []; // [{id, country, name}]

function renderPublicationList() {
  const container = document.getElementById('publicationList');
  if (!container) return;

  const filtered = currentPubFilter === 'all'
    ? publications
    : publications.filter(p => p.status === currentPubFilter);

  document.querySelectorAll('.pub-filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === currentPubFilter);
  });

  if (!filtered.length) {
    container.innerHTML = '<div class="empty-text" style="text-align:center;padding:40px;">暂无刊物信息，欢迎投稿~</div>';
    return;
  }

  container.innerHTML = filtered.map(pub => {
    const status = statusMap[pub.status] || statusMap.planning;
    const clubIds = pub.club_ids || [];
    const firstClub = clubIds.length > 0 ? getClubInfo(clubIds[0].id, clubIds[0].country) : null;
    const avatarHtml = firstClub && firstClub.logo_url
      ? `<img src="${Utils.escapeHTML(Utils.resolveMediaUrl(firstClub.logo_url))}" alt="" class="pub-list-avatar-img">`
      : `<span class="pub-list-avatar-text">${(firstClub ? firstClub.name[0] : (pub.clubName || '?')[0])}</span>`;
    const clubDisplay = firstClub ? Utils.escapeHTML(firstClub.name) : Utils.escapeHTML(pub.clubName || '未知同好会');

    return `<div class="publication-item pub-list-item" data-id="${pub.id}">
      <div class="pub-list-avatar">${avatarHtml}</div>
      <div class="pub-list-info">
        <div class="pub-list-name">${Utils.escapeHTML(pub.publicationName)}</div>
        <div class="pub-list-club">${clubDisplay}</div>
      </div>
      <span class="pub-list-status ${status.class}">${status.text}</span>
      ${pub.deadline ? `<span class="pub-list-deadline">截稿 ${pub.deadline}</span>` : ''}
      <span class="pub-list-arrow">→</span>
    </div>`;
  }).join('');

  container.querySelectorAll('.pub-list-item').forEach(item => {
    item.addEventListener('click', () => {
      const id = parseInt(item.dataset.id);
      const pub = publications.find(p => p.id === id);
      if (pub) openPublicationDetail(pub);
    });
  });

  const addBtn = document.getElementById('addPublicationBtn');
  if (addBtn) addBtn.style.display = hasRole('manager') ? 'flex' : 'none';
}

function openPublicationEditor(publication = null) {
  const modal = document.getElementById('publicationEditorModal');
  const title = document.getElementById('publicationEditorTitle');
  const pubId = document.getElementById('pubEditId');
  const clubName = document.getElementById('pubClubName');
  const pubName = document.getElementById('pubName');
  const status = document.getElementById('pubStatus');
  const submitContact = document.getElementById('pubSubmitContact');
  const submitLink = document.getElementById('pubSubmitLink');
  const deadline = document.getElementById('pubDeadline');
  const description = document.getElementById('pubDescription');
  const deleteBtn = document.getElementById('pubDeleteBtn');

  if (publication) {
    title.textContent = '✏️ 编辑刊物';
    if (pubId) pubId.value = publication.id;
    if (clubName) clubName.value = publication.clubName || '';
    if (pubName) pubName.value = publication.publicationName || '';
    if (status) status.value = publication.status || 'planning';
    if (submitContact) submitContact.value = publication.submitContact || '';
    if (submitLink) submitLink.value = publication.submitLink || '';
    if (deadline) deadline.value = publication.deadline || '';
    if (description) description.value = publication.description || '';
    if (deleteBtn) deleteBtn.style.display = 'block';
    const pubImgPreview = document.getElementById('pubImagePreview');
    const pubImgUrl = document.getElementById('pubImageUrl');
    const pubImgRemoveBtn = document.getElementById('pubImageRemoveBtn');
    if (publication.image_url) {
      if (pubImgPreview) { pubImgPreview.src = publication.image_url; pubImgPreview.style.display = ''; }
      if (pubImgUrl) pubImgUrl.value = publication.image_url;
      if (pubImgRemoveBtn) pubImgRemoveBtn.style.display = '';
    } else {
      if (pubImgPreview) { pubImgPreview.src = ''; pubImgPreview.style.display = 'none'; }
      if (pubImgUrl) pubImgUrl.value = '';
      if (pubImgRemoveBtn) pubImgRemoveBtn.style.display = 'none';
    }
    // 初始化关联同好会
    selectedClubIds = (publication.club_ids || []).map(c => {
      const info = getClubInfo(c.id, c.country);
      return { id: c.id, country: c.country, name: info.name };
    });
    renderSelectedPubClubs();
  } else {
    title.textContent = '➕ 添加刊物';
    if (pubId) pubId.value = '';
    if (clubName) clubName.value = '';
    if (pubName) pubName.value = '';
    if (status) status.value = 'planning';
    if (submitContact) submitContact.value = '';
    if (submitLink) submitLink.value = '';
    if (deadline) deadline.value = '';
    if (description) description.value = '';
    if (deleteBtn) deleteBtn.style.display = 'none';
    const pubImgPreview2 = document.getElementById('pubImagePreview');
    const pubImgUrl2 = document.getElementById('pubImageUrl');
    const pubImgRemoveBtn2 = document.getElementById('pubImageRemoveBtn');
    if (pubImgPreview2) { pubImgPreview2.src = ''; pubImgPreview2.style.display = 'none'; }
    if (pubImgUrl2) pubImgUrl2.value = '';
    if (pubImgRemoveBtn2) pubImgRemoveBtn2.style.display = 'none';
    const pubImgStatus = document.getElementById('pubImageStatus');
    if (pubImgStatus) pubImgStatus.textContent = '';
    selectedClubIds = [];
    renderSelectedPubClubs();
  }
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
}

function closePublicationEditor() {
  const modal = document.getElementById('publicationEditorModal');
  if (modal) {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
  }
}

async function savePublication() {
  const pubId = document.getElementById('pubEditId').value;
  const clubName = document.getElementById('pubClubName').value.trim();
  const pubName = document.getElementById('pubName').value.trim();
  const status = document.getElementById('pubStatus').value;
  const submitContact = document.getElementById('pubSubmitContact').value.trim();
  const submitLink = document.getElementById('pubSubmitLink').value.trim();
  const deadline = document.getElementById('pubDeadline').value;
  const description = document.getElementById('pubDescription').value.trim();

  if (!clubName && selectedClubIds.length === 0) { alert('请填写同好会名称或选择关联同好会'); return; }
  if (!pubName) { alert('请填写刊物名称'); return; }

  const isEdit = pubId !== '';
  const data = {
    clubName,
    publicationName: pubName,
    status,
    submitContact,
    submitLink,
    deadline,
    description,
    image_url: document.getElementById('pubImageUrl')?.value || '',
    club_ids: selectedClubIds.map(s => ({ id: s.id, country: s.country })),
  };
  if (isEdit) data.id = parseInt(pubId);

  try {
    const response = await fetch('./api/publications.php', {
      method: isEdit ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const result = await response.json();
    if (result.success) {
      alert(isEdit ? '✅ 刊物已更新' : '✅ 刊物已添加');
      await loadPublications();
      closePublicationEditor();
    } else {
      alert('保存失败：' + (result.message || '未知错误'));
    }
  } catch (err) {
    console.error('保存失败:', err);
    alert('保存失败，请检查网络连接');
  }
}

async function deletePublication() {
  const pubId = document.getElementById('pubEditId').value;
  if (!pubId) return;
  if (!confirm('⚠️ 确定要删除这个刊物吗？此操作不可撤销！')) return;
  try {
    const response = await fetch('./api/publications.php', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: parseInt(pubId) })
    });
    const result = await response.json();
    if (result.success) {
      alert('✅ 删除成功');
      await loadPublications();
      closePublicationEditor();
    } else {
      alert('删除失败：' + (result.message || '未知错误'));
    }
  } catch (err) {
    console.error('删除失败:', err);
    alert('删除失败，请检查网络连接');
  }
}

function initPubClubSelector() {
  const searchInput = document.getElementById('pubClubSearchInput');
  const searchBtn = document.getElementById('pubClubSearchBtn');
  const results = document.getElementById('pubClubSearchResults');
  if (!searchInput || !searchBtn || !results) return;

  async function doSearch() {
    const q = searchInput.value.trim().toLowerCase();
    if (!q) { results.style.display = 'none'; return; }
    const matches = [];
    (clubDataCn || []).forEach(c => {
      if ((c.name || '').toLowerCase().includes(q) || (c.school || '').toLowerCase().includes(q)) {
        matches.push({ id: c.id, country: 'china', name: c.name || c.school || '未知', logo_url: c.logo_url || '' });
      }
    });
    (clubDataJp || []).forEach(c => {
      if ((c.name || '').toLowerCase().includes(q) || (c.school || '').toLowerCase().includes(q)) {
        matches.push({ id: c.id, country: 'japan', name: c.name || c.school || '未知', logo_url: c.logo_url || '' });
      }
    });
    if (matches.length === 0) {
      results.innerHTML = '<div style="padding:12px;color:#999;font-size:13px;">未找到同好会</div>';
    } else {
      results.innerHTML = matches.slice(0, 20).map(m => {
        const already = selectedClubIds.some(s => s.id === m.id && s.country === m.country);
        return `<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;cursor:pointer;border-radius:6px;${already ? 'opacity:0.4;' : ''}"
          onclick="${already ? '' : 'addPubClub(' + m.id + ',\'' + m.country + '\')'}">
          <span style="width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#667eea,#764ba2);display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;flex-shrink:0;overflow:hidden;">
            ${m.logo_url ? '<img src="' + Utils.escapeHTML(Utils.resolveMediaUrl(m.logo_url)) + '" style="width:100%;height:100%;object-fit:cover;">' : (m.name[0] || '?')}
          </span>
          <span style="font-size:13px;">${Utils.escapeHTML(m.name)}</span>
          <span style="font-size:10px;color:#999;">${m.country === 'japan' ? '🇯🇵' : '🇨🇳'}</span>
          ${already ? '<span style="margin-left:auto;font-size:11px;color:#999;">已选择</span>' : ''}
        </div>`;
      }).join('');
    }
    results.style.display = '';
  }

  searchBtn.addEventListener('click', doSearch);
  searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });
  // Close results when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#pubClubSearchInput') && !e.target.closest('#pubClubSearchBtn') && !e.target.closest('#pubClubSearchResults')) {
      results.style.display = 'none';
    }
  });
}

function addPubClub(id, country) {
  const list = country === 'japan' ? (clubDataJp || []) : (clubDataCn || []);
  const club = list.find(c => c.id === id);
  if (!club) return;
  if (selectedClubIds.some(s => s.id === id && s.country === country)) return;
  selectedClubIds.push({ id, country, name: club.name || club.school || '未知' });
  renderSelectedPubClubs();
  const results = document.getElementById('pubClubSearchResults');
  const input = document.getElementById('pubClubSearchInput');
  if (results) results.style.display = 'none';
  if (input) input.value = '';
}

function removePubClub(id, country) {
  selectedClubIds = selectedClubIds.filter(s => !(s.id === id && s.country === country));
  renderSelectedPubClubs();
}

function renderSelectedPubClubs() {
  const container = document.getElementById('pubClubIdsContainer');
  if (!container) return;
  if (selectedClubIds.length === 0) {
    container.innerHTML = '<span style="font-size:12px;color:#999;">暂未选择同好会</span>';
    return;
  }
  container.innerHTML = selectedClubIds.map(s =>
    `<span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px 4px 6px;border-radius:20px;font-size:12px;background:var(--md-surface-container-high);border:1px solid var(--md-outline-variant);">
      <span style="width:20px;height:20px;border-radius:50%;background:linear-gradient(135deg,#667eea,#764ba2);display:flex;align-items:center;justify-content:center;color:#fff;font-size:10px;flex-shrink:0;overflow:hidden;"></span>
      ${Utils.escapeHTML(s.name)}
      <span style="cursor:pointer;opacity:0.6;margin-left:2px;" onclick="removePubClub(${s.id},'${s.country}')">✕</span>
    </span>`
  ).join('');

  // 自动同步 clubName 输入框
  const clubNameInput = document.getElementById('pubClubName');
  if (clubNameInput) {
    const names = selectedClubIds.map(s => s.name).filter(Boolean);
    clubNameInput.value = names.join('、');
  }
}

function initPublicationEvents() {
  const modal = document.getElementById('publicationModal');
  const closeBtn = document.getElementById('publicationModalClose');
  const addBtn = document.getElementById('addPublicationBtn');
  const editorCloseBtn = document.getElementById('publicationEditorClose');
  const saveBtn = document.getElementById('pubSaveBtn');
  const deleteBtn = document.getElementById('pubDeleteBtn');

  closeBtn?.addEventListener('click', () => {
    modal?.classList.remove('open');
    modal?.setAttribute('aria-hidden', 'true');
  });
  modal?.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('open'); });
  addBtn?.addEventListener('click', () => {
    if (!hasRole('manager')) { alert(__('alertPermissionDenied')); return; }
    openPublicationEditor(null);
  });
  editorCloseBtn?.addEventListener('click', closePublicationEditor);
  saveBtn?.addEventListener('click', savePublication);
  deleteBtn?.addEventListener('click', deletePublication);

  // Filter tabs
  document.getElementById('pubFilterTabs')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.pub-filter-btn');
    if (btn) {
      currentPubFilter = btn.dataset.filter;
      renderPublicationList();
    }
  });

  // 刊物图片上传
  const pubImageBtn = document.getElementById('pubImageBtn');
  const pubImageInput = document.getElementById('pubImageInput');
  const pubImageRemoveBtn = document.getElementById('pubImageRemoveBtn');
  const pubImageStatus = document.getElementById('pubImageStatus');

  pubImageBtn?.addEventListener('click', () => pubImageInput?.click());

  pubImageInput?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const pid = document.getElementById('pubEditId')?.value || 'new_' + Date.now();
    const fd = new FormData();
    fd.append('image', file);
    fd.append('id', pid);
    if (pubImageStatus) pubImageStatus.textContent = '上传中...';
    try {
      const r = await fetch('./api/club_avatar.php?scope=publication', { method: 'POST', body: fd });
      const j = await r.json();
      if (j.success) {
        document.getElementById('pubImagePreview').src = Utils.preloadMediaUrl(j.image_url);
        document.getElementById('pubImagePreview').style.display = '';
        document.getElementById('pubImageUrl').value = j.image_url;
        if (pubImageRemoveBtn) pubImageRemoveBtn.style.display = '';
        if (pubImageStatus) pubImageStatus.textContent = '✅ 上传成功';
      } else {
        if (pubImageStatus) pubImageStatus.textContent = '❌ ' + (j.message || '上传失败');
      }
    } catch { if (pubImageStatus) pubImageStatus.textContent = '❌ 网络错误'; }
    pubImageInput.value = '';
  });

  pubImageRemoveBtn?.addEventListener('click', () => {
    document.getElementById('pubImagePreview').src = '';
    document.getElementById('pubImagePreview').style.display = 'none';
    document.getElementById('pubImageUrl').value = '';
    pubImageRemoveBtn.style.display = 'none';
    if (pubImageStatus) pubImageStatus.textContent = '已移除图片';
  });

  document.getElementById('pubDetailClose')?.addEventListener('click', closePublicationDetail);
  document.getElementById('publicationDetailModal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closePublicationDetail();
  });
  document.getElementById('manuscriptUploadBtn')?.addEventListener('click', uploadManuscript);
  initPubClubSelector();
}

function openPublicationDetail(pub) {
  const modal = document.getElementById('publicationDetailModal');
  const cover = document.getElementById('pubDetailCover');
  const name = document.getElementById('pubDetailName');
  const clubs = document.getElementById('pubDetailClubs');
  const meta = document.getElementById('pubDetailMeta');
  const contact = document.getElementById('pubDetailContact');
  const desc = document.getElementById('pubDetailDesc');

  if (pub.image_url) {
    cover.innerHTML = `<img src="${Utils.escapeHTML(pub.image_url)}" alt="封面" loading="lazy">`;
    cover.style.display = '';
  } else {
    cover.style.display = 'none';
  }

  name.textContent = pub.publicationName || '';

  const clubIds = pub.club_ids || [];
  if (clubIds.length > 0) {
    clubs.innerHTML = clubIds.map(c => {
      const info = getClubInfo(c.id, c.country);
      const avatar = info.logo_url
        ? `<img src="${Utils.escapeHTML(Utils.resolveMediaUrl(info.logo_url))}" alt="">`
        : `<span>${Utils.escapeHTML(info.name[0] || '?')}</span>`;
      return `<span class="pub-detail-club-tag">
        <span class="cdt-avatar">${avatar}</span>
        ${Utils.escapeHTML(info.name)}
      </span>`;
    }).join('');
  } else if (pub.clubName) {
    clubs.textContent = pub.clubName;
  } else {
    clubs.textContent = '';
  }

  const st = statusMap[pub.status] || statusMap.planning;
  let metaHtml = `<span class="pub-list-status ${st.class}">${st.text}</span>`;
  if (pub.deadline) metaHtml += ` <span style="margin-left:12px;">截稿 ${Utils.escapeHTML(pub.deadline)}</span>`;
  meta.innerHTML = metaHtml;

  if (pub.submitContact) {
    contact.innerHTML = `<strong>投稿联系方式：</strong>${Utils.escapeHTML(pub.submitContact)}`;
    contact.style.display = '';
  } else {
    contact.style.display = 'none';
  }

  if (pub.description) {
    desc.textContent = pub.description;
    desc.style.display = '';
  } else {
    desc.textContent = '暂无简介';
    desc.style.display = '';
  }

  loadManuscripts(pub.id);
  modal.dataset.pubId = pub.id;
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  const scrollEl = document.getElementById('pubDetailScroll');
  if (scrollEl) scrollEl.scrollTop = 0;
}

function closePublicationDetail() {
  const modal = document.getElementById('publicationDetailModal');
  if (modal) {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
  }
}

async function loadManuscripts(pubId) {
  const container = document.getElementById('pubDetailManuscripts');
  if (!container) return;
  try {
    const resp = await fetch(`./api/manuscripts.php?action=list_by_publication&publication_id=${pubId}`);
    const json = await resp.json();
    const manuscripts = json.manuscripts || [];
    if (manuscripts.length === 0) {
      container.innerHTML = '<div class="empty-text" style="padding:20px;text-align:center;">暂无稿件</div>';
      return;
    }
    container.innerHTML = manuscripts.map(m => {
      const isOwner = currentUser?.user?.id === m.submitter_id;
      const isAdmin = hasRole('manager');
      const canManage = isOwner || isAdmin;
      const actionsHtml = canManage ? `<div style="display:flex;gap:4px;flex-shrink:0;">
        <a class="md3-btn" style="font-size:12px;padding:2px 10px;text-decoration:none;" href="./api/manuscripts.php?action=download&id=${m.id}" target="_blank">⬇</a>
        <button class="md3-btn manuscript-delete-btn" style="font-size:12px;padding:2px 10px;" data-id="${m.id}">🗑</button>
      </div>` : '';
      return `<div class="manuscript-item" style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #eee;">
        <span style="font-size:20px;">📄</span>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${Utils.escapeHTML(m.file_name)}</div>
          <div style="font-size:12px;color:#888;">${Utils.escapeHTML(m.submitter_name || '匿名')}${m.created_at ? ' · ' + Utils.escapeHTML(m.created_at) : ''}${m.contact ? ' · ' + Utils.escapeHTML(m.contact) : ''}</div>
        </div>
        ${actionsHtml}
      </div>`;
    }).join('');
    container.querySelectorAll('.manuscript-delete-btn').forEach(btn => {
      btn.addEventListener('click', () => deleteManuscript(parseInt(btn.dataset.id)));
    });
  } catch {
    container.innerHTML = '<div class="empty-text" style="padding:20px;text-align:center;">加载稿件失败</div>';
  }
}

async function uploadManuscript() {
  const modal = document.getElementById('publicationDetailModal');
  const pubId = modal?.dataset?.pubId;
  const fileInput = document.getElementById('manuscriptFileInput');
  const contactInput = document.getElementById('manuscriptContactInput');
  const status = document.getElementById('manuscriptStatus');
  const file = fileInput?.files?.[0];
  const contact = contactInput?.value?.trim();

  if (!pubId) { if (status) status.textContent = '❌ 未指定刊物'; return; }
  if (!file) { if (status) status.textContent = '❌ 请选择文件'; return; }
  if (!contact) { if (status) status.textContent = '❌ 请填写联系方式'; return; }

  const fd = new FormData();
  fd.append('file', file);
  fd.append('contact', contact);
  fd.append('publication_id', pubId);

  if (status) status.textContent = '上传中...';
  try {
    const resp = await fetch('./api/manuscripts.php?action=upload', { method: 'POST', body: fd });
    const json = await resp.json();
    if (json.success) {
      if (status) status.textContent = '✅ 上传成功';
      if (fileInput) fileInput.value = '';
      if (contactInput) contactInput.value = '';
      loadManuscripts(pubId);
    } else {
      if (status) status.textContent = '❌ ' + (json.message || '上传失败');
    }
  } catch {
    if (status) status.textContent = '❌ 网络错误';
  }
}

async function deleteManuscript(id) {
  if (!confirm('确定要删除这份稿件吗？')) return;
  try {
    const resp = await fetch('./api/manuscripts.php?action=delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    });
    const json = await resp.json();
    if (json.success) {
      const modal = document.getElementById('publicationDetailModal');
      const pubId = modal?.dataset?.pubId;
      if (pubId) loadManuscripts(pubId);
    } else {
      alert('删除失败：' + (json.message || '未知错误'));
    }
  } catch {
    alert('删除失败，请检查网络连接');
  }
}

// ===== 顶层用户信息框交互 =====
function initTopUserBar() {
  // 导航按钮点击
  document.querySelectorAll('.user-nav-btn').forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      // 列表模式下由 bindListModeControls 处理
      if (State.viewMode === 'list') return;
      const action = this.dataset.action;
      switch (action) {
        case 'china': switchToChinaMap(); break;
        case 'japan': switchToJapanMap(); break;
        case 'overseas': switchToOverseas(); break;
        case 'calendar':
          document.getElementById('calendarModal')?.classList.add('open');
          document.getElementById('calendarModal')?.setAttribute('aria-hidden', 'false');
          break;
        case 'publication':
          (function() {
            const pubModal = document.getElementById('publicationModal');
            if (pubModal) {
              if (typeof renderPublicationList === 'function') renderPublicationList();
              const addBtn = document.getElementById('addPublicationBtn');
              if (addBtn) addBtn.style.display = hasRole('manager') ? 'flex' : 'none';
              pubModal.classList.add('open');
              pubModal.setAttribute('aria-hidden', 'false');
            }
          })();
          break;
      }
    });
  });

  // 模式切换
  document.querySelectorAll('.mode-tab').forEach(tab => {
    tab.addEventListener('click', function() {
      const mode = this.dataset.mode;
      if (mode === State.viewMode) return;
      switchViewMode(mode);
    });
  });

  // 登录按钮
  document.getElementById('topLoginBtn')?.addEventListener('click', function(e) {
    e.stopPropagation();
    openAccountModal('login');
  });

  // 账号按钮
  document.getElementById('topAccountBtn')?.addEventListener('click', function(e) {
    goUserCenter(e);
  });

  // 移动端：点击卡片切换折叠/展开
  const card = document.getElementById('userInfoCard');
  if (card) {
    const toggleMobileTopBar = function() {
      card.classList.toggle('mobile-expanded');
      const arrow = document.getElementById('mobileExpandArrow');
      if (arrow) arrow.classList.toggle('expanded');
    };

    card.addEventListener('click', function(e) {
      if (window.innerWidth > 720) return;
      if (e.target.closest('button') || e.target.closest('a')) return;
      toggleMobileTopBar();
    });

    document.getElementById('mobileExpandArrow')?.addEventListener('click', function(e) {
      if (window.innerWidth > 720) return;
      e.stopPropagation();
      toggleMobileTopBar();
    });
  }

  // 移动端折叠状态跟随窗口resize重置
  let resizeTimer;
  window.addEventListener('resize', function() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function() {
      if (window.innerWidth > 720 && card) {
        card.classList.remove('mobile-expanded');
      }
    }, 200);
  });
}

// ===== 移动端左侧抽屉 =====
function initMobileDrawer() {
  // 汉堡按钮
  document.getElementById('hamburgerBtn')?.addEventListener('click', function() {
    document.getElementById('mobileDrawer')?.classList.add('open');
    document.getElementById('mobileDrawer')?.setAttribute('aria-hidden', 'false');
  });

  // 遮罩关闭
  document.getElementById('mobileDrawerBackdrop')?.addEventListener('click', function() {
    document.getElementById('mobileDrawer')?.classList.remove('open');
    document.getElementById('mobileDrawer')?.setAttribute('aria-hidden', 'true');
  });

  // 关闭按钮
  document.getElementById('mobileDrawerClose')?.addEventListener('click', function() {
    document.getElementById('mobileDrawer')?.classList.remove('open');
    document.getElementById('mobileDrawer')?.setAttribute('aria-hidden', 'true');
  });

  // 抽屉内提交按钮事件代理
  document.getElementById('submitClubBtnDrawer')?.addEventListener('click', function() {
    window.location.href = 'submit.html';
  });
  document.getElementById('submitEventBtnDrawer')?.addEventListener('click', function() {
    window.location.href = 'submit_event.html';
  });
  document.getElementById('submitPublicationBtnDrawer')?.addEventListener('click', function() {
    window.location.href = 'submit_publication.html';
  });

  // 抽屉内语言切换
  document.getElementById('langZhBtnDrawer')?.addEventListener('click', function() {
    currentLang = 'zh';
    localStorage.setItem('language', 'zh');
    updateUILanguage();
    renderCurrentDetail();
    document.getElementById('mobileDrawer')?.classList.remove('open');
  });
  document.getElementById('langJaBtnDrawer')?.addEventListener('click', function() {
    currentLang = 'ja';
    localStorage.setItem('language', 'ja');
    updateUILanguage();
    renderCurrentDetail();
    document.getElementById('mobileDrawer')?.classList.remove('open');
  });

  // 抽屉内开关同步到主开关
  document.getElementById('invertCtrlSwitchDrawer')?.addEventListener('change', function() {
    const main = document.getElementById('invertCtrlSwitch');
    if (main) main.checked = this.checked;
    main?.dispatchEvent(new Event('change'));
  });
  document.getElementById('themeSwitchDrawer')?.addEventListener('change', function() {
    const main = document.getElementById('themeSwitch');
    if (main) main.checked = this.checked;
    main?.dispatchEvent(new Event('change'));
  });
}

// ==========================================
// 移动端抽屉控件
// ==========================================
(function initDrawerControls() {
    function init() {
        const zoomInBtn = document.getElementById('drawerZoomInBtn');
        const zoomOutBtn = document.getElementById('drawerZoomOutBtn');
        const resetBtn = document.getElementById('drawerResetBtn');

        if (!zoomInBtn || !zoomOutBtn || !resetBtn) {
            setTimeout(init, 500);
            return;
        }

        zoomInBtn.onclick = function(e) {
            e.stopPropagation();
            stepScale(1.2);
        };

        zoomOutBtn.onclick = function(e) {
            e.stopPropagation();
            stepScale(1 / 1.2);
        };

        resetBtn.onclick = function(e) {
            e.stopPropagation();
            if (State.mapViewState) {
                const { svg, zoom, baseScale, baseTranslate } = State.mapViewState;
                svg.call(zoom.transform, d3.zoomIdentity.translate(baseTranslate[0], baseTranslate[1]).scale(baseScale));
            }
        };

        console.log('✅ 缩放控件绑定完成');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

// ==========================================
// 移动端交互增强
// ==========================================
(function initMobileUI() {
  function init() {
    const isMobile = window.innerWidth <= 720;
    if (!isMobile) return;
    // 移动端汉堡按钮 GalOnly 同款流光动效
    const hb = document.getElementById('hamburgerBtn');
    if (hb) hb.classList.add('galonly-glow-mobile');
    const introCard = document.getElementById('introCard');
    const selectedCard = document.getElementById('selectedCard');
    if (introCard) {
      introCard.onclick = function(e) {
        if (e.target.closest('a') || e.target.closest('.submit-btn')) return;
        const isExpanding = !this.classList.contains('mobile-expanded');
        this.classList.toggle('mobile-expanded');
        if (isExpanding && selectedCard) {
          selectedCard.classList.remove('expanded');
          selectedCard.style.maxHeight = '';
        }
      };
      // 移动端 "收起" 按钮关闭展开态
      const closeBtn = document.getElementById('introCloseBtn');
      if (closeBtn) {
        closeBtn.addEventListener('click', function(e) {
          e.stopPropagation();
          introCard.classList.remove('mobile-expanded');
        });
      }
    }
    const sheetHandle = document.getElementById('mobileSheetHandle');
    if (selectedCard && sheetHandle) {
      let startY = 0, startHeight = 0, isDragging = false;
      const minHeight = () => Math.round(window.innerHeight * 0.35);
      const maxHeight = () => Math.round(window.innerHeight * 0.85);
      function onDragMove(clientY) {
        if (!isDragging) return;
        const delta = startY - clientY;
        let newHeight = startHeight + delta;
        newHeight = Math.max(minHeight(), Math.min(maxHeight(), newHeight));
        selectedCard.style.maxHeight = newHeight + 'px';
        selectedCard.style.transition = 'none';
        if (newHeight >= maxHeight() - 20) selectedCard.classList.add('expanded');
        else if (newHeight <= minHeight() + 20) selectedCard.classList.remove('expanded');
      }
      function onDragStart(clientY) {
        isDragging = true;
        startY = clientY;
        startHeight = selectedCard.getBoundingClientRect().height;
        selectedCard.style.transition = 'none';
      }
      function onDragEnd() {
        if (!isDragging) return;
        isDragging = false;
        selectedCard.style.transition = '';
        const currentHeight = selectedCard.getBoundingClientRect().height;
        const midPoint = (minHeight() + maxHeight()) / 2;
        if (currentHeight >= midPoint) {
          selectedCard.classList.add('expanded');
          selectedCard.style.maxHeight = maxHeight() + 'px';
        } else {
          selectedCard.classList.remove('expanded');
          selectedCard.style.maxHeight = minHeight() + 'px';
        }
      }
      sheetHandle.addEventListener('touchstart', (e) => { const touch = e.touches[0]; if (touch) onDragStart(touch.clientY); }, { passive: false });
      sheetHandle.addEventListener('touchmove', (e) => { const touch = e.touches[0]; if (touch) onDragMove(touch.clientY); e.preventDefault(); }, { passive: false });
      sheetHandle.addEventListener('touchend', onDragEnd);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

// ==========================================
// tooltip 绑定函数
// ==========================================
function bindMapTooltip() {
    const nameMap = {
        'hlj': '黑龙江', 'jl': '吉林', 'ln': '辽宁', 'hb': '河北', 'sd': '山东',
        'js': '江苏', 'zj': '浙江', 'ah': '安徽', 'hn': '河南', 'sx': '山西',
        'snx': '陕西', 'gs': '甘肃', 'hub': '湖北', 'jx': '江西', 'hun': '湖南',
        'gz': '贵州', 'sc': '四川', 'yn': '云南', 'qh': '青海', 'han': '海南',
        'cq': '重庆', 'tj': '天津', 'bj': '北京', 'nx': '宁夏', 'im': '内蒙古',
        'gx': '广西', 'xj': '新疆', 'tb': '西藏', 'sh': '上海', 'fj': '福建',
        'gd': '广东', 'hk': '香港', 'mc': '澳门', 'tw': '台湾',
        'JP-01': '北海道', 'JP-02': '青森県', 'JP-03': '岩手県', 'JP-04': '宮城県',
        'JP-05': '秋田県', 'JP-06': '山形県', 'JP-07': '福島県', 'JP-08': '茨城県',
        'JP-09': '栃木県', 'JP-10': '群馬県', 'JP-11': '埼玉県', 'JP-12': '千葉県',
        'JP-13': '東京都', 'JP-14': '神奈川県', 'JP-15': '新潟県', 'JP-16': '富山県',
        'JP-17': '石川県', 'JP-18': '福井県', 'JP-19': '山梨県', 'JP-20': '長野県',
        'JP-21': '岐阜県', 'JP-22': '静岡県', 'JP-23': '愛知県', 'JP-24': '三重県',
        'JP-25': '滋賀県', 'JP-26': '京都府', 'JP-27': '大阪府', 'JP-28': '兵庫県',
        'JP-29': '奈良県', 'JP-30': '和歌山県', 'JP-31': '鳥取県', 'JP-32': '島根県',
        'JP-33': '岡山県', 'JP-34': '広島県', 'JP-35': '山口県', 'JP-36': '徳島県',
        'JP-37': '香川県', 'JP-38': '愛媛県', 'JP-39': '高知県', 'JP-40': '福岡県',
        'JP-41': '佐賀県', 'JP-42': '長崎県', 'JP-43': '熊本県', 'JP-44': '大分県',
        'JP-45': '宮崎県', 'JP-46': '鹿児島県', 'JP-47': '沖縄県'
    };
    
    const tooltip = document.getElementById('tooltip');
    if (!tooltip) return;
    
    const provinces = document.querySelectorAll('.province');
    provinces.forEach(p => {
        const newP = p.cloneNode(true);
        p.parentNode.replaceChild(newP, p);
        newP.addEventListener('mouseenter', (e) => {
            const name = nameMap[newP.id] || newP.id;
            tooltip.innerHTML = `<div class="tooltip-name">${name}</div>`;
            tooltip.style.opacity = '0.9';
            tooltip.style.left = (e.pageX + 10) + 'px';
            tooltip.style.top = (e.pageY + 10) + 'px';
        });
        newP.addEventListener('mouseleave', () => {
            tooltip.style.opacity = '0';
        });
    });
    
    console.log('✅ tooltip 已绑定，共', provinces.length, '个区域');
}

// ==========================================
// 启动应用
// ==========================================
// ==========================================
// 启动应用 - 同时加载所有数据源
// ==========================================
async function init() {
    console.log('🚀 初始化应用...');
    
    initThemePreference();
    bindAllStaticEvents();
    bindMobileSheetResize();
    applyMobileModeLayout();
    
    // 先并行加载数据
    console.log('📡 加载数据中...');
    await Promise.all([
        loadChinaData(),
        loadJapanData()
    ]);
    await loadPublications();
    await loadClubDataForPublications();
    console.log('✅ 数据加载完成 - 中国:', State.bandoriRows.length, '日本:', State.japanRows.length);
    
    // 数据加载完成后再渲染地图
    State.currentCountry = 'china';

    const svgEl = document.getElementById('mapSvg');
    if (svgEl) {
    svgEl.innerHTML = '';
    renderChinaMap();
    // 默认显示国内同好会列表
    State.currentDetailProvinceName = '国内同好会';
    State.currentDetailRows = State.bandoriRows.filter(item => !getClubProvinceNames(item).includes('海外'));
    State.listSort = 'default';
    updateSortButtonView();
    renderCurrentDetail();
    window.__vnfestMapReady = true;
    window.dispatchEvent(new CustomEvent('vnfest:map-ready'));
}
    // 其他初始化...
    initAdminEvents();
    openClubEditFromUrl();
    initPublicationEvents();
    initTopUserBar();
    initMobileDrawer();

    // 语言设置
    const savedLang = localStorage.getItem('language');
    if (savedLang === 'ja') {
        currentLang = 'ja';
    }
    updateUILanguage();
    
    const zhBtn = document.getElementById('langZhBtn');
    const jaBtn = document.getElementById('langJaBtn');
    if (zhBtn) {
        zhBtn.onclick = function() {
            currentLang = 'zh';
            localStorage.setItem('language', 'zh');
            updateUILanguage();
            renderCurrentDetail();
        };
    }
    if (jaBtn) {
        jaBtn.onclick = function() {
            currentLang = 'ja';
            localStorage.setItem('language', 'ja');
            updateUILanguage();
            renderCurrentDetail();
        };
    }
    
    setTimeout(bindMapTooltip, 1000);
}

// 专门加载中国数据的函数
async function loadChinaData() {
    try {
        const resp = await fetch('./api/clubs.php', { credentials: 'same-origin' });
        if (resp.ok) {
            const json = await resp.json();
            if (json?.data && Array.isArray(json.data)) {
                State.bandoriRows = json.data;
                State.currentDataSource = __('sourceLocalJSON');
                
                // 构建省份分组
                State.provinceGroupsMap = new Map();
                State.bandoriRows.forEach(item => addClubToProvinceMap(State.provinceGroupsMap, item));
                console.log('中国数据分组完成，省份数:', State.provinceGroupsMap.size);
                return true;
            }
        }
        // 如果本地文件不存在，使用示例数据
        useMockChinaData();
        return false;
    } catch (e) {
        console.error('中国数据加载失败:', e);
        useMockChinaData();
        return false;
    }
}

// 中国模拟数据（备用）
function useMockChinaData() {
    State.bandoriRows = [
        { id: 1, name: "北京大学视觉小说同好会", province: "北京", info: "123456789", type: "school", created_at: "2023-01-01", verified: 1, external_links: "B站: https://space.bilibili.com/3494366688704339\n微博: https://weibo.com/u/7890123456" },
        { id: 2, name: "清华大学Gal社", province: "北京", info: "987654321", type: "school", created_at: "2023-02-01", verified: 1 },
        { id: 3, name: "复旦大学Galgame同好会", province: "上海", info: "111222333", type: "school", created_at: "2023-03-01", verified: 1, external_links: "B站: https://space.bilibili.com/3494366688704339" },
        { id: 4, name: "浙江大学视觉小说社", province: "浙江", info: "444555666", type: "school", created_at: "2023-04-01", verified: 1 },
        { id: 231, name: "University of New South Wales Visual Novel Club", province: "海外", info: "https://discord.gg/M7wKYHeRk4", type: "school", created_at: "2026-05-10", verified: 1, school: "University of New South Wales", external_links: "" }
    ];
    State.currentDataSource = __('sourceMock');

    // 构建省份分组
    State.provinceGroupsMap = new Map();
    State.bandoriRows.forEach(item => addClubToProvinceMap(State.provinceGroupsMap, item));
    console.log('使用中国模拟数据，共', State.bandoriRows.length, '条');
}

// 修改原有 reloadBandoriData，改为调用 loadChinaData
async function reloadBandoriData() {
    return loadChinaData();
}

// 修改原有 loadJapanData，确保数据加载后同时构建分组
async function loadJapanData() {
    try {
        const resp = await fetch('./api/clubs_japan.php', { credentials: 'same-origin' });
        if (resp.ok) {
            const json = await resp.json();
            if (json?.data && Array.isArray(json.data)) {
                State.japanRows = json.data;
                // 构建日本县分组
                State.japanGroupsMap = new Map();
                State.japanRows.forEach(item => {
                    const prefecture = item.prefecture || item.province;
                    if (!prefecture) return;
                    if (!State.japanGroupsMap.has(prefecture)) {
                        State.japanGroupsMap.set(prefecture, []);
                    }
                    State.japanGroupsMap.get(prefecture).push(item);
                });
                console.log('日本数据分组完成，县数:', State.japanGroupsMap.size);
                return true;
            }
        }
        // 使用模拟数据
        useMockJapanData();
        return false;
    } catch (e) {
        console.log('日本数据加载失败，使用模拟数据:', e);
        useMockJapanData();
        return false;
    }
}

// 加载提示函数
let loadingToast = null;
function showLoadingToast(message) {
    // 创建加载提示元素
    if (!loadingToast) {
        loadingToast = document.createElement('div');
        loadingToast.id = 'globalLoadingToast';
        loadingToast.style.cssText = `
            position: fixed;
            bottom: 100px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0,0,0,0.8);
            color: white;
            padding: 12px 24px;
            border-radius: 40px;
            font-size: 14px;
            z-index: 10000;
            display: flex;
            align-items: center;
            gap: 12px;
            backdrop-filter: blur(8px);
        `;
        document.body.appendChild(loadingToast);
    }
    loadingToast.innerHTML = `
        <div style="width: 20px; height: 20px; border: 2px solid rgba(255,255,255,0.3); border-top-color: white; border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
        <span>${message}</span>
    `;
    loadingToast.style.display = 'flex';
}

function hideLoadingToast() {
    if (loadingToast) {
        loadingToast.style.display = 'none';
    }
}

init();

// ==========================================
// 通知系统
// ==========================================
(function () {
    'use strict';

    // ---- DOM refs ----
    var bellWrap = document.getElementById('notifBellWrap');
    var bell = document.getElementById('notifBell');
    var badge = document.getElementById('notifBadge');
    var panel = document.getElementById('notifPanel');
    var panelList = document.getElementById('notifPanelList');
    var markAllBtn = document.getElementById('notifMarkAllRead');

    // ---- state ----
    var pollTimer = null;
    var POLL_INTERVAL = 5000;
    var isPanelOpen = false;
    var currentNotifPage = 1;

    // ---- helpers ----
    function getNotifIcon(type) {
        var icons = {
            galonly_approved: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
            galonly_rejected: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
            join_approved: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><polyline points="17 11 19 13 23 9"/></svg>',
            join_rejected: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="18" y1="8" x2="23" y2="13"/><line x1="23" y1="8" x2="18" y2="13"/></svg>',
            member_kicked: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="23" y1="11" x2="17" y2="11"/></svg>',
            role_changed: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
            system: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
        };
        return icons[type] || icons.system;
    }
    function getNotifIconClass(type) {
        if (type.indexOf('approved') !== -1) return 'approved';
        if (type.indexOf('rejected') !== -1) return 'rejected';
        if (type.indexOf('join') !== -1 || type.indexOf('kicked') !== -1) return 'join';
        if (type.indexOf('role') !== -1) return 'role';
        return 'system';
    }
    function matchesFilter(notif, filter) {
        if (filter === 'all') return true;
        if (filter === 'audit') return notif.type.indexOf('galonly') !== -1;
        if (filter === 'club') return notif.type.indexOf('join') !== -1 || notif.type.indexOf('kicked') !== -1 || notif.type.indexOf('role') !== -1;
        if (filter === 'system') return notif.type === 'system';
        return true;
    }
    function formatTime(dateStr) {
        try {
            var d = new Date(dateStr);
            if (isNaN(d.getTime())) return '';
            var now = new Date();
            var diff = Math.floor((now - d) / 1000);
            if (diff < 60) return '刚刚';
            if (diff < 3600) return Math.floor(diff / 60) + '分钟前';
            if (diff < 86400) return Math.floor(diff / 3600) + '小时前';
            if (diff < 2592000) return Math.floor(diff / 86400) + '天前';
            return d.getFullYear() + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + String(d.getDate()).padStart(2, '0');
        } catch (e) { return ''; }
    }
    function escapeHtml(str) {
        if (!str) return '';
        var div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    }

    // ---- API ----
    function fetchUnreadCount() {
        return fetch('api/notifications.php?action=count_unread', { credentials: 'same-origin' })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (data.success) return data.count;
                return 0;
            })
            .catch(function () { return 0; });
    }
    function fetchNotifications(page, limit) {
        return fetch('api/notifications.php?action=list&page=' + page + '&limit=' + (limit || 20), { credentials: 'same-origin' })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (data.success) return data;
                return { notifications: [], unread_count: 0, total: 0, page: 1, total_pages: 1 };
            })
            .catch(function () { return { notifications: [], unread_count: 0, total: 0, page: 1, total_pages: 1 }; });
    }
    function markNotificationRead(id) {
        return fetch('api/notifications.php?action=mark_read', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: id })
        }).then(function (r) { return r.json(); });
    }
    function markAllNotificationsRead() {
        return fetch('api/notifications.php?action=mark_all_read', {
            method: 'POST',
            credentials: 'same-origin'
        }).then(function (r) { return r.json(); });
    }

    // ---- badge ----
    function updateBadge(count) {
        if (!badge) return;
        if (count > 0) {
            badge.textContent = count > 99 ? '99+' : count;
            badge.style.display = '';
            badge.style.transform = 'scale(1)';
        } else {
            badge.style.display = 'none';
        }
    }

    // ---- render dropdown ----
    function renderDropdown(notifications) {
        if (!panelList) return;
        if (!notifications || notifications.length === 0) {
            panelList.innerHTML = '<div class="notif-empty"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="1.5"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg><span>暂无通知</span></div>';
            return;
        }
        panelList.innerHTML = notifications.map(function (n) {
            return '<div class="notif-item' + (n.is_read ? ' read' : '') +
                '" data-id="' + n.id + '" data-type="' + escapeHtml(n.type) +
                '" data-title="' + escapeHtml(n.title) +
                '" data-message="' + escapeHtml(n.message || '') +
                '" data-time="' + (n.created_at || '') + '">' +
                '<span class="notif-dot"></span>' +
                '<div class="notif-icon ' + getNotifIconClass(n.type) + '">' + getNotifIcon(n.type) + '</div>' +
                '<div class="notif-content">' +
                '<div class="notif-title">' + escapeHtml(n.title) + '</div>' +
                (n.message ? '<div class="notif-message">' + escapeHtml(n.message) + '</div>' : '') +
                '</div>' +
                '<span class="notif-time">' + formatTime(n.created_at) + '</span>' +
                '</div>';
        }).join('');
    }

    // ---- panel open/close ----
    function toggleNotifPanel(e) {
        if (e) e.stopPropagation();
        if (isPanelOpen) {
            closeNotifPanel();
        } else {
            openNotifPanel();
        }
    }
    function openNotifPanel() {
        if (!panel) return;
        isPanelOpen = true;
        panel.classList.add('open');
        // mobile: prevent parent overflow:hidden from clipping the dropdown
        var infoCard = document.getElementById('userInfoCard');
        if (infoCard) infoCard.classList.add('notif-open');
        fetchNotifications(1, 5).then(function (data) {
            renderDropdown(data.notifications);
        });
    }
    function closeNotifPanel() {
        if (!panel) return;
        isPanelOpen = false;
        panel.classList.remove('open');
        var infoCard = document.getElementById('userInfoCard');
        if (infoCard) infoCard.classList.remove('notif-open');
    }

    // ---- detail dialog ----
    var detailOverlay = null;
    var detailDialog = null;

    function openNotifDetail(title, message, type, time) {
        if (!detailOverlay) {
            detailOverlay = document.createElement('div');
            detailOverlay.className = 'notif-detail-overlay';
            detailOverlay.addEventListener('click', function (e) {
                if (e.target === detailOverlay) closeNotifDetail();
            });
            document.body.appendChild(detailOverlay);
        }
        if (!detailDialog) {
            detailDialog = document.createElement('div');
            detailDialog.className = 'notif-detail-dialog';
            detailOverlay.appendChild(detailDialog);
        }
        var typeLabels = {
            galonly_approved: '审核通过', galonly_rejected: '审核拒绝',
            join_approved: '加入通过', join_rejected: '加入拒绝',
            member_kicked: '已移出', role_changed: '角色变更', system: '系统通知'
        };
        var typeLabel = typeLabels[type] || type;
        var iconClass = getNotifIconClass(type);
        detailDialog.innerHTML =
            '<div class="notif-detail-header">' +
            '<div class="notif-icon ' + iconClass + '">' + getNotifIcon(type) + '</div>' +
            '<h3>' + escapeHtml(title) + '</h3>' +
            '<button class="notif-detail-close" id="notifDetailClose">✕</button>' +
            '</div>' +
            '<div class="notif-detail-body">' +
            (message ? '<div class="notif-detail-message">' + escapeHtml(message) + '</div>' : '') +
            '<div class="notif-detail-meta">' +
            '<span class="notif-detail-type">' + escapeHtml(typeLabel) + '</span>' +
            '<span class="notif-detail-time">' + formatTime(time) + '</span>' +
            '</div>' +
            '</div>' +
            '<div class="notif-detail-footer">' +
            '<button class="notif-detail-btn ghost" id="notifDetailDismiss">关闭</button>' +
            '<button class="notif-detail-btn primary" id="notifDetailAction">查看详情 →</button>' +
            '</div>';
        detailOverlay.style.display = '';
        requestAnimationFrame(function () {
            detailOverlay.classList.add('open');
        });
        // close buttons
        var closeBtn = document.getElementById('notifDetailClose');
        if (closeBtn) closeBtn.addEventListener('click', closeNotifDetail);
        var dismissBtn = document.getElementById('notifDetailDismiss');
        if (dismissBtn) dismissBtn.addEventListener('click', closeNotifDetail);
    }
    function closeNotifDetail() {
        if (detailOverlay) {
            detailOverlay.classList.remove('open');
            setTimeout(function () { detailOverlay.style.display = 'none'; }, 200);
        }
    }

    // ---- notification center ----
    var centerOverlay = document.getElementById('notifCenterOverlay');
    var centerList = document.getElementById('notifCenterList');
    var centerPagination = document.getElementById('notifCenterPagination');
    var centerCurrentFilter = 'all';
    var centerSelected = {};
    var centerData = [];

    function openNotifCenter() {
        if (!centerOverlay) return;
        closeNotifPanel();
        centerOverlay.style.display = '';
        requestAnimationFrame(function () {
            centerOverlay.classList.add('open');
        });
        loadCenterPage(1);
        document.body.style.overflow = 'hidden';
    }
    function closeNotifCenter() {
        if (!centerOverlay) return;
        centerOverlay.classList.remove('open');
        setTimeout(function () { centerOverlay.style.display = 'none'; document.body.style.overflow = ''; }, 200);
    }
    function switchCenterFilter(filter) {
        centerCurrentFilter = filter;
        centerSelected = {};
        updateSelectAllBtn();
        loadCenterPage(1);
        // update tab
        var tabs = centerOverlay.querySelectorAll('.notif-center-tab');
        tabs.forEach(function (t) { t.classList.toggle('active', t.dataset.filter === filter); });
    }
    function loadCenterPage(page) {
        if (!centerList) return;
        currentNotifPage = page;
        centerList.innerHTML = '<div class="notif-center-loading" style="text-align:center;padding:40px;opacity:0.5;">加载中...</div>';
        fetchNotifications(page, 20).then(function (data) {
            centerData = data.notifications || [];
            renderCenter(centerData, data.total_pages, page);
        });
    }
    function renderCenter(notifications, totalPages, page) {
        if (!centerList || !centerPagination) return;
        // filter
        var filtered = notifications.filter(function (n) { return matchesFilter(n, centerCurrentFilter); });
        if (filtered.length === 0) {
            centerList.innerHTML = '<div class="notif-empty" style="padding:60px 0;"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="1.5"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg><span>暂无通知</span></div>';
            centerPagination.innerHTML = '';
            updateTabCounts(notifications);
            return;
        }
        var html = filtered.map(function (n) {
            var checked = centerSelected[n.id] ? ' checked' : '';
            return '<div class="notif-item' + (n.is_read ? ' read' : '') +
                '" data-id="' + n.id + '" data-type="' + escapeHtml(n.type) +
                '" data-title="' + escapeHtml(n.title) +
                '" data-message="' + escapeHtml(n.message || '') +
                '" data-time="' + (n.created_at || '') + '">' +
                '<label class="notif-center-cb" onclick="event.stopPropagation()"><input type="checkbox" class="notif-cb" value="' + n.id + '"' + checked + '></label>' +
                '<span class="notif-dot"></span>' +
                '<div class="notif-icon ' + getNotifIconClass(n.type) + '">' + getNotifIcon(n.type) + '</div>' +
                '<div class="notif-content">' +
                '<div class="notif-title">' + escapeHtml(n.title) + '</div>' +
                (n.message ? '<div class="notif-message">' + escapeHtml(n.message) + '</div>' : '') +
                '</div>' +
                '<span class="notif-time">' + formatTime(n.created_at) + '</span>' +
                '</div>';
        }).join('');
        centerList.innerHTML = html;
        // pagination
        var pagHtml = '';
        if (page > 1) pagHtml += '<button class="notif-page-btn" data-page="' + (page - 1) + '">上一页</button>';
        pagHtml += '<span class="notif-page-info">' + page + ' / ' + (totalPages || 1) + '</span>';
        if (page < totalPages) pagHtml += '<button class="notif-page-btn" data-page="' + (page + 1) + '">下一页</button>';
        centerPagination.innerHTML = pagHtml;
        updateTabCounts(notifications);
        // rebind pagination
        centerPagination.querySelectorAll('.notif-page-btn').forEach(function (btn) {
            btn.addEventListener('click', function () { loadCenterPage(parseInt(this.dataset.page)); });
        });
        // rebind checkboxes
        centerList.querySelectorAll('.notif-cb').forEach(function (cb) {
            cb.addEventListener('change', function () {
                if (this.checked) centerSelected[this.value] = true;
                else delete centerSelected[this.value];
                updateSelectAllBtn();
            });
        });
    }
    function updateTabCounts(notifications) {
        var counts = { all: notifications.length, audit: 0, club: 0, system: 0 };
        notifications.forEach(function (n) {
            if (n.type.indexOf('galonly') !== -1) counts.audit++;
            else if (n.type.indexOf('join') !== -1 || n.type.indexOf('kicked') !== -1 || n.type.indexOf('role') !== -1) counts.club++;
            else if (n.type === 'system') counts.system++;
        });
        centerOverlay.querySelectorAll('.notif-center-tab').forEach(function (tab) {
            var filter = tab.dataset.filter;
            var countEl = tab.querySelector('.notif-center-tab-count');
            if (countEl) countEl.textContent = counts[filter] || 0;
        });
    }
    function updateSelectAllBtn() {
        var btn = document.getElementById('notifCenterSelectAll');
        if (!btn) return;
        var allCbs = centerList.querySelectorAll('.notif-cb');
        var checkedCbs = centerList.querySelectorAll('.notif-cb:checked');
        btn.textContent = (allCbs.length > 0 && allCbs.length === checkedCbs.length) ? '取消全选' : '全选';
    }
    function toggleSelectAll() {
        var allCbs = centerList.querySelectorAll('.notif-cb');
        var checkedCbs = centerList.querySelectorAll('.notif-cb:checked');
        var selectAll = allCbs.length !== checkedCbs.length;
        allCbs.forEach(function (cb) {
            cb.checked = selectAll;
            if (selectAll) centerSelected[cb.value] = true;
            else delete centerSelected[cb.value];
        });
        updateSelectAllBtn();
    }
    function batchMarkRead() {
        var ids = Object.keys(centerSelected);
        if (ids.length === 0) return;
        Promise.all(ids.map(function (id) { return markNotificationRead(id); })).then(function () {
            centerSelected = {};
            loadCenterPage(currentNotifPage);
            checkNotifications();
        });
    }

    // ---- polling ----
    function checkNotifications() {
        fetchUnreadCount().then(function (count) {
            updateBadge(count);
        });
    }
    function startNotificationPolling() {
        stopNotificationPolling();
        checkNotifications();
        pollTimer = setInterval(checkNotifications, POLL_INTERVAL);
    }
    function stopNotificationPolling() {
        if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
        }
    }

    // ---- visibility ----
    document.addEventListener('visibilitychange', function () {
        if (document.hidden) {
            stopNotificationPolling();
        } else if (bellWrap && bellWrap.style.display !== 'none') {
            startNotificationPolling();
        }
    });

    // ---- event delegation ----
    // bell click
    if (bell) {
        bell.addEventListener('click', toggleNotifPanel);
    }
    // outside click close panel
    document.addEventListener('click', function (e) {
        if (isPanelOpen && bellWrap && !bellWrap.contains(e.target)) {
            closeNotifPanel();
        }
    });
    // mark all read (dropdown)
    if (markAllBtn) {
        markAllBtn.addEventListener('click', function () {
            markAllNotificationsRead().then(function () {
                checkNotifications();
                renderDropdown([]);
            });
        });
    }
    // view all
    var viewAllBtn = document.getElementById('notifViewAll');
    if (viewAllBtn) {
        viewAllBtn.addEventListener('click', openNotifCenter);
    }
    // panel item click → detail (event delegation)
    if (panelList) {
        panelList.addEventListener('click', function (e) {
            var item = e.target.closest('.notif-item');
            if (!item) return;
            var id = parseInt(item.dataset.id);
            var title = item.dataset.title || '';
            var message = item.dataset.message || '';
            var type = item.dataset.type || 'system';
            var time = item.dataset.time || '';
            // mark read
            if (item.classList.contains('read')) {
                // already read, just show detail
                openNotifDetail(title, message, type, time);
                return;
            }
            markNotificationRead(id).then(function () {
                item.classList.add('read');
                checkNotifications();
            });
            openNotifDetail(title, message, type, time);
        });
    }
    // center close
    var centerClose = document.getElementById('notifCenterClose');
    if (centerClose) centerClose.addEventListener('click', closeNotifCenter);
    if (centerOverlay) {
        centerOverlay.addEventListener('click', function (e) {
            if (e.target === centerOverlay) closeNotifCenter();
        });
    }
    // center tabs (event delegation)
    if (centerOverlay) {
        centerOverlay.addEventListener('click', function (e) {
            var tab = e.target.closest('.notif-center-tab');
            if (tab) switchCenterFilter(tab.dataset.filter);
        });
    }
    // center mark all read
    var centerMarkAll = document.getElementById('notifCenterMarkAll');
    if (centerMarkAll) {
        centerMarkAll.addEventListener('click', function () {
            markAllNotificationsRead().then(function () {
                checkNotifications();
                loadCenterPage(currentNotifPage);
            });
        });
    }
    // center select all
    var centerSelectAll = document.getElementById('notifCenterSelectAll');
    if (centerSelectAll) {
        centerSelectAll.addEventListener('click', toggleSelectAll);
    }
    // center batch read
    var centerBatchRead = document.getElementById('notifCenterBatchRead');
    if (centerBatchRead) {
        centerBatchRead.addEventListener('click', batchMarkRead);
    }
    // center item click (event delegation)
    if (centerList) {
        centerList.addEventListener('click', function (e) {
            // ignore checkbox clicks
            if (e.target.closest('.notif-center-cb')) return;
            var item = e.target.closest('.notif-item');
            if (!item) return;
            var id = parseInt(item.dataset.id);
            var title = item.dataset.title || '';
            var message = item.dataset.message || '';
            var type = item.dataset.type || 'system';
            var time = item.dataset.time || '';
            var cb = item.querySelector('.notif-cb');
            if (cb) {
                cb.checked = !cb.checked;
                if (cb.checked) centerSelected[id] = true;
                else delete centerSelected[id];
                updateSelectAllBtn();
            }
            // mark read + detail
            if (item.classList.contains('read')) {
                openNotifDetail(title, message, type, time);
                return;
            }
            markNotificationRead(id).then(function () {
                item.classList.add('read');
                checkNotifications();
            });
            openNotifDetail(title, message, type, time);
        });
    }

    // ---- auth listener ----
    document.addEventListener('auth:updated', function () {
        // bell visibility handled in updateUserUI
        if (bellWrap && bellWrap.style.display !== 'none') {
            startNotificationPolling();
        } else {
            stopNotificationPolling();
        }
    });
    // initial check if already visible (bell from updateUserUI)
    if (bellWrap && bellWrap.style.display !== 'none') {
        startNotificationPolling();
    }

})();

// =============================================
// 全站公告横幅
// =============================================
(function () {
    var banner = document.getElementById('announcementBanner');
    var body = document.getElementById('announcementBannerBody');
    var toggle = document.getElementById('announcementBannerToggle');
    var arrow = document.getElementById('announcementBannerArrow');

    if (!banner || !body || !toggle || !arrow) return;

    // 折叠状态
    var LS_KEY = 'announcement_banner_collapsed';
    var isCollapsed = localStorage.getItem(LS_KEY) === '1';

    function applyCollapse() {
        body.classList.toggle('collapsed', isCollapsed);
        arrow.classList.toggle('collapsed', isCollapsed);
    }
    applyCollapse();

    toggle.addEventListener('click', function () {
        isCollapsed = !isCollapsed;
        localStorage.setItem(LS_KEY, isCollapsed ? '1' : '0');
        applyCollapse();
    });

    // 加载活跃公告
    function loadActiveAnnouncements() {
        fetch('api/announcements.php?action=active', { credentials: 'same-origin' })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (data.success && data.announcements && data.announcements.length > 0) {
                    renderAnnouncements(data.announcements);
                    banner.style.display = '';
                    // 同步列表模式的顶部公告横幅
                    var listBanner = document.getElementById('listAnnBanner');
                    if (listBanner) listBanner.style.display = '';
                    // 如果列表模式已激活，同步渲染列表公告
                    if (typeof renderListAnnouncements === 'function') {
                        renderListAnnouncements();
                    }
                } else {
                    banner.style.display = 'none';
                }
            })
            .catch(function () {
                banner.style.display = 'none';
            });
    }

    function fmtTime(dateStr) {
        try {
            var d = new Date(dateStr);
            if (isNaN(d.getTime())) return '';
            var now = new Date();
            var diff = Math.floor((now - d) / 1000);
            if (diff < 60) return '刚刚';
            if (diff < 3600) return Math.floor(diff / 60) + '分钟前';
            if (diff < 86400) return Math.floor(diff / 3600) + '小时前';
            if (diff < 2592000) return Math.floor(diff / 86400) + '天前';
            return d.getFullYear() + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + String(d.getDate()).padStart(2, '0');
        } catch (e) { return ''; }
    }

    function renderAnnouncements(list) {
        var typeLabels = { info: '信息', warning: '警告', important: '重要', update: '更新' };
        body.innerHTML = list.map(function (a) {
            var typeClass = 'announcement-type-' + (a.type || 'info');
            var typeLabel = typeLabels[a.type] || a.type || '信息';
            var text = (a.content || '').replace(/<[^>]*>/g, '');
            var dateStr = a.published_at || a.created_at || '';
            var dateDisplay = dateStr ? dateStr.split(' ')[0] : '';
            return '<div class="announcement-item ' + typeClass + '" data-id="' + a.id +
                '" data-title="' + escapeHtml(a.title) +
                '" data-content="' + escapeHtml(a.content) +
                '" data-type="' + escapeHtml(a.type || 'info') +
                '" data-time="' + dateStr + '">' +
                '<div class="announcement-item-border"></div>' +
                '<div class="announcement-item-content">' +
                '<div class="announcement-item-title">' + escapeHtml(a.title) + '</div>' +
                '<div class="announcement-item-date">' + dateDisplay + '</div>' +
                '</div>' +
                '<span class="announcement-item-type-badge type-badge-' + (a.type || 'info') + '">' + typeLabel + '</span>' +
                '</div>';
        }).join('');
    }

    // 点击公告弹出详情
    var announceOverlay = null;
    var announceDialog = null;

    function openAnnounceDetail(title, content, time) {
        if (!announceOverlay) {
            announceOverlay = document.createElement('div');
            announceOverlay.className = 'notif-detail-overlay';
            announceOverlay.addEventListener('click', function (e) {
                if (e.target === announceOverlay) closeAnnounceDetail();
            });
            document.body.appendChild(announceOverlay);
        }
        if (!announceDialog) {
            announceDialog = document.createElement('div');
            announceDialog.className = 'notif-detail-dialog';
            announceOverlay.appendChild(announceDialog);
        }
        announceDialog.innerHTML =
            '<button class="notif-detail-close" id="announceDetailClose">✕</button>' +
            '<div class="notif-detail-icon system" style="margin:0 auto 12px;width:48px;height:48px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:rgba(59,130,246,0.12);color:#3b82f6;font-size:22px;">📢</div>' +
            '<div class="notif-detail-type">全站公告</div>' +
            '<div class="notif-detail-title">' + escapeHtml(title) + '</div>' +
            (content ? '<div class="notif-detail-msg">' + escapeHtml(content) + '</div>' : '') +
            '<div class="notif-detail-time">' + fmtTime(time) + '</div>';
        announceOverlay.style.display = '';
        requestAnimationFrame(function () {
            announceOverlay.classList.add('open');
        });
        var closeBtn = document.getElementById('announceDetailClose');
        if (closeBtn) closeBtn.addEventListener('click', closeAnnounceDetail);
    }
    function closeAnnounceDetail() {
        if (announceOverlay) {
            announceOverlay.classList.remove('open');
            setTimeout(function () { announceOverlay.style.display = 'none'; }, 200);
        }
    }

    body.addEventListener('click', function (e) {
        var item = e.target.closest('.announcement-item');
        if (!item) return;
        var title = item.dataset.title || '';
        var content = item.dataset.content || '';
        var time = item.dataset.time || '';
        openAnnounceDetail(title, content, time);
    });

    // 监听登录状态
    document.addEventListener('auth:updated', function () {
        if (currentUser && currentUser.logged_in) {
            loadActiveAnnouncements();
        } else {
            banner.style.display = 'none';
        }
    });

    // 初始加载（不分登录状态，公开公告可见）
    loadActiveAnnouncements();
})();
