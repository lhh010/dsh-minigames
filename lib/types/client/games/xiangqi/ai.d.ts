/**
 * 中国象棋 AI：negamax + α-β 剪枝、MVV-LVA 吃子排序、吃子静态搜索
 * （quiescence）、子力价值 + 位置分表评估、迭代加深与节点限额。
 * 搜索以"根着法切片"方式分帧执行：createSearch 返回的步进器每次
 * step() 只评估一个根着法（耗时数毫秒），UI 层每帧调用一次即可保证
 * 画面绝不卡死；chooseMove 为同步封装（测试/复用）。
 * 相同 position/depth/budget/seed 下结果完全确定（mulberry32 决胜）。
 */
import { type Move, type Position } from './logic.ts';
/** 每步搜索的节点硬上限（各难度共用）。 */
export declare const NODE_BUDGET = 80000;
/** 将杀分值基线（减 ply 使更快将杀优先）。 */
export declare const MATE = 100000;
/** 难度 1-3 档对应的搜索深度。 */
export declare const LEVEL_DEPTH: readonly [2, 3, 4];
/**
 * 静态评估（红方为正的子力 + 位置分），返回值已换算为行棋方视角。
 * @param pos - 待评估局面。
 * @returns 行棋方视角的分值。
 */
export declare function evaluate(pos: Position): number;
/** mulberry32 种子随机（根着法等分决胜，确定性）。 */
export declare function mulberry32(seed: number): () => number;
export interface SearchResult {
    /** 选定的着法；无合法着法时为 null。 */
    move: Move | null;
    /** 实际访问节点数（<= budget + 少量超出）。 */
    nodes: number;
    /** 完整算完的最深迭代层。 */
    depth: number;
}
/**
 * 分帧搜索步进器：每次 step() 评估一个根着法（一颗子树，耗时有限），
 * 全部根着法评估完即完成一层迭代加深。根着法各用全窗口搜索，保证
 * 兄弟节点分值可直接比较；等分着法由种子随机决胜。
 */
export interface SearchStepper {
    /**
     * 执行下一段计算。
     * @returns done 为 true 时携带最终结果，之后再调用恒返回同一结果。
     */
    step(): {
        done: false;
    } | {
        done: true;
        result: SearchResult;
    };
}
/**
 * 创建分帧搜索。
 * @param pos - 待搜索局面。
 * @param maxDepth - 迭代加深的最大深度。
 * @param budget - 节点限额。
 * @param seed - 等分决胜的随机种子。
 * @returns 搜索步进器。
 */
export declare function createSearch(pos: Position, maxDepth: number, budget: number, seed: number): SearchStepper;
/**
 * 同步选步（测试/复用入口；UI 请用 createSearch 分帧驱动）。
 * @param pos - 待搜索局面。
 * @param maxDepth - 最大搜索深度。
 * @param budget - 节点限额，默认 NODE_BUDGET。
 * @param seed - 决胜随机种子。
 * @returns 搜索结果。
 */
export declare function chooseMove(pos: Position, maxDepth: number, budget?: number, seed?: number): SearchResult;
