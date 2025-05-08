// 构建阶段
const PHASE_EXPORT = 'phase-export'; // 静态导出阶段
const PHASE_PRODUCTION_BUILD = 'phase-production-build'; // 生产构建阶段
const PHASE_PRODUCTION_SERVER = 'phase-production-server'; // 生产服务器阶段
const PHASE_DEVELOPMENT_SERVER = 'phase-development-server'; // 开发服务器阶段

// 清单文件
const PAGES_MANIFEST = 'pages-manifest.json'; // 页面清单文件
const BUILD_MANIFEST = 'build-manifest.json'; // 构建清单文件
const REACT_LOADABLE_MANIFEST = 'react-loadable-manifest.json'; // 动态加载清单文件

// 目录结构
const SERVER_DIRECTORY = 'server'; // 服务端文件目录
const CLIENT_PUBLIC_FILES_PATH = 'public'; // 公共文件目录
const CLIENT_STATIC_FILES_PATH = 'static'; // 静态文件目录
const CLIENT_STATIC_FILES_RUNTIME = 'runtime'; // 运行时文件目录
const CLIENT_STATIC_FILES_RUNTIME_PATH = `${CLIENT_STATIC_FILES_PATH}/${CLIENT_STATIC_FILES_RUNTIME}`; // 运行时文件路径

// 运行时文件
const CLIENT_STATIC_FILES_RUNTIME_MAIN = `${CLIENT_STATIC_FILES_RUNTIME_PATH}/main.js`; // 主运行时文件
const CLIENT_STATIC_FILES_RUNTIME_WEBPACK = `${CLIENT_STATIC_FILES_RUNTIME_PATH}/webpack.js`; // Webpack 运行时文件

// 配置文件
const CONFIG_FILE = 'next.config.js'; // Next.js 配置文件
const BUILD_ID_FILE = 'BUILD_ID'; // 构建 ID 文件

// 特殊页面
const BLOCKED_PAGES = ['/_document', '/_app']; // 禁止直接访问的页面

// 正则表达式
const IS_BUNDLED_PAGE_REGEX = /^static[/\\][^/\\]+[/\\]pages.*\.js$/; // 匹配打包页面文件
const ROUTE_NAME_REGEX = /^static[/\\][^/\\]+[/\\]pages[/\\](.*)\.js$/; // 提取页面路由名称

module.exports = {
  PHASE_EXPORT,
  PHASE_PRODUCTION_BUILD,
  PHASE_PRODUCTION_SERVER,
  PHASE_DEVELOPMENT_SERVER,
  PAGES_MANIFEST,
  BUILD_MANIFEST,
  REACT_LOADABLE_MANIFEST,
  SERVER_DIRECTORY,
  CLIENT_PUBLIC_FILES_PATH,
  CLIENT_STATIC_FILES_PATH,
  CLIENT_STATIC_FILES_RUNTIME,
  CLIENT_STATIC_FILES_RUNTIME_PATH,
  CLIENT_STATIC_FILES_RUNTIME_MAIN,
  CLIENT_STATIC_FILES_RUNTIME_WEBPACK,
  CONFIG_FILE,
  BUILD_ID_FILE,
  BLOCKED_PAGES,
  IS_BUNDLED_PAGE_REGEX,
  ROUTE_NAME_REGEX,
};


/****
 * 保留核心功能：
功能概述：
constants.js 提供 Next.js 的核心常量，用于构建、渲染和导出流程。

支持服务端渲染和静态导出。

保留的常量：
构建阶段（PHASE_EXPORT, PHASE_PRODUCTION_BUILD, PHASE_PRODUCTION_SERVER, PHASE_DEVELOPMENT_SERVER）。

清单文件（PAGES_MANIFEST, BUILD_MANIFEST, REACT_LOADABLE_MANIFEST）。

目录结构（SERVER_DIRECTORY, CLIENT_PUBLIC_FILES_PATH, CLIENT_STATIC_FILES_PATH, CLIENT_STATIC_FILES_RUNTIME, CLIENT_STATIC_FILES_RUNTIME_PATH）。

运行时文件（CLIENT_STATIC_FILES_RUNTIME_MAIN, CLIENT_STATIC_FILES_RUNTIME_WEBPACK）。

配置文件（CONFIG_FILE, BUILD_ID_FILE）。

特殊页面（BLOCKED_PAGES）。

正则表达式（IS_BUNDLED_PAGE_REGEX, ROUTE_NAME_REGEX）。



/**** */  