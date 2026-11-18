/**
 * 起重机游戏定义：把纯逻辑接成 {@link MiniGameInstance}——空格 / 点击
 * 抓取与抛下（吊钩摆动中，时机决定抓在哪、甩多远），R 重开、P 暂停；
 * continuous 帧循环推进摆动 / 抛落模拟与渲染，分数经 onScore 上报
 * （最高分由面板管理）。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const craneGame: MiniGameDefinition;
