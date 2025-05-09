// error-debug.js
const React = require('react');
const Head = require('../next-server/lib/head');

/**
 * 错误调试组件，仅在服务器端渲染
 * @param {Object} props - 组件属性
 * @param {Error} props.error - 错误对象
 * @param {any} props.info - 错误信息（如组件堆栈）
 * @returns {React.Element} - 错误叠加层元素
 */
function ErrorDebug({ error, info }) {
  return React.createElement(
    'div',
    { style: styles.errorDebug },
    React.createElement(Head, null, React.createElement('meta', {
      name: 'viewport',
      content: 'width=device-width, initial-scale=1.0',
    })),
    React.createElement(StackTrace, { error, info })
  );
}

/**
 * 堆栈跟踪组件，显示错误详情
 * @param {Object} props - 组件属性
 * @param {Error} props.error - 错误对象（包含 name, message, stack）
 * @param {any} props.info - 错误信息（如组件堆栈）
 * @returns {React.Element} - 堆栈信息元素
 */
function StackTrace({ error: { name, message, stack }, info }) {
  return React.createElement(
    'div',
    null,
    React.createElement('div', { style: styles.heading }, message || name),
    React.createElement('pre', { style: styles.stack }, stack),
    info && React.createElement('pre', { style: styles.stack }, info.componentStack)
  );
}

/**
 * 错误叠加层样式
 */
const styles = {
  errorDebug: {
    background: '#ffffff',
    boxSizing: 'border-box',
    overflow: 'auto',
    padding: '24px',
    position: 'fixed',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 9999,
    color: '#000000',
  },
  stack: {
    fontFamily:
      '"SF Mono", "Roboto Mono", "Fira Mono", consolas, menlo-regular, monospace',
    fontSize: '13px',
    lineHeight: '18px',
    color: '#777',
    margin: 0,
    whiteSpace: 'pre-wrap',
    wordWrap: 'break-word',
    marginTop: '16px',
  },
  heading: {
    fontFamily:
      '-apple-system, system-ui, BlinkMacSystemFont, Roboto, "Segoe UI", "Fira Sans", Avenir, "Helvetica Neue", "Lucida Grande", sans-serif',
    fontSize: '20px',
    fontWeight: '400',
    lineHeight: '28px',
    color: '#000000',
    marginBottom: '0px',
    marginTop: '0px',
  },
};

module.exports = ErrorDebug;
module.exports.styles = styles;


/*
错误信息展示：
渲染全屏错误叠加层，显示错误（error）的名称（name）、消息（message）、堆栈跟踪（stack）以及组件堆栈（info.componentStack）。

示例：运行时错误 ReferenceError: x is not defined 显示详细堆栈。




Next.js 9.1.1 默认使用 Babel 处理 JSX（通过 @babel/preset-react），将 JSX 转换为 React.createElement。
示例：<div style={styles.errorDebug}> 转译为 React.createElement('div', { style: styles.errorDebug }, ...).

/***** */
