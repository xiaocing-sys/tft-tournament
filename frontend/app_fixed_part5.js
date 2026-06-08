// ==================== 晋级榜 ====================
async function loadBracket() {
    const container = document.getElementById('bracket-container');
    if (!container) return;
    container.innerHTML = '<div class="text-center py-8 text-gray-500">加载中...</div>';
    try {
        const rRes = await fetch(`${API_BASE}/api/rounds`);
        const rounds = await rRes.json();
        if (rounds.length === 0) {
            container.innerHTML = '<div class="text-center py-16 text-gray-500 text-lg">🎮 暂无赛事数据，请先报名并生成分组</div>';
            return;
        }
        const aRes = await fetch(`${API_BASE}/api/advancements`);
        const allAdv = await aRes.json();
        let html = '';
        for (const round of rounds) {
            const roundAdv = allAdv.filter(a => a.from_round_id == round.id);
            const isCompleted = round.status === 'completed';
            const isActive = round.status === 'active';
            html += `
                <div class="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl border ${isCompleted ? 'border-green-500/30' : isActive ? 'border-yellow-500/30' : 'border-gray-700'} overflow-hidden">
                    <div class="px-6 py-4 flex items-center gap-3 ${isCompleted ? 'bg-green-900/20' : isActive ? 'bg-yellow-900/20' : 'bg-gray-800/50'}">
                        <span class="text-2xl">${isCompleted ? '✅' : isActive ? '🔥' : '⏳'}</span>
                        <h3 class="font-bold text-lg ${isCompleted ? 'text-green-400' : isActive ? 'text-yellow-400' : 'text-gray-400'}">${round.name}</h3>
                        <span class="text-xs text-gray-500 ml-auto">${round.started_at ? new Date(round.started_at).toLocaleDateString('zh-CN') : ''}</span>
                    </div>
            `;
            if (roundAdv.length > 0) {
                html += `<div class="p-6"><div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">`;
                const groupsInRound = [...new Set(roundAdv.map(a => a.from_group_id))];
                for (const gid of groupsInRound) {
                    const gpAdv = roundAdv.filter(a => a.from_group_id == gid);
                    const groupNum = rounds.find(r => r.id == gid)?.group_number || '';
                    html += `<div class="bg-gray-800/50 rounded-xl p-3 border border-gray-700/50">
                        <div class="text-xs text-yellow-400 mb-2 font-semibold">第${groupNum}组 晋级</div>`;
                    for (const a of gpAdv) {
                        html += `<div class="flex items-center gap-2 py-1.5">
                            <span class="w-6 h-6 rounded-full bg-yellow-500/20 flex items-center justify-center text-yellow-400 font-bold text-xs">${a.placement}</span>
                            <span class="text-sm text-white">${a.game_nickname}</span>
                            <span class="text-xs text-gray-500 ml-auto">${a.region === 'QQ' ? 'QQ' : 'WX'}</span>
                        </div>`;
                    }
                    html += `</div>`;
                }
                html += `</div></div>`;
            } else {
                html += `<div class="px-6 py-8 text-center text-gray-500 text-sm">该轮次暂无晋级数据，请先在分组中提交战绩并生成晋级名单</div>`;
            }
            html += `</div>`;
        }
        const uniqueAdvanced = [];
        const seen = new Set();
        for (const a of allAdv) {
            if (!seen.has(a.player_id)) {
                seen.add(a.player_id);
                uniqueAdvanced.push(a);
            }
        }
        if (uniqueAdvanced.length > 0 && uniqueAdvanced.length <= 8) {
            html += `
                <div class="bg-gradient-to-br from-yellow-900/30 via-orange-900/20 to-red-900/30 rounded-2xl border border-yellow-400/40 overflow-hidden glow-gold">
                    <div class="bg-yellow-900/30 px-6 py-4 text-center">
                        <h3 class="font-bold text-2xl text-yellow-400">🏆 最终八强 🏆</h3>
                        <p class="text-yellow-200/60 text-sm mt-1">恭喜以下选手晋级最终八强！</p>
                    </div>
                    <div class="p-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
                        ${uniqueAdvanced.map((a, i) => `
                            <div class="bg-gray-900/60 rounded-xl p-4 text-center border border-yellow-500/20 hover:border-yellow-500/50 transition-colors">
                                <div class="text-3xl mb-2">${['🥇','🥈','🥉','4','5','6','7','8'][i] || (i+1)}</div>
                                <div class="text-white font-bold">${a.game_nickname}</div>
                                <div class="text-xs text-gray-500 font-mono mt-1">${a.game_uid}</div>
                                <div class="mt-2"><span class="text-xs px-2 py-0.5 rounded ${a.region === 'QQ' ? 'bg-blue-900/50 text-blue-300' : 'bg-green-900/50 text-green-300'}">${a.region === 'QQ' ? 'QQ区' : '微信区'}</span></div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }
        container.innerHTML = html;
    } catch (err) {
        container.innerHTML = '<div class="text-center py-8 text-red-400">加载失败: ' + err.message + '</div>';
        console.error(err);
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
    if (btn) { btn.disabled = true; btn.textContent = '🎲 随机分组中...'; }
    try {
        const res = await fetch(`${API_BASE}/api/groups/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ round_number: 1 })
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error);
        showToast(`🎉 随机分组完成！共 ${result.total_groups} 组，${result.total_players} 人`, '🎉');
        showMsg('admin-msg', `分组成功！共 ${result.total_groups} 组，每组最多8人。可在"分组对战"标签页查看详情。`, 'success');
    } catch (err) {
        showMsg('admin-msg', '❌ ' + err.message, 'error');
    }
    if (btn) { btn.disabled = false; btn.textContent = '🎲 随机分组'; }
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

// ==================== 初始化 ====================
window.addEventListener('DOMContentLoaded', () => {
    loadStats();
    updateHeaderStatus();
    setInterval(() => {
        const activeTab = document.querySelector('.tab-panel:not(.hidden)');
        if (!activeTab || activeTab.id === 'panel-register') loadStats();
    }, 30000);
});
