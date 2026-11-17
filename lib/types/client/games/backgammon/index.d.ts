/**
 * 双陆棋 Backgammon 游戏定义：把纯逻辑接成 {@link MiniGameInstance} ——
 * 空格/按钮掷骰，点击己方子选中、再点击高亮落点走子（右下槽为 bear
 * off 出局）；对方 AI 自动掷骰并按贪心启发式整回合行子；先全部移出
 * 者胜该局，3 局 2 胜。打吃触发粒子，骰子滚动动画期间逐帧重绘，静
 * 态盘面按脏标记按需重绘。R 重开整场、P 暂停。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const backgammonGame: MiniGameDefinition;
