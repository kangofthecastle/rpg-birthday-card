export function getUiRoot(): HTMLElement {
  const root = document.querySelector<HTMLElement>('#ui-root');

  if (!root) {
    throw new Error('Missing #ui-root');
  }

  return root;
}

/**
 * Wipe the UI root. When `preservePersistent` is set, nodes explicitly marked
 * persistent (currently the sail-away → ending bridge, `data-ending-bridge`)
 * are kept, so they survive the scene restart into final-spot and keep covering
 * the swap until finalKeepsakeActivity removes the bridge itself. The default
 * (full wipe) is used everywhere else — including the terminal `goHome()` — so a
 * bridge can never leak permanently even if the frame sequence is never reached.
 */
export function clearUiRoot(preservePersistent = false): void {
  const root = getUiRoot();
  if (!preservePersistent) {
    root.innerHTML = '';
    return;
  }
  for (const child of Array.from(root.childNodes)) {
    const persistent =
      child.nodeType === Node.ELEMENT_NODE &&
      (child as HTMLElement).dataset.endingBridge !== undefined;
    if (!persistent) {
      child.remove();
    }
  }
}
