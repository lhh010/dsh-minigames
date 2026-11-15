/**
 * 转碟杂技游戏定义：把纯逻辑接成 {@link MiniGameInstance}——←→/AD 按
 * 住移动杂技演员，空格为最近的碟子补转（点击式冷却），R 重开（换局
 * 号）、P 暂停；continuous 帧循环推进逻辑与渲染，分数经 onScore 上报
 * （最高分由面板管理）。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const platesGame: MiniGameDefinition;
