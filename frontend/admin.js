/**
 * 暗门管理员权限系统
 * 触发方式：连续点击顶部Logo 5次（3秒内）
 */

const PWD_KEY = "tft_admin_pwd";
const AUTH_KEY = "tft_admin_auth";
const DEFAULT_PWD = "TFT金铲铲星神水友赛";

// ========== 初始化 ==========
function initAdmin() {
    try {
        localStorage.setItem(PWD_KEY, DEFAULT_PWD);
    } catch(e) {}
    
    var trigger = document.getElementById("admin-trigger");
    if (trigger) {
        trigger.addEventListener("click", onLogoClick);
        trigger.addEventListener("touchend", function(e) {
            e.preventDefault();
            onLogoClick();
        });
    }
    
    checkAdminAuth();
    console.log("[Admin] 暗门系统已初始化，连续点击Logo 5次触发");
}

// ========== Logo点击计数 ==========
var clickCount = 0;
var clickTimer = null;

function onLogoClick() {
    clickCount++;
    console.log("[Admin] Logo点击次数:", clickCount);
    
    if (clickCount >= 5) {
        clickCount = 0;
        if (clickTimer) clearTimeout(clickTimer);
        showAdminLogin();
        return;
    }
    
    if (clickTimer) clearTimeout(clickTimer);
    clickTimer = setTimeout(function() {
        clickCount = 0;
    }, 3000);
}

// ========== 显示管理员登录弹窗 ==========
function showAdminLogin() {
    var modal = document.getElementById("admin-login-modal");
    if (modal) {
        modal.classList.remove("hidden");
        modal.classList.add("flex");
        var input = document.getElementById("admin-password-input");
        if (input) {
            input.value = "";
            input.focus();
        }
        var msg = document.getElementById("admin-login-msg");
        if (msg) msg.textContent = "";
    }
}

// ========== 关闭管理员登录弹窗 ==========
function closeAdminLogin() {
    var modal = document.getElementById("admin-login-modal");
    if (modal) {
        modal.classList.add("hidden");
        modal.classList.remove("flex");
    }
}

// ========== 显示修改密码弹窗 ==========
function showChangePwdModal() {
    closeAdminLogin();
    var modal = document.getElementById("admin-change-pwd-modal");
    if (modal) {
        modal.classList.remove("hidden");
        modal.classList.add("flex");
        var o = document.getElementById("admin-old-pwd");
        var n = document.getElementById("admin-new-pwd");
        var c = document.getElementById("admin-confirm-pwd");
        if (o) o.value = "";
        if (n) n.value = "";
        if (c) c.value = "";
        if (o) o.focus();
        var msg = document.getElementById("admin-change-msg");
        if (msg) msg.textContent = "";
    }
}

// ========== 关闭修改密码弹窗 ==========
function closeChangePwdModal() {
    var modal = document.getElementById("admin-change-pwd-modal");
    if (modal) {
        modal.classList.add("hidden");
        modal.classList.remove("flex");
    }
}

// ========== 验证管理员密码 ==========
function verifyAdminPassword() {
    var input = document.getElementById("admin-password-input");
    var msg = document.getElementById("admin-login-msg");
    if (!input || !input.value) {
        showMsg(msg, "请输入密码", "error");
        return;
    }
    
    var stored = localStorage.getItem(PWD_KEY);
    console.log("[Admin] 输入密码:", input.value);
    console.log("[Admin] 存储密码:", stored);
    
    if (input.value === stored) {
        localStorage.setItem(AUTH_KEY, "true");
        closeAdminLogin();
        updateAdminUI(true);
        if (typeof showToast === "function") {
            showToast("管理员模式已解锁", "success");
        }
    } else {
        showMsg(msg, "密码错误，请重试", "error");
        input.value = "";
        input.focus();
    }
}

// ========== 修改密码 ==========
function changeAdminPassword() {
    var oldI = document.getElementById("admin-old-pwd");
    var newI = document.getElementById("admin-new-pwd");
    var confirmI = document.getElementById("admin-confirm-pwd");
    var msg = document.getElementById("admin-change-msg");
    
    if (!oldI || !newI || !confirmI) return;
    
    var oldVal = oldI.value;
    var newVal = newI.value;
    var confirmVal = confirmI.value;
    
    if (!oldVal || !newVal || !confirmVal) {
        showMsg(msg, "请填写所有字段", "error");
        return;
    }
    
    var stored = localStorage.getItem(PWD_KEY);
    if (oldVal !== stored) {
        showMsg(msg, "旧密码不正确", "error");
        return;
    }
    
    if (newVal !== confirmVal) {
        showMsg(msg, "两次输入的新密码不一致", "error");
        return;
    }
    
    try {
        localStorage.setItem(PWD_KEY, newVal);
        closeChangePwdModal();
        if (typeof showToast === "function") {
            showToast("密码修改成功", "success");
        }
    } catch(e) {
        showMsg(msg, "密码修改失败: " + e.message, "error");
    }
}

// ========== 检查管理员认证状态 ==========
function checkAdminAuth() {
    var auth = localStorage.getItem(AUTH_KEY);
    if (auth === "true") {
        updateAdminUI(true);
    } else {
        updateAdminUI(false);
    }
}

// ========== 更新管理员UI ==========
function updateAdminUI(isAdmin) {
    console.log("[Admin] 更新UI，管理员状态:", isAdmin);
    
    var datasheetTab = document.getElementById("tab-datasheet");
    var adminTab = document.getElementById("tab-admin");
    var playersTab = document.getElementById("tab-players");
    var statusInd = document.getElementById("admin-status-indicator");
    
    if (isAdmin) {
        if (datasheetTab) datasheetTab.classList.remove("hidden");
        if (adminTab) adminTab.classList.remove("hidden");
        if (playersTab) playersTab.classList.remove("hidden");
        if (statusInd) {
            statusInd.classList.remove("hidden");
            statusInd.classList.add("flex");
        }
    } else {
        if (datasheetTab) datasheetTab.classList.add("hidden");
        if (adminTab) adminTab.classList.add("hidden");
        if (playersTab) playersTab.classList.add("hidden");
        if (statusInd) {
            statusInd.classList.add("hidden");
            statusInd.classList.remove("flex");
        }
    }
}

// ========== 管理员退出 ==========
function adminLogout() {
    localStorage.setItem(AUTH_KEY, "false");
    updateAdminUI(false);
    if (typeof showToast === "function") {
        showToast("已退出管理员模式", "info");
    }
}

// ========== 显示消息 ==========
function showMsg(el, text, type) {
    if (!el) return;
    el.textContent = text;
    el.className = "mt-2 text-sm text-center ";
    if (type === "error") {
        el.className += "text-red-500";
    } else if (type === "success") {
        el.className += "text-green-500";
    } else {
        el.className += "text-gray-500";
    }
}

// ========== 页面加载后初始化 ==========
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAdmin);
} else {
    initAdmin();
}

console.log("[Admin] admin.js 加载完成");
