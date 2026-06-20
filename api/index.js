// Vercel Serverless Function 入口
// 核心设计：登录/健康检查等基础接口永远可用，server.js 采用懒加载
console.log('[Vercel] api/index.js 开始加载...');

// 懒加载 Express app（避免冷启动时 server.js 初始化失败拖垮整个 Function）
let _app = null;
let _loadError = null;
let _loading = false;

function getApp() {
    if (_app) return _app;
    if (_loadError) throw _loadError;
    if (_loading) return null; // 正在加载中

    _loading = true;
    try {
        console.log('[Vercel] 开始懒加载 Express app...');
        const startTime = Date.now();
        _app = require('../backend/server.js');
        console.log('[Vercel] ✅ Express app 加载成功，耗时:', Date.now() - startTime, 'ms');
        return _app;
    } catch (e) {
        console.error('[Vercel] ❌ Express app 加载失败:', e.message);
        _loadError = e;
        throw e;
    } finally {
        _loading = false;
    }
}

// 管理员密码（从环境变量读取）
const ADMIN_PASSWORDS = [
    process.env.ADMIN_PASSWORD_1 || 'admin123',
    process.env.ADMIN_PASSWORD_2 || 'admin456',
    process.env.ADMIN_PASSWORD_3 || 'admin789'
];

// 健康检查（永远可用，不依赖 server.js）
function healthCheck(req, res) {
    return res.status(200).json({
        success: true,
        message: 'API 函数正常工作',
        version: 'v20250620-1',
        serverReady: !!_app,
        hasError: !!_loadError,
        error: _loadError ? _loadError.message : null,
        timestamp: new Date().toISOString(),
        nodeVersion: process.version
    });
}

// 直接处理登录请求（永远可用，不依赖 server.js）
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

// 直接处理登出请求（永远可用）
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

// 直接处理登录状态检查（永远可用）
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

    // ======== 永远可用的接口（不依赖 server.js）========

    // 健康检查
    if (url === '/api/health' || url.endsWith('/health')) {
        return healthCheck(req, res);
    }

    // 登录
    if (url === '/api/admin/login') {
        if (req.method === 'POST') {
            return handleLogin(req, res);
        }
        return res.status(405).json({ success: false, error: '方法不允许' });
    }

    // 登出
    if (url === '/api/admin/logout') {
        if (req.method === 'POST') {
            return handleLogout(req, res);
        }
        return res.status(405).json({ success: false, error: '方法不允许' });
    }

    // 登录状态检查
    if (url === '/api/admin/check') {
        if (req.method === 'GET') {
            return handleCheck(req, res);
        }
        return res.status(405).json({ success: false, error: '方法不允许' });
    }

    // ======== 需要 Express app 的接口（懒加载 server.js）========

    try {
        const expressApp = getApp();

        // 如果正在加载中（并发请求），返回临时响应
        if (!expressApp) {
            return res.status(503).json({
                success: false,
                error: '服务器正在初始化，请稍后重试'
            });
        }

        // 公开读取接口不需要认证，设置虚拟cookie绕过server.js的auth中间件
        const publicPaths = [
            '/api/players',
            '/api/players/stats',
            '/api/players/count',
            '/api/players/search',
            '/api/seasons',
            '/api/rounds',
            '/api/groups',
        ];
        const isPublicApi = req.method === 'GET' && publicPaths.some(p => url.startsWith(p));
        if (isPublicApi) {
            const existingCookie = req.headers.cookie || '';
            req.headers.cookie = existingCookie + (existingCookie ? '; ' : '') + 'admin_token=admin_auth_public_0';
        }

        return expressApp(req, res);
    } catch (e) {
        console.error('[Vercel] ❌ 请求处理失败:', e.message);
        // 如果是首次加载失败，给出更明确的错误信息
        if (!_app && !_loadError) {
            _loadError = e;
        }
        return res.status(500).json({
            success: false,
            error: 'Serverless Function 错误: ' + e.message
        });
    }
};

console.log('[Vercel] ✅ api/index.js 加载完成（server.js 已改为懒加载）');
