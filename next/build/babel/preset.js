// preset.js
const env = process.env.NODE_ENV;
const isProduction = env === 'production';
const isDevelopment = env === 'development';
const isTest = env === 'test';

/**
 * 解析 styled-jsx 插件配置
 * @param {Object|undefined} options - styled-jsx 的 Babel 配置
 * @returns {Object} - 解析后的配置
 */
function styledJsxOptions(options) {
  if (!options) {
    return {};
  }

  if (!Array.isArray(options.plugins)) {
    return options;
  }

  options.plugins = options.plugins.map(plugin => {
    if (Array.isArray(plugin)) {
      const [name, opts] = plugin;
      return [require.resolve(name), opts];
    }
    return require.resolve(plugin);
  });

  return options;
}

/**
 * 检查调用者是否支持静态 ESM
 * @param {Object} caller - Babel 调用者对象
 * @returns {boolean} - 如果支持静态 ESM 返回 true
 */
function supportsStaticESM(caller) {
  return !!(caller && caller.supportsStaticESM);
}

/**
 * Next.js 的 Babel 预设配置
 * @param {Object} api - Babel API 对象
 * @param {Object} [options={}] - 配置选项
 * @returns {Object} - Babel 预设配置
 */
module.exports = (api, options = {}) => {
  const supportsESM = api.caller(supportsStaticESM);
  const isServer = api.caller(caller => !!caller && caller.isServer);
  const isModern = api.caller(caller => !!caller && caller.isModern);
  const isLaxModern =
    isModern ||
    (options['preset-env'] &&
      options['preset-env'].targets &&
      options['preset-env'].targets.esmodules === true);

  // 配置 @babel/preset-env
  const presetEnvConfig = {
    modules: 'auto', // 自动选择模块格式，支持 Webpack 树摇
    exclude: ['transform-typeof-symbol'], // 排除 typeof-symbol 转换
    ...options['preset-env'],
  };

  // 服务端或测试环境默认目标为当前 Node 版本
  if (
    (isServer || isTest) &&
    (!presetEnvConfig.targets ||
      !(typeof presetEnvConfig.targets === 'object' && 'node' in presetEnvConfig.targets))
  ) {
    presetEnvConfig.targets = {
      node: 'current', // 针对当前 Node 版本
    };
  }

  // 是否使用自定义现代预设
  const customModernPreset =
    isLaxModern && options['experimental-modern-preset'];

  return {
    sourceType: 'unambiguous', // 自动检测脚本或模块类型
    presets: [
      customModernPreset || [
        require('@babel/preset-env').default,
        presetEnvConfig,
      ],
      [
        require('@babel/preset-react'),
        {
          development: isDevelopment || isTest, // 开发/测试环境下启用 JSX 调试插件
          pragma: '__jsx', // JSX 转换函数
          ...options['preset-react'],
        },
      ],
      require('@babel/preset-typescript'), // 支持 TypeScript
    ],
    plugins: [
      [
        require('./plugins/jsx-pragma'),
        {
          // 注入 React.createElement 逻辑
          module: 'react',
          importAs: 'React',
          pragma: '__jsx',
          property: 'createElement',
        },
      ],
      [
        require('./plugins/optimize-hook-destructuring'),
        {
          lib: true, // 优化 React/Preact 的钩子解构
        },
      ],
      require('@babel/plugin-syntax-dynamic-import'), // 支持动态导入
      require('./plugins/react-loadable-plugin'), // 支持 React Loadable
      [
        require('@babel/plugin-proposal-class-properties'),  ///=== 支持类属性（如 class MyClass { state = {} }）
        options['class-properties'] || {},
      ],
      [
        require('@babel/plugin-proposal-object-rest-spread'), ///=== 支持对象扩展运算符（{ ...obj }）
        {
          useBuiltIns: true, // 使用内置对象扩展运算符
        },
      ],
      [
        require('@babel/plugin-transform-runtime'),
        {
          corejs: 2, // 使用 core-js@2 提供 polyfill
          helpers: true, // 使用 Babel 辅助函数
          regenerator: true, // 支持生成器/异步函数
          useESModules: supportsESM && presetEnvConfig.modules !== 'commonjs',
          absoluteRuntime: process.versions.pnp ? __dirname : undefined,
          ...options['transform-runtime'],
        },
      ],
      [
        isTest && options['styled-jsx'] && options['styled-jsx']['babel-test']
          ? require('styled-jsx/babel-test')
          : require('styled-jsx/babel'),
        styledJsxOptions(options['styled-jsx']), // 处理 styled-jsx 样式
      ],
      isProduction && [
        require('babel-plugin-transform-react-remove-prop-types'),
        {
          removeImport: true, // 生产环境移除 prop-types
        },
      ],
    ].filter(Boolean), // 过滤空插件
  };
};

/*
preset.js 是 Next.js 9.1.1 的 Babel 预设配置文件，定义了 JavaScript/JSX/TypeScript 代码的编译规则，核心功能包括：
环境配置：根据运行环境（开发、生产、测试）和目标（浏览器、Node.js）配置 @babel/preset-env。

React 和 JSX：使用 @babel/preset-react 和自定义 JSX 转换（__jsx），支持 React 组件开发。

TypeScript 支持：通过 @babel/preset-typescript 处理 TypeScript 代码（，提到 TypeScript 集成）。

插件集成：
优化 React 钩子解构（optimize-hook-destructuring）。

支持动态导入、类属性、对象扩展运算符等现代 JavaScript 特性。

处理 styled-jsx 样式（，提到 styled-jsx 支持）。

生产环境移除 prop-types 优化性能。

与 store.js 和 log.js 的关联：preset.js 确保代码在编译时正确转换（如 JSX 到 JavaScript），而 store.js 和 log.js 处理编译后的状态输出（如错误、警告），共同支持开发服务器的 CLI 反馈。


/******* */