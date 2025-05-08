const chalk = require('chalk');
const { copyFile: copyFileOrig, existsSync, readFileSync } = require('fs');
const Worker = require('jest-worker');
const mkdirpModule = require('mkdirp');
const { cpus } = require('os');
const { dirname, join, resolve } = require('path');
const { promisify } = require('util');
const createSpinner = require('../build/spinner');
const { API_ROUTE, BUILD_ID_FILE, CLIENT_PUBLIC_FILES_PATH, CLIENT_STATIC_FILES_PATH, CONFIG_FILE, PAGES_MANIFEST, PHASE_EXPORT, SERVER_DIRECTORY } = require('../next-server/lib/constants');
const loadConfig = require('../next-server/server/config');
const { recursiveCopy } = require('../lib/recursive-copy');
const { recursiveDelete } = require('../lib/recursive-delete');

// 异步创建目录
const mkdirp = promisify(mkdirpModule);
// 异步复制文件
const copyFile = promisify(copyFileOrig);

// 创建进度条显示
function createProgress(total, label = '导出') {
  let curProgress = 0;
  let progressSpinner = createSpinner(`${label} (${curProgress}/${total})`, {
    spinner: {
      frames: ['[    ]', '[=   ]', '[==  ]', '[=== ]', '[ ===]', '[  ==]', '[   =]', '[    ]', '[   =]', '[  ==]', '[ ===]', '[====]', '[=== ]', '[==  ]', '[=   ]'],
      interval: 80,
    },
  });

  return () => {
    curProgress++;
    const newText = `${label} (${curProgress}/${total})`;
    if (progressSpinner) {
      progressSpinner.text = newText;
    } else {
      console.log(newText);
    }
    if (curProgress === total && progressSpinner) {
      progressSpinner.stop();
      console.log(newText);
    }
  };
}

// 导出静态页面的主函数
async function exportStatic(dir, options, configuration) {
  // 日志输出函数，silent 模式下不输出
  function log(message) {
    if (options.silent) return;
    console.log(message);
  }

  dir = resolve(dir); // 解析项目目录
  const nextConfig = configuration || loadConfig(PHASE_EXPORT, dir); // 加载 Next.js 配置
  const threads = options.threads || Math.max(cpus().length - 1, 1); // 设置工作线程数
  const distDir = join(dir, nextConfig.distDir); // 构建输出目录
  const subFolders = nextConfig.exportTrailingSlash; // 是否启用 trailing slash

  log(`> 使用构建目录：${distDir}`);

  // 检查构建目录是否存在
  if (!existsSync(distDir)) {
    throw new Error(`构建目录 ${distDir} 不存在。请先运行 "next build"。`);
  }

  const buildId = readFileSync(join(distDir, BUILD_ID_FILE), 'utf8'); // 读取构建 ID
  const pagesManifest = !options.pages && require(join(distDir, SERVER_DIRECTORY, PAGES_MANIFEST)); // 加载页面清单

  const distPagesDir = join(distDir, SERVER_DIRECTORY, 'static', buildId, 'pages'); // 页面构建目录
  const pages = options.pages || Object.keys(pagesManifest); // 获取页面列表
  const defaultPathMap = {}; // 默认路径映射

  // 生成默认路径映射，排除特殊页面
  for (const page of pages) {
    if (page === '/_document' || page === '/_app' || page === '/_error' || page.match(API_ROUTE)) {
      continue;
    }
    defaultPathMap[page] = { page };
  }

  const outDir = options.outdir; // 输出目录

  // 验证输出目录是否为 public 目录
  if (outDir === join(dir, 'public')) {
    throw new Error(`public 目录在 Next.js 中是保留目录，不能用作导出目录。`);
  }

  await recursiveDelete(join(outDir)); // 清空输出目录
  await mkdirp(join(outDir, '_next', buildId)); // 创建 _next 目录

  // 复制 static 目录
  if (existsSync(join(dir, 'static'))) {
    log('  复制 "static" 目录');
    await recursiveCopy(join(dir, 'static'), join(outDir, 'static'));
  }

  // 复制 _next/static 目录
  if (existsSync(join(distDir, CLIENT_STATIC_FILES_PATH))) {
    log('  复制 "static build" 目录');
    await recursiveCopy(join(distDir, CLIENT_STATIC_FILES_PATH), join(outDir, '_next', CLIENT_STATIC_FILES_PATH));
  }

  // 获取 exportPathMap 配置
  if (typeof nextConfig.exportPathMap !== 'function') {
    console.log(`> 未在 "${CONFIG_FILE}" 中找到 "exportPathMap"。从 "./pages" 生成映射`);
    nextConfig.exportPathMap = async defaultMap => defaultMap;
  }

  // 初始化渲染选项
  const renderOpts = {
    dir,
    buildId,
    nextExport: true,
    assetPrefix: nextConfig.assetPrefix.replace(/\/$/, ''),
    distDir,
    dev: false,
    staticMarkup: false,
    hotReloader: null,
  };

  const { serverRuntimeConfig, publicRuntimeConfig } = nextConfig;
  if (Object.keys(publicRuntimeConfig).length > 0) {
    renderOpts.runtimeConfig = publicRuntimeConfig;
  }

  // 设置全局 __NEXT_DATA__，支持 Link 组件的服务器端渲染
  global.__NEXT_DATA__ = { nextExport: true };

  log(`  启动 ${threads} 个工作线程`);
  const exportPathMap = await nextConfig.exportPathMap(defaultPathMap, { dev: false, dir, outDir, distDir, buildId });

  // 确保 404 页面存在
  if (!exportPathMap['/404']) {
    exportPathMap['/404.html'] = exportPathMap['/404.html'] || { page: '/_error' };
  }

  const exportPaths = Object.keys(exportPathMap); // 导出路径列表
  const filteredPaths = exportPaths.filter(route => !exportPathMap[route].page.match(API_ROUTE)); // 过滤掉 API 路由
  const hasApiRoutes = exportPaths.length !== filteredPaths.length;

  // 警告 API 路由不支持静态导出
  if (hasApiRoutes) {
    log(chalk.yellow('  API 路由不支持静态导出。'));
  }

  const progress = !options.silent && createProgress(filteredPaths.length); // 创建进度条

  // 初始化工作线程池
  const worker = new Worker(require.resolve('./worker.js'), {
    maxRetries: 0,
    numWorkers: threads,
    enableWorkerThreads: true,
    exposedMethods: ['exportPage'],
  });

  worker.getStdout().pipe(process.stdout);
  worker.getStderr().pipe(process.stderr);

  let renderError = false;

  // 并行处理所有路径的静态导出
  await Promise.all(
    filteredPaths.map(async path => {
      const result = await worker.exportPage({
        path,
        pathMap: exportPathMap[path],
        distDir,
        buildId,
        outDir,
        renderOpts,
        serverRuntimeConfig,
        subFolders,
      });
      renderError = renderError || !!result.error;
      if (progress) progress();
    })
  );

  worker.end(); // 关闭工作线程池

  // 检查是否有渲染错误
  if (renderError) {
    throw new Error(`导出过程中发生错误`);
  }

  log(''); // 输出空行以提高可读性
}

module.exports = exportStatic;

/*
功能概述：
index.js 是 next export 的入口，协调静态页面导出，调用 worker.js 渲染页面。
复制静态资源（static, _next/static），生成 HTML 文件。

保留逻辑：
加载配置（loadConfig）。
读取构建 ID（BUILD_ID_FILE）。
加载页面清单（PAGES_MANIFEST）。
清空和创建输出目录（recursiveDelete, mkdirp）。
复制静态资源（recursiveCopy）。
处理 exportPathMap 配置。
启动工作线程（jest-worker）。
过滤 API 路由，生成 404 页面。

/****** */
