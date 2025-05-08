// log.js
import chalk from 'chalk';

// 日志前缀，使用 chalk 格式化不同类型的消息
const prefixes = {
  wait: chalk`[ {cyan wait} ] `,
  error: chalk`[ {red error} ]`,
  warn: chalk`[ {yellow warn} ] `,
  ready: chalk`[ {green ready} ]`,
  info: chalk`[ {cyan {dim info}} ] `,
  event: chalk`[ {magenta event} ]`,
};

/**
 * 打印等待消息（带 wait 前缀）
 * @param {...string} message - 要打印的消息
 */
export function wait(...message) {
  console.log(prefixes.wait, ...message);
}

/**
 * 打印错误消息（带 error 前缀）
 * @param {...string} message - 要打印的消息
 */
export function error(...message) {
  console.log(prefixes.error, ...message);
}

/**
 * 打印警告消息（带 warn 前缀）
 * @param {...string} message - 要打印的消息
 */
export function warn(...message) {
  console.log(prefixes.warn, ...message);
}

/**
 * 打印准备就绪消息（带 ready 前缀）
 * @param {...string} message - 要打印的消息
 */
export function ready(...message) {
  console.log(prefixes.ready, ...message);
}

/**
 * 打印信息消息（带 info 前缀）
 * @param {...string} message - 要打印的消息
 */
export function info(...message) {
  console.log(prefixes.info, ...message);
}

/**
 * 打印事件消息（带 event 前缀）
 * @param {...string} message - 要打印的消息
 */
export function event(...message) {
  console.log(prefixes.event, ...message);
}