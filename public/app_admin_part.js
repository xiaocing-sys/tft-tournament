// ==================== 暗门管理员权限系统 ====================
const ADMIN_PASSWORD_KEY = 'tft_admin_pwd_hash';
const ADMIN_AUTH_KEY = 'tft_admin_authed';

// 默认管理员密码
const DEFAULT_ADMIN_PWD = 'jinchan2024';

// 初始化默认密码（如果未设置）
function initAdminPassword() {
    if (!localStorage.getItem(ADMIN_PASSWORD_KEY)) {
        localStorage.setItem(ADMIN_PASSWORD_KEY, simpleHash(DEFAULT_ADMIN_PWD));
    }
}

function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return 'h' + Math.abs(hash).toString(36);
}

// Logo点击计数器
let logoClickCount = 0;
let logoClickTimer = null;

function onAdminTriggerClick() {
    logoClickCount++;
    if (logoClickCount >= 5) {
        logoClickCount = 0;
        if (logoClickTimer) clearTimeout(logoClickTimer);
        showAdminLogin();
        return;
    }
    if (logoClickTimer) clearTimeout(logoClickTimer);
    logoClickTimer = setTimeout(() => {
        logoClickCount = 0;
    }, 3000);
}

// 检查是否已认证
function checkAdminAuth() {
    const authed = localStorage.getItem(ADMIN_AUTH_KEY) === 'true';
    updateAdminUI(authed);
    return authed;
}

function updateAdminUI(isAdmin) {
    // 显示/隐藏管理员Tab
    const dataSheetTab = document.getElementById('tab-datasheet');
    const adminTab = document.getElementById('tab-admin');
    const adminIndicator = document.getElementById('admin-status-indicator');
    const headerStatus = document.getElementById('header-status');

    if (isAdmin) {
        if (dataSheetTab) dataSheetTab.classList.remove('hidden');
        if (adminTab) adminTab.classList.remove('hidden');
        if (adminIndicator) {
            adminIndicator.classList.remove('hidden');
            adminIndicator.classList.add('flex');
        }
        if (headerStatus) headerStatus.classList.add('hidden');
    } else {
        if (dataSheetTab) dataSheetTab.classList.add('hidden');
        if (adminTab) adminTab.classList.add('hidden');
        if (adminIndicator) {
            adminIndicator.classList.add('hidden');
            adminIndicator.classList.remove('flex');
        }
        if (headerStatus) headerStatus.classList.remove('hidden');
        // 如果当前在管理员页面，强制切换回报名页
        const activeTab = document.querySelector('.tab-panel:not(.hidden)');
        if (activeTab && (activeTab.id === 'panel-datasheet' || activeTab.id === 'panel-admin')) {
            switchTab('register');
        }
    }
}

// 显示管理员登录弹窗
function showAdminLogin() {
    if (checkAdminAuth()) return;
    const modal = document.getElementById('admin-login-modal');
    if (modal) {
        modal.classList.remove('hidden');
        const input = document.getElementById('admin-password-input');
        if (input) {
            input.value = '';
            input.focus();
        }
        const msg = document.getElementById('admin-login-msg');
        if (msg) msg.classList.add('hidden');
    }
}

function closeAdminLogin() {
    const modal = document.getElementById('admin-login-modal');
    if (modal) modal.classList.add('hidden');
}

// 验证管理员密码
function verifyAdminPassword() {
    const input = document.getElementById('admin-password-input');
    const msg = document.getElementById('admin-login-msg');
    if (!input || !input.value) {
        showAdminMsg(msg, '请输入密码', 'error');
        return;
    }
    const storedHash = localStorage.getItem(ADMIN_PASSWORD_KEY);
    const inputHash = simpleHash(input.value);
    if (inputHash === storedHash) {
        localStorage.setItem(ADMIN_AUTH_KEY, 'true');
        closeAdminLogin();
        updateAdminUI(true);
        showToast('🔓 管理员模式已解锁', '✅');
    } else {
        showAdminMsg(msg, '密码错误，请重试', 'error');
        input.value = '';
        input.focus();
    }
}

function showAdminMsg(el, msg, type) {
    if (!el) return;
    el.classList.remove('hidden');
    el.textContent = msg;
    el.className = `mt-4 text-center text-sm py-2 rounded-lg ${type === 'error' ? 'bg-red-900/50 text-red-300' : 'bg-green-900/50 text-green-300'}`;
    if (type !== 'info') setTimeout(() => el.classList.add('hidden'), 5000);
}

// 退出管理员模式
function logoutAdmin() {
    localStorage.setItem(ADMIN_AUTH_KEY, 'false');
    updateAdminUI(false);
    showToast('🔒 已退出管理员模式', '✅');
}

// 打开修改密码弹窗
function openChangePwdModal() {
    const modal = document.getElementById('admin-change-pwd-modal');
    if (modal) {
        modal.classList.remove('hidden');
        document.getElementById('old-password-input').value = '';
        document.getElementById('new-password-input').value = '';
        document.getElementById('admin-change-pwd-msg').classList.add('hidden');
        document.getElementById('old-password-input').focus();
    }
}

function closeChangePwdModal() {
    const modal = document.getElementById('admin-change-pwd-modal');
    if (modal) modal.classList.add('hidden');
}

// 修改管理员密码
function changeAdminPassword() {
    const oldInput = document.getElementById('old-password-input');
    const newInput = document.getElementById('new-password-input');
    const msg = document.getElementById('admin-change-pwd-msg');
    const oldPwd = oldInput?.value;
    const newPwd = newInput?.value;

    if (!oldPwd || !newPwd) {
        showAdminMsg(msg, '请填写完整信息', 'error');
        return;
    }
    if (newPwd.length < 4) {
        showAdminMsg(msg, '新密码至少4位', 'error');
        return;
    }
    const storedHash = localStorage.getItem(ADMIN_PASSWORD_KEY);
    if (simpleHash(oldPwd) !== storedHash) {
        showAdminMsg(msg, '原密码错误', 'error');
        return;
    }
    localStorage.setItem(ADMIN_PASSWORD_KEY, simpleHash(newPwd));
    showAdminMsg(msg, '密码修改成功！', 'success');
    setTimeout(() => closeChangePwdModal(), 2000);
}
