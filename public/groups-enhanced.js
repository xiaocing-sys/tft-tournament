// groups-enhanced.js
// 分组对战页面增强功能：赛季筛选 + 组别折叠(手风琴模式) + 玩家检索 + 大区筛选 + 昵称编辑 + QQ群号
// 版本: 20250606k

console.log("[groups-enhanced.js] 加载开始，版本 20250606k");

// 当前选中的大区筛选
var currentRegionFilter = 'all';

// 当前展开的组别ID
var currentlyExpandedGroupId = null;

// ==================== 组别折叠(手风琴模式) ====================

function toggleGroupCard(groupId, forceExpand) {
    groupId = parseInt(groupId);
    if (isNaN(groupId)) return;

    var playersDiv = document.getElementById("group-players-" + groupId);
    var chevron = document.getElementById("chevron-" + groupId);
    if (!playersDiv) return;

    var isCurrentlyHidden = playersDiv.classList.contains("hidden");

    if (forceExpand) {
        foldAllGroupsExcept(groupId);
        playersDiv.classList.remove("hidden");
        if (chevron) chevron.style.transform = "rotate(180deg)";
        currentlyExpandedGroupId = groupId;
    } else {
        if (isCurrentlyHidden) {
            foldAllGroupsExcept(groupId);
            playersDiv.classList.remove("hidden");
            if (chevron) chevron.style.transform = "rotate(180deg)";
            currentlyExpandedGroupId = groupId;
        } else {
            playersDiv.classList.add("hidden");
            if (chevron) chevron.style.transform = "rotate(0deg)";
            currentlyExpandedGroupId = null;
        }
    }
}

function foldAllGroupsExcept(groupId) {
    var allDivs = document.querySelectorAll('[id^="group-players-"]');
    for (var i = 0; i < allDivs.length; i++) {
        var div = allDivs[i];
        var idStr = div.id.replace("group-players-", "");
        var id = parseInt(idStr);
        if (!isNaN(id) && id !== groupId) {
            div.classList.add("hidden");
            var c = document.getElementById("chevron-" + id);
            if (c) c.style.transform = "rotate(0deg)";
        }
    }
}

// ==================== 大区筛选 ====================

function filterGroupsByRegion(region) {
    currentRegionFilter = region;

    // 更新按钮样式
    var allBtn = document.getElementById("group-filter-all");
    var qqBtn = document.getElementById("group-filter-qq");
    var wxBtn = document.getElementById("group-filter-wx");

    if (allBtn) {
        allBtn.className = region === 'all'
            ? "group-filter-btn px-3 py-1 rounded-lg text-xs font-medium bg-yellow-500/20 text-yellow-400 border border-yellow-500/30"
            : "group-filter-btn px-3 py-1 rounded-lg text-xs font-medium bg-[#161620]/40 text-gray-300 border border-yellow-500/15 hover:border-yellow-500/50 hover:text-yellow-400";
    }
    if (qqBtn) {
        qqBtn.className = region === 'QQ'
            ? "group-filter-btn px-3 py-1 rounded-lg text-xs font-medium bg-blue-500/20 text-blue-400 border border-blue-500/30"
            : "group-filter-btn px-3 py-1 rounded-lg text-xs font-medium bg-[#161620]/40 text-gray-300 border border-yellow-500/15 hover:border-blue-500/50 hover:text-blue-400";
    }
    if (wxBtn) {
        wxBtn.className = region === 'WeChat'
            ? "group-filter-btn px-3 py-1 rounded-lg text-xs font-medium bg-green-500/20 text-green-400 border border-green-500/30"
            : "group-filter-btn px-3 py-1 rounded-lg text-xs font-medium bg-[#161620]/40 text-gray-300 border border-yellow-500/15 hover:border-green-500/50 hover:text-green-400";
    }

    // 重新渲染分组
    loadGroups();
}

// ==================== 渲染组别卡片 ====================

function renderGroupCard(g, medalColors) {
    var region = (g.players && g.players.length > 0) ? g.players[0].region : null;
    var groupStatus = g.group_status || 'pending';
    var borderCls = "";
    if (region === "QQ") {
        if (groupStatus === 'finished') borderCls = "border-l-4 border-l-gray-500/60";
        else if (groupStatus === 'active') borderCls = "border-l-4 border-l-blue-500/60";
        else borderCls = "border-l-4 border-l-blue-300/60";
    } else if (region === "WeChat") {
        if (groupStatus === 'finished') borderCls = "border-l-4 border-l-gray-500/60";
        else if (groupStatus === 'active') borderCls = "border-l-4 border-l-green-500/60";
        else borderCls = "border-l-4 border-l-green-300/60";
    }

    var regionBadge = "";
    if (region === "QQ") {
        regionBadge = '<span class="text-xs bg-blue-900/60 text-blue-300 px-2 py-0.5 rounded font-medium">QQ区</span>';
    } else if (region === "WeChat") {
        regionBadge = '<span class="text-xs bg-green-900/60 text-green-300 px-2 py-0.5 rounded font-medium">微信区</span>';
    }
    var finishedBadge = "";
    if (groupStatus === 'finished') {
        finishedBadge = '<span class="text-xs bg-[#1e1e2a]/60 text-gray-300 px-2 py-0.5 rounded font-medium ml-1">已完赛</span>';
    }

    // QQ群号输入框（标题栏中间）
    var isAdmin = typeof checkAdminAuth === "function" ? (localStorage.getItem("tft_admin_auth") === "true") : false;
    var qqGroupLocked = g.qq_group_locked === 1;
    var qqGroupNum = g.qq_group_number || "";

    var qqGroupHtml = "";
    if (qqGroupLocked && !isAdmin) {
        // 已锁定，非管理员只能查看
        qqGroupHtml = '<span class="text-xs text-gray-300 bg-[#0f0f18]/60 px-2 py-0.5 rounded font-mono">群:' + qqGroupNum + '</span>';
    } else if (qqGroupLocked && isAdmin) {
        // 已锁定，管理员可修改（需二次确认）
        qqGroupHtml = '<input type="text" value="' + qqGroupNum + '" placeholder="QQ群号"'
            + ' onkeydown="if(event.key===\'Enter\'){event.stopPropagation();handleQqGroupAdminEdit(' + g.id + ',this)}"'
            + ' onblur="handleQqGroupAdminEdit(' + g.id + ',this)"'
            + ' class="qq-group-input w-28 bg-[#1e1e2a]/60 border border-yellow-500/30 rounded px-2 py-0.5 text-xs text-white text-center font-mono placeholder-gray-500 focus:outline-none focus:border-yellow-500" />';
    } else {
        // 未锁定，填写后二次确认并锁定
        qqGroupHtml = '<input type="text" value="' + qqGroupNum + '" placeholder="填写QQ群号"'
            + ' onkeydown="if(event.key===\'Enter\'){event.stopPropagation();handleQqGroupInput(' + g.id + ',this)}"'
            + ' onblur="if(this.value.trim()){handleQqGroupInput(' + g.id + ',this)}"'
            + ' class="qq-group-input w-28 bg-[#1e1e2a]/60 border border-yellow-500/20 rounded px-2 py-0.5 text-xs text-white text-center font-mono placeholder-gray-500 focus:outline-none focus:border-yellow-500" />';
    }

    // 自动淘汰按钮（仅管理员可见，且组未完赛）
    var autoEliminateBtnHtml = "";
    if (isAdmin && groupStatus !== 'finished') {
        // 检查是否有玩家已提交成绩
        var hasSubmission = g.players && g.players.some(function(p) { return p.placement; });
        if (hasSubmission) {
            autoEliminateBtnHtml = '<button onclick="autoEliminate(' + g.id + ', this)" class="text-xs bg-red-900/60 text-red-400 px-2 py-0.5 rounded hover:bg-red-900/80 transition-colors">自动淘汰</button>';
        }
    }

    var playersHtml = "";
    if (g.players && g.players.length > 0) {
        for (var pi = 0; pi < g.players.length; pi++) {
            var gp = g.players[pi];
            var rankCls = "bg-[#161620]/50 text-gray-300";
            if (gp.placement && gp.placement <= 4) {
                rankCls = medalColors[(gp.placement || 1) - 1];
            }
            var verifiedBtnHtml = "";
            if (gp.screenshot_path) {
                var verifyText = gp.verified ? "已验证" : "未验证";
                var verifyCls = gp.verified ? "text-green-400 bg-green-900/40" : "text-yellow-400 bg-yellow-900/40";
                // 管理员可点击切换验证状态
                var verifyClick = isAdmin ? ' onclick="toggleVerify(' + gp.id + ', ' + g.id + ', this)" style="cursor:pointer;" title="点击切换验证状态"' : '';
                verifiedBtnHtml = '<button class="verify-btn text-xs ' + verifyCls + ' px-2 py-0.5 rounded" data-gpid="' + gp.id + '"' + verifyClick + '>' + verifyText + '</button>'
                    + '<button class="text-blue-400 text-xs bg-blue-900/40 px-2 py-0.5 rounded" onclick="event.stopPropagation();showImagePreview(\'' + gp.screenshot_path + '\')">截图</button>';
            }
            // 晋级标签：管理员可点击切换
            var promoteBadge = "";
            if (gp.placement && gp.placement <= 4) {
                var promoteClick = isAdmin ? ' onclick="togglePromote(' + gp.id + ', ' + g.id + ', ' + gp.placement + ', this)" style="cursor:pointer;" title="点击切换晋级/淘汰"' : '';
                promoteBadge = '<span class="text-yellow-400 text-xs"' + promoteClick + '>晋级</span>';
            } else if (gp.placement && gp.placement > 4) {
                var promoteClick = isAdmin ? ' onclick="togglePromote(' + gp.id + ', ' + g.id + ', ' + gp.placement + ', this)" style="cursor:pointer;" title="点击切换晋级/淘汰"' : '';
                promoteBadge = '<span class="text-gray-300 text-xs"' + promoteClick + '>淘汰</span>';
            }
            // 名次圆圈：管理员可点击修改
            var rankDisplay = gp.placement ? gp.placement : "-";
            var rankClick = (isAdmin && gp.placement) ? ' onclick="editPlacement(' + gp.id + ', ' + g.id + ', ' + gp.placement + ', this)" style="cursor:pointer;" title="点击修改名次"' : '';
            var submittedBadge = (gp.submitted === 1) ? '<span class="text-gray-300 text-xs bg-[#161620]/50 px-2 py-0.5 rounded">已提交</span>' : "";
            var circleCls = "bg-[#161620] text-gray-300";
            if (gp.placement) circleCls = rankCls;

            // 昵称编辑：仅管理员可编辑（使用 data- 属性存储 player_id，更可靠）
            var nicknameHtml = '';
            if (isAdmin) {
                nicknameHtml = '<span class="nickname-edit cursor-pointer border-b border-dashed border-yellow-500/30 hover:border-yellow-400 hover:text-yellow-300 transition-colors"'
                    + ' data-player-id="' + (gp.player_id || '') + '"'
                    + ' onclick="event.stopPropagation();editNickname(this)"'
                    + ' title="点击修改昵称">' + (gp.game_nickname || "") + '</span>';
            } else {
                nicknameHtml = '<span>' + (gp.game_nickname || "") + '</span>';
            }

            playersHtml += '<div class="px-5 py-3 flex items-center justify-between hover:bg-[#161620]/25 transition-colors">'
                + '<div class="flex items-center gap-3">'
                + '<span class="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ' + circleCls + '"' + (rankClick || '') + '>' + rankDisplay + '</span>'
                + '<div>'
                + '<div class="text-white font-medium">' + nicknameHtml + '</div>'
                + '<div class="text-xs text-gray-300 font-mono">ID: ' + (gp.game_uid || "") + '</div>'
                + '</div>'
                + '</div>'
                + '<div class="flex items-center gap-2">'
                + verifiedBtnHtml
                + promoteBadge
                + submittedBadge
                + '</div>'
                + '</div>';
        }
    } else {
        playersHtml = '<div class="px-5 py-8 text-center text-gray-300 text-sm">暂无玩家</div>';
    }

    var cardBgCls = "";
    if (groupStatus === 'finished') {
        cardBgCls = "opacity-75";
    }

    return '<div id="group-card-' + g.id + '" class="rounded-2xl border border-yellow-500/15 overflow-hidden ' + borderCls + ' transition-colors ' + cardBgCls + '" style="background: rgba(15, 15, 24, 0.35); backdrop-filter: blur(4px);">'
        + '<div class="group-header px-5 py-4 flex items-center justify-between cursor-pointer transition-colors hover:bg-[#161620]/40" data-groupid="' + g.id + '" style="background: rgba(22, 22, 32, 0.4);">'
        + '<div class="flex items-center gap-3">'
        + '<div class="font-bold text-yellow-400 text-lg">第 ' + (g.display_number || g.group_number) + ' 组</div>'
        + regionBadge + finishedBadge
        + '<svg id="chevron-' + g.id + '" class="w-4 h-4 text-gray-300 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>'
        + '</div>'
        + '<div class="flex items-center gap-2">'
        + qqGroupHtml
        + autoEliminateBtnHtml
        + '<div class="text-xs text-gray-300 px-3 py-1 rounded-full" style="background: rgba(15, 15, 24, 0.5);">' + (g.player_count || g.players.length) + '/8 人</div>'
        + '</div>'
        + '</div>'
        + '<div id="group-players-' + g.id + '" class="divide-y divide-gray-800/50 hidden">'
        + playersHtml
        + '</div>'
        + '</div>';
}

// ==================== QQ群号处理 ====================

// ==================== 截图预览 ====================

function showImagePreview(url) {
    var overlay = document.getElementById('image-preview-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'image-preview-overlay';
        overlay.className = 'fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-50 hidden';
        overlay.innerHTML = ''
            + '<div class="relative max-w-4xl max-h-[90vh] w-full mx-4 flex flex-col items-center">'
            + '<img id="image-preview-img" class="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl border border-yellow-500/15" />'
            + '<div class="mt-4 text-gray-300 text-sm">点击任意处关闭</div>'
            + '</div>';
        document.body.appendChild(overlay);
        overlay.onclick = function() { overlay.classList.add('hidden'); };
    }
    document.getElementById('image-preview-img').src = url;
    overlay.classList.remove('hidden');
}

// ==================== 管理员手动设置状态 ====================

function refreshGroup(groupId) {
    fetch(`${API_BASE}/api/groups/detail/${groupId}`)
    .then(res => res.json())
    .then(group => {
        var card = document.getElementById('group-card-' + groupId);
        if (!card) return;
        // 记录当前展开状态
        var playersDiv = document.getElementById('group-players-' + groupId);
        var wasExpanded = playersDiv && !playersDiv.classList.contains('hidden');
        var medalColors = ['bg-yellow-500/20 text-yellow-400', 'bg-gray-400/20 text-gray-300', 'bg-orange-600/20 text-orange-400', 'bg-blue-500/20 text-blue-400'];
        var newHtml = renderGroupCard(group, medalColors);
        // 提取内部HTML（去掉外层div，因为我们要替换整个卡片）
        var temp = document.createElement('div');
        temp.innerHTML = newHtml;
        var newCard = temp.firstChild;
        card.parentNode.replaceChild(newCard, card);
        // 恢复展开状态
        if (wasExpanded) {
            var newPlayersDiv = document.getElementById('group-players-' + groupId);
            var newChevron = document.getElementById('chevron-' + groupId);
            if (newPlayersDiv) newPlayersDiv.classList.remove('hidden');
            if (newChevron) newChevron.classList.add('rotate-180');
        }
    })
    .catch(err => {
        console.error('刷新分组失败:', err);
        // 降级：刷新整个列表
        if (typeof loadGroups === 'function') loadGroups();
    });
}

function toggleVerify(groupPlayerId, groupId, btn) {
    if (btn) { btn.disabled = true; btn.textContent = '...'; }
    fetch(`${API_BASE}/api/admin/group-players/${groupPlayerId}/verify`, {
        method: 'POST'
    })
    .then(res => res.json())
    .then(result => {
        if (result.success) {
            showToast(result.message, '✅');
            refreshGroup(groupId);
        } else {
            showToast('❌ ' + (result.error || '操作失败'), '❌');
        }
    })
    .catch(err => {
        showToast('❌ 网络错误：' + err.message, '❌');
    })
    .finally(() => {
        if (btn) { btn.disabled = false; }
    });
}

function togglePromote(groupPlayerId, groupId, currentPlacement, btn) {
    if (btn) { btn.style.pointerEvents = 'none'; }
    if (!currentPlacement) {
        showToast('⚠️ 该玩家尚未提交名次，无法切换', '⚠️');
        if (btn) { btn.style.pointerEvents = ''; }
        return;
    }
    var newPlacement = currentPlacement <= 4 ? 5 : 1;
    var newStatus = newPlacement <= 4 ? 'advanced' : 'eliminated';
    fetch(`${API_BASE}/api/admin/group-players/${groupPlayerId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placement: newPlacement, player_status: newStatus })
    })
    .then(res => res.json())
    .then(result => {
        if (result.success) {
            showToast('✅ 状态已切换', '✅');
            refreshGroup(groupId);
        } else {
            showToast('❌ ' + (result.error || '操作失败'), '❌');
        }
    })
    .catch(err => {
        showToast('❌ 网络错误：' + err.message, '❌');
    })
    .finally(() => {
        if (btn) { btn.style.pointerEvents = ''; }
    });
}

function editPlacement(groupPlayerId, groupId, currentPlacement, el) {
    showInputDialog('修改名次', '请输入 1-8 的名次', currentPlacement, function(newPlacement) {
        if (!newPlacement) return;
        newPlacement = parseInt(newPlacement);
        if (isNaN(newPlacement) || newPlacement < 1 || newPlacement > 8) {
            showToast('❌ 名次必须是 1-8 的数字', '❌');
            return;
        }
        var newStatus = newPlacement <= 4 ? 'advanced' : 'eliminated';
        fetch(`${API_BASE}/api/admin/group-players/${groupPlayerId}/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ placement: newPlacement, player_status: newStatus })
        })
        .then(res => res.json())
        .then(result => {
            if (result.success) {
                showToast('✅ 名次已更新为第 ' + newPlacement + ' 名', '✅');
                refreshGroup(groupId);
            } else {
                showToast('❌ ' + (result.error || '更新失败'), '❌');
            }
        })
        .catch(err => {
            showToast('❌ 网络错误：' + err.message, '❌');
        });
    });
}

// ==================== 自动淘汰 ====================

function autoEliminate(groupId, btn) {
    if (btn) { btn.disabled = true; btn.textContent = '处理中...'; }
    fetch(`${API_BASE}/api/groups/${groupId}/auto-eliminate`, {
        method: 'POST'
    })
    .then(res => res.json())
    .then(result => {
        if (result.success) {
            showToast(`✅ 自动淘汰完成！共淘汰 ${result.eliminated} 人` + (result.finished ? '，该组已完赛。' : ''), '✅');
            // 刷新分组页面
            if (typeof loadGroups === 'function') loadGroups();
        } else {
            showToast('❌ ' + (result.error || '自动淘汰失败'), '❌');
        }
    })
    .catch(err => {
        showToast('❌ 网络错误：' + err.message, '❌');
    })
    .finally(() => {
        if (btn) { btn.disabled = false; btn.textContent = '自动淘汰'; }
    });
}

// 自定义确认弹窗（替代原生confirm）
function showQqGroupConfirm(message, onConfirm) {
    var overlay = document.getElementById('qq-group-confirm-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'qq-group-confirm-overlay';
        overlay.className = 'fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50';
        overlay.innerHTML = ''
            + '<div class="bg-[#0f0f18] border border-yellow-500/30 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl">'
            + '<div class="text-lg font-bold text-yellow-400 mb-3">⚠️ 确认QQ群号</div>'
            + '<div id="qq-group-confirm-msg" class="text-gray-200 text-sm mb-6 leading-relaxed"></div>'
            + '<div class="flex gap-3 justify-end">'
            + '<button id="qq-group-confirm-cancel" class="px-4 py-2 rounded-lg bg-[#1e1e2a] text-gray-300 text-sm hover:bg-[#252530] transition-colors">取消</button>'
            + '<button id="qq-group-confirm-ok" class="px-4 py-2 rounded-lg bg-yellow-500 text-gray-900 text-sm font-bold hover:bg-yellow-400 transition-colors">确认保存</button>'
            + '</div>'
            + '</div>';
        document.body.appendChild(overlay);
    }
    document.getElementById('qq-group-confirm-msg').textContent = message;
    overlay.classList.remove('hidden');

    var okBtn = document.getElementById('qq-group-confirm-ok');
    var cancelBtn = document.getElementById('qq-group-confirm-cancel');

    var newOk = okBtn.cloneNode(true);
    okBtn.parentNode.replaceChild(newOk, okBtn);
    var newCancel = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);

    newOk.onclick = function() {
        overlay.classList.add('hidden');
        if (typeof onConfirm === 'function') onConfirm();
    };
    newCancel.onclick = function() {
        overlay.classList.add('hidden');
    };
}

function showInputDialog(title, placeholder, defaultValue, onConfirm) {
    var overlay = document.getElementById('input-dialog-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'input-dialog-overlay';
        overlay.className = 'fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 hidden';
        overlay.innerHTML = ''
            + '<div class="bg-[#0f0f18] border border-yellow-500/30 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl">'
            + '<div id="input-dialog-title" class="text-lg font-bold text-yellow-400 mb-3"></div>'
            + '<input id="input-dialog-field" type="text" class="w-full bg-[#161620] border border-yellow-500/20 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-500 mb-6" />'
            + '<div class="flex gap-3 justify-end">'
            + '<button id="input-dialog-cancel" class="px-4 py-2 rounded-lg bg-[#1e1e2a] text-gray-300 text-sm hover:bg-[#252530] transition-colors">取消</button>'
            + '<button id="input-dialog-ok" class="px-4 py-2 rounded-lg bg-yellow-500 text-gray-900 text-sm font-bold hover:bg-yellow-400 transition-colors">确认</button>'
            + '</div>'
            + '</div>';
        document.body.appendChild(overlay);
    }
    document.getElementById('input-dialog-title').textContent = title;
    var field = document.getElementById('input-dialog-field');
    field.placeholder = placeholder || '';
    field.value = defaultValue || '';
    overlay.classList.remove('hidden');
    field.focus();

    var okBtn = document.getElementById('input-dialog-ok');
    var cancelBtn = document.getElementById('input-dialog-cancel');

    var newOk = okBtn.cloneNode(true);
    okBtn.parentNode.replaceChild(newOk, okBtn);
    var newCancel = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);

    newOk.onclick = function() {
        overlay.classList.add('hidden');
        if (typeof onConfirm === 'function') onConfirm(field.value);
    };
    newCancel.onclick = function() {
        overlay.classList.add('hidden');
    };
    field.onkeydown = function(e) {
        if (e.key === 'Enter') {
            overlay.classList.add('hidden');
            if (typeof onConfirm === 'function') onConfirm(field.value);
        }
    };
}

// 处理未锁定状态的输入（首次填写）
function handleQqGroupInput(groupId, inputEl) {
    var value = inputEl.value.trim();
    if (!value) return;
    if (!/^\d+$/.test(value)) {
        showToast('QQ群号只能输入数字', '❌');
        inputEl.value = '';
        return;
    }
    showQqGroupConfirm(
        '确认将该组的QQ群号设置为：' + value + '\n\n设置后仅管理员可修改，请确认无误！',
        function() { saveQqGroup(groupId, value, false); }
    );
}

// 处理已锁定状态的管理员编辑
function handleQqGroupAdminEdit(groupId, inputEl) {
    var value = inputEl.value.trim();
    if (!value) {
        showToast('请输入QQ群号', '❌');
        return;
    }
    if (!/^\d+$/.test(value)) {
        showToast('QQ群号只能输入数字', '❌');
        return;
    }
    showQqGroupConfirm(
        '管理员修改锁定群号：' + value + '\n\n确认要覆盖原群号吗？',
        function() { saveQqGroup(groupId, value, true); }
    );
}

// 保存QQ群号（force: 是否强制覆盖已锁定的群号）
async function saveQqGroup(groupId, value, force) {
    var num = value.trim();
    if (num && !/^\d+$/.test(num)) {
        showToast('QQ群号只能输入数字', '❌');
        return;
    }
    try {
        var body = { qq_group_number: num };
        if (force) body.force = true;
        var res = await fetch(API_BASE + '/api/groups/' + groupId + '/qq-group', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        var result = await res.json();
        if (!res.ok) throw new Error(result.error);
        showToast('✅ QQ群号已保存（已锁定，仅管理员可修改）', '✅');
        loadGroups();
    } catch (err) {
        showToast('保存失败: ' + err.message, '❌');
    }
}

// ==================== 昵称编辑 ====================

function editNickname(spanEl) {
    var playerId = spanEl.getAttribute('data-player-id');
    console.log('[DEBUG] editNickname called, playerId:', playerId);
    if (!playerId) {
        showToast('错误：无法获取玩家ID', '❌');
        return;
    }
    var currentName = spanEl.textContent;
    var input = document.createElement('input');
    input.type = 'text';
    input.value = currentName;
    input.className = 'bg-[#1e1e2a] border border-yellow-500 rounded px-2 py-0.5 text-sm text-white w-32 focus:outline-none';
    input.onclick = function(e) { e.stopPropagation(); };

    spanEl.parentNode.replaceChild(input, spanEl);
    input.focus();
    input.select();

    function save() {
        var newName = input.value.trim();
        if (newName && newName !== currentName) {
            updatePlayerNickname(playerId, newName, input, spanEl);
        } else {
            input.parentNode.replaceChild(spanEl, input);
        }
    }

    input.onblur = save;
    input.onkeydown = function(e) {
        e.stopPropagation();
        if (e.key === 'Enter') {
            save();
        } else if (e.key === 'Escape') {
            input.parentNode.replaceChild(spanEl, input);
        }
    };
}

async function updatePlayerNickname(playerId, newName, inputEl, spanEl) {
    console.log('[DEBUG] updatePlayerNickname called:', { playerId, newName });
    try {
        var url = API_BASE + '/api/players/' + playerId + '/nickname';
        console.log('[DEBUG] Fetching:', url);
        var res = await fetch(url, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ game_nickname: newName })
        });
        console.log('[DEBUG] Response status:', res.status);
        var result = await res.json();
        console.log('[DEBUG] Response:', result);
        if (!res.ok) throw new Error(result.error);
        
        // 更新 span 内容
        spanEl.textContent = newName;
        inputEl.parentNode.replaceChild(spanEl, inputEl);
        showToast('✅ 昵称已更新', '✅');
        
        // 双重保险：同步更新 allPlayersCache + 异步刷新
        // 1. 同步更新缓存（立即生效，搜索可读到新昵称）
        if (typeof allPlayersCache !== 'undefined' && Array.isArray(allPlayersCache)) {
            for (var i = 0; i < allPlayersCache.length; i++) {
                if (allPlayersCache[i].id == playerId) {
                    allPlayersCache[i].game_nickname = newName;
                    break;
                }
            }
        }
        // 2. 异步刷新数据底表（如果有打开的话）
        if (typeof loadPlayers === 'function') {
            loadPlayers();
        }
    } catch (err) {
        console.error('[DEBUG] Error:', err);
        showToast('更新失败: ' + err.message, '❌');
        inputEl.parentNode.replaceChild(spanEl, inputEl);
    }
}

// ==================== 加载分组 ====================

var cachedGroups = []; // 缓存分组数据用于筛选

async function loadGroups() {
    var roundId = document.getElementById("round-select")?.value;
    if (!roundId) {
        var container = document.getElementById("groups-container");
        if (container) container.innerHTML = '<div class="text-center py-12 text-gray-300">请先选择轮次</div>';
        return;
    }
    var container = document.getElementById("groups-container");
    if (!container) return;
    container.innerHTML = '<div class="text-center py-8 text-gray-300">加载中...</div>';
    try {
        var res = await fetch(API_BASE + "/api/groups/" + roundId);
        var groups = await res.json();
        if (!Array.isArray(groups) || groups.length === 0) {
            container.innerHTML = '<div class="text-center py-12 text-gray-300">该轮次暂无分组数据</div>';
            return;
        }
        groups.sort(function(a, b) { return a.group_number - b.group_number; });
        cachedGroups = groups;

        // 根据大区筛选
        var filteredGroups = groups;
        if (currentRegionFilter !== 'all') {
            filteredGroups = groups.filter(function(g) {
                return g.region === currentRegionFilter || (g.players && g.players.length > 0 && g.players[0].region === currentRegionFilter);
            });
        }

        // 为筛选后的分组计算显示编号（区域内从1开始）
        filteredGroups.forEach(function(g, idx) {
            g.display_number = idx + 1;
        });

        var medalColors = ["bg-yellow-500/20 text-yellow-400", "bg-gray-400/20 text-gray-300", "bg-orange-600/20 text-orange-400", "bg-blue-500/20 text-blue-400"];
        var html = "";
        if (filteredGroups.length > 0) {
            html += filteredGroups.map(function(g) { return renderGroupCard(g, medalColors); }).join("");
        } else {
            html = '<div class="text-center py-12 text-gray-300">该大区暂无分组数据</div>';
        }
        container.innerHTML = html;

        bindGroupCardClicks();
        console.log("[loadGroups] 渲染完成，版本 20250606k");
    } catch (err) {
        container.innerHTML = '<div class="text-center py-8 text-red-400">加载失败: ' + err.message + '</div>';
    }
}

// 给所有组别标题栏绑定点击事件
function bindGroupCardClicks() {
    var headers = document.querySelectorAll(".group-header");
    for (var i = 0; i < headers.length; i++) {
        (function(header) {
            header.addEventListener("click", function() {
                var groupId = header.getAttribute("data-groupid");
                toggleGroupCard(groupId, false);
            });
        })(headers[i]);
    }

    // 绑定验证按钮
    var verifyBtns = document.querySelectorAll(".verify-btn");
    for (var j = 0; j < verifyBtns.length; j++) {
        (function(btn) {
            btn.addEventListener("click", function(e) {
                e.stopPropagation();
                var gpId = btn.getAttribute("data-gpid");
                if (typeof verifyPlayerScreenshot === "function") {
                    verifyPlayerScreenshot(gpId);
                }
            });
        })(verifyBtns[j]);
    }
}

// ==================== 赛季筛选 ====================

async function loadSeasonsForFilter() {
    try {
        const res = await fetch(API_BASE + "/api/seasons");
        const seasons = await res.json();
        const sel = document.getElementById("season-select");
        if (!sel) return;
        let html = '<option value="">全部赛季</option>';
        seasons.forEach(s => {
            const selected = s.status === "active" ? " selected" : "";
            html += '<option value="' + s.id + '"' + selected + '>' + s.name + '</option>';
        });
        sel.innerHTML = html;
        onSeasonChange();
    } catch (err) { console.error("加载赛季失败:", err); }
}

function onSeasonChange() {
    const seasonId = document.getElementById("season-select")?.value;
    loadRounds(seasonId || null);
}

async function loadRounds(seasonId) {
    try {
        const res = await fetch(API_BASE + "/api/rounds");
        let rounds = await res.json();
        if (seasonId) {
            rounds = rounds.filter(r => r.season_id == seasonId);
        }
        const sel = document.getElementById("round-select");
        if (!sel) return;
        if (rounds.length === 0) {
            sel.innerHTML = '<option value="">暂无轮次</option>';
            const container = document.getElementById("groups-container");
            if (container) container.innerHTML = '<div class="text-center py-12 text-gray-300">该赛季暂无分组数据</div>';
            return;
        }
        sel.innerHTML = rounds.map(r => '<option value="' + r.id + '">' + r.name + "</option>").join("");
        loadGroups();
    } catch (err) { console.error("加载轮次失败:", err); }
}

// ==================== 玩家检索 ====================

async function searchPlayer() {
    const input = document.getElementById("player-search-input");
    const msgDiv = document.getElementById("search-result-msg");
    if (!input || !input.value.trim()) {
        showSearchMsg("请输入游戏ID或昵称", "error");
        return;
    }
    const gameUid = input.value.trim();
    const seasonId = document.getElementById("season-select")?.value || "";
    try {
        let url = API_BASE + "/api/players/search?game_uid=" + encodeURIComponent(gameUid);
        if (seasonId) url += "&season_id=" + encodeURIComponent(seasonId);
        const res = await fetch(url);
        const data = await res.json();
        if (!res.ok || !data.success) {
            showSearchMsg(data.error || "检索失败", "error");
            return;
        }
        showSearchMsg("找到！你在【" + data.group.round_name + "】第 " + data.group.group_number + " 组（" + data.group.season_name + "）", "success");
        setTimeout(function() {
            var cards = document.querySelectorAll('[id^="group-card-"]');
            var targetCard = null;
            for (var i = 0; i < cards.length; i++) {
                var header = cards[i].querySelector(".font-bold.text-yellow-400");
                if (header && header.textContent.indexOf("第 " + data.group.group_number + " 组") !== -1) {
                    targetCard = cards[i];
                    break;
                }
            }
            if (targetCard) {
                var gid = targetCard.id.replace("group-card-", "");
                toggleGroupCard(parseInt(gid), true);
                targetCard.scrollIntoView({ behavior: "smooth", block: "center" });
                targetCard.classList.add("ring-2", "ring-yellow-400/50");
                setTimeout(function() { targetCard.classList.remove("ring-2", "ring-yellow-400/50"); }, 3000);
            }
        }, 500);
    } catch (err) {
        showSearchMsg("检索失败: " + err.message, "error");
    }
}

function clearSearch() {
    var input = document.getElementById("player-search-input");
    var msgDiv = document.getElementById("search-result-msg");
    if (input) input.value = "";
    if (msgDiv) { msgDiv.classList.add("hidden"); msgDiv.textContent = ""; }
    loadGroups();
}

// ==================== 辅助函数 ====================

function showSearchMsg(text, type) {
    var el = document.getElementById("search-result-msg");
    if (!el) return;
    el.classList.remove("hidden");
    el.textContent = text;
    el.className = "mt-2 text-sm py-2 px-3 rounded-lg ";
    if (type === "error") el.className += "bg-red-900/50 text-red-300";
    else if (type === "success") el.className += "bg-green-900/50 text-green-300";
    else el.className += "bg-[#0f0f18]/50 text-gray-300";
}

console.log("[groups-enhanced.js] 加载完成！版本 20250606k");
