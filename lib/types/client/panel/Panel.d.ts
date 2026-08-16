/**
 * The minigames floating window: a draggable, edge-snapping ("dockable")
 * floating window with a hide toggle. Dragging the header moves the window;
 * releasing near a screen edge snaps it to that edge (left/right/top/bottom).
 * A ✕ button hides the window entirely, leaving a small floating 🎮 launcher
 * button; position, width, and dock state persist in localStorage. The game
 * picker and game area mount inside the window with full lifecycle
 * management (pause on hide / tab hidden / user pause, destroy on switch).
 */
import { type ReactNode } from 'react';
export declare function MiniGamePanel(): ReactNode;
