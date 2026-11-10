/**
 * 八皇后画布渲染器：居中棋盘（双色格）、皇后 ♛ 字形（冲突皇后红色辉光）、
 * 悬停格的行/列/两对角线攻击范围提示（悬停皇后时红色连线指向被攻击者）、
 * 档位/皇后数/步数/计时 HUD 与暂停/过关 overlay。渲染器无自有状态；命中
 * 检测辅助函数供 index.ts 把指针坐标换算成格子。
 */
import type { Pos, QueensState } from './logic.ts';
export declare const LOGICAL_W = 460;
/** HUD 高度（档位/皇后数/步数/计时行）。 */
export declare const HUD_H = 30;
/** 底部提示条高度。 */
export declare const HINT_H = 26;
/** 最大档位（8×8）下的总逻辑高度。 */
export declare const LOGICAL_H: number;
/** 某档位下的格子边长与棋盘原点（棋盘水平居中，纵向自 HUD 下方起）。 */
export declare function boardLayout(size: number): {
    x0: number;
    y0: number;
    cell: number;
};
/**
 * 命中检测：逻辑坐标落在哪个格子。
 * @param x - 逻辑 x 坐标。
 * @param y - 逻辑 y 坐标。
 * @param size - 棋盘边长。
 * @returns 行列格；棋盘外返回 null。
 */
export declare function cellAt(x: number, y: number, size: number): Pos | null;
/** 某格中心坐标。 */
export declare function cellCenter(row: number, col: number, size: number): {
    x: number;
    y: number;
};
/** 渲染选项（见 index.ts 的调用方持有状态）。 */
export interface RenderOptions {
    /** 悬停格（攻击范围提示），或 null。 */
    hover: Pos | null;
    /** 本局已流逝毫秒（计时 HUD）。 */
    elapsedMs: number;
    /** 暂停 overlay。 */
    paused: boolean;
    /** 过关 overlay 副标题文案，或 null。 */
    winText: string | null;
}
/**
 * 绘制一帧完整画面。
 * @param ctx - 逻辑坐标系下的 2d 上下文。
 * @param w - 逻辑宽度（LOGICAL_W）。
 * @param h - 逻辑高度（LOGICAL_H）。
 * @param state - 当前局面。
 * @param opts - 渲染选项（悬停、计时、overlay）。
 */
export declare function renderQueens(ctx: CanvasRenderingContext2D, w: number, h: number, state: QueensState, opts: RenderOptions): void;
