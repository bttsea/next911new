// htmlescape.js
// 基于 https://github.com/zertosh/htmlescape
// 许可证: https://github.com/zertosh/htmlescape/blob/0527ca7156a524d256101bb310a9f970f63078ad/LICENSE

// 转义字符映射表
const ESCAPE_LOOKUP = {
  '&': '\\u0026',
  '>': '\\u003e',
  '<': '\\u003c',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
};

// 匹配需要转义的字符
const ESCAPE_REGEX = /[&><\u2028\u2029]/g;

/**
 * HTML 转义 JSON 字符串
 * @param {string} str - 输入字符串
 * @returns {string} - 转义后的字符串
 */
function htmlEscapeJsonString(str) {
  return str.replace(ESCAPE_REGEX, match => ESCAPE_LOOKUP[match]);
}

module.exports = { htmlEscapeJsonString };


/*
HTML 转义：
将字符串中的特定字符（&, >, <, \u2028, \u2029）替换为对应的 Unicode 转义序列（如 \\u0026）。

示例：输入 <script> 输出 \\u003cscript\\u003e。


/** */