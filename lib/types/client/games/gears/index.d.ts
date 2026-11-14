/**
 * 齿轮谜题游戏定义：把纯逻辑接成 {@link MiniGameInstance} —— 点击空位放
 * 当前槽齿数的齿轮、点击已放齿轮收回、点底部槽或按 1-4/[/] 换齿数；动力
 * 轮恒转驱动传动链动画（受电即逐帧重绘，否则 dirty 按需）；R 重开本关、
 * P 暂停、过关后 N 或自动进入下一关。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const gearsGame: MiniGameDefinition;
