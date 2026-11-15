
export function describe(_name, fn) { fn() }
const failures = []
export function it(name, fn) {
  try { fn() ; console.log('  ok - ' + name) }
  catch (e) { failures.push({ name, message: String(e && e.message) }); console.log('  FAIL - ' + name + ' :: ' + String(e && e.message).split('\n')[0]) }
}
function deepEqual(a, b) {
  if (a === b) return true
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return Number.isNaN(a) && Number.isNaN(b)
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const ka = Object.keys(a), kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  for (const k of ka) if (!deepEqual(a[k], b[k])) return false
  return true
}
function assert(cond, msg) { if (!cond) throw new Error(msg) }
export function expect(actual) {
  const make = (polarity) => ({
    toBe: (v) => assert(polarity === (actual === v), 'expected ' + JSON.stringify(actual) + (polarity ? ' === ' : ' !== ') + JSON.stringify(v)),
    toEqual: (v) => assert(polarity === deepEqual(actual, v), 'expected deep ' + (polarity ? 'equal' : 'not equal') + ': ' + JSON.stringify(actual) + ' vs ' + JSON.stringify(v)),
    toBeNull: () => assert(polarity === (actual === null), 'expected ' + JSON.stringify(actual) + (polarity ? ' null' : ' non-null')),
    toBeCloseTo: (v, digits = 2) => assert(polarity === (Math.abs(actual - v) < Math.pow(10, -digits) / 2), 'expected ' + actual + ' close to ' + v),
    toBeGreaterThan: (v) => assert(polarity === (actual > v), 'expected ' + actual + (polarity ? ' > ' : ' <= ') + v),
    toBeGreaterThanOrEqual: (v) => assert(polarity === (actual >= v), 'expected ' + actual + (polarity ? ' >= ' : ' < ') + v),
    toBeLessThan: (v) => assert(polarity === (actual < v), 'expected ' + actual + (polarity ? ' < ' : ' >= ') + v),
    toBeLessThanOrEqual: (v) => assert(polarity === (actual <= v), 'expected ' + actual + ( <= ' : ' > ') + v),
    toHaveLength: (n) => assert(polarity === (actual.length === n), 'expected length ' + actual.length + (polarity ? ' == ' : ' != ') + n),
    toContain: (v) => assert(polarity === (actual.includes(v)), 'expected contain mismatch'),
    get not() { return make(!polarity) },
  })
  return make(true)
}
export const failuresRef = failures
