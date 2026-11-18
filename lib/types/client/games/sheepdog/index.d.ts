/**
 * 牧羊犬游戏定义：把纯逻辑接成 {@link MiniGameInstance}——方向键/WASD
 * 连续移动牧羊犬，R 重开整局，P 暂停；continuous 帧循环（羊群每帧都在
 * 动）。分数跨关累计，变化时经 onScore 上报。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const sheepdogGame: MiniGameDefinition;
