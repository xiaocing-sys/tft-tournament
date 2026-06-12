// Vercel Serverless Function 入口
console.log('[Vercel] api/index.js 开始加载...');

module.exports = (req, res) => {
    // 所有请求都返回调试信息
    return res.status(200).json({
        message: 'api/index.js 被调用了',
        url: req.url,
        originalUrl: req.originalUrl,
        method: req.method,
        path: req.path,
        query: req.query,
        headers: {
            host: req.headers.host,
            'content-type': req.headers['content-type']
        }
    });
};

console.log('[Vercel] api/index.js 加载完成');
