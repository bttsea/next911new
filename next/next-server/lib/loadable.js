// loadable.js
/**
 * React Loadable 实现单模块动态加载
 * 支持按需加载、SSR 和 Webpack 4，优化 Next.js 性能
 * @copyright (c) 2017-present James Kyle <me@thejameskyle.com>
 * MIT License
 */
 const React = require('react');
 const { LoadableContext } = require('./loadable-context');
 
 const ALL_INITIALIZERS = [];
 const READY_INITIALIZERS = [];
 let initialized = false;
 
 /**
  * 加载单个模块
  * @param {Function} loader - 动态导入函数（如 () => import('module')）
  * @returns {Object} - 加载状态（loading, loaded, error, promise）
  */
 function load(loader) {
   let promise = loader();
   let state = {
     loading: true,
     loaded: null,
     error: null,
   };
   state.promise = promise
     .then((loaded) => {
       state.loading = false;
       state.loaded = loaded;
       return loaded;
     })
     .catch((err) => {
       state.loading = false;
       state.error = err;
       throw err;
     });
   return state;
 }
 
 /**
  * 解析模块（处理 ES 模块的 default 导出）
  * @param {Object} obj - 加载的模块
  * @returns {Object} - 解析后的模块
  */
 function resolve(obj) {
   return obj && obj.__esModule ? obj.default : obj;
 }
 
 /**
  * 渲染加载的组件
  * @param {Object} loaded - 加载的模块
  * @param {Object} props - 组件属性
  * @returns {React.Element} - 渲染的 React 元素
  */
 function render(loaded, props) {
   return React.createElement(resolve(loaded), props);
 }
 
 /**
  * 创建动态加载组件
  * @param {Function} loadFn - 加载函数（load）
  * @param {Object} options - 配置（loader, loading, delay, timeout, render, webpack, modules）
  * @returns {React.Component} - 动态加载组件
  */
 function createLoadableComponent(loadFn, options) {
   let opts = Object.assign(
     {
       loader: null,
       loading: null,
       delay: 200,
       timeout: null,
       render: render,
       webpack: null,
       modules: null,
     },
     options
   );
   let res = null;
 
   function init() {
     if (!res) {
       res = loadFn(opts.loader);
     }
     return res.promise;
   }
 
   // 服务端预加载
   if (typeof window === 'undefined') {
     ALL_INITIALIZERS.push(init);
   }
 
   // 客户端预加载
   if (!initialized && typeof window !== 'undefined' && typeof opts.webpack === 'function') {
     const moduleIds = opts.webpack();
     READY_INITIALIZERS.push((ids) => {
       for (const moduleId of moduleIds) {
         if (ids.indexOf(moduleId) !== -1) {
           return init();
         }
       }
     });
   }
 
   class LoadableComponent extends React.Component {
     constructor(props) {
       super(props);
       init();
       this.state = {
         error: res ? res.error : null,
         pastDelay: false,
         timedOut: false,
         loading: res ? res.loading : true,
         loaded: res ? res.loaded : null,
       };
     }
 
     static preload() {
       return init();
     }
 
     static contextType = LoadableContext;
 
     componentWillMount() {
       this._mounted = true;
       this._loadModule();
     }
 
     _loadModule() {
       if (this.context && Array.isArray(opts.modules)) {
         opts.modules.forEach((moduleName) => {
           this.context(moduleName);
         });
       }
       if (!res.loading) {
         return;
       }
       if (typeof opts.delay === 'number') {
         if (opts.delay === 0) {
           this.setState({ pastDelay: true });
         } else {
           this._delay = setTimeout(() => {
             this.setState({ pastDelay: true });
           }, opts.delay);
         }
       }
       if (typeof opts.timeout === 'number') {
         this._timeout = setTimeout(() => {
           this.setState({ timedOut: true });
         }, opts.timeout);
       }
       let update = () => {
         if (!this._mounted) {
           return;
         }
         this.setState({
           error: res.error,
           loaded: res.loaded,
           loading: res.loading,
         });
         this._clearTimeouts();
       };
       res.promise
         .then(() => {
           update();
         })
         .catch(() => {
           update();
         });
     }
 
     componentWillUnmount() {
       this._mounted = false;
       this._clearTimeouts();
     }
 
     _clearTimeouts() {
       clearTimeout(this._delay);
       clearTimeout(this._timeout);
     }
 
     retry = () => {
       this.setState({ error: null, loading: true, timedOut: false });
       res = loadFn(opts.loader);
       this._loadModule();
     };
 
     render() {
       if (this.state.loading || this.state.error) {
         return React.createElement(opts.loading, {
           isLoading: this.state.loading,
           pastDelay: this.state.pastDelay,
           timedOut: this.state.timedOut,
           error: this.state.error,
           retry: this.retry,
         });
       } else if (this.state.loaded) {
         return opts.render(this.state.loaded, this.props);
       }
       return null;
     }
   }
 
   return LoadableComponent;
 }
 
 /**
  * 创建动态加载组件
  * @param {Object} opts - 配置（loader, loading, delay, timeout, render, webpack, modules）
  * @returns {React.Component} - 动态加载组件
  */
 function Loadable(opts) {
   return createLoadableComponent(load, opts);
 }
 
 /**
  * 预加载所有动态模块（服务端）
  * @returns {Promise} - 加载完成
  */
 Loadable.preloadAll = function preloadAll() {
   return new Promise((resolve, reject) => {
     flushInitializers(ALL_INITIALIZERS).then(resolve, reject);
   });
 };
 
 /**
  * 预加载指定动态模块（客户端）
  * @param {Array} ids - 模块 ID
  * @returns {Promise} - 加载完成
  */
 Loadable.preloadReady = function preloadReady(ids = []) {
   return new Promise((resolve) => {
     const res = () => {
       initialized = true;
       return resolve();
     };
     flushInitializers(READY_INITIALIZERS, ids).then(res, res);
   });
 };
 
 /**
  * 执行初始化函数
  * @param {Array} initializers - 初始化函数列表
  * @param {Array} ids - 模块 ID
  * @returns {Promise} - 加载完成
  */
 function flushInitializers(initializers, ids) {
   let promises = [];
   while (initializers.length) {
     let init = initializers.pop();
     promises.push(init(ids));
   }
   return Promise.all(promises).then(() => {
     if (initializers.length) {
       return flushInitializers(initializers, ids);
     }
   });
 }
 
 // 客户端预加载接口
 if (typeof window !== 'undefined') {
   window.__NEXT_PRELOADREADY = Loadable.preloadReady;
 }
 
 module.exports = Loadable;


 /*

 loadable.js
作用：实现 React Loadable（动态导入库），支持按需加载 React 组件，兼容 Webpack 4 和 Next.js 9.1.1 的 SSR。
保留功能：
单模块加载：Loadable 和 load 函数。
预加载：preloadAll（服务端）、preloadReady（客户端）。
SSR 兼容：通过 loadable-context.js 捕获模块名。
retry 功能（加载失败重试）。




示例 1：动态加载组件（SSR）
请求：GET http://localhost:3000/dashboard

执行：
on-demand-entry-handler.js 编译 pages/dashboard.jsx.
get-page-files.js 获取 [static/development/pages/dashboard.js].
normalize-page-path.js 规范化路径 /dashboard.
loadable.js 的 Loadable 创建 Chart 组件，调用 loader: () => import('../components/Chart').    !!!!!!!!!!!!!!!!!!!!!!!!!!
loadable-context.js 的 LoadableContext 捕获模块名 ../components/Chart，确保 SSR 打包。         !!!!!!!!!!!!!!!!!!!!!!!!!!
_document.js 渲染 HTML，htmlescape.js 转义 __NEXT_DATA__.
send-html.js 发送 HTML，设置 ETag, Content-Type.

渲染页面：
Dashboard
Data Visualization

打包：.next/static/chunks/Chart.<hash>.js 单独生成，SSR 时包含。                               !!!!!!!!!!!!!!!!!!!!!!!!!!




/****** */