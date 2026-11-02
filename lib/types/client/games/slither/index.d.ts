/**
 * 贪吃蛇大作战游戏定义：把确定性引擎接成 {@link MiniGameInstance}——
 * 鼠标指向转向（蛇头朝指针）、按住左键/空格加速（消耗长度吐光点）、
 * continuous 帧循环内以固定步长累积器推进模拟（每帧至多补 3 个 tick），
 * 死亡事件用共享粒子系统爆光。R 重开（同 seed 换局号）、P 暂停；分数
 * （=长度）经 onScore 上报，死亡时上报长度峰值。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const slitherGame: MiniGameDefinition;
