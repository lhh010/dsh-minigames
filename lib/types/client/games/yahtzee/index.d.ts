/**
 * 五骰 Yahtzee 游戏定义：把纯计分逻辑接成 {@link MiniGameInstance} ——
 * 空格/点击掷骰（每回合最多 3 次）、点击骰子或数字键 1-5 锁定、点击面板
 * 或 A-M 键填分（已填格不可重复）；快艇格已填后掷出五同自动 +50 快速艇
 * 奖励；13 格填满即终局上报总分。R 重开、P 暂停。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const yahtzeeGame: MiniGameDefinition;
