/* PCM WAV'dan [from, to) soniya oralig'ini kesib, yangi WAV yozadi.
   Premiere'ning projectItem.setInPoint() birligi versiyaga qarab farq qiladi --
   shuning uchun klipga mos bo'lakni shu yerda tayyorlaymiz. */
(function () {
  var req = (window.cep_node && window.cep_node.require) || window.require;
  var Buffer = req('buffer').Buffer;

  function readChunks(buf) {
    if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') throw new Error('Audio WAV formatida emas.');
    var pos = 12, fmt = null, data = null;
    while (pos + 8 <= buf.length) {
      var id = buf.toString('ascii', pos, pos + 4);
      var size = buf.readUInt32LE(pos + 4);
      var body = pos + 8;
      if (id === 'fmt ') fmt = { start: body, size: size };
      if (id === 'data') {
        // ffmpeg oqimdan yozganda o'lcham 0 yoki 0xFFFFFFFF bo'lishi mumkin -- fayl oxirigacha
        if (!size || size === 0xFFFFFFFF || body + size > buf.length) size = buf.length - body;
        data = { start: body, size: size };
        break;
      }
      pos = body + size + (size % 2);
    }
    if (!fmt || !data) throw new Error("WAV fayl buzilgan (fmt/data topilmadi).");
    var blockAlign = buf.readUInt16LE(fmt.start + 12);
    var byteRate = buf.readUInt32LE(fmt.start + 8);
    if (!blockAlign || !byteRate) throw new Error("WAV formati qo'llab-quvvatlanmaydi.");
    return { fmt: fmt, data: data, blockAlign: blockAlign, byteRate: byteRate };
  }

  function sliceWav(buf, from, to) {
    var w = readChunks(buf);
    var duration = w.data.size / w.byteRate;
    from = Math.max(0, Math.min(from, duration));
    to = Math.max(from, Math.min(to, duration));
    var a = Math.floor(from * w.byteRate / w.blockAlign) * w.blockAlign;
    var z = Math.floor(to * w.byteRate / w.blockAlign) * w.blockAlign;
    var pcm = buf.slice(w.data.start + a, w.data.start + z);
    var fmtBody = buf.slice(w.fmt.start, w.fmt.start + w.fmt.size);
    var head = Buffer.alloc(12 + 8 + fmtBody.length + (fmtBody.length % 2) + 8);
    var p = 0;
    head.write('RIFF', p); p += 4;
    head.writeUInt32LE(head.length - 8 + pcm.length, p); p += 4;
    head.write('WAVE', p); p += 4;
    head.write('fmt ', p); p += 4;
    head.writeUInt32LE(fmtBody.length, p); p += 4;
    fmtBody.copy(head, p); p += fmtBody.length + (fmtBody.length % 2);
    head.write('data', p); p += 4;
    head.writeUInt32LE(pcm.length, p);
    return { buffer: Buffer.concat([head, pcm]), duration: duration, seconds: pcm.length / w.byteRate };
  }

  window.GapirWav = { sliceWav: sliceWav };
})();
