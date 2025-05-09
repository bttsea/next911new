// 引入 Webpack 模块
const webpack = require('webpack');

// 定义 ChunkNamesPlugin 类，用于设置 Webpack chunk 文件名
class ChunkNamesPlugin {
  // 应用插件到 Webpack 编译器
  apply(compiler) {
    // 监听 compilation 事件，处理编译过程
    compiler.hooks.compilation.tap('NextJsChunkNamesPlugin', (compilation) => {
      // 拦截 chunkTemplate 的 renderManifest 钩子，修改文件名逻辑
      compilation.chunkTemplate.hooks.renderManifest.intercept({
        // 注册拦截器
        register(tapInfo) {
          // 仅处理 JavascriptModulesPlugin 的逻辑
          if (tapInfo.name === 'JavascriptModulesPlugin') {
            const originalMethod = tapInfo.fn;
            // 重写 JavascriptModulesPlugin 的 renderManifest 方法
            tapInfo.fn = (result, options) => {
              let filenameTemplate;
              const chunk = options.chunk;
              const outputOptions = options.outputOptions;

              // 确定 chunk 的文件名模板
              if (chunk.filenameTemplate) {
                // 使用 chunk 自身的 filenameTemplate
                filenameTemplate = chunk.filenameTemplate;
              } else if (chunk.hasEntryModule()) {
                // 如果是入口模块，使用 outputOptions.filename
                filenameTemplate = outputOptions.filename;
              } else {
                // 否则使用 outputOptions.chunkFilename
                filenameTemplate = outputOptions.chunkFilename;
              }

              // 将文件名模板应用到 options.chunk
              options.chunk.filenameTemplate = filenameTemplate;
              // 调用原始方法，继续处理
              return originalMethod(result, options);
            };
          }
          return tapInfo;
        },
      });
    });
  }
}

// 导出 ChunkNamesPlugin 类
module.exports = ChunkNamesPlugin;


/*
ChunkNamesPlugin 是 Next.js 源码中的一个 Webpack 插件，它的主要作用是：
为每个 Webpack chunk（代码块）命名，使构建后的输出更有意义、更可调试。


Webpack 将应用分割成多个 chunk，例如：
pages/index.js → index.js chunk
pages/about.js → about.js chunk
如果没有如果没有如果没有如果没有如果没有如果没有如果没有如果没有 chunk 命名，这些文件可能被 Webpack 命名为：
0.js, 1.js, 2.js ...
很难知道哪个文件对应哪个页面。











文件导出一个类（如 class ChunkNamesPlugin），可以作为构造函数使用（new ChunkNamesPlugin()）。

如果导出的是函数或其他类型（例如 module.exports = {}），会导致 ChunkNamesPlugin is not a constructor。

修复导出
如果文件未正确导出一个类，尝试修复：
检查导出：
如果文件导出了错误内容（如 module.exports = { ChunkNamesPlugin }），改为：
javascript

module.exports = ChunkNamesPlugin;
/****** */

