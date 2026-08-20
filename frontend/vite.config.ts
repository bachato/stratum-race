import { defineConfig, Plugin, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

/**
 * Strip `crossorigin` attributes from built HTML.
 * CloudFront/S3 doesn't return CORS headers for same-origin assets,
 * which causes first-load rendering failures on some browsers.
 */
function removeCrossorigin(): Plugin {
  return {
    name: 'remove-crossorigin',
    enforce: 'post',
    transformIndexHtml(html) {
      return html.replace(/ crossorigin/g, '')
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  /**
   * Inject counter.dev analytics script before </body> when
   * VITE_COUNTER_ID is set. When the env var is absent (standalone
   * builds, local dev) nothing is injected and no counter.dev
   * reference appears in the output.
   */
  function injectAnalytics(): Plugin {
    return {
      name: 'inject-analytics',
      enforce: 'post',
      transformIndexHtml(html) {
        const id = env.VITE_COUNTER_ID
        if (!id) return html
        const tag = `  <script src="https://cdn.counter.dev/script.js" data-id="${id}" data-utcoffset="-5"></script>\n`
        return html.replace('</body>', `${tag}</body>`)
      },
    }
  }

  return {
    plugins: [vue(), removeCrossorigin(), injectAnalytics()],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
      },
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
    // In development, proxy /api/* to production so local dev gets real data
    // except for paths that exist locally in public/ (mock data for dev)
    server: {
      proxy: {
        '/api': {
          target: 'https://stratumrace.com',
          changeOrigin: true,
          secure: true,
          bypass(req) {
            // Serve local mock files from public/ when they exist
            if (req.url === '/api/config/pool-stats-latest.json') {
              return req.url
            }
            if (req.url === '/api/config/pools.json') {
              return req.url
            }
            if (req.url?.startsWith('/api/pool-history/')) {
              return req.url
            }
          },
        },
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./tests/setup.ts'],
    },
  }
})
