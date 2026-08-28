"""Central YouTube-ingestion error classification.

Single source of truth for turning a raw yt-dlp/network/proxy exception
into (a) an internal error_code for logs and monitoring, (b) a retry
decision, and (c) a safe Uzbek user-facing message. Every download-adjacent
Celery task (process_video, analyze_video_task) and downloader.py's own
retry/escalation decision route through this module, so there is exactly
one place that decides what a given failure means -- no per-file duplicate
marker lists that can drift out of sync with each other.

Text-marker classification only, on purpose. yt-dlp/urllib3/requests raise
plain RuntimeError/OSError without a structured `.code`, so matching on the
exception's own message is the only signal available -- this file does not
add any new network behavior, proxy logic, or bot-detection countermeasure.

2026-08-26 ingestion audit: this module also NARROWS what previously
triggered residential-proxy escalation. "HTTP Error 403" and "Requested
format is not available" alone are no longer treated as bot-check signals
-- neither proves a blocked IP, and escalating a proxy tier for a problem
a proxy can't fix (an extractor/config issue) wastes the residential-proxy
budget for no benefit. Only a confirmed AUTH_ERROR (explicit "sign in to
confirm" / stale-session marker) triggers that escalation now.
"""
import re

AUTH_ERROR = "AUTH_ERROR"
HTTP_403 = "HTTP_403"
HTTP_429 = "HTTP_429"
EXTRACTOR_ERROR = "EXTRACTOR_ERROR"
PO_TOKEN_REQUIRED = "PO_TOKEN_REQUIRED"
VIDEO_UNAVAILABLE = "VIDEO_UNAVAILABLE"
NETWORK_ERROR = "NETWORK_ERROR"
PROXY_ERROR = "PROXY_ERROR"
PROXY_BILLING_ERROR = "PROXY_BILLING_ERROR"
UPSTREAM_ERROR = "UPSTREAM_ERROR"
TIMEOUT = "TIMEOUT"
UNKNOWN = "UNKNOWN"

# Genuine bot-check / stale-session markers -- the ONLY signals that justify
# the one-time residential-proxy escalation in downloader.py, and the only
# ones classified as AUTH_ERROR (which in turn means "do not blind-retry").
_AUTH_MARKERS = ("sign in to confirm", "cookies are no longer valid", "cookielari eskirgan")

# yt-dlp's own wording when a client's Proof-of-Origin token is missing,
# rejected, or the pot-provider sidecar couldn't be reached -- distinct
# from a stale-cookie AUTH_ERROR (a PO token is per-session, not per-user).
_PO_TOKEN_MARKERS = ("po token", "potoken", "missing pot", "content isn't available")

_UNAVAILABLE_MARKERS = (
    "private video", "video unavailable", "video is unavailable", "no longer available",
    "has been removed", "account associated with this video has been terminated",
    "this video is not available", "copyright", "members-only", "premieres in",
    "live event will begin", "this live stream recording is not available",
    "video has been removed",
)

_EXTRACTOR_MARKERS = ("unable to extract", "requested format is not available", "unsupported url")

_NETWORK_MARKERS = ("connection reset", "network is unreachable", "failed to establish a new connection", "name or service not known")

_PROXY_MARKERS = ("unable to connect", "tunnel connection failed", "proxyerror")

_UPSTREAM_MARKERS = ("service unavailable", "internal server error", "bad gateway", "http error 5")


def classify_text(text: str) -> str:
    """Classifies a raw error message string. Order matters: higher-
    confidence, more specific markers are checked first -- a bot-check
    message can legitimately also contain "403" somewhere, so AUTH_ERROR
    must win over the bare HTTP_403 check, not the other way round."""
    lower = (text or "").lower()

    if any(m in lower for m in _AUTH_MARKERS):
        return AUTH_ERROR
    if "402" in text and ("payment required" in lower or "proxy" in lower):
        return PROXY_BILLING_ERROR
    if any(m in lower for m in _PO_TOKEN_MARKERS):
        return PO_TOKEN_REQUIRED
    if any(m in lower for m in _UNAVAILABLE_MARKERS):
        return VIDEO_UNAVAILABLE
    if "http error 429" in lower or "too many requests" in lower:
        return HTTP_429
    if "http error 403" in lower:
        return HTTP_403
    if any(m in lower for m in _PROXY_MARKERS):
        return PROXY_ERROR
    if "timed out" in lower or "timeout" in lower:
        return TIMEOUT
    if any(m in lower for m in _NETWORK_MARKERS):
        return NETWORK_ERROR
    if any(m in lower for m in _EXTRACTOR_MARKERS):
        return EXTRACTOR_ERROR
    if any(m in lower for m in _UPSTREAM_MARKERS):
        return UPSTREAM_ERROR
    return UNKNOWN


def classify_error(exc: BaseException) -> str:
    return classify_text(str(exc))


# Categories where retrying the same job seconds/minutes later cannot
# possibly change the outcome -- a stale/blocked session, an unavailable
# video, or a proxy provider that is out of balance will not fix itself by
# trying again in 30 seconds. Everything else keeps the existing bounded
# Celery retry (max_retries=5, capped exponential backoff) unchanged.
_NO_RETRY = frozenset({AUTH_ERROR, VIDEO_UNAVAILABLE, PROXY_BILLING_ERROR})


def should_retry(code: str) -> bool:
    """False means fail immediately (PermanentError-style), true means the
    existing bounded Celery retry ladder is allowed to run. This function
    does not itself retry anything or change the retry count/backoff --
    it only gates whether the ladder is entered at all."""
    return code not in _NO_RETRY


def should_escalate_to_residential_proxy(exc: BaseException) -> bool:
    """The only case allowed to trigger the existing one-time residential-
    proxy tier in downloader.py. Narrowed to AUTH_ERROR only (2026-08-26
    audit) -- HTTP_403 alone is classified but does NOT auto-escalate,
    since a bare 403 is not proof the IP is the problem."""
    return classify_error(exc) == AUTH_ERROR


SAFE_USER_MESSAGES = {
    AUTH_ERROR: "Videoni olish uchun kerakli ruxsat mavjud emas.",
    HTTP_403: "Videoni olishda xatolik yuz berdi. Birozdan so'ng qayta urinib ko'ring.",
    HTTP_429: "YouTube vaqtincha so'rovlarni chekladi. Birozdan keyin qayta urinib ko'ring.",
    EXTRACTOR_ERROR: "Bu videoni hozircha qayta ishlab bo'lmadi.",
    PO_TOKEN_REQUIRED: "Bu video hozirgi kirish usuli bilan mavjud emas.",
    VIDEO_UNAVAILABLE: "Bu video mavjud emas yoki unga kirish cheklangan.",
    NETWORK_ERROR: "Tarmoq xatoligi yuz berdi. Birozdan so'ng qayta urinib ko'ring.",
    PROXY_ERROR: "Vaqtinchalik texnik xatolik yuz berdi. Birozdan so'ng qayta urinib ko'ring.",
    PROXY_BILLING_ERROR: "Xizmat vaqtincha band. Birozdan so'ng qayta urinib ko'ring.",
    UPSTREAM_ERROR: "YouTube tomonidan vaqtinchalik xatolik. Birozdan so'ng qayta urinib ko'ring.",
    TIMEOUT: "Vaqt tugadi. Birozdan so'ng qayta urinib ko'ring.",
    UNKNOWN: "Videoni hozircha qayta ishlay olmadik.",
}


def safe_user_message(code: str) -> str:
    return SAFE_USER_MESSAGES.get(code, SAFE_USER_MESSAGES[UNKNOWN])


# ---- secret scrubbing ----------------------------------------------------
#
# Applied to EVERY error string before it is persisted (job.error_message /
# analysis.error_message / variant.error_message) or logged. Some
# requests/urllib3 ProxyError messages embed the full proxy URL including
# credentials; this is the only defense between that and a public,
# unauthenticated GET /jobs/{id} response.

_URL_CREDENTIAL_RE = re.compile(r"://[^/@\s]+@")
_BEARER_RE = re.compile(r"(?i)\bbearer\s+[a-z0-9._~+/=-]{8,}")
_AUTH_HEADER_RE = re.compile(r"(?i)\bauthorization[\"']?\s*[:=]\s*[\"']?[^\s\"',}]+")
_COOKIE_HEADER_RE = re.compile(r"(?i)\bcookie[\"']?\s*[:=]\s*[\"']?[^\n\"';]{10,}")
_APIKEY_RE = re.compile(r"(?i)\b(api[_-]?key|access[_-]?token|token|secret)[\"']?\s*[:=]\s*[\"']?[A-Za-z0-9_\-.]{8,}")


def scrub_secrets(text: str) -> str:
    """Redacts anything that looks like a credential from a free-text error
    string. Safe to run unconditionally, including on text we already
    trust (e.g. our own PermanentError messages) -- it is a no-op on text
    that contains no credential-shaped substrings."""
    if not text:
        return text
    out = _URL_CREDENTIAL_RE.sub("://<redacted>@", text)
    out = _BEARER_RE.sub("Bearer <redacted>", out)
    out = _AUTH_HEADER_RE.sub("authorization=<redacted>", out)
    out = _COOKIE_HEADER_RE.sub("cookie=<redacted>", out)
    out = _APIKEY_RE.sub(lambda m: f"{m.group(1)}=<redacted>", out)
    return out
