// runtime-config.js
let runtimeConfig = null;

/**
 * 获取运行时配置
 * @returns {Object|null} - 当前的运行时配置对象
 */
function getConfig() {
  return runtimeConfig;
}

/**
 * 设置运行时配置
 * @param {Object} configValue - 要设置的配置对象
 */
function setConfig(configValue) {
  runtimeConfig = configValue;
}

module.exports = getConfig;
module.exports.setConfig = setConfig;



/*
功能：提供运行时配置的管理，允许设置和获取全局配置对象（runtimeConfig），支持动态配置（如环境变量或 next.config.js 的运行时设置）。

用途：在服务端和客户端共享运行时配置，例如 publicRuntimeConfig 和 serverRuntimeConfig（定义在 next.config.js），用于动态调整应用行为。


/***** */