const path = require('path');
const { parse } = require('querystring');
const { CLIENT_STATIC_FILES_RUNTIME_MAIN } = require('../../../next-server/lib/constants');

// 存储模块和 chunk 的清单
const manifest = {
  sharedFiles: [], // 共享文件
  pages: {}, // 页面文件映射
  pageChunks: {}, // 页面 chunk 映射
  chunks: {}, // 其他 chunk 映射
};

// 页面模块映射
const pageModules = {};

// 获取页面的 chunk 信息
function getPageChunks(page) {
  if (!manifest.pages[page] && !pageModules[page]) {
    return;
  }

  const external = new Set(); // 外部模块（node_modules）
  const internal = new Set(); // 内部模块（项目文件）

  [...(manifest.pages[page] || []), ...(pageModules[page] || [])].map(mod => {
    mod = mod.replace(/\\/g, '/');

    // 忽略 Next.js 内部模块
    if (mod.match(/(next-server|next)\//)) {
      return null;
    }

    // 处理 node_modules 模块
    if (mod.includes('node_modules/')) {
      if (
        mod.match(
          /node_modules\/(@babel|core-js|styled-jsx|string-hash|object-assign|process|react|react-dom|scheduler|regenerator-runtime|webpack|node-libs-browser)\//
        )
      ) {
        return null;
      }

      mod = mod.split('node_modules/')[1].split('/')[0];
      if (external.has(mod)) {
        return null;
      }

      external.add(mod);
      return mod;
    }

    // 忽略页面自身文件
    if (mod.includes(`pages${page === '/' ? '/index' : page}`)) {
      return null;
    }

    // 添加内部模块
    if (internal.has(mod)) {
      return null;
    }

    internal.add(mod);
    return mod;
  });

  return { external, internal };
}

// 获取模块文件路径
function getFiles(dir, modules) {
  if (!(modules && modules.length)) {
    return [];
  }

  function getFileByIdentifier(id) {
    if (id.startsWith('external ') || id.startsWith('multi ')) {
      return null;
    }

    let n;
    if ((n = id.lastIndexOf('!')) !== -1) {
      id = id.substring(n + 1);
    }

    if (id && !path.isAbsolute(id)) {
      id = path.resolve(dir, id);
    }

    return id;
  }

  return modules
    .reduce(
      (acc, val) =>
        val.modules
          ? acc.concat(getFiles(dir, val.modules))
          : (acc.push(
              getFileByIdentifier(
                typeof val.identifier === 'function' ? val.identifier() : val.identifier
              )
            ),
            acc),
      []
    )
    .filter(Boolean);
}

// Webpack 插件，用于收集页面和 chunk 的模块信息
function ChunkGraphPlugin(buildId, { dir, distDir }) {
  this.buildId = buildId;
  this.dir = dir;
  this.distDir = distDir;
}

// 应用插件到 Webpack 编译器
ChunkGraphPlugin.prototype.apply = function (compiler) {
  const { dir } = this;

  compiler.hooks.emit.tap('ChunkGraphPlugin', compilation => {
    const sharedFiles = []; // 共享文件
    const sharedChunks = []; // 共享 chunk
    const pages = {}; // 页面文件
    const pageChunks = {}; // 页面 chunk

    compilation.chunks.forEach(chunk => {
      if (!chunk.hasEntryModule()) {
        return;
      }

      const chunkModules = new Map();

      const queue = new Set(chunk.groupsIterable);
      const chunksProcessed = new Set();

      const involvedChunks = new Set();

      // 遍历 chunk 组，收集模块和 chunk
      for (const chunkGroup of queue) {
        for (const chunk of chunkGroup.chunks) {
          chunk.files.forEach(file => involvedChunks.add(file));
          if (!chunksProcessed.has(chunk)) {
            chunksProcessed.add(chunk);
            for (const m of chunk.modulesIterable) {
              chunkModules.set(m.id, m);
            }
          }
        }
        for (const child of chunkGroup.childrenIterable) {
          queue.add(child);
        }
      }

      const modules = [...chunkModules.values()];
      const nodeModules = [];
      const files = getFiles(dir, modules)
        .filter(val => {
          const isModule = val.includes('node_modules');
          if (isModule) nodeModules.push(val);
          return !isModule;
        })
        .filter(val => path.relative(this.distDir, val).startsWith('..'))
        .map(f => path.relative(dir, f));

      let pageName;
      if (chunk.entryModule && chunk.entryModule.loaders) {
        const entryLoader = chunk.entryModule.loaders.find(
          ({ loader, options }) => loader && loader.match(/next-(\w+-)+loader/) && options
        );
        if (entryLoader) {
          const { page } = parse(entryLoader.options);
          if (typeof page === 'string' && page) {
            pageName = page;
          }
        }
      }

      if (pageName) {
        if (pageName === '/_app' || pageName === '/_error' || pageName === '/_document') {
          sharedFiles.push(...files);
          sharedChunks.push(...involvedChunks);
        } else {
          pages[pageName] = files;
          pageChunks[pageName] = [...involvedChunks];
        }
        pageModules[pageName] = nodeModules;
      } else {
        if (chunk.name === CLIENT_STATIC_FILES_RUNTIME_MAIN) {
          sharedFiles.push(...files);
          sharedChunks.push(...involvedChunks);
        } else {
          manifest.chunks[chunk.name] = [
            ...new Set([...(manifest.chunks[chunk.name] || []), ...files]),
          ].sort();
        }
      }
    });

    // 更新 manifest
    manifest.sharedFiles = [...new Set([...(manifest.sharedFiles || []), ...sharedFiles])].sort();

    for (const page in pages) {
      manifest.pages[page] = [...new Set([...(manifest.pages[page] || []), ...pages[page]])].sort();
      manifest.pageChunks[page] = [
        ...new Set([...(manifest.pageChunks[page] || []), ...pageChunks[page], ...sharedChunks]),
      ].sort();
    }
  });
};

module.exports = ChunkGraphPlugin;
module.exports.getPageChunks = getPageChunks;



/*

保留核心功能：
功能概述：
ChunkGraphPlugin 收集 Webpack chunks 和模块信息，生成 manifest 对象，记录页面、共享文件和 chunk 的依赖关系。
getPageChunks 函数分析页面模块，区分外部（node_modules）和内部（项目文件）依赖。
用于优化构建（如缓存、增量编译）和调试依赖关系。

保留逻辑：
收集 chunks 和模块（chunkModules, involvedChunks）。
提取页面名称（通过 next-*-loader 的 page 参数）。
分类共享文件（_app, _error, _document, CLIENT_STATIC_FILES_RUNTIME_MAIN）和页面文件。
更新 manifest（sharedFiles, pages, pageChunks, chunks）。
getPageChunks 保留原逻辑，分析模块依赖。manifest.pageChunks 仅包含标准 chunk（如 static/<buildid>/pages/*.js），符合 target: 'server'.
getFiles 保留原逻辑，解析模块路径。
/********* */

