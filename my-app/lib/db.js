const Datastore = require('nedb');

// 硬编码 NeDB 数据库路径
const dbPath = 'H:\\next911new\\my-app\\data\\posts.dat';
let db;

if (typeof window === 'undefined') {
  const fs = require('fs');

  // 确保 data 目录存在
  const dataDir = 'H:\\next911new\\my-app\\data';
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log('Created data directory:', dataDir);
  }

  // 检查文件写入权限
  try {
    fs.accessSync(dataDir, fs.constants.W_OK);
    console.log('Write permission confirmed for:', dataDir);
  } catch (error) {
    console.error('No write permission for data directory:', error);
  }

  // 初始化 NeDB
  console.log('NeDB database path:', dbPath);
  db = new Datastore({
    filename: dbPath,
    autoload: false, // 手动加载
  });

  // 同步加载数据库
  try {
    db.loadDatabase((err) => {
      if (err) {
        console.error('Error loading NeDB:', err);
      } else {
        console.log('NeDB loaded successfully, file:', dbPath);
      }
    });
  } catch (error) {
    console.error('Error accessing database file:', error);
  }
} else {
  db = null;
}






// 确保数据库加载完成
function initDatabase() {
   console.log('[db.js] Initializing NeDB');
   
  if (!db) {
    console.warn('NeDB is not available on client-side');
    return Promise.reject(new Error('NeDB is not available on client-side'));
  }
  return new Promise((resolve, reject) => {
    db.loadDatabase((err) => {
      if (err) {
        console.error('Error loading NeDB:', err);
        reject(err);
      } else {
        console.log('NeDB loaded successfully, file:', dbPath);
        resolve(db);
      }
    });
  });
}









// 插入数据（示例：初始化一些帖子）
async function initializeData() {
  console.log('initializeData called');
  if (!db) {
    console.warn('NeDB is not available on client-side');
    return;
  }
  try {
    const count = await new Promise((resolve, reject) => {
      db.count({}, (err, count) => {
        if (err) {
          console.error('Error counting documents:', err);
          reject(err);
        } else {
          console.log('Database count:', count);
          resolve(count);
        }
      });
    });

    if (count === 0) {
      await new Promise((resolve, reject) => {
        db.insert(
          [
            { title: 'First Post', content: 'This is the first post.', createdAt: new Date() },
            { title: 'Second Post', content: 'This is another post.', createdAt: new Date() },
          ],
          (err, docs) => {
            if (err) {
              console.error('Error inserting initial data:', err);
              reject(err);
            } else {
              console.log('Inserted initial data:', docs);
              resolve(docs);
            }
          }
        );
      });
    }
  } catch (error) {
    console.error('Error initializing data:', error);
  }
}

module.exports = { db, initDatabase, initializeData };