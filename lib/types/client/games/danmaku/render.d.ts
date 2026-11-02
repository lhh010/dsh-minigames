/**
 * 弹幕决战渲染层：向下卷动的星空（固定种子确定性生成）、玩家机体
 * （精确模式高亮擦弹圈 + 判定点白芯）、红 / 紫两色发光敌弹、Boss 大机体
 * 与阶段血条（当前阶段亮、已过阶段暗）、擦弹火花、命中 / 击破爆散粒子、
 * HUD（分数 / 命 / Boss 阶段 / 擦弹数）、Boss 横幅与暂停 / 结算遮罩。
 */
import type { DanmakuState } from './logic.ts';
/**
 * 渲染一帧：星空、Boss 与血条、玩家子弹、敌弹、玩家、粒子、HUD、横幅、
 * 暂停 / 结算遮罩。消费 logic 事件产生对应特效。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param focus - 本帧是否精确模式。
 * @param paused - 是否显示暂停遮罩。
 */
export declare function renderDanmaku(ctx: CanvasRenderingContext2D, state: DanmakuState, focus: boolean, paused: boolean): void;
