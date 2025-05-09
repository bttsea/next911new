// 打印消息并退出进程
function printAndExit(message, code = 1) {
  if (code === 0) {
    // 如果退出码是 0，表示正常退出，使用 console.log 输出信息
    console.log(message);
  } else {
    // 如果退出码不是 0，表示出错，用 console.error 输出错误信息
    console.error(message);
  }

  // 退出 Node.js 进程，返回指定的退出码
  process.exit(code);
}

// 导出函数供其他模块使用
module.exports = { printAndExit };
