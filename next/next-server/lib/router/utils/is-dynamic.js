// 用于检测路径中是否包含动态参数，比如 /blog/[id] 这样的路径
let TEST_ROUTE = /\/\[[^\/]+?\](?=\/|$)/

// 拆分注释写法
  TEST_ROUTE = new RegExp(
  String.raw`/` +      // 匹配起始斜杠
  String.raw`\[` +     // 匹配左中括号 [
  String.raw`[^/]+?` + // 匹配非斜杠的参数名（非贪婪）
  String.raw`\]` +     // 匹配右中括号 ]
  String.raw`(?=/|$)`  // 断言后面是 / 或结尾
)


/*
部分	含义
/	路径分隔符
\[ 和 \]	匹配方括号 [param]
[^\/]+?	括号内不能含有 /，非贪婪匹配
`(?=/	$)`

示例
输入路径	         返回结果	说明
/blog/[id]	       true	  是动态路由
/user/[username]  true	  是动态路由
/about	           false	静态路由
/[lang]/docs/[id]	 true	  有多个动态段


/****** */

/**
 * 判断路径是否为动态路由（包含形如 [param] 的部分）
 * @param {string} route - 路径字符串，例如 "/blog/[id]"
 * @returns {boolean} - 如果是动态路由则返回 true，否则 false
 */
function isDynamicRoute(route) {
  return TEST_ROUTE.test(route)
}

// 导出函数
module.exports = { isDynamicRoute }
