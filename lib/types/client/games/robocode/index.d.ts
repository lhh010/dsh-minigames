/**
 * 编程机器人 RoboCode 装配层：把纯逻辑与渲染接成 MiniGameInstance——
 * 点击面板插入指令、点击槽位删除、滚轮调循环次数、空格运行/停止、
 * R 重开、P 暂停。运行时按轨迹逐帧播放逐格动画；静止时 dirty 按需重绘。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const robocodeGame: MiniGameDefinition;
