/**
 * Host-side self-update endpoint for @dsh-external/dsh-minigames.
 *
 * GET  /dsh-minigames/latest  -> { latest: "vX.Y.Z" | null }  (git ls-remote)
 * POST /dsh-minigames/update  { "tag": "vX.Y.Z" }             (pinned install)
 * Only this plugin's own fixed tag is ever installed; a local link install is
 * detected and skipped (auto-update would sever the developer link).
 */
import { execFile, spawn } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import type {} from '@deepseek-ai/dsh-host-webserver'

const UPDATE_PATH = '/dsh-minigames/update'
const LATEST_PATH = '/dsh-minigames/latest'
const PACKAGE_SPEC = '@dsh-external/dsh-minigames'
const MIRROR = 'lhh010/dsh-minigames'
const REPO_GIT = `https://github.com/${MIRROR}.git`

function semverCompare(a: string, b: string): number {
  const parse = (v: string): number[] => { const p = v.replace(/^v/, '').split('.').map(x => Number(x) || 0); while (p.length < 3) p.push(0); return p }
  const pa = parse(a); const pb = parse(b)
  return (pa[0]! - pb[0]!) || (pa[1]! - pb[1]!) || (pa[2]! - pb[2]!)
}

/** TTL cache for the ls-remote result; failures are cached too, so an offline
 * machine answers instantly instead of blocking every page load on DNS/TCP. */
const CACHE_TTL_MS = 60_000
const GIT_TIMEOUT_MS = 8_000
let latestCache: { at: number; latest: string | undefined } | undefined
let latestInflight: Promise<string | undefined> | undefined

function latestFromGit(): Promise<string | undefined> {
  if (latestCache !== undefined && Date.now() - latestCache.at < CACHE_TTL_MS) return Promise.resolve(latestCache.latest)
  if (latestInflight !== undefined) return latestInflight
  latestInflight = new Promise((resolve) => {
    execFile('git', ['ls-remote', '--tags', REPO_GIT], { encoding: 'utf8', maxBuffer: 1024 * 1024, timeout: GIT_TIMEOUT_MS, killSignal: 'SIGKILL' }, (error, stdout) => {
      latestInflight = undefined
      let latest: string | undefined
      if (error === null && typeof stdout === 'string') {
        for (const line of stdout.split('\n')) {
          const trimmed = line.trim()
          if (trimmed.length === 0) continue
          const match = trimmed.match(/refs\/tags\/(v\d+\.\d+\.\d+)$/)
          if (match !== null && (latest === undefined || semverCompare(match[1]!, latest) > 0)) latest = match[1]!
        }
      }
      latestCache = { at: Date.now(), latest }
      resolve(latest)
    })
  })
  return latestInflight
}

function isLinkInstall(): boolean {
  try {
    const p = resolve(dshHomePath('profiles', 'web', 'node_modules', '@dsh-external'), 'dsh-minigames')
    return realpathSync(p) !== resolve(p)
  } catch { return false }
}

function runInstall(tag: string): Promise<{ ok: boolean; output: string; link: boolean }> {
  return new Promise((resolve) => {
    if (isLinkInstall()) { resolve({ ok: false, output: '', link: true }); return }
    const child = spawn('pnpm', ['add', `${PACKAGE_SPEC}@github:${MIRROR}#${tag}`], { cwd: dshHomePath('profiles', 'web'), shell: true })
    let output = ''
    let settled = false
    const settle = (value: { ok: boolean; output: string; link: boolean }): void => { if (settled) return; settled = true; resolve(value) }
    const timer = setTimeout(() => { try { child.kill() } catch { /* gone */ }; settle({ ok: false, output: `${output}安装超时（120s）`, link: false }) }, 120_000)
    child.stdout?.on('data', (c: Buffer) => { output += c.toString() })
    child.stderr?.on('data', (c: Buffer) => { output += c.toString() })
    child.on('error', (e) => { clearTimeout(timer); settle({ ok: false, output: `${output}${String(e)}`, link: false }) })
    child.on('close', (code) => { clearTimeout(timer); settle({ ok: code === 0, output, link: false }) })
  })
}

function readBody(req: { on: (e: string, l: (c: Buffer) => void) => void }): Promise<string> {
  return new Promise((resolve, reject) => { let body = ''; req.on('data', (c: Buffer) => { body += c.toString(); if (body.length > 4096) reject(new Error('body too large')) }); req.on('end', () => { resolve(body) }) })
}

export function registerUpdateEndpoint(ctx: Context): void {
  ctx.effect(() => {
    const latestDispose = ctx.webServer.register({
      kind: 'exact', path: LATEST_PATH,
      handler: (_req, res) => { void latestFromGit().then((latest) => { const body = `${JSON.stringify({ latest: latest ?? null })}\n`; res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(body) }) },
    })
    const dispose = ctx.webServer.register({
      kind: 'exact', path: UPDATE_PATH,
      handler: async (req, res) => {
        const send = (status: number, value: unknown): void => { const body = `${JSON.stringify(value)}\n`; res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(body) }
        if (req.method !== 'POST') { send(405, { ok: false, error: 'method not allowed' }); return }
        try {
          const parsed: unknown = JSON.parse(await readBody(req))
          const tag = (parsed as { tag?: unknown }).tag
          if (typeof tag !== 'string' || !/^v\d+\.\d+\.\d+$/.test(tag)) { send(400, { ok: false, error: 'invalid tag' }); return }
          const result = await runInstall(tag)
          send(result.link ? 200 : (result.ok ? 200 : 500), { ok: result.ok, link: result.link, output: result.output.slice(-4000), tag })
        } catch (e) { send(400, { ok: false, error: String((e as Error)?.message ?? e) }) }
      },
    })
    return () => { dispose(); latestDispose() }
  }, 'ui-whale: update endpoint')
}
