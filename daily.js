/* Question of the day: its own page. The AI sets one question per day and the
   question is verified by a second, independent solve before you see it.
   7 correct days in a row = streak title. MONTH / YEAR correct days = month / year title. */
const DAILY = { STREAK: 7, MONTH: 20, YEAR: 200 }; // change these numbers to tune the rewards

(function () {
  const key = d => d.toLocaleDateString("en-CA");
  const today = () => key(new Date());
  const $ = id => document.getElementById(id);
  const view = { mode: "load", msg: "", fb: "", draft: "", fresh: [] };
  const RING = 2 * Math.PI * 34, VERSION = 2;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let busy = false;
  const FLAME = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c1 4 5 5 5 10a5 5 0 01-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z"/></svg>';

  const monthName = m => new Date(+m.slice(0, 4), +m.slice(5) - 1, 1).toLocaleDateString("en", { month: "long", year: "numeric" });

  function stats() {
    const set = new Set(profile.dd || []), t = today();
    const d = new Date(); if (!set.has(t)) d.setDate(d.getDate() - 1);
    let streak = 0; while (set.has(key(d))) { streak++; d.setDate(d.getDate() - 1); }
    const all = [...set];
    return { streak, month: all.filter(x => x.startsWith(t.slice(0, 7))).length, year: all.filter(x => x.startsWith(t.slice(0, 4))).length };
  }

  function award() {
    const st = stats(), t = today(), out = [];
    profile.titles = profile.titles || [];
    const add = (id, name) => { if (!profile.titles.some(x => x.id === id)) { profile.titles.unshift({ id, name, date: t }); out.push(name); } };
    if (st.streak && st.streak % DAILY.STREAK === 0) add("w:" + t, `${st.streak}-Day Streak`);
    if (st.month >= DAILY.MONTH) add("m:" + t.slice(0, 7), `${monthName(t.slice(0, 7))} Champion`);
    if (st.year >= DAILY.YEAR) add("y:" + t.slice(0, 4), `${t.slice(0, 4)} Math Legend`);
    return out;
  }

  async function aiText(system, user, temp) {
    // Daily question uses its own Groq key (cfg.dailyKey). Falls back to the main OpenRouter key if it is not set.
    const G = !!cfg.dailyKey, k = cfg.dailyKey || cfg.apiKey;
    if (!k) throw new Error("Add dailyKey (Groq) or apiKey (OpenRouter) in config.js");
    const headers = { "Authorization": "Bearer " + k, "Content-Type": "application/json" };
    if (!G) headers["X-Title"] = "PiQuest X";
    const r = await fetch(G ? "https://api.groq.com/openai/v1/chat/completions" : "https://openrouter.ai/api/v1/chat/completions", {
      method: "POST", headers,
      body: JSON.stringify({ model: G ? (cfg.dailyModel || "llama-3.3-70b-versatile") : model(), temperature: temp, messages: [{ role: "system", content: system }, { role: "user", content: user }] })
    });
    if (!r.ok) { let t = ""; try { t = (await r.json()).error?.message || ""; } catch (e) { } throw new Error(`Request failed (${r.status}). ${t}`); }
    const j = await r.json(), c = j.choices?.[0]?.message?.content;
    return (Array.isArray(c) ? c.map(x => x.text || "").join("") : c || "").replace(/\*\*|`/g, "");
  }
  // Reads "NAME: value" blocks. Plain labelled text is far more reliable than JSON for chat models.
  const field = (t, name) => {
    const m = t.match(new RegExp("(?:^|\\n)\\s*" + name + "\\s*[:：]\\s*([\\s\\S]*?)(?=\\n\\s*(?:QUESTION|ANSWER|SOLUTION|VERDICT|FEEDBACK)\\s*[:：]|$)", "i"));
    return m ? m[1].trim() : "";
  };

  const GEN = 'You write one special daily math challenge for students. Reply in EXACTLY this format and nothing else:\nQUESTION: the question\nANSWER: the final answer, short\nSOLUTION: a short solution in 2 to 4 lines\nRules: plain text and Unicode only (x², √, ÷, ×, π), no LaTeX. The question must be self-contained, interesting, solvable in about 5 minutes, and have exactly one clear short final answer. Counts of objects must come out as whole numbers. Solve it fully yourself first and make sure every number in your solution is consistent before you reply. Never write the answer inside the question.';
  const SOLVE = 'Solve this math question carefully, checking each step. Reply with exactly one line: ANSWER: <final answer only>. If the question is flawed (inconsistent numbers, no valid answer, or a non-whole count where a whole number is required) reply exactly: ANSWER: INVALID';
  const CHECK = 'You compare two answers to a math question. Reply in EXACTLY this format:\nVERDICT: YES or NO\nFEEDBACK: one or two short sentences\nAccept equivalent forms (0.5 = 1/2, 16.67 = 50/3, different units written differently).';
  const same = async (q, ref, other, extra) => {
    const t = await aiText(CHECK + (extra || ""), `Question: ${q}\nAnswer 1 (reference): ${ref}\nAnswer 2: ${other}\nDo they match?`, 0);
    return { ok: /^\s*yes/i.test(field(t, "VERDICT")), fb: field(t, "FEEDBACK") };
  };

  async function make(group, t) {
    let bad = 0;
    for (let k = 0; k < 4; k++) {
      const g = await aiText(GEN, `Date: ${t}. Topic area: ${group}. Attempt ${k + 1}. Make it different from typical textbook drills.`, 0.9);
      const q = field(g, "QUESTION"), a = field(g, "ANSWER"), s = field(g, "SOLUTION");
      if (!q || !a) { bad++; continue; }
      const sol = field(await aiText(SOLVE, q, 0), "ANSWER");
      if (!sol || /invalid/i.test(sol)) continue;
      if ((await same(q, a, sol)).ok) return { q, a, s };
    }
    throw new Error(bad >= 3 ? (cfg.dailyKey ? "The AI replied in an unexpected format. Please try again." : "The AI replied in an unexpected format. Pick another model in the sidebar (for example openai/gpt-4o-mini) and try again.") : "Couldn't prepare a reliable question just now. Please try again.");
  }

  async function load() {
    const t = today(), d = profile.daily, done = (profile.dd || []).includes(t);
    if (d && d.day === t && d.q && (d.v === VERSION || done)) { setMode(); return draw(); }
    if (busy) return; busy = true; view.mode = "load"; draw();
    try {
      const groups = Dost.topicGroups(), idx = Math.floor((Date.now() - new Date().getTimezoneOffset() * 6e4) / 864e5);
      const j = await make(groups[idx % groups.length], t);
      profile.daily = { day: t, v: VERSION, q: j.q, a: j.a, s: j.s, shown: false };
      saveProfile(); setMode();
    } catch (e) { view.mode = "err"; view.msg = e.message; }
    busy = false; draw();
  }

  function setMode() {
    const d = profile.daily, done = (profile.dd || []).includes(today());
    view.mode = done ? "done" : d.shown ? "shown" : "open";
  }

  async function check() {
    const box = $("dqa"); if (!box) return;
    const ans = box.value.trim(); if (!ans) return;
    view.draft = ans; const btn = $("dqc"); btn.disabled = true; btn.textContent = "Checking…";
    try {
      const d = profile.daily;
      const r = await same(d.q, d.a, ans, " If they do not match, give a small hint in FEEDBACK but do not reveal the full answer. Reply in the language the student used.");
      if (r.ok) {
        profile.dd = [...new Set([...(profile.dd || []), today()])];
        view.fresh = award(); view.fb = r.fb || ""; view.draft = ""; saveProfile(); view.mode = "done";
        draw(); burst(); return;
      }
      view.fb = r.fb || "Not quite. Try again.";
    } catch (e) { view.fb = e.message; }
    draw();
  }

  function burst() {
    if (reduce) return;
    const host = $("dqcard"); if (!host) return;
    const cols = ["#34d399", "#fbbf24", "#60a5fa", "#f472b6", "#a78bfa"];
    for (let i = 0; i < 34; i++) {
      const p = document.createElement("i"), a = Math.random() * 6.283, r = 90 + Math.random() * 150;
      p.className = "cf"; p.style.cssText = `--dx:${(Math.cos(a) * r).toFixed(0)}px;--dy:${(Math.sin(a) * r - 40).toFixed(0)}px;--rot:${(Math.random() * 720 - 360).toFixed(0)}deg;background:${cols[i % 5]};animation-delay:${(Math.random() * .15).toFixed(2)}s`;
      host.appendChild(p); setTimeout(() => p.remove(), 1800);
    }
  }

  const ring = (label, v, m, cls, extra) => `<div class="drg ${cls}"><div class="rs"><svg viewBox="0 0 84 84" aria-hidden="true"><circle cx="42" cy="42" r="34" class="dq-rt"/><circle cx="42" cy="42" r="34" class="dq-rf" data-p="${Math.min(1, v / m).toFixed(3)}" stroke-dasharray="${RING.toFixed(1)}" stroke-dashoffset="${RING.toFixed(1)}" transform="rotate(-90 42 42)"/></svg><div class="rv"><b>${v}</b><span>/${m}</span></div></div><p>${label}</p>${extra || ""}</div>`;

  function shelfHTML() {
    const t = profile.titles || [];
    const tro = (cls, name, sub, lock) => `<div class="dtro ${cls}${lock ? " locked" : ""}"><i>${lock ? "◌" : "★"}</i><b>${name}</b><small>${sub}</small></div>`;
    if (!t.length) return `<div class="dshelf">${tro("w", `${DAILY.STREAK}-Day Streak`, `${DAILY.STREAK} correct days in a row`, 1)}${tro("m", "Monthly Champion", `${DAILY.MONTH} correct days in a month`, 1)}${tro("y", "Yearly Legend", `${DAILY.YEAR} correct days in a year`, 1)}</div><p class="dm">No titles yet. Your first one is closer than you think.</p>`;
    return `<div class="dshelf">${t.map(x => tro(x.id[0], safe(x.name), "Earned " + safe(x.date))).join("")}</div>`;
  }

  function left() {
    const n = new Date(), m = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1) - n, h = Math.floor(m / 36e5), mm = Math.floor(m % 36e5 / 6e4);
    return `${h}h ${mm}m`;
  }

  function draw() {
    const box = $("dq"); if (!box || !profile) return;
    const st = stats(), d = profile.daily || {};
    const p = st.streak === 0 ? 0 : st.streak % DAILY.STREAK === 0 ? DAILY.STREAK : st.streak % DAILY.STREAK;
    let body = "";
    if (view.mode === "load") body = '<div class="dload"><span class="sy"><i>∑</i><i>∫</i><i>π</i><i>√</i><i>÷</i></span><p>Preparing and double-checking today\'s question…</p></div>';
    else if (view.mode === "err") body = `<p class="err">${safe(view.msg)}</p><button class="ghost" id="dqr" type="button">Try again</button>`;
    else {
      body = `<div class="dqq b">${md(d.q)}</div>`;
      if (view.mode === "open") body += `<textarea id="dqa" rows="2" placeholder="Type your answer" aria-label="Your answer">${safe(view.draft)}</textarea>${view.fb ? `<p class="dqf">${safe(view.fb)}</p>` : ""}<div class="dqb"><button class="cta" id="dqc" type="button">Check answer</button><button class="ghost" id="dqs" type="button">Show answer</button></div>`;
      if (view.mode === "done") body += `<p class="dqok">✓ Correct! Today's question is done.</p>${view.fb ? `<p class="dqf">${safe(view.fb)}</p>` : ""}${view.fresh.length ? `<p class="dqnew">New title unlocked: <b>${view.fresh.map(safe).join(", ")}</b></p>` : ""}<p class="dm">Next question in ${left()}.</p>`;
      if (view.mode === "shown") body += `<div class="dqsol"><b>Answer: ${safe(d.a)}</b><div class="b">${md(d.s || "")}</div></div><p class="dm">You looked at the answer, so today does not count. A new question comes in ${left()}.</p>`;
    }
    $("dqrings").innerHTML = ring("Streak", p, DAILY.STREAK, "r1", `<span class="dflame${st.streak ? " on" : ""}">${FLAME}${st.streak} day${st.streak === 1 ? "" : "s"}</span>`) + ring("This month", st.month, DAILY.MONTH, "r2") + ring("This year", st.year, DAILY.YEAR, "r3");
    box.innerHTML = body;
    $("dqshelf").innerHTML = shelfHTML();
    if ($("dqc")) $("dqc").onclick = check;
    if ($("dqa")) $("dqa").oninput = e => { view.draft = e.target.value; };
    if ($("dqs")) $("dqs").onclick = () => { if (confirm("Show the answer? Today will not count.")) { profile.daily.shown = true; saveProfile(); view.mode = "shown"; draw(); } };
    if ($("dqr")) $("dqr").onclick = load;
    const fills = document.querySelectorAll("#daily .dq-rf"), go = () => fills.forEach(c => c.style.strokeDashoffset = RING * (1 - c.dataset.p));
    if (reduce) go(); else requestAnimationFrame(() => requestAnimationFrame(go));
  }

  window.showDaily = () => {
    show("daily"); view.fb = ""; view.draft = ""; view.fresh = [];
    const dateTxt = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
    $("daily").innerHTML = `<div class="dsyms" aria-hidden="true"><span>π</span><span>∑</span><span>√</span><span>∫</span><span>∞</span><span>θ</span><span>÷</span><span>x²</span></div>
    <div class="dwrap d2 dpage">
      <div class="dbar rise" style="--i:0"><button class="pill" id="dback" type="button">‹ Dashboard</button><b>Daily challenge</b><span style="width:96px"></span></div>
      <section class="dhero rise" style="--i:1"><p class="dd">${safe(dateTxt)}</p><h1>Question of the day</h1><p class="dsub">Answer correctly ${DAILY.STREAK} days in a row to earn a title. Monthly and yearly titles come with steady practice.</p><div class="drings" id="dqrings"></div></section>
      <section class="dqcard rise" style="--i:2" id="dqcard"><h2>Today's question</h2><div id="dq"></div></section>
      <section class="dtit rise" style="--i:3"><h2>Your titles</h2><div id="dqshelf"></div></section>
    </div>`;
    $("daily").scrollTop = 0;
    $("dback").onclick = showDash;
    load();
  };

  window.dailyTeaser = () => {
    const st = stats(), done = (profile.dd || []).includes(today());
    return `<div class="rise" style="--i:4"><button class="dqlink${done ? " done" : ""}" id="dqgo" type="button"><span class="dqfl">${FLAME}</span><span class="dqlt"><b>Question of the day</b><span>${done ? "Done for today ✓" : "A new question is waiting for you"}</span></span><span class="dqlp"><b>${st.streak}</b><small>day streak</small></span><span class="dqar" aria-hidden="true">›</span></button></div>`;
  };
  window.bindDaily = () => { const b = $("dqgo"); if (b) b.onclick = showDaily; };
  window.titlesHTML = () => {
    const t = (profile.titles || []);
    return t.length ? `<div class="tchips">${t.map(x => `<span class="ttl ${x.id[0]}" title="Earned ${safe(x.date)}"><i>★</i>${safe(x.name)}</span>`).join("")}</div>` : `<p class="mute">No titles yet. Answer ${DAILY.STREAK} days in a row to earn your first.</p>`;
  };
  })();