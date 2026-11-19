/**
 * 收获季节游戏定义：回合制轮作规划接成 MiniGameInstance。点击卡池换
 * 待种作物、点击动作按钮（或 1-4）切换动作、点击田格执行当前动作、
 * 空格下一周/确认下一季、R 重开整局、P 暂停。dirty 帧循环：交互、
 * 结算与粒子期间标记重绘，静止时零重绘。
 */
import type { MiniGameDefinition } from '../types.ts';
/** 收获季节：轮作时间线农事规划谜题。 */
export declare const harvestGame: MiniGameDefinition;
