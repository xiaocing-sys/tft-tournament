import { Jimp } from 'jimp';
import Tesseract from 'tesseract.js';

const IMAGE_PATH = 'D:/企微/WXWork/1688856683581389/Cache/Image/2026-06/ec501912-db07-4d8e-abf5-50e5ec996ef9.jpg';

async function testSmartCrop() {
    console.log('=== 智能区域定位测试 ===\n');
    
    const image = await Jimp.read(IMAGE_PATH);
    const w = image.width;
    const h = image.height;
    console.log(`原始尺寸: ${w}x${h}`);
    
    // 步骤1: 先OCR整图，找到表头位置
    console.log('\n--- 步骤1: 整图OCR定位表头 ---');
    const fullGray = image.clone().resize({ w: Math.floor(w * 0.5), h: Math.floor(h * 0.5) });
    fullGray.greyscale();
    const r1 = await Tesseract.recognize(
        await fullGray.getBuffer('image/png'), 
        'chi_sim', 
        { logger: () => {} }
    );
    const fullText = r1.data.text;
    console.log('整图OCR结果:', fullText.substring(0, 200));
    
    // 检查是否包含表头关键词
    const hasRankingHeader = fullText.includes('排名');
    const hasPlayerHeader = fullText.includes('玩家');
    console.log(`包含"排名"表头: ${hasRankingHeader}`);
    console.log(`包含"玩家"表头: ${hasPlayerHeader}`);
    
    // 步骤2: 假设表头在顶部15%-25%区域，裁剪此区域精确识别
    console.log('\n--- 步骤2: 裁剪表头区域精确识别 ---');
    const headerArea = image.clone().crop({ 
        x: 0, 
        y: Math.floor(h * 0.12), 
        w: Math.floor(w * 0.5), 
        h: Math.floor(h * 0.12) 
    });
    await headerArea.resize({ w: headerArea.width * 2, h: headerArea.height * 2 });
    headerArea.greyscale();
    headerArea.contrast(0.3);
    const r2 = await Tesseract.recognize(
        await headerArea.getBuffer('image/png'), 
        'chi_sim', 
        { logger: () => {} }
    );
    console.log('表头区域OCR:', r2.data.text.trim());
    
    // 步骤3: 裁剪完整排名列表区域（左侧35%宽度）
    console.log('\n--- 步骤3: 裁剪完整排名列表区域 ---');
    const listArea = image.clone().crop({ 
        x: 0, 
        y: Math.floor(h * 0.22), 
        w: Math.floor(w * 0.35), 
        h: Math.floor(h * 0.65) 
    });
    await listArea.resize({ w: listArea.width * 3, h: listArea.height * 3 });
    listArea.greyscale();
    listArea.contrast(0.4);
    const r3 = await Tesseract.recognize(
        await listArea.getBuffer('image/png'), 
        'chi_sim+eng', 
        { logger: () => {} }
    );
    console.log('列表区域OCR:', r3.data.text.trim().substring(0, 400));
    
    // 步骤4: 尝试检测每行的位置（基于颜色分析）
    // 金铲铲排名行的背景色：第1名金色，其他名深色
    console.log('\n--- 步骤4: 基于亮度分析检测行位置 ---');
    const analysisStrip = image.clone().crop({ 
        x: Math.floor(w * 0.05), 
        y: Math.floor(h * 0.22), 
        w: 10, 
        h: Math.floor(h * 0.65) 
    });
    
    // 计算每行的平均亮度
    const stripH = analysisStrip.height;
    const lineHeight = Math.floor(stripH / 8);
    for (let i = 0; i < 8; i++) {
        let totalBrightness = 0;
        let count = 0;
        const startY = i * lineHeight;
        for (let y = startY; y < startY + lineHeight && y < stripH; y++) {
            for (let x = 0; x < analysisStrip.width; x++) {
                const idx = analysisStrip.getPixelIndex(x, y);
                const r = analysisStrip.bitmap.data[idx];
                const g = analysisStrip.bitmap.data[idx + 1];
                const b = analysisStrip.bitmap.data[idx + 2];
                totalBrightness += (r + g + b) / 3;
                count++;
            }
        }
        const avgBrightness = totalBrightness / count;
        console.log(`  第${i+1}行平均亮度: ${Math.round(avgBrightness)}`);
    }
    
    console.log('\n=== 测试完成 ===');
}

testSmartCrop().catch(console.error);
