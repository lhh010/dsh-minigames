/**
 * 小蜜蜂游戏定义：把纯逻辑接成 {@link MiniGameInstance}——键盘 ←→/AD 移动
 * 炮台、空格/J 开火（按住连发，冷却由逻辑层节流），continuous 帧循环推进
 * 模拟与渲染，R 重开、P 暂停，分数经 onScore 上报累计分（最高分由面板管理）。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const invadersGame: MiniGameDefinition;
