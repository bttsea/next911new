const express = require('express');
const next = require('next');
const { initDatabase } = require('./lib/db');

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare()
  .then(async () => {
    const server = express();

    // 解析 JSON 请求体（必须在所有 API 路由前调用） !!!!!!!!会“消费”请求体，导致 Next.js 的 API 路由拿不到原始 body。
    ////server.use(express.json());

    // 初始化 NeDB
    try {
      console.log('Calling initDatabase');
      await initDatabase();
      console.log('NeDB initialized successfully');
    } catch (error) {
      console.error('Error initializing NeDB:', error);
    }

    // ✅ 显式交给 Next.js 处理 /api/* 路由（必须）
    server.all('/api/*', (req, res) => {
      console.log('[server.js] API route hit:', req.method, req.url, req.body);
      return handle(req, res);
    });

    // 你自己的自定义 Express 路由（示例）
    // server.get('/api/custom', (req, res) => {
    //   res.json({ message: 'This is a custom Express route!' });
    // });

    // ✅ 自定义 Express 路由（但避免 /api 前缀）
    server.get('/hello', (req, res) => {
      res.send('Hello from Express!');
    });

    // 其余所有页面和资源交由 Next.js 处理    // ✅ 不处理 /api/*，交由 Next.js 原生 handler 处理
    server.all('*', (req, res) => {
      ///=== !!! console.log('[server.js] Forwarding to Next.js handler:', req.method, req.url);
      return handle(req, res);
    });

    server.listen(3000, (err) => {
      if (err) throw err;
      console.log('> Ready on http://localhost:3000');
    });
  })
  .catch((error) => {
    console.error('Error preparing Next.js app:', error);
    process.exit(1);
  });










/*
  const { createServer } = require('http');
const next = require('next');

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    console.log('[server.js] Incoming request:', req.method, req.url);
    handle(req, res);
  });

  server.listen(3000, (err) => {
    if (err) throw err;
    console.log('> Ready on http://localhost:3000');
  });
}).catch((err) => {
  console.error('Error preparing Next.js app:', err);
  process.exit(1);
});
/**** */
