 // 引入 path-to-regexp 模块，用于生成路由正则表达式
const pathToRegexp = require('path-to-regexp');

// 创建路由匹配函数
function pathMatch() {
  return function (path) {
    const keys = [];
    // 使用 path-to-regexp 生成正则表达式和参数键
    const re = pathToRegexp(path, keys, {});

    // 返回路径匹配函数
    return function (pathname, params) {
      // 执行正则匹配
      const m = re.exec(pathname);
      if (!m) return false;

      // 初始化参数对象
      params = params || {};

      // 提取并解码路径参数
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const param = m[i + 1];
        if (!param) continue;
        params[key.name] = decodeParam(param);
        if (key.repeat) params[key.name] = params[key.name].split(key.delimiter);
      }

      return params;
    };
  };
}

// 解码路径参数
function decodeParam(param) {
  try {
    return decodeURIComponent(param);
  } catch (_) {
    const err = new Error('failed to decode param');
    err.code = 'DECODE_FAILED';
    throw err;
  }
}

// 导出路由匹配函数
 
module.exports = {
 
  pathMatch: pathMatch
};




















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