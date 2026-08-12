#!/usr/bin/env node
/**
 * OpenWork desktop entry point — invoked by the Tauri shell.
 *
 * Contract:
 *   openwork serve --port 0 --hostname 127.0.0.1 --require-auth --workspace <path> --no-open
 *
 * Environment (from Tauri shell):
 *   OPENWORK_DESKTOP=1
 *   OPENWORK_SERVER_TOKEN=<random 32-byte hex>
 *
 * Output (stdout, JSON line):
 *   {"event":"openwork-server-listening","url":"http://127.0.0.1:<port>","pid":<pid>}
 */

import { join } from 'node:path'
import { existsSync } from 'node:fs'

// Bridge from Tauri env vars to existing server env vars
if (process.env.OPENWORK_SERVER_TOKEN && !process.env.CRAFT_SERVER_TOKEN) {
  process.env.CRAFT_SERVER_TOKEN = process.env.OPENWORK_SERVER_TOKEN
}

// Default to ephemeral port
if (!process.env.CRAFT_RPC_PORT) {
  process.env.CRAFT_RPC_PORT = '0'
}

// Default to loopback
if (!process.env.CRAFT_RPC_HOST) {
  process.env.CRAFT_RPC_HOST = '127.0.0.1'
}

// Set WebUI directory
const runtimeDir = process.env.OPENWORK_DESKTOP_RUNTIME_DIR ?? process.cwd()
if (!process.env.CRAFT_WEBUI_DIR) {
  const webuiDir = join(runtimeDir, 'lib', 'webui')
  if (existsSync(webuiDir)) {
    process.env.CRAFT_WEBUI_DIR = webuiDir
  }
}

// Parse --workspace from CLI args
const workspaceIndex = process.argv.indexOf('--workspace')
if (workspaceIndex !== -1 && workspaceIndex + 1 < process.argv.length) {
  process.env.CRAFT_WORKSPACE = process.argv[workspaceIndex + 1]
}

// Delegate to the main server entry
import { startServer } from './index'

const server = await startServer()

// Emit JSON startup event for the Tauri shell to parse
const url = `http://${server.host}:${server.port}`
console.log(JSON.stringify({
  event: 'openwork-server-listening',
  url,
  pid: process.pid,
}))

// Keep alive
process.on('SIGTERM', async () => { await server.stop(); process.exit(0) })
process.on('SIGINT', async () => { await server.stop(); process.exit(0) })