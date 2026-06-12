// Vercel Serverless Function 入口
// 关键：延迟加载 Express app，避免冷启动超时
console.log('[Vercel] api/index.js 开始加载...');

let app = null;
let handler = null;
let loadError = null;

// 立即响应的健康检查（不加载 Express）
function healthCheck(req, res) {
    console.log('[Vercel] 处理健康检查请求');
    return res.status(200).json({ 
        success: true, 
        message: 'API 函数正常工作',
        timestamp: new Date().toISOString(),
        nodeVersion: process.version
    });
}

// 延迟加载 Express app
function loadApp() {
    if (handler) return handler;
    if (loadError) throw loadError;
    
    try {
        console.log('[Vercel] 开始加载 Express app...');
        const startTime = Date.now();
        
        app = require('../backend/server.js');
        console.log('[Vercel] Express app 加载成功，耗时:', Date.now() - startTime, 'ms');
        
        const serverless = require('serverless-http');
        console.log('[Vercel] serverless-http 加载成功');
        
        handler = serverless(app);
        console.log('[Vercel] Serverless handler 创建成功');
        
        return handler;
    } catch (e) {
        console.error('[Vercel] ❌ 加载失败:', e.message);
        console.error('[Vercel] 堆栈:', e.stack);
        loadError = e;
        throw e;
    }
}

module.exports = (req, res) => {
    const url = req.url || '';
    console.log('[Vercel] 收到请求:', url);
    
    // 修复 Vercel 路由去掉的 /api 前缀
    // Vercel 路由 /api/* 到本文件时，req.url 可能已被去掉 /api 前缀
    if (!url.startsWith('/api/') && url !== '/api') {
        req.url = '/api' + url;
        console.log('[Vercel] 路径已修复:', req.url);
    }
    
    // 健康检查立即响应
    if (url === '/api/health' || url === '/health' || url.endsWith('/health')) {
        return healthCheck(req, res);
    }
    
    try {
        const handler = loadApp();
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
