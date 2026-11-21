/**
 * 找规律 PatternIQ 游戏定义：把纯逻辑接成 {@link MiniGameInstance}——
 * 点击选项卡或按 1-4 作答（答错扣 5 秒可重试），空格下一题/继续下一节，
 * R 重开、P 暂停。dirty 模式：作答阶段倒计时环逐帧重绘，反馈/小结
 * 静止时零重绘。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const patterniqGame: MiniGameDefinition;
