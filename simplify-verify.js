const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'backend', 'server.js');
let content = fs.readFileSync(filePath, 'utf8');

// 找到需要替换的开始和结束位置
const startMarker = '                // ========== 3. 排名验证（多维度，优先级从高到低）==========';
const endMarker = '                // ========== 5. 综合验证结果 ==========';

const startIdx = content.indexOf(startMarker);
const endIdx = content.indexOf(endMarker);

if (startIdx === -1 || endIdx === -1) {
    console.log('ERROR: 找不到标记位置');
    console.log('startMarker found:', startIdx !== -1);
    console.log('endMarker found:', endIdx !== -1);
    process.exit(1);
}

const before = content.substring(0, startIdx);
const after = content.substring(endIdx);

const simplifiedVerification = `                // ========== 3. 快速验证（简化版，2秒内完成）==========
                let placementFound = false;
                let nicknameFound = false;
                let placementDetails = [];
                let nicknameDetails = [];

                // 3.1 排名验证（简单数字匹配）
                if (expectedPlacement) {
                    const expStr = expectedPlacement.toString();
                    // 直接检查数字是否出现在文本中
                    if (cleanText.includes(expStr)) {
                        placementFound = true;
                        placementDetails.push('数字匹配');
                    }
                    // 检查"第X名"格式
                    if (cleanText.includes('第' + expStr + '名') || cleanText.includes('第' + expStr + ' 名')) {
                        placementFound = true;
                        placementDetails.push('第X名格式');
                    }
                } else {
                    placementFound = true; // 无预期排名时跳过
                }

                // 3.2 昵称验证（简单子串匹配，忽略大小写和特殊符号）
                if (expectedNickname) {
                    const lowerNick = expectedNickname.toLowerCase().replace(/[^a-z0-9\\u4e00-\\u9fa5]/g, '');
                    const lowerText = cleanText.toLowerCase();
                    const lowerTextAlnum = lowerText.replace(/[^a-z0-9\\u4e00-\\u9fa5]/g, '');
                    
                    // 精确匹配（忽略特殊符号）
                    if (lowerTextAlnum.includes(lowerNick) || lowerNick.includes(lowerTextAlnum)) {
                        nicknameFound = true;
                        nicknameDetails.push('精确匹配');
                    }
                    // 部分匹配（昵称长度 >= 3 时，检查前3个字符）
                    else if (lowerNick.length >= 3) {
                        const nickPrefix = lowerNick.substring(0, 3);
                        if (lowerTextAlnum.includes(nickPrefix)) {
                            nicknameFound = true;
                            nicknameDetails.push('前缀匹配');
                        }
                    }
                } else {
                    nicknameFound = true; // 无预期昵称时跳过
                }

                // 3.3 完整性校验：提取所有 1-8 的数字
                const allNumbers = text.match(/\\d+/g) || [];
                const uniqueNumbers = [...new Set(allNumbers.map(n => parseInt(n, 10)).filter(n => n >= 1 && n <= 8))];
                const hasFullRanking = uniqueNumbers.length >= 6;

                // ========== 4. 综合验证结果 ==========
`;

fs.writeFileSync(filePath, before + simplifiedVerification + after);
console.log('SUCCESS: 验证逻辑已简化');
console.log('替换位置:', startIdx, '-', endIdx);
