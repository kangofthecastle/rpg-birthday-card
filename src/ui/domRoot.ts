export function getUiRoot(): HTMLElement {
  const root = document.querySelector<HTMLElement>('#ui-root');

  if (!root) {
    throw new Error('Missing #ui-root');
  }

  return root;
}

/** Wipe every transient overlay before a scene is rebuilt. */
export function clearUiRoot(): void {
  const root = getUiRoot();
  root.innerHTML = '';
}
