// next.js
const Server = require('../next-server/server/next-server').default;

/**
 * 创建 Next.js 服务器实例
 * @param {Object} options - 服务器配置
 * @param {boolean} [options.dev=false] - 是否启用开发模式
 * @returns {Object} - Next.js 服务器实例
 */
function createServer(options) {
  if (options.dev) {
    const DevServer = require('./next-dev-server').default;
    return new DevServer(options);
  }

  return new Server(options);
}

// 支持 CommonJS: require('next')
module.exports = createServer;

// 支持 ES 模块: import next from 'next'
module.exports.default = createServer;


/*
服务器实例创建：
根据 options.dev 参数，动态选择服务器实现：
如果 dev: true，加载 next-dev-server（开发模式服务器，支持 HMR 和错误叠加层）。
如果 dev: false（或未指定），使用 next-server（生产模式服务器，优化性能）。
返回 Server 实例，继承 ServerConstructor 的配置。
示例：const app = require('next')({ dev: true }) 创建开发服务器。

服务器入口:
作为 Next.js 的主入口，处理 next dev, next start, 或自定义服务器（如 server.js）的初始化。
示例：next dev 调用 createServer({ dev: true })，启动开发服务器。


/**** */