/**
 * 接雨水 (Rainwater) 游戏定义：把纯逻辑接入 {@link MiniGameInstance}。
 * 5 关递进（槽位 8→14、目标 4→12）：点击柱升高 1 格（耗 1 砖）、右键或
 * Shift+点击降低（拆回砖），总蓄水达标即过关计分（60 + 目标×10 + 剩余
 * 预算×8），1.5 秒后自动进入下一关；最后一关达成后全部通关。R 重开本
 * 关（保留之前累计分）、P 暂停。onScore 上报跨关累计分（仅变化时）。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const rainwaterGame: MiniGameDefinition;
