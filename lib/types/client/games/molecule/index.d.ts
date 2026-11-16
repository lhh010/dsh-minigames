/**
 * 分子构建游戏定义：把纯推原子逻辑接成 MiniGameInstance——方向键/WASD
 * 移动（相邻即成键），U 撤销，R 重开，P 暂停；过关粒子庆祝后自动进入
 * 下一关，五关全过显示终局画面。棋盘类：dirty 按需重绘（推挤动画与
 * 粒子活跃期间持续标脏）。得分（每键 +100、过关 +500）经 onScore 上报。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const moleculeGame: MiniGameDefinition;
