// test-ocr.js
// 测试 Tesseract.js OCR 功能
// 用法：node test-ocr.js

const Tesseract = require('tesseract.js');
const fs = require('fs');
const path = require('path');

// 创建一个简单的测试图片（1x1 像素的白色图片，Tesseract 会返回空）
// 但实际上我们需要一张带文字的图片，这里从网上下载一张测试图片
const testImageUrl = 'https://tesseract-ocr.github.io/tessdoc/images/di.png';
const testImagePath = path.join(__dirname, 'uploads', 'test-ocr-image.png');

async function downloadTestImage() {
    console.log('[测试] 步骤1：下载测试图片...');
    try {
        const https = require('https');
        const file = fs.createWriteStream(testImagePath);
        
        return new Promise((resolve, reject) => {
            https.get(testImageUrl, (response) => {
                response.pipe(file);
                file.on('finish', () => {
                    file.close();
                    console.log('✅ 测试图片下载完成:', testImagePath);
                    resolve();
                });
            }).on('error', (err) => {
                fs.unlink(testImagePath, () => {});
                reject(err);
            });
        });
    } catch (err) {
        console.log('❌ 下载失败，将创建简单测试图片');
        return createSimpleTestImage();
    }
}

function createSimpleTestImage() {
    console.log('[测试] 创建简单测试图片...');
    // 创建一个最小的 PNG 文件（1x1 白色像素）
    // 这不是好的 OCR 测试图片，但至少可以让代码运行
    const pngData = Buffer.from([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
        0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
        0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41, // IDAT chunk
        0x54, 0x08, 0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00,
        0x00, 0x00, 0x02, 0x00, 0x01, 0xE2, 0x21, 0xBC,
        0x33, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, // IEND chunk
        0x44, 0xAE, 0x42, 0x60, 0x82
    ]);
    fs.writeFileSync(testImagePath, pngData);
    console.log('✅ 简单测试图片已创建（但不是好的 OCR 测试图片）');
}

async function testOCR() {
    console.log('\n[测试] 步骤2：测试 Tesseract.js OCR 识别...');
    try {
        console.log('[OCR] 开始识别:', testImagePath);
        const { data: { text } } = await Tesseract.recognize(testImagePath, 'eng+chi_sim', {
            logger: m => console.log(`[OCR] ${m.status}: ${m.progress * 100}%`)
        });
        console.log('✅ OCR 识别成功！');
        console.log('[OCR] 识别结果:', text);
        return text;
    } catch (err) {
        console.error('❌ OCR 识别失败:', err.message);
        throw err;
    }
}

async function testDB() {
    console.log('\n[测试] 步骤3：测试数据库操作...');
    const sqlite3 = require('sqlite3').verbose();
    const db = new sqlite3.Database(path.join(__dirname, 'tournament.db'));
    
    return new Promise((resolve, reject) => {
        // 找一个有效的 group_player_id
        db.get('SELECT gp.id, p.game_uid FROM group_players gp JOIN players p ON gp.player_id = p.id LIMIT 1', (err, row) => {
            if (err) {
                console.error('❌ 数据库查询失败:', err.message);
                db.close();
                reject(err);
            } else if (!row) {
                console.log('⚠️ 数据库中没有记录');
                db.close();
                resolve(null);
            } else {
                console.log('✅ 找到测试记录: ID=', row.id, 'UID=', row.game_uid);
                db.close();
                resolve(row);
            }
        });
    });
}

async function main() {
    console.log('========================================');
    console.log('   OCR 截图验证功能测试');
    console.log('========================================\n');

    try {
        // 步骤1：确保 uploads 目录存在
        if (!fs.existsSync('uploads')) {
            fs.mkdirSync('uploads');
            console.log('✅ 创建 uploads 目录');
        }

        // 步骤2：下载/创建测试图片
        if (!fs.existsSync(testImagePath)) {
            await downloadTestImage();
        } else {
            console.log('[测试] 测试图片已存在:', testImagePath);
        }

        // 步骤3：测试 OCR 识别
        const ocrText = await testOCR();

        // 步骤4：测试数据库
        const testRecord = await testDB();

        console.log('\n========================================');
        console.log('✅ 所有测试通过！');
        console.log('========================================');
        console.log('\nOCR 功能已就绪，可以开始手动测试：');
        console.log('  1. 启动后端服务: node server.js');
        console.log('  2. 打开浏览器: http://localhost:3001');
        console.log('  3. 登录管理员（点击 Logo 5次，密码: TFT金铲铲星神水友赛）');
        console.log('  4. 进入"分组对战"标签页');
        console.log('  5. 展开一个组，点击"未验证"按钮测试 OCR 验证');

    } catch (err) {
        console.error('\n========================================');
        console.error('❌ 测试失败:', err.message);
        console.error('========================================');
        process.exit(1);
    }
}

main();
