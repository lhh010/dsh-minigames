#!/usr/bin/env node
/**
 * sync-mirrors.mjs — per-mirror self-referencing install sources.
 *
 * Before pushing to each remote, rewrites the GitHub org inside the
 * install-source URLs of the docs (README*.md / INSTALL*.md) to that remote's
 * own organization, so every mirror's documentation points at itself:
 *   origin -> dsh-external, public -> lhh010, omdsh -> omdsh-dev.
 * The working tree keeps lhh010 (the public default) after the run.
 *
 * Usage: node sync-mirrors.mjs            (rewrite, commit, push each mirror)
 *        node sync-mirrors.mjs --no-push  (rewrite + commit only)
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const REMOTES = [
  ['origin', 'dsh-external'],
  ['public', 'lhh010'],
  ['omdsh', 'omdsh-dev'],
]
const DOCS = ['README.md', 'README.en.md', 'INSTALL.md', 'INSTALL.en.md']
const ORGS = ['dsh-external', 'lhh010', 'omdsh-dev']

const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const REPO = pkg.name.split('/').pop() ?? pkg.name
const noPush = process.argv.includes('--no-push')

const git = (...args) => execFileSync('git', args, { stdio: ['ignore', 'inherit', 'inherit'] })
const gitOut = (...args) => execFileSync('git', args, { encoding: 'utf8' })

/** Rewrite install-source orgs in every doc to the target org. */
function rewrite(targetOrg) {
  let changed = false
  for (const doc of DOCS) {
    if (!existsSync(doc)) continue
    const text = readFileSync(doc, 'utf8')
    let next = text
    for (const org of ORGS) {
      if (org === targetOrg) continue
      next = next.replaceAll(`github.com/${org}/${REPO}`, `github.com/${targetOrg}/${REPO}`)
      next = next.replaceAll(`github:${org}/${REPO}`, `github:${targetOrg}/${REPO}`)
    }
    if (next !== text) {
      writeFileSync(doc, next)
      changed = true
    }
  }
  return changed
}

if (gitOut('status', '--porcelain').trim() !== '') {
  git('add', '-A')
  git('commit', '-m', 'docs: 保存待同步改动（sync-mirrors）')
}

for (const [remote, org] of REMOTES) {
  if (rewrite(org)) {
    git('add', '-A')
    git('commit', '-m', `docs(sync): 安装源指向本镜像组织 ${org}`)
  }
  if (!noPush) {
    git('fetch', remote)
    git('push', '--force-with-lease', remote, 'HEAD:main')
    // README 安装命令引用的发布 tag 必须在每个镜像上存在，否则 pnpm #<tag> 解析失败（此前只推分支漏了 tag）。
    git('push', remote, '--tags')
  }
}

// Restore the canonical public-default org in the working tree.
if (rewrite('lhh010')) {
  git('add', '-A')
  git('commit', '-m', 'docs(sync): 规范安装源恢复为 lhh010（公开默认）')
}
console.log('sync-mirrors: done')
