// router-context.js
const React = require('react');

/**
 * React Context 用于共享 NextRouter 实例
 * 提供路由状态和方法给组件
 */
const RouterContext = React.createContext(null);

module.exports = RouterContext;


/*
功能：创建 React Context（RouterContext），用于在 React 组件树中共享 NextRouter 实例，提供路由相关的状态和方法（如 push, replace, pathname）。

确保与 react 和 next/router 兼容，供客户端路由使用。


/***** */