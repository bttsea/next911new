const chalk = require('chalk');
const textTable = require('next/dist/compiled/text-table');
const createStore = require('next/dist/compiled/unistore');
const stripAnsi = require('strip-ansi');
const formatWebpackMessages = require('../../client/dev/error-overlay/format-webpack-messages');
const { store: consoleStore } = require('./store');
const forkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');
const { createCodeframeFormatter } = require('fork-ts-checker-webpack-plugin/lib/formatter/codeframeFormatter');

// 记录开发服务器启动
function startedDevelopmentServer(appUrl) {
  consoleStore.setState({ appUrl });
}

let previousClient = null;
let previousServer = null;

// Webpack 编译状态
const WebpackStatusPhase = {
  COMPILING: 1,
  COMPILED_WITH_ERRORS: 2,
  TYPE_CHECKING: 3,
  COMPILED_WITH_WARNINGS: 4,
  COMPILED: 5,
};

// 获取 Webpack 状态阶段
function getWebpackStatusPhase(status) {
  if (status.loading) return WebpackStatusPhase.COMPILING;
  if (status.errors) return WebpackStatusPhase.COMPILED_WITH_ERRORS;
  if (status.typeChecking) return WebpackStatusPhase.TYPE_CHECKING;
  if (status.warnings) return WebpackStatusPhase.COMPILED_WITH_WARNINGS;
  return WebpackStatusPhase.COMPILED;
}

// 创建构建状态存储
const buildStore = createStore({
  client: { loading: true },
  server: { loading: true },
});

// 订阅构建状态变化
buildStore.subscribe(state => {
  const { client, server } = state;

  const [{ status }] = [
    { status: client, phase: getWebpackStatusPhase(client) },
    { status: server, phase: getWebpackStatusPhase(server) },
  ].sort((a, b) => a.phase - b.phase);

  const { bootstrap: bootstrapping, appUrl } = consoleStore.getState();
  if (bootstrapping && status.loading) return;

  const partialState = {
    bootstrap: false,
    appUrl,
  };

  if (status.loading) {
    consoleStore.setState({ ...partialState, loading: true }, true);
  } else {
    const { errors, warnings, typeChecking } = status;
    if (errors == null && typeChecking) {
      consoleStore.setState(
        { ...partialState, loading: false, typeChecking: true, errors, warnings },
        true
      );
      return;
    }

    consoleStore.setState(
      { ...partialState, loading: false, typeChecking: false, errors, warnings },
      true
    );
  }
});

// 监听 Webpack 编译器
function watchCompilers(client, server, enableTypeCheckingOnClient, onTypeChecked) {
  if (previousClient === client && previousServer === server) return;

  buildStore.setState({
    client: { loading: true },
    server: { loading: true },
  });

  function tapCompiler(key, compiler, hasTypeChecking, onEvent) {
    let tsMessagesPromise;
    let tsMessagesResolver;

    compiler.hooks.invalid.tap(`NextJsInvalid-${key}`, () => {
      tsMessagesPromise = undefined;
      onEvent({ loading: true });
    });

    if (hasTypeChecking) {
      const typescriptFormatter = createCodeframeFormatter({});

      compiler.hooks.beforeCompile.tap(`NextJs-${key}-StartTypeCheck`, () => {
        tsMessagesPromise = new Promise(resolve => {
          tsMessagesResolver = msgs => resolve(msgs);
        });
      });

      forkTsCheckerWebpackPlugin
        .getCompilerHooks(compiler)
        .receive.tap(`NextJs-${key}-afterTypeScriptCheck`, (diagnostics, lints) => {
          const allMsgs = [...diagnostics, ...lints];
          const format = message => typescriptFormatter(message, true);

          const errors = allMsgs
            .filter(msg => msg.severity === 'error')
            .map(d => ({
              file: (d.file || '').replace(/\\/g, '/'),
              message: format(d),
            }));
          const warnings = allMsgs
            .filter(msg => msg.severity === 'warning')
            .map(d => ({
              file: (d.file || '').replace(/\\/g, '/'),
              message: format(d),
            }));

          tsMessagesResolver({
            errors: errors.length ? errors : null,
            warnings: warnings.length ? warnings : null,
          });
        });
    }

    compiler.hooks.done.tap(`NextJsDone-${key}`, stats => {
      const { errors, warnings } = formatWebpackMessages(
        stats.toJson({ all: false, warnings: true, errors: true })
      );

      const hasErrors = errors && errors.length;
      const hasWarnings = warnings && warnings.length;

      onEvent({
        loading: false,
        typeChecking: hasTypeChecking,
        errors: hasErrors ? errors : null,
        warnings: hasWarnings ? warnings : null,
      });

      const typePromise = tsMessagesPromise;
      if (!hasErrors && typePromise) {
        typePromise.then(typeMessages => {
          if (typePromise !== tsMessagesPromise) return;

          const reportFiles = stats.compilation.modules
            .map(m => (m.resource || '').replace(/\\/g, '/'))
            .filter(Boolean);

          let filteredErrors = typeMessages.errors
            ? typeMessages.errors
                .filter(({ file }) => file && reportFiles.includes(file))
                .map(({ message }) => message)
            : null;
          if (filteredErrors && filteredErrors.length < 1) filteredErrors = null;

          let filteredWarnings = typeMessages.warnings
            ? typeMessages.warnings
                .filter(({ file }) => file && reportFiles.includes(file))
                .map(({ message }) => message)
            : null;
          if (filteredWarnings && filteredWarnings.length < 1) filteredWarnings = null;

          stats.compilation.errors.push(...(filteredErrors || []));
          stats.compilation.warnings.push(...(filteredWarnings || []));
          onTypeChecked({
            errors: stats.compilation.errors.length ? stats.compilation.errors : null,
            warnings: stats.compilation.warnings.length ? stats.compilation.warnings : null,
          });

          onEvent({
            loading: false,
            typeChecking: false,
            errors: filteredErrors,
            warnings: hasWarnings ? [...warnings, ...(filteredWarnings || [])] : filteredWarnings,
          });
        });
      }
    });
  }

  tapCompiler('client', client, enableTypeCheckingOnClient, status =>
    buildStore.setState({ client: status })
  );
  tapCompiler('server', server, false, status =>
    buildStore.setState({ server: status })
  );

  previousClient = client;
  previousServer = server;
}

module.exports = {
  startedDevelopmentServer,
  watchCompilers,
};


/*
原文件是 Next.js 的构建输出模块，负责格式化 Webpack 编译状态
保留的逻辑：
保留 Webpack 编译状态处理（client, server）。
保留 TypeScript 类型检查（forkTsCheckerWebpackPlugin）。
保留控制台输出逻辑（consoleStore）。


保留的核心功能：
记录开发服务器启动（startedDevelopmentServer）。
监听 Webpack 编译状态（watchCompilers）。
处理 TypeScript 类型检查（forkTsCheckerWebpackPlugin）。
格式化编译错误和警告（formatWebpackMessages）。

项目关联：
与 hot-reloader.js 的 watchCompilers 配合，处理编译状态更新。
与 webpack-config.js 的 getBaseWebpackConfig 配合，生成编译器实例。
与 next-page-config.js 配合，支持 TypeScript 类型检查（如果 tsconfig.json 存在）。
支持 npm run dev 的控制台输出（错误、警告）。
支持 next export（通过 next build 生成的静态文件）。
支持 Express 服务器的开发模式（通过 render.js 和 load-components.js）。

/***** */