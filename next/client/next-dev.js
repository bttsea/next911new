import initNext, * as next from './'
 
import initOnDemandEntries from './dev/on-demand-entries-client'
import initWebpackHMR from './dev/webpack-hot-middleware-client'
import initializeBuildWatcher from './dev/dev-build-watcher'
import initializePrerenderIndicator from './dev/prerender-indicator'

// Temporary workaround for the issue described here:
// https://github.com/zeit/next.js/issues/3775#issuecomment-407438123
// The runtimeChunk doesn't have dynamic import handling code when there hasn't been a dynamic import
// The runtimeChunk can't hot reload itself currently to correct it when adding pages using on-demand-entries
// REPLACE_NOOP_IMPORT

 

const {
  __NEXT_DATA__: { assetPrefix }
} = window

const prefix = assetPrefix || ''
const webpackHMR = initWebpackHMR({ assetPrefix: prefix })

window.next = next
initNext({ webpackHMR })
  .then(emitter => {
    initOnDemandEntries({ assetPrefix: prefix })
    if (process.env.__NEXT_BUILD_INDICATOR) initializeBuildWatcher()
    if (
      process.env.__NEXT_PRERENDER_INDICATOR &&
      // disable by default in electron
      !(typeof process !== 'undefined' && 'electron' in process.versions)
    ) {
      initializePrerenderIndicator()
    }

    // This is the fallback helper that removes Next.js' no-FOUC styles when
    // CSS mode is enabled. This only really activates if you haven't created
    // _any_ styles in your application yet.
    ;(window.requestAnimationFrame || setTimeout)(function () {
      for (
        var x = document.querySelectorAll('[data-next-hide-fouc]'),
          i = x.length;
        i--;

      ) {
        x[i].parentNode.removeChild(x[i])
      }
    })

    let lastScroll

    emitter.on('before-reactdom-render', ({ Component, ErrorComponent }) => {
      // Remember scroll when ErrorComponent is being rendered to later restore it
      if (!lastScroll && Component === ErrorComponent) {
        const { pageXOffset, pageYOffset } = window
        lastScroll = {
          x: pageXOffset,
          y: pageYOffset
        }
      }
    })

    emitter.on('after-reactdom-render', ({ Component, ErrorComponent }) => {
      if (lastScroll && Component !== ErrorComponent) {
        // Restore scroll after ErrorComponent was replaced with a page component by HMR
        const { x, y } = lastScroll
        window.scroll(x, y)
        lastScroll = null
      }
    })
  })
  .catch(err => {
    console.error('Error was not caught', err)
  })
