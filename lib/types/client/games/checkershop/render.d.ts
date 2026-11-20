/**
 * 跳棋竞速 CheckersHop 画布渲染：六角菱形星盘（上/下营区三角着色 +
 * 中央六角区）、双色棋子、选中子的全部可达点（一步实心环 + 链跳点连
 * 虚线预览）、顶部局分/行子方/距离和 HUD、底部常驻玩法速览行、暂
 * 停/局终/整场 overlay 与提示 toast。共享 theme 视觉件；本模块无状
 * 态，命中检测为纯函数。
 *
 * 坐标：格心 px = CX + (q + r/2)*SX、py = CY + r*SY（r 向下增大），
 * 盘面在 LOGICAL 空间内水平垂直居中并留边。
 */
import type { CheckersHopPhase, Side } from './logic.ts';
export declare const LOGICAL_W = 560;
export declare const LOGICAL_H = 640;
export declare const CELL_R = 13;
/** 每格中心的渲染坐标（与 CELLS 同序）。 */
export declare const CELL_X: number[];
export declare const CELL_Y: number[];
/** 渲染所需的全部游戏视图状态（index.ts 持有并传入）。 */
export interface CheckersHopView {
    /** 每格占用：0 空、1 你、2 AI。 */
    board: number[];
    turn: Side;
    phase: CheckersHopPhase;
    roundNo: number;
    roundWinsYou: number;
    roundWinsAi: number;
    matchWinner: Side | null;
    roundWinner: Side | null;
    /** 选中的己方子（-1 无）。 */
    selected: number;
    /** 选中子的合法落点（含链跳所有可停点）。 */
    targets: number[];
    /** 双方距离和（HUD 展示）。 */
    distYou: number;
    distAi: number;
    /** 临时提示文本，空串表示无。 */
    toast: string;
    /** 玩家按 P 的手动暂停。 */
    userPaused: boolean;
    /** 面板驱动的暂停（实例未运行）。 */
    paused: boolean;
}
/**
 * 命中检测：距某格心不超过 CELL_R+5 的最近格；未命中返回 -1。
 * @param x 逻辑坐标 x。
 * @param y 逻辑坐标 y。
 */
export declare function cellAt(x: number, y: number): number;
/**
 * 全量重绘一帧（dirty 模式：仅在状态变化或粒子活动时调用）。
 * @param ctx 逻辑坐标系下的 2d 上下文。
 * @param view 当前视图状态。
 */
export declare function renderCheckersHop(ctx: CanvasRenderingContext2D, view: CheckersHopView): void;
