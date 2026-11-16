import type { Inventory, Level, Piece, PieceType } from './logic.ts';
/** 逻辑画布尺寸。 */
export declare const LOGICAL_W = 960;
export declare const LOGICAL_H = 600;
/** 渲染视图快照：index 每帧组装，render 只读不存状态。 */
export interface DominoView {
    level: Level;
    levelIndex: number;
    pieces: Piece[];
    phase: 'build' | 'chain';
    fallen: number[];
    outcome: null | 'won' | 'lost';
    paused: boolean;
    hoverX: number | null;
    selectedType: PieceType;
    left: Inventory;
    pips: number[];
    /** 连锁开始后经过的毫秒（倒下波浪进度）。 */
    animMs: number;
    score: number | null;
}
interface Geometry {
    cell: number;
    originX: number;
    bottomY: number;
}
/** 盘面几何：按列数与最高地形算格子尺寸，盘面水平居中、锚在库存栏上方。 */
export declare function geometry(level: Level): Geometry;
/** 画布逻辑坐标 → 盘面列号（不在盘面竖向范围内返回 null）。 */
export declare function columnAt(level: Level, px: number, py: number): number | null;
/** 整帧绘制入口（index 每个渲染帧调用一次）。 */
export declare function renderScene(ctx: CanvasRenderingContext2D, view: DominoView): void;
export {};
