// ==================== 配置 ====================
// 自动适配：本地开发用完整地址，Netlify 部署用相对路径
const API_BASE = (location.hostname === 'localhost' || location.port === '3001')
    ? 'http://localhost:3001'   // 本地开发：后端在 3001 端口
    : '';                        // Netlify：同源访问 /api/...

// 包装 fetch，自动携带 cookie（解决管理员认证问题）
const _originalFetch = window.fetch;
window.fetch = function(url, options = {}) {
    const isApiCall = typeof url === 'string' && (url.startsWith(API_BASE) || url.startsWith('/api/'));
    if (isApiCall) {
        options = { ...options, credentials: 'include' };
    }
    return _originalFetch.call(this, url, options);
};

// 辅助函数：修复截图 URL（兼容本地路径和远程 URL）
function fixScreenshotUrl(path) {
    if (!path) return '';
    if (path.startsWith('http')) return path;  // 完整 URL（SM.MS）
    return API_BASE + path;  // 相对路径（本地开发）
}

// ==================== 管理员登录检查 ====================
let isAdminLoggedIn = false;

async function checkLogin() {
    try {
        const res = await fetch('/api/admin/check');
        const data = await res.json();
        if (!data.loggedIn) {
            window.location.href = '/login.html';
            return false;
        }
        isAdminLoggedIn = true;
        return true;
    } catch (err) {
        console.error('登录检查失败:', err);
        return false;
    }
}

// 页面加载时检查登录状态
document.addEventListener('DOMContentLoaded', async () => {
    const loggedIn = await checkLogin();
    if (loggedIn) loadStats();
});

// ==================== Tab 切换 ====================
function switchTab(tabName) {
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
    document.querySelectorAll('.tab-btn').forEach(b => {
        b.classList.remove('tab-active');
        b.classList.add('tab-inactive');
    });
    const panel = document.getElementById(`panel-${tabName}`);
    if (panel) panel.classList.remove('hidden');
    const btn = document.getElementById(`tab-${tabName}`);
    if (btn) {
        btn.classList.remove('tab-inactive');
        btn.classList.add('tab-active');
    }
    switch (tabName) {
        case 'register': loadStats(); break;
        case 'players': loadPlayers(); break;
        case 'groups': 
            loadSeasonsForFilter(); 
            loadRounds(); 
            break;
        case 'upload': loadGroupsForUpload(); break;
        case 'bracket': loadBracket(); break;
        case 'datasheet': loadDataSheet(); break;
        case 'admin': loadPendingReviews(); break;
        case 'import-players': break;
        case 'import-results': loadRoundsForImport(); break;
    }
}

function showToast(msg, icon = '✅') {
    const toast = document.getElementById('toast');
    const toastIcon = document.getElementById('toast-icon');
    const toastText = document.getElementById('toast-text');
    if (!toast || !toastIcon || !toastText) return;
    toastText.textContent = msg;
    toastIcon.textContent = icon;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3000);
}

function showMsg(elementId, msg, type = 'info') {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.classList.remove('hidden');
    let cls = 'mt-4 text-center text-sm py-2 rounded-lg ';
    if (type === 'error') cls += 'bg-red-900/50 text-red-300';
    else if (type === 'success') cls += 'bg-green-900/50 text-green-300';
    else cls += 'bg-blue-900/50 text-blue-300';
    el.className = cls;
    el.textContent = msg;
    if (type !== 'info') setTimeout(() => el.classList.add('hidden'), 5000);
}

// ==================== 报名功能 ====================
async function submitRegistration(e) {
    e.preventDefault();
    const btn = document.getElementById('register-btn');
    btn.disabled = true;
    btn.textContent = '提交中...';
    const data = {
        game_uid: document.getElementById('reg-uid').value.trim(),
        game_nickname: document.getElementById('reg-nickname').value.trim(),
        region: document.querySelector('input[name="region"]:checked')?.value,
        contact: document.getElementById('reg-contact').value.trim()
    };
    if (!data.region) {
        showMsg('register-msg', '请选择游戏大区', 'error');
        btn.disabled = false; btn.textContent = '确认报名 🚀'; return;
    }
    try {
        const res = await fetch(`${API_BASE}/api/register`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error);
        showMsg('register-msg', '🎉 报名成功！祝你好运，弈士！', 'success');
        document.getElementById('register-form').reset();
        loadStats();
    } catch (err) {
        showMsg('register-msg', '❌ ' + err.message, 'error');
    }
    btn.disabled = false; btn.textContent = '确认报名 🚀';
}

// ==================== 新版跳转式报名 ====================
function goToRegisterForm(region) {
    document.getElementById('reg-step-1').classList.add('hidden');
    if (region === 'QQ') {
        document.getElementById('reg-step-qq').classList.remove('hidden');
    } else {
        document.getElementById('reg-step-wechat').classList.remove('hidden');
    }
}

function backToRegionSelect() {
    document.getElementById('reg-step-qq').classList.add('hidden');
    document.getElementById('reg-step-wechat').classList.add('hidden');
    document.getElementById('reg-step-1').classList.remove('hidden');
}

let pendingRegister = null; // 缓存待提交的报名数据

async function submitRegistrationQQ(e) {
    e.preventDefault();
    const fields = {
        contact: document.getElementById('reg-qq-contact').value.trim(),
        game_nickname: document.getElementById('reg-qq-nickname').value.trim(),
        game_uid: document.getElementById('reg-qq-uid').value.trim(),
        award_qq: document.getElementById('reg-qq-award').value.trim()
    };
    // 表单校验
    if (!fields.contact || !fields.game_nickname || !fields.game_uid || !fields.award_qq) {
        showMsg('register-msg-qq', '❌ 请填写所有必填项', 'error');
        return;
    }
    showConfirmModal(fields, 'QQ', 'register-btn-qq', 'register-msg-qq', 'register-form-qq');
}

async function submitRegistrationWeChat(e) {
    e.preventDefault();
    const fields = {
        contact: document.getElementById('reg-wx-contact').value.trim(),
        game_nickname: document.getElementById('reg-wx-nickname').value.trim(),
        game_uid: document.getElementById('reg-wx-uid').value.trim(),
        award_qq: document.getElementById('reg-wx-award').value.trim()
    };
    // 表单校验
    if (!fields.contact || !fields.game_nickname || !fields.game_uid || !fields.award_qq) {
        showMsg('register-msg-wx', '❌ 请填写所有必填项', 'error');
        return;
    }
    showConfirmModal(fields, 'WeChat', 'register-btn-wx', 'register-msg-wx', 'register-form-wechat');
}

function showConfirmModal(fields, region, btnId, msgId, formId) {
    pendingRegister = { fields, region, btnId, msgId, formId };
    document.getElementById('confirm-region').textContent = region === 'QQ' ? '🐧 QQ区' : '💬 微信区';
    document.getElementById('confirm-region').className = region === 'QQ' ? 'font-bold text-blue-400' : 'font-bold text-green-400';
    document.getElementById('confirm-contact').textContent = fields.contact;
    document.getElementById('confirm-nickname').textContent = fields.game_nickname;
    document.getElementById('confirm-uid').textContent = fields.game_uid;
    document.getElementById('confirm-award').textContent = fields.award_qq;
    // 提交按钮颜色适配大区
    const submitBtn = document.getElementById('confirm-submit-btn');
    if (region === 'QQ') {
        submitBtn.className = 'flex-1 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-bold py-3 rounded-lg transition-all';
    } else {
        submitBtn.className = 'flex-1 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-bold py-3 rounded-lg transition-all';
    }
    document.getElementById('confirm-modal').classList.remove('hidden');
}

function closeConfirmModal() {
    document.getElementById('confirm-modal').classList.add('hidden');
    pendingRegister = null;
}

async function confirmRegister() {
    if (!pendingRegister) return;
    document.getElementById('confirm-modal').classList.add('hidden');
    const { fields, region, btnId, msgId, formId } = pendingRegister;
    await doRegister(region, fields, btnId, msgId, formId);
    pendingRegister = null;
}

async function doRegister(region, fields, btnId, msgId, formId) {
    const btn = document.getElementById(btnId);
    btn.disabled = true;
    const originalText = btn.textContent;
    btn.textContent = '提交中...';
    try {
        const res = await fetch(`${API_BASE}/api/register`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...fields, region })
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error);
        showMsg(msgId, '🎉 报名成功！', 'success');
        document.getElementById(formId).reset();
        loadStats();
        setTimeout(() => showQrModal(region), 600);
    } catch (err) {
        showMsg(msgId, '❌ ' + err.message, 'error');
    }
    btn.disabled = false; btn.textContent = originalText;
}

function showQrModal(region) {
    const modal = document.getElementById('qr-modal');
    const title = document.getElementById('qr-title');
    const desc = document.getElementById('qr-desc');
    if (region === 'QQ') {
        title.innerHTML = '🐧 QQ区报名成功！';
        desc.textContent = '请扫描下方二维码加入 QQ 玩家群，方便赛事交流和通知';
    } else {
        title.innerHTML = '💬 微信区报名成功！';
        desc.textContent = '请扫描下方二维码加入 微信玩家群，方便赛事交流和通知';
    }
    modal.classList.remove('hidden');
}

function closeQrModal() {
    document.getElementById('qr-modal').classList.add('hidden');
    backToRegionSelect();
}

async function loadStats() {
    try {
        // 加载分大区统计
        const res = await fetch(`${API_BASE}/api/players/stats`);
        const stats = await res.json();
        const elTotal = document.getElementById('stat-total');
        if (elTotal) elTotal.textContent = stats.total || 0;
        const elTotalGroups = document.getElementById('stat-total-groups');
        if (elTotalGroups) elTotalGroups.textContent = (stats.qq_groups || 0) + (stats.wx_groups || 0);
        const elTotalRounds = document.getElementById('stat-total-rounds');
        if (elTotalRounds) elTotalRounds.textContent = Math.max(stats.qq_rounds || 0, stats.wx_rounds || 0);

        // QQ区统计
        const elQqCount = document.getElementById('stat-qq-count');
        if (elQqCount) elQqCount.textContent = stats.qq || 0;
        const elQqGroups = document.getElementById('stat-qq-groups');
        if (elQqGroups) elQqGroups.textContent = stats.qq_groups || 0;
        const elQqRounds = document.getElementById('stat-qq-rounds');
        if (elQqRounds) elQqRounds.textContent = stats.qq_rounds || 0;

        // 微信区统计
        const elWxCount = document.getElementById('stat-wx-count');
        if (elWxCount) elWxCount.textContent = stats.wx || 0;
        const elWxGroups = document.getElementById('stat-wx-groups');
        if (elWxGroups) elWxGroups.textContent = stats.wx_groups || 0;
        const elWxRounds = document.getElementById('stat-wx-rounds');
        if (elWxRounds) elWxRounds.textContent = stats.wx_rounds || 0;
    } catch (err) { console.error('加载统计失败:', err); }
}

// ==================== 报名截止倒计时 ====================
let countdownInterval = null;
let registrationDeadline = null;

async function loadConfig() {
    try {
        const res = await fetch(`${API_BASE}/api/config`);
        const config = await res.json();
        registrationDeadline = config.registration_deadline || null;
        updateCountdown();
        checkRegistrationClosed();
        // 管理员显示编辑按钮
        const isAdmin = localStorage.getItem('tft_admin_auth') === 'true';
        const adminEdit = document.getElementById('countdown-admin-edit');
        if (adminEdit) {
            adminEdit.classList.toggle('hidden', !isAdmin);
        }
        // 设置输入框默认值
        const deadlineInput = document.getElementById('deadline-input');
        if (deadlineInput && registrationDeadline) {
            // 转换为datetime-local格式 (YYYY-MM-DDTHH:MM)
            const d = new Date(registrationDeadline);
            if (!isNaN(d.getTime())) {
                const pad = (n) => String(n).padStart(2, '0');
                deadlineInput.value = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
            }
        }
    } catch (err) { console.error('加载配置失败:', err); }
}

function updateCountdown() {
    const display = document.getElementById('countdown-display');
    const expiredMsg = document.getElementById('countdown-expired-msg');
    if (!display) return;

    if (!registrationDeadline) {
        display.textContent = '未设置截止时间';
        if (expiredMsg) expiredMsg.classList.add('hidden');
        return;
    }

    const deadline = new Date(registrationDeadline);
    const now = new Date();
    const diff = deadline - now;

    if (diff <= 0) {
        display.textContent = '已截止';
        display.classList.remove('text-yellow-400');
        display.classList.add('text-red-400');
        if (expiredMsg) expiredMsg.classList.remove('hidden');
        return;
    }

    display.classList.remove('text-red-400');
    display.classList.add('text-yellow-400');
    if (expiredMsg) expiredMsg.classList.add('hidden');

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    const pad = (n) => String(n).padStart(2, '0');
    if (days > 0) {
        display.textContent = `${days}天 ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    } else {
        display.textContent = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    }
}

function startCountdown() {
    if (countdownInterval) clearInterval(countdownInterval);
    updateCountdown();
    countdownInterval = setInterval(() => {
        updateCountdown();
        // 每 30 秒检查一次截止时间（而非每秒）
        if (Math.floor(Date.now() / 1000) % 30 === 0) {
            checkRegistrationClosed();
        }
    }, 1000);
}

function checkRegistrationClosed() {
    const isAdmin = localStorage.getItem('tft_admin_auth') === 'true';
    if (isAdmin) return; // 管理员不受限制

    const overlay = document.getElementById('registration-closed-overlay');
    if (!overlay) return;

    // 检查是否已截止
    let isClosed = false;
    if (registrationDeadline) {
        const deadline = new Date(registrationDeadline);
        if (!isNaN(deadline.getTime()) && new Date() > deadline) {
            isClosed = true;
        }
    }

    if (isClosed) {
        overlay.classList.remove('hidden');
    } else {
        overlay.classList.add('hidden');
    }
}

async function saveDeadline() {
    const input = document.getElementById('deadline-input');
    if (!input || !input.value) {
        showToast('请选择截止时间', '❌');
        return;
    }
    try {
        const res = await fetch(`${API_BASE}/api/config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: 'registration_deadline', value: input.value })
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error);
        registrationDeadline = input.value;
        updateCountdown();
        checkRegistrationClosed();
        showToast('✅ 截止时间已保存', '✅');
    } catch (err) {
        showToast('保存失败: ' + err.message, '❌');
    }
}

// ==================== 参赛名单 ====================
let allPlayersCache = [];
let playersRegionFilter = 'all';

async function loadPlayers() {
    const tbody = document.getElementById('players-tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-gray-500">加载中...</td></tr>';
    try {
        // 获取当前赛季 ID
        let seasonId = '';
        try {
            const r = await fetch(`${API_BASE}/api/seasons/active`);
            const s = await r.json();
            if (s && s.id) seasonId = s.id;
        } catch(e) {}
        const url = seasonId ? `${API_BASE}/api/players?season_id=${seasonId}` : `${API_BASE}/api/players`;
        const res = await fetch(url);
        const data = await res.json();
        // 支持直接数组或 {players:[]} 格式
        allPlayersCache = Array.isArray(data) ? data : (data.players || data);
        renderPlayers(allPlayersCache);
    } catch (err) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-red-400">加载失败，请检查后端服务</td></tr>';
    }
}

function renderPlayers(players) {
    const tbody = document.getElementById('players-tbody');
    const countEl = document.getElementById('players-count');
    if (!tbody) return;
    if (countEl) countEl.textContent = `共 ${players.length} 人`;
    if (players.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-gray-500">暂无报名玩家，快来报名吧！</td></tr>';
        return;
    }
    tbody.innerHTML = players.map((p, i) => `
        <tr class="hover:bg-gray-800/50 transition-colors">
            <td class="px-4 py-3 text-gray-500 font-mono text-xs">${String(i + 1).padStart(3, '0')}</td>
            <td class="px-4 py-3 font-mono text-yellow-400 font-semibold">${p.game_uid}</td>
            <td class="px-4 py-3 text-white font-medium">${p.game_nickname}</td>
            <td class="px-4 py-3">
                <span class="inline-block px-2 py-0.5 rounded text-xs font-medium ${p.region === 'QQ' ? 'bg-blue-900/60 text-blue-300' : 'bg-green-900/60 text-green-300'}">
                    ${p.region === 'QQ' ? 'QQ区' : '微信区'}
                </span>
            </td>
            <td class="px-4 py-3 text-gray-400 text-sm">${p.contact || '-'}</td>
            <td class="px-4 py-3 text-yellow-300 text-sm font-mono">${p.award_qq || '-'}</td>
            <td class="px-4 py-3 text-gray-600 text-xs">${new Date(p.registered_at).toLocaleString('zh-CN')}</td>
        </tr>
    `).join('');
}

function filterPlayersByRegion(region) {
    playersRegionFilter = region;
    // 更新按钮样式
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.className = 'filter-btn px-3 py-1 rounded-lg text-xs font-medium bg-gray-800 text-gray-400 border border-gray-700 hover:border-gray-500';
    });
    const activeBtn = document.getElementById(region === 'all' ? 'filter-all' : region === 'QQ' ? 'filter-qq' : 'filter-wx');
    if (activeBtn) {
        const colorClass = region === 'all' ? 'border-yellow-500/30 text-yellow-400' : region === 'QQ' ? 'border-blue-500/30 text-blue-400' : 'border-green-500/30 text-green-400';
        activeBtn.className = `filter-btn px-3 py-1 rounded-lg text-xs font-medium bg-${region === 'all' ? 'yellow' : region === 'QQ' ? 'blue' : 'green'}-500/20 ${colorClass}`;
    }
    // 筛选数据
    if (region === 'all') {
        renderPlayers(allPlayersCache);
    } else {
        renderPlayers(allPlayersCache.filter(p => p.region === region));
    }
}
// ==================== 数据底表 ====================
async function loadDataSheet() {
    const tbody = document.getElementById('ds-tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-gray-500">加载中...</td></tr>';
    try {
        const res = await fetch(`${API_BASE}/api/players`);
        allPlayersCache = await res.json();
        const total = allPlayersCache.length;
        const qqCount = allPlayersCache.filter(p => p.region === 'QQ').length;
        const wxCount = allPlayersCache.filter(p => p.region === 'WeChat').length;
        const groups = Math.ceil(total / 8);
        const elTotal = document.getElementById('ds-total');
        if (elTotal) elTotal.textContent = total;
        const elQQ = document.getElementById('ds-qq');
        if (elQQ) elQQ.textContent = qqCount;
        const elWX = document.getElementById('ds-wx');
        if (elWX) elWX.textContent = wxCount;
        const elGroups = document.getElementById('ds-groups');
        if (elGroups) elGroups.textContent = groups;
        renderDataSheet(allPlayersCache);
    } catch (err) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-red-400">加载失败，请检查后端服务</td></tr>';
        console.error('加载数据底表失败:', err);
    }
}

function renderDataSheet(players) {
    const tbody = document.getElementById('ds-tbody');
    const countInfo = document.getElementById('ds-count-info');
    if (!tbody) return;
    if (players.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-gray-500">暂无匹配数据</td></tr>';
        if (countInfo) countInfo.textContent = '共 0 条记录';
        return;
    }
    tbody.innerHTML = players.map((p, i) => `
        <tr class="hover:bg-gray-800/50 transition-colors">
            <td class="px-4 py-3 text-gray-500 font-mono text-xs">${i + 1}</td>
            <td class="px-4 py-3 font-mono text-yellow-400 font-semibold">${p.game_uid}</td>
            <td class="px-4 py-3 text-white font-medium">${p.game_nickname}</td>
            <td class="px-4 py-3">
                <span class="inline-block px-2 py-0.5 rounded text-xs font-medium ${p.region === 'QQ' ? 'bg-blue-900/60 text-blue-300' : 'bg-green-900/60 text-green-300'}">
                    ${p.region === 'QQ' ? 'QQ区' : '微信区'}
                </span>
            </td>
            <td class="px-4 py-3 text-gray-400 text-sm">${p.contact || '-'}</td>
            <td class="px-4 py-3 text-yellow-300 text-sm font-mono">${p.award_qq || '-'}</td>
            <td class="px-4 py-3 text-gray-600 text-xs">${new Date(p.registered_at).toLocaleString('zh-CN')}</td>
        </tr>
    `).join('');
    if (countInfo) countInfo.textContent = `共 ${players.length} 条记录`;
}

function filterDataSheet() {
    const search = document.getElementById('ds-search')?.value.trim().toLowerCase() || '';
    const regionFilter = document.getElementById('ds-filter-region')?.value || '';
    let filtered = allPlayersCache;
    if (regionFilter) filtered = filtered.filter(p => p.region === regionFilter);
    if (search) {
        filtered = filtered.filter(p =>
            (p.game_uid && p.game_uid.toLowerCase().includes(search)) ||
            (p.game_nickname && p.game_nickname.toLowerCase().includes(search)) ||
            (p.contact && p.contact.toLowerCase().includes(search)) ||
            (p.award_qq && p.award_qq.toLowerCase().includes(search))
        );
    }
    renderDataSheet(filtered);
}

function exportDataSheet() {
    const search = document.getElementById('ds-search')?.value.trim().toLowerCase() || '';
    const regionFilter = document.getElementById('ds-filter-region')?.value || '';
    let filtered = allPlayersCache;
    if (regionFilter) filtered = filtered.filter(p => p.region === regionFilter);
    if (search) {
        filtered = filtered.filter(p =>
            (p.game_uid && p.game_uid.toLowerCase().includes(search)) ||
            (p.game_nickname && p.game_nickname.toLowerCase().includes(search)) ||
            (p.contact && p.contact.toLowerCase().includes(search)) ||
            (p.award_qq && p.award_qq.toLowerCase().includes(search))
        );
    }
    if (filtered.length === 0) { showToast('没有数据可导出', '⚠️'); return; }
    let csv = '\uFEFF';
    csv += '序号,游戏数字ID,游戏昵称,大区,联系方式,领奖QQ号,报名时间\n';
    filtered.forEach((p, i) => {
        const region = p.region === 'QQ' ? 'QQ区' : '微信区';
        const row = [i + 1, p.game_uid, p.game_nickname, region, p.contact || '', p.award_qq || '', new Date(p.registered_at).toLocaleString('zh-CN')];
        csv += row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',') + '\n';
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const now = new Date().toISOString().slice(0, 10);
    link.download = `金铲铲水友赛_报名数据_${now}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast(`✅ 已导出 ${filtered.length} 条记录`, '✅');
}
// ==================== 分组渲染辅助函数 ====================
function renderGroupCard(g, medalColors) {
    const groupRegion = (g.players && g.players.length > 0) ? g.players[0].region : null;
    const borderColor = groupRegion === 'QQ' ? 'hover:border-blue-500/50 border-l-4 border-l-blue-500/60' : groupRegion === 'WeChat' ? 'hover:border-green-500/50 border-l-4 border-l-green-500/60' : 'hover:border-yellow-500/30';
    const regionBadge = groupRegion === 'QQ'
        ? '<span class="text-xs bg-blue-900/60 text-blue-300 px-2 py-0.5 rounded font-medium">🐧 QQ区</span>'
        : groupRegion === 'WeChat'
        ? '<span class="text-xs bg-green-900/60 text-green-300 px-2 py-0.5 rounded font-medium">💬 微信区</span>'
        : '';
    return `
        <div class="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl border border-gray-700 overflow-hidden ${borderColor} transition-colors">
            <div class="bg-gray-800/80 px-5 py-4 flex items-center justify-between">
                <div class="flex items-center gap-3">
                    <div class="font-bold text-yellow-400 text-lg">🏆 第 ${g.group_number} 组</div>
                    ${regionBadge}
                </div>
                <div class="text-xs text-gray-400 bg-gray-900 px-3 py-1 rounded-full">${g.player_count}/8 人</div>
            </div>
            <div class="divide-y divide-gray-800/50">
                ${(g.players && g.players.length > 0) ? g.players.map((gp, idx) => {
                    const rankCls = gp.placement && gp.placement <= 4 ? medalColors[(gp.placement || 1) - 1] : 'bg-gray-800/50 text-gray-500';
                    return `
                        <div class="px-5 py-3 flex items-center justify-between hover:bg-gray-800/30 transition-colors">
                            <div class="flex items-center gap-3">
                                <span class="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${gp.placement ? rankCls : 'bg-gray-800 text-gray-600'}">
                                    ${gp.placement || '-'}
                                </span>
                                <div>
                                    <div class="text-white font-medium">${gp.game_nickname}</div>
                                    <div class="text-xs text-gray-500 font-mono">ID: ${gp.game_uid}</div>
                                </div>
                            </div>
                            <div class="flex items-center gap-2">
                                ${gp.screenshot_path ? `
                                    <button onclick="verifyPlayerScreenshot(${gp.id})" 
                                        class="text-xs ${gp.verified ? 'text-green-400 bg-green-900/40' : 'text-yellow-400 bg-yellow-900/40'} px-2 py-0.5 rounded hover:opacity-80 transition-opacity"
                                        title="点击验证截图">
                                        ${gp.verified ? '✓ 已验证' : '⚠️ 未验证'}
                                    </button>
                                    <a href="${fixScreenshotUrl(gp.screenshot_path)}" target="_blank" class="text-blue-400 text-xs bg-blue-900/40 px-2 py-0.5 rounded hover:opacity-80 transition-opacity" title="查看截图">📷</a>
                                ` : ''}
                                ${gp.placement && gp.placement <= 4 ? '<span class="text-yellow-400 text-xs">⬆ 晋级</span>' : ''}
                            </div>
                        </div>
                    `;
                }).join('') : '<div class="px-5 py-8 text-center text-gray-500 text-sm">暂无玩家</div>'}
            </div>
        </div>
    `;
}

// ==================== 分组对战 ====================
let selectedFile = null;
let selectedGroupPlayerId = null;

async function loadRounds() {
    try {
        const res = await fetch(`${API_BASE}/api/rounds`);
        const rounds = await res.json();
        const select = document.getElementById('round-select');
        if (!select) return;
        if (rounds.length === 0) {
            select.innerHTML = '<option>暂无轮次</option>';
            const container = document.getElementById('groups-container');
            if (container) container.innerHTML = '<div class="col-span-full text-center py-12 text-gray-500">暂无分组，请先在管理后台点击"随机分组"</div>';
            return;
        }
        select.innerHTML = rounds.map(r =>
            `<option value="${r.id}">${r.name} 【${r.status === 'active' ? '🔥 进行中' : r.status === 'completed' ? '✅ 已结束' : '⏳ 待开始'}】</option>`
        ).join('');
        loadGroups();
    } catch (err) { console.error('加载轮次失败:', err); }
}

async function loadGroups() {
    const roundId = document.getElementById('round-select')?.value;
    if (!roundId) return;
    const container = document.getElementById('groups-container');
    if (!container) return;
    container.innerHTML = '<div class="col-span-full text-center py-8 text-gray-500">加载中...</div>';
    try {
        const res = await fetch(`${API_BASE}/api/groups/${roundId}`);
        const groups = await res.json();
        if (groups.length === 0) {
            container.innerHTML = '<div class="col-span-full text-center py-12 text-gray-500">该轮次暂无分组数据</div>';
            return;
        }
        const medalColors = ['bg-yellow-500/20 text-yellow-400', 'bg-gray-400/20 text-gray-300', 'bg-orange-600/20 text-orange-400', 'bg-blue-500/20 text-blue-400'];
        const qqGroups = groups.filter(g => g.players && g.players.length > 0 && g.players[0].region === 'QQ');
        const wxGroups = groups.filter(g => g.players && g.players.length > 0 && g.players[0].region === 'WeChat');
        let html = '';
        if (qqGroups.length > 0) {
            html += `<div class="col-span-full mb-2"><span class="inline-block px-3 py-1 rounded-full text-xs font-bold bg-blue-900/60 text-blue-300 border border-blue-500/30">🐧 QQ区 · 共${qqGroups.length}组</span></div>`;
            html += qqGroups.map(g => renderGroupCard(g, medalColors)).join('');
        }
        if (wxGroups.length > 0) {
            html += `<div class="col-span-full mb-2 mt-4"><span class="inline-block px-3 py-1 rounded-full text-xs font-bold bg-green-900/60 text-green-300 border border-green-500/30">💬 微信区 · 共${wxGroups.length}组</span></div>`;
            html += wxGroups.map(g => renderGroupCard(g, medalColors)).join('');
        }
        container.innerHTML = html || '<div class="col-span-full text-center py-12 text-gray-500">该轮次暂无分组数据</div>';
    } catch (err) {
        container.innerHTML = '<div class="col-span-full text-center py-8 text-red-400">加载失败</div>';
    }
}

async function loadGroupsForUpload() {
    try {
        // 重置大区选择
        const regionSelect = document.getElementById('upload-region-select');
        if (regionSelect) regionSelect.value = '';
        // 重置分组选择
        const groupSelect = document.getElementById('upload-group-select');
        if (groupSelect) groupSelect.innerHTML = '<option value="">-- 请先选择大区 --</option>';
        // 重置玩家选择
        const playerSelect = document.getElementById('upload-player-select');
        if (playerSelect) playerSelect.innerHTML = '<option value="">-- 请选择 --</option>';
        // 加载名次按钮
        const pd = document.getElementById('placement-select');
        if (pd) pd.innerHTML = [1,2,3,4,5,6,7,8].map(n => `
            <button type="button" onclick="selectPlacement(${n})"
                class="placement-btn border border-gray-700 rounded-lg py-2 text-sm hover:border-yellow-500 hover:text-yellow-400 transition-all duration-200"
                data-placement="${n}">第${n}名</button>
        `).join('');
    } catch (err) { console.error('初始化上传页面失败:', err); }
}

// 大区选择变化时加载对应分组
async function handleRegionChangeForUpload() {
    const regionSelect = document.getElementById('upload-region-select');
    const groupSelect = document.getElementById('upload-group-select');
    const playerSelect = document.getElementById('upload-player-select');
    const region = regionSelect?.value;

    if (!region) {
        if (groupSelect) groupSelect.innerHTML = '<option value="">-- 请先选择大区 --</option>';
        if (playerSelect) playerSelect.innerHTML = '<option value="">-- 请选择 --</option>';
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/api/rounds/current`);
        const currentRound = await res.json();
        if (!currentRound) {
            if (groupSelect) groupSelect.innerHTML = '<option>暂无进行中的轮次</option>';
            return;
        }
        const gRes = await fetch(`${API_BASE}/api/groups/${currentRound.id}`);
        const groups = await gRes.json();
        if (!groupSelect) return;

        // 筛选对应大区的分组
        const filteredGroups = groups.filter(g => g.region === region);

        if (filteredGroups.length === 0) {
            groupSelect.innerHTML = '<option value="">-- 该大区暂无分组 --</option>';
        } else {
            const regionTag = region === 'QQ' ? '🐧' : '💬';
            groupSelect.innerHTML = '<option value="">-- 请选择分组 --</option>' +
                filteredGroups.map(g =>
                    `<option value="${g.id}">${regionTag} 第 ${g.group_number} 组 (${g.player_count || g.players.length}人)</option>`
                ).join('');
        }
        // 重置玩家选择
        if (playerSelect) playerSelect.innerHTML = '<option value="">-- 请选择 --</option>';
    } catch (err) { console.error('加载分组失败:', err); }
}

async function loadGroupPlayersForUpload() {
    const groupId = document.getElementById('upload-group-select')?.value;
    if (!groupId) return;
    try {
        const rRes = await fetch(`${API_BASE}/api/rounds/current`);
        const currentRound = await rRes.json();
        if (!currentRound) return;
        const gRes = await fetch(`${API_BASE}/api/groups/${currentRound.id}`);
        const groups = await gRes.json();
        const group = groups.find(g => g.id == groupId);
        if (!group || !group.players) return;
        const select = document.getElementById('upload-player-select');
        if (!select) return;
        select.innerHTML = '<option value="">-- 请选择你的名字 --</option>' +
            group.players.map(p => `<option value="${p.id}" data-player-id="${p.player_id}">${p.game_nickname} (ID: ${p.game_uid})</option>`).join('');
    } catch (err) { console.error('加载分组玩家失败:', err); }
}

function selectPlacement(n) {
    document.querySelectorAll('.placement-btn').forEach(b => {
        b.classList.remove('bg-yellow-500', 'text-black', 'border-yellow-500', 'font-bold');
        b.classList.add('border-gray-700');
    });
    const btn = document.querySelector(`.placement-btn[data-placement="${n}"]`);
    if (btn) {
        btn.classList.add('bg-yellow-500', 'text-black', 'border-yellow-500', 'font-bold');
        btn.classList.remove('border-gray-700');
    }
}

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { showToast('请选择图片文件', '⚠️'); return; }
    selectedFile = file;
    const reader = new FileReader();
    reader.onload = (ev) => {
        const img = document.getElementById('preview-img');
        const container = document.getElementById('preview-container');
        if (img) img.src = ev.target.result;
        if (container) container.classList.remove('hidden');
    };
    reader.readAsDataURL(file);
}

function handleDrop(e) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
        selectedFile = file;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const img = document.getElementById('preview-img');
            const container = document.getElementById('preview-container');
            if (img) img.src = ev.target.result;
            if (container) container.classList.remove('hidden');
        };
        reader.readAsDataURL(file);
    }
}
// ==================== 图片压缩 ====================
function compressImage(file, maxWidth = 1920, maxHeight = 1080, quality = 0.8) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                let { width, height } = img;
                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }
                if (height > maxHeight) {
                    width = Math.round((width * maxHeight) / height);
                    height = maxHeight;
                }
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                canvas.getContext('2d').drawImage(img, 0, 0, width, height);
                canvas.toBlob(
                    (blob) => blob ? resolve(blob) : reject(new Error('图片压缩失败')),
                    'image/jpeg',
                    quality
                );
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// ==================== SM.MS 图床上传 ====================
async function uploadToSmMs(file) {
    const formData = new FormData();
    formData.append('smfile', file);
    const res = await fetch('https://sm.ms/api/v2/upload', {
        method: 'POST',
        body: formData
    });
    const data = await res.json();
    if (data.success || data.code === 'image_repeated') {
        return data.data.url || data.data;
    } else {
        throw new Error(data.message || '上传图片失败');
    }
}

// ==================== 战绩上传 ====================
async function submitResult() {
    const region = document.getElementById('upload-region-select')?.value;
    const groupPlayerId = document.getElementById('upload-player-select')?.value;
    const placementBtn = document.querySelector('.placement-btn.bg-yellow-500');
    if (!region) return showToast('请先选择你的大区', '⚠️');
    if (!groupPlayerId) return showToast('请先选择你的名字', '⚠️');
    if (!placementBtn) return showToast('请选择本局名次', '⚠️');
    const placement = placementBtn.dataset.placement;
    const btn = document.getElementById('upload-btn');
    if (btn) { btn.disabled = true; btn.textContent = '提交中...'; }
    try {
        // 1. 上传截图到 SM.MS 图床
        let screenshotUrl = null;
        if (selectedFile) {
            showToast('正在压缩并上传截图...', 'ℹ️');
            try {
                const compressedBlob = await compressImage(selectedFile);
                screenshotUrl = await uploadToSmMs(compressedBlob);
                showToast('截图上传成功！', '✅');
            } catch (uploadErr) {
                console.error('[SM.MS] 上传失败:', uploadErr);
                // 上传失败时不阻断提交流程，允许无截图提交
                showToast('截图上传失败，将提交无截图战绩', '⚠️');
            }
        }

        // 2. 提交战绩（带截图 URL）
        const res = await fetch(`${API_BASE}/api/results/upload`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                group_player_id: groupPlayerId,
                placement: placement,
                screenshot_url: screenshotUrl
            })
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || '提交失败');
        showToast('🎉 战绩提交成功！正在验证截图...', '✅');
        if (screenshotUrl) {
            await verifyScreenshot(groupPlayerId);
        }
        selectedFile = null;
        const previewContainer = document.getElementById('preview-container');
        if (previewContainer) previewContainer.classList.add('hidden');
        const playerSelect = document.getElementById('upload-player-select');
        if (playerSelect) playerSelect.value = '';
        document.querySelectorAll('.placement-btn').forEach(b => {
            b.classList.remove('bg-yellow-500', 'text-black', 'border-yellow-500', 'font-bold');
        });
    } catch (err) {
        showToast('❌ ' + err.message, '❌');
    }
    if (btn) { btn.disabled = false; btn.textContent = '提交战绩'; }
}

// 当前晋级榜大区（全局变量，切换Tab时修改）
let currentBracketRegion = 'QQ';

// ==================== 晋级榜（按大区展示） ====================
async function loadBracket(region) {
    if (region) currentBracketRegion = region;

    // 更新大区Tab样式
    const qqBtn = document.getElementById('bracket-tab-qq');
    const wxBtn = document.getElementById('bracket-tab-wx');
    if (qqBtn) {
        qqBtn.className = 'px-3 py-1 rounded text-xs font-bold ' +
            (currentBracketRegion === 'QQ'
                ? 'bg-blue-900/50 text-blue-300 border border-blue-700'
                : 'bg-gray-800 text-gray-400 border border-gray-700 hover:border-blue-600');
    }
    if (wxBtn) {
        wxBtn.className = 'px-3 py-1 rounded text-xs font-bold ' +
            (currentBracketRegion === 'WeChat'
                ? 'bg-green-900/50 text-green-300 border border-green-700'
                : 'bg-gray-800 text-gray-400 border border-gray-700 hover:border-green-600');
    }

    const container = document.getElementById('bracket-content');
    if (!container) return;
    container.innerHTML = '<div class="text-center py-8 text-gray-500">加载中...</div>';

    try {
        // 获取赛段选项
        const sRes = await fetch(`${API_BASE}/api/stages`);
        const stages = await sRes.json();
        const stageSelect = document.getElementById('bracket-stage');
        if (stageSelect) {
            stageSelect.innerHTML = '<option value="">全部赛段</option>' +
                stages.map(s => `<option value="${s.stage_name}">${s.stage_name}</option>`).join('');
        }

        const params = new URLSearchParams();
        params.append('region', currentBracketRegion);
        const selectedStage = stageSelect ? stageSelect.value : '';
        if (selectedStage) params.append('stage', selectedStage);

        const res = await fetch(`${API_BASE}/api/advancements?${params.toString()}`);
        const rows = await res.json();
        if (!res.ok) throw new Error(rows.error || '加载失败');

        if (rows.length === 0) {
            container.innerHTML = '<div class="text-center text-gray-500 py-8">暂无晋级玩家</div>';
            return;
        }

        // 按赛段分组展示
        const byStage = {};
        rows.forEach(r => {
            const stage = r.from_stage_name || '海选赛';
            if (!byStage[stage]) byStage[stage] = [];
            byStage[stage].push(r);
        });

        let html = '';
        const regionLabel = currentBracketRegion === 'QQ' ? 'QQ区' : '微信区';
        const bgColor = currentBracketRegion === 'QQ' ? 'bg-blue-900/30 border-blue-800' : 'bg-green-900/30 border-green-800';
        const textColor = currentBracketRegion === 'QQ' ? 'text-blue-300' : 'text-green-300';
        const badgeColor = currentBracketRegion === 'QQ' ? 'bg-blue-800/50 text-blue-400' : 'bg-green-800/50 text-green-400';

        for (const [stage, players] of Object.entries(byStage)) {
            html += `<div class="mb-6">
                <h4 class="font-bold text-md mb-3 ${textColor}">${stage} — ${regionLabel}（${players.length}人晋级）</h4>
                <div class="space-y-2">`;
            players.forEach(p => {
                html += `<div class="flex items-center gap-3 p-3 ${bgColor} rounded-lg border">
                    <span class="text-xs text-gray-500 w-8">#${p.placement}</span>
                    <span class="font-bold text-sm text-white">${p.game_nickname || '-'}</span>
                    <span class="text-xs text-gray-500">ID: ${p.game_uid || '-'}</span>
                    <span class="text-xs px-2 py-0.5 rounded ${badgeColor}">${p.region || ''}</span>
                </div>`;
            });
            html += '</div></div>';
        }
        container.innerHTML = html;

    } catch (err) {
        console.error('晋级榜加载失败:', err);
        if (container) container.innerHTML = '<div class="text-center text-red-400 py-8">加载失败: ' + err.message + '</div>';
    }
}

// ==================== 管理后台 ====================
async function toggleRegistration(open) {
    try {
        await fetch(`${API_BASE}/api/config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: 'registration_open', value: open.toString() })
        });
        showToast(open ? '✅ 报名已开启，玩家可以报名了' : '⚠️ 报名已关闭', '✅');
        updateHeaderStatus();
    } catch (err) { showToast('操作失败', '❌'); }
}

async function generateGroups() {
    const btn = document.getElementById('generate-btn');
    if (btn) { btn.disabled = true; btn.textContent = '🎲 生成预览中...'; }
    try {
        // 第一步：生成预览（preview=true，默认）
        const res = await fetch(`${API_BASE}/api/groups/generate?preview=true`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ round_number: 1 })
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error);
        
        // 显示预览
        showGroupPreview(result);
        showToast(`🎉 预览已生成！共 ${result.qq_group_count + result.wx_group_count} 组`, '🎉');
    } catch (err) {
        showMsg('admin-msg', '❌ ' + err.message, 'error');
    }
    if (btn) { btn.disabled = false; btn.textContent = '🎲 随机分组'; }
}

// ==================== 分组预览 ====================

function showGroupPreview(result) {
    // 创建或获取预览弹窗
    let overlay = document.getElementById('group-preview-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'group-preview-overlay';
        overlay.className = 'fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 hidden';
        overlay.innerHTML = ''
            + '<div class="bg-gray-900 border border-yellow-500/30 rounded-2xl p-6 max-w-2xl w-full mx-4 shadow-2xl max-h-[80vh] overflow-y-auto">'
            + '<div class="text-xl font-bold text-yellow-400 mb-4">🎲 分组预览</div>'
            + '<div id="preview-content" class="space-y-4"></div>'
            + '<div class="flex gap-3 justify-end mt-6">'
            + '<button onclick="closeGroupPreview()" class="px-4 py-2 rounded-lg bg-gray-700 text-gray-300 text-sm hover:bg-gray-600 transition-colors">取消</button>'
            + '<button onclick="confirmGroups()" class="px-4 py-2 rounded-lg bg-yellow-500 text-gray-900 text-sm font-bold hover:bg-yellow-400 transition-colors">✅ 确认应用</button>'
            + '</div>'
            + '</div>';
        document.body.appendChild(overlay);
    }
    
    // 渲染预览内容
    const content = document.getElementById('preview-content');
    let html = '';
    
    // QQ区分组
    if (result.qq_groups && result.qq_groups.length > 0) {
        html += '<div class="mb-4"><h3 class="text-blue-400 font-bold mb-2">QQ区（' + result.qq_group_count + '组）</h3>';
        result.qq_groups.forEach(g => {
            html += '<div class="bg-blue-900/20 border border-blue-500/30 rounded-lg p-3 mb-2">';
            html += '<div class="text-sm text-blue-300 font-medium mb-1">第 ' + g.group_number + ' 组</div>';
            html += '<div class="space-y-1">';
            g.players.forEach(p => {
                html += '<div class="text-xs text-gray-300">' + (p.game_nickname || '未知') + ' <span class="text-gray-500">(' + (p.game_uid || '未知') + ')</span></div>';
            });
            html += '</div></div>';
        });
        html += '</div>';
    }
    
    // 微信区分组
    if (result.wx_groups && result.wx_groups.length > 0) {
        html += '<div class="mb-4"><h3 class="text-green-400 font-bold mb-2">微信区（' + result.wx_group_count + '组）</h3>';
        result.wx_groups.forEach(g => {
            html += '<div class="bg-green-900/20 border border-green-500/30 rounded-lg p-3 mb-2">';
            html += '<div class="text-sm text-green-300 font-medium mb-1">第 ' + g.group_number + ' 组</div>';
            html += '<div class="space-y-1">';
            g.players.forEach(p => {
                html += '<div class="text-xs text-gray-300">' + (p.game_nickname || '未知') + ' <span class="text-gray-500">(' + (p.game_uid || '未知') + ')</span></div>';
            });
            html += '</div></div>';
        });
        html += '</div>';
    }
    
    content.innerHTML = html;
    overlay.classList.remove('hidden');
}

function closeGroupPreview() {
    const overlay = document.getElementById('group-preview-overlay');
    if (overlay) overlay.classList.add('hidden');
}

async function confirmGroups() {
    const btn = document.querySelector('#group-preview-overlay button[onclick="confirmGroups()"');
    if (btn) { btn.disabled = true; btn.textContent = '应用中...'; }
    
    try {
        const res = await fetch(`${API_BASE}/api/groups/generate?confirm=true`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ round_number: 1 })
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error);
        
        closeGroupPreview();
        showToast(`✅ 分组已应用！共 ${result.qq_group_count + result.wx_group_count} 组`, '✅');
        showMsg('admin-msg', `分组成功！共 ${result.qq_group_count + result.wx_group_count} 组，每组最多8人。可在"分组对战"标签页查看详情。`, 'success');
        
        // 刷新分组页面
        if (typeof loadGroups === 'function') loadGroups();
    } catch (err) {
        showMsg('admin-msg', '❌ ' + err.message, 'error');
    }
    if (btn) { btn.disabled = false; btn.textContent = '✅ 确认应用'; }
}

async function generateAdvancements() {
    try {
        const rRes = await fetch(`${API_BASE}/api/rounds/current`);
        const currentRound = await rRes.json();
        if (!currentRound) throw new Error('没有进行中的轮次，请先生成分组');
        const gRes = await fetch(`${API_BASE}/api/groups/${currentRound.id}`);
        const groups = await gRes.json();
        if (groups.length === 0) throw new Error('该轮次没有分组数据');
        let total = 0;
        for (const g of groups) {
            const res = await fetch(`${API_BASE}/api/advancements/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ group_id: g.id, round_id: currentRound.id })
            });
            const result = await res.json();
            if (res.ok) total += result.advanced || 0;
        }
        showToast(`⬆️ 晋级名单已生成！共 ${total} 人晋级到下一轮`, '🎉');
        showMsg('admin-msg', `晋级名单生成成功！共 ${total} 人晋级。可在"晋级榜"标签页查看详情。`, 'success');
    } catch (err) {
        showMsg('admin-msg', '❌ ' + err.message, 'error');
    }
}

async function completeRound() {
    if (!confirm('确定要结束当前轮次吗？结束后将进入下一轮。')) return;
    try {
        const rRes = await fetch(`${API_BASE}/api/rounds/current`);
        const currentRound = await rRes.json();
        if (!currentRound) throw new Error('没有进行中的轮次');
        await fetch(`${API_BASE}/api/rounds/${currentRound.id}/complete`, { method: 'POST' });
        showToast('✅ 当前轮次已结束', '✅');
        showMsg('admin-msg', '轮次已结束。如需进行下一轮，请点击"随机分组"为新晋级选手分组。', 'success');
    } catch (err) {
        showMsg('admin-msg', '❌ ' + err.message, 'error');
    }
}

async function clearPlayers() {
    if (!confirm('⚠️ 确定要清空所有报名数据吗？此操作不可恢复！')) return;
    try {
        await fetch(`${API_BASE}/api/players`, { method: 'DELETE' });
        showToast('🗑️ 所有报名数据已清空', '✅');
        loadStats();
    } catch (err) { showToast('操作失败', '❌'); }
}

// ==================== 赛段配置 ====================

async function loadStageConfig() {
    const container = document.getElementById('stage-config-container');
    if (!container) return;
    container.innerHTML = '<div class="text-center py-4 text-gray-500">加载中...</div>';
    
    try {
        const res = await fetch(`${API_BASE}/api/stages`);
        const stages = await res.json();
        
        let html = '<div class="space-y-4">';
        stages.forEach((s, idx) => {
            html += '<div class="bg-gray-800/50 rounded-lg p-4 border border-gray-700">';
            html += '<div class="font-medium text-yellow-400 mb-2">' + (idx + 1) + '. ' + s.stage_name + '</div>';
            html += '<div class="grid grid-cols-2 gap-3">';
            html += '<div><label class="text-xs text-gray-400">每组人数</label>';
            html += '<input type="number" value="' + (s.players_per_group || 8) + '" id="stage-ppg-' + s.id + '" class="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white"></div>';
            html += '<div><label class="text-xs text-gray-400">每组晋级</label>';
            html += '<input type="number" value="' + (s.advance_count || 4) + '" id="stage-adv-' + s.id + '" class="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white"></div>';
            html += '</div>';
            html += '<div class="mt-2"><label class="text-xs text-gray-400">截止时间</label>';
            html += '<input type="datetime-local" value="' + (s.deadline || '') + '" id="stage-deadline-' + s.id + '" class="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white"></div>';
            html += '</div>';
        });
        html += '</div>';
        html += '<button onclick="saveStageConfig()" class="mt-4 px-4 py-2 bg-yellow-500 text-gray-900 rounded-lg text-sm font-bold hover:bg-yellow-400 transition-colors">💾 保存配置</button>';
        
        container.innerHTML = html;
    } catch (err) {
        container.innerHTML = '<div class="text-center py-4 text-red-400">加载失败：' + err.message + '</div>';
    }
}

async function saveStageConfig() {
    try {
        const res = await fetch(`${API_BASE}/api/stages`);
        const stages = await res.json();
        
        const updatedStages = stages.map(s => {
            return {
                stage_index: s.stage_index,
                stage_name: s.stage_name,
                players_per_group: parseInt(document.getElementById('stage-ppg-' + s.id)?.value || '8'),
                advance_count: parseInt(document.getElementById('stage-adv-' + s.id)?.value || '4'),
                description: s.description || '',
                deadline: document.getElementById('stage-deadline-' + s.id)?.value || ''
            };
        });
        
        const saveRes = await fetch(`${API_BASE}/api/stages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ stages: updatedStages })
        });
        
        const result = await saveRes.json();
        if (!saveRes.ok) throw new Error(result.error);
        
        showToast('✅ 赛段配置已保存', '✅');
    } catch (err) {
        showToast('保存失败：' + err.message, '❌');
    }
}

async function resetTournament() {
    if (!confirm('⚠️ 确定要重置整个赛事吗？所有数据（报名、分组、战绩、晋级）将被清空！')) return;
    try {
        await fetch(`${API_BASE}/api/tournament/reset`, { method: 'POST' });
        showToast('🔄 赛事已重置', '✅');
        showMsg('admin-msg', '赛事已重置，可以重新报名。', 'success');
        loadStats();
    } catch (err) { showMsg('admin-msg', '❌ ' + err.message, 'error'); }
}

async function updateHeaderStatus() {
    try {
        const res = await fetch(`${API_BASE}/api/config`);
        const config = await res.json();
        const statusEl = document.getElementById('header-status');
        if (!statusEl) return;
        if (config.registration_open === 'true') {
            statusEl.innerHTML = '<span class="w-2 h-2 rounded-full bg-green-500 pulse-dot"></span><span class="text-gray-300 text-sm">报名进行中</span>';
        } else {
            statusEl.innerHTML = '<span class="w-2 h-2 rounded-full bg-red-500"></span><span class="text-gray-300 text-sm">报名已截止</span>';
        }
    } catch (err) {}
}

// ==================== OCR 截图验证 ====================

// 管理员点击"验证截图"按钮时调用
async function verifyPlayerScreenshot(groupPlayerId) {
    if (!confirm('确定要验证该玩家的截图吗？\n\nOCR 将自动识别截图中的昵称和排名，与报名信息比对。')) return;
    showToast('正在验证截图...', '⏳');
    await verifyScreenshot(groupPlayerId);
}

// 调用后端 OCR 验证接口
async function verifyScreenshot(groupPlayerId) {
    try {
        const res = await fetch(`${API_BASE}/api/results/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ group_player_id: groupPlayerId })
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || '验证失败');

        // 展示验证结果（简化版，不展示识别详情）
        const verified = result.verified;
        const details = result.details || {};

        if (verified) {
            showToast('✅ 验证通过', '✅');
        } else {
            showToast('⚠️ 验证未通过，请联系管理员协助登记', '⚠️');
        }

        // 显示验证结果（仅显示状态，不展示识别详情）
        const msgEl = document.getElementById('upload-msg');
        if (msgEl) {
            msgEl.classList.remove('hidden');
            msgEl.className = `mt-4 text-center text-sm py-3 rounded-lg ${verified ? 'bg-green-900/50 text-green-300' : 'bg-yellow-900/50 text-yellow-300'}`;
            
            let html = `<div class="font-bold mb-2">${verified ? '✅ 验证通过' : '⚠️ 验证未通过'}</div>`;
            
            if (!verified) {
                html += `
                    <div class="text-xs mt-2 p-3 bg-gray-900/50 rounded text-left">
                        <div class="text-yellow-300 mb-2">验证未通过，可能是以下原因：</div>
                        <div class="text-gray-300 mb-3 pl-2">• 截图不清晰或不是战绩截图<br>• 截图中的排名与报名信息不符<br>• 截图中的昵称与报名信息不符</div>
                        <div class="text-yellow-300 border-t border-gray-700 pt-2">若验证未通过或登记有误，<br>请单独联系【洛】【魄罗】【妮蔻】协助登记</div>
                    </div>`;
            }
            
            // 区分管理员和玩家视图
            if (!verified) {
                var isAdmin = localStorage.getItem("tft_admin_auth") === "true";
                if (isAdmin) {
                    // 管理员：显示手动通过/拒绝按钮
                    html += `
                        <div class="mt-2 pt-2 border-t border-gray-700">
                            <button onclick="manualVerify(${groupPlayerId}, true)" class="px-3 py-1 bg-green-900/50 text-green-300 rounded hover:bg-green-800/50 transition-colors text-xs mr-2">管理员手动通过</button>
                            <button onclick="manualVerify(${groupPlayerId}, false)" class="px-3 py-1 bg-red-900/50 text-red-300 rounded hover:bg-red-800/50 transition-colors text-xs">手动拒绝</button>
                        </div>`;
                } else {
                    // 玩家：显示提交审核按钮
                    html += `
                        <div class="mt-2 pt-2 border-t border-gray-700">
                            <button onclick="submitForReview(${groupPlayerId})" class="px-3 py-1 bg-yellow-900/50 text-yellow-300 rounded hover:bg-yellow-800/50 transition-colors text-xs">📤 上传信息至管理员审核</button>
                        </div>`;
                }
            }
            
            msgEl.innerHTML = html;
            setTimeout(() => msgEl.classList.add('hidden'), 15000);
        }

        // 刷新分组展示
        setTimeout(() => loadGroups(), 1000);

    } catch (err) {
        console.error('OCR验证失败:', err);
        showToast('⚠️ OCR验证失败: ' + err.message, '⚠️');
    }
}

// 管理员手动审核
async function manualVerify(groupPlayerId, approved) {
    try {
        const res = await fetch(`${API_BASE}/api/results/manual-verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ group_player_id: groupPlayerId, verified: approved })
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error);
        showToast(approved ? '✅ 已手动通过验证' : '❌ 已手动拒绝', approved ? '✅' : '❌');
        setTimeout(() => loadGroups(), 500);
    } catch (err) {
        showToast('操作失败: ' + err.message, '❌');
    }
}

// 玩家提交战绩给管理员审核
async function submitForReview(groupPlayerId) {
    try {
        const res = await fetch(`${API_BASE}/api/results/submit-for-review`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ group_player_id: groupPlayerId })
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || '提交失败');
        showToast('✅ 已提交管理员审核，请耐心等待', '✅');
        const msgEl = document.getElementById('upload-msg');
        if (msgEl) {
            msgEl.innerHTML += '<div class="mt-2 text-green-300 text-xs">📤 已提交审核</div>';
        }
    } catch (err) {
        showToast('❌ 提交审核失败: ' + err.message, '❌');
    }
}

// 管理员加载待审核列表
async function loadPendingReviews() {
    const container = document.getElementById('admin-review-list');
    if (!container) return;

    try {
        const res = await fetch(`${API_BASE}/api/results/pending-review`);
        const rows = await res.json();
        if (!res.ok) throw new Error(rows.error);

        if (rows.length === 0) {
            container.innerHTML = '<div class="text-center text-gray-500 py-8">暂无待审核的战绩</div>';
            return;
        }

        let html = '<div class="space-y-3">';
        rows.forEach(row => {
            const regionLabel = row.region === 'QQ' ? 'QQ区' : '微信区';
            html += `
                <div class="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
                    <div class="flex items-center justify-between mb-2">
                        <div class="flex items-center gap-2">
                            <span class="text-xs px-2 py-0.5 rounded bg-blue-900/50 text-blue-300">${regionLabel}</span>
                            <span class="font-bold text-sm">${row.game_nickname || '-'}</span>
                            <span class="text-xs text-gray-500">ID:${row.game_uid || '-'}</span>
                        </div>
                        <span class="text-xs text-gray-400">第${row.group_number || '?'}组 · ${row.round_name || ''}</span>
                    </div>
                    <div class="flex items-center gap-3 mb-2">
                        <span class="text-xs text-gray-400">报名排名: <span class="text-yellow-400 font-bold">第${row.placement || '?'}名</span></span>
                    </div>
                    ${row.screenshot_path ? `<div class="mb-2"><img src="${fixScreenshotUrl(row.screenshot_path)}" class="max-h-40 rounded border border-gray-700 cursor-pointer hover:border-yellow-500 transition-colors" onclick="window.open(this.src)"></div>` : '<div class="text-xs text-red-400 mb-2">无截图</div>'}
                    <div class="flex gap-2">
                        <button onclick="reviewResult(${row.group_player_id}, 'approve')" class="flex-1 px-3 py-1.5 bg-green-900/50 text-green-300 rounded hover:bg-green-800/50 transition-colors text-xs font-bold">✅ 通过</button>
                        <button onclick="reviewResult(${row.group_player_id}, 'reject')" class="flex-1 px-3 py-1.5 bg-red-900/50 text-red-300 rounded hover:bg-red-800/50 transition-colors text-xs font-bold">❌ 拒绝</button>
                    </div>
                </div>
            `;
        });
        html += '</div>';
        container.innerHTML = html;
    } catch (err) {
        console.error('加载待审核列表失败:', err);
        container.innerHTML = '<div class="text-center text-red-400 py-8">加载失败: ' + err.message + '</div>';
    }
}

// 管理员审核战绩
async function reviewResult(groupPlayerId, action) {
    try {
        const res = await fetch(`${API_BASE}/api/results/${groupPlayerId}/review`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: action })
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error);
        showToast(result.message, action === 'approve' ? '✅' : '❌');
        loadPendingReviews(); // 刷新列表
        loadGroups(); // 刷新分组
    } catch (err) {
        showToast('审核失败: ' + err.message, '❌');
    }
}

// ==================== CSV 导入功能 ====================
async function importPlayers() {
    const csv = document.getElementById('import-players-csv').value.trim();
    const btn = document.getElementById('import-players-btn');
    const resultEl = document.getElementById('import-players-result');
    if (!csv) { showToast('请输入 CSV 数据', '⚠️'); return; }
    btn.disabled = true; btn.textContent = '导入中...';
    try {
        const res = await fetch(`${API_BASE}/api/admin/import/players`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ csv })
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        resultEl.classList.remove('hidden');
        let html = `<div class="bg-green-900/30 border border-green-500/30 rounded-lg p-4">
            <div class="font-bold text-green-300 mb-2">✅ 导入完成</div>
            <div class="text-sm text-gray-300">成功导入 ${data.importedCount} 人`;
        if (data.errorCount > 0) {
            html += `，失败 ${data.errorCount} 人</div>
            <div class="mt-2 text-xs text-red-300">失败详情：<br>${data.errors.join('<br>')}</div>`;
        } else {
            html += `</div>`;
        }
        html += `</div>`;
        resultEl.innerHTML = html;
        showToast(`✅ 成功导入 ${data.importedCount} 人`, '✅');
    } catch (err) {
        resultEl.classList.remove('hidden');
        resultEl.innerHTML = `<div class="bg-red-900/30 border border-red-500/30 rounded-lg p-4 text-red-300">❌ 导入失败：${err.message}</div>`;
        showToast('❌ 导入失败：' + err.message, '❌');
    }
    btn.disabled = false; btn.textContent = '✅ 确认导入';
}

function downloadPlayersTemplate() {
    const csv = '\uFEFFgame_uid,game_nickname,region,contact\n123456,小明,QQ,88888888\n654321,小红,WeChat,wxid123';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'players_template.csv';
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

async function loadRoundsForImport() {
    const select = document.getElementById('import-results-round');
    if (!select) return;
    try {
        const res = await fetch(`${API_BASE}/api/rounds`);
        const rounds = await res.json();
        select.innerHTML = '<option value="">-- 请选择轮次 --</option>' +
            rounds.map(r => `<option value="${r.id}">${r.name} (${r.status === 'active' ? '进行中' : r.status === 'completed' ? '已结束' : '待开始'})</option>`).join('');
    } catch (err) { console.error('加载轮次失败:', err); }
}

async function importResults() {
    const csv = document.getElementById('import-results-csv').value.trim();
    const roundId = document.getElementById('import-results-round').value;
    const btn = document.getElementById('import-results-btn');
    const resultEl = document.getElementById('import-results-result');
    if (!csv) { showToast('请输入 CSV 数据', '⚠️'); return; }
    if (!roundId) { showToast('请选择轮次', '⚠️'); return; }
    btn.disabled = true; btn.textContent = '导入中...';
    try {
        const res = await fetch(`${API_BASE}/api/admin/import/results`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ csv, round_id: parseInt(roundId, 10) })
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        resultEl.classList.remove('hidden');
        let html = `<div class="bg-green-900/30 border border-green-500/30 rounded-lg p-4">
            <div class="font-bold text-green-300 mb-2">✅ 导入完成</div>
            <div class="text-sm text-gray-300">成功导入 ${data.importedCount} 条战绩`;
        if (data.errorCount > 0) {
            html += `，失败 ${data.errorCount} 条</div>
            <div class="mt-2 text-xs text-red-300">失败详情：<br>${data.errors.join('<br>')}</div>`;
        } else {
            html += `</div>`;
        }
        html += `</div>`;
        resultEl.innerHTML = html;
        showToast(`✅ 成功导入 ${data.importedCount} 条战绩`, '✅');
    } catch (err) {
        resultEl.classList.remove('hidden');
        resultEl.innerHTML = `<div class="bg-red-900/30 border border-red-500/30 rounded-lg p-4 text-red-300">❌ 导入失败：${err.message}</div>`;
        showToast('❌ 导入失败：' + err.message, '❌');
    }
    btn.disabled = false; btn.textContent = '✅ 确认导入';
}

// ==================== 初始化 ====================
window.addEventListener('DOMContentLoaded', () => {
    loadStats();
    loadConfig();
    startCountdown();
    updateHeaderStatus();
    // 每 60 秒刷新一次报名统计（仅在报名 Tab 打开时）
    setInterval(() => {
        const activeTab = document.querySelector('.tab-panel:not(.hidden)');
        if (activeTab && activeTab.id === 'panel-register') {
            loadStats();
        }
    }, 60000);  // ← 改为 60 秒
});
