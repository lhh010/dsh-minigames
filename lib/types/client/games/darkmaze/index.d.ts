/**
 * 手电迷宫游戏装配：WASD/方向键移动（移动即转身向）、鼠标或 Q/E 旋转手电
 * 朝向、R 重开本关（同 seed 同盘）、P 暂停。连续帧循环驱动光锥平滑旋转、
 * 金币闪烁与 0.5s 全图闪现衰减；过关 1.4s 后自动进下一关并沿用剩余生命，
 * 五关全通或生命耗尽进入终局 overlay。onScore 随金币 / 过关即时上报累计分。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const darkmazeGame: MiniGameDefinition;
