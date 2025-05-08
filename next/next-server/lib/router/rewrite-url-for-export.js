function rewriteUrlForNextExport(url) {
  // 将 URL 拆分为 pathname 和 hash（即锚点）两部分，如 "about?x=1#section" → ["about?x=1", "section"]
  const parts = url.split('#');
  const pathname = parts[0]; // 主路径和查询参数
  const hash = parts[1];     // 片段标识符（如 "#section"）

  // 再把 pathname 拆成路径部分和查询字符串部分
  let pathAndQuery = pathname.split('?');
  let path = pathAndQuery[0]; // 纯路径部分，如 "/about"
  const qs = pathAndQuery[1]; // 查询参数，如 "x=1"

  // 去除路径结尾的斜杠（防止重复添加）
  path = path.replace(/\/$/, '');

  // 如果路径末尾 **不是文件扩展名**（例如 ".html"、".png"），就给它加上一个斜杠
  // 例如 "/about" → "/about/"
  if (!/\.[^/]+\/?$/.test(path)) {
    path += '/';
  }

  // 如果有查询参数，则拼接到路径后
  if (qs) {
    path += '?' + qs;
  }

  // 如果有 hash（锚点），也拼接到路径后
  if (hash) {
    path += '#' + hash;
  }

  return path;
}

module.exports = { rewriteUrlForNextExport };

/*
举个例子说明它干了什么：
rewriteUrlForNextExport('/about?x=1#top')
// 返回: "/about/?x=1#top"

rewriteUrlForNextExport('/images/logo.png')
// 返回: "/images/logo.png"

rewriteUrlForNextExport('/blog')
// 返回: "/blog/"
这个函数的主要用途是 在导出静态页面时规范 URL 格式 —— 例如去掉尾部斜杠（然后根据规则补回来），避免生成错误的路径。
/******** */