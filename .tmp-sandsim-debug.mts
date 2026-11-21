
import { createSandSimState, stepOnce } from './src/client/games/sandsim/logic.ts'
const s = createSandSimState(2024, 2)
try {
  for (let i = 0; i < 300; i += 1) stepOnce(s)
  console.log('ok', s.collected, s.goldBurned)
} catch (e) {
  console.log('CRASH', (e as Error).message)
  console.log('rows', s.rows, 'gridLen', s.grid.length, 'cols', s.cols, 'colLen', s.grid[0].length)
}
