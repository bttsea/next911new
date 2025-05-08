const { renderToString, renderToStaticMarkup } = require('react-dom/server');
const mitt = require('../lib/mitt');
const {
  loadGetInitialProps,
  isResSent,
  getDisplayName,
} = require('../lib/utils');
const Head = require('../lib/head').default;
const defaultHead = require('../lib/head').defaultHead;
const Loadable = require('../lib/loadable');
const { RouterContext } = require('../lib/router-context');

// 模拟路由器，禁止服务端调用客户端路由方法
function noRouter() {
  const message =
    'No router instance found. you should only use "next/router" inside the client side of your app. https://err.sh/zeit/next.js/no-router-instance';
  throw new Error(message);
}

// 服务端路由类，模拟客户端路由行为
class ServerRouter {
  static events = mitt(); // 事件发射器
  constructor(pathname, query, as) {
    this.route = pathname.replace(/\/$/, '') || '/';
    this.pathname = pathname;
    this.query = query;
    this.asPath = as;
  }
  push() { noRouter(); }
  replace() { noRouter(); }
  reload() { noRouter(); }
  back() { noRouter(); }
  prefetch() { noRouter(); }
  beforePopState() { noRouter(); }
}

// 增强组件，支持自定义 App 和页面组件
function enhanceComponents(options, App, Component) {
  if (typeof options === 'function') {
    return {
      App,
      Component: options(Component),
    };
  }
  return {
    App: options.enhanceApp ? options.enhanceApp(App) : App,
    Component: options.enhanceComponent ? options.enhanceComponent(Component) : Component,
  };
}

// 渲染 React 元素为 HTML 字符串
function render(renderElementToString, element) {
  let html, head;
  try {
    html = renderElementToString(element);
  } finally {
    head = Head.rewind() || defaultHead();
  }
  return { html, head };
}

// 渲染文档组件，生成完整的 HTML
function renderDocument(Document, {
  dataManagerData,
  props,
  docProps,
  pathname,
  query,
  buildId,
  assetPrefix,
  runtimeConfig,
  nextExport,
  autoExport,
  skeleton,
  dynamicImportsIds,
  dangerousAsPath,
  err,
  dev,
  staticMarkup,
  devFiles,
  files,
  dynamicImports,
}) {
  return (
    '<!DOCTYPE html>' +
    renderToStaticMarkup(
      <Document
        __NEXT_DATA__={{
          dataManager: dataManagerData,
          props,
          page: pathname,
          query,
          buildId,
          assetPrefix: assetPrefix === '' ? undefined : assetPrefix,
          runtimeConfig,
          nextExport,
          autoExport,
          skeleton,
          dynamicIds: dynamicImportsIds.length === 0 ? undefined : dynamicImportsIds,
          err: err ? serializeError(dev, err) : undefined,
        }}
        dangerousAsPath={dangerousAsPath}
        isDevelopment={!!dev}
        staticMarkup={staticMarkup}
        devFiles={devFiles}
        files={files}
        dynamicImports={dynamicImports}
        assetPrefix={assetPrefix}
        {...docProps}
      />
    )
  );
}

// 主渲染函数，将页面渲染为 HTML
async function renderToHTML(req, res, pathname, query, renderOpts) {
  pathname = pathname === '/index' ? '/' : pathname;
  const {
    err,
    dev = false,
    documentMiddlewareEnabled = false,
    staticMarkup = false,
    App,
    Document,
    DocumentMiddleware,
    Component,
    buildManifest,
    reactLoadableManifest,
    ErrorDebug,
  } = renderOpts;

  const defaultAppGetInitialProps = App.getInitialProps === App.origGetInitialProps;
  const hasPageGetInitialProps = !!Component.getInitialProps;
  const isAutoExport = !hasPageGetInitialProps && defaultAppGetInitialProps;

  if (dev) {
    const { isValidElementType } = require('react-is');
    if (!isValidElementType(Component)) {
      throw new Error(`The default export is not a React Component in page: "${pathname}"`);
    }
    if (!isValidElementType(App)) {
      throw new Error(`The default export is not a React Component in page: "/_app"`);
    }
    if (!isValidElementType(Document)) {
      throw new Error(`The default export is not a React Component in page: "/_document"`);
    }
    if (isAutoExport) {
      query = {};
      req.url = pathname;
      renderOpts.nextExport = true;
    }
  }
  if (isAutoExport) renderOpts.autoExport = true;

  await Loadable.preloadAll(); // 预加载动态导入模块

  const asPath = req.url;
  const router = new ServerRouter(pathname, query, asPath);
  const ctx = {
    err,
    req: isAutoExport ? undefined : req,
    res: isAutoExport ? undefined : res,
    pathname,
    query,
    asPath,
    AppTree: (props) => (
      <AppContainer>
        <App {...props} Component={Component} router={router} />
      </AppContainer>
    ),
  };

  let props;
  if (documentMiddlewareEnabled && typeof DocumentMiddleware === 'function') {
    await DocumentMiddleware(ctx); // 执行文档中间件
  }

  const reactLoadableModules = [];
  const AppContainer = ({ children }) => (
    <RouterContext.Provider value={router}>
      <LoadableContext.Provider value={moduleName => reactLoadableModules.push(moduleName)}>
        {children}
      </LoadableContext.Provider>
    </RouterContext.Provider>
  );

  try {
    props = await loadGetInitialProps(App, {
      AppTree: ctx.AppTree,
      Component,
      router,
      ctx,
    });
  } catch (err) {
    if (!dev || !err) throw err;
    ctx.err = err;
    renderOpts.err = err;
  }

  if (isResSent(res)) return null; // 如果响应已发送，直接返回

  const devFiles = buildManifest.devFiles;
  const files = [
    ...new Set([
      ...require('./get-page-files').getPageFiles(buildManifest, pathname),
      ...require('./get-page-files').getPageFiles(buildManifest, '/_app'),
    ]),
  ];

  const renderElementToString = staticMarkup ? renderToStaticMarkup : renderToString;

  // 渲染错误页面
  function renderPageError() {
    if (ctx.err && ErrorDebug) {
      return render(renderElementToString, <ErrorDebug error={ctx.err} />);
    }
    if (dev && (props.router || props.Component)) {
      throw new Error(
        `'router' and 'Component' can not be returned in getInitialProps from _app.js https://err.sh/zeit/next.js/cant-override-next-props`
      );
    }
  }

  // 渲染页面
  function renderPage(options = {}) {
    const renderError = renderPageError();
    if (renderError) return renderError;

    const { App: EnhancedApp, Component: EnhancedComponent } = enhanceComponents(options, App, Component);

    return render(
      renderElementToString,
      <AppContainer>
        <EnhancedApp Component={EnhancedComponent} router={router} {...props} />
      </AppContainer>
    );
  }

  const docProps = await loadGetInitialProps(Document, { ...ctx, renderPage });
  if (isResSent(res)) return null;

  if (!docProps || typeof docProps.html !== 'string') {
    throw new Error(
      `"${getDisplayName(Document)}.getInitialProps()" should resolve to an object with a "html" prop set with a valid html string`
    );
  }

  const dynamicImportIdsSet = new Set();
  const dynamicImports = [];

  for (const mod of reactLoadableModules) {
    const manifestItem = reactLoadableManifest[mod];
    if (manifestItem) {
      manifestItem.forEach(item => {
        dynamicImports.push(item);
        dynamicImportIdsSet.add(item.id);
      });
    }
  }

  const dynamicImportsIds = [...dynamicImportIdsSet];

  const html = renderDocument(Document, {
    ...renderOpts,
    dangerousAsPath: router.asPath,
    dataManagerData: '[]',
    props,
    docProps,
    pathname,
    query,
    dynamicImportsIds,
    dynamicImports,
    files,
    devFiles,
  });

  return html;
}

// 序列化错误对象
function errorToJSON(err) {
  const { name, message, stack } = err;
  return { name, message, stack };
}

// 序列化错误，仅在开发模式下返回详细信息
function serializeError(dev, err) {
  if (dev) {
    return errorToJSON(err);
  }
  return {
    name: 'Internal Server Error.',
    message: '500 - Internal Server Error.',
    statusCode: 500,
  };
}

module.exports = { renderToHTML };


/*****
 * 保留核心功能：
功能概述：
renderToHTML 是 Next.js 服务端渲染的核心，负责将 React 组件渲染为 HTML。
支持页面渲染（App 和 Component）、文档渲染（Document）、动态导入（Loadable）和错误处理。
保留逻辑：
路由模拟（ServerRouter）。
组件增强（enhanceComponents）。
页面和文档渲染（render, renderDocument）。
动态模块加载（LoadableContext, reactLoadableManifest）。
错误处理（ErrorDebug, serializeError）。
/******* */  