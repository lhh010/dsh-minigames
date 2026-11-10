import { type TourState } from './logic.ts';
/** 逻辑画布尺寸（HUD 顶栏 + 下方方形棋盘）。 */
export declare const LOGICAL_W = 520;
export declare const LOGICAL_H = 600;
/** 传给 {@link renderTour} 的一次完整视图。 */
export interface TourView {
    /** 当前局面。 */
    state: TourState;
    /** 当前可达格（高亮）。 */
    reachable: readonly number[];
    /** 提示格（闪烁描边）；null 关闭。 */
    hintCell: number | null;
    /** 提示态：可达格上标出度数。 */
    hintActive: boolean;
    /** 闪烁相位 0..1（锯齿波）。 */
    blink: number;
    /** 档位标签（如 '8×8·完整挑战'）。 */
    levelLabel: string;
    /** 剩余提示次数。 */
    hintsLeft: number;
    /** 结束/暂停标题；null 表示进行中不遮罩。 */
    statusText: string | null;
    statusSub: string;
    statusColor: string;
    paused: boolean;
}
/** 逻辑坐标 → 棋盘格序号。
 * @param x - 逻辑 x。
 * @param y - 逻辑 y。
 * @param size - 棋盘边长。
 * @returns 格序号，棋盘外为 -1。 */
export declare function squareAt(x: number, y: number, size: number): number;
/** 一局完整绘制：背景 → HUD → 棋盘 → 足迹 → 骑士 → overlay。 */
export declare function renderTour(ctx: CanvasRenderingContext2D, view: TourView): void;
