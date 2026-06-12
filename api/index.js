// Vercel Serverless Function 入口
// 不使用 serverless-http，直接用 Express app 处理请求
console.log('[Vercel] api/index.js 开始加载...');

let app = null;
let loadError = null;
let initTime = null;

// 预加载 Express app
try {
    console.log('[Vercel] 开始预加载 Express app...');
    const startTime = Date.now();
    
    app = require('../backend/server.js');
    initTime = Date.now() - startTime;
    console.log('[Vercel] Express app 加载成功，耗时:', initTime, 'ms');
} catch (e) {
    console.error('[Vercel] ❌ 初始化失败:', e.message);
    console.error('[Vercel] 堆栈:', e.stack);
    loadError = e;
    initTime = -1;
}

// 立即响应的健康检查
function healthCheck(req, res) {
    return res.status(200).json({ 
        success: true, 
        message: 'API 函数正常工作',
        serverReady: !!app,
        hasError: !!loadError,
        error: loadError ? loadError.message : null,
        initTime: initTime,
        timestamp: new Date().toISOString(),
        nodeVersion: process.version
    });
}

module.exports = (req, res) => {
    const url = req.url || '';
    console.log('[Vercel] 收到请求:', req.method, url);
    
    // 测试 POST 请求体读取
    if (url === '/api/test-post' || url === '/test-post') {
        console.log('[Vercel] 测试 POST 请求体读取...');
        console.log('[Vercel] req.readableEnded:', req.readableEnded);
        console.log('[Vercel] req.headers[content-type]:', req.headers['content-type']);
        
        const chunks = [];
        req.on('data', chunk => {
            console.log('[Vercel] 收到数据块，大小:', chunk.length);
            chunks.push(chunk);
        });
        req.on('end', () => {
            console.log('[Vercel] 数据流结束');
            const body = Buffer.concat(chunks).toString();
            res.status(200).json({ success: true, body: body, length: body.length });
        });
        req.on('error', (err) => {
            console.error('[Vercel] 数据流错误:', err.message);
            res.status(500).json({ success: false, error: err.message });
        });
        return;
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
    
    // 如果 app 未准备好，返回错误
    if (!app) {
        return res.status(500).json({ 
            success: false, 
            error: 'App 未初始化'
        });
    }
    
    try {
        // 直接用 Express app 处理请求
        return app(req, res);
    } catch (e) {
        console.error('[Vercel] ❌ 请求处理失败:', e.message);
        return res.status(500).json({ 
            success: false, 
            error: 'Serverless Function 错误: ' + e.message
        });
    }
};

console.log('[Vercel] api/index.js 加载完成');
