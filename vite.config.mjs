import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { copyFile, readFile } from 'node:fs/promises'
import path from 'node:path'
import { clientAssets } from './scripts/client-assets.mjs'
import { renderShell } from './scripts/render-shell.mjs'
import { musicAsset,musicAssetNames } from './scripts/music-assets.mjs'
import search from './experiments/deezer-preview/search.mjs'

let serving = false
export default defineConfig({
  root: 'frontend', publicDir: '../public',
  resolve: { alias: { '@': path.resolve('frontend') }, dedupe: ['react','react-dom'] },
  optimizeDeps: {include:['react','react-dom','react-dom/client','@radix-ui/react-context-menu']},
  plugins: [react(), tailwindcss(), {
    name: 'whisper-static-shell',
    configResolved(config) {serving = config.command === 'serve'},
    transformIndexHtml: {order: 'post', async handler(html) {
      if(serving)html=html.replace('</head>','<meta name="whisper-music-beta" content="1"></head>')
      return html.replace('<title>Whisper.</title>', '<title>Whisper.</title><script src="/theme.js"></script>').replace(/<div id="root" inert(?:="")?><\/div>/, '<div id="root" inert>' + await renderShell() + '</div>')
    }},
    async closeBundle() {
      await Promise.all(Object.entries(clientAssets).map(([name, source]) => copyFile(source, 'dist/' + name)))
    },
    handleHotUpdate(ctx) {
      // The custom media/editor controllers hold DOM references; remount the
      // complete app when editing their shell instead of preserving stale refs.
      if(ctx.file.includes('/frontend/') || Object.values(clientAssets).some(file => path.resolve(file) === ctx.file)) {ctx.server.ws.send({type: 'full-reload'});return []}
    },
    configureServer(server) {
      server.watcher.add(Object.values(clientAssets))
      server.middlewares.use(async (req, res, next) => {
        const pathname = new URL(req.url, 'http://localhost').pathname
        if(pathname==='/music-beta/search')return search(req,res)
        if(pathname.startsWith('/music-beta/')) {
          const name=pathname==='/music-beta/'?'index.html':pathname.slice('/music-beta/'.length)
          if(!musicAssetNames.includes(name)){res.statusCode=404;return res.end()}
          res.setHeader('Content-Type', name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html')
          return res.end(await musicAsset(name))
        }
        const file = clientAssets[pathname.slice(1)]
        if (!file) return next()
        res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.png') ? 'image/png' : 'image/svg+xml')
        res.end(await readFile(file))
      })
    },
  }],
  server: {host: '127.0.0.1', port: 5173, strictPort: true,
    fs: {allow:[path.resolve('.')], deny:['**/.env','**/.env.*','**/*.{crt,pem}','**/.git/**','**/.private/**','**/*.db','**/*.db-*']},
    proxy: {
      '/api/rooms': {target:'http://localhost:8788',configure(proxy){proxy.on('proxyReq',(outgoing,request)=>{if(['http://localhost:5173','http://127.0.0.1:5173'].includes(request.headers.origin))outgoing.setHeader('Origin','http://localhost:8788')})}},
      '/api': {target:'http://localhost:8787',configure(proxy) {
        // Only the two local Vite origins are adapted to the local Rust server.
        proxy.on('proxyReq',(outgoing,request)=>{
          if(['http://localhost:5173','http://127.0.0.1:5173'].includes(request.headers.origin))outgoing.setHeader('Origin','http://localhost:8787')
        })
      }},
      '/health': 'http://localhost:8787',
    }},
  build: {
    outDir: '../dist', emptyOutDir: true, sourcemap: false,
    // Stable entry only; dependent chunks keep content hashes.
    rolldownOptions: { output: {
      entryFileNames: 'assets/index.js',
      assetFileNames: asset => asset.names?.some(name => name.endsWith('.css')) ? 'assets/whisper.css' : 'assets/[name]-[hash][extname]',
    } },
  },
})
