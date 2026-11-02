/**
 * 滑雪大冒险游戏定义：把纯逻辑接成 {@link MiniGameInstance}——continuous
 * 帧循环推进模拟与渲染；↑/空格/W 起跳（跳台上更高）、空中 ←→/AD 控制
 * 姿态，R 重开、P 暂停，总分经 onScore 上报（最高分由面板管理）。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const avalancheGame: MiniGameDefinition;
