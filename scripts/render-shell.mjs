import { build } from 'esbuild'
import { mkdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { renderToString } from 'react-dom/server'
import { createElement } from 'react'

export async function renderShell() {
  // A build-time render provides real markup before JavaScript downloads.
  // Nothing from a user's draft, links or runtime ever enters this render.
  await mkdir('.private', { recursive: true })
  const outfile = path.resolve('.private/render-shell.mjs')
  await build({entryPoints: ['frontend/app-shell.tsx'], outfile, bundle: true,
    platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic',
    alias: {'@': path.resolve('frontend')}})
  const { AppShell } = await import(pathToFileURL(outfile).href + '?build=' + Date.now())
  return renderToString(createElement(AppShell))
}
