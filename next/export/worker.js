const mkdirpModule = require('mkdirp');
const { promisify } = require('util');
const { extname, join, dirname, sep } = require('path');
const { renderToHTML } = require('../next-server/server/render');
const { writeFile } = require('fs');
const { loadComponents } = require('../next-server/server/load-components.js');

const envConfig = require('../next-server/lib/runtime-config');
const writeFileP = promisify(writeFile); // 异步写文件
const mkdirp = promisify(mkdirpModule); // 异步创建目录

// 设置全局 __NEXT_DATA__，支持导出
global.__NEXT_DATA__ = {
  nextExport: true,
};

// 工作线程主函数，处理单个页面的静态渲染
async function exportPage({ path, pathMap, distDir, buildId, outDir, renderOpts, serverRuntimeConfig, subFolders }) {
  const results = {}; // 存储渲染结果

  try {
    const { page } = pathMap; // 获取页面路径
    const filePath = path === '/' ? '/index' : path; // 处理根路径

    // 模拟 HTTP 请求和响应头
    const headerMocks = {
      headers: {},
      getHeader: () => ({}),
      setHeader: () => {},
      hasHeader: () => false,
      removeHeader: () => {},
      getHeaderNames: () => [],
    };

    const req = { url: path, ...headerMocks }; // 模拟请求对象
    const res = { ...headerMocks }; // 模拟响应对象

    // 设置运行时配置
    envConfig.setConfig({
      serverRuntimeConfig,
      publicRuntimeConfig: renderOpts.runtimeConfig,
    });

    // 确定输出文件名
    let htmlFilename = `${filePath}${sep}index.html`;
    if (!subFolders) htmlFilename = `${filePath}.html`;

    const pageExt = extname(page);
    const pathExt = extname(path);
    if (pageExt !== pathExt && pathExt !== '') {
      htmlFilename = path; // 使用路径扩展名作为文件名
    } else if (path === '/') {
      htmlFilename = 'index.html'; // 根路径使用 index.html
    }

    const baseDir = join(outDir, dirname(htmlFilename)); // 输出目录
    const htmlFilepath = join(outDir, htmlFilename); // HTML 文件路径

    await mkdirp(baseDir); // 创建输出目录

    // 加载页面组件
    const components = await loadComponents(distDir, buildId, page);

    let html;
    let curRenderOpts = {};
    const renderMethod = renderToHTML; // 默认渲染方法

    if (typeof components.Component === 'string') {
      html = components.Component; // 直接使用字符串内容
    } else {
      curRenderOpts = { ...components, ...renderOpts }; // 合并渲染选项
      html = await renderMethod(req, res, page, {}, curRenderOpts); // 渲染 HTML
    }

    await writeFileP(htmlFilepath, html, 'utf8'); // 写入 HTML 文件
    return results;
  } catch (error) {
    console.error(`\n渲染页面 ${path} 时出错：`, error);
    return { ...results, error: true }; // 返回错误结果
  }
}

module.exports = { exportPage };

/*
功能概述：
worker.js 是 next/export 的工作线程，负责渲染单个页面为静态 HTML。

支持 next export，生成 .html 文件。

保留逻辑：
页面路径处理（filePath, htmlFilename）。
模拟 HTTP 请求和响应（req, res）。
运行时配置（envConfig.setConfig）。
目录创建（mkdirp）。
组件加载（loadComponents）。
页面渲染（renderToHTML）。
HTML 写入（writeFileP）。

/***** */