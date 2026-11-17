/*
 * @Author: zhou shijie.zhou@renren-inc.com
 * @Date: 2025-03-18 00:17:46
 * @LastEditors: zhou shijie.zhou@renren-inc.com
 * @LastEditTime: 2026-02-11 19:32:35
 * @FilePath: /copy_code_desk/electron.vite.config.ts
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
import { PrimeVueResolver } from '@primevue/auto-import-resolver'
import vue from '@vitejs/plugin-vue'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { resolve } from 'path'
import Components from 'unplugin-vue-components/vite'
import commonjs from 'vite-plugin-commonjs'

export default defineConfig({
  main: {
    resolve: {
      alias: {
        '@main': resolve('src/main'),
        '@shared': resolve('src/shared'),
        '@renderer': resolve('src/renderer/src'),
        '@framework': resolve('src/renderer/WebSDK/Framework/src'),
        '@cubismsdksamples': resolve('src/renderer/WebSDK/src'),
        '@config': resolve('app.config.ts'),
        'neural-topics': resolve('../../packages/neural-topics/src/index.ts')
      }
    },
    plugins: [
      externalizeDepsPlugin({
        exclude: ['open', 'adm-zip']
      })
    ],
    build: {
      rollupOptions: {
        output: {
          format: 'cjs',
          interop: 'auto'
        },
        external: ['electron']
      },
      commonjsOptions: {
        transformMixedEsModules: true,
        defaultIsModuleExports: true,
        include: [/node_modules/]
      }
    }
  },
  preload: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts')
        }
      }
    },
    plugins: [
      externalizeDepsPlugin({
        exclude: []
      })
    ]
  },
  renderer: {
    resolve: {
      alias: {
        '@main': resolve('src/main'),
        '@shared': resolve('src/shared'),
        '@renderer': resolve('src/renderer/src'),
        '@framework': resolve('src/renderer/WebSDK/Framework/src'),
        '@cubismsdksamples': resolve('src/renderer/WebSDK/src')
      }
    },
    server: {
      port: 5200,
      cors: true,
      headers: {
        'Access-Control-Allow-Origin': '*'
        // 开发环境移除 CSP，避免阻止 Blob URL
        // 'Content-Security-Policy': "..."
      }
    },
    plugins: [
      vue(),
      commonjs(),
      Components({
        resolvers: [PrimeVueResolver()]
      })
    ],
    assetsInclude: ['**/*.wasm', '**/*.png', '**/*.jpg', '**/*.svg'],
    optimizeDeps: {
      exclude: ['./src/renderer/src/utils/aec.js']
    },
    css: {
      preprocessorOptions: {
        less: {
          javascriptEnabled: true
        }
      }
    }
  }
})
