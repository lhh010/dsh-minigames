import { type WordGridState } from './logic.ts';
/** 逻辑画布尺寸。 */
export declare const LOGICAL_W = 660;
export declare const LOGICAL_H = 620;
/** 传给 renderWordGrid 的一次完整视图。 */
export interface WordGridView {
    /** 关卡状态（盘面/目标词/提示档位/尝试/得分/阶段）。 */
    readonly state: WordGridState;
    /** 当前选词链（格子序号序列）。 */
    readonly chain: readonly number[];
    /** 刚揭示的提示：目标词下标与时间戳（翻页动画用），无则 index < 0。 */
    readonly hintIndex: number;
    readonly hintAtMs: number;
    /** 底部提示文案（空串隐藏）。 */
    readonly message: string;
    /** 是否暂停（外部 P 键）。 */
    readonly paused: boolean;
}
/** 格子序号 → 瓦片左上角坐标。
 * @param cell - 格子序号。
 * @returns 左上角坐标。 */
export declare function tileOrigin(cell: number): {
    x: number;
    y: number;
};
/** 格子序号 → 瓦片中心坐标。
 * @param cell - 格子序号。
 * @returns 中心坐标。 */
export declare function tileCenter(cell: number): {
    x: number;
    y: number;
};
/** 逻辑坐标 → 格子序号（点击命中测试）。
 * @param x - 逻辑 x。
 * @param y - 逻辑 y。
 * @returns 格子序号，格隙或盘外为 -1。 */
export declare function tileAt(x: number, y: number): number;
/** 提示卡区域下标（点击卡也可翻提示由 index.ts 决定，这里只给几何）。
 * @param y - 逻辑 y。
 * @returns 目标词下标，卡外为 -1。 */
export declare function cardAt(y: number): number;
/** 渲染一帧完整画面。
 * @param ctx - 画布上下文（逻辑坐标已由 fitCanvas 变换）。
 * @param view - 当前视图状态。
 * @param now - performance.now() 时间戳（动画计时）。 */
export declare function renderWordGrid(ctx: CanvasRenderingContext2D, view: WordGridView, now: number): void;
