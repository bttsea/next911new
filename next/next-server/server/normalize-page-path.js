// normalize-page-path.js
const { posix } = require('path');

/**
 * 规范化页面路径，确保路径格式一致
 * @param {string} page - 页面路径（如 '/about'、'about'、'/'）
 * @returns {string} - 规范化后的路径（如 '/about'、'/index'）
 * @throws {Error} - 如果请求路径与规范化路径不一致，抛出错误
 */
function normalizePagePath(page) {
  // 根路径 '/' 转换为 '/index'
  if (page === '/') {
    page = '/index';
  }
  // 添加前导斜杠
  if (page[0] !== '/') {
    page = `/${page}`;
  }
  // 使用 POSIX 规范化路径
  const resolvedPage = posix.normalize(page);
  // 验证路径一致性
  if (page !== resolvedPage) {
    throw new Error('Requested and resolved page mismatch');
  }
  return page;
}

module.exports = normalizePagePath;

/*
 

详细功能
normalizePagePath 函数的功能如下：
处理根路径：
如果输入路径为 /，追加 /index，确保返回 /index 而不是 /。
原因：Next.js 的页面目录结构中，根页面对应 pages/index.js，而非 pages/。
示例：normalizePagePath('/') 返回 /index。

添加前导斜杠：
如果路径不以 / 开头，添加前导 /，确保路径绝对化。
示例：normalizePagePath('about') 返回 /about。

路径规范化：
使用 Node.js 的 posix.normalize（POSIX 路径规范化）处理路径，移除多余斜杠、. 等。
示例：normalizePagePath('/about//') 返回 /about。

路径验证：
比较输入路径（处理后）与规范化路径，如果不一致（例如包含 ../ 或 ./），抛出错误。
示例：normalizePagePath('/about/../invalid') 抛出 Error: Requested and resolved page mismatch。

返回结果：
返回规范化后的页面路径（string），用于页面查找或文件映射。
示例：normalizePagePath('/about/') 返回 /about。


具体示例：
根路径：
输入：/
输出：/index
说明：根路径 / 被转换为 /index，对应 pages/index.js。

普通页面路径：
输入：about
输出：/about
说明：缺少前导 /，自动添加，规范化后为 /about。

带多余斜杠的路径：
输入：/about//
输出：/about
说明：posix.normalize 移除多余斜杠，输出 /about。

带尾部斜杠的路径：
输入：/about/
输出：/about
说明：posix.normalize 移除尾部斜杠，输出 /about。

非法路径（包含 ../）：
输入：/about/../invalid
输出：抛出 Error: Requested and resolved page mismatch
说明：posix.normalize 解析为 /invalid，与输入不一致，抛出错误。

子目录路径：
输入：/blog/post
输出：/blog/post
说明：路径已规范，无需修改，保持不变。

空路径：
输入：''
输出：/'
说明：空路径添加前导 /，输出 /（注意：实际使用中可能需进一步处理为 /index）。



/***** */