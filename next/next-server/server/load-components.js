const {
  BUILD_MANIFEST,
  CLIENT_STATIC_FILES_PATH,
  REACT_LOADABLE_MANIFEST,
  SERVER_DIRECTORY,
} = require('../lib/constants');
const { join } = require('path');
const { requirePage } = require('./require');

// 兼容模块默认导出
function interopDefault(mod) {
  return mod.default || mod;
}

// 加载页面组件和相关配置
async function loadComponents(distDir, buildId, pathname) {
  // 构造 _document 和 _app 的文件路径
  const documentPath = join(
    distDir,
    SERVER_DIRECTORY,
    CLIENT_STATIC_FILES_PATH,
    buildId,
    'pages',
    '_document'
  );
  const appPath = join(
    distDir,
    SERVER_DIRECTORY,
    CLIENT_STATIC_FILES_PATH,
    buildId,
    'pages',
    '_app'
  );

  // 加载 _document 模块
  const DocumentMod = require(documentPath);
  const { middleware: DocumentMiddleware } = DocumentMod;

  // 加载页面组件模块
  const ComponentMod = requirePage(pathname, distDir, false);

  // 并行加载构建清单、动态加载清单、组件、文档和应用
  const [
    buildManifest,
    reactLoadableManifest,
    Component,
    Document,
    App,
  ] = await Promise.all([
    require(join(distDir, BUILD_MANIFEST)),
    require(join(distDir, REACT_LOADABLE_MANIFEST)),
    interopDefault(ComponentMod),
    interopDefault(DocumentMod),
    interopDefault(require(appPath)),
  ]);

  // 返回加载的组件和配置
  return {
    App,
    Document,
    Component,
    buildManifest,
    DocumentMiddleware,
    reactLoadableManifest,
    pageConfig: ComponentMod.config || {},
  };
}

module.exports = { loadComponents };


/*
保留核心功能：
功能概述：
loadComponents 负责加载页面组件（Component）、应用（App）、文档（Document）、构建清单（buildManifest）和动态加载清单（reactLoadableManifest）。
支持服务端渲染和静态导出。

保留逻辑：
加载 _document, _app 和页面组件。
处理模块默认导出（interopDefault）。
加载 buildManifest 和 reactLoadableManifest。
返回 pageConfig 和 DocumentMiddleware。

/**** */