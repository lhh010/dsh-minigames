/**
 * 斗兽棋 AI：一层贪心 + 局面评估。评估项：子力价值、逼近对方兽穴的
 * 推进分、陷阱惩罚（己方子站在对方陷阱内等级归零，风险大增）。所有
 * 随机都来自 mulberry32(seed) 注入的噪声，相同局面 + 难度 + 种子下
 * 选步完全确定、可测。难度随比赛局数上升：噪声幅度递减，第三局额外
 * 扣减对手的一步最优应手（极小化一层）。
 */
import { type Move, type Position, type Side } from './logic.ts';
/**
 * mulberry32 种子随机：同种子产生完全相同的随机数序列（确定性测试用）。
 * @param seed - 非负整数种子。
 * @returns 返回 [0, 1) 随机数的函数。
 */
export declare function mulberry32(seed: number): () => number;
/**
 * side 方视角的静态评估：己方总分减对方总分。单子分 = 子力价值 +
 * 推进分（与对方兽穴的曼哈顿距离越小越高，贴穴额外加分）+ 陷阱惩罚
 * （站在对方陷阱内 -120，因等级归零随时可被吃）。
 * @param pos - 待评估局面。
 * @param side - 评估视角方。
 * @returns side 方视角分值（正为优）。
 */
export declare function evaluate(pos: Position, side: Side): number;
/**
 * 选步入口（同步）：一层贪心 + 种子噪声；难度 3 额外扣减对手最佳应手
 * 后的分值。终局着法（入穴/全歼/困毙对方）按百万分识别，恒优先。
 * @param pos - 待选局面（行棋方即 AI 方）。
 * @param difficulty - 难度 1-3（噪声递减，3 加一层应手）。
 * @param seed - 随机种子（决定等分/近似分决胜）。
 * @returns 选定着法；无合法着法返回 null。
 */
export declare function chooseMove(pos: Position, difficulty: number, seed: number): Move | null;
