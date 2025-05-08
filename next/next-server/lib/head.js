import React, { Component } from 'react';

// 创建 HeadManagerContext，用于管理 <head> 元素的更新
export const HeadManagerContext = React.createContext(null);

// 判断是否为服务端环境
const isServer = typeof window === 'undefined';

// 默认的 <head> 内容，包含基本的 meta 标签
function defaultHead() {
  return [
    <meta key="charSet" charSet="utf-8" />,
    <meta
      key="viewport"
      name="viewport"
      content="width=device-width,minimum-scale=1,initial-scale=1"
    />,
  ];
}

// 过滤非 React 元素（例如字符串或数字），仅保留 React 元素
function onlyReactElement(list, child) {
  // 忽略字符串或数字类型的子节点
  if (typeof child === 'string' || typeof child === 'number') {
    return list;
  }
  // 支持 React.Fragment，展开其子节点
  if (child.type === React.Fragment) {
    return list.concat(
      React.Children.toArray(child.props.children).reduce(
        (fragmentList, fragmentChild) => {
          if (
            typeof fragmentChild === 'string' ||
            typeof fragmentChild === 'number'
          ) {
            return fragmentList;
          }
          return fragmentList.concat(fragmentChild);
        },
        []
      )
    );
  }
  return list.concat(child);
}

// 定义 meta 标签的类型属性
const METATYPES = ['name', 'httpEquiv', 'charSet', 'itemProp'];

// 创建一个过滤函数，用于去重 <head> 中的元素（如 <title>、<meta> 等）
function unique() {
  const keys = new Set(); // 存储唯一的 key
  const tags = new Set(); // 存储唯一的标签类型（如 title、base）
  const metaTypes = new Set(); // 存储唯一的 meta 类型
  const metaCategories = {}; // 存储 meta 类型的分类

  return (h) => {
    // 处理带有 key 属性的元素，防止重复
    if (h.key && typeof h.key !== 'number' && h.key.indexOf('.$') === 0) {
      if (keys.has(h.key)) return false;
      keys.add(h.key);
      return true;
    }

    // 根据元素类型进行去重
    switch (h.type) {
      case 'title':
      case 'base':
        if (tags.has(h.type)) return false;
        tags.add(h.type);
        break;
      case 'meta':
        for (let i = 0, len = METATYPES.length; i < len; i++) {
          const metatype = METATYPES[i];
          if (!h.props.hasOwnProperty(metatype)) continue;

          if (metatype === 'charSet') {
            if (metaTypes.has(metatype)) return false;
            metaTypes.add(metatype);
          } else {
            const category = h.props[metatype];
            const categories = metaCategories[metatype] || new Set();
            if (categories.has(category)) return false;
            categories.add(category);
            metaCategories[metatype] = categories;
          }
        }
        break;
    }
    return true;
  };
}

// 将多个 <Head> 组件的子节点合并、处理并去重
function reduceComponents(headElements) {
  return headElements
    .reduce((list, headElement) => {
      const headElementChildren = React.Children.toArray(
        headElement.props.children
      );
      return list.concat(headElementChildren);
    }, [])
    .reduce(onlyReactElement, [])
    .reverse() // 反转顺序，优先渲染子组件内容
    .concat(defaultHead()) // 添加默认的 head 内容
    .filter(unique()) // 去重
    .reverse() // 再次反转，恢复正确顺序
    .map((c, i) => {
      const key = c.key || i; // 为每个元素分配 key
      return React.cloneElement(c, { key });
    });
}





// 创建副作用组件，用于管理 <Head> 组件的状态和更新
function withSideEffect() {
  const mountedInstances = new Set(); // 存储已挂载的组件实例
  let state; // 存储当前的 <head> 元素状态

  // 触发状态变更并通知 handleStateChange
  function emitChange(component) {
    state = component.props.reduceComponentsToState(
      [...mountedInstances],
      component.props
    );
    if (component.props.handleStateChange) {
      component.props.handleStateChange(state);
    }
  }

  return class SideEffect extends Component {
    // 用于服务端渲染，重置状态并返回记录的状态
    static rewind() {
      const recordedState = state;
      state = undefined;
      mountedInstances.clear();
      return recordedState;
    }

    constructor(props) {
      super(props);
      if (isServer) {
        mountedInstances.add(this);
        emitChange(this);
      }
    }

    componentDidMount() {
      mountedInstances.add(this);
      emitChange(this);
    }

    componentDidUpdate() {
      emitChange(this);
    }

    componentWillUnmount() {
      mountedInstances.delete(this);
      emitChange(this);
    }

    render() {
      return null;
    }
  };
}

// Head 组件，用于向页面 <head> 注入元素
// 使用 key 属性可以避免重复渲染标签
function Head({ children }) {
  const Effect = withSideEffect(); // 创建副作用组件
  return (
    <HeadManagerContext.Consumer>
      {(updateHead) => (
        <Effect
          reduceComponentsToState={reduceComponents}
          handleStateChange={updateHead}
        >
          {children}
        </Effect>
      )}
    </HeadManagerContext.Consumer>
  );
}

// 提供 rewind 方法，用于服务端渲染时重置状态
Head.rewind = withSideEffect().rewind;

export default Head;