import os
import sys
import logging
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, os.path.abspath("."))
logging.basicConfig(level=logging.DEBUG)

from backend.services.synthesizer import _synthesize_text

def task(i):
    text = f"Diqqat qiling {i}...."
    output_path = f"/app/backend/outputs/test_output_{i}.wav"
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    try:
        engine = _synthesize_text(
            text=text,
            output_path=output_path,
            voice_name=None,
            video_id="test_video_123",
            user_id="test_user_123",
            provider_name="uzbekvoice"
        )
        print(f"[{i}] SUCCESS engine: {engine}")
        return True
    except Exception as e:
        print(f"[{i}] FAILED: {repr(e)}")
        import traceback
        traceback.print_exc()
        return False

def test():
    print("Testing TTS synthesis in threads...")
    with ThreadPoolExecutor(max_workers=5) as executor:
        results = list(executor.map(task, range(5)))
    print(f"Overall results: {results}")

if __name__ == "__main__":
    test()
