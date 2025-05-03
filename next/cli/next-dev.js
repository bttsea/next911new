#!/usr/bin/env node

// 引入 Node.js 模块用于路径处理
const { resolve } = require('path')

// 引入 next.js 内部打包的 arg 库（用于命令行参数解析）
const arg = require('next/dist/compiled/arg/index.js')

// 文件系统模块，用于检测文件是否存在
const { existsSync } = require('fs')

// 启动开发服务器的函数
const startServer = require('../server/lib/start-server')

// 工具函数，用于打印错误并退出
const { printAndExit } = require('../server/lib/utils')

// 打印开发服务器已启动的提示
const { startedDevelopmentServer } = require('../build/output')

// 这是 CLI 命令的主函数，接收命令行参数 argv
const nextDev = (argv) => {
  // 解析命令行参数
  const args = arg(
    {
      // 类型定义
      '--help': Boolean,
      '--port': Number,
      '--hostname': String,

      // 简写别名
      '-h': '--help',
      '-p': '--port',
      '-H': '--hostname',
    },
    { argv } // 传入命令行参数数组
  )

  // 如果传入了 --help，则打印帮助信息并退出
  if (args['--help']) {
    console.log(`
      描述
        在开发模式下启动应用程序（支持热重载、错误报告等）

      用法
        $ next dev <dir> -p <端口号>

      <dir> 表示项目根目录（默认为当前目录）
      可以通过配置文件设定其它目录：https://github.com/vercel/next.js#custom-configuration

      选项
        --port, -p      启动服务器的端口号
        --hostname, -H  启动服务器的主机名
        --help, -h      显示帮助信息
    `)
    process.exit(0)
  }

  // 获取项目根目录（默认是当前目录）
  const dir = resolve(args._[0] || '.')

  // 检查该目录是否存在
  if (!existsSync(dir)) {
    printAndExit(`> 项目根目录不存在: ${dir}`)
  }

  // 设置端口和访问地址
  const port = args['--port'] || 3000
  const appUrl = `http://${args['--hostname'] || 'localhost'}:${port}`

  // 打印开发服务器启动信息
  startedDevelopmentServer(appUrl)

  // 启动开发服务器
  startServer({ dir, dev: true }, port, args['--hostname'])
    .then(async (app) => {
      // 调用 prepare 方法准备就绪
      await app.prepare()
    })
    .catch((err) => {
      // 如果端口被占用，打印友好提示
      if (err.code === 'EADDRINUSE') {
        let errorMessage = `端口 ${port} 已被占用.`

        // 尝试从当前目录向上查找 package.json
        const pkgAppPath = require('find-up').sync('package.json', {
          cwd: dir,
        })
        const appPackage = require(pkgAppPath)

        // 如果定义了 next 脚本，提示用户改用其它端口
        if (appPackage.scripts) {
          const nextScript = Object.entries(appPackage.scripts).find(
            scriptLine => scriptLine[1] === 'next'
          )
          if (nextScript) {
            errorMessage += `\n你可以使用 \`npm run ${
              nextScript[0]
            } -- -p 其它端口号\` 来更换端口.`
          }
        }

        console.error(errorMessage)
      } else {
        // 其它错误直接打印
        console.error(err)
      }

      // 异步退出进程
      process.nextTick(() => process.exit(1))
    })
}

// 导出函数（供 CLI 调用）
module.exports = {
  nextDev,
}
