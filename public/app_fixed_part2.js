// ==================== 数据底表 ====================
let allPlayersCache = [];

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
