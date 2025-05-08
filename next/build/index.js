const chalk = require('chalk');
const fs = require('fs');
const Worker = require('jest-worker');
const mkdirp = require('mkdirp');
const nanoid = require('next/dist/compiled/nanoid/index.js');
const path = require('path');
const { promisify } = require('util');

const formatWebpackMessages = require('../client/dev/error-overlay/format-webpack-messages');
const { PUBLIC_DIR_MIDDLEWARE_CONFLICT } = require('../lib/constants');
const { findPagesDir } = require('../lib/find-pages-dir');
const { recursiveDelete } = require('../lib/recursive-delete');
const { recursiveReadDir } = require('../lib/recursive-readdir');
const { verifyTypeScriptSetup } = require('../lib/verifyTypeScriptSetup');
const {
  BUILD_MANIFEST,
  PAGES_MANIFEST,
  SERVER_DIRECTORY,
} = require('../next-server/lib/constants');
const loadConfig = require('../next-server/server/config');
const { runCompiler } = require('./compiler');
const { createEntrypoints, createPagesMapping } = require('./entries');
const { generateBuildId } = require('./generate-build-id');
const { isWriteable } = require('./is-writeable');
const createSpinner = require('./spinner');
const {
  collectPages,
  getPageSizeInKb,
  hasCustomAppGetInitialProps,
  printTreeView,
} = require('./utils');
const getBaseWebpackConfig = require('./webpack-config');
const { getPageChunks } = require('./webpack/plugins/chunk-graph-plugin');
const { writeBuildId } = require('./write-build-id');

const fsUnlink = promisify(fs.unlink);
const fsRmdir = promisify(fs.rmdir);
const fsStat = promisify(fs.stat);
const fsMove = promisify(fs.rename);
const fsReadFile = promisify(fs.readFile);
const fsWriteFile = promisify(fs.writeFile);

// 静态检查工作线程路径
const staticCheckWorker = require.resolve('./utils');

// 主构建函数，生成生产环境的优化构建
async function build(dir, conf = null) {
  // 检查构建目录是否可写
  if (!(await isWriteable(dir))) {
    throw new Error(
      '> Build directory is not writeable. https://err.sh/zeit/next.js/build-dir-not-writeable'
    );
  }

  // 创建构建进度提示
  const buildSpinner = createSpinner({
    prefixText: '创建优化的生产构建',
  });

  // 加载 Next.js 配置
  const config = loadConfig('production', dir, conf);
  const buildId = await generateBuildId(config.generateBuildId, nanoid);
  const distDir = path.join(dir, config.distDir);

  // 查找 public 目录和 pages 目录
  const publicDir = path.join(dir, 'public');
  const pagesDir = findPagesDir(dir);
  let publicFiles = [];
  let hasPublicDir = false;

  // 验证 TypeScript 配置
  await verifyTypeScriptSetup(dir, pagesDir);

  // 检查 public 目录是否存在
  try {
    await fsStat(publicDir);
    hasPublicDir = true;
  } catch (_) {}

  if (hasPublicDir) {
    publicFiles = await recursiveReadDir(publicDir, /.*/);
  }

  // 收集页面文件
  const pagePaths = await collectPages(pagesDir, config.pageExtensions);

  // 存储所有静态页面和页面信息
  const allStaticPages = new Set();
  const allPageInfos = new Map();

  // 创建页面映射和入口点
  const mappedPages = createPagesMapping(pagePaths, config.pageExtensions);
  const entrypoints = createEntrypoints(mappedPages, 'server', buildId, config);

  // 检查 public 目录与页面文件的冲突
  const conflictingPublicFiles = [];
  if (hasPublicDir) {
    try {
      await fsStat(path.join(publicDir, '_next'));
      throw new Error(PUBLIC_DIR_MIDDLEWARE_CONFLICT);
    } catch (_) {}
  }
  for (let file of publicFiles) {
    file = file
      .replace(/\\/g, '/')
      .replace(/\/index$/, '')
      .split(publicDir)
      .pop();
    if (mappedPages[file]) {
      conflictingPublicFiles.push(file);
    }
  }
  if (conflictingPublicFiles.length) {
    throw new Error(
      `公共文件与页面文件冲突：\n${conflictingPublicFiles.join('\n')}`
    );
  }

  // 生成 Webpack 配置
  const configs = await Promise.all([
    getBaseWebpackConfig(dir, {
      buildId,
      isServer: false,
      config,
      pagesDir,
      entrypoints: entrypoints.client,
    }),
    getBaseWebpackConfig(dir, {
      buildId,
      isServer: true,
      config,
      pagesDir,
      entrypoints: entrypoints.server,
    }),
  ]);

  const clientConfig = configs[0];

  // 警告：如果禁用代码压缩
  if (
    clientConfig.optimization &&
    (clientConfig.optimization.minimize !== true ||
      (clientConfig.optimization.minimizer &&
        clientConfig.optimization.minimizer.length === 0))
  ) {
    console.warn(
      chalk.bold.yellow('警告：') +
        chalk.bold('项目中已禁用生产代码优化。')
    );
  }

  // 执行 Webpack 编译
  const webpackBuildStart = process.hrtime();
  const result = await runCompiler(configs);
  const webpackBuildEnd = process.hrtime(webpackBuildStart);
  buildSpinner.stopAndPersist();

  // 格式化 Webpack 编译结果
  const formattedResult = formatWebpackMessages(result);
  if (formattedResult.errors.length > 0) {
    console.error(chalk.red('编译失败。\n'));
    console.error(formattedResult.errors.join('\n\n'));
    throw new Error('由于 Webpack 错误，构建失败');
  } else if (formattedResult.warnings.length > 0) {
    console.warn(chalk.yellow('编译完成，但有警告。\n'));
    console.warn(formattedResult.warnings.join('\n\n'));
  } else {
    console.log(chalk.green('编译成功。\n'));
  }

  // 优化页面
  const postBuildSpinner = createSpinner({
    prefixText: '自动优化页面',
  });

  const pageKeys = Object.keys(mappedPages);
  const manifestPath = path.join(distDir, SERVER_DIRECTORY, PAGES_MANIFEST);
  const buildManifestPath = path.join(distDir, BUILD_MANIFEST);

  const staticPages = new Set();
  const pageInfos = new Map();
  const pagesManifest = JSON.parse(await fsReadFile(manifestPath, 'utf8'));
  const buildManifest = JSON.parse(await fsReadFile(buildManifestPath, 'utf8'));

  let customAppGetInitialProps;

  process.env.NEXT_PHASE = 'production';

  // 检查页面是否为静态页面
  const staticCheckWorkers = new Worker(staticCheckWorker, {
    numWorkers: config.experimental.cpus,
    enableWorkerThreads: true,
  });

  await Promise.all(
    pageKeys.map(async page => {
      const chunks = getPageChunks(page);
      const actualPage = page === '/' ? '/index' : page;
      const size = await getPageSizeInKb(
        actualPage,
        distDir,
        buildId,
        buildManifest,
        config.experimental.modern
      );
      const bundleRelative = path.join(
        `static/${buildId}/pages`,
        actualPage + '.js'
      );
      const serverBundle = path.join(distDir, SERVER_DIRECTORY, bundleRelative);

      let isStatic = false;
      pagesManifest[page] = bundleRelative.replace(/\\/g, '/');

      const runtimeEnvConfig = {
        publicRuntimeConfig: config.publicRuntimeConfig,
        serverRuntimeConfig: config.serverRuntimeConfig,
      };
      const nonReservedPage = !page.match(/^\/(_app|_error|_document|api)/);

      if (nonReservedPage && customAppGetInitialProps === undefined) {
        customAppGetInitialProps = hasCustomAppGetInitialProps(
          path.join(distDir, SERVER_DIRECTORY, `/static/${buildId}/pages/_app.js`),
          runtimeEnvConfig
        );
        if (customAppGetInitialProps) {
          console.warn(
            chalk.bold.yellow('警告：') +
              chalk.yellow('由于 pages/_app 中使用了 getInitialProps，已禁用自动静态优化。')
          );
        }
      }

      if (nonReservedPage) {
        try {
          const result = await staticCheckWorkers.isPageStatic(
            page,
            serverBundle,
            runtimeEnvConfig
          );
          if (result.static && customAppGetInitialProps === false) {
            staticPages.add(page);
            isStatic = true;
          }
        } catch (err) {
          if (err.message !== 'INVALID_DEFAULT_EXPORT') throw err;
          throw new Error(`页面 ${page} 没有有效的 React 组件导出`);
        }
      }

      pageInfos.set(page, { size, chunks, serverBundle, static: isStatic });
    })
  );
  staticCheckWorkers.end();

  // 写入构建 ID
  await writeBuildId(distDir, buildId);

  // 处理静态页面导出
  if (staticPages.size > 0) {
    const exportApp = require('../export').default;
    const exportOptions = {
      silent: true,
      buildExport: true,
      pages: [...staticPages],
      outdir: path.join(distDir, 'export'),
    };
    const exportConfig = {
      ...config,
      exportTrailingSlash: false,
    };
    await exportApp(dir, exportOptions, exportConfig);

    // 删除导出的服务器端 bundle
    for (const page of staticPages) {
      const { serverBundle } = pageInfos.get(page);
      await fsUnlink(serverBundle);
    }

    // 移动导出的页面文件
    for (const page of staticPages) {
      const file = page === '/' ? '/index' : page;
      const orig = path.join(exportOptions.outdir, `${file}.html`);
      const relativeDest = path.join('static', buildId, 'pages', `${file}.html`).replace(/\\/g, '/');
      const dest = path.join(distDir, SERVER_DIRECTORY, relativeDest);

      pagesManifest[page] = relativeDest;
      if (page === '/') pagesManifest['/index'] = relativeDest;

      await mkdirp(path.dirname(dest));
      await fsMove(orig, dest);
    }

    // 删除临时导出目录
    await recursiveDelete(exportOptions.outdir);
    await fsRmdir(exportOptions.outdir);
    await fsWriteFile(manifestPath, JSON.stringify(pagesManifest), 'utf8');
  }

  postBuildSpinner.stopAndPersist();

  // 打印页面树视图
  staticPages.forEach(pg => allStaticPages.add(pg));
  pageInfos.forEach((info, key) => allPageInfos.set(key, info));
  printTreeView(Object.keys(mappedPages), allPageInfos, false);
}

module.exports = build;


/*
保留核心功能：
功能概述：
build 是 Next.js 生产构建的核心，负责编译客户端和服务端代码、优化页面和生成静态文件。
支持页面收集、Webpack 编译、静态优化和 next export。

保留逻辑：
页面收集（collectPages）。
Webpack 配置和编译（getBaseWebpackConfig, runCompiler）。
静态页面检测和优化（isPageStatic）。
静态导出（exportApp）。
页面树视图（printTreeView

/***** */