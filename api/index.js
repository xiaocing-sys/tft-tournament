// Vercel Serverless Function 入口
try {
    console.log('[Vercel] 开始加载...');
    const serverless = require('serverless-http');
    console.log('[Vercel] serverless-http 加载成功');
    
    const app = require('../backend/server.js');
    console.log('[Vercel] Express app 加载成功');
    
    module.exports = serverless(app);
    console.log('[Vercel] Serverless Function 初始化完成');
} catch (e) {
    console.error('[Vercel] ❌ 初始化失败:', e.message);
    console.error('[Vercel] 堆栈:', e.stack);
    module.exports = (req, res) => {
        res.status(500).json({ 
            success: false, 
            error: 'Serverless Function 初始化失败: ' + e.message
        });
    };
}
