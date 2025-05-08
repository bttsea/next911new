const { getRouteRegex } = require('./route-regex');

/**
 * 根据给定的路由正则表达式对象，生成一个匹配器函数
 * 用于解析 URL pathname 中的动态参数
 * 
 * @param {Object} routeRegex - getRouteRegex() 返回的对象，包含正则表达式和参数映射
 * @returns {Function} - 接收 pathname 字符串，返回解析出来的参数对象或 false（匹配失败）
 */
function getRouteMatcher(routeRegex) {
  const { re, groups } = routeRegex;

  return function (pathname) {
    // 尝试使用正则匹配 pathname
    const routeMatch = re.exec(pathname);
    if (!routeMatch) {
      return false; // 如果匹配失败，返回 false
    }

    const params = {};

    // 遍历所有动态参数的组名
    Object.keys(groups).forEach(function (slugName) {
      const matchedValue = routeMatch[groups[slugName]];
      if (matchedValue !== undefined) {
        // 解码 URL 编码的值，并赋值给对应的参数名
        params[slugName] = decodeURIComponent(matchedValue);
      }
    });

    console.log('---pathname---20250502-----come to -----getRouteMatcher------params------ ----------'  + pathname + ' ---> ' + JSON.stringify(params, null, 4)); 
    ///=== ---pathname---20250502-----come to -----getRouteMatcher------params------ ----------/posts/VqmBUv7kTYjDpD78 ---> { "id": "VqmBUv7kTYjDpD78" }

    return params; // 返回解析后的参数对象
  };
}

module.exports = { getRouteMatcher };

/*
const { getRouteRegex } = require('./route-regex');
const { getRouteMatcher } = require('./route-matcher');

const matcher = getRouteMatcher(getRouteRegex('/posts/[id]'));

console.log(matcher('/posts/123')); // 输出: { id: '123' }
console.log(matcher('/about'));     // 输出: false

/**** */