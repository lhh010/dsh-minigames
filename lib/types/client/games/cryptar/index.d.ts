/**
 * 密码算式游戏定义：把纯逻辑与渲染接成 {@link MiniGameInstance} ——
 * 点击字母选中、点击数字池（或数字键）填入、X 清除选中字母，H 提示（限 2 次），
 * R 重开新对局、P 暂停；5 关按难度递进（seed 选题），过关 overlay 显现数字算式，
 * 得分经 onScore 上报。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const cryptarGame: MiniGameDefinition;
