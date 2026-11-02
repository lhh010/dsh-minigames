/**
 * 贪吃蛇大作战 AI：纯函数式单蛇决策（采样式转向，不做整树搜索）。
 * 对每个到期的 AI 蛇，在当前朝向附近采样 9 个候选方向，逐方向沿射线
 * 估算危险（蛇身段密度）、世界边界惩罚与目标增益（光点 / 围堵截击点），
 * 按性格权重合成得分取最优。单次决策的计算量固定（9 方向 x 5 采样点
 * 的危险查询 + 一次光点/猎物线性扫描），配合 logic.ts 的每 tick 决策
 * 条数限额实现分帧，不会卡帧。所有随机取自 state.rng，确定性可重放。
 */
import type { SlitherSnake, SlitherState } from './logic.ts';
/** 一条 AI 的决策结果。 */
export interface AiDecision {
    /** 期望朝向（弧度）。 */
    angle: number;
    /** 是否想加速（长度不足时 logic 层会忽略）。 */
    boost: boolean;
}
/** logic 层注入的感知上下文（世界常数 + 危险场采样），避免模块环依赖。 */
export interface AiContext {
    worldR: number;
    cx: number;
    cy: number;
    baseSpeed: number;
    /** (x,y) 附近 42px 内的蛇身段数量（危险度）。 */
    danger(x: number, y: number): number;
}
/**
 * 单蛇决策：采样候选方向并按性格加权评分。
 * @param state - 目标状态（读 rng / 其它蛇 / 光点）。
 * @param snake - 决策蛇。
 * @param ctx - 感知上下文。
 * @returns 最优期望朝向与是否加速。
 */
export declare function decideAi(state: SlitherState, snake: SlitherSnake, ctx: AiContext): AiDecision;
