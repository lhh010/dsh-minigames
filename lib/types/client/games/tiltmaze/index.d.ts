/**
 * 旋转迷宫 game definition：把纯逻辑接成 {@link MiniGameInstance}——
 * 按住 ←/→（或 A/D）旋转整个盘面，小球受屏幕重力在迷宫中滚动；
 * 连续帧循环推进物理子步，终点孔过关、碰尖刺或超时失败。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const tiltmazeGame: MiniGameDefinition;
