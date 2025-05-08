const fs = require('fs');
const { join, normalize, relative: relativePath, sep } = require('path');
const { promisify } = require('util');
const webpack = require('webpack');
const WebpackDevMiddleware = require('webpack-dev-middleware');
const WebpackHotMiddleware = require('webpack-hot-middleware');
const { createEntrypoints, createPagesMapping } = require('../build/entries');
const { watchCompilers } = require('../build/output');
const getBaseWebpackConfig = require('../build/webpack-config');
const { BLOCKED_PAGES, IS_BUNDLED_PAGE_REGEX, ROUTE_NAME_REGEX } = require('../next-server/lib/constants');
const { route } = require('../next-server/server/router');
const errorOverlayMiddleware = require('./lib/error-overlay-middleware');
const { findPageFile } = require('./lib/find-page-file');
const onDemandEntryHandler = require('./on-demand-entry-handler');
const { recursiveDelete } = require('../lib/recursive-delete');

const access = promisify(fs.access);
const readFile = promisify(fs.readFile);

// 渲染脚本错误
async function renderScriptError(res, error) {
  res.setHeader('Cache-Control', 'no-cache, no-store, max-age=0, must-revalidate');
  if (error.code === 'ENOENT' || error.message === 'INVALID_BUILD_ID') {
    res.statusCode = 404;
    res.end('404 - Not Found');
    return;
  }
  console.error(error.stack);
  res.statusCode = 500;
  res.end('500 - Internal Error');
}

// 添加 CORS 支持
function addCorsSupport(req, res) {
  if (!req.headers.origin) {
    return { preflight: false };
  }
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, GET');
  if (req.headers['access-control-request-headers']) {
    res.setHeader('Access-Control-Allow-Headers', req.headers['access-control-request-headers']);
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return { preflight: true };
  }
  return { preflight: false };
}

// 匹配页面 bundle 请求
const matchNextPageBundleRequest = route('/_next/static/:buildId/pages/:path*.js(.map)?');

// 查找入口模块
function findEntryModule(issuer) {
  if (issuer.issuer) {
    return findEntryModule(issuer.issuer);
  }
  return issuer;
}

// 获取失败页面错误
function erroredPages(compilation, options = { enhanceName: name => name }) {
  const failedPages = {};
  for (const error of compilation.errors) {
    if (!error.origin) continue;
    const entryModule = findEntryModule(error.origin);
    const { name } = entryModule;
    if (!name || !IS_BUNDLED_PAGE_REGEX.test(name)) continue;
    const enhancedName = options.enhanceName(name);
    if (!failedPages[enhancedName]) {
      failedPages[enhancedName] = [];
    }
    failedPages[enhancedName].push(error);
  }
  return failedPages;
}

// HotReloader 类：管理开发模式的热重载
class HotReloader {
  constructor(dir, { config, pagesDir, buildId }) {
    this.buildId = buildId;
    this.dir = dir;
    this.middlewares = [];
    this.pagesDir = pagesDir;
    this.webpackDevMiddleware = null;
    this.webpackHotMiddleware = null;
    this.initialized = false;
    this.stats = null;
    this.serverPrevDocumentHash = null;
    this.config = config;
  }

  // 处理请求
  async run(req, res, parsedUrl) {
    const { preflight } = addCorsSupport(req, res);
    if (preflight) return;

    const handlePageBundleRequest = async (res, parsedUrl) => {
      const { pathname } = parsedUrl;
      const params = matchNextPageBundleRequest(pathname);
      if (!params) return {};

      if (params.buildId !== this.buildId) return {};

      const page = `/${params.path.join('/')}`;
      if (page === '/_error' || BLOCKED_PAGES.indexOf(page) !== -1) {
        try {
          await this.ensurePage(page);
        } catch (error) {
          await renderScriptError(res, error);
          return { finished: true };
        }

        const bundlePath = join(this.dir, this.config.distDir, 'static/development/pages', page + '.js');
        try {
          await access(bundlePath);
          const data = await readFile(bundlePath, 'utf8');
          if (data.includes('__NEXT_DROP_CLIENT_FILE__')) {
            res.statusCode = 404;
            res.end();
            return { finished: true };
          }
        } catch (_) {}

        const errors = await this.getCompilationErrors(page);
        if (errors.length > 0) {
          await renderScriptError(res, errors[0]);
          return { finished: true };
        }
      }
      return {};
    };

    const { finished } = await handlePageBundleRequest(res, parsedUrl);
    for (const fn of this.middlewares) {
      await new Promise((resolve, reject) => {
        fn(req, res, err => {
          if (err) return reject(err);
          resolve();
        });
      });
    }
    return { finished };
  }

  // 清理构建目录
  async clean() {
    return recursiveDelete(join(this.dir, this.config.distDir));
  }

  // 获取 Webpack 配置
  async getWebpackConfig() {
    const pagePaths = await Promise.all([
      findPageFile(this.pagesDir, '/_app', this.config.pageExtensions),
      findPageFile(this.pagesDir, '/_document', this.config.pageExtensions),
    ]);

    const pages = createPagesMapping(pagePaths.filter(i => i !== null), this.config.pageExtensions);
    const entrypoints = createEntrypoints(pages, 'server', this.buildId, this.config);

    return Promise.all([
      getBaseWebpackConfig(this.dir, {
        dev: true,
        isServer: false,
        config: this.config,
        buildId: this.buildId,
        pagesDir: this.pagesDir,
        entrypoints: entrypoints.client,
      }),
      getBaseWebpackConfig(this.dir, {
        dev: true,
        isServer: true,
        config: this.config,
        buildId: this.buildId,
        pagesDir: this.pagesDir,
        entrypoints: entrypoints.server,
      }),
    ]);
  }

  // 启动热重载
  async start() {
    await this.clean();
    const configs = await this.getWebpackConfig();
    const multiCompiler = webpack(configs);
    const buildTools = await this.prepareBuildTools(multiCompiler);
    this.assignBuildTools(buildTools);
    this.stats = (await this.waitUntilValid()).stats[0];
  }

  // 停止热重载
  async stop(webpackDevMiddleware) {
    const middleware = webpackDevMiddleware || this.webpackDevMiddleware;
    if (middleware) {
      return new Promise((resolve, reject) => {
        middleware.close(err => {
          if (err) return reject(err);
          resolve();
        });
      });
    }
  }

  // 重新加载
  async reload() {
    this.stats = null;
    await this.clean();
    const configs = await this.getWebpackConfig();
    const compiler = webpack(configs);
    const buildTools = await this.prepareBuildTools(compiler);
    this.stats = await this.waitUntilValid(buildTools.webpackDevMiddleware);
    const oldWebpackDevMiddleware = this.webpackDevMiddleware;
    this.assignBuildTools(buildTools);
    await this.stop(oldWebpackDevMiddleware);
  }

  // 分配构建工具
  assignBuildTools({ webpackDevMiddleware, webpackHotMiddleware, onDemandEntries }) {
    this.webpackDevMiddleware = webpackDevMiddleware;
    this.webpackHotMiddleware = webpackHotMiddleware;
    this.onDemandEntries = onDemandEntries;
    this.middlewares = [
      webpackDevMiddleware,
      onDemandEntries.middleware(),
      webpackHotMiddleware,
      errorOverlayMiddleware({ dir: this.dir }),
    ];
  }

  // 准备构建工具
  async prepareBuildTools(multiCompiler) {
    const tsConfigPath = join(this.dir, 'tsconfig.json');
    const useTypeScript = await fs.promises.access(tsConfigPath).then(() => true).catch(() => false);

    watchCompilers(multiCompiler.compilers[0], multiCompiler.compilers[1], useTypeScript, ({ errors, warnings }) =>
      this.send('typeChecked', { errors, warnings })
    );

    multiCompiler.compilers[1].hooks.done.tap('NextjsHotReloaderForServer', stats => {
      if (!this.initialized) return;
      const { compilation } = stats;
      const documentChunk = compilation.chunks.find(c => c.name === normalize(`static/${this.buildId}/pages/_document.js`));
      if (!documentChunk) {
        console.warn('_document.js chunk not found');
        return;
      }
      if (this.serverPrevDocumentHash === null) {
        this.serverPrevDocumentHash = documentChunk.hash;
        return;
      }
      if (documentChunk.hash === this.serverPrevDocumentHash) return;
      this.send('reloadPage');
      this.serverPrevDocumentHash = documentChunk.hash;
    });

    multiCompiler.compilers[0].hooks.done.tap('NextjsHotReloaderForClient', stats => {
      const { compilation } = stats;
      const chunkNames = new Set(
        compilation.chunks.map(c => c.name).filter(name => IS_BUNDLED_PAGE_REGEX.test(name))
      );

      if (this.initialized) {
        const addedPages = diff(chunkNames, this.prevChunkNames || new Set());
        const removedPages = diff(this.prevChunkNames || new Set(), chunkNames);
        if (addedPages.size > 0) {
          for (const addedPage of addedPages) {
            let page = '/' + ROUTE_NAME_REGEX.exec(addedPage)[1].replace(/\\/g, '/');
            page = page === '/index' ? '/' : page;
            this.send('addedPage', page);
          }
        }
        if (removedPages.size > 0) {
          for (const removedPage of removedPages) {
            let page = '/' + ROUTE_NAME_REGEX.exec(removedPage)[1].replace(/\\/g, '/');
            page = page === '/index' ? '/' : page;
            this.send('removedPage', page);
          }
        }
      }

      this.initialized = true;
      this.stats = stats;
      this.prevChunkNames = chunkNames;
    });

    const ignored = [/[\\/]\.git[\\/]/, /[\\/]\.next[\\/]/, /[\\/]node_modules[\\/]/];
    let webpackDevMiddlewareConfig = {
      publicPath: `/_next/static/webpack`,
      noInfo: true,
      logLevel: 'silent',
      watchOptions: { ignored },
      writeToDisk: true,
    };

    if (this.config.webpackDevMiddleware) {
      console.log(`> Using "webpackDevMiddleware" config function defined in ${this.config.configOrigin}.`);
      webpackDevMiddlewareConfig = this.config.webpackDevMiddleware(webpackDevMiddlewareConfig);
    }

    const webpackDevMiddleware = WebpackDevMiddleware(multiCompiler, webpackDevMiddlewareConfig);
    const webpackHotMiddleware = WebpackHotMiddleware(multiCompiler.compilers[0], {
      path: '/_next/webpack-hmr',
      log: false,
      heartbeat: 2500,
    });

    const onDemandEntries = onDemandEntryHandler(webpackDevMiddleware, multiCompiler, {
      dir: this.dir,
      buildId: this.buildId,
      pagesDir: this.pagesDir,
      distDir: this.config.distDir,
      reload: this.reload.bind(this),
      pageExtensions: this.config.pageExtensions,
      publicRuntimeConfig: this.config.publicRuntimeConfig,
      serverRuntimeConfig: this.config.serverRuntimeConfig,
      ...this.config.onDemandEntries,
    });

    return { webpackDevMiddleware, webpackHotMiddleware, onDemandEntries };
  }

  // 等待编译完成
  waitUntilValid(webpackDevMiddleware) {
    const middleware = webpackDevMiddleware || this.webpackDevMiddleware;
    return new Promise(resolve => {
      middleware.waitUntilValid(resolve);
    });
  }

  // 获取编译错误
  async getCompilationErrors(page) {
    const normalizedPage = normalizePage(page);
    await this.onDemandEntries.waitUntilReloaded();
    if (this.stats.hasErrors()) {
      const { compilation } = this.stats;
      const failedPages = erroredPages(compilation, {
        enhanceName(name) {
          return '/' + ROUTE_NAME_REGEX.exec(name)[1];
        },
      });
      if (failedPages[normalizedPage] && failedPages[normalizedPage].length > 0) {
        return failedPages[normalizedPage];
      }
      return this.stats.compilation.errors;
    }
    return [];
  }

  // 发送消息
  send(action, ...args) {
    this.webpackHotMiddleware.publish({ action, data: args });
  }

  // 确保页面编译
  async ensurePage(page) {
    if (page !== '/_error' && BLOCKED_PAGES.indexOf(page) !== -1) return;
    return this.onDemandEntries.ensurePage(page);
  }
}

// 计算集合差异
function diff(a, b) {
  return new Set([...a].filter(v => !b.has(v)));
}

module.exports = HotReloader;



/*
保留的核心功能：
热重载支持（Webpack Dev Middleware 和 Hot Middleware）。
按需编译页面（onDemandEntryHandler）。
错误处理（renderScriptError, erroredPages）。
页面 bundle 检查（__NEXT_DROP_CLIENT_FILE__）。
动态页面检测（addedPage, removedPage）。




项目关联：
与 webpack-config.js 的 getBaseWebpackConfig 配合，生成开发模式的 Webpack 配置。
与 next-page-config.js 配合，处理客户端 bundle 丢弃。
与 entries.js 的 createEntrypoints 配合，确保客户端和服务端入口正确。
与 router.js 配合，支持客户端路由的热重载。
支持 Express 服务器的开发模式（通过 render.js 和 load-components.js）。
支持 next export（通过 next build 生成的静态文件）。
/******* */

