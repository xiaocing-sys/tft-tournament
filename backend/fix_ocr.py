import re

new_code = '''
// ==================== OCR 截图验证 ====================
// 验证截图中的昵称和排名（不验证游戏ID，OCR识别不准）
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

            const fullPath = path.join(__dirname, row.screenshot_path);
            const expectedNickname = row.game_nickname || '';
            const expectedPlacement = row.placement;

            try {
                // 2. 使用 Tesseract 识别截图文字
                console.log('[OCR] 开始识别截图:', fullPath);
                console.log('[OCR] 预期信息: 昵称=' + expectedNickname + ', 排名=' + expectedPlacement);
                const { data: { text } } = await Tesseract.recognize(fullPath, 'eng+chi_sim', {
                    logger: m => console.log('[OCR]', m)
                });
                console.log('[OCR] 识别结果:', text);
                const cleanText = text.replace(/\\s/g, '');

                // 3. ===== 昵称验证（黄色高亮昵称更容易被识别）=====
                let nicknameFound = false;
                let nicknameDetails = [];
                if (expectedNickname) {
                    // 3.1 精确匹配（保留空格）
                    var escapedNick = expectedNickname.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');
                    const nickPattern = new RegExp(escapedNick, 'i');
                    if (nickPattern.test(text)) {
                        nicknameFound = true;
                        nicknameDetails.push('精确匹配');
                    }

                    // 3.2 去除空格后匹配
                    if (!nicknameFound && nickPattern.test(cleanText)) {
                        nicknameFound = true;
                        nicknameDetails.push('去空格匹配');
                    }

                    // 3.3 尝试匹配昵称的一部分（OCR可能只识别出部分字符）
                    if (!nicknameFound && expectedNickname.length >= 3) {
                        const partial = expectedNickname.slice(0, 3).replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');
                        const partialPattern = new RegExp(partial, 'i');
                        if (partialPattern.test(text) || partialPattern.test(cleanText)) {
                            nicknameFound = true;
                            nicknameDetails.push('部分匹配(前3字)');
                        }
                    }

                    // 3.4 模糊匹配（OCR可能将某些字符识别错误）
                    if (!nicknameFound) {
                        // 常见OCR错误：O->0, l->1, I->1, S->5, B->8
                        const fuzzyNick = expectedNickname
                            .replace(/O/g, '[O0]')
                            .replace(/o/g, '[o0]')
                            .replace(/I/g, '[Il1]')
                            .replace(/l/g, '[Il1]')
                            .replace(/S/g, '[S5]')
                            .replace(/s/g, '[s5]')
                            .replace(/B/g, '[B8]')
                            .replace(/b/g, '[b8]');
                        try {
                            const fuzzyPattern = new RegExp(fuzzyNick.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&'), 'i');
                            if (fuzzyPattern.test(cleanText)) {
                                nicknameFound = true;
                                nicknameDetails.push('模糊匹配');
                            }
                        } catch (e) { /* 忽略正则错误 */ }
                    }
                }

                // 4. ===== 排名多维度验证 =====
                let placementFound = false;
                let placementDetails = [];
                if (expectedPlacement) {
                    const expStr = expectedPlacement.toString();

                    // 4.1 匹配顶部 "第X名" / "第 X 名"
                    const topPatterns = [
                        new RegExp('第\\\\s*' + expStr + '\\\\s*名'),
                        new RegExp('第' + expStr + '名'),
                    ];
                    const topFound = topPatterns.some(p => p.test(text));
                    if (topFound) placementDetails.push('顶部名次匹配');

                    // 4.2 匹配左侧排名列（行首或独立出现的 1-8 数字）
                    const rankPatterns = [
                        new RegExp('(^|[\\\\n\\\\r])\\\\s*' + expStr + '\\\\s+(?=[^\\\\d])'),
                        new RegExp('排名[\\\\s:：]*' + expStr),
                        new RegExp('Rank[\\\\s:：]*' + expStr, 'i'),
                        new RegExp('#\\\\s*' + expStr),
                    ];
                    const rankFound = rankPatterns.some(p => p.test(text));
                    if (rankFound) placementDetails.push('排名列匹配');

                    // 4.3 检查纯数字中是否包含预期排名（作为兜底）
                    const allNumbers = text.match(/\\\\d+/g) || [];
                    const numFound = allNumbers.includes(expStr);
                    if (numFound) placementDetails.push('数字匹配');

                    placementFound = topFound || rankFound || numFound;
                }

                // 5. ===== 完整性校验：检查是否包含完整的1-8名列表 =====
                const allNumbers = text.match(/\\\\d+/g) || [];
                const uniqueNumbers = [...new Set(allNumbers.map(n => parseInt(n, 10)).filter(n => n >= 1 && n <= 8))];
                const hasFullRanking = uniqueNumbers.length >= 6;
                if (hasFullRanking) placementDetails.push('完整排名(' + uniqueNumbers.sort((a, b) => a - b).join(',') + ')');

                // 6. ===== 综合验证结果 =====
                const nicknameVerified = nicknameFound;
                const placementVerified = expectedPlacement ? placementFound : true;

                let verified = false;
                let verifyMode = '';

                if (nicknameVerified && placementVerified) {
                    verified = true;
                    verifyMode = '标准验证（昵称+排名）';
                } else if (nicknameVerified && hasFullRanking) {
                    verified = true;
                    verifyMode = '兜底验证（昵称+完整排名列表）';
                } else if (nicknameVerified) {
                    verified = true;
                    verifyMode = '昵称验证（仅昵称匹配，建议管理员审核）';
                }

                // 7. 如果验证通过，更新数据库
                if (verified) {
                    db.run('UPDATE group_players SET verified = 1, verified_at = CURRENT_TIMESTAMP WHERE id = ?',
                        [group_player_id], (err) => {
                            if (err) console.error('更新验证状态失败:', err);
                        });
                }

                // 8. 返回详细验证结果
                const failReasons = [];
                if (!nicknameVerified) failReasons.push('昵称未识别');
                if (!placementVerified) failReasons.push('排名未识别');
                if (!hasFullRanking) failReasons.push('未检测到完整排名列表');

                res.json({
                    success: true,
                    verified,
                    verify_mode: verifyMode,
                    details: {
                        nickname_verified: nicknameVerified,
                        nickname_details: nicknameDetails,
                        placement_verified: placementVerified,
                        placement_details: placementDetails,
                        has_full_ranking: hasFullRanking,
                        expected_nickname: expectedNickname,
                        expected_placement: expectedPlacement,
                        ocr_text: text,
                        ocr_text_clean: cleanText
                    },
                    message: verified
                        ? '✅ 验证通过！' + verifyMode
                        : '⚠️ 验证未通过：' + failReasons.join('、') + '。请管理员手动审核。'
                });

            } catch (err) {
                console.error('[OCR] 识别失败:', err);
                res.status(500).json({
                    error: 'OCR识别失败：' + err.message,
                    tip: '请确保截图清晰，且包含游戏昵称和排名信息'
                });
            }
        }
    );
});

'''

with open('server.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# 找到要插入的位置（在 app.post('/api/results/manual-verify') 之前）
insert_idx = None
for i, line in enumerate(lines):
    if "app.post('/api/results/manual-verify'" in line:
        insert_idx = i
        break

if insert_idx is None:
    print('Error: Could not find insert position')
else:
    print(f'Inserting at line {insert_idx}')
    new_lines = lines[:insert_idx] + [new_code] + lines[insert_idx:]
    with open('server.js', 'w', encoding='utf-8') as f:
        f.writelines(new_lines)
    print('Done!')
    print(f'Total lines: {len(new_lines)}')
