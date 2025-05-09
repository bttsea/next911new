// loadable-context.js
const React = require('react');

/**
 * React Context 用于捕获动态加载模块
 * 提供模块名称捕获函数给组件，支持动态导入
 */
const LoadableContext = React.createContext(null);

module.exports = LoadableContext;


/*
功能：创建 React Context（LoadableContext），用于在 React 组件树中共享动态加载模块的捕获函数（CaptureFn），支持 React Loadable 或 next/dynamic 的动态导入（code-splitting）。
用途：在服务端渲染（SSR）或静态生成（SSG）时，捕获动态加载的模块名称（如 import('/components/MyComponent')），确保 Webpack 正确打包这些模块，优化按需加载。



什么时候需要动态导入？
优化首屏加载：大型组件（如图表、编辑器）延迟加载。

按需加载：页面特定或条件组件（如管理员功能）。

SSR 优化：通过 loadable-context.js 捕获模块，确保动态组件正确渲染。

第三方库：按需加载大库（如 antd）。

条件渲染：根据用户角色或状态加载组件。

常见性：
非常常见，尤其在你的 next911new 项目：
SSR 重度依赖（send-html.js, _document.js）。

保留 React Loadable（“鸡肋”功能），动态导入是核心。

大型项目需优化性能（，提到性能优化）。

几乎所有现代 Next.js 项目都会使用（next/dynamic 或 React Loadable）。

你的项目中，动态导入可能常见于 pages/（如 dashboard.jsx）或 components/（如复杂 UI）。

示例：
动态加载 Chart 组件，优化首屏和 SSR。

支持 React Loadable，兼容你的项目。

通过 loadable-context.js 确保 SSR 正确捕获模块。


/**** */