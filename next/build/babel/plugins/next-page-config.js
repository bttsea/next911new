const { types: t } = require('@babel/core');

// 标识客户端文件丢弃的变量
const dropBundleIdentifier = '__NEXT_DROP_CLIENT_FILE__';

// 替换整个程序为丢弃标识    replaceBundle 函数是一个 Babel 插件或工具函数，用于在代码转换中替换 AST（抽象语法树）节点，生成一个新的程序结构（const config = ${dropBundleIdentifier} ${Date.now()}）
/**
 * 替换 AST 节点为包含配置变量的程序结构
 * @param {Object} path - Babel AST 路径对象
 * @param {Object} t - Babel 类型工具对象
 * @param {string} dropBundleIdentifier - 要注入的变量标识符
 */
 function replaceBundle(path, t, dropBundleIdentifier) {
  path.parentPath.replaceWith(
    t.program(
      [
        t.variableDeclaration('const', [
          t.variableDeclarator(
            t.identifier('config'),
            t.assignmentExpression(
              '=',
              t.identifier(dropBundleIdentifier),
              t.stringLiteral(`${dropBundleIdentifier} ${Date.now()}`)
            )
          ),
        ]),
      ],
      []
    )
  );
}

// Babel 插件：处理页面配置
module.exports = function nextPageConfig() {
  return {
    visitor: {
      // 遍历程序入口
      Program: {
        enter(path, state) {
          state.bundleDropped = false;
          path.traverse({
            // 处理命名导出
            ExportNamedDeclaration(path) {
              if (state.bundleDropped || !path.node.declaration) {
                return;
              }
              const { declarations } = path.node.declaration;
              if (!declarations) {
                return;
              }
              // 检查 config 导出
              for (const declaration of declarations) {
                if (declaration.id.name !== 'config') {
                  continue;
                }
                if (declaration.init.type !== 'ObjectExpression') {
                  const pageName =
                    (state.filename || '').split(state.cwd || '').pop() || 'unknown';
                  throw new Error(
                    `Invalid page config export. Expected object but got ${declaration.init.type} in file ${pageName}.`
                  );
                }
                // 无需处理特定配置 
                replaceBundle(path);
                state.bundleDropped = true;
                return;
              }
            },
          });
        },
      },
    },
  };
};


/*  改写后仅处理 config 导出，丢弃客户端 bundle，符合 Next.js 9.1.1 的静态生成和 SSR。


原文件是一个 Babel 插件，用于解析页面配置文件（pageConfig）
保留的核心功能：
检查页面文件是否导出 config 对象。
如果导出 config，标记为客户端丢弃文件（__NEXT_DROP_CLIENT_FILE__）。
抛出错误提示无效 config 格式。
/****** */

