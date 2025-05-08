// 从当前目录下导入工具函数，并导出供其他模块使用

// 路由匹配器（将 URL 与动态路由匹配）
const { getRouteMatcher } = require('./route-matcher');

// 路由正则表达式生成器（根据路径参数生成可用于匹配的正则）
const { getRouteRegex } = require('./route-regex');

// 路由排序函数（用于处理路由优先级问题）
const { getSortedRoutes } = require('./sorted-routes');

// 判断一个路由是否为动态路由（如 /post/[id]）
const { isDynamicRoute } = require('./is-dynamic');

// 将导入的函数导出，供其他模块调用
module.exports = {
  getRouteMatcher,
  getRouteRegex,
  getSortedRoutes,
  isDynamicRoute,
};
