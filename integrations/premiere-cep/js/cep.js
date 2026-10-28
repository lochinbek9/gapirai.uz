/* CSInterface'ning bizga kerakli qismi: ExtendScript chaqirish, dastur turi va brauzerda URL ochish. */
(function () {
  // "PPRO" (Premiere Pro) yoki "AEFT" (After Effects)
  function hostApp() {
    try { return JSON.parse(window.__adobe_cep__.getHostEnvironment()).appName || 'PPRO'; } catch (e) { return 'PPRO'; }
  }
  function hostName() { return hostApp() === 'AEFT' ? 'After Effects' : 'Premiere Pro'; }

  function evalScript(script) {
    return new Promise(function (resolve, reject) {
      if (!window.__adobe_cep__) return reject(new Error("Panel Premiere Pro yoki After Effects ichida ochilmagan."));
      window.__adobe_cep__.evalScript(script, function (result) {
        if (result === 'EvalScript error.') return reject(new Error(hostName() + " skripti xato berdi."));
        try { resolve(JSON.parse(result)); } catch (e) { reject(new Error(hostName() + " javobini o'qib bo'lmadi: " + result)); }
      });
    });
  }

  // ExtendScript (ES3) manbasiga xavfsiz literal: ASCII'dan tashqari belgilar (ʻ, U+2028 ...) -> \uXXXX
  function jsxLiteral(v) {
    return JSON.stringify(v).replace(/[\u007f-\uffff]/g, function (c) {
      return '\\u' + ('000' + c.charCodeAt(0).toString(16)).slice(-4);
    });
  }

  function jsxString(s) {
    return jsxLiteral(String(s));
  }

  function openUrl(url) {
    if (window.cep && window.cep.util && window.cep.util.openURLInDefaultBrowser) window.cep.util.openURLInDefaultBrowser(url);
    else window.open(url);
  }

  window.GapirCep = { evalScript: evalScript, jsxString: jsxString, jsxLiteral: jsxLiteral, openUrl: openUrl, hostApp: hostApp, hostName: hostName };
})();
