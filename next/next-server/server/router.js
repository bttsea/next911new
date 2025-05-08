// router.js
const { parse } = require('url');
const pathMatch = require('./lib/path-match');

/**
 * 创建路由匹配函数
 * @type {Function}
 */
const route = pathMatch();

/**
 * 路由器类，用于服务端请求匹配和处理
 */
class Router {
  /**
   * 构造函数，初始化路由列表
   * @param {Array} routes - 初始路由数组
   */
  constructor(routes = []) {
    this.routes = routes;
  }

  /**
   * 添加新路由
   * @param {Object} route - 路由对象，包含 match 和 fn
   */
  add(route) {
    this.routes.unshift(route);
  }

  /**
   * 匹配请求路径并返回处理函数
   * @param {Object} req - HTTP 请求对象
   * @param {Object} res - HTTP 响应对象
   * @param {Object} parsedUrl - 解析后的 URL 对象
   * @returns {Function|undefined} - 匹配的处理函数或 undefined
   */
  match(req, res, parsedUrl) {
    const { pathname } = parsedUrl;
    for (const route of this.routes) {
      const params = route.match(pathname);
      if (params) {
        return () => route.fn(req, res, params, parsedUrl);
      }
    }
  }
}

/**
 * 导出路由匹配函数
 * @type {Function}
 */
module.exports.route = route;
 

/*
保留了原有的路由逻辑：
route：调用 pathMatch 生成匹配函数。

Router 类：管理路由列表（routes），支持 add 和 match 方法。

match：遍历路由，匹配路径，返回处理函数。

模块导出：
module.exports.route = route：导出 route 函数。

module.exports = Router：导出 Router 类。

确保与 path-match 和 next-server 其他模块（如 render.js）兼容。


/**** */





 