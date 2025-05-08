const chalk = require('chalk');
const { join } = require('path');
const { stringify } = require('querystring');
const { API_ROUTE, DOT_NEXT_ALIAS, PAGES_DIR_ALIAS } = require('../lib/constants');
const { warn } = require('./output/log');

// 创建页面映射
function createPagesMapping(pagePaths, extensions) {
  const previousPages = {};
  const pages = pagePaths.reduce((result, pagePath) => {
    // 规范化页面路径，移除扩展名和多余的 index
    let page = `${pagePath
      .replace(new RegExp(`\\.+(${extensions.join('|')})$`), '')
      .replace(/\\/g, '/')}`.replace(/\/index$/, '');
    page = page === '/index' ? '/' : page;

    const pageKey = page === '' ? '/' : page;

    // 检测重复页面并警告
    if (pageKey in result) {
      warn(
        `Duplicate page detected. ${chalk.cyan(
          join('pages', previousPages[pageKey])
        )} and ${chalk.cyan(join('pages', pagePath))} both resolve to ${chalk.cyan(pageKey)}.`
      );
    } else {
      previousPages[pageKey] = pagePath;
    }

    // 映射页面路径到绝对路径
    result[pageKey] = join(PAGES_DIR_ALIAS, pagePath).replace(/\\/g, '/');
    return result;
  }, {});

  // 设置默认页面
  pages['/_app'] = pages['/_app'] || 'next/dist/pages/_app';
  pages['/_error'] = pages['/_error'] || 'next/dist/pages/_error';
  pages['/_document'] = pages['/_document'] || 'next/dist/pages/_document';

  return pages;
}

// 创建 Webpack 入口点
function createEntrypoints(pages, buildId, config) {
  const client = {};
  const server = {};

  // 默认配置
  const defaultOptions = {
    absoluteAppPath: pages['/_app'],
    absoluteDocumentPath: pages['/_document'],
    absoluteErrorPath: pages['/_error'],
    distDir: DOT_NEXT_ALIAS,
    buildId,
    assetPrefix: config.assetPrefix,
    generateEtags: config.generateEtags,
    canonicalBase: config.canonicalBase,
  };

  Object.keys(pages).forEach(page => {
    const absolutePagePath = pages[page];
    const bundleFile = page === '/' ? '/index.js' : `${page}.js`;
    const isApiRoute = page.match(API_ROUTE);
    const bundlePath = join('static', buildId, 'pages', bundleFile);

    // 服务器入口（支持 API 路由和普通页面）
    if (isApiRoute || true) {
      server[bundlePath] = [absolutePagePath];
    }

    // 客户端入口（排除 _document 和 API 路由）
    if (page !== '/_document' && !isApiRoute) {
      client[bundlePath] = `next-client-pages-loader?${stringify({
        page,
        absolutePagePath,
      })}!`;
    }
  });

  return { client, server };
}

module.exports = {
  createPagesMapping,
  createEntrypoints,
};

/*
保留核心功能：

createPagesMapping：
将页面路径映射为规范化路径（如 /index 到 /）。
处理 _app, _error, _document 默认路径。
检测重复页面并警告。

createEntrypoints：
生成 Webpack 客户端（client）和服务端（server）入口点。
支持 API 路由（API_ROUTE）和普通页面。
使用 next-client-pages-loader 为客户端页面生成入口。
服务端入口直接使用绝对路径（[absolutePagePath]）。

/****** */