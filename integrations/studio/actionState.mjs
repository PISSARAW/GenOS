export function holdButtons(root) {
  const controls = [...root.querySelectorAll('button:not(#disconnect)')]
    .map(button => ({ button, disabled: button.disabled }));
  for (const { button } of controls) button.disabled = true;
  return () => {
    for (const { button, disabled } of controls) button.disabled = disabled;
  };
}

export function transientFailure(error) {
  if (error.status >= 500) return true;
  if (['network', 'timeout'].includes(error.kind)) return true;
  if (error instanceof TypeError || error.name === 'AbortError') return true;
  return error.kind === 'protocol' && !(error.status >= 400);
}

export function preserveFailure(error, options) {
  if (error.status === 401) return false;
  if (error.code === 'INVALID_APPROVAL_JSON' || options.preserveDraft) return true;
  return options.preserveView && transientFailure(error);
}

export function uncertainEffect(error) {
  return error.outcome === 'unknown' && !error.retryable && error.kind !== 'session';
}
