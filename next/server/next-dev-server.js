import fs from 'fs';
import { IncomingMessage, ServerResponse } from 'http';
import { join, relative } from 'path';
import React from 'react';
import { UrlWithParsedQuery } from 'url';
import { promisify } from 'util';
import Watchpack from 'watchpack';
import * as Log from '../build/output/log';
import { PUBLIC_DIR_MIDDLEWARE_CONFLICT } from '../lib/constants';
import { findPagesDir } from '../lib/find-pages-dir';
import { verifyTypeScriptSetup } from '../lib/verifyTypeScriptSetup';
import { PHASE_DEVELOPMENT_SERVER } from '../next-server/lib/constants';
import {
  getRouteMatcher,
  getRouteRegex,
  getSortedRoutes,
  isDynamicRoute,
} from '../next-server/lib/router/utils';
import Server from '../next-server/server/next-server';
import { normalizePagePath } from '../next-server/server/normalize-page-path';
import { route } from '../next-server/server/router';
 
 
import ErrorDebug from './error-debug';
import HotReloader from './hot-reloader';
import { findPageFile } from './lib/find-page-file';

// 检查 React 版本是否满足 Next.js 要求
if (typeof React.Suspense === 'undefined') {
  throw new Error(
    `The version of React you are using is lower than the minimum required version needed for Next.js. Please upgrade "react" and "react-dom": "npm install --save react react-dom" https://err.sh/zeit/next.js/invalid-react-version`
  );
}

// 异步文件状态检查
const fsStat = promisify(fs.stat);

// 开发服务器类，继承自 Next.js 的 Server 类
export default class DevServer extends Server {
  // 构造函数，初始化开发服务器
  constructor(options) {
    super({ ...options, dev: true });
    this.renderOpts.dev = true;
    this.renderOpts.ErrorDebug = ErrorDebug; // 设置错误调试组件
    this.devReady = new Promise((resolve) => {
      this.setDevReady = resolve; // 用于标记开发服务器就绪
    });
    if (fs.existsSync(join(this.dir, 'static'))) {
      console.warn(
        `The static directory has been deprecated in favor of the public directory. https://err.sh/zeit/next.js/static-dir-deprecated`
      );
    }
    this.pagesDir = findPagesDir(this.dir); // 查找 pages 目录
  }

  // 返回当前阶段为开发服务器
  currentPhase() {
    return PHASE_DEVELOPMENT_SERVER;
  }

  // 开发模式下构建 ID 固定为 'development'
  readBuildId() {
    return 'development';
  }

 

  // 启动文件监听器，监控 pages 目录变化
  async startWatcher() {
    if (this.webpackWatcher) {
      return;
    }
    let resolved = false;
    return new Promise((resolve) => {
      const pagesDir = this.pagesDir;
      // 如果 pages 目录为空，直接触发 resolve
      fs.readdir(pagesDir, (_, files) => {
        if (files && files.length) {
          return;
        }
        if (!resolved) {
          resolve();
          resolved = true;
        }
      });
      let wp = (this.webpackWatcher = new Watchpack());
      wp.watch([], [pagesDir], 0);
      wp.on('aggregated', () => {
        const dynamicRoutedPages = [];
        const knownFiles = wp.getTimeInfoEntries();
        for (const [fileName, { accuracy }] of knownFiles) {
          if (accuracy === undefined) {
            continue;
          }
          let pageName =
            '/' + relative(pagesDir, fileName).replace(/\\+/g, '/');
          pageName = pageName.replace(
            new RegExp(`\\.+(?:${this.nextConfig.pageExtensions.join('|')})$`),
            ''
          );
          pageName = pageName.replace(/\/index$/, '') || '/';
          if (!isDynamicRoute(pageName)) {
            continue;
          }
          dynamicRoutedPages.push(pageName);
        }
        this.dynamicRoutes = getSortedRoutes(dynamicRoutedPages).map((page) => ({
          page,
          match: getRouteMatcher(getRouteRegex(page)),
        }));
        if (!resolved) {
          resolve();
          resolved = true;
        }
      });
    });
  }

  // 停止文件监听器
  async stopWatcher() {
    if (!this.webpackWatcher) {
      return;
    }
    this.webpackWatcher.close();
    this.webpackWatcher = null;
  }

  // 准备开发服务器，初始化热重载和路由
  async prepare() {
    await verifyTypeScriptSetup(this.dir, this.pagesDir); // 验证 TypeScript 配置
    this.hotReloader = new HotReloader(this.dir, {
      pagesDir: this.pagesDir,
      config: this.nextConfig,
      buildId: this.buildId,
    });
    await super.prepare();
  
    await this.hotReloader.start();
    await this.startWatcher();
    this.setDevReady(); // 标记开发服务器就绪
   
 
  }

  // 关闭开发服务器，清理资源
  async close() {
    await this.stopWatcher();
    if (this.hotReloader) {
      await this.hotReloader.stop();
    }
  }

  // 处理 HTTP 请求
  async run(req, res, parsedUrl) {
    await this.devReady; // 确保服务器已就绪
    const { pathname } = parsedUrl;
    if (pathname.startsWith('/_next')) {
      try {
        await fsStat(join(this.publicDir, '_next'));
        throw new Error(PUBLIC_DIR_MIDDLEWARE_CONFLICT);
      } catch (err) {}
    }
    // 检查是否存在公共文件，防止与页面冲突
    if (await this.hasPublicFile(pathname)) {
      const pageFile = await findPageFile(
        this.pagesDir,
        normalizePagePath(pathname),
        this.nextConfig.pageExtensions
      );
      if (pageFile) {
        const err = new Error(
          `A conflicting public file and page file was found for path ${pathname} https://err.sh/zeit/next.js/conflicting-public-file-page`
        );
        res.statusCode = 500;
        return this.renderError(err, req, res, pathname, {});
      }
      return this.servePublic(req, res, pathname);
    }
    // 运行热重载逻辑
    const { finished } =
      (await this.hotReloader.run(req, res, parsedUrl)) || {
        finished: false,
      };
    if (finished) {
      return;
    }
    return super.run(req, res, parsedUrl);
  }

  // 生成开发模式的路由
  generateRoutes() {
    const routes = super.generateRoutes();
    // 添加开发模式的特殊路由，用于 react-error-overlay
    routes.unshift({
      match: route('/_next/development/:path*'),
      fn: async (req, res, params) => {
        const p = join(this.distDir, ...(params.path || []));
        await this.serveStatic(req, res, p);
      },
    });
    return routes;
  }

  // 开发模式下不生成公共路由
  generatePublicRoutes() {
    return [];
  }

  // 开发模式下动态路由无法提前知道
  getDynamicRoutes() {
    return [];
  }

  // 解析 API 请求
  async resolveApiRequest(pathname) {
    try {
      await this.hotReloader.ensurePage(pathname);
    } catch (err) {
      if (err.code === 'ENOENT') {
        return null; // API 路由不存在，返回 404
      }
    }
    const resolvedPath = await super.resolveApiRequest(pathname);
    return resolvedPath;
  }

  // 渲染页面为 HTML
  async renderToHTML(req, res, pathname, query, options = {}) {
    const compilationErr = await this.getCompilationError(pathname);
    if (compilationErr) {
      res.statusCode = 500;
      return this.renderErrorToHTML(compilationErr, req, res, pathname, query);
    }
    // 按需编译页面
    try {
      await this.hotReloader.ensurePage(pathname).catch(async (err) => {
        if (err.code !== 'ENOENT') {
          throw err;
        }
        for (const dynamicRoute of this.dynamicRoutes || []) {
          const params = dynamicRoute.match(pathname);
          if (!params) {
            continue;
          }
          return this.hotReloader.ensurePage(dynamicRoute.page).then(() => {
            pathname = dynamicRoute.page;
            query = Object.assign({}, query, params);
          });
        }
        throw err;
      });
    } catch (err) {
      if (err.code === 'ENOENT') {
        res.statusCode = 404;
        return this.renderErrorToHTML(null, req, res, pathname, query);
      }
      if (!this.quiet) console.error(err);
    }
    const html = await super.renderToHTML(req, res, pathname, query, options);
    return html;
  }

  // 渲染错误页面为 HTML
  async renderErrorToHTML(err, req, res, pathname, query) {
    await this.hotReloader.ensurePage('/_error'); // 确保错误页面已编译
    const compilationErr = await this.getCompilationError(pathname);
    if (compilationErr) {
      res.statusCode = 500;
      return super.renderErrorToHTML(compilationErr, req, res, pathname, query);
    }
    if (!err && res.statusCode === 500) {
      err = new Error(
        'An undefined error was thrown sometime during render... ' +
          'See https://err.sh/zeit/next.js/threw-undefined'
      );
    }
    try {
      const out = await super.renderErrorToHTML(err, req, res, pathname, query);
      return out;
    } catch (err2) {
      if (!this.quiet) Log.error(err2);
      res.statusCode = 500;
      return super.renderErrorToHTML(err2, req, res, pathname, query);
    }
  }

  // 发送 HTML 响应，禁用缓存
  sendHTML(req, res, html) {
    res.setHeader('Cache-Control', 'no-store, must-revalidate');
    return super.sendHTML(req, res, html);
  }

  // 设置不可变资产的缓存控制，禁用缓存
  setImmutableAssetCacheControl(res) {
    res.setHeader('Cache-Control', 'no-store, must-revalidate');
  }

  // 提供公共文件服务
  servePublic(req, res, path) {
    const p = join(this.publicDir, path);
    return this.serveStatic(req, res, p);
  }

  // 检查是否存在公共文件
  async hasPublicFile(path) {
    try {
      const info = await fsStat(join(this.publicDir, path));
      return info.isFile();
    } catch (_) {
      return false;
    }
  }

  // 获取编译错误
  async getCompilationError(page) {
    const errors = await this.hotReloader.getCompilationErrors(page);
    if (errors.length === 0) return;
    return errors[0]; // 返回第一个错误
  }
}


/*
保留了开发服务器的核心功能，包括：
 
Next.js 内置开发服务器的功能
next-dev-server.js（即 DevServer 类）是 Next.js 9.1.1 在开发模式下的核心组件，主要功能包括：
热重载：通过 HotReloader 实现代码变更的实时更新。
文件监听：通过 Watchpack 监控 pages 目录，动态生成路由。
动态路由：处理动态路（dynamicRoutes）由（如 /post/[id].js）并匹配请求。
错误处理：使用 ErrorDebug 组件显示开发时的错误信息。
请求处理：处理页面渲染（renderToHTML）、公共文件服务（servePublic）和 API 请求（resolveApiRequest）。
服务端渲染：支持服务端渲染（SSR）和静态页面生成。
这些功能通过 DevServer 类的 run 方法处理 HTTP 请求，并与 Next.js 的路由系统（next-server/server/router）集成


增强 Next.js 服务器：
如果 Express 服务器通过 app.getRequestHandler() 将部分请求委托给 Next.js（例如 server.get('*', handle)），next-dev-server.js 的代码仍然部分或全部有用

/******** */
