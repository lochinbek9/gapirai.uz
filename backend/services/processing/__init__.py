"""Processing boundary paketi — Phase 2 (Modal migratsiyasiga tayyorgarlik).

Faqat invocation boundary. Biznes mantiq backend/services/transcriber.py va
backend/services/merger.py da qoladi.
"""
from backend.services.processing.interface import (
    Encoder,
    Transcriber,
    LocalEncoder,
    LocalTranscriber,
    get_encoder,
    get_transcriber,
)

__all__ = [
    "Encoder",
    "Transcriber",
    "LocalEncoder",
    "LocalTranscriber",
    "get_encoder",
    "get_transcriber",
]
