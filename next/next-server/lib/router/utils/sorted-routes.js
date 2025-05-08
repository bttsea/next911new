// UrlNode 类用于构建 URL 路由的树状结构，处理动态路由的排序和冲突检查
class UrlNode {
  constructor() {
    // placeholder 表示该节点是否是中间占位（非最终页面）
    this.placeholder = true;

    // children 是当前路径下的子路径（如 'blog' -> UrlNode）
    this.children = new Map();

    // slugName 是动态路由的名称，如路径是 [id]，则 slugName = 'id'
    this.slugName = null;
  }

  // 判断该节点是否是动态路由（有 [xxx]）
  hasSlug() {
    return this.slugName !== null;
  }

  // 插入一个路径（如 '/blog/[id]'），会拆成数组插入树结构
  insert(urlPath) {
    const parts = urlPath.split('/').filter(Boolean);
    this._insert(parts);
  }

  // 将整个树“压缩”为有序的路径数组，代表最终路由排序
  smoosh() {
    return this._smoosh();
  }

  // 内部递归函数，将树压缩为排序后的路由路径数组
  _smoosh(prefix = '/') {
    // 获取所有子路径并排序（静态路径优先）
    const childrenPaths = [...this.children.keys()].sort();

    // 如果有动态路由（[]），将其先移除，稍后手动插入排序靠后
    if (this.hasSlug()) {
      childrenPaths.splice(childrenPaths.indexOf('[]'), 1);
    }

    // 递归处理所有子路径，形成完整的路由路径
    const routes = childrenPaths
      .map((child) => this.children.get(child)._smoosh(`${prefix}${child}/`))
      .reduce((prev, curr) => [...prev, ...curr], []);

    // 如果有动态路径 [xxx]，在最后插入动态子路径的结果
    if (this.hasSlug()) {
      routes.push(
        ...this.children.get('[]')._smoosh(`${prefix}[${this.slugName}]/`)
      );
    }

    // 如果不是中间节点，则将当前路径加入最终结果
    if (!this.placeholder) {
      routes.unshift(prefix === '/' ? '/' : prefix.slice(0, -1));
    }

    return routes;
  }

  // 插入路径（按层级递归拆分，并记录动态段）
  _insert(urlPaths, slugNames = []) {
    if (urlPaths.length === 0) {
      this.placeholder = false; // 表示这是一个实际存在的页面路径
      return;
    }

    let nextSegment = urlPaths[0];

    // 检查是否是动态段，例如 [id]
    if (nextSegment.startsWith('[') && nextSegment.endsWith(']')) {
      const slugName = nextSegment.slice(1, -1);

      // 不允许在同一层级下使用不同的 slug 名称，例如 [id] 和 [post]
      if (this.hasSlug() && slugName !== this.slugName) {
        throw new Error(
          'You cannot use different slug names for the same dynamic path.'
        );
      }

      // 同一路径中不允许重复使用相同的 slug
      if (slugNames.includes(slugName)) {
        throw new Error(
          `You cannot have the same slug name "${slugName}" repeat within a single dynamic path`
        );
      }

      slugNames.push(slugName);
      this.slugName = slugName;

      // 动态段统一重命名为 []，以便排序时统一处理
      nextSegment = '[]';
    }

    // 如果当前节点还没有子节点 nextSegment，则创建新节点
    if (!this.children.has(nextSegment)) {
      this.children.set(nextSegment, new UrlNode());
    }

    // 递归插入剩余路径
    this.children.get(nextSegment)._insert(urlPaths.slice(1), slugNames);
  }
}

// 主导出函数：对传入的页面路径数组进行排序，返回正确的路由顺序
function getSortedRoutes(normalizedPages) {

  console.log('------20250504-----come to -----getSortedRoutes------------ ----------' + normalizedPages);


  const root = new UrlNode();

  // 将所有路径逐个插入树结构中
  normalizedPages.forEach((pagePath) => {
    root.insert(pagePath);
  });

  // 将树结构压缩为有序路径数组（考虑动态路径优先级）
  return root.smoosh();
}

// 导出函数供外部使用
module.exports = {
  getSortedRoutes,
};






/*
核心功能总结：
📂 树结构：用 UrlNode 建立路由树，每层是 URL 的一个 segment。
🔀 动态路由排序：动态路由（如 [id]）被统一标记为 '[]' 并排在静态路由后面。
❌ 冲突检测：
不允许同层路径使用不同的动态参数名（如 [id] 和 [post]）；
不允许同路径内重复 slug（如 /[id]/[id]）；
✅ 最终输出：确保路由文件加载顺序正确（Next.js 内部依赖此排序逻辑）。

示例：对页面路径进行排序
const { getSortedRoutes } = require('./sorted-routes');

// 模拟一些 Next.js 页面路径
const pages = [
  '/about',
  '/blog/[slug]',
  '/blog/index',
  '/blog/[slug]/comments',
  '/blog/[slug]/[commentId]',
  '/contact',
  '/',
];

// 执行排序
const sorted = getSortedRoutes(pages);

// 输出排序后的路径
console.log('排序后的路径:');
console.log(sorted);
🧾 输出结果（类似于）：
排序后的路径:
[
  '/',
  '/about',
  '/blog/index',
  '/blog/[slug]',
  '/blog/[slug]/comments',
  '/blog/[slug]/[commentId]',
  '/contact'
]

/***** */