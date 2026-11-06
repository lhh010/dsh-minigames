/**
 * 杂技抛球游戏定义：把纯逻辑接成 {@link MiniGameInstance}——点击画布
 * 任意位置即对该位置附近的球施加拍击冲量，底部双手托盘跟随指针移动
 * （纯视觉）；continuous 帧循环推进固定子步物理与渲染，R 重开（换局
 * 号）、P 暂停，分数经 onScore 上报（最高分由面板管理）。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const juggleGame: MiniGameDefinition;
