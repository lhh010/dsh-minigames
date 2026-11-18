/**
 * 词语接龙 WordChain 游戏定义：把纯逻辑接成 {@link MiniGameInstance} ——
 * 点击手牌卡或数字键 1-5 出词接龙、S/按钮跳过（送 AI 5 分）、R 重开
 * （换 seed）、P 暂停；十回合累计分经 onScore 上报。脏标记渲染：静态局
 * 面只在状态或动效变化时重绘。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const wordchainGame: MiniGameDefinition;
