/**
 * 重力翻转游戏定义：把纯逻辑接成 {@link MiniGameInstance}——空格 / 点击
 * 翻转重力，R 重开、P 暂停，continuous 帧循环推进固定子步模拟与渲染，
 * 距离分经 onScore 上报（最高分由面板管理）。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const gravflipGame: MiniGameDefinition;
