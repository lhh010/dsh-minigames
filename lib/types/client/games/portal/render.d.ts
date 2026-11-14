/**
 * 传送门渲染层：科技风关卡（发光网格 + 描边墙体）、蓝橙门（椭圆漩涡 +
 * 确定性粒子流）、小方块角色（带朝向眼睛）、入出门轨迹残影、尖刺 /
 * 激光、出口旗帜（挥动）、关卡 HUD、过关 / 失败 / 暂停遮罩。全部动画
 * 由 state.t 与注入 seed 派生，无 Math.random。
 */
import { type PortalState } from './logic.ts';
/** 关卡事件的可视爆点（index 每帧在 step 之后调用）。 */
export declare function spawnPortalFx(state: PortalState): void;
/**
 * 渲染整帧：背景 → 网格 → 瓦片 → 门 → 旗 → 残影 → 角色 → 粒子 → HUD
 * → 遮罩。
 * @param ctx - 画布上下文。
 * @param state - 对局状态。
 * @param paused - 是否暂停（画暂停遮罩）。
 */
export declare function renderPortal(ctx: CanvasRenderingContext2D, state: PortalState, paused: boolean): void;
