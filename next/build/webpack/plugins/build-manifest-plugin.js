// 引入 devalue 用于序列化对象到安全的 JavaScript 表达式
const devalue = require('devalue');
// 引入 Next.js 常量
const constants = require('next/dist/next-server/lib/constants');
// 引入 Webpack 的 RawSource 用于生成资产
const { RawSource } = require('webpack-sources');

// 定义常量，从 Next.js 导入
const BUILD_MANIFEST = constants.BUILD_MANIFEST;
const CLIENT_STATIC_FILES_PATH = constants.CLIENT_STATIC_FILES_PATH;
const CLIENT_STATIC_FILES_RUNTIME_MAIN = constants.CLIENT_STATIC_FILES_RUNTIME_MAIN;
const IS_BUNDLED_PAGE_REGEX = constants.IS_BUNDLED_PAGE_REGEX;
const ROUTE_NAME_REGEX = constants.ROUTE_NAME_REGEX;

// 生成客户端清单，精简资产映射以供客户端使用
function generateClientManifest(assetMap, isModern) {
  const clientManifest = {};
  const appDependencies = new Set(assetMap.pages['/_app']);

  // 遍历页面，排除 _app 的公共依赖
  Object.entries(assetMap.pages).forEach(([page, dependencies]) => {
    if (page === '/_app') return;
    // 过滤依赖，仅保留非 _app 的依赖，且匹配 modern 模式（.module.js）
    const filteredDeps = dependencies.filter(
      (dep) => !appDependencies.has(dep) && /\.module\.js$/.test(dep) === isModern
    );
    // 如果有依赖，添加到客户端清单
    if (filteredDeps.length) {
      clientManifest[page] = filteredDeps;
    }
  });

  // 使用 devalue 序列化清单
  return devalue(clientManifest);
}

// 定义 BuildManifestPlugin 类，用于生成 build-manifest.json 和客户端清单
class BuildManifestPlugin {
  // 构造函数，接收 buildId、clientManifest 和 modern 参数
  constructor(options) {
    this.buildId = options.buildId;
    this.clientManifest = options.clientManifest;
    this.modern = options.modern;
  }

  // 应用插件到 Webpack 编译器
  apply(compiler) {
    // 监听 Webpack 的 emit 钩子，异步生成清单
    compiler.hooks.emit.tapAsync('NextJsBuildManifest', (compilation, callback) => {
      const { chunks } = compilation;
      // 初始化资产映射，包含开发文件和页面依赖
      const assetMap = { devFiles: [], pages: { '/_app': [] } };

      // 查找主运行时 chunk（main.js）
      const mainJsChunk = chunks.find(
        (c) => c.name === CLIENT_STATIC_FILES_RUNTIME_MAIN
      );
      // 获取 main.js 文件
      const mainJsFiles =
        mainJsChunk && mainJsChunk.files.length > 0
          ? mainJsChunk.files.filter((file) => /\.js$/.test(file))
          : [];

      // 遍历所有资产，收集开发模式 DLL 文件
      for (const filePath of Object.keys(compilation.assets)) {
        const path = filePath.replace(/\\/g, '/');
        if (/^static\/development\/dll\//.test(path)) {
          assetMap.devFiles.push(path);
        }
      }

      // 遍历 Webpack 入口点，生成页面资源映射
      for (const [, entrypoint] of compilation.entrypoints.entries()) {
        const result = ROUTE_NAME_REGEX.exec(entrypoint.name);
        if (!result) continue;

        const pagePath = result[1];
        if (!pagePath) continue;

        const filesForEntry = [];
        // 遍历入口点的 chunk
        for (const chunk of entrypoint.chunks) {
          if (!chunk.name || !chunk.files) continue;

          // 过滤文件，仅保留 .js 和 .css，排除 .map 和 .hot-update.js
          for (const file of chunk.files) {
            if (/\.map$/.test(file) || /\.hot-update\.js$/.test(file)) continue;
            if (!/\.js$/.test(file) && !/\.css$/.test(file)) continue;
            if (IS_BUNDLED_PAGE_REGEX.exec(file)) continue;

            filesForEntry.push(file.replace(/\\/g, '/'));
          }
        }

        // 为页面添加文件和 main.js
        assetMap.pages[`/${pagePath.replace(/\\/g, '/')}`] = [
          ...filesForEntry,
          ...mainJsFiles,
        ];
      }

      // 将 /index 映射到 /
      if (typeof assetMap.pages['/index'] !== 'undefined') {
        assetMap.pages['/'] = assetMap.pages['/index'];
      }

      // 如果启用客户端清单，将 _buildManifest.js 添加到 _app
      if (this.clientManifest) {
        assetMap.pages['/_app'].push(
          `${CLIENT_STATIC_FILES_PATH}/${this.buildId}/_buildManifest.js`
        );
        if (this.modern) {
          assetMap.pages['/_app'].push(
            `${CLIENT_STATIC_FILES_PATH}/${this.buildId}/_buildManifest.module.js`
          );
        }
      }

      // 按页面路径排序
      assetMap.pages = Object.keys(assetMap.pages)
        .sort()
        .reduce((a, c) => ((a[c] = assetMap.pages[c]), a), {});

      // 生成 build-manifest.json
      compilation.assets[BUILD_MANIFEST] = new RawSource(
        JSON.stringify(assetMap, null, 2)
      );

      // 生成客户端清单 _buildManifest.js
      if (this.clientManifest) {
        const clientManifestPath = `${CLIENT_STATIC_FILES_PATH}/${this.buildId}/_buildManifest.js`;
        compilation.assets[clientManifestPath] = new RawSource(
          `self.__BUILD_MANIFEST = ${generateClientManifest(assetMap, false)};` +
            `self.__BUILD_MANIFEST_CB && self.__BUILD_MANIFEST_CB()`
        );

        // 如果启用 modern 模式，生成 _buildManifest.module.js
        if (this.modern) {
          const modernClientManifestPath = `${CLIENT_STATIC_FILES_PATH}/${this.buildId}/_buildManifest.module.js`;
          compilation.assets[modernClientManifestPath] = new RawSource(
            `self.__BUILD_MANIFEST = ${generateClientManifest(assetMap, true)};` +
              `self.__BUILD_MANIFEST_CB && self.__BUILD_MANIFEST_CB()`
          );
        }
      }

      // 完成回调
      callback();
    });
  }
}

// 导出 BuildManifestPlugin 类
module.exports = BuildManifestPlugin;




/*
BuildManifestPlugin 是一个 Webpack 插件，用于在 Next.js 构建过程中生成 build-manifest.json 和客户端用的 _buildManifest.js 文件。它的主要作用包括：
生成 build-manifest.json：
创建一个清单文件，记录所有页面的资源映射（例如，页面路径到对应的 JavaScript 和 CSS 文件）。

包含开发模式下的 DLL 文件、页面 bundle 和主运行时（main.js）。

用于服务器端渲染（SSR）和客户端资源加载，确保 Next.js 知道每个页面需要哪些文件。

生成客户端清单 _buildManifest.js：
生成 _buildManifest.js（和 _buildManifest.module.js 如果启用现代模式），包含精简的资源映射。

客户端用此文件确定页面导航时需要加载的额外 JavaScript 文件（排除 _app 已加载的依赖）。

支持动态导入和代码分割（code-splitting）。
/***** */
