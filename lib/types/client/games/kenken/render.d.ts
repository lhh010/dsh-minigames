/**
 * 贤贤 KenKen 画布渲染：笼粗边框 + 左上角目标标注（如 '12×'）、格子数
 * 字、行/列重复与笼运算错误的红色高亮、铅笔候选小标、选中格光圈、
 * 关卡 HUD 与暂停/过关遮罩。纯函数无自有状态，全部状态由调用方持有；
 * 视觉走共享主题（../theme.ts）。
 */
import type { KenkenPuzzle } from './logic.ts';
export declare const CELL = 88;
export declare const PAD = 16;
export declare const HUD_H = 34;
export declare const FOOT_H = 20;
export declare const BOARD: number;
export declare const logicalW: number;
export declare const logicalH: number;
/** 格子 (r, c) 左上角的逻辑坐标。 */
export declare function cellOrigin(r: number, c: number): {
    x: number;
    y: number;
};
/** 逻辑坐标落在哪个格子；盘外返回 null。 */
export declare function cellAt(x: number, y: number): {
    r: number;
    c: number;
} | null;
/** 格子中心（粒子迸发定位）。 */
export declare function cellCenter(r: number, c: number): {
    x: number;
    y: number;
};
/** 一帧的玩家视图状态（均由 index.ts 持有）。 */
export interface KenkenView {
    /** 玩家填数（0 = 空）。 */
    grid: readonly (readonly number[])[];
    /** 铅笔候选位掩码：bit (d-1) 置位表示候选 d。 */
    notes: readonly (readonly number[])[];
    /** 选中的格子，或 null。 */
    selected: {
        r: number;
        c: number;
    } | null;
    /** 错误格标记（logic.cellErrors 的产物）。 */
    errors: readonly (readonly boolean[])[];
}
/**
 * 绘制一帧：底格 + 细网格线 + 笼粗边框与标注 + 数字/候选 + 错误红显
 * + HUD；paused / winText 非空时盖遮罩。
 */
export declare function renderKenken(ctx: CanvasRenderingContext2D, puzzle: KenkenPuzzle, view: KenkenView, elapsed: string, paused: boolean, winText: string | null): void;
