/**
 * 泡泡纸游戏定义：把纯逻辑接成 {@link MiniGameInstance}——点击或按住
 * 拖动扫过泡泡逐个捏爆（pointerdown/move，按住期间 pointermove 命中即捏），
 * continuous 帧循环推进 combo 窗口与渲染，R 重开（分数归零、回到第 1 板）、
 * P 暂停，分数经 onScore 上报（最高分由面板管理）。零失败、无时限。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const bubblewrapGame: MiniGameDefinition;
