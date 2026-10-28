/*
 * GapirAI -- Premiere Pro tomoni (ExtendScript, ES3).
 * Panel (js/main.js) bu funksiyalarni CSInterface.evalScript orqali chaqiradi;
 * har biri JSON matn qaytaradi: {"ok":true,...} yoki {"ok":false,"error":"..."}.
 */

function _q(s) {
    return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r/g, '\\r').replace(/\n/g, '\\n') + '"';
}

function _json(obj) {
    var parts = [];
    for (var k in obj) {
        if (!obj.hasOwnProperty(k)) continue;
        var v = obj[k];
        var out;
        if (v === null || v === undefined) out = 'null';
        else if (typeof v === 'number') out = isFinite(v) ? String(v) : 'null';
        else if (typeof v === 'boolean') out = v ? 'true' : 'false';
        else out = _q(v);
        parts.push(_q(k) + ':' + out);
    }
    return '{' + parts.join(',') + '}';
}

function _err(message) {
    return _json({ ok: false, error: message });
}

/** Faol sekvensiyada tanlangan (birinchi video) klip haqida ma'lumot. */
function gapirai_getSelection() {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return _err("Faol sekvensiya yo'q. Avval sekvensiyani oching.");
        var sel = seq.getSelection();
        var item = null, i;
        for (i = 0; i < sel.length; i++) {
            if (sel[i].projectItem && sel[i].mediaType === 'Video') { item = sel[i]; break; }
        }
        if (!item) {
            for (i = 0; i < sel.length; i++) {
                if (sel[i].projectItem) { item = sel[i]; break; }
            }
        }
        if (!item) return _err("Timeline'da bitta video klipni tanlang.");
        var path = item.projectItem.getMediaPath();
        if (!path) return _err("Bu klipning manba fayli topilmadi (nested sekvensiya yoki grafika bo'lishi mumkin).");
        return _json({
            ok: true,
            name: item.name,
            path: path,
            start: item.start.seconds,
            startTicks: String(item.start.ticks),
            end: item.end.seconds,
            inPoint: item.inPoint.seconds,
            outPoint: item.outPoint.seconds,
            sequence: seq.name,
            sequenceId: String(seq.sequenceID),
            projectPath: app.project.path
        });
    } catch (e) {
        return _err('Tanlovni o\'qib bo\'lmadi: ' + e);
    }
}

function _findOrCreateBin(name) {
    var root = app.project.rootItem;
    for (var i = 0; i < root.children.numItems; i++) {
        var c = root.children[i];
        if (c && c.type === ProjectItemType.BIN && c.name === name) return c;
    }
    return root.createBin(name);
}

function _findByPath(bin, path) {
    var norm = String(path).replace(/\\/g, '/').toLowerCase();
    for (var i = bin.children.numItems - 1; i >= 0; i--) {
        var c = bin.children[i];
        if (c && c.getMediaPath && String(c.getMediaPath()).replace(/\\/g, '/').toLowerCase() === norm) return c;
    }
    return null;
}

/** [from, to) oralig'ida klipi yo'q audio trek (pastdan yuqoriga qidiriladi). */
function _freeAudioTrack(seq, from, to) {
    for (var t = seq.audioTracks.numTracks - 1; t >= 0; t--) {
        var track = seq.audioTracks[t];
        var busy = false;
        for (var c = 0; c < track.clips.numItems; c++) {
            var clip = track.clips[c];
            if (clip.start.seconds < to && clip.end.seconds > from) { busy = true; break; }
        }
        if (!busy) return track;
    }
    return null;
}

/** Klip tanlangan sekvensiya (panel qayta ochilganda foydalanuvchi boshqasiga o'tgan bo'lishi mumkin). */
function _sequenceById(id) {
    if (id) {
        for (var i = 0; i < app.project.sequences.numSequences; i++) {
            var s = app.project.sequences[i];
            if (s && String(s.sequenceID) === String(id)) return s;
        }
    }
    return app.project.activeSequence;
}

/**
 * Tayyor fayllarni loyihaga import qiladi va klip joyiga qo'yadi.
 * audioPath -- klipning [inPoint, outPoint] qismiga allaqachon kesilgan dublaj
 *   audiosi (bo'sh bo'lsa -- faqat subtitr). startTicks -- klipning timeline'dagi
 *   boshi (Premiere ticks, satr: overwriteClip shuni kutadi); startSec/durSec --
 *   bo'sh trek qidirish uchun, soniyada.
 * srtPath -- allaqachon sekvensiya vaqtiga siljitilgan SRT (bo'sh bo'lishi mumkin).
 */
function gapirai_place(audioPath, srtPath, startTicks, startSec, durSec, sequenceId) {
    try {
        var seq = _sequenceById(sequenceId);
        if (!seq) return _err("Klip turgan sekvensiya topilmadi.");
        var bin = _findOrCreateBin('GapirAI');
        var files = [];
        if (audioPath) files.push(audioPath);
        if (srtPath) files.push(srtPath);
        app.project.importFiles(files, true, bin, false);

        var placedAudio = false, placedCaptions = false, note = '';
        if (audioPath) {
            var audioItem = _findByPath(bin, audioPath);
            if (!audioItem) return _err("Audio loyihaga import bo'lmadi.");
            var track = _freeAudioTrack(seq, startSec, startSec + durSec);
            if (track) {
                track.overwriteClip(audioItem, startTicks);
                placedAudio = true;
            } else {
                note = "Bo'sh audio trek topilmadi: audio 'GapirAI' papkasiga import qilindi, uni timeline'ga qo'lda torting.";
            }
        }
        if (srtPath) {
            var capItem = _findByPath(bin, srtPath);
            if (capItem && seq.createCaptionTrack) {
                placedCaptions = seq.createCaptionTrack(capItem, 0) !== false;
            }
            if (capItem && !placedCaptions) {
                note += (note ? ' ' : '') + "Subtitr trekini avtomatik yaratib bo'lmadi: SRT 'GapirAI' papkasida, uni timeline'ga torting.";
            }
        }
        return _json({ ok: true, audio: placedAudio, captions: placedCaptions, note: note });
    } catch (e) {
        return _err('Timeline\'ga qo\'yib bo\'lmadi: ' + e);
    }
}
