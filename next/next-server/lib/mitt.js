// mitt.js
/*
MIT License

Copyright (c) Jason Miller (https://jasonformat.com/)

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

// 基于 https://github.com/developit/mitt/blob/v1.1.3/src/index.js 修改
// 为 Next.js 服务端需求定制，保留核心事件发射功能

/**
 * 创建一个事件发射器，用于发布-订阅模式
 * @returns {Object} - 包含 on, off, emit 方法的事件发射器
 */
 function mitt() {
  // 存储事件类型到处理函数数组的映射
  const all = Object.create(null);

  return {
    /**
     * 订阅指定类型的事件
     * @param {string} type - 事件类型
     * @param {Function} handler - 处理函数
     */
    on(type, handler) {
      (all[type] || (all[type] = [])).push(handler);
    },

    /**
     * 取消订阅指定类型的事件
     * @param {string} type - 事件类型
     * @param {Function} handler - 要移除的处理函数
     */
    off(type, handler) {
      if (all[type]) {
        all[type].splice(all[type].indexOf(handler) >>> 0, 1);
      }
    },

    /**
     * 触发指定类型的事件
     * @param {string} type - 事件类型
     * @param {...any} evts - 传递给处理函数的参数
     */
    emit(type, ...evts) {
      (all[type] || []).slice().map(handler => {
        handler(...evts);
      });
    },
  };
}

module.exports = mitt; // CommonJS 导出

/*功能概述
mitt.js 是一个轻量的事件发射器，提供发布-订阅模式，核心功能包括：
事件订阅：通过 on 注册处理函数，支持多种事件类型。

事件取消：通过 off 移除特定处理函数。

事件触发：通过 emit 调用所有相关处理函数，传递参数。

服务端用途：在 next-server 中协调模块间通信，如处理 Webpack 编译、HMR 或请求状态。

与 store.js, log.js 的关联：
mitt.js 可能触发编译事件（如 build:done），由 store.js 的 subscribe 捕获，调用 log.js 输出：

[READY] 编译成功 - 监听于 http://localhost:3000

示例：mitt.emit('build:error', 'SyntaxError') 触发 store.js 的 Log.error。

/**** */