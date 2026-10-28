"""GapirAI.lua testlari -- DaVinci Resolve'siz.

Lua 5.1 (Resolve ichidagi LuaJIT bilan bir xil til) `lupa` orqali ishlatiladi; Resolve
API va Fusion UIManager soxta (tests/mocks.lua), server -- shu yerdagi lokal HTTP
mock, tarmoq esa haqiqiy `curl` bilan (plagin Resolve'da ham shunday ishlaydi).

    python3 -m venv /tmp/v && /tmp/v/bin/pip install lupa
    /tmp/v/bin/python integrations/davinci-resolve/tests/run_tests.py
"""
import json
import os
import struct
import subprocess
import sys
import tempfile
import threading
import time
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from lupa import lua51

HERE = Path(__file__).resolve().parent
PLUGIN = HERE.parent / "GapirAI.lua"
RATE = 24000  # mono 16-bit

SRT = """1
00:00:00,000 --> 00:00:04,000
Salom va xush kelibsiz!

2
00:00:04,000 --> 00:00:08,640
Avval suvni qaynatib oling.

3
00:00:08,640 --> 00:00:14,000
Issiq suvni quying va kuting.

4
00:00:14,000 --> 00:00:16,480
Tomosha qilganingiz uchun rahmat!
"""


def make_wav(seconds):
    pcm = b"".join(struct.pack("<h", (i % 32000) - 16000) for i in range(int(seconds * RATE)))
    fmt = struct.pack("<HHIIHH", 1, 1, RATE, RATE * 2, 2, 16)
    return b"RIFF" + struct.pack("<I", 4 + 8 + len(fmt) + 8 + len(pcm)) + b"WAVE" + b"fmt " + struct.pack("<I", len(fmt)) + fmt + b"data" + struct.pack("<I", len(pcm)) + pcm


FULL_WAV = make_wav(17.3)


class Api(BaseHTTPRequestHandler):
    state = {}

    def log_message(self, *a):
        pass

    def send(self, code, body, ctype="application/json", headers=None):
        data = body if isinstance(body, bytes) else json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        for k, v in (headers or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(data)

    def authed(self):
        return self.headers.get("Authorization") == "Bearer good-key"

    def do_GET(self):
        s = Api.state
        path = self.path.split("?")[0]
        if path == "/auth/me":
            return self.send(200, {"email": "test@gapirai.uz"}) if self.authed() else self.send(401, {"detail": "API kalit bekor qilingan yoki yaroqsiz."})
        if path == "/api/jobs/job-1":
            s["polls"] = s.get("polls", 0) + 1
            if s["polls"] < 3:
                return self.send(200, {"job_id": "job-1", "status": "translating", "progress": 40, "status_message": "Tarjima qilinmoqda..."})
            return self.send(200, {"job_id": "job-1", "status": "completed", "progress": 100})
        if path == "/api/jobs/job-1/subtitles.srt":
            return self.send(200, SRT.encode(), "application/x-subrip")
        if path == "/api/outputs/job-1/audio":
            return self.send(307, b"", headers={"Location": "/files/dubbed.wav"})  # prod'dagi S3 redirect kabi
        if path == "/files/dubbed.wav":
            s["auth_on_redirect"] = self.headers.get("Authorization")
            return self.send(200, FULL_WAV, "audio/wav")
        self.send(404, {"detail": "topilmadi"})

    def do_POST(self):
        s = Api.state
        if self.path.startswith("/api/jobs/upload"):
            n = int(self.headers.get("Content-Length") or 0)
            body = self.rfile.read(n)
            s["upload"] = {"path": self.path, "ctype": self.headers.get("Content-Type"), "name": self.headers.get("X-File-Name"),
                           "auth": self.headers.get("Authorization"), "bytes": len(body), "expect": self.headers.get("Expect")}
            if s.get("reject_upload"):
                return self.send(402, {"detail": {"error": "insufficient_minutes", "message": "Bu video uchun 3 daqiqa yetishmayapti."}})
            return self.send(201, {"job_id": "job-1", "status": "pending"})
        self.send(404, {})


class Env:
    def __init__(self, tmp, port):
        self.tmp, self.port = tmp, port
        os.environ["HOME"] = str(tmp)
        (tmp / "Documents").mkdir(exist_ok=True)
        self.video = tmp / "Choy tayyorlash.mp4"
        self.video.write_bytes(os.urandom(300_000))
        self.L = lua51.LuaRuntime(unpack_returned_tuples=True)
        self.L.execute("GAPIRAI_TEST = true")
        # lupa'ning Lua 5.1 yig'masida io.popen yo'q (Resolve'ning LuaJIT'ida bor) -- Python orqali
        self.L.globals().PY_SHELL = lambda cmd: subprocess.run(cmd, shell=True, capture_output=True).stdout
        self.L.execute("""io.popen = function(cmd)
          local out = PY_SHELL(cmd)
          return { read = function() return out end, close = function() return true end }
        end""")
        load = self.L.eval("function(src, name) local fn = assert(loadstring(src, name)); return fn() end")
        self.G = load(PLUGIN.read_text(encoding="utf-8"), "GapirAI.lua")
        self.M = load((HERE / "mocks.lua").read_text(encoding="utf-8"), "mocks.lua")

    def config(self, **kv):
        lines = [f"base=http://127.0.0.1:{self.port}"] + [f"{k}={v}" for k, v in kv.items()]
        (self.tmp / ".gapirai-resolve").write_text("\n".join(lines) + "\n")

    def run(self, **opts):
        opts.setdefault("path", str(self.video))
        opts.setdefault("start", 250)        # timeline'da 10-soniyadan (25 fps)
        opts.setdefault("duration", 250)     # 10 s
        opts.setdefault("sourceStartFrame", 75)  # manbada 3-soniyadan
        opts.setdefault("subtitleAppend", True)
        lua_opts = self.L.table_from({k: (self.L.table_from([self.L.table_from([self.L.table_from(r) for r in tr]) for tr in v]) if k == "audioTracks" else v) for k, v in opts.items()})
        self.M.calls = self.L.table_from([])
        self.resolve = self.M.resolve(lua_opts)
        fu, bmd = self.M.fusion()
        self.G.run(self.resolve, fu, bmd)
        self.items = self.M.window['items']  # .items -- lupa proksisining o'z metodi

    def click(self, wid):
        fn = self.M.window.On[wid].Clicked
        fn(None)

    def tick_until(self, pred, timeout=25):
        end = time.time() + timeout
        while time.time() < end:
            if self.M.timer.running:
                self.M.dispatcher.On.Tick.Timeout(None)
            if pred():
                return True
            time.sleep(0.25)
        return False

    def text(self, wid):
        return str(self.items[wid].Text or "")

    def calls(self, name):
        # nil argumentlar Python ro'yxatida tushib qolmasin -- indeks bo'yicha olamiz
        return [[c[i] for i in range(1, 6)] for c in self.M.calls.values() if c[1] == name]


RESULTS = []


def check(name, cond, extra=""):
    RESULTS.append((name, bool(cond)))
    print(("PASS " if cond else "FAIL ") + name + (f"  ({extra})" if extra else ""))


def scenario(fn):
    def wrapper(env_factory):
        try:
            fn(env_factory())
        except Exception:
            traceback.print_exc()
            check(fn.__name__ + " (istisno)", False)
    wrapper.__name__ = fn.__name__
    return wrapper


@scenario
def unit_helpers(e):
    G, L = e.G, e.L
    t = L.eval("""function(G) local t = G.jsonDecode('{"a":[1,{"b":"o\\\\u02bbzbek"}],"c":null,"d":false,"e":-1.5e2,"f":"\\\\"q\\\\""}')
      return t.a[2].b, t.c == nil, t.d, t.e, t.f end""")(G)
    check("json: unicode escape, null, bool, son, qo'shtirnoq", tuple(t) == ("oʻzbek", True, False, -150.0, '"q"'), str(t))
    msg = G.apiError(402, json.dumps({"detail": {"message": "Daqiqangiz qolmagan."}}))
    check("apiError: detail.message", msg == "Daqiqangiz qolmagan.", msg)
    out, n = G.shiftSrt(SRT, 3, 13, 0)
    check("SRT: [3,13] kesiladi, 0 dan boshlanadi", n == 3 and out.startswith("1\n00:00:00,000 --> 00:00:01,000\nSalom") and "00:00:05,640 --> 00:00:10,000" in out, out.replace("\n", " | ")[:120])
    out2, _ = G.shiftSrt(SRT, 3, 13, 10)
    check("SRT: timeline offset (+10 s)", "00:00:10,000 --> 00:00:11,000" in out2)
    check("progress: curl bar oxirgi foizi", G.progress("##     12.5%\r#####   48,0%\r") == 48.0)
    check("urlencode: bo'shliq va o'zbekcha", G.urlencode("Choy tayyorlash ʻ.mp4") == "Choy%20tayyorlash%20%CA%BB.mp4")
    # ikkilik satrlarni Python'ga qaytarmaymiz (lupa ularni UTF-8 deb o'qiydi) -- fayl orqali
    wav_in, wav_out = e.tmp / "in.wav", e.tmp / "cut.wav"
    wav_in.write_bytes(FULL_WAV)
    secs, total = L.eval("function(G, i, o) local c, s, t = G.sliceWav(G.readFile(i), 3, 13); G.writeFile(o, c); return s, t end")(G, str(wav_in), str(wav_out))
    cut = wav_out.read_bytes()
    ref = FULL_WAV[44 + 3 * RATE * 2: 44 + 13 * RATE * 2]
    check("WAV: [3,13] kesimi bayt-ba-bayt to'g'ri", cut[44:] == ref and abs(secs - 10) < 1e-6 and abs(total - 17.3) < 1e-3, f"{secs} {total}")
    check("WAV: sarlavha o'lchamlari", struct.unpack("<I", cut[40:44])[0] == len(ref) and struct.unpack("<I", cut[4:8])[0] == len(cut) - 8)
    secs2 = L.eval("function(G, i) local _, s = G.sliceWav(G.readFile(i), 30, 40); return s end")(G, str(wav_in))
    check("WAV: audiodan tashqari oraliq -> 0 s", secs2 == 0)
    check("checkFile: .avi rad etiladi", G.checkFile(str(e.tmp / "x.avi"))[1].startswith("Bu format"))


@scenario
def dub_full_flow(e):
    e.config(key="good-key")
    e.run(audioTracks=[[[200, 600]], [[0, 0]]])
    check("kalit tekshirildi -> Ulangan", "Ulangan: test@gapirai.uz" in e.text("Auth"), e.text("Auth"))
    e.click("Pick")
    check("klip olindi (10 s, manbada 3-13 s)", "10.0 s (manbada 3.0–13.0 s)" in e.text("Clip"), e.text("Clip"))
    check("Yuborish tugmasi faol", e.items.Start.Enabled is True)
    e.click("Start")
    ok = e.tick_until(lambda: "Tayyor." in e.text("Status"))
    check("oqim tugadi: Tayyor", ok, e.text("Status")[:160])
    up = Api.state.get("upload", {})
    check("upload: Content-Type, fayl nomi, kalit, butun fayl", up.get("ctype") == "video/mp4" and up.get("name") == "Choy%20tayyorlash.mp4"
          and up.get("auth") == "Bearer good-key" and up.get("bytes") == 300_000, str(up))
    check("upload: query (dublaj, auto)", "subtitle_only=false" in up.get("path", "") and "voice_gender=auto" in up.get("path", ""), up.get("path"))
    check("upload: Expect: 100-continue o'chirilgan", up.get("expect") is None)
    check("audio redirect'ida kalit yuborilmadi", Api.state.get("auth_on_redirect") is None)
    app = e.calls("AppendToTimeline")
    wav = [c for c in app if str(c[1]).endswith(".uz.wav")]
    check("audio A2 ga (A1 band), recordFrame = klip boshi", wav and wav[0][2] == 2 and wav[0][3] == 2 and wav[0][4] == 86400 + 250, str(wav))
    srt = [c for c in app if str(c[1]).endswith(".uz.srt")]
    check("subtitr klip boshiga qo'yildi", srt and srt[0][4] == 86400 + 250, str(srt))
    imports = e.calls("ImportMedia")
    check("import 'GapirAI' papkasiga", imports and all(c[2] == "GapirAI" for c in imports), str(imports))
    work = e.tmp / "Documents" / "GapirAI"
    clip_wav = next(work.glob("*.job-1.uz.wav"), None)
    data = clip_wav.read_bytes() if clip_wav else b""
    check("kesilgan WAV = to'liq audioning 3-13 s qismi", data[44:] == FULL_WAV[44 + 3 * RATE * 2: 44 + 13 * RATE * 2])
    clip_srt = (work / "Choy tayyorlash.job-1.uz.srt").read_text()
    check("klip SRT 0 dan, 3 ta kue", clip_srt.startswith("1\n00:00:00,000 --> 00:00:01,000") and clip_srt.count("-->") == 3)
    cfg = (e.tmp / ".gapirai-resolve").read_text()
    check("tugagach pending tozalandi", "pending=" not in cfg and "key=good-key" in cfg)
    check("taymer to'xtadi", e.M.timer.running is False)


@scenario
def subtitle_only_with_import_fallback(e):
    Api.state.clear()
    e.config(key="good-key")
    e.run(subtitleAppend=False)
    e.click("Pick")
    e.items.Mode.CurrentIndex = 1
    e.items.Voice.CurrentIndex = 2
    e.click("Start")
    ok = e.tick_until(lambda: "Tayyor." in e.text("Status"))
    check("faqat subtitr: tugadi", ok, e.text("Status")[:200])
    up = Api.state.get("upload", {})
    check("query: subtitle_only=true, voice=female", "subtitle_only=true" in up.get("path", "") and "voice_gender=female" in up.get("path", ""))
    check("audio yuklanmadi/qo'yilmadi", not any(str(c[1]).endswith(".wav") for c in e.calls("AppendToTimeline")))
    check("subtitr qo'yilmasa: Import Subtitle yo'riqnomasi", "Import → Subtitle" in e.text("Status") and ".timeline.uz.srt" in e.text("Status"), e.text("Status")[:220])
    tl = (e.tmp / "Documents" / "GapirAI" / "Choy tayyorlash.job-1.timeline.uz.srt").read_text()
    check("timeline SRT klip joyidan (+10 s)", tl.startswith("1\n00:00:10,000 --> 00:00:11,000"), tl[:60])


@scenario
def no_free_track_adds_one(e):
    Api.state.clear()
    e.config(key="good-key")
    e.run(audioTracks=[[[0, 900]]])
    e.click("Pick")
    e.click("Start")
    e.tick_until(lambda: "Tayyor." in e.text("Status"))
    check("bo'sh trek yo'q -> yangi audio trek qo'shildi", e.calls("AddTrack"), str(e.calls("AddTrack")))
    wav = [c for c in e.calls("AppendToTimeline") if str(c[1]).endswith(".uz.wav")]
    check("audio yangi trekka (A2)", wav and wav[0][3] == 2, str(wav))


@scenario
def left_offset_fallback(e):
    e.config(key="good-key")
    e.run(sourceStartFrame=None, leftOffset=50, fps="25")
    e.click("Pick")
    check("GetSourceStartFrame yo'q -> GetLeftOffset (2.0 s)", "(manbada 2.0–12.0 s)" in e.text("Clip"), e.text("Clip"))


@scenario
def bad_key(e):
    e.config(key="wrong")
    e.run()
    check("yaroqsiz kalit xabari", "bekor qilingan" in e.text("Auth"), e.text("Auth"))
    e.click("Pick")
    check("kalit tasdiqlanmaguncha Yuborish o'chiq", e.items.Start.Enabled is False)


@scenario
def upload_rejected(e):
    Api.state.clear()
    Api.state["reject_upload"] = True
    e.config(key="good-key")
    e.run()
    e.click("Pick")
    e.click("Start")
    ok = e.tick_until(lambda: "yetishmayapti" in e.text("Status"))
    check("402 -> server xabari ko'rsatildi", ok, e.text("Status"))
    check("xatodan keyin qayta yuborish mumkin", e.items.Start.Enabled is True)
    Api.state.pop("reject_upload", None)


@scenario
def no_clip_under_playhead(e):
    e.config(key="good-key")
    e.run(noItem=True)
    e.click("Pick")
    check("playhead ostida klip yo'q -> yo'riqnoma", "Playhead" in e.text("Clip"), e.text("Clip"))


@scenario
def resume_then_pick(e):
    Api.state.clear()
    Api.state["polls"] = 5  # job allaqachon tayyor
    e.config(key="good-key", pending=f"job-1|dub|{e.video}|Timeline 1")
    e.run(noItem=True)
    ok = e.tick_until(lambda: "Klipni olish" in e.text("Status"))
    check("qayta ochildi, natija tayyor, klip so'raldi", ok, e.text("Status")[:200])
    # foydalanuvchi playhead'ni klip ustiga qo'yadi
    e.resolve.GetProjectManager(e.resolve).GetCurrentProject().GetCurrentTimeline()  # sanity
    e.run_item = None
    Env.run(e, sourceStartFrame=75)  # yangi oyna ob'ekti: playhead endi klip ustida
    ok2 = e.tick_until(lambda: "Tayyor." in e.text("Status"))
    check("qayta ochilganda pending davom etib, joyiga qo'yildi", ok2, e.text("Status")[:160])


def main():
    server = ThreadingHTTPServer(("127.0.0.1", 0), Api)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    port = server.server_address[1]
    for sc in [unit_helpers, dub_full_flow, subtitle_only_with_import_fallback, no_free_track_adds_one, left_offset_fallback,
               bad_key, upload_rejected, no_clip_under_playhead, resume_then_pick]:
        print(f"--- {sc.__name__}")
        sc(lambda: Env(Path(tempfile.mkdtemp(prefix="gapirai-resolve-")), port))
    server.shutdown()
    failed = [n for n, ok in RESULTS if not ok]
    print(f"\n{len(RESULTS) - len(failed)}/{len(RESULTS)} o'tdi" + (f"; FAIL: {failed}" if failed else ""))
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
