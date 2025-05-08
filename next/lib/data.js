// data.js
import { useContext } from 'react';
import { DataManagerContext } from '../next-server/lib/data-manager-context';
import { RouterContext } from '../next-server/lib/router-context';
import fetch from 'unfetch';
import { stringify } from 'querystring';

/**
 * 生成数据键基于参数数组
 * @param {Array<string|number|Array<string|number>>} args - 参数数组，支持字符串、数字或嵌套数组
 * @returns {string} - 拼接后的键字符串
 */
function generateArgsKey(args) {
  return args.reduce((a, b) => {
    if (Array.isArray(b)) {
      return a + generateArgsKey(b);
    }
    if (typeof b !== 'string' && typeof b !== 'number') {
      throw new Error('参数只能是字符串或数字');
    }
    return a + b.toString();
  }, '');
}

/**
 * 创建数据获取钩子函数
 * @param {Function} fetcher - 数据获取函数，接受参数并返回 Promise
 * @param {Object} options - 配置对象，必须包含 key 属性
 * @param {string} options.key - 数据键前缀
 * @returns {Function} - React 钩子函数，用于获取数据
 */
export function createHook(fetcher, options) {
  if (!options.key) {
    throw new Error('createHook 的 options 未提供 key');
  }

  return function useData(...args) {
    const router = useContext(RouterContext);
    const dataManager = useContext(DataManagerContext);
    const key = `${options.key}${generateArgsKey(args)}`;
    const existing = dataManager.get(key);

    if (existing) {
      if (existing.status === 'resolved') {
        return existing.result;
      }
      if (existing === 'mismatched-key') {
        throw new Error('返回的数据缺少匹配的键，请确保客户端和服务端参数一致');
      }
    }

    // 客户端环境
    if (typeof window !== 'undefined') {
      const res = fetch(`${router.route}?${stringify(router.query)}`)
        .then(res => res.json())
        .then(result => {
          const hasKey = result.some(pair => pair[0] === key);
          if (!hasKey) {
            result = [[key, 'mismatched-key']];
          }
          dataManager.overwrite(result);
        });
      throw res;
    } else {
      // 服务端环境
      const res = fetcher(...args).then(result => {
        dataManager.set(key, {
          status: 'resolved',
          result,
        });
      });
      throw res;
    }
  };
}

/*
数据获取工具模块，设计目的是：
统一数据获取：通过 createHook，为组件提供一致的数据获取接口，抽象客户端和服务端的差异




实现了以下核心功能：
生成数据键：通过 generateArgsKey 函数，将参数数组转换为唯一的字符串键，用于数据缓存。
创建数据钩子：通过 createHook 函数，生成一个 React 自定义钩子（useData），用于在组件中获取数据，支持客户端和服务端环境。
数据缓存管理：利用 DataManagerContext 缓存数据，避免重复请求，提高性能。
环境适配：根据运行环境（客户端或服务端），分别处理数据获取逻辑，客户端通过 fetch 请求，服务端直接调用 fetcher 函数。

典型场景：
用户页面：如 /user/[id]，使用 useData(id) 获取用户数据，服务端通过 fetcher 调用数据库，客户端通过 API 路由（如 /api/user?id=123）获取。
产品列表：如 /products?category=books，根据查询参数加载产品数据，缓存结果以提升性能。


/***** */



/*
函数实例


1. generateArgsKey
功能：根据参数数组生成唯一的键字符串。
实例：
// 测试不同参数
console.log(generateArgsKey(['user', 123])); // 输出: 'user123'
console.log(generateArgsKey([['a', 1], 'b'])); // 输出: 'a1b'
console.log(generateArgsKey([true])); // 抛出错误: 参数只能是字符串或数字
说明：
['user', 123] 拼接为 'user123'。
嵌套数组 [['a', 1], 'b'] 递归处理为 'a1b'。
非字符串/数字参数（如 true）抛出错误。
用于生成数据缓存的唯一键。



2. createHook
功能：创建 React 钩子函数，用于从服务端或客户端获取数据。
实例：
// 定义 fetcher 函数
const fetchUser = async (id) => ({ id, name: `User ${id}` });
// 创建钩子
const useUserData = createHook(fetchUser, { key: 'user_' });
// 模拟 React 组件
function UserComponent() {
  try {
    const data = useUserData(123); // 服务端: 调用 fetchUser(123)
    console.log(data); // 输出: { id: 123, name: 'User 123' }
  } catch (promise) {
    // 客户端: 抛出 fetch Promise
    promise.then(() => console.log('Data fetched'));
  }
  return null;
}

// 模拟 DataManager 和 Router
const dataManager = {
  get: (key) => null, // 模拟缓存 miss
  set: (key, value) => console.log(`Set ${key}:`, value),
  overwrite: (data) => console.log('Overwrite:', data),
};
const router = { route: '/user', query: { id: '123' } };
说明：
创建钩子 useUserData，以 'user_' 为键前缀。
服务端调用 fetchUser(123)，缓存结果 { id: 123, name: 'User 123' }。
客户端发起 fetch 请求，抛出 Promise，待解析后更新缓存。
模拟上下文展示了服务端和客户端的行为差异。


/**** */