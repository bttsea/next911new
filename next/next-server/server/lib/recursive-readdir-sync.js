// recursive-readdir-sync.js
const fs = require('fs');
const { join } = require('path');

/**
 * 同步递归读取目录
 * @param {string} dir - 要读取的目录路径
 * @param {string[]} [arr=[]] - 存储路径的数组，用于递归（无需手动提供）
 * @param {string} [rootDir=dir] - 根目录，用于计算相对路径
 * @returns {string[]} - 所有文件的相对路径数组
 */
function recursiveReadDirSync(dir, arr = [], rootDir = dir) {
  const result = fs.readdirSync(dir);

  result.forEach(part => {
    const absolutePath = join(dir, part);
    const pathStat = fs.statSync(absolutePath);

    if (pathStat.isDirectory()) {
      recursiveReadDirSync(absolutePath, arr, rootDir);
      return;
    }
    arr.push(absolutePath.replace(rootDir, ''));
  });

  return arr;
}

module.exports = recursiveReadDirSync;


/*
保留了原有的递归读取逻辑：
使用 fs.readdirSync 读取目录，fs.statSync 检查文件类型。
递归处理子目录，将文件路径转换为相对路径。
返回路径数组（arr）。



假设 pages/ 目录：
H:\next911new\my-app\pages\
  index.js
  about.js
recursiveReadDirSync 输出：
['pages/index.js', 'pages/about.js']



/***** */