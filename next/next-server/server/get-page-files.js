// get-page-files.js
const { normalizePagePath } = require('./normalize-page-path');

/**
 * 从构建清单中获取页面的文件列表
 * @param {Object} buildManifest - 构建清单，包含 devFiles 和 pages
 * @param {string} page - 页面路径（如 '/about'）
 * @returns {string[]} - 页面对应的文件路径数组
 */
function getPageFiles(buildManifest, page) {
  const normalizedPage = normalizePagePath(page);
  let files = buildManifest.pages[normalizedPage];

  if (!files) {
    files = buildManifest.pages[normalizedPage.replace(/\/index$/, '') || '/'];
  }

  if (!files) {
    console.warn(`无法在 .next/build-manifest.json 中找到 ${normalizedPage} 的文件`);
    return [];
  }

  return files;
}

module.exports = getPageFiles;


/*
用于确定页面所需的脚本文件



详细功能
getPageFiles 函数的功能如下：
获取页面文件：
根据输入的页面路径（page），从 buildManifest.pages 中查找对应的文件列表（string[]）。
示例：对于页面 /about，返回 ['static/development/pages/about.js']。

路径规范化：
使用 normalizePagePath（从 ./normalize-page-path 导入）规范化页面路径，去除多余斜杠、扩展名等。
示例：normalizePagePath('/about/') 返回 /about。

处理 /index 路径：
如果页面路径以 /index 结尾（如 /about/index），尝试查找去除 /index 后的路径（如 /about）。
示例：buildManifest.pages['/about'] 未找到，则查找 buildManifest.pages['/about/index']。



客户端导航：
客户端通过 build-manifest.json 加载页面脚本，getPageFiles 提供正确的文件列表。
示例：导航到 /about，加载 static/development/pages/about.js。

构建清单集成：
依赖 .next/build-manifest.json，由 Webpack 在构建时生成，包含页面和文件的映射。
示例 build-manifest.json：
json

{
  "devFiles": ["static/development/dll/dll_123.js"],
  "pages": {
    "/": ["static/development/pages/index.js"],
    "/about": ["static/development/pages/about.js"]
  }
}




与 _document.js 和 htmlescape.js 的关联:
getPageFiles 提供页面脚本，_document.js 渲染 <script> 标签，htmlescape.js 转义 window.__NEXT_DATA__.
示例：/about 页面渲染：
html
<script src="/_next/static/development/pages/about.js"></script>






/**** */