// Vercel Serverless Function 入口
// 直接导出 Express app，Vercel 会自动处理
const app = require('../backend/server.js');
module.exports = app;
