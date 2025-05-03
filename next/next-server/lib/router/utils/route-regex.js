function getRouteRegex(normalizedRoute) {
  // 去掉结尾的斜杠（如果不是根路径），并对路径中的正则特殊字符进行转义
  const escapedRoute = (normalizedRoute.replace(/\/$/, '') || '/').replace(
    /[|\\{}()[\]^$+*?.-]/g,
    '\\$&'
  );

  const groups = {}; // 存储参数名和它在正则表达式中的位置
  let groupIndex = 1;

  // 将路径中的动态参数（例如 /post/[id]）转成正则表达式
  const parameterizedRoute = escapedRoute.replace(
    /\/\\\[([^\/]+?)\\\](?=\/|$)/g, // 匹配被 `[]` 包裹的部分
    function (_, paramName) {
      // 解码被转义的参数名
      const cleanedName = paramName.replace(/\\([|\\{}()[\]^$+*?.-])/g, '$1');
      groups[cleanedName] = groupIndex++;
      return '/([^/]+?)'; // 匹配非斜杠字符的正则（即参数值）
    }
  );

  console.log('------20250502-----come to -----getRouteRegex------------parameterizedRoute----------' + parameterizedRoute);
  return {
    re: new RegExp('^' + parameterizedRoute + '(?:/)?$', 'i'), // 最终生成的正则
    groups, // 参数名对应的组号          groups 是记录参数名（如 id）在 正则表达式分组中的位置索引 的映射
  };
}

// 导出函数
module.exports = { getRouteRegex }


///=== getRouteRegex 是 Next.js 用来将 动态路由路径（如 /post/[id]）转换为可匹配 URL 的正则表达式 的工具函数
/*
const { re, groups } = getRouteRegex('/post/[id]');
console.log(re);     // 输出: /^\/post\/([^/]+?)(?:/)?$/i
console.log(groups); // 输出: { id: 1 }


const path = '/post/123';
const match = path.match(re);
if (match) { 
  console.log('ID 参数值:', match[groups.id]); // 输出: 123 // match[1] 因为 id 是第一个参数
}
/*************** */


