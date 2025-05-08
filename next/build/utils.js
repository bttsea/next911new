const chalk = require('chalk');
const fs = require('fs');
const textTable = require('next/dist/compiled/text-table');
const path = require('path');
const stripogat = require('strip-ansi');
const { promisify } = require('util');
const { isValidElementType } = require('react-is');
const prettyBytes = require('../lib/pretty-bytes');
const { recursiveReadDir } = require('../lib/recursive-readdir');
const { getPageChunks } = require('./webpack/plugins/chunk-graph-plugin');

// 文件状态缓存
const fsStatPromise = promisify(fs.stat);
const fileStats = {};
const fsStat = file => {
  if (fileStats[file]) return fileStats[file];
  fileStats[file] = fsStatPromise(file);
  return fileStats[file];
};

// 收集页面文件
function collectPages(directory, pageExtensions) {
  return recursiveReadDir(directory, new RegExp(`\\.(?:${pageExtensions.join('|')})$`));
}

// 打印页面树视图
function printTreeView(list, pageInfos) {
  const getPrettySize = size => {
    const formatted = prettyBytes(size);
    // 绿色：0-100KB
    if (size < 100 * 1000) return chalk.green(formatted);
    // 黄色：100-250KB
    if (size < 250 * 1000) return chalk.yellow(formatted);
    // 红色：>=250KB
    return chalk.red.bold(formatted);
  };

  const messages = [['Page', 'Size', 'Files', 'Packages'].map(entry => chalk.underline(entry))];

  list.sort((a, b) => a.localeCompare(b)).forEach((item, i) => {
    const symbol = i === 0 ? (list.length === 1 ? '─' : '┌') : i === list.length - 1 ? '└' : '├';
    const pageInfo = pageInfos.get(item);

    messages.push([
      `${symbol} ${item.startsWith('/_') ? ' ' : pageInfo && pageInfo.static ? chalk.bold('⚡') : 'σ'} ${item}`,
      ...(pageInfo
        ? [
            pageInfo.size >= 0 ? getPrettySize(pageInfo.size) : '',
            pageInfo.chunks ? pageInfo.chunks.internal.size.toString() : '',
            pageInfo.chunks ? pageInfo.chunks.external.size.toString() : '',
          ]
        : ['', '', '']),
    ]);
  });

  console.log(
    textTable(messages, {
      align: ['l', 'l', 'r', 'r'],
      stringLength: str => stripAnsi(str).length,
    })
  );

  console.log();
  console.log(
    textTable(
      [
        ['σ', '(Server)', `page will be server rendered (i.e. ${chalk.cyan('getInitialProps')})`],
        [chalk.bold('⚡'), '(Static File)', 'page was prerendered as static HTML'],
      ],
      {
        align: ['l', 'l', 'l'],
        stringLength: str => stripAnsi(str).length,
      }
    )
  );
  console.log();
}

// 计算页面大小（KB）
async function getPageSizeInKb(page, distPath, buildId, buildManifest, isModern) {
  const clientBundle = path.join(distPath, `static/${buildId}/pages/`, `${page}${isModern ? '.module' : ''}.js`);
  const baseDeps = page === '/_app' ? [] : buildManifest.pages['/_app'];
  const deps = (buildManifest.pages[page] || [])
    .filter(dep => !baseDeps.includes(dep) && /\.module\.js$/.test(dep) === isModern)
    .map(dep => `${distPath}/${dep}`);
  deps.push(clientBundle);

  try {
    const depStats = await Promise.all(deps.map(fsStat));
    return depStats.reduce((size, stat) => size + stat.size, 0);
  } catch (_) {
    return -1;
  }
}

// 判断页面是否静态
async function isPageStatic(page, serverBundle, runtimeEnvConfig) {
  try {
    require('../next-server/lib/runtime-config').setConfig(runtimeEnvConfig);
    const mod = require(serverBundle);
    const Comp = mod.default || mod;

    if (!Comp || !isValidElementType(Comp) || typeof Comp === 'string') {
      throw new Error('INVALID_DEFAULT_EXPORT');
    }

    const hasGetInitialProps = !!(Comp.getInitialProps);

    return {
      static: !hasGetInitialProps,
    };
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND') return {};
    throw err;
  }
}

// 检查自定义 App 的 getInitialProps
function hasCustomAppGetInitialProps(appBundle, runtimeEnvConfig) {
  require('../next-server/lib/runtime-config').setConfig(runtimeEnvConfig);
  let mod = require(appBundle);

  if (appBundle.endsWith('_app.js')) {
    mod = mod.default || mod;
  } else {
    mod = mod._app;
  }

  return mod.getInitialProps !== mod.origGetInitialProps;
}

module.exports = {
  collectPages,
  printTreeView,
  getPageSizeInKb,
  isPageStatic,
  hasCustomAppGetInitialProps,
};
/*
保留核心功能：
collectPages：扫描页面文件，，构建页面列表       next build 和 next export 必需。
printTreeView：输出构建日志（页面大小、类型）， 
getPageSizeInKb：计算页面大小，支持构建日志，保留。
isPageStatic：判断页面是否静态，next export 必需， 
hasCustomAppGetInitialProps：检查 _app 的 getInitialProps，SSR 和导出可能需要， 

/****** */