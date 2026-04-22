export const getLocalLedgerEntries = (storageKey) => {
  try {
    const raw = localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
};

export const saveLocalLedgerEntries = (storageKey, entries) => {
  try {
    localStorage.setItem(storageKey, JSON.stringify(entries));
  } catch (e) {
    // ignore storage failure
  }
};

export const addLocalLedgerEntry = (storageKey, entry) => {
  const existing = getLocalLedgerEntries(storageKey);
  saveLocalLedgerEntries(storageKey, [entry, ...existing]);
};
