/**
 * 推金币 Coin Pusher game definition：把确定性物理逻辑接成
 * {@link MiniGameInstance}——←/→ 移动瞄准列，空格或点击投币；R 重开一局
 * （新种子），P 暂停。continuous 帧循环：logic.step 按 f.dt 推进（内部
 * 固定子步），f.render 时整帧重绘；结算事件在掉落点触发粒子与浮字，
 * 分数变化时经 onScore 上报。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const coinpusherGame: MiniGameDefinition;
