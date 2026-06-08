const fs = require('fs');
const filePath = 'app.js';

let content = fs.readFileSync(filePath, 'utf8');

// ========== 1. 修改 switchTab 中的 groups case（已修改，跳过）==========

// ========== 2. 在 loadGroups 函数之前添加新函数 ==========
const newFunctions = `
// ==================== 赛季筛选和玩家检索 ====================

// 加载赛季列表到筛选下拉框
async function loadSeasonsForFilter() {
    try {
        const res = await fetch(\`\${API_BASE}/api/seasons\`);
        const seasons = await res.json();
        const sel = document.getElementById('season-select');
        if (!sel) return;
        
        let html = '<option value="">全部赛季</option>';
        seasons.forEach(s => {
            const selected = s.status === 'active' ? 'selected' : '';
            html += \`<option value="\${s.id}" \${selected}>\${s.name}</option>\`;
        });
        sel.innerHTML = html;
        
        // 触发一次 onSeasonChange 来加载轮次
        onSeasonChange();
    } catch (err) { console.error('加载赛季失败:', err); }
}

// 赛季切换时重新加载轮次
function onSeasonChange() {
    const seasonId = document.getElementById('season-select')?.value;
    loadRounds(seasonId || null);
}

// 加载轮次（支持赛季筛选）
async function loadRounds(seasonId = null) {
    try {
        const res = await fetch(\`\${API_BASE}/api/rounds\`);
        let rounds = await res.json();
        
        // 如果指定了赛季，进行筛选
        if (seasonId) {
            rounds = rounds.filter(r => r.season_id == seasonId);
        }
        
        const sel = document.getElementById('round-select');
        if (!sel) return;
        
        if (rounds.length === 0) {
            sel.innerHTML = '<option value="">暂无轮次</option>';
            const container = document.getElementById('groups-container');
            if (container) container.innerHTML = '<div class="col-span-full text-center py-12 text-gray-500">该赛季暂无分组数据</div>';
            return;
        }
        
        sel.innerHTML = rounds.map(r => \`<option value="\${r.id}">\${r.name}</option>\`).join('');
        loadGroups();
    } catch (err) { console.error('加载轮次失败:', err); }
}

// 检索玩家所在组别
async function searchPlayer() {
    const input = document.getElementById('player-search-input');
    const msgDiv = document.getElementById('search-result-msg');
    if (!input || !input.value.trim()) {
        showMsg('search-result-msg', '请输入游戏ID', 'error');
        return;
    }
    
    const gameUid = input.value.trim();
    const seasonId = document.getElementById('season-select')?.value || '';
    
    try {
        const url = new URL(\`\${API_BASE}/api/players/search\`);
        url.searchParams.append('game_uid', gameUid);
        if (seasonId) url.searchParams.append('season_id', seasonId);
        
        const res = await fetch(url);
        const data = await res.json();
        
        if (!res.ok) {
            showMsg('search-result-msg', data.error || '检索失败', 'error');
            return;
        }
        
        // 显示成功消息
        showMsg('search-result-msg', \`找到！你在【\${data.group.round_name}】第 \${data.group.group_number} 组（\${data.group.season_name}）\`, 'success');
        
        // 自动展开该组
        setTimeout(() => {
            toggleGroupCard(data.group.group_id, true);
            
            // 滚动到该组
            const card = document.getElementById(\`group-card-\${data.group.group_id}\`);
            if (card) {
                card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                card.classList.add('ring-2', 'ring-yellow-400/50');
                setTimeout(() => card.classList.remove('ring-2', 'ring-yellow-400/50'), 3000);
            }
        }, 500);
    } catch (err) {
        showMsg('search-result-msg', '检索失败: ' + err.message, 'error');
    }
}

// 清除检索结果
function clearSearch() {
    const input = document.getElementById('player-search-input');
    const msgDiv = document.getElementById('search-result-msg');
    if (input) input.value = '';
    if (msgDiv) {
        msgDiv.classList.add('hidden');
        msgDiv.textContent = '';
    }
    loadGroups();
}

// 切换组别卡片展开/折叠
function toggleGroupCard(groupId, forceExpand = false) {
    const playersDiv = document.getElementById(\`group-players-\${groupId}\`);
    const chevron = document.getElementById(\`chevron-\${groupId}\`);
    if (!playersDiv) return;
    
    if (forceExpand || playersDiv.style.display === 'none') {
        playersDiv.style.display = 'block';
        if (chevron) chevron.style.transform = 'rotate(180deg)';
    } else {
        playersDiv.style.display = 'none';
        if (chevron) chevron.style.transform = 'rotate(0deg)';
    }
}

// 显示消息
function showMsg(elementId, text, type) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.classList.remove('hidden');
    el.textContent = text;
    el.className = 'mt-2 text-sm ';
    if (type === 'error') {
        el.className += 'text-red-400 bg-red-900/30 px-3 py-2 rounded-lg';
    } else if (type === 'success') {
        el.className += 'text-green-400 bg-green-900/30 px-3 py-2 rounded-lg';
    } else {
        el.className += 'text-gray-500';
    }
}

`;

// 在 loadGroups 函数之前插入新函数
const insertPos = content.indexOf('async function loadGroups()');
if (insertPos !== -1) {
    content = content.slice(0, insertPos) + newFunctions + '\n' + content.slice(insertPos);
    console.log('[OK] 已添加新函数（赛季筛选、玩家检索、折叠功能）');
} else {
    console.error('[Error] 找不到 loadGroups 函数');
    process.exit(1);
}

// ========== 3. 修改 loadGroups 函数，支持赛季筛选 ==========
const oldLoadGroupsStart = `async function loadGroups() {
    const roundId = document.getElementById('round-select')?.value;
    if (!roundId) return;`;

const newLoadGroupsStart = `async function loadGroups() {
    const roundId = document.getElementById('round-select')?.value;
    if (!roundId) {
        const container = document.getElementById('groups-container');
        if (container) container.innerHTML = '<div class="col-span-full text-center py-12 text-gray-500">请先选择轮次</div>';
        return;
    }`;

if (content.includes(oldLoadGroupsStart)) {
    content = content.replace(oldLoadGroupsStart, newLoadGroupsStart);
    console.log('[OK] 已修改 loadGroups 函数');
} else {
    console.error('[Error] 找不到 loadGroups 函数开头');
    process.exit(1);
}

// ========== 4. 替换 renderGroupCard 函数，改为可折叠 ==========
const oldRenderFunc = `function renderGroupCard(g, medalColors) {
    const groupRegion = (g.players && g.players.length > 0) ? g.players[0].region : null;
    const borderColor = groupRegion === 'QQ' ? 'hover:border-blue-500/50 border-l-4 border-l-blue-500/60' : groupRegion === 'WeChat' ? 'hover:border-green-500/50 border-l-4 border-l-green-500/60' : 'hover:border-yellow-500/30';
    const regionBadge = groupRegion === 'QQ' 
        ? '<span class="text-xs bg-blue-900/60 text-blue-300 px-2 py-0.5 rounded font-medium">🐧 QQ区</span>' 
        : groupRegion === 'WeChat' 
        ? '<span class="text-xs bg-green-900/60 text-green-300 px-2 py-0.5 rounded font-medium">💬 微信区</span>' 
        : '';
    return \`
        <div class="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl border border-gray-700 overflow-hidden \${borderColor} transition-colors">
            <div class="bg-gray-800/80 px-5 py-4 flex items-center justify-between">
                <div class="flex items-center gap-3">
                    <div class="font-bold text-yellow-400 text-lg">🏆 第 \${g.group_number} 组</div>
                    \${regionBadge}
                </div>
                <div class="text-xs text-gray-400 bg-gray-900 px-3 py-1 rounded-full">\${g.player_count}/8 人</div>
            </div>
            <div class="divide-y divide-gray-800/50">
                \ ${(g.players && g.players.length > 0) ? g.players.map((gp, idx) => {
                    const rankCls = gp.placement && gp.placement <= 4 ? medalColors[(gp.placement || 1) - 1] : 'bg-gray-800/50 text-gray-500';
                    return \`
                        <div class="px-5 py-3 flex items-center justify-between hover:bg-gray-800/30 transition-colors">
                            <div class="flex items-center gap-3">
                                <span class="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold \${gp.placement ? rankCls : 'bg-gray-800 text-gray-600'}">
                                    \${gp.placement || '-'}
                                </span>
                                <div>
                                    <div class="text-white font-medium">\${gp.game_nickname}</div>
                                    <div class="text-xs text-gray-500 font-mono">ID: \${gp.game_uid}</div>
                                </div>
                            </div>
                            <div class="flex items-center gap-2">
                                \${gp.screenshot_path ? \`
                                    <button onclick="verifyPlayerScreenshot(\${gp.id})" 
                                        class="text-xs \${gp.verified ? 'text-green-400 bg-green-900/40' : 'text-yellow-400 bg-yellow-900/40'} px-2 py-0.5 rounded hover:opacity-80 transition-opacity"
                                        title="点击验证截图">
                                        \${gp.verified ? '✓ 已验证' : '⚠️ 未验证'}
                                    </button>
                                    <a href="\${gp.screenshot_path}" target="_blank" class="text-blue-400 text-xs bg-blue-900/40 px-2 py-0.5 rounded hover:opacity-80 transition-opacity" title="查看截图">📷</a>
                                \` : ''}
                                \${gp.placement && gp.placement <= 4 ? '<span class="text-yellow-400 text-xs">⬆️ 晋级</span>' : ''}
                            </div>
                        </div>
                    \`;
                }).join('') : '<div class="px-5 py-8 text-center text-gray-500 text-sm">暂无玩家</div>'}
            </div>
        </div>
    \`;
}`;

// 新的可折叠 renderGroupCard 函数
const newRenderFunc = `function renderGroupCard(g, medalColors) {
    const groupRegion = (g.players && g.players.length > 0) ? g.players[0].region : null;
    const borderColor = groupRegion === 'QQ' ? 'hover:border-blue-500/50 border-l-4 border-l-blue-500/60' : groupRegion === 'WeChat' ? 'hover:border-green-500/50 border-l-4 border-l-green-500/60' : 'hover:border-yellow-500/30';
    const regionBadge = groupRegion === 'QQ' 
        ? '<span class="text-xs bg-blue-900/60 text-blue-300 px-2 py-0.5 rounded font-medium">🐧 QQ区</span>' 
        : groupRegion === 'WeChat' 
        ? '<span class="text-xs bg-green-900/60 text-green-300 px-2 py-0.5 rounded font-medium">💬 微信区</span>' 
        : '';
    return \`
        <div id="group-card-\${g.id}" class="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl border border-gray-700 overflow-hidden \${borderColor} transition-colors">
            <div onclick="toggleGroupCard(\${g.id})" class="bg-gray-800/80 px-5 py-4 flex items-center justify-between cursor-pointer hover:bg-gray-800/90 transition-colors">
                <div class="flex items-center gap-3">
                    <div class="font-bold text-yellow-400 text-lg">🏆 第 \${g.group_number} 组</div>
                    \${regionBadge}
                    <svg id="chevron-\${g.id}" class="w-4 h-4 text-gray-400 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                    </svg>
                </div>
                <div class="text-xs text-gray-400 bg-gray-900 px-3 py-1 rounded-full">\${g.player_count}/8 人</div>
            </div>
            <div id="group-players-\${g.id}" style="display:none;" class="divide-y divide-gray-800/50">
                \ ${(g.players && g.players.length > 0) ? g.players.map((gp, idx) => {
                    const rankCls = gp.placement && gp.placement <= 4 ? medalColors[(gp.placement || 1) - 1] : 'bg-gray-800/50 text-gray-500';
                    return \`
                        <div class="px-5 py-3 flex items-center justify-between hover:bg-gray-800/30 transition-colors">
                            <div class="flex items-center gap-3">
                                <span class="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold \${gp.placement ? rankCls : 'bg-gray-800 text-gray-600'}">
                                    \${gp.placement || '-'}
                                </span>
                                <div>
                                    <div class="text-white font-medium">\${gp.game_nickname}</div>
                                    <div class="text-xs text-gray-500 font-mono">ID: \${gp.game_uid}</div>
                                </div>
                            </div>
                            <div class="flex items-center gap-2">
                                \${gp.screenshot_path ? \`
                                    <button onclick="event.stopPropagation(); verifyPlayerScreenshot(\${gp.id})" 
                                        class="text-xs \${gp.verified ? 'text-green-400 bg-green-900/40' : 'text-yellow-400 bg-yellow-900/40'} px-2 py-0.5 rounded hover:opacity-80 transition-opacity"
                                        title="点击验证截图">
                                        \${gp.verified ? '✓ 已验证' : '⚠️ 未验证'}
                                    </button>
                                    <a href="\${gp.screenshot_path}" target="_blank" class="text-blue-400 text-xs bg-blue-900/40 px-2 py-0.5 rounded hover:opacity-80 transition-opacity" title="查看截图" onclick="event.stopPropagation()">📷</a>
                                \` : ''}
                                \${gp.placement && gp.placement <= 4 ? '<span class="text-yellow-400 text-xs">⬆️ 晋级</span>' : ''}
                            </div>
                        </div>
                    \`;
                }).join('') : '<div class="px-5 py-8 text-center text-gray-500 text-sm">暂无玩家</div>'}
            </div>
        </div>
    \`;
}`;

if (content.includes(oldRenderFunc)) {
    content = content.replace(oldRenderFunc, newRenderFunc);
    console.log('[OK] 已替换 renderGroupCard 函数（添加折叠功能）');
} else {
    console.error('[Error] 找不到 renderGroupCard 函数');
    process.exit(1);
}

// 写入文件
fs.writeFileSync(filePath, content, 'utf8');
console.log('\n[Success] app.js 已更新！');
console.log('新增功能：');
console.log('  1. 赛季筛选下拉框');
console.log('  2. 组别可折叠（点击展开/收起）');
console.log('  3. 玩家检索功能（输入游戏ID，自动定位并展开所在组）');
