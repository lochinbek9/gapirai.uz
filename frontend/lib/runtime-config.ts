const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

export function getApiUrl(): string {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }

  // Padrão: mesma origem. O nginx do gapirai.uz encaminha /api/ e /auth/
  // para o backend, então chamar relativo evita depender do subdomínio
  // api.gapirai.uz (que aponta para outro servidor e causa 404 no login).
  if (typeof window !== "undefined") {
    if (LOCAL_HOSTS.has(window.location.hostname)) {
      return "http://localhost:8000";
    }
    return "";
  }

  return "";
}
