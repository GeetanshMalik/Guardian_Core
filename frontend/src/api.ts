export const API_URL = (import.meta as any).env?.VITE_API_URL || "";

// Automatically inject credentials: "include" for all API requests to the backend in production
const originalFetch = window.fetch;
window.fetch = function (input, init) {
  const url = typeof input === "string" ? input : (input instanceof Request ? input.url : "");
  if (API_URL && url.startsWith(API_URL)) {
    init = init || {};
    init.credentials = "include";
  }
  return originalFetch(input, init);
};
