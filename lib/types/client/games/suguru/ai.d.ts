/**
 * 数块分帧求解器（演示 AI）：与 logic.ts 同一受限回溯（候选 = 区域内
 * 未用 & 王邻域未用），但做成可恢复的迭代栈 —— 每次 step(maxNodes) 只
 * 消耗有限节点即返回，调用方每帧喂一点预算，绝不在一帧内算完整个
 * 搜索。搜索从当前盘面（含玩家已填格）出发，找任意规则成立的完整填
 * 法，因此也能当「从残局提示到底」的演示引擎。
 */
import { type SuguruPuzzle } from './logic.ts';
/** 单步求解状态。 */
export type StepStatus = 'solving' | 'done' | 'stuck';
/** 可恢复的受限回溯求解器。 */
export interface StepSolver {
    /** 消耗至多 maxNodes 个节点后返回当前状态。 */
    step(maxNodes: number): StepStatus;
    /** 求解工作盘（含给定格与已试填的值；done 时即完整解）。 */
    readonly grid: readonly number[];
    /** 累计消耗的节点数（诊断/测试）。 */
    readonly nodes: number;
}
/**
 * 建一个从 `start` 盘面出发的分帧求解器。
 * @param puzzle - 当前关卡。
 * @param start - 起始盘面（玩家当前填数，给定格为锁定值）。非规则值
 *   （区域重复 / 邻域同数 / 越界）的格子会被清空后参与搜索。
 */
export declare function createStepSolver(puzzle: SuguruPuzzle, start: readonly number[]): StepSolver;
