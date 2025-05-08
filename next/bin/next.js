#!/usr/bin/env node

// 导入 arg 库用于命令行参数解析
const arg = require('next/dist/compiled/arg/index.js')

// 检查是否已安装必要的依赖 react 和 react-dom
;['react', 'react-dom'].forEach(dependency => {
  try {
    require.resolve(dependency)
  } catch (err) {
    console.warn(
      `未找到模块 '${dependency}'。Next.js 需要你将其添加到 package.json 的 dependencies 中。执行 'npm install --save ${dependency}' 安装它。`
    )
  }
})

// 默认命令为 dev
const defaultCommand = 'dev'

// 定义每个子命令的异步加载函数
const commands = {
  build: async () => await import('../cli/next-build').then(i => i.nextBuild),
  start: async () => await import('../cli/next-start').then(i => i.nextStart),
  ///=== export: async () => await import('../cli/next-export').then(i => i.nextExport),
  dev: async () => await import('../cli/next-dev').then(i => i.nextDev),
  ///===  telemetry: async () => await import('../cli/next-telemetry').then(i => i.nextTelemetry),
}

// 解析命令行参数
const args = arg(
  {
    '--version': Boolean,
    '--help': Boolean,
    '--inspect': Boolean,
    '-v': '--version',
    '-h': '--help',
  },
  { permissive: true }
)

// 显示版本号
if (args['--version']) {
  console.log(`Next.js v${process.env.__NEXT_VERSION}`)
  process.exit(0)
}

// 判断是否输入了有效子命令
const foundCommand = Boolean(commands[args._[0]])
const command = foundCommand ? args._[0] : defaultCommand    ///=== build or  start or export or dev 
const forwardedArgs = foundCommand ? args._.slice(1) : args._

// 如果传入了 --inspect，给出提示
if (args['--inspect']) {
  throw new Error(
    `请使用 NODE_OPTIONS 设置调试：NODE_OPTIONS="--inspect" next ${command}`
  )
}

// 如果传入了 --help，将其加入参数中传给具体命令
if (args['--help']) {
  if (!foundCommand) {
    console.log(`
    用法：
      $ next <command>

    可用命令：
      ${Object.keys(commands).join(', ')}

    参数选项：
      --version, -v   显示版本号
      --inspect       启用 Node.js 调试器
      --help, -h      显示帮助信息

    更多信息可使用命令加 --help 查看
      $ next build --help
    `)
    process.exit(0)
  }

  forwardedArgs.push('--help')
}

// 设置 NODE_ENV 环境变量
const defaultEnv = command === 'dev' ? 'development' : 'production'
process.env.NODE_ENV = process.env.NODE_ENV || defaultEnv

// SSR 依赖 React，确保 React 支持 Suspense
const React = require('react')
if (typeof React.Suspense === 'undefined') {
  throw new Error(
    `你使用的 React 版本过低，请升级 react 和 react-dom："npm install --save react react-dom"`
  )
}

// --------------- 主函数入口 --------------- //
async function main() {
  try {
    // 异步加载命令对应模块，并执行
    const exec = await commands[command]()
    await exec(forwardedArgs)

    // 如果是 dev 模式，监听配置文件变化提示用户重启
    if (command === 'dev') {
      const { CONFIG_FILE } = require('../next-server/lib/constants')
      const { watchFile } = require('fs')
      watchFile(`${process.cwd()}/${CONFIG_FILE}`, (cur, prev) => {
        if (cur.size > 0 || prev.size > 0) {
          console.log(`\n> 检测到 ${CONFIG_FILE} 改动，重启服务后生效。`)
        }
      })
    }
  } catch (err) {
    console.error(`❌ 执行命令失败: ${err.message}`)
    process.exit(1)
  }
}

// 启动主函数
main()
