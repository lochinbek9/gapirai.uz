/*
 * GapirAI -- Premiere Pro va After Effects tomoni (ExtendScript, ES3).
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
function _ppGetSelection() {
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


// ===================================================================== After Effects

function _isAE() {
    return typeof BridgeTalk !== 'undefined' && BridgeTalk.appName === 'aftereffects';
}

/** Tanlangan klip: Premiere'da timeline'dagi, After Effects'da kompozitsiyadagi qatlam. */
function gapirai_getSelection() {
    return _isAE() ? _aeGetSelection() : _ppGetSelection();
}

/**
 * AE: faol kompozitsiyada tanlangan (manbasi fayl bo'lgan) qatlam.
 * start/end -- qatlamning kompozitsiyadagi ko'rinadigan oralig'i (inPoint/outPoint, soniya);
 * inPoint/outPoint -- manba fayldagi mos oraliq. Tezlik (stretch) 100% bo'lmasa end-start
 * manbadagi oraliqdan farq qiladi -- panel shu bo'yicha ogohlantiradi.
 */
function _aeGetSelection() {
    try {
        var comp = app.project.activeItem;
        if (!comp || !(comp instanceof CompItem)) return _err("Kompozitsiyani oching (Composition panelida).");
        var layers = comp.selectedLayers, layer = null, i;
        for (i = 0; i < layers.length; i++) {
            var src = layers[i].source;
            if (src && src instanceof FootageItem && src.file) { layer = layers[i]; break; }
        }
        if (!layer) return _err("Kompozitsiyada video fayl qatlamini tanlang (matn, shakl yoki pre-comp emas).");
        var stretch = layer.stretch || 100;
        var srcIn = (layer.inPoint - layer.startTime) * 100 / stretch;
        var srcOut = (layer.outPoint - layer.startTime) * 100 / stretch;
        return _json({
            ok: true,
            name: layer.name,
            path: layer.source.file.fsName,
            start: layer.inPoint,
            startTicks: '',
            end: layer.outPoint,
            inPoint: Math.min(srcIn, srcOut),
            outPoint: Math.max(srcIn, srcOut),
            sequence: comp.name,
            sequenceId: String(comp.id),
            projectPath: app.project.file ? app.project.file.fsName : ''
        });
    } catch (e) {
        return _err('Tanlovni o\'qib bo\'lmadi: ' + e);
    }
}

function _aeCompById(id) {
    if (id && app.project.itemByID) {
        try { var c = app.project.itemByID(parseInt(id, 10)); if (c instanceof CompItem) return c; } catch (e) {}
    }
    if (id) {
        for (var i = 1; i <= app.project.numItems; i++) {
            var it = app.project.item(i);
            if (it instanceof CompItem && String(it.id) === String(id)) return it;
        }
    }
    return app.project.activeItem instanceof CompItem ? app.project.activeItem : null;
}

function _aeFolder(name) {
    for (var i = 1; i <= app.project.numItems; i++) {
        var it = app.project.item(i);
        if (it instanceof FolderItem && it.name === name) return it;
    }
    return app.project.items.addFolder(name);
}

function _aeImport(path, folder) {
    var item = app.project.importFile(new ImportOptions(new File(path)));
    if (item && folder) item.parentFolder = folder;
    return item;
}

/**
 * AE: natijani kompozitsiyaga qo'yish (bitta Undo qadami).
 * audioPath -- klip qismiga kesilgan dublaj audiosi (bo'sh bo'lsa -- faqat subtitr);
 * startSec -- qatlamning kompozitsiyadagi boshi; cues -- [{s, e, t}] kompozitsiya vaqtida.
 * Har bir kue -- alohida matn qatlami (animatsiya/uslub berish mumkin).
 */
function gapirai_placeAE(audioPath, startSec, durSec, compId, cues) {
    var comp = _aeCompById(compId);
    if (!comp) return _err("Klip turgan kompozitsiya topilmadi.");
    app.beginUndoGroup('GapirAI — oʻzbekcha dublaj');
    try {
        var folder = _aeFolder('GapirAI');
        var placedAudio = false, captions = 0, note = '';
        if (audioPath) {
            var item = _aeImport(audioPath, folder);
            if (item) {
                var a = comp.layers.add(item);
                a.startTime = startSec;
                a.name = 'GapirAI — oʻzbekcha ovoz';
                placedAudio = true;
            } else {
                note = "Audio import bo'lmadi.";
            }
        }
        var h = comp.height, w = comp.width, size = Math.max(18, Math.round(h / 18));
        for (var i = 0; cues && i < cues.length; i++) {
            var c = cues[i];
            var s = Math.max(0, c.s), e = Math.min(comp.duration, c.e);
            if (e <= s) continue;
            var text = String(c.t).replace(/\r?\n/g, '\r');
            var t = comp.layers.addText(text);
            var prop = t.property('Source Text');
            var doc = prop.value;
            doc.fontSize = size;
            doc.fillColor = [1, 1, 1];
            doc.applyFill = true;
            doc.applyStroke = true;
            doc.strokeColor = [0, 0, 0];
            doc.strokeWidth = Math.max(2, Math.round(size / 8));
            doc.strokeOverFill = false;
            doc.justification = ParagraphJustification.CENTER_JUSTIFY;
            prop.setValue(doc);
            var lines = text.split('\r').length;
            t.property('Position').setValue([w / 2, h * 0.9 - (lines - 1) * size * 1.2]);
            t.outPoint = e;
            t.inPoint = s;
            t.name = 'UZ ' + (i + 1) + ': ' + text.replace(/\r/g, ' ').substring(0, 40);
            t.label = 11;
            captions++;
        }
        app.endUndoGroup();
        return _json({ ok: true, audio: placedAudio, captions: captions > 0, captionCount: captions, note: note });
    } catch (e) {
        app.endUndoGroup();
        return _err('Kompozitsiyaga qo\'yib bo\'lmadi: ' + e);
    }
}
