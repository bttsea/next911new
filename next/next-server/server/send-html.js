// send-html.js
const { generateETag } = require('etag');
const { fresh } = require('fresh');
const { isResSent } = require('../lib/utils');

/**
 * 发送 HTML 响应到客户端
 * @param {Object} req - HTTP 请求对象
 * @param {Object} res - HTTP 响应对象
 * @param {string} html - HTML 内容
 * @param {Object} options - 配置选项
 * @param {boolean} options.generateEtags - 是否生成 ETag
 * @param {boolean} options.poweredByHeader - 是否添加 X-Powered-By 头
 */
function sendHTML(req, res, html, { generateEtags, poweredByHeader }) {
  // 如果响应已发送，直接返回
  if (isResSent(res)) return;

  // 生成 ETag（如果启用）
  ///=== ETag（Entity Tag，实体标签）是 HTTP 协议中的一个响应头，用于标识资源的特定版本，支持缓存验证。客户端通过 ETag 判断资源是否变更，从而决定是否需要重新获取内容。它常与 If-None-Match 请求头配合，实现高效的缓存机制（返回 304 Not Modified 状态，减少带宽）。
  ///=== 作用：
  ///=== 缓存验证：客户端发送 If-None-Match 头，服务器比较 ETag，若匹配，返回 304（资源未变）。


  const etag = generateEtags ? generateETag(html) : undefined;

  // 设置 X-Powered-By 头（如果启用）
  if (poweredByHeader) {
    res.setHeader('X-Powered-By', 'Next.js');
  }

  // 检查请求是否新鲜（支持 304 缓存）
  if (fresh(req.headers, { etag })) {
    res.statusCode = 304;
    res.end();
    return;
  }

  // 设置 ETag 头
  if (etag) {
    res.setHeader('ETag', etag);
  }

  // 设置默认 Content-Type
  if (!res.getHeader('Content-Type')) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
  }

  // 设置 Content-Length 并发送 HTML
  res.setHeader('Content-Length', Buffer.byteLength(html));
  res.end(req.method === 'HEAD' ? null : html);
}

module.exports = sendHTML;

/*
功能：发送 HTML 响应到客户端，处理 HTTP 缓存（ETag、304）、设置响应头（Content-Type、Content-Length、X-Powered-By）。
保留发送 HTML 逻辑：检查响应状态、生成 ETag、处理 304 缓存、设置响应头、发送内容。
确保与 etag, fresh, isResSent 无冲突。



示例 1：普通请求
请求：GET http://localhost:3000/about

HTML 内容：
<html><body><div>About Page</div><script>window.__NEXT_DATA__ = {"page": "/about"}</script><script src="/_next/static/development/pages/about.js"></script></body></html>

执行：
on-demand-entry-handler.js 编译 pages/about.jsx。

get-page-files.js 获取脚本 [static/development/pages/about.js]。

_document.js 渲染 HTML，htmlescape.js 转义 __NEXT_DATA__。

send-html.js 发送响应：
生成 ETag（如 "123456789"）。

设置头：

Content-Type: text/html; charset=utf-8
Content-Length: <length>
ETag: "123456789"
X-Powered-By: Next.js

发送 HTML 内容。

响应头：

HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
Content-Length: <length>
ETag: "123456789"
X-Powered-By: Next.js




示例 2：缓存命中（304）    缓存命中（304）   缓存命中（304）   缓存命中（304）
请求：GET http://localhost:3000/about
请求头：If-None-Match: "123456789"
执行：
send-html.js 调用 fresh(req.headers, { etag })，检测缓存命中。
返回 304 状态，不发送 HTML。
响应头：
HTTP/1.1 304 Not Modified
ETag: "123456789"
X-Powered-By: Next.js



/**** */

