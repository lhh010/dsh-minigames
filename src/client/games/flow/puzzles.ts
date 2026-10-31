/**
 * The five canonical 管道连线 puzzles, one per board size, embedded so no
 * runtime generation ever runs. Generation on 8×8/9×9 spends seconds of
 * synchronous solver time (the old freeze); these were produced offline with
 * the exact runtime recipe — seed displayLevel × 0x9e3779b9 through
 * puzzleFromSeed — so they are bit-identical to what the game used to build
 * on the fly. Levels past 5 cycle these boards (sizes already wrap
 * 5×5→9×9); regenerate via scripts/ if logic.ts generation ever changes.
 */
import type { FlowPuzzle } from './logic.ts'

/** Puzzle for 1-based display level 1..5 (index level-1). */
export const EMBEDDED_PUZZLES: readonly FlowPuzzle[] = [
  {
    size: 5,
    dots: [[14,8],[6,7],[23,4],[20,21]],
    solution: [[14,9,8],[6,7],[23,24,19,18,13,12,11,10,5,0,1,2,3,4],[20,15,16,17,22,21]],
    unique: true,
  },
  {
    size: 6,
    dots: [[26,30],[15,31],[13,1],[2,34],[0,28]],
    solution: [[26,25,24,30],[15,21,27,33,32,31],[13,7,1],[2,3,4,5,11,17,23,29,35,34],[0,6,12,18,19,20,14,8,9,10,16,22,28]],
    unique: true,
  },
  {
    size: 7,
    dots: [[30,36],[39,48],[7,0],[12,21],[41,32],[2,35]],
    solution: [[30,37,36],[39,46,47,48],[7,14,15,8,1,0],[12,11,10,9,16,23,22,29,28,21],[41,40,33,34,27,26,25,32],[2,3,4,5,6,13,20,19,18,17,24,31,38,45,44,43,42,35]],
    unique: true,
  },
  {
    size: 8,
    dots: [[21,7],[53,19],[56,48],[27,2],[47,14],[63,59],[42,32]],
    solution: [[21,13,5,6,7],[53,45,46,38,37,29,28,20,12,4,3,11,19],[56,57,49,41,40,48],[27,26,18,17,16,8,0,1,9,10,2],[47,39,31,30,22,23,15,14],[63,55,54,62,61,60,52,44,36,35,43,51,50,58,59],[42,34,33,25,24,32]],
    unique: false,
  },
  {
    size: 9,
    dots: [[58,56],[70,60],[6,61],[28,68],[30,21],[25,9],[43,65],[10,63]],
    solution: [[58,67,66,57,56],[70,69,60],[6,15,16,7,8,17,26,35,34,33,32,31,22,13,12,11,20,29,38,39,40,41,42,51,52,61],[28,37,46,47,48,49,50,59,68],[30,21],[25,24,23,14,5,4,3,2,1,0,9],[43,44,53,62,71,80,79,78,77,76,75,74,65],[10,19,18,27,36,45,54,55,64,73,72,63]],
    unique: false,
  },
]
