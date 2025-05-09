// request-context.js
const React = require('react');

/**
 * React Context 用于共享请求上下文
 * 提供服务端请求信息（如 req, res）给组件
 */
const RequestContext = React.createContext(null);

module.exports = RequestContext;

/*
功能：创建 React Context（RequestContext），用于在 React 组件树中共享请求相关的数据（如 HTTP 请求上下文，可能包括 req, res, 或查询参数），主要用于服务端渲染（SSR）场景。
用途：允许组件通过 useContext(RequestContext) 访问服务端请求信息，例如在 getServerSideProps 或自定义 _app.js 中获取请求头、查询参数等，支持动态渲染。



示例 1：访问查询参数
请求：GET http://localhost:3000/about?id=123

执行：
on-demand-entry-handler.js 编译 pages/about.jsx。
get-page-files.js 获取 [static/development/pages/about.js]。
normalize-page-path.js 规范化路径 /about。
getServerSideProps 提供 props: { id: '123' }。
next.js 在 SSR 时注入 RequestContext，包含 req, res, query 等。
_app.jsx 通过 useContext(RequestContext) 获取 query: { id: '123' }。
_document.js 渲染 HTML，htmlescape.js 转义 __NEXT_DATA__.
send-html.js 发送 HTML，设置 ETag, Content-Type.
渲染页面，显示：
Query: 123
About Page, ID: 123


HTML（简化）：
<html><body><div>Query: 123<div>About Page, ID: 123</div></div><script>window.__NEXT_DATA__ = {"page": "/about", "props



/**** */