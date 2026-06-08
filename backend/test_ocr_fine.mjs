import { Jimp } from 'jimp';
import Tesseract from 'tesseract.js';

const IMAGE_PATH = 'D:/企微/WXWork/1688856683581389/Cache/Image/2026-06/ec501912-db07-4d8e-abf5-50e5ec996ef9.jpg';

async function testOCR() {
    console.log('=== 精细化OCR测试（只裁剪昵称文字区域）===\n');
    
    const image = await Jimp.read(IMAGE_PATH);
    const w = image.width;
    const h = image.height;
    console.log(`原始尺寸: ${w}x${h}`);
    
    // 估计昵称区域：排除排名和头像，只保留文字
    // 观察截图：排名在左5%，头像在5%-12%，昵称在12%-32%
    const rowHeight = Math.floor((h * 0.72) / 8);
    const startY = Math.floor(h * 0.15);
    
    for (let i = 0; i < 8; i++) {
        const rowY = startY + i * rowHeight;
        
        // 策略A: 只裁剪昵称文字（排除头像）+ 4倍放大
        const nickOnly = image.clone().crop({ 
            x: Math.floor(w * 0.13), 
            y: rowY + Math.floor(rowHeight * 0.1), 
            w: Math.floor(w * 0.18), 
            h: Math.floor(rowHeight * 0.8) 
        });
        await nickOnly.resize({ w: nickOnly.width * 4, h: nickOnly.height * 4 });
        nickOnly.greyscale();
        nickOnly.contrast(0.4);
        // 自适应二值化（简化）
        nickOnly.scan(0, 0, nickOnly.width, nickOnly.height, (x, y, idx) => {
            const brightness = nickOnly.bitmap.data[idx];
            const val = brightness > 100 ? 255 : 0;
            nickOnly.bitmap.data[idx] = val;
            nickOnly.bitmap.data[idx+1] = val;
            nickOnly.bitmap.data[idx+2] = val;
        });
        const rA = await Tesseract.recognize(await nickOnly.getBuffer('image/png'), 'chi_sim+eng', { logger: () => {} });
        
        // 策略B: 同样的区域但不二值化（保留灰度）
        const nickGray = image.clone().crop({ 
            x: Math.floor(w * 0.13), 
            y: rowY + Math.floor(rowHeight * 0.1), 
            w: Math.floor(w * 0.18), 
            h: Math.floor(rowHeight * 0.8) 
        });
        await nickGray.resize({ w: nickGray.width * 4, h: nickGray.height * 4 });
        nickGray.greyscale();
        nickGray.contrast(0.5);
        const rB = await Tesseract.recognize(await nickGray.getBuffer('image/png'), 'chi_sim+eng', { logger: () => {} });
        
        // 策略C: 原图不处理（对比用）
        const nickRaw = image.clone().crop({ 
            x: Math.floor(w * 0.13), 
            y: rowY + Math.floor(rowHeight * 0.1), 
            w: Math.floor(w * 0.18), 
            h: Math.floor(rowHeight * 0.8) 
        });
        await nickRaw.resize({ w: nickRaw.width * 2, h: nickRaw.height * 2 });
        const rC = await Tesseract.recognize(await nickRaw.getBuffer('image/png'), 'chi_sim+eng', { logger: () => {} });
        
        console.log(`第${i+1}行:`);
        console.log(`  二值化+4x: "${rA.data.text.trim().replace(/\n/g, ' ')}"`);
        console.log(`  灰度+4x:   "${rB.data.text.trim().replace(/\n/g, ' ')}"`);
        console.log(`  原图+2x:   "${rC.data.text.trim().replace(/\n/g, ' ')}"`);
    }
    
    console.log('\n=== 测试完成 ===');
}

testOCR().catch(console.error);
