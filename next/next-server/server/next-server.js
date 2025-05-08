const compression = require('compression');
const fs = require('fs');
const { join, resolve, sep } = require('path');
const { parse: parseQs } = require('querystring');
const { parse: parseUrl } = require('url');
const { withCoalescedInvoke } = require('../../lib/coalesced-function');
const {
  BUILD_ID_FILE,
  CLIENT_PUBLIC_FILES_PATH,
  CLIENT_STATIC_FILES_PATH,
  CLIENT_STATIC_FILES_RUNTIME,
  PAGES_MANIFEST,
  PHASE_PRODUCTION_SERVER,
  SERVER_DIRECTORY,
} = require('../lib/constants');
const {
  getRouteMatcher,
  getRouteRegex,
  getSortedRoutes,
  isDynamicRoute,
} = require('../lib/router/utils');
const envConfig = require('../lib/runtime-config');
const { isResSent } = require('../lib/utils');
const { apiResolver } = require('./api-utils');
const loadConfig = require('./config');
const { recursiveReadDirSync } = require('./lib/recursive-readdir-sync');
const { loadComponents } = require('./load-components');
const { renderToHTML } = require('./render');
const { getPagePath } = require('./require');
const Router = require('./router');
const { sendHTML } = require('./send-html');
const { serveStatic } = require('./serve-static');
const { isBlockedPage, isInternalUrl } = require('./utils');
 
 

// 创建服务器类，处理 Next.js 服务端逻辑
function Server({
  dir = '.',
  staticMarkup = false,
  quiet = false,
  conf = null,
  dev = false,
} = {}) {
  this.dir = resolve(dir); // 项目目录
  this.quiet = quiet; // 是否静默模式
  const phase = this.currentPhase(); // 当前阶段
  this.nextConfig = loadConfig(phase, this.dir, conf); // 加载 Next.js 配置
  this.distDir = join(this.dir, this.nextConfig.distDir); // 构建输出目录
  this.publicDir = join(this.dir, CLIENT_PUBLIC_FILES_PATH); // public 目录
  this.pagesManifest = join(this.distDir, SERVER_DIRECTORY, PAGES_MANIFEST); // 页面清单路径

  const {
    serverRuntimeConfig = {},
    publicRuntimeConfig,
    assetPrefix,
    generateEtags,
    compress,
  } = this.nextConfig;

  this.buildId = this.readBuildId(); // 读取构建 ID

  this.renderOpts = {
    poweredByHeader: this.nextConfig.poweredByHeader,
    staticMarkup,
    buildId: this.buildId,
    generateEtags,
  };

  if (Object.keys(publicRuntimeConfig).length > 0) {
    this.renderOpts.runtimeConfig = publicRuntimeConfig; // 设置客户端运行时配置
  }

  if (compress) {
    this.compression = compression(); // 启用压缩中间件
  }

  envConfig.setConfig({
    serverRuntimeConfig,
    publicRuntimeConfig,
  });

  const routes = this.generateRoutes(); // 生成路由规则
  this.router = new Router(routes); // 初始化路由器
  this.setAssetPrefix(assetPrefix); // 设置资源前缀

 
}

// 获取当前阶段
Server.prototype.currentPhase = function () {
  return PHASE_PRODUCTION_SERVER;
};

// 记录错误日志
Server.prototype.logError = function (...args) {
  if (this.quiet) return;
  console.error(...args);
};

// 处理 HTTP 请求
Server.prototype.handleRequest = function (req, res, parsedUrl) {
  if (!parsedUrl || typeof parsedUrl !== 'object') {
    parsedUrl = parseUrl(req.url, true);
  }

  if (typeof parsedUrl.query === 'string') {
    parsedUrl.query = parseQs(parsedUrl.query); // 解析查询字符串
  }

  res.statusCode = 200;
  return this.run(req, res, parsedUrl).catch(err => {
    this.logError(err);
    res.statusCode = 500;
    res.end('Internal Server Error');
  });
};

// 获取请求处理函数
Server.prototype.getRequestHandler = function () {
  return this.handleRequest.bind(this);
};

// 设置资源前缀
Server.prototype.setAssetPrefix = function (prefix) {
  this.renderOpts.assetPrefix = prefix ? prefix.replace(/\/$/, '') : '';
};

// 占位方法，保持兼容性
Server.prototype.prepare = async function () {};

// 占位方法，保持兼容性
Server.prototype.close = async function () {};

// 设置不可变资源的缓存控制
Server.prototype.setImmutableAssetCacheControl = function (res) {
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
};

// 生成路由规则
Server.prototype.generateRoutes = function () {
  const publicRoutes = fs.existsSync(this.publicDir) ? this.generatePublicRoutes() : [];
  const routes = [
    {
      match: Router.route('/_next/static/:path*'),
      fn: async (req, res, params, parsedUrl) => {
        if (!params.path) return this.render404(req, res, parsedUrl); // 404 处理
        if (
          params.path[0] === CLIENT_STATIC_FILES_RUNTIME ||
          params.path[0] === 'chunks' ||
          params.path[0] === this.buildId
        ) {
          this.setImmutableAssetCacheControl(res); // 设置缓存
        }
        const p = join(this.distDir, CLIENT_STATIC_FILES_PATH, ...(params.path || []));
        await this.serveStatic(req, res, p, parsedUrl); // 提供静态文件
      },
    },
    {
      match: Router.route('/_next/data/:path*'),
      fn: async (req, res, params, parsedUrl) => {
        if (!params.path) return this.render404(req, res, parsedUrl);
        const pathname = `/${params.path.join('/')}`.replace(/\.json$/, '');
        req.url = pathname;
        parsedUrl = parseUrl(pathname, true);
        await this.render(req, res, pathname, {  }, parsedUrl); // 渲染数据请求
      },
    },
    {
      match: Router.route('/_next/:path*'),
      fn: async (req, res, _params, parsedUrl) => {
        await this.render404(req, res, parsedUrl); // 404 处理
      },
    },
    ...publicRoutes,
    {
      match: Router.route('/static/:path*'),
      fn: async (req, res, params, parsedUrl) => {
        const p = join(this.dir, 'static', ...(params.path || []));
        await this.serveStatic(req, res, p, parsedUrl); // 提供静态文件
      },
    },
    {
      match: Router.route('/api/:path*'),
      fn: async (req, res, params, parsedUrl) => {
        const { pathname } = parsedUrl;
        await this.handleApiRequest(req, res, pathname); // 处理 API 请求
      },
    },
  ];

  if (this.nextConfig.useFileSystemPublicRoutes) {
    this.dynamicRoutes = this.getDynamicRoutes();
    routes.push({
      match: Router.route('/:path*'),
      fn: async (req, res, _params, parsedUrl) => {
        const { pathname, query } = parsedUrl;
        if (!pathname) {
          throw new Error('pathname is undefined');
        }
        await this.render(req, res, pathname, query, parsedUrl); // 渲染页面
      },
    });
  }

  return routes;
};

// 处理 API 请求
Server.prototype.handleApiRequest = async function (req, res, pathname) {
  let params = false;
  let resolverFunction;

  try {
    resolverFunction = await this.resolveApiRequest(pathname);
  } catch (err) {}

  if (this.dynamicRoutes && this.dynamicRoutes.length > 0 && !resolverFunction) {
    for (const dynamicRoute of this.dynamicRoutes) {
      params = dynamicRoute.match(pathname);
      if (params) {
        resolverFunction = await this.resolveApiRequest(dynamicRoute.page);
        break;
      }
    }
  }

  if (!resolverFunction) {
    return this.render404(req, res);
  }

  await apiResolver(req, res, params, resolverFunction ? require(resolverFunction) : undefined);
};

// 解析 API 请求路径
Server.prototype.resolveApiRequest = async function (pathname) {
  return getPagePath(pathname, this.distDir, this.renderOpts.dev);
};

// 生成 public 目录的路由
Server.prototype.generatePublicRoutes = function () {
  const routes = [];
  const publicFiles = recursiveReadDirSync(this.publicDir);
  const serverBuildPath = join(this.distDir, SERVER_DIRECTORY);
  const pagesManifest = require(join(serverBuildPath, PAGES_MANIFEST));

  publicFiles.forEach(path => {
    const unixPath = path.replace(/\\/g, '/');
    if (!pagesManifest[unixPath]) {
      routes.push({
        match: Router.route(unixPath),
        fn: async (req, res, _params, parsedUrl) => {
          const p = join(this.publicDir, unixPath);
          await this.serveStatic(req, res, p, parsedUrl); // 提供 public 文件
        },
      });
    }
  });

  return routes;
};

// 获取动态路由
Server.prototype.getDynamicRoutes = function () {
  const manifest = require(this.pagesManifest);
  const dynamicRoutedPages = Object.keys(manifest).filter(isDynamicRoute);
  return getSortedRoutes(dynamicRoutedPages).map(page => ({
    page,
    match: getRouteMatcher(getRouteRegex(page)),
  }));
};

// 应用压缩中间件
Server.prototype.handleCompression = function (req, res) {
  if (this.compression) {
    this.compression(req, res, () => {});
  }
};

// 运行路由匹配和处理
Server.prototype.run = async function (req, res, parsedUrl) {
  this.handleCompression(req, res);

  try {
    const fn = this.router.match(req, res, parsedUrl);
    if (fn) {
      await fn();
      return;
    }
  } catch (err) {
    if (err.code === 'DECODE_FAILED') {
      res.statusCode = 400;
      return this.renderError(null, req, res, '/_error', {});
    }
    throw err;
  }

  await this.render404(req, res, parsedUrl);
};

// 发送 HTML 响应
Server.prototype.sendHTML = async function (req, res, html) {
  const { generateEtags, poweredByHeader } = this.renderOpts;
  return sendHTML(req, res, html, { generateEtags, poweredByHeader });
};

// 渲染页面
Server.prototype.render = async function (req, res, pathname, query = {}, parsedUrl) {
  if (isInternalUrl(req.url)) {
    return this.handleRequest(req, res, parsedUrl);
  }

  if (isBlockedPage(pathname)) {
    return this.render404(req, res, parsedUrl);
  }

  const html = await this.renderToHTML(req, res, pathname, query);
  if (html === null) {
    return;
  }

  return this.sendHTML(req, res, html);
};

// 查找页面组件
Server.prototype.findPageComponents = async function (pathname, query = {}) {
  return await loadComponents(this.distDir, this.buildId, pathname);
};

// 发送响应数据
Server.prototype.__sendPayload = function (res, payload, type, revalidate) {
  res.setHeader('Content-Type', type);
  res.setHeader('Content-Length', Buffer.byteLength(payload));
  if (revalidate) {
    res.setHeader('Cache-Control', `s-maxage=${revalidate}, stale-while-revalidate`);
  }
  res.end(payload);
};

// 使用组件渲染 HTML
Server.prototype.renderToHTMLWithComponents = async function (
  req,
  res,
  pathname,
  query = {},
  result,
  opts
) {
  if (typeof result.Component === 'string') {
    return result.Component;
  }
  return renderToHTML(req, res, pathname, query, { ...result, ...opts });
};



// 渲染页面到 HTML
Server.prototype.renderToHTML = async function (req, res, pathname, query = {}) {
  return this.findPageComponents(pathname, query)
    .then(result => {
      return this.renderToHTMLWithComponents(req, res, pathname, query, result, this.renderOpts);
    })
    .catch(err => {
      if (err.code !== 'ENOENT' || !this.dynamicRoutes) {
        throw err;
      }
      for (const dynamicRoute of this.dynamicRoutes) {
        const params = dynamicRoute.match(pathname);
        if (!params) {
          continue;
        }
        return this.findPageComponents(dynamicRoute.page, query).then(result => {
          return this.renderToHTMLWithComponents(
            req,
            res,
            dynamicRoute.page,
            { ...query, ...params },
            result,
            this.renderOpts
          );
        });
      }
      throw err;
    })
    .catch(err => {
      if (err && err.code === 'ENOENT') {
        res.statusCode = 404;
        return this.renderErrorToHTML(null, req, res, pathname, query);
      } else {
        this.logError(err);
        res.statusCode = 500;
        return this.renderErrorToHTML(err, req, res, pathname, query);
      }
    });
};

// 渲染错误页面
Server.prototype.renderError = async function (err, req, res, pathname, query = {}) {
  res.setHeader('Cache-Control', 'no-cache, no-store, max-age=0, must-revalidate');
  const html = await this.renderErrorToHTML(err, req, res, pathname, query);
  if (html === null) {
    return;
  }
  return this.sendHTML(req, res, html);
};

// 渲染错误页面到 HTML
Server.prototype.renderErrorToHTML = async function (err, req, res, pathname, query = {}) {
  const result = await this.findPageComponents('/_error', query);
  let html;
  try {
    html = await this.renderToHTMLWithComponents(req, res, '/_error', query, result, { ...this.renderOpts, err });
  } catch (err) {
    console.error(err);
    res.statusCode = 500;
    html = 'Internal Server Error';
  }
  return html;
};

// 渲染 404 页面
Server.prototype.render404 = async function (req, res, parsedUrl) {
  const { pathname, query } = parsedUrl || parseUrl(req.url, true);
  if (!pathname) {
    throw new Error('pathname is undefined');
  }
  res.statusCode = 404;
  return this.renderError(null, req, res, pathname, query);
};

// 提供静态文件
Server.prototype.serveStatic = async function (req, res, path, parsedUrl) {
  if (!this.isServeableUrl(path)) {
    return this.render404(req, res, parsedUrl);
  }

  if (!(req.method === 'GET' || req.method === 'HEAD')) {
    res.statusCode = 405;
    res.setHeader('Allow', ['GET', 'HEAD']);
    return this.renderError(null, req, res, path);
  }

  try {
    await serveStatic(req, res, path);
  } catch (err) {
    if (err.code === 'ENOENT' || err.statusCode === 404) {
      this.render404(req, res, parsedUrl);
    } else if (err.statusCode === 412) {
      res.statusCode = 412;
      return this.renderError(err, req, res, path);
    } else {
      throw err;
    }
  }
};

// 检查路径是否可服务
Server.prototype.isServeableUrl = function (path) {
  const resolved = resolve(path);
  if (
    resolved.indexOf(join(this.distDir) + sep) !== 0 &&
    resolved.indexOf(join(this.dir, 'static') + sep) !== 0 &&
    resolved.indexOf(join(this.dir, 'public') + sep) !== 0
  ) {
    return false;
  }
  return true;
};

// 读取构建 ID
Server.prototype.readBuildId = function () {
  const buildIdFile = join(this.distDir, BUILD_ID_FILE);
  try {
    return fs.readFileSync(buildIdFile, 'utf8').trim();
  } catch (err) {
    if (!fs.existsSync(buildIdFile)) {
      throw new Error(
        `Could not find a valid build in the '${this.distDir}' directory! Try building your app with 'next build' before starting the server.`
      );
    }
    throw err;
  }
};

module.exports = Server;



/*
保留核心功能：
功能概述：
Server 类实现 Next.js 服务端逻辑，包括：
初始化配置（next.config.js, 构建 ID）。

处理 HTTP 请求（静态文件、API、页面渲染）。

支持动态路由 ）。

提供 404 和错误页面。

支持 next dev 和生产模式（target: 'server'）。

保留逻辑：
路由生成（generateRoutes, generatePublicRoutes）。

页面渲染（renderToHTML, renderToHTMLWithComponents）。

API 处理（handleApiRequest）。

 

静态文件服务（serveStatic）。

/***** */









