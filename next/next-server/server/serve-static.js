// serve-static.js
const { IncomingMessage, ServerResponse } = require('http');
const send = require('send');

/**
 * 服务静态文件
 * @param {Object} req - HTTP 请求对象
 * @param {Object} res - HTTP 响应对象
 * @param {string} path - 静态文件路径
 * @returns {Promise<void>} - 文件传输完成或错误时的 Promise
 */
function serveStatic(req, res, path) {
  return new Promise((resolve, reject) => {
    send(req, path)
      .on('directory', () => {
        // 禁止访问目录
        const err = new Error('No directory access');
        err.code = 'ENOENT';
        reject(err);
      })
      .on('error', reject)
      .pipe(res)
      .on('finish', resolve);
  });
}

module.exports = serveStatic;

/*
实现了一个静态文件服务函数（serveStatic），用于处理 HTTP 请求，返回指定路径的静态文件（如图片、CSS、JS 文件）。
该模块依赖 send 库（一个高效的静态文件服务中间件），是 next-server 的核心组件，用于服务 public/ 目录或构建输出（如 .next/static/）中的静态资源。




保留了原有的静态文件服务逻辑：
使用 send 传输文件流，处理 req 和 res。
文件传输：将指定路径的文件流传输到 HTTP 响应，支持大文件。
错误处理：禁止目录访问，捕获文件错误（如 404），通过 Promise 传递。
异步操作：返回 Promise，适配异步 HTTP 处理。





/***** */