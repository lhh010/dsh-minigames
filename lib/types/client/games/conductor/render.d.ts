/**
 * 列车调度渲染层：轨道线网（道岔当前方向的出边亮金色指示、另一向暗
 * 淡，道岔节点带 A/B 字母与临车呼吸预警）、彩色站台（色框 + 色牌 +
 * 停靠列车）、车库、各色列车（车厢 + 车轮 + 烟囱冒烟，烟羽由 t 确定
 * 性驱动）、顶部时限进度条、分数 / 关号 / 剩余时间 / 失误 HUD、事件
 * 粒子（到站 / 错色 / 相撞）、暂停与终局遮罩。无状态：只读逻辑态。
 */
import { type ConductorState } from './logic.ts';
/**
 * 渲染整帧。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param paused - 是否暂停（叠加暂停遮罩）。
 * @param dtMs - 本帧毫秒（粒子推进用）。
 */
export declare function renderConductor(ctx: CanvasRenderingContext2D, state: ConductorState, paused: boolean, dtMs?: number): void;
