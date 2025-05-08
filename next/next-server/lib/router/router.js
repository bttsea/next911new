/* global __NEXT_DATA__ */
const { parse, format } = require('url');
const mitt = require('../mitt');
const {
  formatWithValidation,
  getURL,
  loadGetInitialProps,
  SUPPORTS_PERFORMANCE_USER_TIMING,
} = require('../utils');
const { rewriteUrlForNextExport } = require('./rewrite-url-for-export');
const { getRouteMatcher } = require('./utils/route-matcher');
const { getRouteRegex } = require('./utils/route-regex');
const { isDynamicRoute } = require('./utils/is-dynamic');

// 转换路径为路由格式
function toRoute(path) {
  return path.replace(/\/$/, '') || '/';
}

// Router 类：管理客户端路由
class Router {
  constructor(pathname, query, as, { initialProps, pageLoader, App, wrapApp, Component, err, subscription }) {
    // 当前路由
    this.route = toRoute(pathname);
    // 组件缓存
    this.components = {};
    if (pathname !== '/_error') {
      this.components[this.route] = { Component, props: initialProps, err };
    }
    this.components['/_app'] = { Component: App };

    // 事件发射器
    this.events = Router.events;
    this.pageLoader = pageLoader;
    this.pathname = pathname;
    this.query = query;
    this.asPath = isDynamicRoute(pathname) ? pathname : as;
    this.sub = subscription;
    this.clc = null;
    this._wrapApp = wrapApp;

    // 浏览器环境初始化
    if (typeof window !== 'undefined') {
      this.changeState('replaceState', formatWithValidation({ pathname, query }), as);
      window.addEventListener('popstate', this.onPopState.bind(this));
      window.addEventListener('unload', () => {
        if (history.state) {
          const { url, as, options } = history.state;
          this.changeState('replaceState', url, as, { ...options, fromExternal: true });
        }
      });
    }
  }

  // 静态事件发射器
  static events = mitt();

  // 处理 popstate 事件
  onPopState(e) {
    if (!e.state) {
      const { pathname, query } = this;
      this.changeState('replaceState', formatWithValidation({ pathname, query }), getURL());
      return;
    }

    if (e.state.options && e.state.options.fromExternal) {
      return;
    }

    if (this._bps && !this._bps(e.state)) {
      return;
    }

    const { url, as, options } = e.state;
    if (process.env.NODE_ENV !== 'production' && (typeof url === 'undefined' || typeof as === 'undefined')) {
      console.warn('`popstate` event triggered but `event.state` did not have `url` or `as`');
    }
    this.replace(url, as, options);
  }

  // 更新路由组件
  update(route, mod) {
    const Component = mod.default || mod;
    const data = this.components[route];
    if (!data) {
      throw new Error(`Cannot update unavailable route: ${route}`);
    }

    const newData = { ...data, Component };
    this.components[route] = newData;

    if (route === '/_app') {
      this.notify(this.components[this.route]);
      return;
    }

    if (route === this.route) {
      this.notify(newData);
    }
  }

  // 重新加载页面
  reload() {
    window.location.reload();
  }

  // 返回上一页
  back() {
    window.history.back();
  }

  // 推送新路由
  push(url, as = url, options = {}) {
    return this.change('pushState', url, as, options);
  }

  // 替换当前路由
  replace(url, as = url, options = {}) {
    return this.change('replaceState', url, as, options);
  }

  // 执行路由变更
  change(method, _url, _as, options) {
    return new Promise((resolve, reject) => {
      if (SUPPORTS_PERFORMANCE_USER_TIMING) {
        performance.mark('routeChange');
      }

      const url = typeof _url === 'object' ? formatWithValidation(_url) : _url;
      let as = typeof _as === 'object' ? formatWithValidation(_as) : _as;

      this.abortComponentLoad(as);

      if (!options._h && this.onlyAHashChange(as)) {
        this.asPath = as;
        Router.events.emit('hashChangeStart', as);
        this.changeState(method, url, as);
        this.scrollToHash(as);
        Router.events.emit('hashChangeComplete', as);
        return resolve(true);
      }

      const { pathname, query, protocol } = parse(url, true);
      if (!pathname || protocol) {
        if (process.env.NODE_ENV !== 'production') {
          throw new Error(`Invalid href passed to router: ${url}`);
        }
        return resolve(false);
      }

      if (!this.urlIsNew(as)) {
        method = 'replaceState';
      }

      const route = toRoute(pathname);
      const { shallow = false } = options;

      if (isDynamicRoute(route)) {
        const { pathname: asPathname } = parse(as);
        const rr = getRouteRegex(route);
        const routeMatch = getRouteMatcher(rr)(asPathname);
        if (!routeMatch) {
          console.error('The provided `as` value is incompatible with the `href` value.');
          return resolve(false);
        }
        Object.assign(query, routeMatch);
      }

      Router.events.emit('routeChangeStart', as);

      this.getRouteInfo(route, pathname, query, as, shallow).then(
        routeInfo => {
          const { error } = routeInfo;

          if (error && error.cancelled) {
            return resolve(false);
          }

          Router.events.emit('beforeHistoryChange', as);
          this.changeState(method, url, as, options);

          if (process.env.NODE_ENV !== 'production') {
            const appComp = this.components['/_app'].Component;
            window.next.isPrerendered =
              appComp.getInitialProps === appComp.origGetInitialProps &&
              !routeInfo.Component.getInitialProps;
          }

          this.set(route, pathname, query, as, routeInfo);

          if (error) {
            Router.events.emit('routeChangeError', error, as);
            throw error;
          }

          Router.events.emit('routeChangeComplete', as);
          resolve(true);
        },
        reject
      );
    });
  }

  // 更新历史状态
  changeState(method, url, as, options = {}) {
    if (process.env.NODE_ENV !== 'production') {
      if (typeof window.history === 'undefined') {
        console.error('Warning: window.history is not available.');
        return;
      }
      if (typeof window.history[method] === 'undefined') {
        console.error(`Warning: window.history.${method} is not available`);
        return;
      }
    }

    if (method !== 'pushState' || getURL() !== as) {
      window.history[method]({ url, as, options }, null, as);
    }
  }

  // 获取路由信息
  getRouteInfo(route, pathname, query, as, shallow = false) {
    const cachedRouteInfo = this.components[route];

    if (shallow && cachedRouteInfo && this.route === route) {
      return Promise.resolve(cachedRouteInfo);
    }

    return new Promise((resolve, reject) => {
      if (cachedRouteInfo) {
        return resolve(cachedRouteInfo);
      }
      this.fetchComponent(route).then(Component => resolve({ Component }), reject);
    })
      .then(routeInfo => {
        const { Component } = routeInfo;

        if (process.env.NODE_ENV !== 'production') {
          const { isValidElementType } = require('react-is');
          if (!isValidElementType(Component)) {
            throw new Error(`The default export is not a React Component in page: "${pathname}"`);
          }
        }

        return new Promise((resolve, reject) => {
          this.getInitialProps(Component, { pathname, query, asPath: as }).then(
            props => {
              routeInfo.props = props;
              this.components[route] = routeInfo;
              resolve(routeInfo);
            },
            reject
          );
        });
      })
      .catch(err => {
        return new Promise(resolve => {
          if (err.code === 'PAGE_LOAD_ERROR') {
            window.location.href = as;
            err.cancelled = true;
            return resolve({ error: err });
          }

          if (err.cancelled) {
            return resolve({ error: err });
          }

          resolve(
            this.fetchComponent('/_error').then(Component => {
              const routeInfo = { Component, err };
              return new Promise(resolve => {
                this.getInitialProps(Component, { err, pathname, query }).then(
                  props => {
                    routeInfo.props = props;
                    routeInfo.error = err;
                    resolve(routeInfo);
                  },
                  gipErr => {
                    console.error('Error in error page `getInitialProps`: ', gipErr);
                    routeInfo.error = err;
                    routeInfo.props = {};
                    resolve(routeInfo);
                  }
                );
              });
            })
          );
        });
      });
  }

  // 设置路由状态
  set(route, pathname, query, as, data) {
    this.route = route;
    this.pathname = pathname;
    this.query = query;
    this.asPath = as;
    this.notify(data);
  }

  // 设置 popstate 回调
  beforePopState(cb) {
    this._bps = cb;
  }

  // 检查是否仅为 hash 变更
  onlyAHashChange(as) {
    if (!this.asPath) return false;
    const [oldUrlNoHash, oldHash] = this.asPath.split('#');
    const [newUrlNoHash, newHash] = as.split('#');

    if (newHash && oldUrlNoHash === newUrlNoHash && oldHash === newHash) {
      return true;
    }

    if (oldUrlNoHash !== newUrlNoHash) {
      return false;
    }

    return oldHash !== newHash;
  }

  // 滚动到指定 hash
  scrollToHash(as) {
    const [, hash] = as.split('#');
    if (hash === '') {
      window.scrollTo(0, 0);
      return;
    }

    const idEl = document.getElementById(hash);
    if (idEl) {
      idEl.scrollIntoView();
      return;
    }

    const nameEl = document.getElementsByName(hash)[0];
    if (nameEl) {
      nameEl.scrollIntoView();
    }
  }

  // 检查是否为新 URL
  urlIsNew(asPath) {
    return this.asPath !== asPath;
  }

  // 预加载页面
  prefetch(url) {
    return new Promise((resolve, reject) => {
      const { pathname, protocol } = parse(url);
      if (!pathname || protocol) {
        if (process.env.NODE_ENV !== 'production') {
          throw new Error(`Invalid href passed to router: ${url}`);
        }
        return;
      }
      if (process.env.NODE_ENV !== 'production') return;
      const route = toRoute(pathname);
      this.pageLoader.prefetch(route).then(resolve, reject);
    });
  }

  // 加载组件
  async fetchComponent(route) {
    let cancelled = false;
    const cancel = (this.clc = () => {
      cancelled = true;
    });

    const Component = await this.pageLoader.loadPage(route);

    if (cancelled) {
      const error = new Error(`Abort fetching component for route: "${route}"`);
      error.cancelled = true;
      throw error;
    }

    if (cancel === this.clc) {
      this.clc = null;
    }

    return Component;
  }

  // 获取初始 props
  async getInitialProps(Component, ctx) {
    let cancelled = false;
    const cancel = () => {
      cancelled = true;
    };
    this.clc = cancel;

    const { Component: App } = this.components['/_app'];
    const AppTree = this._wrapApp(App);
    ctx.AppTree = AppTree;

    const props = await loadGetInitialProps(App, {
      AppTree,
      Component,
      router: this,
      ctx,
    });

    if (cancel === this.clc) {
      this.clc = null;
    }

    if (cancelled) {
      const err = new Error('Loading initial props cancelled');
      err.cancelled = true;
      throw err;
    }

    return props;
  }

  // 取消组件加载
  abortComponentLoad(as) {
    if (this.clc) {
      const e = new Error('Route Cancelled');
      e.cancelled = true;
      Router.events.emit('routeChangeError', e, as);
      this.clc();
      this.clc = null;
    }
  }

  // 通知路由变更
  notify(data) {
    this.sub(data, this.components['/_app'].Component);
  }
}

module.exports = Router;


/*
保留的核心功能：
路由导航（push, replace, back, reload）。

组件加载（fetchComponent）。
初始 props 获取（getInitialProps）。
动态路由和 hash 变更处理。
事件发射（routeChangeStart, routeChangeComplete, routeChangeError）。

功能：
原 Router 类管理客户端路由，支持页面导航、组件加载、初始 props 获取。
 保留核心路由功能。

项目关联：
与 webpack-config.js 的 next-client-pages-loader 配合，加载页面组件。
与 next-page-config.js 配合，处理客户端 bundle 丢弃。
与 entries.js 的 createEntrypoints 配合，确保客户端入口正确。
与 pages-manifest-plugin.js 和 build-manifest-plugin.js 配合，生成页面清单。
支持 next export 的静态 HTML 生成。
支持 Express 服务器的 SSR（通过 render.js 和 load-components.js）。



/***** */