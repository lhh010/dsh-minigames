/**
 * 飞刀转盘游戏定义：把纯逻辑接成 {@link MiniGameInstance}——点击画布或
 * 空格从正上方插刀，continuous 帧循环推进转盘模拟与渲染，R 重开、
 * P 暂停，分数经 onScore 上报（最高分由面板管理）。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const kniferingGame: MiniGameDefinition;
