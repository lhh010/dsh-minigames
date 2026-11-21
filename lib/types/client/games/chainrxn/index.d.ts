/**
 * 连锁反应 ChainRxN 游戏定义：把纯逻辑连锁模拟接成
 * {@link MiniGameInstance}。continuous 逐帧渲染 + FIXED_DT 固定步长推进
 * logic.step（可重放确定性）：点击空处引爆一次点击爆波，orb 被波及即
 * 层层连锁引爆；引爆数达标过关，点击耗尽仍未达标失败。R 重开本关、
 * N 过关后下一关、P 暂停；过关 / 通关 / 失败上报 onScore。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const chainrxnGame: MiniGameDefinition;
