
import { createTower, pull, canPull, safePulls, towerStress } from './src/client/games/jenga/logic.ts'
const s = createTower(42, 5)
const r = pull(s, 4, 1)
console.log(JSON.stringify({ r, status: s.status, stress: towerStress(s), safe: safePulls(s).length, top5: canPull(s, 5, 0) }))
