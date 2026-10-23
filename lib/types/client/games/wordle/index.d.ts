/**
 * Wordle 猜词游戏定义：把纯判定逻辑接成 {@link MiniGameInstance} ——
 * 物理 A–Z/Enter/Backspace 与屏幕键盘点击双输入，任意等长纯字母词均合法，
 * 无效输入抖动提示且不消耗行；关卡按 4/5/6 字母循环推进，连胜通过 onScore 上报。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const wordleGame: MiniGameDefinition;
