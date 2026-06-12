// Vercel Serverless Function 入口
console.log('[Vercel] api/index.js 开始加载...');

let app = null;
let handler = null;
let loadError = null;
let initTime = null;

// 立即响应的健康检查（不加载 Express）
function healthCheck(req, res) {
    console.log('[Vercel] 处理健康检查请求');
    return res.status(200).json({ 
        success: true, 
        message: 'API 函数正常工作',
        serverReady: !!handler,
        hasError: !!loadError,
        error: loadError ? loadError.message : null,
        initTime: initTime,
        timestamp: new Date().toISOString(),
        nodeVersion: process.version
    });
}

// 预加载 Express app（在模块加载时执行，这样请求时不需要等待）
try {
    console.log('[Vercel] 开始预加载 Express app...');
    const startTime = Date.now();
    
    app = require('../backend/server.js');
    console.log('[Vercel] Express app 加载成功，耗时:', Date.now() - startTime, 'ms');
    
    const serverless = require('serverless-http');
    handler = serverless(app);
    console.log('[Vercel] Serverless handler 创建成功，总耗时:', Date.now() - startTime, 'ms');
    
    initTime = Date.now() - startTime;
} catch (e) {
    console.error('[Vercel] ❌ 初始化失败:', e.message);
    console.error('[Vercel] 堆栈:', e.stack);
    loadError = e;
    initTime = -1;
}

module.exports = (req, res) => {
    const url = req.url || '';
    console.log('[Vercel] 收到请求:', url);
    
    // 测试路由（不依赖 server.js）
    if (url === '/api/test' || url === '/test') {
        return res.status(200).json({ 
            success: true, 
            message: 'test ok', 
            nodeVersion: process.version,
            serverReady: !!handler
        });
    }
    
    // 修复 Vercel 路由去掉的 /api 前缀
    if (!url.startsWith('/api/') && url !== '/api') {
        req.url = '/api' + url;
        console.log('[Vercel] 路径已修复:', req.url);
    }
    
    // 健康检查立即响应
    if (url === '/api/health' || url === '/health' || url.endsWith('/health')) {
        return healthCheck(req, res);
    }
    
    // 如果初始化失败，直接返回错误
    if (loadError) {
        console.error('[Vercel] 请求被拒绝，server.js 初始化失败:', loadError.message);
        return res.status(500).json({ 
            success: false, 
            error: 'Server 初始化失败: ' + loadError.message
        });
    }
    
    // 如果 handler 未准备好，返回错误
    if (!handler) {
        return res.status(500).json({ 
            success: false, 
            error: 'Handler 未初始化'
        });
    }
    
    try {
        return handler(req, res);
    } catch (e) {
        console.error('[Vercel] ❌ 请求处理失败:', e.message);
        return res.status(500).json({ 
            success: false, 
            error: 'Serverless Function 错误: ' + e.message
        });
    }
};

console.log('[Vercel] api/index.js 加载完成');
