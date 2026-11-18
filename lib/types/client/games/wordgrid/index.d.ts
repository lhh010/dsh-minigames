/**
 * 字母矩阵 WordGrid 游戏定义：把纯逻辑接成 {@link MiniGameInstance} ——
 * 点击相邻字母（含对角）延长选词链，Enter 提交判定（隐藏词找出锁色、
 * 错误扣尝试）、Backspace 回退、H 揭示线索卡（每关 3 次逐级）、R 重开
 * （换 seed）、P 暂停；过关 Enter 进下一关，得分经 onScore 上报。脏标
 * 记渲染：静态局面零重绘，动画与消息期间逐帧。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const wordgridGame: MiniGameDefinition;
