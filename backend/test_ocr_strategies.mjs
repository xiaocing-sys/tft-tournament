import { Jimp } from 'jimp';
import Tesseract from 'tesseract.js';

const IMAGE_PATH = 'D:/企微/WXWork/1688856683581389/Cache/Image/2026-06/ec501912-db07-4d8e-abf5-50e5ec996ef9.jpg';

async function testOCR() {
    console.log('=== 金铲铲战绩截图OCR优化测试 ===\n');
    
    const image = await Jimp.read(IMAGE_PATH);
    const w = image.width;
    const h = image.height;
    console.log(`原始尺寸: ${w}x${h}`);
    
    // 策略1: 整图OCR（当前方式）
    console.log('\n--- 策略1: 整图OCR ---');
    const r1 = await Tesseract.recognize(await image.getBuffer('image/png'), 'chi_sim+eng', { logger: () => {} });
    console.log('结果:', r1.data.text.substring(0, 300) + '...');
    
    // 策略2: 只裁剪顶部"第X名"区域
    console.log('\n--- 策略2: 裁剪顶部排名区域 ---');
    const topArea = image.clone().crop({ x: 0, y: 0, w: Math.floor(w * 0.3), h: Math.floor(h * 0.15) });
    await topArea.resize({ w: topArea.width * 2, h: topArea.height * 2 });
    topArea.greyscale();
    topArea.contrast(0.5);
    const r2 = await Tesseract.recognize(await topArea.getBuffer('image/png'), 'chi_sim+eng', { logger: () => {} });
    console.log('结果:', r2.data.text);
    
    // 策略3: 裁剪排名列表区域（去除右侧羁绊等干扰）
    console.log('\n--- 策略3: 裁剪排名+玩家列 ---');
    const listArea = image.clone().crop({ x: 0, y: Math.floor(h * 0.12), w: Math.floor(w * 0.35), h: Math.floor(h * 0.75) });
    await listArea.resize({ w: listArea.width * 2, h: listArea.height * 2 });
    listArea.greyscale();
    listArea.contrast(0.5);
    const r3 = await Tesseract.recognize(await listArea.getBuffer('image/png'), 'chi_sim+eng', { logger: () => {} });
    console.log('结果:', r3.data.text.substring(0, 500));
    
    // 策略4: 逐行裁剪昵称区域
    console.log('\n--- 策略4: 逐行裁剪昵称区域 ---');
    const rowHeight = Math.floor((h * 0.75) / 8);
    const startY = Math.floor(h * 0.12);
    for (let i = 0; i < 8; i++) {
        const rowY = startY + i * rowHeight;
        const nickArea = image.clone().crop({ x: Math.floor(w * 0.08), y: rowY, w: Math.floor(w * 0.22), h: rowHeight });
        await nickArea.resize({ w: nickArea.width * 3, h: nickArea.height * 3 });
        nickArea.greyscale();
        nickArea.contrast(0.6);
        // 简单二值化
        nickArea.scan(0, 0, nickArea.width, nickArea.height, (x, y, idx) => {
            const r = nickArea.bitmap.data[idx];
            const g = nickArea.bitmap.data[idx+1];
            const b = nickArea.bitmap.data[idx+2];
            const brightness = (r + g + b) / 3;
            const val = brightness > 120 ? 255 : 0;
            nickArea.bitmap.data[idx] = val;
            nickArea.bitmap.data[idx+1] = val;
            nickArea.bitmap.data[idx+2] = val;
        });
        const r4 = await Tesseract.recognize(await nickArea.getBuffer('image/png'), 'chi_sim+eng', { logger: () => {} });
        console.log(`  第${i+1}行昵称: "${r4.data.text.trim().replace(/\n/g, ' ')}"`);
    }
    
    console.log('\n=== 测试完成 ===');
}

testOCR().catch(console.error);
