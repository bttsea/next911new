// api-utils.js
const { IncomingMessage } = require('http');
const send = require('send');
const getRawBody = require('raw-body');
const { parse } = require('content-type');
const { interopDefault } = require('./load-components');

/**
 * 处理 API 路由请求
 * @param {Object} req - HTTP 请求对象（NextApiRequest）
 * @param {Object} res - HTTP 响应对象（NextApiResponse）
 * @param {Object} params - 路由参数
 * @param {Object} resolverModule - API 路由模块
 * @returns {Promise<void>} - 处理完成或错误时的 Promise
 */
async function apiResolver(req, res, params, resolverModule) {
  try {
    let config = {};
    let bodyParser = true;
    if (!resolverModule) {
      res.statusCode = 404;
      res.end('Not Found');
      return;
    }

    if (resolverModule.config) {
      config = resolverModule.config;
      if (config.api && config.api.bodyParser === false) {
        bodyParser = false;
      }
    }

    // 解析 Cookies
    setLazyProp({ req }, 'cookies', getCookieParser(req));
    // 解析 Query
    setLazyProp({ req, params }, 'query', getQueryParser(req));
    // 解析 Body
    if (bodyParser) {
      req.body = await parseBody(
        req,
        config.api && config.api.bodyParser && config.api.bodyParser.sizeLimit
          ? config.api.bodyParser.sizeLimit
          : '1mb'
      );
    }

    res.status = statusCode => sendStatusCode(res, statusCode);
    res.send = data => sendData(res, data);
    res.json = data => sendJson(res, data);

    const resolver = interopDefault(resolverModule);
    resolver(req, res);
  } catch (e) {
    if (e instanceof ApiError) {
      sendError(res, e.statusCode, e.message);
    } else {
      console.error(e);
      sendError(res, 500, 'Internal Server Error');
    }
  }
}

/**
 * 解析请求 Body（如 JSON 或 URL-encoded）
 * @param {Object} req - HTTP 请求对象
 * @param {string|number} limit - Body 大小限制（如 '1mb'）
 * @returns {Promise<Object|string>} - 解析后的 Body
 */
async function parseBody(req, limit) {
  const contentType = parse(req.headers['content-type'] || 'text/plain');
  const { type, parameters } = contentType;
  const encoding = parameters.charset || 'utf-8';

  let buffer;
  try {
    buffer = await getRawBody(req, { encoding, limit });
  } catch (e) {
    if (e.type === 'entity.too.large') {
      throw new ApiError(413, `Body exceeded ${limit} limit`);
    } else {
      throw new ApiError(400, 'Invalid body');
    }
  }

  const body = buffer.toString();

  if (type === 'application/json' || type === 'application/ld+json') {
    return parseJson(body);
  } else if (type === 'application/x-www-form-urlencoded') {
    const qs = require('querystring');
    return qs.decode(body);
  } else {
    return body;
  }
}

/**
 * 解析 JSON 字符串，处理无效 JSON
 * @param {string} str - JSON 字符串
 * @returns {Object} - 解析后的对象
 * @throws {ApiError} - 如果 JSON 无效，抛出 400 错误
 */
function parseJson(str) {
  try {
    return JSON.parse(str);
  } catch (e) {
    throw new ApiError(400, 'Invalid JSON');
  }
}

/**
 * 解析请求 URL 的查询参数
 * @param {Object} req - HTTP 请求对象
 * @returns {Function} - 返回解析函数
 */
function getQueryParser({ url }) {
  return function parseQuery() {
    const { URL } = require('url');
    const params = new URL(url, 'https://n').searchParams;

    const query = {};
    for (const [key, value] of params) {
      query[key] = value;
    }

    return query;
  };
}

/**
 * 解析请求头中的 Cookies
 * @param {Object} req - HTTP 请求对象
 * @returns {Function} - 返回解析函数
 */
function getCookieParser(req) {
  return function parseCookie() {
    const header = req.headers.cookie;

    if (!header) {
      return {};
    }

    const { parse } = require('cookie');
    return parse(Array.isArray(header) ? header.join(';') : header);
  };
}

/**
 * 设置响应状态码
 * @param {Object} res - HTTP 响应对象
 * @param {number} statusCode - HTTP 状态码
 * @returns {Object} - 响应对象
 */
function sendStatusCode(res, statusCode) {
  res.statusCode = statusCode;
  return res;
}

/**
 * 发送任意类型的数据到响应
 * @param {Object} res - HTTP 响应对象
 * @param {any} body - 响应数据
 */
function sendData(res, body) {
  if (body === null) {
    res.end();
    return;
  }

  const contentType = res.getHeader('Content-Type');

  if (Buffer.isBuffer(body)) {
    if (!contentType) {
      res.setHeader('Content-Type', 'application/octet-stream');
    }
    res.setHeader('Content-Length', body.length);
    res.end(body);
    return;
  }

  if (body instanceof require('stream').Stream) {
    if (!contentType) {
      res.setHeader('Content-Type', 'application/octet-stream');
    }
    body.pipe(res);
    return;
  }

  let str = body;

  if (typeof body === 'object' || typeof body === 'number') {
    str = JSON.stringify(body);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
  }

  res.setHeader('Content-Length', Buffer.byteLength(str));
  res.end(str);
}

/**
 * 发送 JSON 数据
 * @param {Object} res - HTTP 响应对象
 * @param {any} jsonBody - JSON 数据
 */
function sendJson(res, jsonBody) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  sendData(res, jsonBody);
}

/**
 * 自定义 API 错误类
 * @param {number} statusCode - HTTP 状态码
 * @param {string} message - 错误消息
 */
class ApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

/**
 * 发送错误响应
 * @param {Object} res - HTTP 响应对象
 * @param {number} statusCode - HTTP 状态码
 * @param {string} message - 错误消息
 */
function sendError(res, statusCode, message) {
  res.statusCode = statusCode;
  res.statusMessage = message;
  res.end(message);
}

/**
 * 延迟设置请求对象的属性
 * @param {Object} props - 包含 req 和 params 的对象
 * @param {string} prop - 属性名称
 * @param {Function} getter - 获取属性值的函数
 */
function setLazyProp({ req, params }, prop, getter) {
  const opts = { configurable: true, enumerable: true };
  const optsReset = { ...opts, writable: true };

  Object.defineProperty(req, prop, {
    ...opts,
    get: () => {
      let value = getter();
      if (params && typeof params !== 'boolean') {
        value = { ...value, ...params };
      }
      Object.defineProperty(req, prop, { ...optsReset, value });
      return value;
    },
    set: value => {
      Object.defineProperty(req, prop, { ...optsReset, value });
    },
  });
}

module.exports = {
  apiResolver,
  parseBody,
  parseJson,
  getQueryParser,
  getCookieParser,
  sendStatusCode,
  sendData,
  sendJson,
  ApiError,
  sendError,
  setLazyProp,
};


/*
详细功能
api-utils.ts 提供以下功能：
API 请求处理：
apiResolver: 主函数，解析 API 请求，执行 API 路由模块（resolverModule），处理配置（如 bodyParser）、Cookies、Query 和 Body。
示例：处理 /api/users/123，解析参数，调用 pages/api/users/[id].js。

请求解析：
parseBody: 解析请求 Body，支持 JSON 和 URL-encoded 格式，处理大小限制（默认 1MB）。
getQueryParser: 解析 URL 查询参数，返回键值对（如 { id: '123' }）。
getCookieParser: 解析请求头中的 Cookies，返回键值对（如 { session: 'abc' }）。

响应处理：
sendStatusCode: 设置响应状态码。
sendData: 发送任意类型的数据（Buffer、Stream、JSON、字符串）。
sendJson: 发送 JSON 数据，自动设置 Content-Type。
sendError: 发送错误响应，设置状态码和消息。

错误处理：
ApiError: 自定义错误类，包含状态码和消息。
示例：throw new ApiError(400, 'Invalid JSON') 返回 400 错误。

延迟属性设置：
setLazyProp: 使用 Object.defineProperty 延迟计算属性（如 req.cookies, req.query），提高性能。
示例：req.cookies 仅在访问时解析。




/**** */