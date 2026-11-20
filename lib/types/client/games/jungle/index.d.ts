/**
 * 斗兽棋游戏定义：把纯规则引擎（logic.ts）与一层贪心 AI（ai.ts）组装
 * 成 {@link MiniGameInstance}。玩家执红（棋盘下方，向上进攻），AI 执黑；
 * 3 局 2 胜，AI 难度随局数上升（噪声递减、第三局加算对手应手）。点击
 * 选子/走子，AI 同步应手（一层贪心耗时微秒级，无需分帧）；U 悔棋、
 * R 重开（局间为下一局/新场）、P 暂停。onScore 在每局与整场结束时上报
 * 累计分（每胜一局 +10，整场获胜 +20，零封 +10）。帧循环为 dirty 按需
 * 重绘（粒子活跃时持续标脏）。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const jungleGame: MiniGameDefinition;
