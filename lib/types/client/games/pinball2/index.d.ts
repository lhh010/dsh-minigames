/**
 * 弹球台 Pinball2 游戏定义：把纯物理状态机接到 MiniGameInstance。
 * Z / ← 左挡板，M / → 右挡板；长按空格蓄力、松开发射（可先后发两球
 * 同场互撞）；N 轻推台面（每球 3 次，超限 TILT 没收球）；R 重开、
 * P 暂停。continuous 帧循环：物理吃 f.dt，绘制吃 f.render；得分变化经
 * onScore 上报并在 localStorage 记最佳。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const pinball2Game: MiniGameDefinition;
