/**
 * 潜行渗透游戏装配：方向键/WASD 四向移动（守卫按节拍步进巡逻）、
 * R 重开本关（同 seed 同盘，生命回满）、P 暂停。dirty 按需帧循环：输入、
 * 守卫节拍与红闪期间才重绘；过关 1.4s 后自动进下一关并沿用剩余生命，
 * 五关全通或生命耗尽进入终局 overlay。onScore 随钻石 / 过关即时上报。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const stealthGame: MiniGameDefinition;
