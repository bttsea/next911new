 // start-server.js
const http = require('http');
const next = require('../next');

/**
 * 启动 Next.js 服务器
 * @param {Object} serverOptions - Next.js 配置（如 dir, dev, quiet）
 * @param {number} [port] - 监听端口（如 3000）
 * @param {string} [hostname] - 监听主机（如 localhost）
 * @returns {Promise<Object>} - Next.js 应用实例
 */
async function start(serverOptions, port, hostname) {
  const app = next(serverOptions);
  const srv = http.createServer(app.getRequestHandler());
  await new Promise((resolve, reject) => {
    // 捕获 EADDRINUSE 等错误
    srv.on('error', reject);
    srv.on('listening', () => resolve());
    srv.listen(port, hostname);
  });
  // 调用者需手动运行 app.prepare() 以完成初始化
  return app;
}

module.exports = start;


/*
启动 Next.js 的 HTTP 服务器，初始化 Next.js 应用并监听指定的端口和主机。该模块是 Next.js 开发和生产服务器的核心入口，
负责创建 HTTP 服务并绑定请求处理逻辑

保留了原有的服务器启动逻辑：
初始化 Next.js 应用（next(serverOptions)）。
创建 HTTP 服务器，绑定 app.getRequestHandler()。
异步监听端口，捕获错误，返回 app。

模块导出：
module.exports = start：导出函数，供自定义服务器或 next dev/next start 使用。



/***** */