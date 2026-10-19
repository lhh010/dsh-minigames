/**
 * Shared visual kit for all games: one palette, one background, one particle
 * system, one overlay style. Games keep their own layout code and call into
 * these helpers so the whole panel reads as one product.
 *
 * All helpers are pure canvas drawing (no DOM, no state beyond the particle
 * pool a game owns through {@link createParticles}).
 */
/** The panel palette (Tokyo-Night-inspired, harmonious on the #15151b shell). */
export declare const THEME: {
    readonly bgTop: "#181822";
    readonly bgBottom: "#10101a";
    readonly panel: "#1e1e2a";
    readonly panelEdge: "#34344a";
    readonly text: "#e2e2ee";
    readonly textMuted: "rgba(226,226,238,0.55)";
    /** Ordered accent ramp games pick stable indices from. */
    readonly accents: readonly ["#7aa2f7", "#bb9af7", "#9ece6a", "#e0af68", "#f7768e", "#7dcfff", "#ff9e64", "#73daca"];
    readonly good: "#9ece6a";
    readonly bad: "#f7768e";
    readonly gold: "#e0af68";
};
/** A stable accent by index (wraps). */
export declare function accent(index: number): string;
/** Fill the whole logical canvas with the shared vertical gradient. */
export declare function drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number): void;
/** A soft outer glow for a shape about to be filled with `color`. */
export declare function glow(ctx: CanvasRenderingContext2D, color: string, blur?: number): void;
/** Clear the glow set by {@link glow}. */
export declare function noGlow(ctx: CanvasRenderingContext2D): void;
/** Rounded rect path helper (fills/strokes are the caller's choice). */
export declare function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void;
/** One HUD line: a muted label followed by a bright value. */
export declare function hudPair(ctx: CanvasRenderingContext2D, x: number, y: number, label: string, value: string, align?: CanvasTextAlign, valueColor?: string): void;
/** The shared end/pause veil: dark cover, spaced title, muted subtitle. */
export declare function drawOverlay(ctx: CanvasRenderingContext2D, w: number, h: number, title: string, subtitle: string, titleColor?: string): void;
/** Letter-space a CJK/latin title for the overlay look ('游戏结束' → '游 戏 结 束'). */
export declare function spaced(text: string): string;
/** Bounded particle pool a game ticks each frame; max 160, oldest dropped. */
export interface ParticleSystem {
    /** Spawn a burst at a point (mixed squares and circles). */
    burst(x: number, y: number, color: string, count?: number, speed?: number): void;
    /** Advance and draw; call once per frame after the scene, before overlays. */
    tick(ctx: CanvasRenderingContext2D, dtMs: number): void;
    /** Particle count (tests / debugging). */
    size(): number;
}
export declare function createParticles(): ParticleSystem;
