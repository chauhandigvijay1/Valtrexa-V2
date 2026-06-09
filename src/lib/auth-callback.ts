const AUTH_QUERY_KEYS = ["code", "error", "error_code", "error_description"];
const AUTH_HASH_KEYS = ["access_token", "refresh_token", "expires_in", "token_type", "type"];

function getHashParams(hash: string) {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  return new URLSearchParams(raw);
}

export function hasAuthCallbackParams(urlLike?: string) {
  if (typeof window === "undefined") return false;
  const url = new URL(urlLike ?? window.location.href);
  if (AUTH_QUERY_KEYS.some((key) => url.searchParams.has(key))) return true;
  const hashParams = getHashParams(url.hash);
  return AUTH_HASH_KEYS.some((key) => hashParams.has(key));
}

export function getAuthCallbackError(urlLike?: string) {
  if (typeof window === "undefined") return null;
  const url = new URL(urlLike ?? window.location.href);
  const queryError = url.searchParams.get("error_description") ?? url.searchParams.get("error");
  if (queryError) return queryError;
  const hashParams = getHashParams(url.hash);
  return hashParams.get("error_description") ?? hashParams.get("error");
}

export function clearAuthCallbackParams() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  AUTH_QUERY_KEYS.forEach((key) => url.searchParams.delete(key));
  url.hash = "";
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
}
