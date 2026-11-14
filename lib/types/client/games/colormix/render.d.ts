/**
 * 调色大师画布渲染：并排大色块（当前 vs 目标）、三原色滴剂按钮与
 * 提交键（可点击命中检测）、滴入涟漪、色差读数 + 接近度弧、滴数/关卡
 * HUD、过关/失败/通关/暂停覆盖层。共享 theme 视觉件；无状态。
 */
import type { RGB } from './logic.ts';
export declare const LOGICAL_W = 480;
export declare const LOGICAL_H = 620;
export declare const HUD_H = 30;
/** 三个滴剂按钮的圆心与半径（index 用它落涟漪）。 */
export declare const DROP_BUTTONS: ReadonlyArray<{
    x: number;
    y: number;
    r: number;
}>;
/** 渲染所需的全部游戏视图状态（index.ts 持有并传入）。 */
export interface ColorMixView {
    /** 当前滴数下标（0 = L1）。 */
    levelIdx: number;
    /** 本关滴数上限。 */
    maxDrops: number;
    /** 已滴滴剂序列（每项 0..2）。 */
    drops: number[];
    /** 当前混合色（drops 为空时 null，画空盘）。 */
    current: RGB | null;
    /** 目标色与其名称。 */
    target: RGB;
    targetName: string;
    /** 当前色差（current 为 null 时 null）。 */
    distance: number | null;
    /** 本关阈值。 */
    threshold: number;
    /** 各原色已滴数（徽标展示）。 */
    usedPer: number[];
    score: number;
    status: 'playing' | 'cleared' | 'failed' | 'complete';
    paused: boolean;
    /** 活动涟漪（圆心/年龄/寿命，毫秒）。 */
    ripples: Array<{
        x: number;
        y: number;
        age: number;
        maxAge: number;
        color: string;
    }>;
}
/**
 * 滴剂按钮 / 提交键命中检测。
 * @returns 色号 0..2 或 'SUBMIT'，未命中返回 null。
 */
export declare function dropAt(x: number, y: number): number | 'SUBMIT' | null;
/**
 * 绘制一帧。
 */
export declare function renderColorMix(ctx: CanvasRenderingContext2D, view: ColorMixView): void;
