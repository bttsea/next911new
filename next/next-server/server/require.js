const fs = require('fs');
const { join } = require('path');
const { promisify } = require('util');
const {
  PAGES_MANIFEST,
  SERVER_DIRECTORY,
} = require('../lib/constants');
const { normalizePagePath } = require('./normalize-page-path');

// 异步读取文件
const readFile = promisify(fs.readFile);

// 创建页面未找到错误
function pageNotFoundError(page) {
  const err = new Error(`Cannot find module for page: ${page}`);
  err.code = 'ENOENT';
  return err;
}

// 获取页面文件的路径
function getPagePath(page, distDir, dev) {
  const serverBuildPath = join(distDir, SERVER_DIRECTORY); // 服务器构建目录
  const pagesManifest = require(join(serverBuildPath, PAGES_MANIFEST)); // 加载页面清单

  try {
    page = normalizePagePath(page); // 规范化页面路径
    page = page === '/' ? '/index' : page; // 根路径转换为 /index
  } catch (err) {
    console.error(err);
    throw pageNotFoundError(page);
  }

  if (!pagesManifest[page]) {
    const cleanedPage = page.replace(/\/index$/, '') || '/'; // 移除 /index 后缀
    if (!pagesManifest[cleanedPage]) {
      throw pageNotFoundError(page); // 页面不存在，抛出错误
    } else {
      page = cleanedPage; // 使用清理后的页面路径
    }
  }
  return join(serverBuildPath, pagesManifest[page]); // 返回页面文件路径
}

// 加载页面模块或 HTML 文件
function requirePage(page, distDir) {
  const pagePath = getPagePath(page, distDir); // 获取页面路径
  if (pagePath.endsWith('.html')) {
    return readFile(pagePath, 'utf8'); // 读取 HTML 文件内容
  }
  return require(pagePath); // 加载 JavaScript 模块
}


///=== 将 ES 模块（import/export）转换为 CommonJS（require/module.exports）
module.exports = {
  pageNotFoundError,
  getPagePath,
  requirePage,
};

/*
保留核心功能：
功能概述：
pageNotFoundError：生成页面未找到的错误对象。
getPagePath：根据页面路径和 pages-manifest.json 返回实际文件路径。
requirePage：加载页面模块（JavaScript）或 HTML 文件。
保留逻辑：
保留页面路径规范化（处理 /index 和 /）。
保留对 .html 文件的读取支持（用于预渲染页面）。
保留模块加载（require）逻辑，用于服务端渲染。
/****** */
