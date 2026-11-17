/**
 * 魔方游戏定义：把纯逻辑（./logic.ts）接入 {@link MiniGameInstance}。
 * 点击展开图上的行/列箭头拧层（每面 3 行 3 列，双向）；H 提示 = 按全部
 * 历史的逆序回拧一步（applyHint，上限 3 次，沿提示必达复原）；R 重开
 * 新打乱；P 暂停。六面纯色即过关：粒子庆祝、onScore 上报关卡，1.8s 后
 * 进入下一关（5 关递进，打乱步数 6→12）。dirty 调度：静态时零重绘，
 * 拧动动画与计时秒跳期间逐帧。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const rubikGame: MiniGameDefinition;
