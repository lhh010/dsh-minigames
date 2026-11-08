/**
 * 冰面滑行渲染层：冰面格子（淡蓝渐变 + 高光）、雪块墙壁、闪光宝石、
 * 尖刺、出口、企鹅玩家（按滑行方向倾斜 + 拖尾）、HUD 与过关/失败遮罩。
 * 纯 canvas 绘制，无 DOM、无游戏状态；动画进度由 index 层通过 view 传入。
 */
import { type ParticleSystem } from '../theme.ts';
import { type IceState, type SlideDir } from './logic.ts';
/** 逻辑画布尺寸（fitCanvas 的坐标系）。 */
export declare const LOGICAL_W = 640;
export declare const LOGICAL_H = 520;
/** 滑行动画进行中的一帧描述。 */
export interface IceSlideAnim {
    /** 出发格。 */
    from: number;
    /** 途经格（含终点）。 */
    path: number[];
    /** 方向。 */
    dir: SlideDir;
    /** 进度 0..1。 */
    t: number;
}
/** 渲染一帧所需的视图参数。 */
export interface IceSlideView {
    paused: boolean;
    /** 全部通关（遮罩用）。 */
    finished: boolean;
    /** 单调时钟（ms），驱动宝石闪光与出口脉冲。 */
    timeMs: number;
    /** 正在播放的滑行动画；null 表示静止。 */
    slide: IceSlideAnim | null;
    /** 玩家朝向（倾斜姿态）。 */
    facing: SlideDir;
}
/** 棋盘几何：格边长与左上原点（逻辑坐标）。 */
export interface BoardMetrics {
    cell: number;
    ox: number;
    oy: number;
}
/**
 * 计算某关的棋盘几何：格子等比缩放并水平垂直居中。
 * @param level 关卡
 */
export declare function boardMetrics(level: IceState['level']): BoardMetrics;
/**
 * 渲染一帧：背景 → 棋盘 → 实体 → 拖尾/玩家 → 粒子 → HUD → 遮罩。
 * @param ctx 逻辑坐标系上下文（fitCanvas 已变换）
 * @param state 游戏状态
 * @param view 视图参数（动画进度、暂停等）
 * @param fx 可选粒子系统（吃宝石/过关时由 index 层 burst）
 * @param dtMs 距上一渲染帧的毫秒（驱动粒子；默认 0 冻结）
 */
export declare function renderIceSlide(ctx: CanvasRenderingContext2D, state: IceState, view: IceSlideView, fx?: ParticleSystem, dtMs?: number): void;
