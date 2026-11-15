/**
 * 拆弹专家渲染层：规则卡（编号 + 条件文本 + 颜色图例）、炸弹面板
 * （弯曲贝塞尔线缆、剪断处飞出火花、两端接线端子）、面板属性可视化
 * （序列号 / 标记符号 / 电池）、倒计时大数字（临限红闪）、拆弹进度
 * HUD、爆炸粒子与成功遮罩。粒子系统为渲染层自有实例。
 */
import type { DefuseState } from './logic.ts';
/**
 * 点击命中测试：返回距点击 14px 内最近的未剪线缆索引。
 * @param state - 当前状态。
 * @param px - 逻辑坐标 x。
 * @param py - 逻辑坐标 y。
 * @returns 线缆索引，未命中返回 null。
 */
export declare function wireHitTest(state: DefuseState, px: number, py: number): number | null;
/**
 * 粒子系统是否仍在活动（index 层据此决定 dirty 重绘）。
 * @returns true 表示还有粒子在飞。
 */
export declare function defuseParticlesActive(): boolean;
/**
 * 渲染一帧：背景、倒计时、规则卡、炸弹面板（线缆 + 属性可视化）、
 * 事件粒子、HUD 与遮罩。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param paused - 是否显示暂停遮罩。
 */
export declare function renderDefuse(ctx: CanvasRenderingContext2D, state: DefuseState, paused: boolean): void;
