const { RawSource } = require('webpack-sources');
const { PAGES_MANIFEST, ROUTE_NAME_REGEX } = require('../../../next-server/lib/constants');

// Webpack 插件，用于生成 pages-manifest.json，映射页面路径到构建文件
function PagesManifestPlugin() {}

// 应用插件到 Webpack 编译器
PagesManifestPlugin.prototype.apply = function (compiler) {
  compiler.hooks.emit.tap('NextJsPagesManifest', compilation => {
    const { chunks } = compilation;
    const pages = {}; // 页面路径映射

    // 遍历 Webpack chunks，提取页面路径
    for (const chunk of chunks) {
      const result = ROUTE_NAME_REGEX.exec(chunk.name);

      if (!result) {
        continue;
      }

      const pagePath = result[1];

      if (!pagePath) {
        continue;
      }

      // 规范化路径，使用正斜杠，确保跨平台一致性
      pages[`/${pagePath.replace(/\\/g, '/')}`] = chunk.name.replace(/\\/g, '/');
    }

    // 将 /index 映射到 /
    if (typeof pages['/index'] !== 'undefined') {
      pages['/'] = pages['/index'];
    }

    // 生成 pages-manifest.json
    compilation.assets[PAGES_MANIFEST] = new RawSource(JSON.stringify(pages));
  });
};

module.exports = PagesManifestPlugin;


/*
功能概述：
PagesManifestPlugin 生成 pages-manifest.json，将页面路径（如 /）映射到构建文件（如 .next/server/static/<buildid>/pages/index.js）。
用于服务端渲染（SSR）和 next export 的 defaultPathMap。

保留逻辑：
遍历 Webpack chunks，提取页面路径（ROUTE_NAME_REGEX）。
规范化路径（将反斜杠替换为正斜杠）。
映射 /index 到 /。
生成 pages-manifest.json（通过 RawSource）。

/****** */