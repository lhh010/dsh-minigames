/**
 * 淘金者渲染层：侧视矿洞——深度分层的土色层理、灰纹铆钉硬岩、闪光金块、
 * 斑纹圆石、底部出口门；玩家戴矿工帽灯（朝向光晕）；金块 / 圆石按逻辑
 * 动画队列插值出下落过程；HUD 显示关卡 / 分数 / 金块 / 生命 / 倒计时；
 * 过关 / 通关 / 失败 / 暂停遮罩。全部为纯 canvas 绘制，特效仅为对逻辑
 * 状态的观察（粒子、上一帧分数）。
 */
import type { GoldmineState } from './logic.ts';
/**
 * 绘制一帧。
 * @param ctx - 画布上下文。
 * @param state - 游戏状态。
 * @param t - 累计秒数（闪烁动画时钟）。
 * @param paused - 是否显示暂停遮罩。
 */
export declare function renderGoldmine(ctx: CanvasRenderingContext2D, state: GoldmineState, t: number, paused: boolean): void;
