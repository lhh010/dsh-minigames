/**
 * 魔方游戏定义：3D 可旋转魔方（render.ts 手写投影）接入
 * {@link MiniGameInstance}。空白处拖拽 = 旋转观察视角（惯性缓动）；按住
 * 贴纸沿切向拖拽 = 拧该层（dragToMove 确定性映射），0→90° 约 180ms 动画
 * 落定后走 logic 走法。H 提示 = 按全部历史逆序回拧一步（applyHint，上限
 * 3 次）；R 重开新打乱；P 暂停；双击或右下按钮重置视角。六面纯色即过关：
 * 粒子庆祝、onScore 上报、1.8s 后进下一关（5 关递进）。dirty 调度：静止
 * 零重绘，拧动动画 / 视角缓动 / 计时秒跳期间逐帧。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const rubikGame: MiniGameDefinition;
