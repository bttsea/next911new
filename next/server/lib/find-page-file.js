// find-page-file.js
const { join } = require('path');
const chalk = require('chalk');
const { isWriteable } = require('../../build/is-writeable');
const { warn } = require('../../build/output/log');

/**
 * 查找页面文件
 * @param {string} rootDir - 页面目录根路径（如 pages/）
 * @param {string} normalizedPagePath - 规范化页面路径（如 /about 或 /users/[id]）
 * @param {string[]} pageExtensions - 支持的文件扩展名（如 ['js', 'jsx']）
 * @returns {Promise<string|null>} - 匹配的相对路径或 null
 */
async function findPageFile(rootDir, normalizedPagePath, pageExtensions) {
  let foundPagePaths = [];

  for (const extension of pageExtensions) {
    const relativePagePath = `${normalizedPagePath}.${extension}`;
    const pagePath = join(rootDir, relativePagePath);

    if (await isWriteable(pagePath)) {
      foundPagePaths.push(relativePagePath);
    }

    const relativePagePathWithIndex = join(normalizedPagePath, `index.${extension}`);
    const pagePathWithIndex = join(rootDir, relativePagePathWithIndex);
    if (await isWriteable(pagePathWithIndex)) {
      foundPagePaths.push(relativePagePathWithIndex);
    }
  }

  if (foundPagePaths.length < 1) {
    return null;
  }

  if (foundPagePaths.length > 1) {
    warn(
      `Duplicate page detected. ${chalk.cyan(
        join('pages', foundPagePaths[0])
      )} and ${chalk.cyan(
        join('pages', foundPagePaths[1])
      )} both resolve to ${chalk.cyan(normalizedPagePath)}.`
    );
  }

  return foundPagePaths[0];
}


module.exports = { findPageFile };


/*
findPageFile 提供以下功能：
页面文件查找：
根据规范化页面路径（normalizedPagePath，如 /about 或 /users/[id]）和支持的扩展名（pageExtensions），在 rootDir（通常是 pages/ 目录）中查找匹配的文件。

检查两种路径：
直接路径：如 about.js（/about）。
索引路径：如 about/index.js（/about）。
示例：对于 /about 和 pageExtensions=['js']，检查 pages/about.js 和 pages/about/index.js。

文件可写性验证：
使用 isWriteable（来自 ../../build/is-writeable）检查文件是否存在且可写。
示例：确保 pages/about.js 可访问。

重复文件警告：
如果找到多个匹配文件（如 about.js 和 about/index.js），通过 warn（来自 ../../build/output/log）输出警告。
示例：
[WARN] Duplicate page detected. pages/about.js and pages/about/index.js both resolve to /about.

返回相对路径：
返回第一个匹配的相对路径（如 pages/about.js）或 null（无匹配）。
示例：/about 返回 pages/about.js。


/**** */