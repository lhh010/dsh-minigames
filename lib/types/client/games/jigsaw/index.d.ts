/**
 * 百变拼图 Jigsaw 游戏定义：把纯拼图逻辑接成 {@link MiniGameInstance} ——
 * 指针拖拽碎片到盘面（距离 + 角度双条件吸附，成功迸发粒子），点击选中后
 * 空格/T 旋转当前碎片（R 已被重开占用，旋转备用 T），G 提示自动放置一块，
 * R 重开整局（新种子），P 暂停。五关递进（16→36 块，第 3 关起需要旋转
 * 对齐），过关按 computeScore 累计总分并通过 onScore 上报。
 */
import type { MiniGameDefinition } from '../types.ts';
/** 百变拼图游戏定义（注册于 games/index.ts）。 */
export declare const jigsawGame: MiniGameDefinition;
