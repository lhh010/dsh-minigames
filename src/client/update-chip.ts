/**
 * Floating update chip for the whale pet: appears once when a newer version
 * exists; click updates via the host endpoint (falling back to copying the
 * prompt). Self-contained fixed DOM — no slot/panel dependency.
 */
import { PLUGIN_VERSION, fetchLatestTag, compareSemver, runUpdate, updatePrompt, UPDATE_ID, MIRROR, PACKAGE_SPEC } from './update-check.ts'

let started = false

export function startUpdateChip(): void {
  if (started) return
  started = true
  void fetchLatestTag().then((tag) => {
    if (tag === undefined) return
    if (compareSemver(tag, PLUGIN_VERSION) <= 0) return
    renderChip(tag)
  })
}

function renderChip(tag: string): void {
  if (document.querySelector(`[data-update-chip="${UPDATE_ID}"]`) !== null) return
  const el = document.createElement('div')
  el.setAttribute('data-update-chip', UPDATE_ID)
  el.setAttribute('role', 'button')
  el.setAttribute('title', `更新到 ${tag}`)
  el.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:2147483000;display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border:1px solid #4a7dff;border-radius:10px;background:#1e2430;color:#cfe0ff;font:12px/1.4 system-ui,Segoe UI,sans-serif;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.35);'
  el.textContent = `⟳ 小游戏 新版本 ${tag} 可用，点击更新`
  el.addEventListener('pointerdown', (event) => { event.stopPropagation() })
  el.addEventListener('click', () => {
    el.textContent = '更新中…'
    void runUpdate(tag).then((result) => {
      if (result.ok) {
        el.textContent = `已更新到 ${tag}，请硬刷新（Ctrl/Cmd+Shift+R）`
        el.setAttribute('title', '已更新，硬刷新生效')
        return
      }
      if (result.link) {
        void navigator.clipboard?.writeText(updatePrompt(tag))
          .then(() => { el.textContent = `本地 link 安装：已跳过自动更新，更新提示词已复制到剪贴板` })
          .catch(() => { el.textContent = `本地 link：请手动执行 pnpm add '${PACKAGE_SPEC}@github:${MIRROR}#${tag}'` })
        el.setAttribute('title', '悬停查看本地 link 说明')
        return
      }
      void navigator.clipboard?.writeText(updatePrompt(tag))
        .then(() => { el.textContent = `自动更新失败（详见剪贴板提示词）：${result.detail.slice(0, 80)}` })
        .catch(() => { el.textContent = `自动更新失败：${result.detail.slice(0, 80)}` })
      el.setAttribute('title', result.detail)
    })
  })
  document.body.appendChild(el)
}