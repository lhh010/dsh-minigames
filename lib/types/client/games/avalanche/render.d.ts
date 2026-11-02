/**
 * 滑雪大冒险渲染层：多层视差雪山背景、折线起伏雪坡（跳台凸起）、树木/
 * 岩石障碍、金币、企鹅与雪人伙伴、四态玩家（贴地滑行/腾空姿态/翻滚失控/
 * 骑乘描边）、特技与拾取飘字、身后雪崩墙（锯齿白浪 + 飞雪粒子 + 逼近时
 * 屏幕震动）、HUD（分数/距离/雪崩警告条）、暂停与结束遮罩。
 */
import { type AvaState } from './logic.ts';
/**
 * 渲染一帧。相机锁定玩家于 (PLAYER_X, PLAYER_Y)；雪崩逼近时叠加确定性
 * 屏幕震动。消费逻辑层事件驱动粒子。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param paused - 是否显示暂停遮罩。
 */
export declare function renderAvalanche(ctx: CanvasRenderingContext2D, state: AvaState, paused: boolean): void;
