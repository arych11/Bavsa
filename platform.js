/* BAVSA platform bridge
 * The app asks for three services: db (class chats + saved profiles), user (who is signed in) and
 * sample (the AI). Here they come from Firebase's free plan and, for the AI, a small open model that
 * runs on the student's own phone (no account, no cost). Students can optionally switch to
 * "Smarter answers" through their own free Puter account. Nobody running BAVSA pays for any of it.
 */
(() => {
  "use strict";
  let resolveReady;
  const ready = new Promise(r => { resolveReady = r; });
  window.__bavsaProvide = services => resolveReady(services);
  // If Firebase can't load (offline, or settings not filled in), still start with AI only.
  setTimeout(() => resolveReady({ db: null, user: null, sample: window.__bavsaSample || null }), 12000);
  // Same shape the app already uses: window.claude.use("db" | "user" | "sample")
  window.claude = { use: name => ready.then(s => (s && s[name]) || null) };

  /* ---------- AI through Puter (each student's free Puter account covers their own use) ---------- */
  const MODELS = ["claude-haiku-5-5", "claude-haiku-4-5", "gpt-5.4-nano"];
  const modelKey = "bavsa.aiModel";
  const pickModels = () => { try { const m = localStorage.getItem(modelKey); return m ? [m, ...MODELS.filter(x => x !== m)] : MODELS; } catch { return MODELS; } };
  const err = (code, message, text) => Object.assign(new Error(message || code), { code, text });

  function connectSheet() {
    // A button the student taps directly, so the browser allows Puter's sign-in window.
    return new Promise(resolve => {
      const wrap = document.getElementById("sheet");
      if (!wrap || !window.puter) return resolve(false);
      const msg = document.getElementById("sheet-msg"), yes = document.getElementById("sheet-yes"), no = document.getElementById("sheet-no"), inp = document.getElementById("sheet-in");
      msg.textContent = "Bavi’s AI runs on a free Puter account. Sign in once (or make one in a few seconds) and you’re set. You must be 13 or older.";
      inp.hidden = true; yes.textContent = "Connect"; no.textContent = "Not now"; wrap.hidden = false;
      const done = v => { wrap.hidden = true; yes.onclick = no.onclick = wrap.onclick = null; resolve(v); };
      yes.onclick = () => { window.puter.auth.signIn().then(() => done(true), () => done(false)); };
      no.onclick = () => done(false);
      wrap.onclick = e => { if (e.target === wrap) done(false); };
    });
  }

  function toPuterInput(input, hasImage) {
    if (typeof input === "string") return { prompt: input };
    const msgs = input.map(m => ({ role: m.role, content: String(m.content || "") }));
    if (hasImage) {
      // Photo + conversation: send it as one prompt alongside the image.
      const [first, ...rest] = msgs;
      const convo = rest.map(m => (m.role === "user" ? "Student: " : "Bavi: ") + m.content).join("\n\n");
      return { prompt: `${first.content}\n\nConversation so far:\n${convo}\n\nReply as Bavi to the student's last message.` };
    }
    if (msgs.length && msgs[0].role === "user") msgs[0] = { role: "system", content: msgs[0].content };
    if (msgs.length === 1) msgs.push({ role: "user", content: "Begin." });
    return { messages: msgs };
  }

  async function puterSample(input, opts = {}) {
    if (!window.puter) throw err("sampling_disabled", "AI is not available");
    if (!window.puter.auth.isSignedIn()) {
      const ok = await connectSheet();
      if (!ok) throw err("not_granted", "Puter sign-in was skipped");
    }
    const file = opts.images && opts.images[0] ? new File([opts.images[0]], "photo.jpg", { type: opts.images[0].type || "image/jpeg" }) : null;
    const { prompt, messages } = toPuterInput(input, !!file);
    let lastError;
    for (const model of pickModels()) {
      let text = "";
      try {
        const options = { model, stream: true, signal: opts.signal };
        const resp = messages ? await window.puter.ai.chat(messages, false, options)
          : file ? await window.puter.ai.chat(prompt, file, false, options)
          : await window.puter.ai.chat(prompt, options);
        for await (const part of resp) {
          if (part && part.type === "error") throw err("provider", part.message || "AI error", text);
          const delta = part && (part.type === "text" || (!part.type && part.text)) ? (part.text || "") : "";
          if (delta) { text += delta; if (opts.onText) opts.onText({ text, delta }); }
        }
        if (!text.trim()) throw err("empty_completion", "No reply", text);
        try { localStorage.setItem(modelKey, model); } catch {}
        return { text, truncated: false };
      } catch (e) {
        if (opts.signal && opts.signal.aborted) throw err("cancelled", "Stopped", text);
        const m = String((e && (e.message || e.error || e.code)) || e).toLowerCase();
        if (/insufficient|funds|quota|allowance|limit|upgrade|payment|credit/.test(m)) throw err("rate_limited", "allowance", text);
        if (text) throw err("provider", m, text);
        lastError = e;
        if (/model|not found|unsupported|unavailable|invalid/.test(m)) continue;   // try the next model
        throw err("provider", m, text);
      }
    }
    throw err("provider", String(lastError && lastError.message || "AI unavailable"));
  }

  /* ---------- On-device AI (default): runs on the student's own phone, no account, no cost ---------- */
  const WEBLLM = "https://esm.run/@mlc-ai/web-llm@0.2.85";
  const TESSERACT = "https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js";
  const DEVICE_MODELS = ["Qwen2.5-1.5B-Instruct", "Qwen2.5-0.5B-Instruct"];   // Apache-2.0 open models; smaller one for phones with less memory
  const store = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
  let engine = null, enginePromise = null, deviceOK = null;

  function sheetAsk(text, yesLabel, noLabel) {
    return new Promise(resolve => {
      const wrap = document.getElementById("sheet");
      if (!wrap) return resolve(false);
      const yes = document.getElementById("sheet-yes"), no = document.getElementById("sheet-no");
      document.getElementById("sheet-msg").textContent = text;
      document.getElementById("sheet-in").hidden = true;
      yes.textContent = yesLabel; no.textContent = noLabel; wrap.hidden = false;
      const done = v => { wrap.hidden = true; yes.onclick = no.onclick = wrap.onclick = null; resolve(v); };
      yes.onclick = () => done(true); no.onclick = () => done(false);
      wrap.onclick = e => { if (e.target === wrap) done(false); };
    });
  }
  function progressUI(on, label, frac) {
    let el = document.getElementById("ai-dl");
    if (!el) {
      const css = document.createElement("style");
      css.textContent = "#ai-dl{position:absolute;left:12px;right:12px;top:72px;z-index:49;padding:12px 14px;border-radius:16px;background:var(--glass,#fff);border:1px solid var(--glass-line,#ddd);box-shadow:var(--glass-shadow,0 8px 24px rgba(0,0,0,.15));-webkit-backdrop-filter:blur(20px);backdrop-filter:blur(20px);display:flex;flex-direction:column;gap:6px;font-size:13px;color:var(--ink,#111)}#ai-dl strong{font-size:14px}#ai-dl span{color:var(--muted,#666)}#ai-dl i{display:block;height:6px;border-radius:9px;background:var(--surface-2,#eee);overflow:hidden}#ai-dl b{display:block;height:100%;width:0;background:var(--c-bavi,#2563eb);transition:width .3s}";
      document.head.append(css);
      el = document.createElement("div"); el.id = "ai-dl"; el.setAttribute("role", "status");
      el.innerHTML = "<strong>Setting up Bavi on this phone</strong><span></span><i><b></b></i>";
      (document.querySelector(".app") || document.body).append(el);
    }
    el.hidden = !on;
    if (on) { el.querySelector("span").textContent = label || ""; el.querySelector("b").style.width = Math.round((frac || 0) * 100) + "%"; }
  }
  async function deviceSupported() {
    if (deviceOK !== null) return deviceOK;
    try { deviceOK = !!(navigator.gpu && await navigator.gpu.requestAdapter()); } catch { deviceOK = false; }
    return deviceOK;
  }
  async function getEngine() {
    if (engine) return engine;
    if (enginePromise) return enginePromise;
    enginePromise = (async () => {
      const webllm = await import(WEBLLM);
      const adapter = await navigator.gpu.requestAdapter();
      const q = adapter && adapter.features && adapter.features.has("shader-f16") ? "q4f16_1" : "q4f32_1";
      const saved = store.get("bavsa.deviceModel");
      const order = saved ? [saved, ...DEVICE_MODELS.map(m => `${m}-${q}-MLC`).filter(x => x !== saved)] : DEVICE_MODELS.map(m => `${m}-${q}-MLC`);
      let lastErr;
      for (const id of order) {
        try {
          progressUI(true, "Starting…", 0);
          const worker = new Worker("/llm-worker.js", { type: "module" });
          let last = Date.now(), timer;
          // If nothing happens for a while (blocked network, worker didn't start), give up instead of hanging.
          const watchdog = new Promise((_, rej) => { timer = setInterval(() => { if (Date.now() - last > (window.__bavsaWatchdogMs || 45000)) { clearInterval(timer); worker.terminate(); rej(new Error("AI download stalled")); } }, 1000); });
          const e = await Promise.race([webllm.CreateWebWorkerMLCEngine(worker, id, {
            initProgressCallback: p => { last = Date.now(); progressUI(true, p.progress < 1 ? "Downloading once (use Wi-Fi if you can)…" : "Almost ready…", p.progress || 0); }
          }), watchdog]).finally(() => clearInterval(timer));
          store.set("bavsa.deviceModel", id); store.set("bavsa.aiDownloaded", "1");
          progressUI(false); engine = e; return e;
        } catch (e) { lastErr = e; console.warn("BAVSA on-device model failed:", id, e); }
      }
      progressUI(false); enginePromise = null;
      throw err("device_unsupported", String(lastErr && lastErr.message || lastErr || "This phone can't run the AI"));
    })();
    return enginePromise;
  }
  let ocrWorker = null;
  async function readPhoto(blob) {
    if (!window.Tesseract) await new Promise((res, rej) => { const sc = document.createElement("script"); sc.src = TESSERACT; sc.onload = res; sc.onerror = rej; document.head.append(sc); });
    if (!ocrWorker) ocrWorker = await window.Tesseract.createWorker("eng");
    const { data } = await ocrWorker.recognize(blob);
    return String(data && data.text || "").replace(/\n{3,}/g, "\n\n").trim();
  }
  function toMessages(input) {
    if (typeof input === "string") return [{ role: "user", content: input }];
    const msgs = input.map(m => ({ role: m.role, content: String(m.content || "") }));
    if (msgs.length && msgs[0].role === "user") msgs[0] = { role: "system", content: msgs[0].content };
    const sys = msgs[0] && msgs[0].role === "system" ? [msgs[0]] : [];
    let rest = msgs.slice(sys.length).slice(-8);                    // small models have short memories
    while (rest.length && rest[0].role !== "user") rest.shift();
    if (!rest.length) rest = [{ role: "user", content: "Begin." }];
    return [...sys, ...rest];
  }
  async function deviceSample(input, opts = {}) {
    if (!store.get("bavsa.aiDownloaded")) {
      const ok = await sheetAsk("To work for free with no account, Bavi runs right on your phone. The first time, it needs a one-time download of about 1 GB. Use Wi-Fi if you can.", "Download", "Not now");
      if (!ok) throw err("not_granted", "download skipped");
    }
    const e = await getEngine();
    let messages = toMessages(input);
    if (opts.images && opts.images[0]) {
      progressUI(true, "Reading your photo…", 0.5);
      let text = "";
      try { text = await readPhoto(opts.images[0]); } catch (x) { console.warn(x); }
      progressUI(false);
      if (text.replace(/\s/g, "").length < 4) throw err("image_rejected", "Couldn't read any text in the photo");
      const last = messages[messages.length - 1];
      last.content += `\n\nThe student's photo was read by text recognition (it may have small mistakes). The text in it:\n"""\n${text.slice(0, 2500)}\n"""`;
    }
    let text = "";
    const onAbort = () => { try { e.interruptGenerate(); } catch {} };
    if (opts.signal) opts.signal.addEventListener("abort", onAbort, { once: true });
    try {
      const stream = await e.chat.completions.create({ messages, stream: true, temperature: 0.6, max_tokens: 900 });
      for await (const chunk of stream) {
        const delta = chunk.choices && chunk.choices[0] && chunk.choices[0].delta && chunk.choices[0].delta.content || "";
        if (delta) { text += delta; if (opts.onText) opts.onText({ text, delta }); }
        if (opts.signal && opts.signal.aborted) break;
      }
    } finally { if (opts.signal) opts.signal.removeEventListener("abort", onAbort); }
    if (opts.signal && opts.signal.aborted) throw err("cancelled", "Stopped", text);
    if (!text.trim()) throw err("empty_completion", "No reply", text);
    return { text, truncated: false };
  }

  /* ---------- Router: on the phone by default, Puter only if the student turns it on ---------- */
  const getMode = () => store.get("bavsa.aiMode") === "puter" ? "puter" : "device";
  const setMode = m => store.set("bavsa.aiMode", m === "puter" ? "puter" : "device");
  async function sample(input, opts = {}) {
    if (getMode() === "puter") return puterSample(input, opts);
    if (!(await deviceSupported())) {
      const yes = window.puter && await sheetAsk("This phone or browser can’t run Bavi on its own. You can still use Bavi by connecting a free Puter account instead.", "Use Puter", "Not now");
      if (!yes) throw err("device_unsupported", "unsupported");
      setMode("puter"); return puterSample(input, opts);
    }
    try { return await deviceSample(input, opts); }
    catch (e) {
      if (e && e.code === "device_unsupported" && window.puter) {
        const yes = await sheetAsk("Bavi couldn’t start on this phone (it may not have enough memory). Connect a free Puter account to use Bavi instead?", "Use Puter", "Not now");
        if (yes) { setMode("puter"); return puterSample(input, opts); }
      }
      throw e;
    }
  }
  window.bavsaAI = {
    getMode, setMode,
    deviceReady: () => !!engine,
    deviceSupported,
    puterSignedIn: () => !!(window.puter && window.puter.auth && window.puter.auth.isSignedIn()),
    connectPuter: () => window.puter ? window.puter.auth.signIn() : Promise.reject(new Error("Puter unavailable"))
  };
  sample.json = async (input, opts) => {
    const { text } = await sample(input, opts);
    const t = text.replace(/```(?:json)?/gi, "");
    const a = t.search(/[\[{]/), b = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
    try { return JSON.parse(t.slice(a, b + 1)); } catch { throw err("invalid_json", "Could not read the reply", text); }
  };
  sample.limits = async () => ({ maxPromptBytes: 60000, images: { maxCount: 1, maxInputBytes: 8e6, mediaTypes: ["image/jpeg", "image/png", "image/webp"] } });
  window.__bavsaSample = sample;
})();
