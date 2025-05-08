/* eslint-disable no-param-reassign */
const stringHash = require('string-hash');
const { SourceMapConsumer } = require('source-map');
const { SourceMapSource, RawSource } = require('webpack-sources');
const { RequestShortener } = require('webpack');
const TaskRunner = require('./TaskRunner');

// 正则表达式：匹配 JavaScript 文件
const JS_REGEX = /\.m?js$/;

// 正则表达式：匹配警告信息中的位置信息
const warningRegex = /\[.+:([0-9]+),([0-9]+)\]/;

// Terser 插件：压缩 JavaScript 文件
class TerserPlugin {
  constructor(options = {}) {
    const {
      terserOptions = {},
      warningsFilter = () => true,
      sourceMap = false,
      cache = false,
      cpus,
      distDir,
    } = options;

    this.cpus = cpus;
    this.distDir = distDir;
    this.options = {
      warningsFilter,
      sourceMap,
      cache,
      terserOptions,
    };
  }

  // 检查输入是否为有效的源映射
  static isSourceMap(input) {
    return Boolean(
      input &&
        input.version &&
        input.sources &&
        Array.isArray(input.sources) &&
        typeof input.mappings === 'string'
    );
  }

  // 构建源映射对象
  static buildSourceMap(inputSourceMap) {
    if (!inputSourceMap || !TerserPlugin.isSourceMap(inputSourceMap)) {
      return null;
    }
    return new SourceMapConsumer(inputSourceMap);
  }

  // 构建错误信息
  static buildError(err, file, sourceMap, requestShortener) {
    if (err.line) {
      const original =
        sourceMap &&
        sourceMap.originalPositionFor({
          line: err.line,
          column: err.col,
        });

      if (original && original.source && requestShortener) {
        return new Error(
          `${file} from Terser\n${err.message} [${requestShortener.shorten(
            original.source
          )}:${original.line},${original.column}][${file}:${err.line},${
            err.col
          }]`
        );
      }

      return new Error(
        `${file} from Terser\n${err.message} [${file}:${err.line},${err.col}]`
      );
    } else if (err.stack) {
      return new Error(`${file} from Terser\n${err.stack}`);
    }

    return new Error(`${file} from Terser\n${err.message}`);
  }

  // 构建警告信息
  static buildWarning(warning, file, sourceMap, requestShortener, warningsFilter) {
    let warningMessage = warning;
    let locationMessage = '';
    let source = null;

    if (sourceMap) {
      const match = warningRegex.exec(warning);

      if (match) {
        const line = +match[1];
        const column = +match[2];
        const original = sourceMap.originalPositionFor({
          line,
          column,
        });

        if (
          original &&
          original.source &&
          original.source !== file &&
          requestShortener
        ) {
          source = original.source;
          warningMessage = `${warningMessage.replace(warningRegex, '')}`;
          locationMessage = `[${requestShortener.shorten(original.source)}:${
            original.line
          },${original.column}]`;
        }
      }
    }

    if (warningsFilter && !warningsFilter(warning, source)) {
      return null;
    }

    return `Terser Plugin: ${warningMessage}${locationMessage}`;
  }

  // 应用插件到 Webpack 编译器
  apply(compiler) {
    const optimizeFn = (compilation, chunks, callback) => {
      // 创建任务运行器
      const taskRunner = new TaskRunner({
        distDir: this.distDir,
        cpus: this.cpus,
        cache: this.options.cache,
      });

      const processedAssets = new WeakSet();
      const tasks = [];

      // 收集需要压缩的 JavaScript 文件
      Array.from(chunks)
        .reduce((acc, chunk) => acc.concat(chunk.files || []), [])
        .concat(compilation.additionalChunkAssets || [])
        .filter(file => JS_REGEX.test(file))
        .forEach(file => {
          let inputSourceMap;
          const asset = compilation.assets[file];

          if (processedAssets.has(asset)) {
            return;
          }

          try {
            let input;

            if (this.options.sourceMap && asset.sourceAndMap) {
              const { source, map } = asset.sourceAndMap();
              input = source;

              if (TerserPlugin.isSourceMap(map)) {
                inputSourceMap = map;
              } else {
                inputSourceMap = map;
                compilation.warnings.push(
                  new Error(`${file} contains invalid source map`)
                );
              }
            } else {
              input = asset.source();
              inputSourceMap = null;
            }

            const task = {
              file,
              input,
              inputSourceMap,
              terserOptions: this.options.terserOptions,
            };

            if (this.options.cache) {
              task.cacheKey = 'a' + stringHash(input);
              if (this.options.sourceMap) task.cacheKey += 's';
            }

            tasks.push(task);
          } catch (error) {
            compilation.errors.push(
              TerserPlugin.buildError(
                error,
                file,
                TerserPlugin.buildSourceMap(inputSourceMap),
                new RequestShortener(compiler.context)
              )
            );
          }
        });

      // 执行压缩任务
      taskRunner.run(tasks, (tasksError, results) => {
        if (tasksError) {
          compilation.errors.push(tasksError);
          return;
        }

        results.forEach((data, index) => {
          const { file, input, inputSourceMap } = tasks[index];
          const { error, map, code, warnings } = data;

          let sourceMap = null;

          if (error || (warnings && warnings.length > 0)) {
            sourceMap = TerserPlugin.buildSourceMap(inputSourceMap);
          }

          if (error) {
            compilation.errors.push(
              TerserPlugin.buildError(
                error,
                file,
                sourceMap,
                new RequestShortener(compiler.context)
              )
            );
            return;
          }

          let outputSource;

          if (map) {
            outputSource = new SourceMapSource(
              code,
              file,
              JSON.parse(map),
              input,
              inputSourceMap
            );
          } else {
            outputSource = new RawSource(code);
          }

          processedAssets.add((compilation.assets[file] = outputSource));

          if (warnings && warnings.length > 0) {
            warnings.forEach(warning => {
              const builtWarning = TerserPlugin.buildWarning(
                warning,
                file,
                sourceMap,
                new RequestShortener(compiler.context),
                this.options.warningsFilter
              );

              if (builtWarning) {
                compilation.warnings.push(builtWarning);
              }
            });
          }
        });

        taskRunner.exit();
        callback();
      });
    };

    const plugin = { name: this.constructor.name };

    // 注册 Webpack 钩子
    compiler.hooks.compilation.tap(plugin, compilation => {
      if (this.options.sourceMap) {
        compilation.hooks.buildModule.tap(plugin, moduleArg => {
          moduleArg.useSourceMap = true;
        });
      }

      const { mainTemplate, chunkTemplate } = compilation;

      for (const template of [mainTemplate, chunkTemplate]) {
        template.hooks.hashForChunk.tap(plugin, hash => {
          hash.update('3.17.0');
          return hash;
        });
      }

      compilation.hooks.optimizeChunkAssets.tapAsync(
        plugin,
        optimizeFn.bind(this, compilation)
      );
    });
  }
}

module.exports = TerserPlugin;


/*
插件功能精简，专注于压缩


原文件是一个自定义的 TerserPlugin，用于在 Webpack 构建中压缩 JavaScript 文件，支持源映射（source map）、错误处理和缓存。
保留的核心功能：
压缩 JavaScript 文件（.js 和 .mjs）。
支持源映射（sourceMap 选项）。
错误和警告处理（buildError, buildWarning）。
缓存支持（cache 选项）。
多核并行压缩（cpus 选项）。
/******* */

