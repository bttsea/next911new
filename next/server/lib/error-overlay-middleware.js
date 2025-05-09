// error-overlay-middleware.js
const url = require('url');
const launchEditor = require('launch-editor');
const fs = require('fs');
const path = require('path');

/**
 * 错误叠加层中间件，用于开发模式打开编辑器
 * @param {Object} options - 配置对象，包含 dir（项目根目录）
 * @returns {Function} - 中间件函数
 */
function errorOverlayMiddleware(options) {
  return function (req, res, next) {
    if (req.url.startsWith('/_next/development/open-stack-frame-in-editor')) {
      const query = url.parse(req.url, true).query;
      const lineNumber = parseInt(query.lineNumber, 10) || 1;
      const colNumber = parseInt(query.colNumber, 10) || 1;

      let resolvedFileName = query.fileName;

      if (!fs.existsSync(resolvedFileName)) {
        resolvedFileName = path.join(options.dir, resolvedFileName);
      }

      launchEditor(`${resolvedFileName}:${lineNumber}:${colNumber}`);
      res.end();
    } else {
      next();
    }
  };
}

module.exports = errorOverlayMiddleware;






/*
开发模式（next dev）下处理错误叠加层（Error Overlay）的请求，允许在浏览器中点击错误堆栈，自动在代码编辑器中打开对应的文件和行号


详细功能
errorOverlayMiddleware 提供以下功能：
处理编辑器打开请求：
拦截 /_next/development/open-stack-frame-in-editor 请求，解析查询参数（fileName, lineNumber, colNumber）。

使用 launch-editor 库在指定编辑器中打开文件，定位到指定行号和列号。
示例：请求 /_next/development/open-stack-frame-in-editor?fileName=pages/index.js&lineNumber=10&colNumber=5 打开 pages/index.js:10:5。

文件路径解析：
检查 fileName 是否为绝对路径，若不存在，拼接项目根目录（options.dir）生成完整路径。
示例：fileName=pages/index.js 转换为 H:\next911new\my-app\pages\index.js。

中间件设计：
如果请求不匹配 /_next/development/open-stack-frame-in-editor，调用 next() 继续处理后续中间件。
示例：普通请求（如 /api/users）直接跳过。



/*** */