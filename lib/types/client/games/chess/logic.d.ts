/**
 * Chess pure rules on a 0x88 board (index = rank * 16 + file; rank 0 is
 * White's first rank, so a1 = 0, h1 = 7, a8 = 0x70). Pieces are single chars:
 * uppercase White ('PNBRQK'), lowercase Black ('pnbrqk'), '' empty. All
 * functions are pure — applyMove returns a fresh Position, never mutates.
 */
/** White pieces are uppercase, Black lowercase. */
export type Piece = 'P' | 'N' | 'B' | 'R' | 'Q' | 'K' | 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export type Color = 'w' | 'b';
/** Castling-rights bits: White king/queen side, Black king/queen side. */
export declare const CASTLE_WK = 1;
export declare const CASTLE_WQ = 2;
export declare const CASTLE_BK = 4;
export declare const CASTLE_BQ = 8;
/** The full game state; board is a 128-slot array (0x88 layout, junk slots ''). */
export interface Position {
    board: (Piece | '')[];
    turn: Color;
    /** Castling-rights bitmask (CASTLE_* constants). */
    castling: number;
    /** En-passant target square (0x88) or -1. */
    ep: number;
    /** Halfmove clock (50-move rule); reset on pawn moves and captures. */
    halfmove: number;
}
export interface Move {
    from: number;
    to: number;
    piece: Piece;
    /** Piece standing on the target square ('' when none); the pawn for en passant. */
    capture: Piece | '';
    /** Promotion piece type ('' when not a promotion). */
    promo: '' | 'q' | 'r' | 'b' | 'n';
    /** Castling side ('' when not castling). */
    castle: 'k' | 'q' | '';
    /** True for an en-passant capture. */
    enPassant: boolean;
    /** True for a pawn double push (sets the next position's ep square). */
    double: boolean;
}
/** True when `sq` is an on-board 0x88 index. */
export declare function onBoard(sq: number): boolean;
export declare function fileOf(sq: number): number;
export declare function rankOf(sq: number): number;
/** Parse 'a1'..'h8' into a 0x88 index. */
export declare function sq(name: string): number;
/** Format a 0x88 index as 'a1'..'h8' (tests / debugging). */
export declare function algebraic(s: number): string;
export declare function colorOf(p: Piece): Color;
export declare function other(c: Color): Color;
/** The standard starting position. */
export declare function createStartPosition(): Position;
/**
 * Build a sparse position for tests: entries place pieces by square name;
 * defaults give empty boards with the given turn/castling/ep.
 * @param entries - [squareName, piece] placements.
 * @param opts - turn (default 'w'), castling mask (default 0), ep square (default -1).
 */
export declare function positionWith(entries: [string, Piece][], opts?: {
    turn?: Color;
    castling?: number;
    ep?: number;
}): Position;
/** An empty board with the given side to move (setup base). */
export declare function createEmptyPosition(turn?: Color): Position;
/**
 * Whether `by` attacks `target` on this board (pawn diagonals, knights,
 * adjacency, and sliding bishops/rooks/queens).
 */
export declare function isSquareAttacked(board: (Piece | '')[], target: number, by: Color): boolean;
/** 0x88 index of `color`'s king, or -1 (should not happen in legal games). */
export declare function findKing(board: (Piece | '')[], color: Color): number;
/** Whether the side to move is in check. */
export declare function inCheck(pos: Position): boolean;
/** All pseudo-legal moves for the side to move (castling is fully checked here). */
export declare function generatePseudoMoves(pos: Position): Move[];
/**
 * Apply a pseudo-legal move, returning the next position (pure). Castling
 * rights, ep square, and the halfmove clock are updated.
 */
export declare function applyMove(pos: Position, m: Move): Position;
/** Fully legal moves: pseudo moves that leave the mover's king unattacked. */
export declare function legalMoves(pos: Position): Move[];
/** FEN-ish position key (placement, turn, castling, ep) for repetition counting. */
export declare function positionKey(pos: Position): string;
/**
 * Draw by bare kings or a single bishop/knight (K vs K, K+B/N vs K).
 * Everything else (including two minors) plays on.
 */
export declare function insufficientMaterial(pos: Position): boolean;
export type Status = {
    kind: 'playing';
} | {
    kind: 'checkmate';
    winner: Color;
} | {
    kind: 'stalemate';
} | {
    kind: 'draw-insufficient';
} | {
    kind: 'draw-repetition';
};
/**
 * Game status for the side to move.
 * @param pos - the position to judge.
 * @param repetitions - how many times the current position (by positionKey)
 *   has occurred, including this one; ≥ 3 is a draw.
 */
export declare function status(pos: Position, repetitions?: number): Status;
