// 引入 Node.js 的 path 模块，用于处理文件路径
const path = require('path');

// 定义 DropClientPage 插件类，用于移除不必要的客户端页面文件
class DropClientPage {
  // 初始化 ampPages 集合，用于存储 AMP 页面的路径
  constructor() {
    this.ampPages = new Set();
  }

  // 应用插件到 Webpack 编译器
  apply(compiler) {
    // 监听 Webpack 的 emit 钩子，在资源输出前处理
    compiler.hooks.emit.tap('DropClientPage', (compilation) => {
      // 遍历所有构建输出的资源
      Object.keys(compilation.assets).forEach((assetKey) => {
        // 获取当前资源对象
        const asset = compilation.assets[assetKey];

        // 检查资源是否有效且包含特定标记 __NEXT_DROP_CLIENT_FILE__
        if (asset && asset._value && asset._value.includes('__NEXT_DROP_CLIENT_FILE__')) {
          // 将资源路径中的反斜杠替换为正斜杠，规范化路径
          const cleanAssetKey = assetKey.replace(/\\/g, '/');
          // 提取页面路径（假设资源路径形如 pages/xxx.js）
          const page = '/' + cleanAssetKey.split('pages/')[1];
          // 移除文件扩展名，得到页面名称
          const pageNoExt = page.split(path.extname(page))[0];

          // 从构建输出中删除该资源
          delete compilation.assets[assetKey];

          // 避免重复处理子编译器中的页面，仅记录非 .module 文件
          if (!pageNoExt.endsWith('.module')) {
            // 将页面路径添加到 ampPages 集合，移除 /index 后缀
            this.ampPages.add(pageNoExt.replace(/\/index$/, '') || '/');
          }
        }
      });
    });
  }
}

// 导出 DropClientPage 插件类
module.exports = DropClientPage;



/*
DropClientPagePlugin 的核心作用是 在构建过程中移除不必要的客户端 JavaScript 文件



DropClientPagePlugin 是一个 Webpack 插件，设计用于在 Next.js 构建过程中优化客户端页面的输出。它的主要功能是：
移除不必要的  移除不必要的  移除不必要的  移除不必要的  移除不必要的     客户端页面文件：
在 Next.js 的构建过程中，某些页面可能被标记为仅用于服务器端渲染（SSR）或静态生成（SSG），不需要生成对应的客户端 JavaScript 文件。
该插件检查 Webpack 的 compilation.assets（构建输出资源），如果发现资源内容包含特定标记 __NEXT_DROP_CLIENT_FILE__，则从输出中删除该资源。
它通过检查 __NEXT_DROP_CLIENT_FILE__ 标记（通常由 Next.js 内部注入）来识别需要删除的文件。



/**** */
