// utils.js
import { format } from 'url';

// 仅在支持 performance API 的环境中设置为 true
export const SUPPORTS_PERFORMANCE = typeof performance !== 'undefined';

// 检查是否支持 performance 的 mark 和 measure 方法
export const SUPPORTS_PERFORMANCE_USER_TIMING =
  SUPPORTS_PERFORMANCE &&
  typeof performance.mark === 'function' &&
  typeof performance.measure === 'function';

// URL 对象支持的键列表
export const urlObjectKeys = [
  'auth',
  'hash',
  'host',
  'hostname',
  'href',
  'path',
  'pathname',
  'port',
  'protocol',
  'query',
  'search',
  'slashes',
];

/**
 * 确保函数只执行一次
 * @param {Function} fn - 要执行的函数
 * @returns {Function} - 包装后的函数，只执行一次
 */
export function execOnce(fn) {
  let used = false;
  return (...args) => {
    if (!used) {
      used = true;
      fn.apply(this, args);
    }
  };
}

/**
 * 获取当前页面的源地址（协议 + 主机名 + 端口）
 * @returns {string} - 源地址，如 'http://localhost:3000'
 */
export function getLocationOrigin() {
  const { protocol, hostname, port } = window.location;
  return `${protocol}//${hostname}${port ? ':' + port : ''}`;
}

/**
 * 获取当前 URL 的路径部分（去除源地址）
 * @returns {string} - 路径部分，如 '/about'
 */
export function getURL() {
  const { href } = window.location;
  const origin = getLocationOrigin();
  return href.substring(origin.length);
}

/**
 * 获取 React 组件的显示名称
 * @param {Function|string} Component - React 组件或字符串
 * @returns {string} - 组件的显示名称
 */
export function getDisplayName(Component) {
  return typeof Component === 'string'
    ? Component
    : Component.displayName || Component.name || 'Unknown';
}

/**
 * 检查 HTTP 响应是否已发送
 * @param {Object} res - HTTP 响应对象
 * @returns {boolean} - 如果响应已发送返回 true
 */
export function isResSent(res) {
  return res.finished || res.headersSent;
}

/**
 * 加载组件的 getInitialProps 方法并返回初始属性
 * @param {Object} Component - React 组件
 * @param {Object} ctx - 上下文对象
 * @returns {Promise<Object>} - 初始属性对象
 */
export async function loadGetInitialProps(Component, ctx) {
  if (process.env.NODE_ENV !== 'production') {
    if (Component.prototype && Component.prototype.getInitialProps) {
      const message = `"${getDisplayName(
        Component
      )}.getInitialProps()" is defined as an instance method - visit https://err.sh/zeit/next.js/get-initial-props-as-an-instance-method for more information.`;
      throw new Error(message);
    }
  }

  const res = ctx.res || (ctx.ctx && ctx.ctx.res);

  if (!Component.getInitialProps) {
    return {};
  }

  const props = await Component.getInitialProps(ctx);

  if (res && isResSent(res)) {
    return props;
  }

  if (!props) {
    const message = `"${getDisplayName(
      Component
    )}.getInitialProps()" should resolve to an object. But found "${props}" instead.`;
    throw new Error(message);
  }

  if (process.env.NODE_ENV !== 'production') {
    if (Object.keys(props).length === 0 && !ctx.ctx) {
      console.warn(
        `${getDisplayName(
          Component
        )} returned an empty object from \`getInitialProps\`. This de-optimizes and prevents automatic static optimization. https://err.sh/zeit/next.js/empty-object-getInitialProps`
      );
    }
  }

  return props;
}

/**
 * 格式化 URL 对象并进行验证
 * @param {Object} url - URL 对象
 * @param {Object} [options] - 格式化选项
 * @returns {string} - 格式化后的 URL 字符串
 */
export function formatWithValidation(url, options) {
  if (process.env.NODE_ENV === 'development') {
    if (url !== null && typeof url === 'object') {
      Object.keys(url).forEach(key => {
        if (urlObjectKeys.indexOf(key) === -1) {
          console.warn(
            `Unknown key passed via urlObject into url.format: ${key}`
          );
        }
      });
    }
  }

  return format(url, options);
}


/*
函数实例
1. execOnce
功能：包装一个函数，确保其只执行一次。
实例：
// 定义一个函数
const logMessage = (msg) => console.log(`Message: ${msg}`);
// 包装为只执行一次
const onceLog = execOnce(logMessage);
// 调用多次
onceLog('Hello'); // 输出: Message: Hello
onceLog('World'); // 无输出
说明：
第一次调用 onceLog('Hello') 执行并输出，used 置为 true。
后续调用（如 onceLog('World')）因 used 为 true 不执行。
常用于初始化逻辑（如只加载一次资源）。

2. getLocationOrigin
功能：获取当前页面的源地址（协议 + 主机名 + 端口）。
实例：
// 假设当前页面 URL 是 http://localhost:3000/about
console.log(getLocationOrigin()); // 输出: http://localhost:3000
说明：
从 window.location 获取 protocol（http:）、hostname（localhost）、port（3000）。
拼接为完整源地址，适用于客户端环境（如浏览器）。
可用于构造相对 URL 或 API 请求。



3. getURL
功能：获取当前 URL 的路径部分（去除源地址）。
实例：
// 假设当前页面 URL 是 http://localhost:3000/about?query=test
console.log(getURL()); // 输出: /about?query=test
说明：从 window.location.href 获取完整 URL，减去 getLocationOrigin() 的部分。
返回路径和查询参数，适用于获取客户端当前路由。



4. getDisplayName
功能：获取 React 组件的显示名称。
实例：
// 定义 React 组件
function MyComponent() {}
MyComponent.displayName = 'CustomComponent';
// 测试不同输入
console.log(getDisplayName(MyComponent)); // 输出: CustomComponent
console.log(getDisplayName('PlainString')); // 输出: PlainString
console.log(getDisplayName({})); // 输出: Unknown
说明：
对于 React 组件，优先返回 displayName，其次是 name，否则返回 Unknown。
对于字符串，直接返回字符串。
常用于调试或日志记录组件名称。



5. isResSent
功能：检查 HTTP 响应是否已发送。
实例：
const http = require('http');
// 创建简单的 HTTP 服务器
const server = http.createServer((req, res) => {
  console.log(isResSent(res)); // 输出: false   false   false   false   false   
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  console.log(isResSent(res)); // 输出: true   true   true   true   true   true  
  res.end('Hello');
});
server.listen(3000);
说明：
在响应头发送前（res.writeHead 前），isResSent 返回 false。
发送响应头后，headersSent 为 true，函数返回 true。
适用于服务端避免重复发送响应。



6. loadGetInitialProps
功能：加载 React 组件的 getInitialProps 方法并返回初始属性。
实例：
// 定义 React 组件
const MyPage = () => {};
MyPage.displayName = 'MyPage';
MyPage.getInitialProps = async (ctx) => ({ title: 'Hello' });
// 模拟上下文
const ctx = { pathname: '/page' };
// 调用
loadGetInitialProps(MyPage, ctx).then(props => {
  console.log(props); // 输出: { title: 'Hello' }
});
说明：
调用 MyPage.getInitialProps 获取初始属性 { title: 'Hello' }。
如果组件无 getInitialProps，返回空对象 {}。
包含开发环境校验（如空对象警告），适用于 Next.js 页面初始化。




7. formatWithValidation
功能：格式化 URL 对象并验证键。
实例：
// 定义 URL 对象
const urlObj = {
  protocol: 'http',
  hostname: 'localhost',
  port: '3000',
  pathname: '/about',
  query: { id: '123' },
};

// 调用
console.log(formatWithValidation(urlObj)); // 输出: http://localhost:3000/about?id=123

// 开发环境下测试无效键
const invalidUrl = { hostname: 'localhost', invalidKey: 'test' };
formatWithValidation(invalidUrl); // 开发环境输出警告: Unknown key passed via urlObject into url.format: invalidKey
说明：
使用 Node.js 的 url.format 将 URL 对象转为字符串。
开发环境下验证 url 对象的键是否在 urlObjectKeys 中，若包含未知键（如 invalidKey）则打印警告。
适用于 Next.js 中格式化 URL。

/****** */