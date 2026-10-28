/* Panel oqimi: kalit -> tanlangan klip -> yuklash -> holatni kuzatish -> natijani timeline'ga qo'yish. */
(function () {
  var API_BASE = 'https://api.gapirai.uz';
  var SITE = 'https://gapirai.uz/dashboard#premiere';
  var POLL_MS = 5000;
  var STAGES = {
    PENDING: 'Navbatda', DOWNLOADING: 'Video qabul qilinmoqda', TRANSCRIBING: 'Nutq matnga oʻgirilmoqda',
    TRANSLATING: 'Oʻzbekchaga tarjima qilinmoqda', SYNTHESIZING: 'Ovoz yaratilmoqda', SYNCING: 'Ovoz vaqtga moslanmoqda',
    MERGING: 'Yakunlanmoqda', COMPLETED: 'Tayyor', FAILED: 'Xatolik', AWAITING_PAYMENT: 'Toʻlov kutilmoqda',
  };

  var $ = function (id) { return document.getElementById(id); };
  var store = {
    get: function (k) { try { return localStorage.getItem('gapirai.' + k); } catch (e) { return null; } },
    set: function (k, v) { try { v == null ? localStorage.removeItem('gapirai.' + k) : localStorage.setItem('gapirai.' + k, v); } catch (e) { /* yo'q */ } },
  };

  var selection = null, busy = false, authed = false;
  var IS_AE = GapirCep.hostApp() === 'AEFT';

  function client() { return new GapirApi.Client(API_BASE, store.get('key') || ''); }

  function showError(msg) {
    $('error').textContent = msg || '';
    $('error').hidden = !msg;
  }

  function setProgress(stage, pct, detail) {
    $('progress').hidden = false;
    $('stage').textContent = stage;
    $('bar-fill').style.width = Math.max(0, Math.min(100, pct || 0)) + '%';
    $('detail').textContent = detail || '';
  }

  function setBusy(b) {
    busy = b;
    $('start').disabled = b || !selection || !authed;
    $('pick').disabled = b;
  }

  function fmt(sec) {
    sec = Math.max(0, Math.round(sec));
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function radio(name) {
    var el = document.querySelector('input[name="' + name + '"]:checked');
    return el ? el.value : '';
  }

  /* ---------- Kalit ---------- */

  function refreshAuth() {
    var key = store.get('key');
    authed = false;
    if (!key) {
      $('auth-status').textContent = 'Kalit kiritilmagan.';
      setBusy(busy);
      return;
    }
    $('auth-status').textContent = 'Tekshirilmoqda…';
    client().me().then(function (u) {
      $('auth-status').innerHTML = '';
      var ok = document.createElement('span');
      ok.className = 'ok';
      ok.textContent = 'Ulangan: ' + (u.email || u.name);
      authed = true;
      $('auth-status').appendChild(ok);
      $('api-key').value = '';
      $('api-key').placeholder = 'Kalit saqlangan. Almashtirish uchun yangisini kiriting.';
    }).catch(function (e) {
      $('auth-status').textContent = e.status === 401 ? 'Kalit yaroqsiz yoki bekor qilingan.' : e.message;
    }).then(function () { setBusy(busy); });
  }

  $('save-key').addEventListener('click', function () {
    var v = $('api-key').value.trim();
    if (!v) return showError('Kalitni kiriting.');
    showError('');
    store.set('key', v);
    refreshAuth();
  });

  $('get-key').addEventListener('click', function () { GapirCep.openUrl(SITE); });

  /* ---------- Klip ---------- */

  $('pick').addEventListener('click', function () {
    showError('');
    if (!authed && store.get('key')) refreshAuth();   // panel ochilganda internet yo'q bo'lgan bo'lsa
    GapirCep.evalScript('gapirai_getSelection()').then(function (r) {
      if (!r.ok) throw new Error(r.error);
      client().checkFile(r.path);
      selection = r;
      $('clip-name').textContent = r.name;
      $('clip-file').textContent = GapirApi.path.basename(r.path);
      $('clip-dur').textContent = fmt(r.outPoint - r.inPoint) + ' (manbada ' + fmt(r.inPoint) + '–' + fmt(r.outPoint) + ')';
      $('clip-info').hidden = false;
      if (Math.abs((r.end - r.start) - (r.outPoint - r.inPoint)) > 0.1) {
        showError("Diqqat: bu klipning tezligi oʻzgartirilgan. Ovoz va subtitr asl tezlikda qoʻyiladi va klipga toʻliq mos kelmasligi mumkin.");
      }
    }).catch(function (e) {
      selection = null;
      $('clip-info').hidden = true;
      showError(e.message);
    }).then(function () { setBusy(busy); });
  });

  function syncVoiceBox() {
    $('voice-box').hidden = radio('mode') === 'subtitle';
  }
  Array.prototype.forEach.call(document.querySelectorAll('input[name="mode"]'), function (el) {
    el.addEventListener('change', syncVoiceBox);
  });

  /* ---------- Ish ---------- */

  function outputDir(sel) {
    var base = sel.projectPath ? GapirApi.path.dirname(sel.projectPath) : GapirApi.path.join(GapirApi.os.homedir(), 'Documents');
    var dir = GapirApi.path.join(base, 'GapirAI');
    // CEP 9 (Premiere 2020) Node 8 da -- mkdirSync'ning {recursive} varianti yo'q
    if (!GapirApi.fs.existsSync(base)) GapirApi.fs.mkdirSync(base);
    if (!GapirApi.fs.existsSync(dir)) GapirApi.fs.mkdirSync(dir);
    return dir;
  }

  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function poll(id) {
    return client().job(id).then(function (j) {
      var st = String(j.status || '').toUpperCase();   // API kichik harfda qaytaradi ("completed")
      setProgress(STAGES[st] || st, j.progress || 0, j.status_message || '');
      if (st === 'COMPLETED') return j;
      if (st === 'FAILED') throw new Error(j.error_message || j.status_message || 'Video qayta ishlanmadi.');
      if (st === 'AWAITING_PAYMENT') throw new Error("Bu video uchun daqiqangiz yetmaydi. Saytda daqiqa sotib oling va qayta yuboring.");
      return wait(POLL_MS).then(function () { return poll(id); });
    }, function (e) {
      if (e.status) throw e;                       // API xatosi -- to'xtaymiz
      setProgress($('stage').textContent, null, 'Tarmoq uzildi, qayta urinilmoqda…');
      return wait(POLL_MS * 2).then(function () { return poll(id); });
    });
  }

  function finish(job) {
    var id = job.job_id;
    var sel = job.selection;
    var dir = outputDir(sel);
    var stem = GapirApi.path.basename(sel.path, GapirApi.path.extname(sel.path)) + '.' + id.slice(0, 8);
    var srtFull = GapirApi.path.join(dir, stem + '.full.uz.srt');
    var srtClip = GapirApi.path.join(dir, stem + '.uz.srt');
    var wavFull = job.mode === 'dub' ? GapirApi.path.join(dir, stem + '.full.uz.wav') : '';
    var wav = job.mode === 'dub' ? GapirApi.path.join(dir, stem + '.uz.wav') : '';
    var dur = sel.outPoint - sel.inPoint;
    var warn = '';

    setProgress('Natija yuklab olinmoqda', 100, dir);
    var c = client();
    return c.download('/api/jobs/' + id + '/subtitles.srt', srtFull).then(function () {
      var text = GapirApi.fs.readFileSync(srtFull, 'utf8');
      GapirApi.fs.writeFileSync(srtClip, GapirSrt.shiftSrt(text, sel.start, sel.inPoint, sel.outPoint), 'utf8');
      if (!wav) return;
      return c.download('/api/outputs/' + id + '/audio', wavFull).then(function () {
        // Butun video uchun audio -> faqat klipning kesilgan qismi
        var cut = GapirWav.sliceWav(GapirApi.fs.readFileSync(wavFull), sel.inPoint, sel.outPoint);
        if (cut.seconds < 0.1) {
          warn = "Dublaj audiosi klipning bu qismiga yetmaydi -- audio qoʻyilmadi (toʻliq fayl: " + GapirApi.path.basename(wavFull) + ").";
          wav = '';
          return;
        }
        GapirApi.fs.writeFileSync(wav, cut.buffer);
      });
    }).then(function () {
      var call;
      if (IS_AE) {
        // After Effects: har bir kue -- kompozitsiya vaqtidagi alohida matn qatlami
        setProgress('Kompozitsiyaga qoʻyilmoqda', 100, '');
        var cues = GapirSrt.cues(GapirApi.fs.readFileSync(srtClip, 'utf8'));
        call = 'gapirai_placeAE(' + [
          GapirCep.jsxString(wav), Number(sel.start) || 0, Number(dur) || 0, GapirCep.jsxString(sel.sequenceId || ''), GapirCep.jsxLiteral(cues),
        ].join(',') + ')';
      } else {
        setProgress('Timeline\'ga qoʻyilmoqda', 100, '');
        call = 'gapirai_place(' + [
          GapirCep.jsxString(wav), GapirCep.jsxString(srtClip), GapirCep.jsxString(sel.startTicks), Number(sel.start) || 0, Number(dur) || 0, GapirCep.jsxString(sel.sequenceId || ''),
        ].join(',') + ')';
      }
      return GapirCep.evalScript(call);
    }).then(function (r) {
      if (!r.ok) throw new Error(r.error);
      var done = [];
      if (r.audio) done.push(IS_AE ? 'oʻzbekcha ovoz audio qatlam boʻlib' : 'oʻzbekcha ovoz audio trekka');
      if (r.captions) done.push(IS_AE ? r.captionCount + ' ta subtitr matn qatlami boʻlib' : 'subtitr caption trekka');
      var msg = [done.length ? done.join(' va ') + ' qoʻyildi.' : '', warn, r.note || '', 'Fayllar: ' + dir];
      setProgress('Tayyor', 100, msg.filter(Boolean).join(' '));
    });
  }

  function run(job) {
    setBusy(true);
    store.set('pending', JSON.stringify(job));
    return poll(job.job_id).then(function () { return finish(job); }).then(function () {
      store.set('pending', null);
    }).catch(function (e) {
      if (e.status !== 503) store.set('pending', null);
      showError(e.message);
    }).then(function () { setBusy(false); });
  }

  $('start').addEventListener('click', function () {
    if (!selection || busy) return;
    showError('');
    var sel = selection;
    var mode = radio('mode');
    setBusy(true);
    setProgress('Fayl yuborilmoqda', 0, GapirApi.path.basename(sel.path));
    client().upload(sel.path, {
      subtitle_only: mode === 'subtitle' ? 'true' : 'false',
      voice_gender: radio('voice') || 'auto',
      source_language: 'auto',
    }, function (f) {
      setProgress('Fayl yuborilmoqda', f * 100, Math.round(f * 100) + '%');
    }).then(function (r) {
      return run({ job_id: r.job_id, mode: mode, selection: sel });
    }).catch(function (e) {
      showError(e.message);
      setBusy(false);
    });
  });

  /* ---------- Boshlanish ---------- */

  if (IS_AE) {
    $('pick').textContent = 'Kompozitsiyada tanlangan qatlamni olish';
    $('hint').textContent = 'Butun manba fayl yuboriladi (1 GB gacha, MP4/MOV/MKV/WebM). Ovoz qatlam boshiga, subtitr esa alohida matn qatlamlari boʻlib qoʻyiladi — ularni bemalol bezash va animatsiya qilish mumkin.';
  }
  syncVoiceBox();
  refreshAuth();
  var pending = store.get('pending');
  if (pending && store.get('key')) {
    try {
      var job = JSON.parse(pending);
      setProgress('Avvalgi ish davom etmoqda', 0, '');
      run(job);
    } catch (e) { store.set('pending', null); }
  }
})();
