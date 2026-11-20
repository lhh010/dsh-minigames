/**
 * 寻宝猎人渲染层：海岛风盘面（沙滩底 + 草地 / 椰树 / 岩石 / 灌木装饰格）、
 * 探测点标记（序号 + 反馈色圈）、同心圆助手参考线（最近两次探测点到其
 * 参考目标的等距圆）、提示排除区斜纹、右侧探测历史列表（坐标 + 反馈
 * 图标）、得分 / 关卡 / 探测次数 / 阶段 HUD、过关（宝箱粒子）与失败 /
 * 暂停遮罩。全部为纯 canvas 绘制，特效仅为对逻辑状态的观察。
 */
import type { TreasureState } from './logic.ts';
/** 单元边长（逻辑像素）。 */
export declare const CELL = 30;
/** HUD 高度。 */
export declare const HUD_H = 34;
/** 盘面区宽度（按最大关卡 16 列预留并居中）。 */
export declare const BOARD_W: number;
/** 右侧历史侧栏宽度。 */
export declare const SIDEBAR_W = 186;
/** 逻辑画布总宽。 */
export declare const LOGICAL_W: number;
/** 逻辑画布总高（HUD + 最大 12 行 + 底边距）。 */
export declare const LOGICAL_H: number;
/** 是否还有存活的过关粒子（index 据此在 dirty 模式下继续重绘）。 */
export declare function treasureEffectsActive(): boolean;
/**
 * 绘制一帧。
 * @param ctx - 画布上下文。
 * @param state - 游戏状态。
 * @param t - 累计秒数（动画时钟）。
 * @param paused - 是否显示暂停遮罩。
 */
export declare function renderTreasure(ctx: CanvasRenderingContext2D, state: TreasureState, t: number, paused: boolean): void;
