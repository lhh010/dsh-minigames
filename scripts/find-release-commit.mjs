#!/usr/bin/env node
/**
 * find-release-commit.mjs — print the commit that introduced a version.
 *
 * Searches package.json history for the newest commit whose diff added the
 * exact '"version": "X.Y.Z"' line (git log -S with a fixed string). Prints
 * HEAD as a fallback so the auto-release workflow never tags nothing. Kept
 * as a script (not inline shell) because quoting the pattern inside
 * YAML+bash mangled it and mis-tagged v0.10.2 on a docs commit.
 *
 * Usage: node scripts/find-release-commit.mjs 0.10.2
 */
import { execFileSync } from 'node:child_process'

const ver = process.argv[2]
if (ver === undefined || !/^\d+\.\d+\.\d+$/.test(ver)) {
  console.error('usage: node scripts/find-release-commit.mjs X.Y.Z')
  process.exit(1)
}
const needle = '"version": "' + ver + '"'
let sha = ''
try {
  sha = execFileSync('git', ['log', '--format=%H', '-1', '-S', needle, '--', 'package.json'], { encoding: 'utf8' }).trim()
} catch { /* fall through to HEAD */ }
if (sha === '') {
  sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  console.error('find-release-commit: no -S match, falling back to HEAD')
}
process.stdout.write(sha)
