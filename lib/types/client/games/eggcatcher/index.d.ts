/**
 * 接鸡蛋游戏定义：把纯逻辑接成 {@link MiniGameInstance}——←→/AD 按住
 * 步进移动篮子，指针移动 / 按下时篮子向指针目标位插值追赶（键盘按下
 * 即接管）；continuous 帧循环推进模拟与渲染，R 重开（换局号）、P 暂停，
 * 分数经 onScore 上报（最高分由面板管理）。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const eggcatcherGame: MiniGameDefinition;
