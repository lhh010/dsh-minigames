import { type ReactNode } from 'react';
import type { MiniGameDefinition } from '../games/types.ts';
/** 用棋盘、路径和游戏道具作识别图，不依赖系统 emoji 字体。 */
export declare function GameMark({ id }: {
    id: string;
}): ReactNode;
interface Props {
    games: MiniGameDefinition[];
    best: Record<string, number>;
    current: MiniGameDefinition | undefined;
    onSelect: (id: string) => void;
    onContinue: () => void;
}
export declare function GameLibrary({ games, best, current, onSelect, onContinue }: Props): ReactNode;
export {};
