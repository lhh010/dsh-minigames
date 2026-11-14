/**
 * 冰壶游戏定义：把纯逻辑状态机接成 {@link MiniGameInstance}。两段式
 * 掷壶（点击锁方向 → 点击锁力度），滑行中按住空格擦冰（每掷 3 次），
 * R 重开整场（同种子完全重放），P 暂停。帧调度用 dirty 模式：摆针 /
 * 力度 / 滑行 / 粒子等动画阶段每帧 markDirty，局间遮罩与胜负画面静
 * 止时零重绘。得分事件驱动碰撞火花粒子；onScore 上报我方累计得分。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const curlingGame: MiniGameDefinition;
