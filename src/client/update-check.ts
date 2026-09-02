/**
 * Client-side version check + click-to-update for the whale update chip.
 * Version query prefers the host same-origin endpoint (no GitHub CORS), then
 * the GitHub tags API / raw package.json as fallback.
 */
import pkg from '../../package.json'

export const PLUGIN_VERSION: string = pkg.version
export const MIRROR = 'lhh010/dsh-minigames'
export const UPDATE_ID = 'dsh-minigames'
export const PACKAGE_SPEC = '@dsh-external/dsh-minigames'

interface GithubTag { readonly name: string }

export function compareSemver(a: string, b: string): number {
  const parse = (v: string): number[] => { const p = v.replace(/^v/, '').split('.').map(x => Number(x) || 0); while (p.length < 3) p.push(0); return p }
  const pa = parse(a); const pb = parse(b)
  return (pa[0]! - pb[0]!) || (pa[1]! - pb[1]!) || (pa[2]! - pb[2]!)
}

async function latestFromHost(): Promise<string | undefined> {
  try { const res = await fetch(`/${UPDATE_ID}/latest`, { method: 'GET', signal: AbortSignal.timeout(9000) }); if (!res.ok) return undefined; const b: unknown = await res.json(); const latest = (b as { latest?: string }).latest; return typeof latest === 'string' && /^v\d+\.\d+\.\d+$/.test(latest) ? latest : undefined } catch { return undefined }
}
async function latestFromTags(): Promise<string | undefined> {
  try { const res = await fetch(`https://api.github.com/repos/${MIRROR}/tags?per_page=10`, { headers: { accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(8000) }); if (!res.ok) return undefined; const tags: unknown = await res.json(); if (!Array.isArray(tags)) return undefined; const stable = tags.map((e) => (e as GithubTag).name).filter((n): n is string => typeof n === 'string' && /^v\d+\.\d+\.\d+$/.test(n)); if (stable.length === 0) return undefined; return stable.reduce((newest, t) => (compareSemver(t, newest) > 0 ? t : newest)) } catch { return undefined }
}
async function latestFromRaw(): Promise<string | undefined> {
  try { const res = await fetch(`https://raw.githubusercontent.com/${MIRROR}/main/package.json`, { signal: AbortSignal.timeout(8000) }); if (!res.ok) return undefined; const pkg: unknown = await res.json(); const version = (pkg as { version?: unknown }).version; return typeof version === 'string' && /^\d+\.\d+\.\d+$/.test(version) ? `v${version}` : undefined } catch { return undefined }
}
export async function fetchLatestTag(): Promise<string | undefined> {
  // All sources race in parallel: total latency is the slowest one instead of
  // their sum, so an offline machine shows the failure chip within seconds.
  const [host, tags, raw] = await Promise.all([latestFromHost(), latestFromTags(), latestFromRaw()])
  return host ?? tags ?? raw
}
export function updatePrompt(tag: string): string {
  return [
    `帮我更新 ${UPDATE_ID} 插件到 ${tag}，步骤：`,
    `0. 先执行 dsh --version 确认本地 DSH 版本，并对照 https://github.com/${MIRROR} 的 README「版本兼容」表——不同 DSH 版本需安装不同插件 tag，装错版本会启动崩溃；若本提示词给的 tag 与你的 DSH 版本不匹配，请改装表中对应 tag`,
    `1. 执行 dsh plugin --profile web add '${PACKAGE_SPEC}@github:${MIRROR}#${tag}'（首次可能被 pnpm 11 拦截构建脚本，则先在 ~/.dsh/profiles/web 执行 pnpm approve-builds --all）`,
    '2. 完成后提醒我硬刷新浏览器（Ctrl/Cmd+Shift+R）',
    `3. 遇到安装失败 / 版本不匹配 / 启动报错：先查 https://github.com/${MIRROR} README 的「版本兼容」与「已知限制」章节再排查`,
  ].join('\n')
}
export interface UpdateResult { readonly ok: boolean; readonly detail: string; readonly link?: boolean; readonly recovery?: string; readonly hostChanged?: boolean }
export async function runUpdate(tag: string): Promise<UpdateResult> {
  try {
    const res = await fetch(`/${UPDATE_ID}/update`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-dsh-plugin-update': 'click' }, body: JSON.stringify({ tag }), signal: AbortSignal.timeout(130000) })
    const body: unknown = await res.json().catch(() => ({}))
    const parsed = body as { ok?: boolean; output?: string; error?: string; link?: boolean; recovery?: string; hostChanged?: boolean }
    return { ok: res.ok && parsed.ok === true, detail: typeof parsed.output === 'string' ? parsed.output : (parsed.error ?? String(res.status)), link: parsed.link === true, ...(typeof parsed.recovery === 'string' ? { recovery: parsed.recovery } : {}), ...(parsed.hostChanged === true ? { hostChanged: true } : {}) }
  } catch (e) { return { ok: false, detail: String((e as Error)?.message ?? e) } }
}
