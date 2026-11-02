/**
 * 弹弓复仇 game definition：拖拽弹弓发射鸟弹（aim 期间按下拖拽松手），
 * 轰塌堡垒消灭全部小猪过关；空格/回车过关进下一关，R 重试本关，
 * [ ] 切换已解锁关卡。粒子消费 break/pig 事件；弹道虚影记录上一弹
 * 轨迹供瞄准参考。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const slingshotGame: MiniGameDefinition;
