/**
 * 弹球大师 Pinball 游戏定义：把纯物理状态机接入
 * {@link MiniGameInstance} —— A/← 与 D/→ 扳动挡板，空格从台顶发球，
 * P 暂停，R 重开。街机 continuous 帧循环：物理吃 f.dt（自适应子步在
 * logic 内），绘制吃 f.render。得分事件在得分点喷粒子。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const pinball2Game: MiniGameDefinition;
