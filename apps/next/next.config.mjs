import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '../..')

// ponytail: force-deploy 2026-06-16T17:07
/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: workspaceRoot,
  reactStrictMode: true,
  turbopack: {
    root: workspaceRoot,
    ignoreIssue: [
      { path: '**/next.config.mjs' },
      { path: '**/weight-ticket-line-notification.ts' },
    ],
  },
}

export default nextConfig
