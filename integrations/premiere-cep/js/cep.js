/* CSInterface'ning bizga kerakli qismi: ExtendScript chaqirish va brauzerda URL ochish. */
(function () {
  function evalScript(script) {
    return new Promise(function (resolve, reject) {
      if (!window.__adobe_cep__) return reject(new Error("Panel Premiere Pro ichida ochilmagan."));
      window.__adobe_cep__.evalScript(script, function (result) {
        if (result === 'EvalScript error.') return reject(new Error("Premiere skripti xato berdi."));
        try { resolve(JSON.parse(result)); } catch (e) { reject(new Error("Premiere javobini o'qib bo'lmadi: " + result)); }
      });
    });
  }

  function jsxString(s) {
    return JSON.stringify(String(s));
  }

  function openUrl(url) {
    if (window.cep && window.cep.util && window.cep.util.openURLInDefaultBrowser) window.cep.util.openURLInDefaultBrowser(url);
    else window.open(url);
  }

  window.GapirCep = { evalScript: evalScript, jsxString: jsxString, openUrl: openUrl };
})();
