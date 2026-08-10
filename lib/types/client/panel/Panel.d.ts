/**
 * The right-side game panel: a fixed rail when collapsed, a right-half panel
 * when expanded (default width 50vw, drag-resizable), a game picker, and a
 * game area that mounts the selected game with full lifecycle management
 * (pause on collapse / tab hidden / user pause, destroy on switch).
 */
import { type ReactNode } from 'react';
export declare function MiniGamePanel(): ReactNode;
