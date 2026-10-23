/**
 * Mastermind 猜码游戏定义：把纯判定逻辑接成 {@link MiniGameInstance} ——
 * 调色盘点击与数字键 1–6 双输入，Backspace 删除、Enter 提交整行，
 * 胜负后空格/点击换新密码再来一局，R 用同一种子重打本局，
 * 连胜与关卡爬坡（赢升级、输回 L1）通过 onScore / LEVELS 呈现。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const mastermindGame: MiniGameDefinition;
