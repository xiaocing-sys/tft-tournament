import { Jimp } from 'jimp';
import Tesseract from 'tesseract.js';

const IMAGE_PATH = 'D:/企微/WXWork/1688856683581389/Cache/Image/2026-06/ec501912-db07-4d8e-abf5-50e5ec996ef9.jpg';

async function testOCR() {
    console.log('=== 超大放大倍数测试（针对中英文混合昵称）===\n');
    
    const image = await Jimp.read(IMAGE_PATH);
    const w = image.width;
    const h = image.height;
    
    const rowHeight = Math.floor((h * 0.72) / 8);
    const startY = Math.floor(h * 0.15);
    
    // 只测试第2行（Little辞）和第5行（萌名满贯o.o）
    const testRows = [
        { i: 1, name: 'Little辞' },
        { i: 4, name: '萌名满贯o.o' },
        { i: 2, name: '甜甜圈真好吃呢' },
    ];
    
    for (const { i, name } of testRows) {
        const rowY = startY + i * rowHeight;
        console.log(`\n--- 第${i+1}行 (${name}) ---`);
        
        for (const scale of [4, 6, 8]) {
            const nickArea = image.clone().crop({ 
                x: Math.floor(w * 0.13), 
                y: rowY + Math.floor(rowHeight * 0.1), 
                w: Math.floor(w * 0.18), 
                h: Math.floor(rowHeight * 0.8) 
            });
            await nickArea.resize({ w: nickArea.width * scale, h: nickArea.height * scale });
            nickArea.greyscale();
            nickArea.contrast(0.5);
            
            const r = await Tesseract.recognize(
                await nickArea.getBuffer('image/png'), 
                'chi_sim+eng', 
                { logger: () => {} }
            );
            console.log(`  ${scale}x放大: "${r.data.text.trim().replace(/\n/g, ' ')}"`);
        }
        
        // 额外测试：增大对比度到0.8
        const highContrast = image.clone().crop({ 
            x: Math.floor(w * 0.13), 
            y: rowY + Math.floor(rowHeight * 0.1), 
            w: Math.floor(w * 0.18), 
            h: Math.floor(rowHeight * 0.8) 
        });
        await highContrast.resize({ w: highContrast.width * 6, h: highContrast.height * 6 });
        highContrast.greyscale();
        highContrast.contrast(0.8);
        const r2 = await Tesseract.recognize(
            await highContrast.getBuffer('image/png'), 
            'chi_sim+eng', 
            { logger: () => {} }
        );
        console.log(`  6x+高对比度: "${r2.data.text.trim().replace(/\n/g, ' ')}"`);
    }
    
    console.log('\n=== 测试完成 ===');
}

testOCR().catch(console.error);
