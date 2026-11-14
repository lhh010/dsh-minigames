/**
 * 开锁达人渲染层：锁芯横剖面（锁体 + 弹子孔 + 顶针通道）、已设定弹子
 * 亮绿卡在剪切线、当前施力弹子随力度位移、设定窗口暗区（低难度提示）、
 * 顶部张力弧指示（含最低设定张力标记）、耐久/进度/分数 HUD、开锁旋转
 * 动画与崩塌粒子抖动、暂停/失败/胜利遮罩。
 */
import type { LockpickState } from './logic.ts';
/**
 * 渲染一帧：背景、张力弧、锁体剖面（含开锁旋转）、弹子与窗口、粒子、
 * 抖动、HUD 与遮罩。事件每帧消费为粒子特效。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param paused - 是否显示暂停遮罩。
 */
export declare function renderLockpick(ctx: CanvasRenderingContext2D, state: LockpickState, paused: boolean): void;
