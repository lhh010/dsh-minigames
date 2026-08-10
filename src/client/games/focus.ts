/**
 * Keyboard focus gating for games: the game host div is focusable and owns
 * the game keys only while it (or its canvas) has focus. This keeps typing in
 * the chat composer, arrow-scrolling the page, and other UI shortcuts
 * working while a game is mounted but not in focus.
 */

/**
 * Make the host focusable and focus it (without scrolling) so the game
 * receives keys from the first click.
 * @param host - the game host element.
 */
export function focusGameHost(host: HTMLElement): void {
  host.tabIndex = 0
  host.focus({ preventScroll: true })
}

/**
 * Whether the document focus is inside the game host (the host itself or the
 * canvas it mounts).
 * @param host - the game host element.
 * @returns true when game keys should be handled.
 */
export function gameHasFocus(host: HTMLElement): boolean {
  const el = document.activeElement
  return el === host || (el instanceof HTMLElement && host.contains(el))
}
