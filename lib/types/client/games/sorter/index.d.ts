/**
 * 传送带分拣游戏定义：把纯逻辑接成 {@link MiniGameInstance}——色键
 * 1-4 把三条带的分流挡板一次性切到对应颜色（下一帧生效），continuous
 * 帧循环推进模拟与渲染，R 重开（换局号）、P 暂停，分数经 onScore 上报
 * （最高分由面板管理）。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const sorterGame: MiniGameDefinition;
