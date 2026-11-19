/**
 * 诺诺旋转 canvas 渲染：共享主题套件上的非ograms 盘面——四周行列线索随朝向
 * 重新布局（旋转后线索区重排并高亮未满足线）、指南针指示当前朝向、顶部 HUD
 * （关卡 / 剩余校验 / 最近错格数 / 得分）、校验按钮、以及过关时图案显形的
 * overlay。纯绘制，无输入处理。
 */
import type { NonospinState } from './logic.ts';
/** 单元格逻辑边长。 */
export declare const CELL = 36;
/** 顶部 HUD 行高。 */
export declare const HUD_H = 36;
/** 线索区：列线索在顶部（纵向堆叠），行线索在左侧（横向排列）。 */
export declare const CLUE_W = 104;
export declare const CLUE_H = 86;
/** 最大盘面（10x10）。 */
export declare const MAX_SIZE = 10;
export declare const BOARD_MAX: number;
export declare const LOGICAL_W: number;
export declare const LOGICAL_H: number;
/** 盘面左上角（所有关卡固定，右侧随 size 留白）。 */
export declare const OX = 104;
export declare const OY: number;
/** 校验按钮区域（HUD 行右侧，index 做点击命中）。 */
export declare function verifyButtonRect(): {
    x: number;
    y: number;
    w: number;
    h: number;
};
/** 逻辑坐标落在哪个格（当前朝向坐标）；盘外返回 null。 */
export declare function cellAt(x: number, y: number, size: number): {
    r: number;
    c: number;
} | null;
/** 渲染选项：悬停格 / 暂停 / 全通关 / 当前累计得分。 */
export interface RenderOptions {
    hover: {
        r: number;
        c: number;
    } | null;
    paused: boolean;
    allClear: boolean;
    score: number;
}
/** 一帧完整绘制。 */
export declare function renderNonospin(ctx: CanvasRenderingContext2D, state: NonospinState, opts: RenderOptions): void;
