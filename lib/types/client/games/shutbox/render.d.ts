export declare const LOGICAL_W = 480;
export declare const LOGICAL_H = 620;
/** 一局的阶段：待掷骰 / 待翻板 / 本局结束 / 整场结束。 */
export type ShutboxPhase = 'needRoll' | 'needMove' | 'roundOver' | 'ended';
/** 渲染所需的全部游戏视图状态（index.ts 持有并传入）。 */
export interface ShutboxView {
    /** 翻板状态（下标 i = 数字 i+1，true 立着）。 */
    up: boolean[];
    /** 当前选中的数字（子和未达骰面总和前可继续增选）。 */
    selected: number[];
    /** 最近一次骰面（未掷过或本局已结算为 null）。 */
    dice: readonly number[] | null;
    /** 掷骰滚动动画进行中。 */
    rolling: boolean;
    /** 当前阶段。 */
    phase: ShutboxPhase;
    /** 当前局号（1..5）。 */
    roundNo: number;
    /** 本局累计连击加分。 */
    comboPoints: number;
    /** 每局得分（已结算的局）。 */
    roundScores: number[];
    /** 整场总分。 */
    total: number;
    /** 本局是否关箱（roundOver 阶段的展示用）。 */
    roundShut: boolean;
    /** 临时提示文本，空串表示无。 */
    toast: string;
    /** 玩家按 P 的手动暂停。 */
    userPaused: boolean;
    /** 面板驱动的暂停（实例未运行）。 */
    paused: boolean;
}
/** 第 n 块数字板（1..9）的矩形。 */
export declare function tileRect(n: number): {
    x: number;
    y: number;
    w: number;
    h: number;
};
/**
 * 命中检测：返回点击到的数字（1..9），未命中返回 null。
 */
export declare function tileAt(x: number, y: number): number | null;
/** 掷骰按钮命中。 */
export declare function rollButtonAt(x: number, y: number): boolean;
/**
 * 绘制一帧。
 * @param nowMs - 当前时间戳（毫秒），驱动滚动动画的轮换面与抖动相位。
 */
export declare function renderShutbox(ctx: CanvasRenderingContext2D, view: ShutboxView, nowMs: number): void;
