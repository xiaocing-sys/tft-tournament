// Netlify Function：将 Express 应用包装为 Serverless 函数
// 使用 serverless-http 将 Express app 转换为 Netlify Function 格式
const serverless = require('serverless-http');
const path = require('path');

// 设置环境变量（在加载 server.js 之前）
// DATABASE_URL 在 Netlify 后台设置，无需在此硬编码

let cachedHandler = null;

exports.handler = async (event, context) => {
    if (!cachedHandler) {
        // 清除 require 缓存，确保冷启动时重新加载
        const serverJsPath = path.resolve(__dirname, '..', '..', 'backend', 'server.js');
        if (require.cache[serverJsPath]) {
            delete require.cache[serverJsPath];
        }
        
        // 加载 server.js，获取导出的 app
        const serverModule = require(serverJsPath);
        const app = serverModule.app || serverModule;
        
        if (!app) {
            throw new Error(
                'server.js 未导出 app！\n' +
                '请在 server.js 末尾添加：\n' +
                'if (typeof module !== "undefined" && module.exports) {\n' +
                '    module.exports.app = app;\n' +
                '}'
            );
        }
        
        // 使用 serverless-http 包装 Express app
        // binary 选项：支持图片等二进制响应
        cachedHandler = serverless(app, {
            binary: ['image/*', 'application/octet-stream', 'application/pdf'],
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization'
            }
        });
        
        console.log('[Netlify] Function handler cached');
    }
    
    // 处理 OPTIONS 预检请求
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type'
            },
            body: ''
        };
    }
    
    return await cachedHandler(event, context);
};
