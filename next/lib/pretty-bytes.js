// pretty-bytes.js
/*
MIT License
Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (sindresorhus.com)
...（保留原 MIT 许可证内容，省略以节省空间）...
*/

// 字节单位数组，从 B 到 YB
const UNITS = ['B', 'kB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

/**
 * 使用 Number.toLocaleString 格式化数字
 * @param {number} number - 要格式化的数字
 * @param {string|boolean} [locale] - 语言环境字符串（如 'de'）或 true（使用系统默认语言环境）
 * @returns {string} - 格式化后的数字字符串
 */
function toLocaleString(number, locale) {
  let result = number;
  if (typeof locale === 'string') {
    result = number.toLocaleString(locale);
  } else if (locale === true) {
    result = number.toLocaleString();
  }
  return result;
}

/**
 * 将字节数格式化为人类可读的字符串
 * @param {number} number - 要格式化的字节数
 * @param {Object} [options] - 配置选项
 * @param {boolean} [options.signed] - 是否显示符号（+ 或 -）
 * @param {string|boolean} [options.locale] - 语言环境
 * @returns {string} - 格式化后的字符串，如 '1.23 MB'
 */
export default function prettyBytes(number, options) {
  if (!Number.isFinite(number)) {
    throw new TypeError(`预期输入一个有限数字，实际得到 ${typeof number}: ${number}`);
  }

  options = Object.assign({}, options);

  if (options.signed && number === 0) {
    return ' 0 B';
  }

  const isNegative = number < 0;
  const prefix = isNegative ? '-' : options.signed ? '+' : '';

  if (isNegative) {
    number = -number;
  }

  if (number < 1) {
    const numberString = toLocaleString(number, options.locale);
    return prefix + numberString + ' B';
  }

  const exponent = Math.min(
    Math.floor(Math.log10(number) / 3),
    UNITS.length - 1
  );

  number = Number((number / Math.pow(1000, exponent)).toPrecision(3));
  const numberString = toLocaleString(number, options.locale);

  const unit = UNITS[exponent];

  return prefix + numberString + ' ' + unit;
}


/*
函数实例
prettyBytes
功能：将字节数格式化为人类可读的字符串（如 1234567 -> 1.23 MB）。
实例：
javascript

// 测试不同输入
console.log(prettyBytes(1234567)); // 输出: '1.23 MB'
console.log(prettyBytes(-500000, { signed: true })); // 输出: '-500 kB'
console.log(prettyBytes(0, { signed: true })); // 输出: ' 0 B'
console.log(prettyBytes(0.42, { locale: 'de' })); // 输出: '0,42 B'
console.log(prettyBytes(NaN)); // 抛出错误: 预期输入一个有限数字，实际得到 number: NaN

说明：
1234567 字节被格式化为 1.23 MB（自动选择单位，保留 3 位有效数字）。
-500000 字节显示为 -500 kB，signed: true 添加负号。
0 字节在 signed 模式下返回 ' 0 B'。
0.42 使用 locale: 'de' 格式化为 0,42 B（德语小数点为逗号）。
非有限数字（如 NaN）抛出错误。

常用于文件大小显示或日志输出。



toLocaleString（辅助函数）
功能：格式化数字为本地化字符串。
实例：
console.log(toLocaleString(1234.56, 'de')); // 输出: '1.234,56'
console.log(toLocaleString(1234.56, true)); // 输出: '1,234.56'（取决于系统语言环境）
console.log(toLocaleString(1234.56)); // 输出: 1234.56

说明：
locale: 'de' 使用德语格式（逗号分隔小数）。
locale: true 使用系统默认语言环境（例如英语用逗号分隔千位）。
无 locale 时返回原始数字。
作为 prettyBytes 的内部辅助函数使用。


/**** */