export function getUiRoot(): HTMLElement {
  const root = document.querySelector<HTMLElement>('#ui-root');

  if (!root) {
    throw new Error('Missing #ui-root');
  }

  return root;
}

export function clearUiRoot(): void {
  getUiRoot().innerHTML = '';
}
