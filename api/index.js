// Vercel Serverless Function 入口
// 使用 serverless-http 将 Express app 转换为 Vercel Function 格式
const serverless = require('serverless-http');
const app = require('../backend/server.js');
module.exports = serverless(app);
