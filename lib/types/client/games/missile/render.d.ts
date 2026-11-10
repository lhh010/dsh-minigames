/**
 * 导弹指令渲染层：夜空渐变 + 确定性星空、地面山丘与城市（存活楼群 /
 * 残垣碎块）、来袭弹尾迹（起点到弹头的亮线 + 炽热弹头）、拦截弹与
 * 十字准星、爆炸球发光（径向渐变膨胀-收缩）、波次横幅、分数 / 波次 /
 * 城市 HUD、结束与暂停遮罩。纯绘制，状态全部来自逻辑层。
 */
import { type MissileState } from './logic.ts';
/**
 * 渲染一帧：夜空、地面、城市、炮台、来袭弹、拦截弹与准星、爆炸球、
 * 粒子、HUD 与横幅，最后按状态盖遮罩。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param paused - 是否显示暂停遮罩。
 * @param aimX - 准星 x。
 * @param aimY - 准星 y。
 */
export declare function renderMissile(ctx: CanvasRenderingContext2D, state: MissileState, paused: boolean, aimX: number, aimY: number): void;
