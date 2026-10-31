#!/usr/bin/env node
/**
 * add-compat-row.mjs — prepend a release row to compatibility.json.
 *
 * Copies the newest existing entry's supported-DSH list (releases without a
 * compatibility change declare the same support set as their predecessor).
 * Called by the auto-release workflow when a pushed package.json version has
 * no compatibility row yet; safe to run by hand.
 *
 * Usage: node scripts/add-compat-row.mjs v0.10.2
 */
import { readFileSync, writeFileSync } from 'node:fs'

const tag = process.argv[2]
if (tag === undefined || !/^v\d+\.\d+\.\d+$/.test(tag)) {
  console.error('usage: node scripts/add-compat-row.mjs vX.Y.Z')
  process.exit(1)
}
const path = new URL('../compatibility.json', import.meta.url)
const compat = JSON.parse(readFileSync(path, 'utf8'))
if (compat.versions[tag] !== undefined) {
  console.log('compatibility row for ' + tag + ' already present')
  process.exit(0)
}
const newest = Object.keys(compat.versions)[0]
if (newest === undefined) {
  console.error('compatibility.json has no entries to copy from')
  process.exit(1)
}
const versions = { [tag]: compat.versions[newest], ...compat.versions }
writeFileSync(path, JSON.stringify({ schema: compat.schema, note: compat.note, versions }, null, 2) + '\n')
console.log('added ' + tag + ' copying ' + newest)
