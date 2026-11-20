/**
 * 跳棋竞速 CheckersHop 游戏定义：把纯逻辑接成 {@link MiniGameInstance}
 * —— 点击己方棋子选中（虚线 + 空心环显示一步与链跳的全部可停点），
 * 点击高亮点落子；AI 短延时后一层贪心行子；一局结束自动开下一局
 * （3 局 2 胜），R 重开整场、P 暂停。落子与胜利触发粒子；盘面静态，
 * 按脏标记按需重绘（dirty 模式）；分数经 onScore 上报。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const checkershopGame: MiniGameDefinition;
