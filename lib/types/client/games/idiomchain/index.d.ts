/**
 * 成语接龙 IdiomChain 游戏定义：把纯逻辑接成 {@link MiniGameInstance} ——
 * 点击候选卡片或数字键 1-6 出牌接龙、S/按钮跳过（送 AI 得分）、每回合
 * 20 秒倒计时计分递减、超时自动跳过；R 重开（换 seed）、P 暂停；五局
 * 累计分经 onScore 上报。脏标记渲染：静态局面只在状态或动效变化时重绘。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const idiomchainGame: MiniGameDefinition;
