// 本地 OCR 服务（运行在你电脑上）
// 使用 Tesseract.js 识别截图中的名次
// 供线上 Netlify 网站调用

const express = require('express');
const Tesseract = require('tesseract.js');
const Jimp = require('jimp');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json({ limit: '10mb' }));

const PORT = 3456;

// ==================== OCR 识别接口 ====================
app.post('/ocr', async (req, res) => {
    const { image_url } = req.body;
    if (!image_url) {
        return res.status(400).json({ error: '缺少 image_url' });
    }

    try {
        console.log('[本地OCR] 开始识别:', image_url);

        // 1. 下载图片
        const imageBuffer = await downloadImage(image_url);
        console.log('[本地OCR] 图片下载完成，大小:', imageBuffer.length, 'bytes');

        // 2. 图像预处理（提高识别率）
        const image = await Jimp.read(imageBuffer);
        image.greyscale();
        image.contrast(0.3);
        const processedBuffer = await image.getBuffer('image/png');

        // 3. 使用 Tesseract 识别（仅识别数字 + 关键中文）
        const worker = await Tesseract.createWorker('eng+chi_sim', Tesseract.OEM.TESSERACT_ONLY);
        await worker.setParameters({
            tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK,
            tessedit_char_whitelist: '0123456789第名次 ',
        });

        const { data } = await worker.recognize(processedBuffer);
        await worker.terminate();

        console.log('[本地OCR] 识别结果:', data.text);

        // 4. 提取名次（1-8）
        const numbers = data.text.match(/\d+/g) || [];
        const placements = numbers.map(n => parseInt(n, 10)).filter(n => n >= 1 && n <= 8);
        const uniquePlacements = [...new Set(placements)];

        console.log('[本地OCR] 提取的名次:', uniquePlacements);

        res.json({
            success: true,
            raw_text: data.text,
            placements: uniquePlacements,
        });

    } catch (err) {
        console.error('[本地OCR] 识别失败:', err);
        res.status(500).json({
            success: false,
            error: err.message,
        });
    }
});

// ==================== 下载图片 ====================
function downloadImage(url) {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;
        protocol.get(url, (res) => {
            if (res.statusCode !== 200) {
                return reject(new Error(`下载图片失败，状态码: ${res.statusCode}`));
            }
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => resolve(Buffer.concat(chunks)));
        }).on('error', reject);
    });
}

// ==================== 健康检查 ====================
app.get('/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
});

// ==================== 启动服务 ====================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🖥️  本地 OCR 服务已启动！`);
    console.log(`   本地访问: http://localhost:${PORT}`);
    console.log(`   健康检查: http://localhost:${PORT}/health`);
    console.log(`\n等待内网穿透连接...\n`);
});

module.exports = app;
