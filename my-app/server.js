const express = require('express');
const next = require('next');
const { initDatabase } = require('./lib/db');

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(async () => {
  const server = express();

  // 初始化 NeDB
  try {
    console.log('Calling initDatabase');
    await initDatabase();
    console.log('NeDB initialized successfully');
  } catch (error) {
    console.error('Error initializing NeDB:', error);
  }

  // 解析 JSON 请求体
  server.use(express.json());

  // 自定义 Express 路由
  server.get('/api/custom', (req, res) => {
    res.json({ message: 'This is a custom Express route!' });
  });

  // 处理 Next.js 请求
  server.all('*', (req, res) => {
    return handle(req, res);
  });

  server.listen(3000, (err) => {
    if (err) throw err;
    console.log('> Ready on http://localhost:3000');
  });
}).catch((error) => {
  console.error('Error preparing Next.js app:', error);
  process.exit(1);
});