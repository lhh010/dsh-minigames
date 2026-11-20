/**
 * 四色地图游戏定义：把纯逻辑接成 MiniGameInstance——点击区域以当前色
 * 涂色并选中、点击色板 / 数字键换当前色（有选中区域时同步改涂）、右键
 * 清除；H 提示（限 2 次，金边闪示）、R 以同 seed 重开本关、P 暂停。
 * 过关时全图渐变亮起，随后过关 overlay 并自动进入下一关。盘面静态，走
 * dirty 调度；冲突红边闪烁与过关动画期间持续标脏。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const fourcolorGame: MiniGameDefinition;
