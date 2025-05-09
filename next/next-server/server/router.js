 // 引入必要的模块
const { pathMatch } = require('./lib/path-match');

// 创建路由匹配函数
const route = pathMatch();

// 定义路由器类
class Router {
  // 构造函数，初始化路由列表
  constructor(routes = []) {
    this.routes = routes;
  }

  // 添加新路由到路由列表开头
  add(route) {
    this.routes.unshift(route);
  }

  // 匹配请求路径并返回对应的处理函数
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

// 导出路由匹配函数和路由器类
module.exports = {
  route: route,
  Router: Router
};

  







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





 