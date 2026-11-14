/**
 * 地底挖矿游戏定义：把纯逻辑接入 {@link MiniGameInstance} —— 方向键/WASD
 * 挖掘移动，R 整局重开（新种子），P 暂停；continuous 帧循环，分数实时上报。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const digGame: MiniGameDefinition;
