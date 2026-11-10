/**
 * 天平谜题 Balance 游戏定义：把纯力矩逻辑接成 {@link MiniGameInstance}。
 * 交互：点击砝码架上的砝码选中 → 点击挂点挂上；点击已挂砝码取下重放；
 * 横梁按净力矩实时倾斜（弹性动画）。U 撤回上一步、R 重开本关、P 暂停。
 * dirty 渲染：静态时零重绘，倾斜动画 / 粒子期间逐帧。过关上报 onScore
 * 并自动进入下一关（1.5s，暂停时冻结剩余量）。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const balanceGame: MiniGameDefinition;
