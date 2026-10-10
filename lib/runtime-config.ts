const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

export function getApiUrl(): string {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }

  if (typeof window !== "undefined") {
    if (LOCAL_HOSTS.has(window.location.hostname)) {
      return "http://localhost:8000";
    }

    return "https://api.gapirai.uz";
  }

  return "https://api.gapirai.uz";
}
