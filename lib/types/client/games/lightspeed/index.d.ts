/**
 * 「光速穿梭 Lightspeed」游戏定义：把纯逻辑接入面板生命周期——
 * rAF 循环（街机 continuous 模式）、←/→ 转向、P 暂停、R 重开、
 * 过关短暂展示后跃迁下一关，onScore 按分数变化上报。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const lightspeedGame: MiniGameDefinition;
