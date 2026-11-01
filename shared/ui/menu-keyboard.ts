import type { KeyboardEvent } from "react";

/**
 * Cycles focus through a menu's enabled buttons, links and inputs with Arrow keys and Tab, wrapping at
 * both ends. Arrow keys typed inside an input keep their normal behaviour.
 */
export function moveMenuFocus(event: KeyboardEvent<HTMLElement>) {
  if (!["ArrowDown", "ArrowUp", "Tab"].includes(event.key)) return;
  if (event.target instanceof HTMLInputElement) return;
  const items = [...event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled), a[href], input")];
  if (!items.length) return;
  event.preventDefault();
  const backwards = event.key === "ArrowUp" || event.shiftKey;
  const index = items.indexOf(document.activeElement as HTMLElement);
  items[(index + (backwards ? -1 : 1) + items.length) % items.length].focus();
}
