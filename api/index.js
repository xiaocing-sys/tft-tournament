// Vercel Serverless Function 入口
// 使用 serverless-http 将 Express app 转换为 Vercel Function 格式
const serverless = require('serverless-http');
const app = require('../backend/server.js');

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
