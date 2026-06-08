// ==================== 配置 ====================
const API_BASE = '';

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
        case 'groups': loadRounds(); break;
        case 'upload': loadGroupsForUpload(); break;
        case 'bracket': loadBracket(); break;
        case 'datasheet': loadDataSheet(); break;
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

async function submitRegistrationQQ(e) {
    e.preventDefault();
    await doRegister('QQ', {
        contact: document.getElementById('reg-qq-contact').value.trim(),
        game_nickname: document.getElementById('reg-qq-nickname').value.trim(),
        game_uid: document.getElementById('reg-qq-uid').value.trim(),
        award_qq: document.getElementById('reg-qq-award').value.trim()
    }, 'register-btn-qq', 'register-msg-qq', 'register-form-qq');
}

async function submitRegistrationWeChat(e) {
    e.preventDefault();
    await doRegister('WeChat', {
        contact: document.getElementById('reg-wx-contact').value.trim(),
        game_nickname: document.getElementById('reg-wx-nickname').value.trim(),
        game_uid: document.getElementById('reg-wx-uid').value.trim(),
        award_qq: document.getElementById('reg-wx-award').value.trim()
    }, 'register-btn-wx', 'register-msg-wx', 'register-form-wechat');
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
        const res = await fetch(`${API_BASE}/api/players/count`);
        const { count } = await res.json();
        const el = document.getElementById('stat-total');
        if (el) el.textContent = count;
        const groups = Math.ceil(count / 8);
        const el2 = document.getElementById('stat-groups');
        if (el2) el2.textContent = groups;
        const rounds = count > 8 ? Math.ceil(Math.log2(Math.ceil(count / 8))) + 1 : (count > 0 ? 1 : 0);
        const el3 = document.getElementById('stat-rounds');
        if (el3) el3.textContent = rounds || 0;
    } catch (err) { console.error('加载统计失败:', err); }
}

// ==================== 参赛名单 ====================
async function loadPlayers() {
    const tbody = document.getElementById('players-tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-gray-500">加载中...</td></tr>';
    try {
        const res = await fetch(`${API_BASE}/api/players`);
        const players = await res.json();
        const countEl = document.getElementById('players-count');
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
    } catch (err) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-red-400">加载失败，请检查后端服务</td></tr>';
    }
}
