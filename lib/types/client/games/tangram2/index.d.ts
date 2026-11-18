/**
 * 七巧拼图 Tangram2 游戏定义：把纯拼图逻辑接成 MiniGameInstance ——
 * 指针拖拽板块到剪影（顶点集合容差匹配自动吸附，成功迸发粒子），点击
 * 选中后 R 旋转 45°、F 翻转（平行四边形需要），G 提示放置一块，短按 R
 * 旋转选中板、长按 R 重开整局（新种子），P 暂停。5 关递进（方块 ->
 * 房子 -> 城墙 -> 帆船 -> 兔子），过关按 computeScore 累计总分并通过
 * onScore 上报。dirty 按需渲染（见 frame-scheduler）。
 */
import type { MiniGameDefinition } from '../types.ts';
/** 七巧拼图游戏定义（注册于 games/index.ts）。 */
export declare const tangram2Game: MiniGameDefinition;
