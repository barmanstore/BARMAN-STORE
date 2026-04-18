const CANONICAL_HOST = String(import.meta.env.VITE_CANONICAL_HOST || 'barmanstore.vercel.app')
  .trim()
  .toLowerCase();
const LEGACY_HOSTS = new Set(
  String(import.meta.env.VITE_LEGACY_HOSTS || 'barman-store.vercel.app')
    .split(',')
    .map((value) =>
      String(value || '')
        .trim()
        .toLowerCase()
    )
    .filter(Boolean)
);

export const applyHostRedirect = () => {
  if (typeof window === 'undefined') return;
  const host = String(window.location.hostname || '')
    .trim()
    .toLowerCase();
  if (host && LEGACY_HOSTS.has(host) && host !== CANONICAL_HOST) {
    const target = `https://${CANONICAL_HOST}${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.location.replace(target);
  }
};
