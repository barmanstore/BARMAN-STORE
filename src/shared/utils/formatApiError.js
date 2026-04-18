const DEFAULT_ERROR_MESSAGE = 'Something went wrong. Please try again.';

const passThroughPrefixes = ['PROFILE_INCOMPLETE', 'INCOMPLETE_PROFILE'];

const formatApiError = (err) => {
  if (!err) return DEFAULT_ERROR_MESSAGE;
  const rawMessage = String(err?.payload?.error || err?.message || '').trim();
  if (rawMessage) {
    if (passThroughPrefixes.some((prefix) => rawMessage.startsWith(prefix))) {
      return rawMessage;
    }
  }
  const userMessage = String(err?.payload?.userMessage || '').trim();
  if (userMessage) return userMessage;
  return DEFAULT_ERROR_MESSAGE;
};

export default formatApiError;
