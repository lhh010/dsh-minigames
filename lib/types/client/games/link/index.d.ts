/**
 * 连连看 Link 游戏定义：把纯逻辑（logic.ts）与渲染（render.ts）接成
 * {@link MiniGameInstance}——点击选牌、同图案 ≤2 拐路径连通即消（连线动画），
 * S 洗牌（每关 3 次）、空格过关进下一关、R 重开（同 seed 确定性重放）、P 暂停，
 * 计时倒扣分并经 onScore 上报。dirty 帧循环：静态时零重绘，秒表跳变或动画
 * 进行时才画。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const linkGame: MiniGameDefinition;
