/** 渲染视图（由 index.ts 组装，render 不持有状态）。 */
export interface FloodItView {
    size: number;
    board: number[];
    /** 左上连通片标记（length = size*size）。 */
    inFlood: boolean[];
    movesLeft: number;
    maxSteps: number;
    levelLabel: string;
    /** 单调秒，驱动连通片流光呼吸。 */
    timeSec: number;
    /** H 提示的贪心下一步色索引，-1 无。 */
    hint: number;
    /** 色板悬停索引，-1 无。 */
    hover: number;
    won: boolean;
    lost: boolean;
    paused: boolean;
    /** 过关 overlay 副标题（含得分）。 */
    subtitle: string;
}
export declare function logicalW(size: number): number;
export declare function logicalH(size: number): number;
/**
 * 色板命中检测：返回指针下的颜色索引，不在色板区域返回 -1。
 * @param size - 盘面边长（决定逻辑高度布局）。
 * @param x - 逻辑坐标 x。
 * @param y - 逻辑坐标 y。
 */
export declare function paletteColorAt(size: number, x: number, y: number): number;
/** 绘制整帧。 */
export declare function renderFloodIt(ctx: CanvasRenderingContext2D, view: FloodItView): void;
