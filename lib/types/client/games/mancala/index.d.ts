/**
 * 播棋游戏定义：把纯规则与渲染器接成 {@link MiniGameInstance}——点击己方
 * 坑走子（逐籽播种动画），AI 应手；三局积分制，难度随局数上升（噪声与
 * 暴露惩罚收紧）。R 重开整场比赛，P 暂停/继续；动画期间逐帧、静止时脏标记按需重绘。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const mancalaGame: MiniGameDefinition;
