// Vercel Serverless Function 入口
// 使用 serverless-http 将 Express app 转换为 Vercel Function 格式
try {
    const serverless = require('serverless-http');
    console.log('[Vercel] serverless-http 加载成功');
    
    const app = require('../backend/server.js');
    console.log('[Vercel] Express app 加载成功');
    
    // Vercel 路由 /api/* 到本文件时，会去掉 /api 前缀
    // 需要在请求到达 Express 前，把 /api 前缀加回来
    app.use((req, res, next) => {
        if (!req.path.startsWith('/api/')) {
            req.url = '/api' + req.url;
            req.path = '/api' + req.path;
        }
        next();
    });
    
    module.exports = serverless(app);
    console.log('[Vercel] Serverless Function 初始化完成');
} catch (e) {
    console.error('[Vercel] ❌ 初始化失败:', e.message);
    console.error('[Vercel] 堆栈:', e.stack);
    module.exports = (req, res) => {
        res.status(500).json({ 
            success: false, 
            error: 'Serverless Function 初始化失败: ' + e.message,
            stack: e.stack
        });
    };
}
