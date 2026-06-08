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
                                    <a href="${gp.screenshot_path}" target="_blank" class="text-blue-400 text-xs bg-blue-900/40 px-2 py-0.5 rounded hover:opacity-80 transition-opacity" title="查看截图">📷</a>
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
        const res = await fetch(`${API_BASE}/api/rounds/current`);
        const currentRound = await res.json();
        if (!currentRound) {
            const sel = document.getElementById('upload-group-select');
            if (sel) sel.innerHTML = '<option>暂无进行中的轮次</option>';
            return;
        }
        const gRes = await fetch(`${API_BASE}/api/groups/${currentRound.id}`);
        const groups = await gRes.json();
        const select = document.getElementById('upload-group-select');
        if (!select) return;
        select.innerHTML = '<option value="">-- 请选择分组 --</option>' +
            groups.map(g => {
                const region = (g.players && g.players.length > 0) ? g.players[0].region : '';
                const regionTag = region === 'QQ' ? '🐧' : region === 'WeChat' ? '💬' : '';
                return `<option value="${g.id}">${regionTag} 第 ${g.group_number} 组 (${g.player_count}人)</option>`;
            }).join('');
        const pd = document.getElementById('placement-select');
        if (pd) pd.innerHTML = [1,2,3,4,5,6,7,8].map(n => `
            <button type="button" onclick="selectPlacement(${n})"
                class="placement-btn border border-gray-700 rounded-lg py-2 text-sm hover:border-yellow-500 hover:text-yellow-400 transition-all duration-200"
                data-placement="${n}">第${n}名</button>
        `).join('');
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
