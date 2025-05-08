// store.js
import createStore from 'next/dist/compiled/unistore';
import stripAnsi from 'strip-ansi';
import * as Log from './log';

// 创建全局状态存储，管理开发服务器状态  统一管理开发服务器的状态（如编译进度、错误、警告），便于动态更新终端输出。
const store = createStore({ appUrl: null, bootstrap: true });

let lastStore = {};

/**
 * 检查状态是否发生变化
 * @param {Object} nextStore - 新状态对象
 * @returns {boolean} - 如果状态变化返回 true，否则返回 false
 */
function hasStoreChanged(nextStore) {  ///=== 优化性能，避免因不变的状态重复打印日志，提升终端输出清晰度。
  const keys = [...new Set([...Object.keys(lastStore), ...Object.keys(nextStore)])];
  if (keys.every(key => Object.is(lastStore[key], nextStore[key]))) {
    return false;
  }
  lastStore = nextStore;
  return true;
}

/**
 * 订阅状态变化并打印日志
 * @param {Object} state - 当前状态
 */
store.subscribe(state => {
  if (!hasStoreChanged(state)) {
    return;
  }

  // 启动状态
  if (state.bootstrap) {
    Log.wait('启动开发服务器 ...');
    if (state.appUrl) {
      Log.info(`正在监听 ${state.appUrl} ...`);
    }
    return;
  }

  // 编译中状态
  if (state.loading) {
    Log.wait('正在编译 ...');
    return;
  }

  // 错误状态
  if (state.errors) {
    Log.error(state.errors[0]);
    const cleanError = stripAnsi(state.errors[0]);
    if (cleanError.includes('SyntaxError')) {
      // 通用语法错误处理，提示检查代码
      Log.info('请检查代码中的语法错误，可能涉及无效的 JavaScript 语法');
    }
    return;
  }

  // 警告状态
  if (state.warnings) {
    Log.warn(state.warnings.join('\n\n'));
    if (state.appUrl) {
      Log.info(`已准备好，监听于 ${state.appUrl}`);
    }
    return;
  }

  // 类型检查状态
  if (state.typeChecking) {
    Log.info('打包完成，等待类型检查结果 ...');
    return;
  }

  // 编译成功状态
  Log.ready(
    '编译成功' + (state.appUrl ? ` - 监听于 ${state.appUrl}` : '')
  );
});


/*
store.js 是 Next.js 9.1.1 开发服务器的输出管理模块，主要功能包括：
状态存储：使用 unistore 管理开发服务器状态（如启动、编译、错误、警告、类型检查）。

状态变化检测：通过 hasStoreChanged 确保只在状态变化时更新日志，避免重复输出。

日志输出：根据状态类型调用 Log 模块，打印格式化的终端消息（如“正在编译 ...”或“编译成功”）。

开发体验：与 Webpack 编译和 HMR 集成，提供实时反馈，优化 CLI 输出。


/***** */