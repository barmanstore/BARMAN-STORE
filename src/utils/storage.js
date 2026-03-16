const safeLocalStorageGet = (key) => {
  try {
    return window.localStorage.getItem(key);
  } catch (_) {
    return null;
  }
};

const safeLocalStorageSet = (key, value) => {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch (_) {
    return false;
  }
};

const safeLocalStorageRemove = (key) => {
  try {
    window.localStorage.removeItem(key);
    return true;
  } catch (_) {
    return false;
  }
};

export { safeLocalStorageGet, safeLocalStorageSet, safeLocalStorageRemove };
