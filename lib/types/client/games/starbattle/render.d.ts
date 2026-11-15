/**
 * 星之战 canvas 渲染器：连续格子盘（无格缝），区域按 accent 轮换淡色
 * 底 + 跨区域粗边界描边；星为金色五角（放置弹跳 easeOutBack），✗ 为
 * 双斜线标记；冲突星红显（红光 + 红星 + 红格底）；行/列计数徽标在左/
 * 上留白带（当前/目标），区域计数徽标在各区左上角；HUD（关卡/星数/
 * 提示/计时）与过关/暂停遮罩。无状态 —— 状态由调用方持有；使用共享
 * 视觉件 (../theme.ts)。
 */
import type { StarPuzzle } from './logic.ts';
export declare const HUD_H = 30;
export declare const TOP_GUTTER = 18;
export declare const LEFT_GUTTER = 24;
export declare const PAD = 12;
/** 格边长随盘面增大而缩小。 */
export declare function cellSize(size: number): number;
/** 盘面左上角在逻辑坐标中的位置。 */
export declare function boardOrigin(size: number): {
    x: number;
    y: number;
};
export declare function boardW(size: number): number;
export declare function logicalW(size: number): number;
export declare function logicalH(size: number): number;
/** 格 (r, c) 左上角在逻辑坐标中的位置。 */
export declare function cellOrigin(size: number, r: number, c: number): {
    x: number;
    y: number;
};
/** 逻辑坐标点命中的格，盘外返回 null。 */
export declare function cellAt(size: number, x: number, y: number): {
    r: number;
    c: number;
} | null;
/** 格中心（粒子爆发用）。 */
export declare function cellCenter(size: number, r: number, c: number): {
    x: number;
    y: number;
};
/** 一帧所需的玩家视图状态。 */
export interface StarView {
    /** 格标记数组（0 空 / 1 星 / 2 ✗），长度 size×size。 */
    marks: readonly number[];
    /** 展示关卡号（1 基）。 */
    level: number;
    /** 已放星数。 */
    placed: number;
    /** 提示剩余次数。 */
    hintsLeft: number;
    /** 计时文本 'm:ss'。 */
    elapsed: string;
    /** 悬停格下标，-1 无。 */
    hover: number;
    /** 放星时刻（格下标 → ms），弹跳动画用。 */
    bornAt: ReadonlyMap<number, number>;
    /** 当前时刻 ms（与 bornAt 同源）。 */
    nowMs: number;
    /** 显示暂停遮罩。 */
    paused: boolean;
    /** 过关遮罩副标题，游玩中为 null。 */
    winText: string | null;
}
/** 放置弹跳缓动（easeOutBack：过冲回弹到 1）。 */
export declare function popScale(ageMs: number): number;
/**
 * 绘制一帧。
 * @param ctx - 画布上下文。
 * @param puzzle - 当前关卡。
 * @param view - 玩家视图状态。
 */
export declare function renderStarBattle(ctx: CanvasRenderingContext2D, puzzle: StarPuzzle, view: StarView): void;
