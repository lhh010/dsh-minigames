/**
 * 真珠回路渲染器：细网格 + 格点、圆角连续描边的回路、白珠白圈 /
 * 黑珠黑圈、违规红标（分叉/交叉点、已证伪珠格）、提示边闪烁、完成
 * 回路发光动画与过关/暂停 overlay。使用共享视觉套件（../theme.ts）。
 */
import { type EdgeState, type Pearl } from './logic.ts';
/** 渲染视图状态（由 index.ts 组装）。 */
export interface MasyuView {
    w: number;
    h: number;
    pearls: Pearl[];
    edges: EdgeState[];
    /** 悬停边索引，-1 无。 */
    hover: number;
    /** 提示边索引，-1 无。 */
    hintEdge: number;
    /** 提示闪烁强度 0..1（0 不画）。 */
    hintAlpha: number;
    levelLabel: string;
    unique: boolean;
    elapsed: string;
    solved: boolean;
    /** 完成发光脉冲 0..1（呼吸相位）。 */
    solvedPulse: number;
    paused: boolean;
}
/** 逻辑画布宽。 */
export declare function logicalW(w: number): number;
/** 逻辑画布高。 */
export declare function logicalH(h: number): number;
/** 格点 (col,row) 的像素坐标。 */
export declare function dotX(col: number): number;
/** 格点 (col,row) 的像素坐标。 */
export declare function dotY(row: number): number;
/**
 * 指针位置对应的边索引（-1 无）：最近边匹配，把指针换算成格点浮点
 * 坐标后在水平/垂直候选里取更近者，容差 HIT_CELLS。
 */
export declare function edgeAt(w: number, h: number, x: number, y: number): number;
/** 主渲染入口。 */
export declare function renderMasyu(ctx: CanvasRenderingContext2D, view: MasyuView): void;
