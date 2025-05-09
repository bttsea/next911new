const compression = require('compression');
const fs = require('fs');
const { join, resolve, sep } = require('path');
const { parse: parseQs } = require('querystring');
const { parse: parseUrl } = require('url');
const { BUILD_ID_FILE, CLIENT_PUBLIC_FILES_PATH, CLIENT_STATIC_FILES_PATH, CLIENT_STATIC_FILES_RUNTIME, PAGES_MANIFEST, PHASE_PRODUCTION_SERVER, SERVER_DIRECTORY } = require('../lib/constants');
const { getRouteMatcher, getRouteRegex, getSortedRoutes, isDynamicRoute } = require('../lib/router/utils');
const envConfig = require('../lib/runtime-config');
const { isResSent } = require('../lib/utils');
const { apiResolver } = require('./api-utils');
const loadConfig = require('./config');
const { recursiveReadDirSync } = require('./lib/recursive-readdir-sync');
const { loadComponents } = require('./load-components');
const { renderToHTML } = require('./render');
const { getPagePath } = require('./require');
const { Router, route } = require('./router'); // 更新导入
const { sendHTML } = require('./send-html');
const { serveStatic } = require('./serve-static');
const { isBlockedPage, isInternalUrl } = require('./utils');
const { findPagesDir } = require('../../lib/find-pages-dir');

// 定义服务器类
class Server {
  constructor({ dir = '.', staticMarkup = false, quiet = false, conf = null, dev = false } = {}) {
    // 初始化基本路径和配置
    this.dir = resolve(dir);
    this.quiet = quiet;
    this.nextConfig = loadConfig(PHASE_PRODUCTION_SERVER, this.dir, conf);
    this.distDir = join(this.dir, this.nextConfig.distDir);
    this.publicDir = join(this.dir, CLIENT_PUBLIC_FILES_PATH);
    this.pagesManifest = join(this.distDir, SERVER_DIRECTORY, PAGES_MANIFEST);

    // 读取构建ID
    this.buildId = this.readBuildId();

    // 设置渲染选项
    const { serverRuntimeConfig = {}, publicRuntimeConfig, assetPrefix, generateEtags, compress } = this.nextConfig;
    this.renderOpts = {
      poweredByHeader: this.nextConfig.poweredByHeader,
      staticMarkup,
      buildId: this.buildId,
      generateEtags
    };

    // 如果有公共运行时配置，添加到渲染选项
    if (Object.keys(publicRuntimeConfig).length > 0) {
      this.renderOpts.runtimeConfig = publicRuntimeConfig;
    }

    // 如果启用压缩，初始化压缩中间件
    if (compress) {
      this.compression = compression();
    }

    // 初始化环境配置
    envConfig.setConfig({
      serverRuntimeConfig,
      publicRuntimeConfig
    });

    // 生成路由并初始化路由器
    const routes = this.generateRoutes();
    this.router = new Router(routes);
    this.setAssetPrefix(assetPrefix);
  }

  // 获取当前阶段（生产服务器）
  currentPhase() {
    return PHASE_PRODUCTION_SERVER;
  }

  // 记录错误日志（如果未静音）
  logError(...args) {
    if (this.quiet) return;
    console.error(...args);
  }

  // 处理 HTTP 请求
  async handleRequest(req, res, parsedUrl) {
    if (!parsedUrl || typeof parsedUrl !== 'object') {
      parsedUrl = parseUrl(req.url, true);
    }

    // 解析查询字符串
    if (typeof parsedUrl.query === 'string') {
      parsedUrl.query = parseQs(parsedUrl.query);
    }

    res.statusCode = 200;
    try {
      await this.run(req, res, parsedUrl);
    } catch (err) {
      this.logError(err);
      res.statusCode = 500;
      res.end('Internal Server Error');
    }
  }

  // 获取请求处理函数
  getRequestHandler() {
    return this.handleRequest.bind(this);
  }

  // 设置资源前缀
  setAssetPrefix(prefix) {
    this.renderOpts.assetPrefix = prefix ? prefix.replace(/\/$/, '') : '';
  }

  // 兼容旧版本的准备方法
  async prepare() {}

  // 兼容旧版本的关闭方法
  async close() {}

  // 设置不可变资源的缓存控制头
  setImmutableAssetCacheControl(res) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  }

  // 生成路由
  generateRoutes() {
    const publicRoutes = fs.existsSync(this.publicDir) ? this.generatePublicRoutes() : [];
    const routes = [
      {
        match: route('/_next/static/:path*'),
        fn: async (req, res, params, parsedUrl) => {
          if (!params.path) return this.render404(req, res, parsedUrl);
          if (
            params.path[0] === CLIENT_STATIC_FILES_RUNTIME ||
            params.path[0] === 'chunks' ||
            params.path[0] === this.buildId
          ) {
            this.setImmutableAssetCacheControl(res);
          }
          const p = join(this.distDir, CLIENT_STATIC_FILES_PATH, ...(params.path || []));
          await this.serveStatic(req, res, p, parsedUrl);
        }
      },
      {
        match: route('/_next/:path*'),
        fn: async (req, res, _params, parsedUrl) => {
          await this.render404(req, res, parsedUrl);
        }
      },
      ...publicRoutes,
      {
        match: route('/static/:path*'),
        fn: async (req, res, params, parsedUrl) => {
          const p = join(this.dir, 'static', ...(params.path || []));
          await this.serveStatic(req, res, p, parsedUrl);
        }
      },
      {
     
        match: route('/api/:path*'),
        fn: async (req, res, params, parsedUrl) => {
          const { pathname } = parsedUrl;
          await this.handleApiRequest(req, res, pathname);
        }
      }
    ];

    if (this.nextConfig.useFileSystemPublicRoutes) {
      this.dynamicRoutes = this.getDynamicRoutes();
      routes.push({
        match: route('/:path*'),
        fn: async (req, res, _params, parsedUrl) => {
          const { pathname, query } = parsedUrl;
          if (!pathname) {
            throw new Error('pathname is undefined');
          }
          await this.render(req, res, pathname, query, parsedUrl);
        }
      });
    }

    return routes;
  }

  // 处理 API 请求
  async handleApiRequest(req, res, pathname) {
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
  }

  // 解析 API 请求路径
  async resolveApiRequest(pathname) {
    return getPagePath(pathname, this.distDir, false, this.renderOpts.dev);
  }

  // 生成公共路由
  generatePublicRoutes() {
    const routes = [];
    const publicFiles = recursiveReadDirSync(this.publicDir);
    const serverBuildPath = join(this.distDir, SERVER_DIRECTORY);
    const pagesManifest = require(join(serverBuildPath, PAGES_MANIFEST));

    publicFiles.forEach(path => {
      const unixPath = path.replace(/\\/g, '/');
      if (!pagesManifest[unixPath]) {
        routes.push({
          match: route(unixPath),
          fn: async (req, res, _params, parsedUrl) => {
            const p = join(this.publicDir, unixPath);
            await this.serveStatic(req, res, p, parsedUrl);
          }
        });
      }
    });

    return routes;
  }

  // 获取动态路由
  getDynamicRoutes() {
    const manifest = require(this.pagesManifest);
    const dynamicRoutedPages = Object.keys(manifest).filter(isDynamicRoute);
    return getSortedRoutes(dynamicRoutedPages).map(page => ({
      page,
      match: getRouteMatcher(getRouteRegex(page))
    }));
  }

  // 处理压缩
  handleCompression(req, res) {
    if (this.compression) {
      this.compression(req, res, () => {});
    }
  }

  // 运行请求处理
  async run(req, res, parsedUrl) {
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
  }

  // 发送 HTML 响应
  async sendHTML(req, res, html) {
    const { generateEtags, poweredByHeader } = this.renderOpts;
    return sendHTML(req, res, html, { generateEtags, poweredByHeader });
  }

  // 渲染页面
  async render(req, res, pathname, query = {}, parsedUrl) {
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
  }

  // 查找页面组件
  async findPageComponents(pathname, query = {}) {
    return await loadComponents(this.distDir, this.buildId, pathname, false);
  }

  // 使用组件渲染 HTML
  async renderToHTMLWithComponents(req, res, pathname, query = {}, result, opts) {
    if (typeof result.Component === 'string') {
      return result.Component;
    }

    return renderToHTML(req, res, pathname, query, { ...result, ...opts });
  }

  // 渲染 HTML
  async renderToHTML(req, res, pathname, query = {}) {
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
  }

  // 渲染错误页面
  async renderError(err, req, res, pathname, query = {}) {
    res.setHeader('Cache-Control', 'no-cache, no-store, max-age=0, must-revalidate');
    const html = await this.renderErrorToHTML(err, req, res, pathname, query);
    if (html === null) {
      return;
    }
    return this.sendHTML(req, res, html);
  }

  // 渲染错误页面 HTML
  async renderErrorToHTML(err, req, res, _pathname, query = {}) {
    const result = await this.findPageComponents('/_error', query);
    let html;
    try {
      html = await this.renderToHTMLWithComponents(req, res, '/_error', query, result, {
        ...this.renderOpts,
        err
      });
    } catch (err) {
      console.error(err);
      res.statusCode = 500;
      html = 'Internal Server Error';
    }
    return html;
  }

  // 渲染 404 页面
  async render404(req, res, parsedUrl) {
    const { pathname, query } = parsedUrl || parseUrl(req.url, true);
    if (!pathname) {
      throw new Error('pathname is undefined');
    }
    res.statusCode = 404;
    return this.renderError(null, req, res, pathname, query);
  }

  // 提供静态文件
  async serveStatic(req, res, path, parsedUrl) {
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
    console.log('Server response:', res.statusCode);
  }

  // 检查路径是否可提供
  isServeableUrl(path) {
    const resolved = resolve(path);
    if (
      resolved.indexOf(join(this.distDir) + sep) !== 0 &&
      resolved.indexOf(join(this.dir, 'static') + sep) !== 0 &&
      resolved.indexOf(join(this.dir, 'public') + sep) !== 0
    ) {
      return false;
    }
    return true;
  }

  // 读取构建 ID
  readBuildId() {
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
  }
}

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









