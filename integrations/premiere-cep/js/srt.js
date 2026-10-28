/* Manba fayl vaqtidagi SRT'ni klipning timeline'dagi joyiga moslash:
   faqat [inPoint, outPoint] ichidagi kuelar qoladi va (start - inPoint) ga suriladi. */
(function () {
  function toSec(ts) {
    var m = /(\d+):(\d+):(\d+)[,.](\d+)/.exec(ts);
    return m ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) + (+m[4]) / 1000 : 0;
  }

  function fromSec(s) {
    var ms = Math.max(0, Math.round(s * 1000));
    function pad(n, w) { n = String(n); while (n.length < w) n = '0' + n; return n; }
    return pad(Math.floor(ms / 3600000), 2) + ':' + pad(Math.floor(ms / 60000) % 60, 2) + ':' +
      pad(Math.floor(ms / 1000) % 60, 2) + ',' + pad(ms % 1000, 3);
  }

  function shiftSrt(text, start, inPoint, outPoint) {
    var blocks = String(text).replace(/\r/g, '').split(/\n\s*\n/);
    var out = [], n = 0, offset = start - inPoint;
    blocks.forEach(function (b) {
      var lines = b.trim().split('\n');
      var idx = lines.findIndex(function (l) { return l.indexOf('-->') !== -1; });
      if (idx === -1) return;
      var parts = lines[idx].split('-->');
      var a = toSec(parts[0]), z = toSec(parts[1]);
      if (z <= inPoint || a >= outPoint) return;
      a = Math.max(a, inPoint); z = Math.min(z, outPoint);
      n += 1;
      out.push(n + '\n' + fromSec(a + offset) + ' --> ' + fromSec(z + offset) + '\n' + lines.slice(idx + 1).join('\n'));
    });
    return out.join('\n\n') + '\n';
  }

  window.GapirSrt = { shiftSrt: shiftSrt, toSec: toSec, fromSec: fromSec };
})();
