/* GapirAI API mijozi -- Node (CEP --enable-nodejs) orqali: katta faylni xotiraga
   yuklamasdan oqim bilan yuboradi va natijani diskka yozadi. */
(function () {
  var req = (window.cep_node && window.cep_node.require) || window.require;
  var fs = req('fs'), path = req('path'), https = req('https'), http = req('http'), URL = req('url');
  var Buffer = req('buffer').Buffer;   // CEP kontekstida global Buffer kafolatlanmagan

  var CONTENT_TYPES = { '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.mkv': 'video/x-matroska', '.webm': 'video/webm' };
  var MAX_BYTES = 1024 * 1024 * 1024;

  function Client(base, key) {
    this.base = String(base).replace(/\/+$/, '');
    this.key = key;
  }

  function apiError(status, body) {
    var msg = '';
    try {
      var d = JSON.parse(body).detail;
      msg = typeof d === 'string' ? d : (d && (d.message || d.detail)) || '';
    } catch (e) { /* JSON emas */ }
    if (!msg) {
      if (status === 401) msg = "API kalit yaroqsiz yoki bekor qilingan. Saytdan yangisini oling.";
      else if (status === 413) msg = "Fayl 1 GB dan katta.";
      else if (status === 429) msg = "Juda koʻp soʻrov. Birozdan soʻng qayta urinib koʻring.";
      else msg = 'Server xatosi (' + status + ').';
    }
    var err = new Error(msg);
    err.status = status;
    return err;
  }

  // opts: {method, headers, body (Buffer|string), stream (ReadStream), onProgress(sent), auth (bool)}
  Client.prototype.request = function (url, opts, redirects) {
    var self = this;
    opts = opts || {};
    redirects = redirects || 0;
    return new Promise(function (resolve, reject) {
      var u = URL.parse(url);
      var headers = Object.assign({}, opts.headers || {});
      // Faqat o'z serverimizga kalit yuboramiz (S3 presigned redirect'ga emas)
      if (opts.auth !== false && url.indexOf(self.base) === 0) headers.Authorization = 'Bearer ' + self.key;
      var lib = u.protocol === 'http:' ? http : https;
      var r = lib.request({ method: opts.method || 'GET', hostname: u.hostname, port: u.port, path: u.path, headers: headers }, function (res) {
        // Server javob berdi (masalan, 402 "daqiqa yo'q") -- qolgan faylni yuborishni to'xtatamiz
        if (opts.stream) { opts.stream.unpipe(r); opts.stream.destroy(); }
        if ([301, 302, 303, 307, 308].indexOf(res.statusCode) !== -1 && res.headers.location && redirects < 5) {
          res.resume();
          var next = URL.resolve(url, res.headers.location);
          return resolve(self.request(next, { method: 'GET', toFile: opts.toFile, auth: opts.auth }, redirects + 1));
        }
        if (opts.toFile && res.statusCode === 200) {
          var tmp = opts.toFile + '.part';
          var out = fs.createWriteStream(tmp);
          res.pipe(out);
          out.on('finish', function () {
            out.close(function () {
              try { fs.renameSync(tmp, opts.toFile); resolve({ status: 200, file: opts.toFile }); } catch (e) { reject(e); }
            });
          });
          out.on('error', reject);
          res.on('error', reject);
          return;
        }
        var chunks = [];
        res.on('data', function (c) { chunks.push(c); });
        res.on('end', function () {
          var body = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode >= 400) return reject(apiError(res.statusCode, body));
          resolve({ status: res.statusCode, headers: res.headers, body: body });
        });
        res.on('error', reject);
      });
      r.on('error', function (e) {
        var offline = /ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENETUNREACH/.test(String(e.code || e.message));
        reject(new Error(offline
          ? "GapirAI serveriga ulanib boʻlmadi. Internet aloqasini tekshirib, qayta urinib koʻring."
          : 'Tarmoq xatosi: ' + (e.message || e.code || 'nomaʼlum')));
      });
      r.setTimeout(opts.stream ? 0 : 60000, function () { r.destroy(new Error("Server javob bermadi (vaqt tugadi).")); });

      if (opts.stream) {
        var sent = 0;
        opts.stream.on('data', function (c) {
          sent += c.length;
          if (opts.onProgress) opts.onProgress(sent);
        });
        opts.stream.on('error', function (e) { r.destroy(e); reject(e); });
        opts.stream.pipe(r);
      } else {
        if (opts.body) r.write(opts.body);
        r.end();
      }
    });
  };

  Client.prototype.json = function (p) {
    return this.request(this.base + p).then(function (r) { return JSON.parse(r.body); });
  };

  Client.prototype.me = function () { return this.json('/auth/me'); };

  Client.prototype.checkFile = function (filePath) {
    var ext = path.extname(filePath).toLowerCase();
    if (!CONTENT_TYPES[ext]) throw new Error("Bu format qoʻllab-quvvatlanmaydi (" + (ext || 'kengaytmasiz') + "). MP4, MOV, MKV yoki WebM kerak.");
    var st;
    try { st = fs.statSync(filePath); } catch (e) { throw new Error("Manba fayl topilmadi: " + filePath); }
    if (st.size > MAX_BYTES) throw new Error("Fayl 1 GB dan katta (" + Math.round(st.size / 1048576) + " MB).");
    if (!st.size) throw new Error("Fayl boʻsh.");
    return { size: st.size, contentType: CONTENT_TYPES[ext] };
  };

  Client.prototype.upload = function (filePath, params, onProgress) {
    var info = this.checkFile(filePath);
    var q = Object.keys(params).map(function (k) { return k + '=' + encodeURIComponent(params[k]); }).join('&');
    return this.request(this.base + '/api/jobs/upload?' + q, {
      method: 'POST',
      headers: {
        'Content-Type': info.contentType,
        'Content-Length': info.size,
        'X-File-Name': encodeURIComponent(path.basename(filePath)),
      },
      stream: fs.createReadStream(filePath),
      onProgress: function (sent) { if (onProgress) onProgress(sent / info.size); },
    }).then(function (r) { return JSON.parse(r.body); });
  };

  Client.prototype.job = function (id) { return this.json('/api/jobs/' + id); };

  Client.prototype.download = function (p, toFile) {
    return this.request(this.base + p, { toFile: toFile }).then(function (r) {
      if (!r.file) throw new Error("Natija faylini yuklab boʻlmadi.");
      return r.file;
    });
  };

  window.GapirApi = {
    Client: Client,
    fs: fs,
    path: path,
    os: req('os'),
  };
})();
