/**
 * 逻辑网格 Einstein 游戏装配：把纯逻辑接进面板生命周期。
 *
 * 交互：点击格子 ✓ → ✗ → 空 循环（✓ 自动推演补 ✗）；数字键 1-9 高亮
 * 对应线索卡及相关值列；H 标出一个必为 ✓ 的格（限 3 次）；R 以同种子重开
 * 本题；P 暂停。过关后点击进入下一关（5 关循环：4×4 → 5×5）。
 * dirty 模式渲染：只有状态变化与秒表跳秒才重绘。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const logigridGame: MiniGameDefinition;
