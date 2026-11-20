/**
 * 天平称重 Scales 游戏定义：把纯逻辑接成 {@link MiniGameInstance}。交互
 * 为点硬币循环分配（台面→左盘→右盘→取下）、空格或按钮称量、Enter 进
 * 指认模式（点币 + 点轻/重按钮）、A 推理助手开关（教学向、计分减半）、
 * R 重开（新种子）、P 暂停。硬模式限时 180 秒。过关上报 onScore（关卡
 * ×100，用过助手减半）并自动进入下一关；关卡进度持久化。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const scalesGame: MiniGameDefinition;
