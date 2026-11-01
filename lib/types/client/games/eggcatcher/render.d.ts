/**
 * 接鸡蛋渲染层：农场晨光背景（暖色天空渐变、太阳、云、草地与栅栏）、
 * 顶部来回走动的母鸡（随步伐摆动的腿与身体起伏）、白 / 金 / 绿臭蛋、
 * 编织篮（接住时挤压动画）、接住 / 臭蛋 / 漏蛋的粒子迸发、上浮渐隐的
 * 飘字、HUD（分数 / 生命 🐣×n / 连击）、暂停与结算遮罩。HUD 覆在半透明
 * 深色条上以保持共享主题文字的可读性。
 */
import type { EggCatcherState } from './logic.ts';
/**
 * 渲染一帧：农场背景、母鸡、蛋、篮子、飘字、粒子、HUD、遮罩。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param paused - 是否显示暂停遮罩。
 */
export declare function renderEggCatcher(ctx: CanvasRenderingContext2D, state: EggCatcherState, paused: boolean): void;
