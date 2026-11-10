/**
 * 弹跳机器人渲染层：盘面网格与墙块、四色机器人（滑行动画插值）、目标格
 * 同色光环脉冲、HUD（关卡 / 步数 / par / 分数）、底部方向按钮（供 index
 * 命中检测）、暂停 / 过关 / 失败遮罩与过关粒子。渲染为无状态纯绘制。
 */
import { type Dir, type Pos, type RicochetState } from './logic.ts';
/** 滑行动画时长 ms（与 index 层共用）。 */
export declare const SLIDE_MS = 140;
/** 一个方向按钮的命中区。 */
export interface DirButton {
    /** 触发方向。 */
    dir: Dir;
    /** 按钮区左上角 x px。 */
    x: number;
    /** 按钮区左上角 y px。 */
    y: number;
    /** 宽 px。 */
    w: number;
    /** 高 px。 */
    h: number;
    /** 按钮箭头字符。 */
    label: string;
}
/** 底部四个方向按钮（顺序 ↑ ↓ ← →）。 */
export declare const DIR_BUTTONS: DirButton[];
/** 渲染选项。 */
export interface RicochetRenderOpts {
    /** 滑行动画：本回合各机器人的出发位置（null 无动画）。 */
    animFrom: Pos[] | null;
    /** 动画进度 0..1。 */
    animT: number;
    /** 是否暂停遮罩。 */
    paused: boolean;
    /** 当前时间 ms（目标光环脉冲相位）。 */
    nowMs: number;
}
/** 四色机器人的配色（取主题色 ramp 的稳定索引）。 */
export declare const ROBOT_COLORS: string[];
/**
 * 主渲染入口：背景、盘面、目标、机器人、HUD、方向按钮、粒子与遮罩。
 * @param ctx - 画布上下文（已施加逻辑坐标变换）。
 * @param state - 当前状态。
 * @param opts - 渲染选项（动画、暂停、时间）。
 */
export declare function renderRicochet(ctx: CanvasRenderingContext2D, state: RicochetState, opts: RicochetRenderOpts): void;
/**
 * 过关时在目标格位置喷发庆祝粒子（index 层调用）。
 * @param state - 当前状态。
 */
export declare function burstWin(state: RicochetState): void;
/**
 * 方向按钮命中检测。
 * @param x - 逻辑坐标 x px。
 * @param y - 逻辑坐标 y px。
 * @returns 命中的方向；未命中返回 null。
 */
export declare function hitDirectionButton(x: number, y: number): Dir | null;
