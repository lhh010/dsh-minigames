/**
 * 导弹指令游戏定义：把纯逻辑接成 {@link MiniGameInstance}——鼠标移动
 * 瞄准（画布任意点）、点击或空格发射拦截弹，方向键亦可移动准星；
 * continuous 帧循环推进模拟与渲染，R 重开、P 暂停，分数经 onScore 上报。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const missileGame: MiniGameDefinition;
