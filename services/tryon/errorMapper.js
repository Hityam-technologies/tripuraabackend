function mapHttpError(status, body) {
  const name = String(body?.error?.name || body?.error || '');
  const message = String(body?.message || body?.error?.message || '');
  const blob = `${name} ${message}`;
  if (status === 402 || /OutOfCredits/i.test(blob)) {
    return { code: 'TRYON_UNAVAILABLE', message: 'Virtual try-on is temporarily unavailable.', retry: false };
  }
  if (status === 429) {
    return { code: 'TRYON_BUSY', message: 'The studio is busy. Please try again in a moment.', retry: true };
  }
  if (status >= 500) {
    return { code: 'TRYON_UNAVAILABLE', message: 'Virtual try-on is temporarily unavailable.', retry: true };
  }
  return { code: 'TRYON_UNAVAILABLE', message: 'Virtual try-on is temporarily unavailable.', retry: false };
}

function mapRuntimeError(error) {
  const name = error?.name || '';
  if (['PoseError', 'ImageLoadError', 'ContentModerationError', 'InputValidationError'].includes(name)) {
    return {
      code: 'TRYON_BAD_PHOTO',
      message: 'We could not use that photo. Please upload a clearer full-body portrait.',
      retry: false,
    };
  }
  return {
    code: 'TRYON_UNAVAILABLE',
    message: 'The drape could not be created. Please try a different photo.',
    retry: false,
  };
}

function mapTerminalStatus(status) {
  if (status === 'time_out') {
    return { status: 'timed_out', code: 'TRYON_UNAVAILABLE', message: 'The drape took too long. Please try again.' };
  }
  if (status === 'canceled') {
    return { status: 'canceled', code: 'TRYON_UNAVAILABLE', message: 'The try-on was canceled.' };
  }
  return null;
}

module.exports = { mapHttpError, mapRuntimeError, mapTerminalStatus };
