const chalk = require('chalk');
const findUp = require('find-up');
const os = require('os');
const { CONFIG_FILE } = require('../lib/constants');
const { execOnce } = require('../lib/utils');

// 默认配置
const defaultConfig = {
  env: [],
  webpack: null,
  webpackDevMiddleware: null,
  distDir: '.next',
  assetPrefix: '',
  configOrigin: 'default',
  useFileSystemPublicRoutes: true,
  generateBuildId: () => null,
  generateEtags: true,
  pageExtensions: ['jsx', 'js'], // 移除 tsx, ts 以简化
  target: 'server',
  poweredByHeader: true,
  compress: true,
  devIndicators: {
    buildActivity: true,
  },
  onDemandEntries: {
    maxInactiveAge: 60 * 1000,
    pagesBufferLength: 2,
  },
  exportTrailingSlash: false,
  experimental: {
    cpus: Math.max(1, (Number(process.env.CIRCLE_NODE_TOTAL) || (os.cpus() || { length: 1 }).length) - 1),
  },
  serverRuntimeConfig: {},
  publicRuntimeConfig: {},
};

// 警告实验性功能
const experimentalWarning = execOnce(() => {
  console.warn(chalk.yellow.bold('警告：') + chalk.bold('你启用了实验性功能。'));
  console.warn('实验性功能不受语义化版本控制，可能会导致意外或应用行为异常。请谨慎使用。');
  console.warn();
});

// 合并用户配置与默认配置
function assignDefaults(userConfig) {
  Object.keys(userConfig).forEach((key) => {
    if (key === 'experimental' && userConfig[key] && userConfig[key] !== defaultConfig[key]) {
      experimentalWarning();
    }

    if (key === 'distDir' && userConfig[key] === 'public') {
      throw new Error('public 目录在 Next.js 中是保留目录，不能设置为 distDir。');
    }

    const maybeObject = userConfig[key];
    if (maybeObject && maybeObject.constructor === Object) {
      userConfig[key] = {
        ...(defaultConfig[key] || {}),
        ...userConfig[key],
      };
    }
  });

  return { ...defaultConfig, ...userConfig };
}

// 规范化配置，支持函数式配置
function normalizeConfig(phase, config) {
  if (typeof config === 'function') {
    config = config(phase, { defaultConfig });
    if (typeof config.then === 'function') {
      throw new Error('next.config.js 中返回了 Promise，不支持异步配置。');
    }
  }
  return config;
}

// 加载 Next.js 配置文件
function loadConfig(phase, dir, customConfig) {
  if (customConfig) {
    return assignDefaults({ configOrigin: 'server', ...customConfig });
  }

  // 查找 next.config.js 文件
  const path = findUp.sync(CONFIG_FILE, { cwd: dir });

  if (path && path.length) {
    const userConfigModule = require(path);
    const userConfig = normalizeConfig(phase, userConfigModule.default || userConfigModule);

    // 验证 target 是否有效
    if (userConfig.target && userConfig.target !== 'server') {
      throw new Error(`指定的 target 无效：${userConfig.target}，仅支持 "server"。`);
    }

    return assignDefaults({ configOrigin: CONFIG_FILE, ...userConfig });
  }

  return defaultConfig;
}

module.exports = loadConfig;


/**
 *保留核心功能：
功能概述：
loadConfig 负责加载和规范化 next.config.js，next.config.js，next.config.js，next.config.js，next.config.js，合并用户配置与默认配置。
支持生产和开发阶段的配置加载。

保留逻辑：
加载 next.config.js（findUp）。
规范化函数式配置（normalizeConfig）。
合并默认配置（assignDefaults）。
验证 distDir 和 target。
实验性功能警告（ experimentalWarning ）。


 /******/