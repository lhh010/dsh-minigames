/**
 * 盆栽大师游戏定义：把纯逻辑内核接成 MiniGameInstance。点枝修剪（能量
 * 转给兄弟枝）、拖太阳改变趋光方向、空格推进 1 游戏日、W 浇水、F 施肥、
 * R 重开本关、P 暂停；过关后空格进下一关。帧循环 continuous 模式：能量
 * 微光/施肥闪点/粒子逐帧动画持续变化；逻辑 tick 由 dt 累积按 TICK_MS
 * 离散推进，暂停/结束只停模拟不停绘制。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const bonsaiGame: MiniGameDefinition;
