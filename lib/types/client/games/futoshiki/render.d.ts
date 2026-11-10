import type { Inequality } from './logic.ts';
/** 逻辑画布尺寸（顶部 HUD + 方形盘面）。 */
export declare const LOGICAL_W = 540;
export declare const LOGICAL_H = 620;
/** 盘面几何：格子边长与符号间隙（不等号画在间隙里）。 */
export interface BoardLayout {
    readonly x: number;
    readonly y: number;
    readonly cell: number;
    readonly gap: number;
    readonly boardPx: number;
}
/** 按边长计算盘面几何（居中于 HUD 下方区域）。
 * @param size - 盘面边长。
 * @returns 布局参数。 */
export declare function boardLayout(size: number): BoardLayout;
/** 逻辑坐标 → 格子序号。
 * @param x - 逻辑 x。
 * @param y - 逻辑 y。
 * @param size - 盘面边长。
 * @returns 格子序号，格隙或盘外为 -1。 */
export declare function cellAt(x: number, y: number, size: number): number;
/** 格子中心坐标。
 * @param size - 盘面边长。
 * @param cell - 格子序号。
 * @returns 中心点。 */
export declare function cellCenter(size: number, cell: number): {
    x: number;
    y: number;
};
/** 传给 renderFutoshiki 的一次完整视图。 */
export interface FutoshikiView {
    /** 盘面边长。 */
    readonly size: number;
    /** 当前盘面（一维，0 为空）。 */
    readonly grid: readonly number[];
    /** 提示数位置标记（与盘面同长）。 */
    readonly givenMask: readonly boolean[];
    /** 不等号约束列表。 */
    readonly constraints: readonly Inequality[];
    /** 选中格序号；null 未选中。 */
    readonly selected: number | null;
    /** 行列重复/不等违反的格子红显标记。 */
    readonly conflictCells: readonly boolean[];
    /** 违反的不等号红显标记（与 constraints 同长）。 */
    readonly conflictSigns: readonly boolean[];
    /** HUD 关卡标签。 */
    readonly levelLabel: string;
    /** 已填格数。 */
    readonly filled: number;
    /** 结束/过关标题；null 表示进行中不遮罩。 */
    readonly statusText: string | null;
    readonly statusSub: string;
    readonly statusColor: string;
    readonly paused: boolean;
}
/** 一局完整绘制：背景 → HUD → 格子与数字 → 不等号 → 选中高亮 → overlay。 */
export declare function renderFutoshiki(ctx: CanvasRenderingContext2D, view: FutoshikiView): void;
