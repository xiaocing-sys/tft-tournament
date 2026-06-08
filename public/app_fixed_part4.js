// ==================== 战绩上传 ====================
async function submitResult() {
    const groupPlayerId = document.getElementById('upload-player-select')?.value;
    const placementBtn = document.querySelector('.placement-btn.bg-yellow-500');
    if (!groupPlayerId) return showToast('请先选择你的名字', '⚠️');
    if (!placementBtn) return showToast('请选择本局名次', '⚠️');
    const placement = placementBtn.dataset.placement;
    const btn = document.getElementById('upload-btn');
    if (btn) { btn.disabled = true; btn.textContent = '提交中...'; }
    try {
        const formData = new FormData();
        formData.append('group_player_id', groupPlayerId);
        formData.append('placement', placement);
        if (selectedFile) formData.append('screenshot', selectedFile);
        const res = await fetch(`${API_BASE}/api/results/upload`, {
            method: 'POST',
            body: formData
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || '提交失败');
        showToast('🎉 战绩提交成功！正在验证截图...', '✅');
        if (selectedFile) {
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

// ==================== OCR 截图验证 ====================
async function verifyScreenshot(groupPlayerId) {
    try {
        const res = await fetch(`${API_BASE}/api/results/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ group_player_id: groupPlayerId })
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error);
        if (result.verified) {
            showToast('✅ OCR验证通过！截图中的游戏ID与报名ID匹配', '✅');
        } else {
            showToast('⚠️ OCR验证未通过，请管理员手动审核', '⚠️');
        }
        const msgEl = document.getElementById('upload-msg');
        if (msgEl) {
            msgEl.classList.remove('hidden');
            msgEl.className = `mt-4 text-center text-sm py-2 rounded-lg ${result.verified ? 'bg-green-900/50 text-green-300' : 'bg-yellow-900/50 text-yellow-300'}`;
            msgEl.innerHTML = `
                <div class="font-bold mb-1">${result.verified ? '✅ 验证通过' : '⚠️ 验证未通过'}</div>
                <div class="text-xs text-left mt-2 p-2 bg-gray-900/50 rounded">
                    <div>期望ID: <span class="font-mono text-yellow-400">${result.expected_uid}</span></div>
                    <div class="mt-1">OCR识别文本:</div>
                    <div class="font-mono text-gray-400 break-all">${result.ocr_text || '(无)'}</div>
                </div>
            `;
            setTimeout(() => msgEl.classList.add('hidden'), 10000);
        }
        setTimeout(() => loadGroups(), 1000);
    } catch (err) {
        console.error('OCR验证失败:', err);
        showToast('⚠️ OCR验证失败: ' + err.message, '⚠️');
    }
}

async function verifyPlayerScreenshot(groupPlayerId) {
    showToast('正在验证截图...', '⏳');
    await verifyScreenshot(groupPlayerId);
}
