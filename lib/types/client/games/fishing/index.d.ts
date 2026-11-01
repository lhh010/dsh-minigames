/**
 * 悠闲钓鱼游戏定义：把纯逻辑接成 {@link MiniGameInstance}——按住
 * （鼠标 / 触摸 / 空格）收线，咬钩窗口内按住刺鱼，搏斗中收放交替；
 * continuous 帧循环推进模拟与渲染，R 重开、P 暂停，分数经 onScore 上报
 * （最高分由面板管理）。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const fishingGame: MiniGameDefinition;
