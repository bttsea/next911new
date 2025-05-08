// path-match.js
// 基于 https://github.com/pillarjs/path-match 修改
// 定制以避免旧版 path-to-regexp 的 Webpack 依赖冲突

const pathToRegexp = require('path-to-regexp');

/**
 * 创建路径匹配工厂函数
 * @returns {Function} - 返回路径匹配生成函数
 */
module.exports = function pathMatch() {
  /**
   * 生成路径匹配函数
   * @param {string} path - 路径模式（如 /post/:id）
   * @returns {Function} - 匹配函数，接收路径和参数
   */
  return function (path) {
    const keys = [];
    const re = pathToRegexp(path, keys, {});

    /**
     * 匹配路径并提取参数
     * @param {string|undefined} pathname - 请求路径
     * @param {Object} [params] - 可选的初始参数对象
     * @returns {Object|false} - 提取的参数对象或 false
     */
    return function (pathname, params) {
      const m = re.exec(pathname);
      if (!m) return false;

      params = params || {};

      let key, param;
      for (let i = 0; i < keys.length; i++) {
        key = keys[i];
        param = m[i + 1];
        if (!param) continue;
        params[key.name] = decodeParam(param);
        if (key.repeat) params[key.name] = params[key.name].split(key.delimiter);
      }

      return params;
    };
  };
};

/**
 * 解码 URL 参数
 * @param {string} param - URL 编码的参数
 * @returns {string} - 解码后的参数
 * @throws {Error} - 如果解码失败，抛出 DECODE_FAILED 错误
 */
function decodeParam(param) {
  try {
    return decodeURIComponent(param);
  } catch (_) {
    const err = new Error('failed to decode param');
    err.code = 'DECODE_FAILED';
    throw err;
  }
}


/*  path-match.js 是一个路径匹配工具


详细功能
path-match.ts 提供以下功能：
动态路径匹配：
使用 path-to-regexp 库将路径模式（如 /post/:id）转换为正则表达式，并提取参数名（keys）。

返回一个匹配函数，接收路径（pathname）和可选参数（params），返回提取的参数对象或 false。

示例：
javascript

const match = route('/post/:id');
match('/post/123'); // 返回 { id: '123' }
match('/post/invalid'); // 返回 { id: 'invalid' }
match('/about'); // 返回 false

/****** */