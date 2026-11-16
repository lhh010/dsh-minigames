/**
 * 炼金工坊游戏定义：把纯合成逻辑接成 {@link MiniGameInstance} —— 点元素架
 * 入工作台两槽，两槽齐即自动尝试合成（发现/重复/无反应三种反馈）；Tab 开
 * 关元素图鉴，H 消耗里程碑配额换取半配方提示，R 重开，P 暂停。五段
 * 里程碑（发现 15/25/35/45/55 种）即五关递进；得分经 onScore 上报。
 */
import type { MiniGameDefinition } from '../types.ts';
/** 炼金工坊：Little Alchemy 式合成发现小游戏。 */
export declare const alchemyGame: MiniGameDefinition;
