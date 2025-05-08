// utils.js
import { BLOCKED_PAGES } from '../lib/constants';

// 内部 URL 前缀正则表达式，用于匹配 Next.js 或静态资源路径
const INTERNAL_PREFIXES = [/^\/_next\//, /^\/static\//];

/**
 * 判断 URL 是否为内部 URL（Next.js 或静态资源）
 * @param {string} url - 要检查的 URL
 * @returns {boolean} - 如果是内部 URL 返回 true
 */
export function isInternalUrl(url) {
  return INTERNAL_PREFIXES.some(prefix => prefix.test(url));
}

/**
 * 检查路径是否在禁用页面列表中
 * @param {string} pathname - 要检查的路径
 * @returns {boolean} - 如果路径被禁用返回 true
 */
export function isBlockedPage(pathname) {
  return BLOCKED_PAGES.includes(pathname);
}

/**
 * 清理路径中的冗余查询参数（移除末尾的空查询符号）
 * @param {string} pathname - 要清理的路径
 * @returns {string} - 清理后的路径
 */
export function cleanPath(pathname) {
  return pathname.replace(/\?$/, '');
}




/*
函数实例
1. isInternalUrl
功能：检查一个 URL 是否为 Next.js 内部资源（以 _next/ 或 static/ 开头）。
实例：
// 输入
const url1 = '/_next/data/build.json';
const url2 = '/static/images/logo.png';
const url3 = '/about';

// 调用
console.log(isInternalUrl(url1)); // 输出: true
console.log(isInternalUrl(url2)); // 输出: true
console.log(isInternalUrl(url3)); // 输出: false

说明：
url1 (/_next/data/build.json) 匹配正则 /^\/_next\//，返回 true。
url2 (/static/images/logo.png) 匹配正则 /^\/static\//，返回 true。
url3 (/about) 不匹配任何内部前缀，返回 false。
此函数常用于 Next.js 服务端，判断请求是否为内部资源，以决定是否进行特殊处理。

2. isBlockedPage
功能：检查一个路径是否在禁用页面列表 (BLOCKED_PAGES) 中。
实例：
javascript

// 输入
const path1 = '/admin';
const path2 = '/login';
const path3 = '/home';

// 调用
console.log(isBlockedPage(path1)); // 输出: true
console.log(isBlockedPage(path2)); // 输出: true
console.log(isBlockedPage(path3)); // 输出: false

说明：
path1 (/admin) 在 BLOCKED_PAGES 数组中，返回 true。
path2 (/login) 在 BLOCKED_PAGES 数组中，返回 true。
path3 (/home) 不在 BLOCKED_PAGES 中，返回 false。
此函数适用于服务端限制访问某些页面，例如需要认证的页面。


3. cleanPath
功能：清理路径末尾的空查询符号 (?)。
实例：
javascript

// 输入
const path1 = '/about?';
const path2 = '/products?category=books';
const path3 = '/contact';

// 调用
console.log(cleanPath(path1)); // 输出: '/about'
console.log(cleanPath(path2)); // 输出: '/products?category=books'
console.log(cleanPath(path3)); // 输出: '/contact'

说明：
path1 (/about?) 末尾有空查询符号 ?，被移除，返回 /about。
path2 (/products?category=books) 有有效查询参数，未被修改，返回原路径。
path3 (/contact) 无查询参数，返回原路径。
此函数用于规范化 URL 路径，清理无效的查询符号，常用于服务端路由处理。

/*************** */