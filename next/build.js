const babel = require('@babel/core');// babel 编译
const glob = require('fast-glob');// fast-glob 找文件
const path = require('path');
const fs = require('fs-extra');// fs-extra 读写文件
const { exec } = require('child_process');// child_process 执行命令（比如 tsc）
const chokidar = require('chokidar');// chokidar 监听（可选）
const ts = require('typescript');// typescript 做 TSC 编译（可能直接 npx tsc 也可以）
const packageJson = require('./package.json');
const esbuild = require('esbuild');// esbuild 替代 ncc 进行打包外部包


// 拷贝 newer 文件
let sourcePath_old = 'H:/next911new/next';
let targetPath_old = 'H:/next911new/my-app/node_modules/next';

// __dirname 是 H:/next911new/next （build.js 所在目录）
///=== path.resolve(__dirname)：解析为 H:/next911new/next
let sourcePath = path.resolve(__dirname);  ///===__dirname：表示当前执行的 JS 文件所在的目录（即 next/build.js）。
let targetPath = path.resolve(__dirname, '../my-app/node_modules/next'); ///=== 解析为 H:/next911new/my-app/node_modules/next

 


 
// ====== Babel 配置（直接内嵌） ======

// 服务器端 Babel 配置
const serverBabelOptions = {
  presets: [
    '@babel/preset-typescript', // 如果你还处理 .ts/.tsx，可以加
    [
      '@babel/preset-env',
      {
        modules: 'commonjs',
        targets: { node: '18' },
        loose: true,
        exclude: ['transform-typeof-symbol']
      }
    ],
    '@babel/preset-react',   // <-- 重要！加上这个处理 JSX
    
  ],
  plugins: [
    'babel-plugin-dynamic-import-node',
    ['@babel/plugin-proposal-class-properties', { loose: true }]
  ],
  sourceMaps: true
};

// 客户端 Babel 配置
const clientBabelOptions = {
  presets: [
    '@babel/preset-typescript',
    [
      '@babel/preset-env',
      {
        modules: 'commonjs',
        targets: { esmodules: true },
        loose: true,
        exclude: ['transform-typeof-symbol']
      }
    ],
    '@babel/preset-react'
  ],
  plugins: [
    ['@babel/plugin-proposal-class-properties', { loose: true }],
    [
      '@babel/plugin-transform-runtime',
      {
        corejs: 2,
        helpers: true,
        regenerator: false,
        useESModules: false
      }
    ]
  ],
  sourceMaps: true
};


// 默认的 TypeScript 配置
const defaultTSConfig = {
  compilerOptions: {
    strict: true,
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2017,
    esModuleInterop: true,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    jsx: ts.JsxEmit.React,
    sourceMap: false // 默认不开 sourcemap（你要的话可以开）
  },
  exclude: ['./dist/**', './*.d.ts', './constants.d.ts']
};


// ====== 工具函数 ====== 

// 把原来 taskfile-babel.js 的逻辑也整合进新的 babelCompileDir 函数。
// 特别是里面这些额外功能也要包含：
// ✅ compact: true
// ✅ 不使用 babelrc 和 configFile
// ✅ .d.ts 文件直接跳过
// ✅ .ts .tsx 转 .js
// ✅ next-dev.js 特殊处理 (// REPLACE_NOOP_IMPORT)
// ✅ process.env.__NEXT_VERSION 替换成 package.json 里的版本号
async function babelCompileDir(srcDir, outDir, { isClient = false, stripExtension = false } = {}) {
  const files = await glob(['**/*.{js,ts,tsx,d.ts}'], { cwd: srcDir, absolute: true });

  await Promise.all(files.map(async (file) => {
    const relativePath = path.relative(srcDir, file);
    const ext = path.extname(file);

    // .d.ts 文件直接复制
    if (file.endsWith('.d.ts')) {
      const outPath = path.join(outDir, relativePath);
      await fs.ensureDir(path.dirname(outPath));
      await fs.copyFile(file, outPath);
      return;
    }

    let outPath = path.join(outDir, relativePath);
    
    if (ext) {
      if (stripExtension) {
        // stripExtension: 去掉后缀（不加 .js）
        outPath = outPath.replace(new RegExp(ext.replace('.', '\\.') + '$', 'i'), '');
      } else {
        // 否则正常替换成 .js  如果 stripExtension 是 false，就正常 .ts|.tsx ➔ .js
        outPath = outPath.replace(/\.(ts|tsx)$/, '.js');
      }
    }

    const options = {
      ...(isClient ? clientBabelOptions : serverBabelOptions),
      compact: true,
      babelrc: false,
      configFile: false,
      filename: file
    };

    const result = await babel.transformFileAsync(file, options);
    if (result && result.code) {
      let code = result.code;

      // 特别处理 next-dev.js
      if (path.basename(file) === 'next-dev.js') {
        code = code.replace('// REPLACE_NOOP_IMPORT', `import('./dev/noop');`);
      }

      // 替换 __NEXT_VERSION
      code = code.replace(/process\.env\.__NEXT_VERSION/g, `"${packageJson.version}"`);

      await fs.ensureDir(path.dirname(outPath));
      await fs.writeFile(outPath, code);
      if (result.map) {
        await fs.writeFile(outPath + '.map', JSON.stringify(result.map));
      }
    }
  }));

  console.log(`> Babel compiled ${srcDir} -> ${outDir}`);
}

 
 

// 执行TSC编译 
// 直接 Node.js 控制编译，不跑子进程，不调用 npx tsc
// 行为跟原来 taskfile-typescript.js 完全一致
// 支持 .ts、.tsx 和 .d.ts 文件
// 自动替换 process.env.__NEXT_VERSION
// d.ts 直接拷贝，不做处理
// 不需要 npx tsc，速度超快
// 可选支持 sourceMap
async function runTSC(srcDir, outDir, extraOptions = {}) {
  const files = await glob(['**/*.ts', '**/*.tsx', '**/*.d.ts', '**/*.js'], {
    cwd: srcDir,
    absolute: true
  });

  await Promise.all(files.map(async (filePath) => {
    const relativePath = path.relative(srcDir, filePath);
    const ext = path.extname(filePath);
    let outPath = path.join(outDir, relativePath);

    if (filePath.endsWith('.d.ts')) {
      // .d.ts文件直接拷贝
      await fs.ensureDir(path.dirname(outPath));
      await fs.copyFile(filePath, outPath);
      return;
    }

    // if (ext) {
    //   // 把 .ts/.tsx 后缀替换成 .js
    //   const extRegex = new RegExp(ext.replace('.', '\\.') + '$', 'i');
    //   outPath = outPath.replace(extRegex, '.js');
    // }

    if (ext === '.d.ts') {
      await fs.ensureDir(path.dirname(outPath));
      await fs.copyFile(filePath, outPath);
      return;
    }

    // if (ext === '.js') {
    //   // 发现是原始 .js 文件，直接拷贝
    //   await fs.ensureDir(path.dirname(outPath));
    //   await fs.copyFile(filePath, outPath);
    //   return;
    // }






    // 否则是 .ts 或 .tsx，继续编译
    outPath = outPath.replace(/\.(ts|tsx)$/i, '.js');




    const code = await fs.readFile(filePath, 'utf8');

    const tsOptions = {
      ...defaultTSConfig.compilerOptions,
      ...extraOptions
    };

    const result = ts.transpileModule(code, {
      compilerOptions: tsOptions,
      fileName: filePath
    });

    let output = result.outputText;

    // 处理 __NEXT_VERSION 替换
    output = output.replace(
      /process\.env\.__NEXT_VERSION/g,
      `"${packageJson.version}"`
    );

    await fs.ensureDir(path.dirname(outPath));
    await fs.writeFile(outPath, output, 'utf8');

    // 如果启用了 sourceMap
    if (tsOptions.sourceMap && result.sourceMapText) {
      await fs.writeFile(outPath + '.map', result.sourceMapText, 'utf8');
    }
  }));

  console.log(`> TSC compiled ${srcDir} -> ${outDir}`);
}



  
 

///=== 用 esbuild 重新打包	用 esbuild 打包单个包，生成干净的 index.js + 依赖	类似 ncc，很快，且更小巧
async function bundleWithEsbuild(packageName, options = {}) {
  const entry = require.resolve(packageName);
  const outDir = path.resolve('dist/compiled', packageName);

  await fs.ensureDir(outDir);

  // 打包主文件
  await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    minify: false,
    platform: 'node',
    target: 'es2017',
    outfile: path.join(outDir, 'index.js'),
    external: ['chokidar'], // 如果需要
    ...options,
  });

  console.log(`✅ Bundled ${packageName} to dist/compiled/${packageName}`);

  // 处理 package.json
  const packageJsonPath = require.resolve(`${packageName}/package.json`);
  const { name, main, author, license, types, typings } = require(packageJsonPath);

  const pkg = {
    name,
    main: 'index.js',
    ...(author ? { author } : {}),
    ...(license ? { license } : {})
  };

  if (types || typings) {
    pkg.types = types || typings;
  } else {
    // 查找 @types/xxx
    try {
      const typesPkg = require(`${packageName}/package.json`);
      if (typesPkg.types || typesPkg.typings) {
        pkg.types = typesPkg.types || typesPkg.typings;
      }
    } catch {
      // ignore
    }
  }

  await fs.writeJson(path.join(outDir, 'package.json'), pkg, { spaces: 2 });

  // 复制 LICENSE
  const licensePath = path.join(path.dirname(packageJsonPath), 'LICENSE');
  if (await fs.pathExists(licensePath)) {
    await fs.copyFile(licensePath, path.join(outDir, 'LICENSE'));
  }
}






// 清理目录
async function clearDist_oldway() {
  await fs.remove('dist');
  console.log('> Cleared dist/');
}

async function clearDist() {
  const distPath = path.join(__dirname, 'dist');
  try {
    await fs.remove(distPath);
    console.log('> Cleared dist/');
  } catch (err) {
    if (err.code === 'ENOTEMPTY' || err.code === 'EPERM') {
      console.warn(`⚠️ 目录未完全清空（${err.path}）。可能被占用，尝试强制清除...`);
      try {
        fs.rmSync(distPath, { recursive: true, force: true }); // Node 14+
        console.log('> 强制清理 dist/ 成功');
      } catch (innerErr) {
        console.error('❌ 强制清理 dist/ 失败:', innerErr);
        process.exit(1);
      }
    } else {
      console.error('❌ 清理 dist/ 时出错:', err);
      process.exit(1);
    }
  }
}



// ====== 具体任务 ======

async function precompile() {
  await Promise.all([
    bundleWithEsbuild('arg'),
    bundleWithEsbuild('resolve'),
    bundleWithEsbuild('nanoid'),
    bundleWithEsbuild('unistore'),
    bundleWithEsbuild('text-table')
  ]);
}



async function compile() {
  await Promise.all([
    babelCompileDir('bin', 'dist/bin' , {  stripExtension : true }),
    babelCompileDir('cli', 'dist/cli'),
    babelCompileDir('server', 'dist/server'),
    babelCompileDir('build', 'dist/build'),
    babelCompileDir('export', 'dist/export'),
    babelCompileDir('client', 'dist/client', true),   ///=== true 表示客户端
    babelCompileDir('lib', 'dist/lib'),
 
    babelCompileDir('pages', 'dist/pages', true),    ///=== true 表示客户端


    babelCompileDir('next-server/lib', 'dist/next-server/lib'),
    babelCompileDir('next-server/server', 'dist/next-server/server'), 
  /// runTSC('next-server/lib', 'dist/next-server/lib', { module: ts.ModuleKind.CommonJS }),
   ///runTSC('next-server/server', 'dist/next-server/server', { module: ts.ModuleKind.CommonJS })
  ]);
}


// ------------------ 封装具体任务 ------------------ //
 

 
/**
 * 同步源目录到目标目录，只有当源文件较新时才复制
 */
 async function syncNewerFiles(srcDir, destDir) {
  const entries = await fs.readdir(srcDir);
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry);
    const destPath = path.join(destDir, entry);
    const stat = await fs.stat(srcPath);

    if (stat.isDirectory()) {
      await syncNewerFiles(srcPath, destPath);
    } else {
      const destExists = await fs.pathExists(destPath);
      let shouldCopy = true;

      if (destExists) {
        const destStat = await fs.stat(destPath);
        if (destStat.mtimeMs >= stat.mtimeMs) {
          shouldCopy = false;
        }
      }

      if (shouldCopy) {
        await fs.ensureDir(path.dirname(destPath));
        await fs.copyFile(srcPath, destPath);
        console.log(`📦 Copied: ${srcPath} -> ${destPath}`);
      }
    }
  }
}





 
async function buildAll() {
  await clearDist();
  await precompile();
  await compile();


          await syncNewerFiles(sourcePath, targetPath); ///=== 同步源目录到目标目录，只有当源文件较新时才复制

  console.log('✅ Build all finished!');
}


 

async function watchAll() {
  const watcher = chokidar.watch([
    'bin/**/*.{js,ts,tsx}',
    'cli/**/*.{js,ts,tsx}',
    'server/**/*.{js,ts,tsx}',
    'build/**/*.{js,ts,tsx}',
    'export/**/*.{js,ts,tsx}',
    'client/**/*.{js,ts,tsx}',
    'lib/**/*.{js,ts,tsx}',
 
    'pages/**/*.{js,ts,tsx}',
    'next-server/**/*.{js,ts,tsx}'
  ], { ignoreInitial: true });

  watcher.on('all', async (event, filePath) => {
    console.log(`> File changed: ${filePath}`);
    await compile(); // 这里可以做得更细致，比如只重新编译改动的目录

 
            await syncNewerFiles(sourcePath, targetPath); ///=== 同步源目录到目标目录，只有当源文件较新时才复制


  });

  console.log('> Watching for changes...');
}




// ====== 命令行接口 ======

// ------------------ CLI控制 ------------------ //

async function main() {
  const cmd = process.argv[2];

  if (cmd === 'build') {
    await buildAll();



  } else if (cmd === 'watch') {
    await buildAll();
    await watchAll();
  }   else {
    console.error(`Unknown command: ${cmd}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
 