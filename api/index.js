// Vercel Serverless Function 入口
// 直接处理关键请求，避免 server.js 的全局中间件和 express.json() 问题
console.log('[Vercel] api/index.js 开始加载...');

let app = null;
let loadError = null;
let initTime = null;

// 预加载 Express app（仅用于非登录请求）
try {
    console.log('[Vercel] 开始预加载 Express app...');
    const startTime = Date.now();
    app = require('../backend/server.js');
    initTime = Date.now() - startTime;
    console.log('[Vercel] Express app 加载成功，耗时:', initTime, 'ms');
} catch (e) {
    console.error('[Vercel] ❌ 初始化失败:', e.message);
    loadError = e;
    initTime = -1;
}

// 管理员密码（从环境变量读取）
const ADMIN_PASSWORDS = [
    process.env.ADMIN_PASSWORD_1 || 'admin123',
    process.env.ADMIN_PASSWORD_2 || 'admin456',
    process.env.ADMIN_PASSWORD_3 || 'admin789'
];

// 健康检查
function healthCheck(req, res) {
    return res.status(200).json({ 
        success: true, 
        message: 'API 函数正常工作',
        version: 'v20250612-2',
        serverReady: !!app,
        hasError: !!loadError,
        error: loadError ? loadError.message : null,
        initTime: initTime,
        timestamp: new Date().toISOString(),
        nodeVersion: process.version
    });
}

// 直接处理登录请求（绕过 server.js 的全局中间件）
function handleLogin(req, res) {
    console.log('[Vercel] 处理登录请求');
    
    // 手动读取请求体
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
        try {
            const bodyStr = Buffer.concat(chunks).toString();
            const body = bodyStr ? JSON.parse(bodyStr) : {};
            const password = body.password;
            
            console.log('[Vercel] 密码长度:', password ? password.length : 0);
            
            const idx = ADMIN_PASSWORDS.indexOf(password);
            console.log('[Vercel] 密码匹配索引:', idx);
            
            if (idx !== -1) {
                const isSecure = req.headers['x-forwarded-proto'] === 'https';
                console.log('[Vercel] 登录成功，设置 cookie，secure:', isSecure);
                
                const cookieValue = 'admin_auth_' + idx + '_' + Date.now();
                const cookieOptions = [
                    'admin_token=' + cookieValue,
                    'HttpOnly',
                    'Max-Age=' + (7*24*60*60),
                    'Path=/',
                    isSecure ? 'Secure' : '',
                    isSecure ? 'SameSite=None' : 'SameSite=Lax'
                ].filter(Boolean).join('; ');
                
                res.setHeader('Set-Cookie', cookieOptions);
                res.status(200).json({ success: true, adminIndex: idx + 1 });
            } else {
                console.log('[Vercel] 密码错误');
                res.status(401).json({ success: false, error: '密码错误' });
            }
        } catch (e) {
            console.error('[Vercel] 登录处理错误:', e.message);
            res.status(400).json({ success: false, error: '请求格式错误' });
        }
    });
    req.on('error', (err) => {
        console.error('[Vercel] 请求体读取错误:', err.message);
        res.status(500).json({ success: false, error: '读取请求体失败' });
    });
}

// 直接处理登出请求
function handleLogout(req, res) {
    const isSecure = req.headers['x-forwarded-proto'] === 'https';
    const cookieOptions = [
        'admin_token=',
        'HttpOnly',
        'Max-Age=0',
        'Path=/',
        isSecure ? 'Secure' : '',
        isSecure ? 'SameSite=None' : 'SameSite=Lax'
    ].filter(Boolean).join('; ');
    
    res.setHeader('Set-Cookie', cookieOptions);
    res.status(200).json({ success: true });
}

// 直接处理登录状态检查
function handleCheck(req, res) {
    const cookies = req.headers.cookie || '';
    const tokenMatch = cookies.match(/admin_token=([^;]+)/);
    const token = tokenMatch ? tokenMatch[1] : null;
    const loggedIn = token && token.startsWith('admin_auth_');
    let adminIndex = null;
    if (loggedIn) {
        const parts = token.split('_');
        adminIndex = parts[2] ? parseInt(parts[2]) + 1 : 1;
    }
    res.status(200).json({ success: true, loggedIn, adminIndex });
}

module.exports = (req, res) => {
    const url = req.url || '';
    console.log('[Vercel] 收到请求:', req.method, url);
    
    // 健康检查
    if (url === '/api/health' || url.endsWith('/health')) {
        return healthCheck(req, res);
    }
    
    // 登录相关请求直接处理（绕过 server.js）
    if (url === '/api/admin/login') {
        if (req.method === 'POST') {
            return handleLogin(req, res);
        }
        return res.status(405).json({ success: false, error: '方法不允许' });
    }
    
    if (url === '/api/admin/logout') {
        if (req.method === 'POST') {
            return handleLogout(req, res);
        }
        return res.status(405).json({ success: false, error: '方法不允许' });
    }
    
    if (url === '/api/admin/check') {
        if (req.method === 'GET') {
            return handleCheck(req, res);
        }
        return res.status(405).json({ success: false, error: '方法不允许' });
    }
    
    // 其他请求交给 Express app 处理
    if (loadError) {
        return res.status(500).json({ 
            success: false, 
            error: 'Server 初始化失败: ' + loadError.message
        });
    }
    
    if (!app) {
        return res.status(500).json({ 
            success: false, 
            error: 'App 未初始化'
        });
    }
    
    try {
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
