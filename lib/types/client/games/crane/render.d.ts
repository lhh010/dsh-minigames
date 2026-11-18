/**
 * 起重机 Crane 渲染层：码头夜景（星空 + 水面反光 + 龙门吊剪影）、三根
 * 立柱与堆叠集装箱色块（目标柱金色标牌）、吊臂台车 + 吊绳 + 吊钩、携带
 * 箱随摆速倾斜、抛落箱旋转与轨迹尾迹、落定弹跳与倒塔 / 落水粒子、
 * 关卡 / 步数 / 失败 / 分数 HUD、过关切换与竣工遮罩。无状态：只读逻辑
 * 态，事件转粒子爆发（logic 每帧开头清空事件）。
 */
import { type CraneState } from './logic.ts';
/**
 * 画主场景并推进渲染层动画；index 的帧循环每帧调用。
 * @param ctx - 画布上下文。
 * @param state - 当前逻辑态。
 * @param paused - 是否暂停（画遮罩）。
 */
export declare function renderCrane(ctx: CanvasRenderingContext2D, state: CraneState, paused: boolean): void;
