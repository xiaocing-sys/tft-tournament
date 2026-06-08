const fs = require('fs');

const filePath = 'D:\\金铲铲水友赛网页\\tft-tournament\\backend\\server.js';
let content = fs.readFileSync(filePath, 'utf8');

// 找到 verify 接口的开始位置
const startMarker = '// ==================== OCR 截图验证 ====================';
const endMarker = '// ==================== 昵称更新 API ====================';

const startIdx = content.indexOf(startMarker);
const endIdx = content.indexOf(endMarker);

if (startIdx === -1 || endIdx === -1) {
    console.log('ERROR: 找不到标记');
    console.log('startIdx:', startIdx, 'endIdx:', endIdx);
    process.exit(1);
}

// 新的 verify 接口代码
const newVerify = `// ==================== OCR 截图验证 ====================
// 验证截图中的排名（使用百度 OCR，仅验证名次）
app.post('/api/results/verify', async (req, res) => {
    const { group_player_id } = req.body;
    if (!group_player_id) {
        return res.status(400).json({ error: '缺少 group_player_id 参数' });
    }

    // 1. 获取截图路径和玩家信息
    db.get(
        'SELECT gp.*, p.game_nickname, p.region, gp.placement FROM group_players gp JOIN players p ON gp.player_id = p.id WHERE gp.id = ?',
        [group_player_id], async (err, row) => {
            if (err || !row) {
                return res.status(404).json({ error: '玩家记录不存在' });
            }
            if (!row.screenshot_path) {
                return res.status(400).json({ error: '未找到截图，请先上传' });
            }

            const imageUrl = row.screenshot_path;
            const expectedPlacement = row.placement;

            try {
                // 2. 调用百度 OCR 识别截图
                console.log('[百度OCR] 开始识别截图:', imageUrl);
                const text = await callBaiduOCR(imageUrl);
                console.log('[百度OCR] 识别结果:', text.substring(0, 200));

                // 3. 从识别结果中提取名次（查找 1-8 的数字）
                const numbers = text.match(/\\d+/g) || [];
                const placements = numbers.map(n => parseInt(n, 10)).filter(n => n >= 1 && n <= 8);
                const uniquePlacements = [...new Set(placements)];

                console.log('[百度OCR] 提取的名次:', uniquePlacements);

                // 4. 验证名次
                let verified = false;
                let reason = '';

                if (!expectedPlacement) {
                    verified = true;
                    reason = '无预期名次，跳过验证';
                } else if (uniquePlacements.includes(parseInt(expectedPlacement, 10))) {
                    verified = true;
                    reason = '名次匹配（百度OCR识别到 ' + uniquePlacements.join(', ') + '）';
                } else {
                    verified = false;
                    reason = '名次不匹配（预期: ' + expectedPlacement + ', OCR识别: ' + uniquePlacements.join(', ') + '）';
                }

                // 5. 更新验证状态
                const verifyStatus = verified ? 1 : 0;
                db.run(
                    'UPDATE group_players SET verified = ?, verify_info = ? WHERE id = ?',
                    [verifyStatus, reason, group_player_id],
                    function (err) {
                        if (err) {
                            console.error('[百度OCR] 更新验证状态失败:', err);
                            return res.status(500).json({ error: err.message });
                        }
                        console.log('[百度OCR] 验证完成:', reason);
                        res.json({
                            success: true,
                            verified: verified,
                            reason: reason,
                            ocr_text: text.substring(0, 500)
                        });
                    }
                );

            } catch (ocrErr) {
                console.error('[百度OCR] 识别失败:', ocrErr);
                db.run(
                    'UPDATE group_players SET verified = 0, verify_info = ? WHERE id = ?',
                    ['OCR识别失败: ' + ocrErr.message, group_player_id],
                    () => {
                        res.json({
                            success: true,
                            verified: false,
                            reason: 'OCR识别失败，请管理员手动审核',
                            error: ocrErr.message
                        });
                    }
                );
            }
        }
    );
});

`;

// 替换
const newContent = content.substring(0, startIdx) + newVerify + content.substring(endIdx);

// 写回文件
fs.writeFileSync(filePath, newContent, 'utf8');
console.log('SUCCESS: verify 接口已替换为百度 OCR');
console.log('替换位置:', startIdx, '-', endIdx);
