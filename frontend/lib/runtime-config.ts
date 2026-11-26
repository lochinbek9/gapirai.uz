const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

export function getApiUrl(): string {
  // localhost'dan ochilganda doim local backend: .env.local'dagi tashqi (tailscale) manzil
  // shu kompyuterning o'zidan ochilmasligi mumkin.
  if (typeof window !== "undefined" && LOCAL_HOSTS.has(window.location.hostname)) {
    return "http://localhost:8000";
  }
  return process.env.NEXT_PUBLIC_API_URL || "https://api.gapirai.uz";
}
