import { Jimp } from 'jimp';
import Tesseract from 'tesseract.js';

const IMAGE_PATH = 'D:/企微/WXWork/1688856683581389/Cache/Image/2026-06/ec501912-db07-4d8e-abf5-50e5ec996ef9.jpg';

async function testBbox() {
    console.log('=== Tesseract 边界框定位测试 ===\n');
    
    const image = await Jimp.read(IMAGE_PATH);
    const w = image.width;
    const h = image.height;
    console.log(`原始尺寸: ${w}x${h}`);
    
    // 缩小图片加速OCR（只用于定位表头）
    const small = image.clone().resize({ w: Math.floor(w * 0.4), h: Math.floor(h * 0.4) });
    small.greyscale();
    
    const result = await Tesseract.recognize(
        await small.getBuffer('image/png'), 
        'chi_sim', 
        { logger: () => {} }
    );
    
    // 查找"排名"和"玩家"关键词的位置
    console.log('查找关键词位置...\n');
    
    const keywords = ['排名', '玩家', '出场阵容', '第', '名'];
    
    // 从words中查找
    if (result.data.words) {
        for (const word of result.data.words) {
            if (keywords.some(k => word.text.includes(k))) {
                console.log(`关键词 "${word.text}": bbox=(${Math.round(word.bbox.x0)},${Math.round(word.bbox.y0)})-(${Math.round(word.bbox.x1)},${Math.round(word.bbox.y1)})`);
            }
        }
    }
    
    // 也从lines中查找
    console.log('\n--- 所有文本行（带位置）---');
    if (result.data.lines) {
        for (const line of result.data.lines) {
            const text = line.text.trim();
            if (text.length > 0 && text.length < 50) {
                console.log(`"${text}" @ y=${Math.round(line.bbox.y0)}-${Math.round(line.bbox.y1)}, x=${Math.round(line.bbox.x0)}-${Math.round(line.bbox.x1)}`);
            }
        }
    }
    
    console.log('\n=== 测试完成 ===');
}

testBbox().catch(console.error);
