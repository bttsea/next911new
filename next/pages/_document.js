/* eslint-disable */
import React, { Component } from 'react';
import flush from 'styled-jsx/server';
import { htmlEscapeJsonString } from '../server/htmlescape';
import {
  CLIENT_STATIC_FILES_RUNTIME_WEBPACK,
} from '../next-server/lib/constants';

// 定义 DocumentContext 和 DocumentProps，供外部使用
export const DocumentContext = {};
export const DocumentProps = {};

// 中间件函数，留空以保持兼容性
export async function middleware({ req, res }) {}

// 去重 bundle 文件，避免重复加载
function dedupe(bundles) {
  const files = new Set();
  const kept = [];
  for (const bundle of bundles) {
    if (files.has(bundle.file)) continue;
    files.add(bundle.file);
    kept.push(bundle);
  }
  return kept;
}

// 获取现代脚本变体（支持 module.js）
function getOptionalModernScriptVariant(path) {
  if (process.env.__NEXT_MODERN_BUILD) {
    return path.replace(/\.js$/, '.module.js');
  }
  return path;
}

// Document 组件，处理服务器端初始文档标记，仅在服务端渲染
export default class Document extends Component {
  // 获取初始 props，执行同步渲染逻辑以支持 SSR
  static async getInitialProps({ renderPage }) {
    const { html, head, dataOnly } = await renderPage();
    const styles = flush(); // 提取 styled-jsx 样式
    return { html, head, styles, dataOnly };
  }

  // 定义子上下文，提供文档属性和开发模式缓存失效查询字符串
  getChildContext() {
    return {
      _documentProps: this.props,
      _devOnlyInvalidateCacheQueryString:
        process.env.NODE_ENV !== 'production' ? '?ts=' + Date.now() : '',
    };
  }

  // 渲染 HTML 结构
  render() {
    return (
      <Html>
        <Head />
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}

// Html 组件，渲染 <html> 标签
export class Html extends Component {
  render() {
    return <html {...this.props} />;
  }
}

// Head 组件，管理 <head> 标签内容
export class Head extends Component {
  // 获取 CSS 文件链接
  getCssLinks() {
    const { assetPrefix, files } = this.context._documentProps;
    const cssFiles = files && files.length ? files.filter(f => /\.css$/.test(f)) : [];
    return cssFiles.length === 0
      ? null
      : cssFiles.map(file => (
          <link
            key={file}
            nonce={this.props.nonce}
            rel="stylesheet"
            href={`${assetPrefix}/_next/${encodeURI(file)}`}
            crossOrigin={this.props.crossOrigin || process.crossOrigin}
          />
        ));
  }

  // 获取动态 chunk 的预加载链接
  getPreloadDynamicChunks() {
    const { dynamicImports, assetPrefix } = this.context._documentProps;
    const { _devOnlyInvalidateCacheQueryString } = this.context;
    return dedupe(dynamicImports)
      .map(bundle => {
        if (!bundle.file.endsWith(getOptionalModernScriptVariant('.js'))) {
          return null;
        }
        return (
          <link
            rel="preload"
            key={bundle.file}
            href={`${assetPrefix}/_next/${encodeURI(bundle.file)}${_devOnlyInvalidateCacheQueryString}`}
            as="script"
            nonce={this.props.nonce}
            crossOrigin={this.props.crossOrigin || process.crossOrigin}
          />
        );
      })
      .filter(Boolean);
  }

  // 获取主脚本的预加载链接
  getPreloadMainLinks() {
    const { assetPrefix, files } = this.context._documentProps;
    if (!files || files.length === 0) {
      return null;
    }
    const { _devOnlyInvalidateCacheQueryString } = this.context;
    return files
      .map(file => {
        if (!file.endsWith(getOptionalModernScriptVariant('.js'))) {
          return null;
        }
        return (
          <link
            key={file}
            nonce={this.props.nonce}
            rel="preload"
            href={`${assetPrefix}/_next/${encodeURI(file)}${_devOnlyInvalidateCacheQueryString}`}
            as="script"
            crossOrigin={this.props.crossOrigin || process.crossOrigin}
          />
        );
      })
      .filter(Boolean);
  }

  // 渲染 <head> 内容
  render() {
    const { styles, assetPrefix, __NEXT_DATA__ } = this.context._documentProps;
    const { _devOnlyInvalidateCacheQueryString } = this.context;
    const { page, buildId } = __NEXT_DATA__;
    let { head } = this.context._documentProps;
    let children = this.props.children;

    // 开发模式下检查 <title> 使用警告
    if (process.env.NODE_ENV !== 'production') {
      children = React.Children.map(children, child => {
        const isReactHelmet = child && child.props && child.props['data-react-helmet'];
        if (child && child.type === 'title' && !isReactHelmet) {
          console.warn(
            "Warning: <title> should not be used in _document.js's <Head>. https://err.sh/next.js/no-document-title"
          );
        }
        return child;
      });
      if (this.props.crossOrigin) {
        console.warn(
          'Warning: `Head` attribute `crossOrigin` is deprecated. https://err.sh/next.js/doc-crossorigin-deprecated'
        );
      }
    }

    return (
      <head {...this.props}>
        {this.context._documentProps.isDevelopment &&
          this.context._documentProps.hasCssMode && (
            <>
              <style
                data-next-hide-fouc
                dangerouslySetInnerHTML={{ __html: `body{display:none}` }}
              />
              <noscript data-next-hide-fouc>
                <style
                  dangerouslySetInnerHTML={{ __html: `body{display:block}` }}
                />
              </noscript>
            </>
          )}
        {children}
        {head}
        <meta
          name="next-head-count"
          content={React.Children.count(head || []).toString()}
        />
        <link
          rel="preload"
          href={
            assetPrefix +
            getOptionalModernScriptVariant(
              encodeURI(`/_next/static/${buildId}/pages/_app.js`)
            ) +
            _devOnlyInvalidateCacheQueryString
          }
          as="script"
          nonce={this.props.nonce}
          crossOrigin={this.props.crossOrigin || process.crossOrigin}
        />
        {page !== '/_error' && (
          <link
            rel="preload"
            href={
              assetPrefix +
              getOptionalModernScriptVariant(
                encodeURI(`/_next/static/${buildId}/pages${getPageFile(page)}`)
              ) +
              _devOnlyInvalidateCacheQueryString
            }
            as="script"
            nonce={this.props.nonce}
            crossOrigin={this.props.crossOrigin || process.crossOrigin}
          />
        )}
        {this.getPreloadDynamicChunks()}
        {this.getPreloadMainLinks()}
        {this.context._documentProps.isDevelopment &&
          this.context._documentProps.hasCssMode && (
            <noscript id="__next_css__DO_NOT_USE__" />
          )}
        {this.getCssLinks()}
        {styles || null}
      </head>
    );
  }
}

// Main 组件，渲染页面内容
export class Main extends Component {
  // 渲染页面内容
  render() {
    const { html } = this.context._documentProps;
    return <div id="__next" dangerouslySetInnerHTML={{ __html: html }} />;
  }
}

// NextScript 组件，管理脚本加载
export class NextScript extends Component {
  // Safari noModule 修复脚本
  static safariNomoduleFix =
    '!function(){var e=document,t=e.createElement("script");if(!("noModule"in t)&&"onbeforeload"in t){var n=!1;e.addEventListener("beforeload",function(e){if(e.target===t)n=!0;else if(!e.target.hasAttribute("nomodule")||!n)return;e.preventDefault()},!0),t.type="module",t.src=".",e.head.appendChild(t),t.remove()}}();';

  // 获取动态 chunk 脚本
  getDynamicChunks() {
    const { dynamicImports, assetPrefix, files } = this.context._documentProps;
    const { _devOnlyInvalidateCacheQueryString } = this.context;
    return dedupe(dynamicImports).map(bundle => {
      let modernProps = {};
      if (process.env.__NEXT_MODERN_BUILD) {
        modernProps = /\.module\.js$/.test(bundle.file)
          ? { type: 'module' }
          : { noModule: true };
      }
      if (!/\.js$/.test(bundle.file) || files.includes(bundle.file)) return null;
      return (
        <script
          async
          key={bundle.file}
          src={`${assetPrefix}/_next/${encodeURI(bundle.file)}${_devOnlyInvalidateCacheQueryString}`}
          nonce={this.props.nonce}
          crossOrigin={this.props.crossOrigin || process.crossOrigin}
          {...modernProps}
        />
      );
    });
  }

  // 获取主脚本
  getScripts() {
    const { assetPrefix, files } = this.context._documentProps;
    if (!files || files.length === 0) {
      return null;
    }
    const { _devOnlyInvalidateCacheQueryString } = this.context;
    return files.map(file => {
      if (!/\.js$/.test(file)) {
        return null;
      }
      let modernProps = {};
      if (process.env.__NEXT_MODERN_BUILD) {
        modernProps = /\.module\.js$/.test(file)
          ? { type: 'module' }
          : { noModule: true };
      }
      return (
        <script
          key={file}
          src={`${assetPrefix}/_next/${encodeURI(file)}${_devOnlyInvalidateCacheQueryString}`}
          nonce={this.props.nonce}
          async
          crossOrigin={this.props.crossOrigin || process.crossOrigin}
          {...modernProps}
        />
      );
    });
  }

  // 获取内联脚本源（__NEXT_DATA__）
  static getInlineScriptSource(documentProps) {
    const { __NEXT_DATA__ } = documentProps;
    try {
      const data = JSON.stringify(__NEXT_DATA__);
      return htmlEscapeJsonString(data);
    } catch (err) {
      if (err.message.indexOf('circular structure')) {
        throw new Error(
          `Circular structure in "getInitialProps" result of page "${
            __NEXT_DATA__.page
          }". https://err.sh/zeit/next.js/circular-structure`
        );
      }
      throw err;
    }
  }

  // 渲染脚本内容
  render() {
    const { staticMarkup, assetPrefix, devFiles, __NEXT_DATA__ } = this.context._documentProps;
    const { _devOnlyInvalidateCacheQueryString } = this.context;
    const { page, buildId } = __NEXT_DATA__;

    if (process.env.NODE_ENV !== 'production') {
      if (this.props.crossOrigin) {
        console.warn(
          'Warning: `NextScript` attribute `crossOrigin` is deprecated. https://err.sh/next.js/doc-crossorigin-deprecated'
        );
      }
    }

    const pageScript = [
      <script
        async
        data-next-page={page}
        key={page}
        src={
          assetPrefix +
          encodeURI(`/_next/static/${buildId}/pages${getPageFile(page)}`) +
          _devOnlyInvalidateCacheQueryString
        }
        nonce={this.props.nonce}
        crossOrigin={this.props.crossOrigin || process.crossOrigin}
        {...(process.env.__NEXT_MODERN_BUILD ? { noModule: true } : {})}
      />,
      process.env.__NEXT_MODERN_BUILD && (
        <script
          async
          data-next-page={page}
          key={`${page}-modern`}
          src={
            assetPrefix +
            getOptionalModernScriptVariant(
              encodeURI(`/_next/static/${buildId}/pages${getPageFile(page)}`)
            ) +
            _devOnlyInvalidateCacheQueryString
          }
          nonce={this.props.nonce}
          crossOrigin={this.props.crossOrigin || process.crossOrigin}
          type="module"
        />
      ),
    ];

    const appScript = [
      <script
        async
        data-next-page="/_app"
        src={
          assetPrefix +
          `/_next/static/${buildId}/pages/_app.js` +
          _devOnlyInvalidateCacheQueryString
        }
        key="_app"
        nonce={this.props.nonce}
        crossOrigin={this.props.crossOrigin || process.crossOrigin}
        {...(process.env.__NEXT_MODERN_BUILD ? { noModule: true } : {})}
      />,
      process.env.__NEXT_MODERN_BUILD && (
        <script
          async
          data-next-page="/_app"
          src={
            assetPrefix +
            `/_next/static/${buildId}/pages/_app.module.js` +
            _devOnlyInvalidateCacheQueryString
          }
          key="_app-modern"
          nonce={this.props.nonce}
          crossOrigin={this.props.crossOrigin || process.crossOrigin}
          type="module"
        />
      ),
    ];

    return (
      <>
        {devFiles
          ? devFiles.map(
              file =>
                !file.match(/\.js\.map/) && (
                  <script
                    key={file}
                    src={`${assetPrefix}/_next/${encodeURI(file)}${_devOnlyInvalidateCacheQueryString}`}
                    nonce={this.props.nonce}
                    crossOrigin={this.props.crossOrigin || process.crossOrigin}
                  />
                )
            )
          : null}
        {staticMarkup ? null : (
          <script
            id="__NEXT_DATA__"
            type="application/json"
            nonce={this.props.nonce}
            crossOrigin={this.props.crossOrigin || process.crossOrigin}
            dangerouslySetInnerHTML={{
              __html: NextScript.getInlineScriptSource(this.context._documentProps),
            }}
          />
        )}
        {process.env.__NEXT_MODERN_BUILD ? (
          <script
            nonce={this.props.nonce}
            crossOrigin={this.props.crossOrigin || process.crossOrigin}
            noModule={true}
            dangerouslySetInnerHTML={{ __html: NextScript.safariNomoduleFix }}
          />
        ) : null}
        {page !== '/_error' && pageScript}
        {appScript}
        {staticMarkup ? null : this.getDynamicChunks()}
        {staticMarkup ? null : this.getScripts()}
      </>
    );
  }
}

// 获取页面文件名
function getPageFile(page, buildId) {
  if (page === '/') {
    return buildId ? `/index.${buildId}.js` : '/index.js';
  }
  return buildId ? `${page}.${buildId}.js` : `${page}.js`;
}









/*
保留核心功能：
保留了 _document.js 的核心功能，包括：
服务端渲染支持（getInitialProps 和 render）。
样式管理（styled-jsx 的 flush 和 CSS 文件加载）。
脚本加载（NextScript 的 getDynamicChunks 和 getScripts）。
开发模式优化（如缓存失效查询字符串 _devOnlyInvalidateCacheQueryString）。
/****************** */
