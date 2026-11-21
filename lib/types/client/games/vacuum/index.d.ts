/**
 * 清扫规划游戏装配：方向键/WASD 或点击相邻格移动，R 重开本关（同
 * seed 同盘），P 暂停。dirty 帧循环——盘面只在交互/粒子活跃时重绘。
 * 过关 1.4s 自动进下一关；五关全通或电量耗尽进入 overlay，R 重开。
 * onScore：每新清扫一格 +1、过关 +150、全通 +500，变化时上报。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const vacuumGame: MiniGameDefinition;
