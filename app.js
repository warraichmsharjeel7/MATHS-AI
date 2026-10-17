const $ = s => document.querySelector(s);
const cfg = window.DOST_CONFIG || {};
const BASE = "You are PiQuest X, an AI tutor for mathematics and math-related topics. You CAN answer: solving problems (arithmetic, algebra, geometry, trigonometry, calculus, statistics, probability, number theory, logic, word problems); explaining concepts and formulas; math history and famous mathematicians; how math is used in science, engineering, computer science, finance, AI and daily life; math exams, study tips, learning plans, competitions and math projects; and math-heavy parts of physics, chemistry or computing when the question is really about the mathematics. If a question has no meaningful connection to mathematics, politely decline in one short sentence and invite a math or math-related question. Reply in the language the user writes in; if they write Roman Urdu or a Urdu/English mix, answer the same way, keeping math terms in English. For problems, solve step by step: state what is given, show each step on its own line with the reason, then give the final answer clearly labelled, and check your arithmetic. For conceptual or related questions, answer clearly with short headings or bullets and a simple example. Do not use LaTeX; write math in plain text and Unicode (x², √, ÷, ×, π, ≤, ∫). Matrix questions: support any size, including 1×1, 2×2, 3×3 and larger m×n. Write every matrix inside a code block with one row per line and aligned columns. Check that sizes allow the operation (addition needs equal sizes, A×B needs columns of A = rows of B) and say clearly when an operation is undefined. For a determinant show the expansion step by step, for an inverse use the adjugate or Gauss-Jordan elimination, and for a 1×1 matrix [a] the determinant is a and the inverse is [1/a] when a is not 0. If the app gives a verified result, your steps must reach exactly that answer. If the question is ambiguous, state your assumption. If you are unsure, say so.";
const NATURES = {
  friendly: ["Friendly teacher", "Patient, simple words, encouraging.", "Teach like a warm, patient teacher: use simple words, small steps, a relatable example, and brief encouragement."],
  exam: ["Exam coach", "Short, marks-focused, with common mistakes.", "Act as an exam coach: keep answers concise, show the method that earns marks, mention shortcuts and common mistakes, and finish with one quick check question."],
  guide: ["Thinking guide", "Hints first, so you work it out.", "Act as a Socratic guide: for practice problems give a hint or a guiding question first and let the student try; give the full solution only when they ask or after they attempt it."],
  quick: ["Quick answers", "The answer first, then a short reason.", "Give the final answer first, then a brief explanation of a few lines at most. Skip extras unless asked."]
};
let nature = "friendly";
const SYSTEM = () => BASE + " Teaching style: " + NATURES[nature][2];
const TOPICS = [
  ["Real-world math", [["A∪B", "Set Theory in Everyday Life"], ["a+bi", "Exploring the World of Complex Numbers"], ["1,2,4…", "Patterns in Numbers and Sequences"], ["dy/dx", "Derivatives in Real Life"], ["[ ]·v", "Mathematics Behind Computer Graphics"], ["+ − × ÷", "Mathematics in Daily Life"], ["v=d/t", "Mathematics of Traffic and Road Planning"], ["Σwx", "The Role of Mathematics in Artificial Intelligence"]]],
  ["Basics", [["a/b", "Fractions"], ["%", "Percentages"], ["a:b", "Ratio & proportion"], ["LCM", "LCM & HCF"], ["ℕ ℤ ℚ", "Number systems"], ["{ }", "Sets"], ["f(x)", "Functions"], ["∧ ∨", "Logic"]]],
  ["Algebra", [["x+1=0", "Linear equations"], ["ax²", "Quadratic equations"], ["P(x)", "Polynomials"], ["<  >", "Inequalities"], ["[ ]", "Matrices"], ["|A|", "Determinants"], ["a+bi", "Complex numbers"], ["Σ", "Sequences & series"], ["log", "Logarithms"], ["xⁿ", "Exponents & surds"], ["(a+b)ⁿ", "Binomial theorem"]]],
  ["Trigonometry", [["sin cos tan", "Sin, Cos, Tan"], ["sin²+cos²", "Trig identities"], ["sin⁻¹", "Inverse trig functions"], ["θ", "Heights & distances"], ["rad", "Radians & degrees"]]],
  ["Geometry", [["△", "Triangles"], ["○", "Circles"], ["(x,y)", "Coordinate geometry"], ["→v", "Vectors"], ["πr²", "Area & volume"], ["∠", "Angles & parallel lines"]]],
  ["Calculus", [["lim", "Limits"], ["dy/dx", "Derivatives"], ["∫", "Integrals"], ["d²y", "Differential equations"], ["max/min", "Maxima & minima"]]],
  ["Statistics & probability", [["x̄", "Mean, median, mode"], ["σ", "Standard deviation"], ["P(A)", "Probability"], ["nPr nCr", "Permutations & combinations"], ["N(μ,σ)", "Distributions"], ["r", "Correlation & regression"]]]
];
const POPULAR = ["Set Theory in Everyday Life", "Derivatives in Real Life", "The Role of Mathematics in Artificial Intelligence", "Mathematics in Daily Life", "Matrices", "Logarithms", "Sin, Cos, Tan", "Quadratic equations"];
let tab = "Popular";
const topicPrompt = n => { const g = (TOPICS.find(g => g[1].some(t => t[1] === n)) || [])[0]; return g === "Real-world math" ? `Explain "${n}" for a student: start with a real-life example, then the key math ideas and formulas in simple words, one worked example, and 3 questions to think about.` : `Teach me ${n}: explain it simply, list the key formulas, show one solved example step by step, then give me 3 practice questions.` };
let uid = "guest", chats = [], cur = null, busy = false, ctrl = null;
const save = () => { try { localStorage.setItem("dost.chats." + uid, JSON.stringify(chats)) } catch (e) { } };
const model = () => localStorage.getItem("dost.model") || cfg.model || "openai/gpt-4o-mini";
$("#model").value = model(); $("#model").onchange = e => localStorage.setItem("dost.model", e.target.value.trim());

const esc = s => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
function inline(s) { return esc(s).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>").replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>') }
function md(t) {
  const out = [], L = t.split("\n"); let i = 0;
  while (i < L.length) {
    const l = L[i];
    if (l.startsWith("```")) { let c = []; i++; while (i < L.length && !L[i].startsWith("```")) c.push(L[i++]); i++; out.push("<pre><code>" + esc(c.join("\n")) + "</code></pre>"); continue }
    let m;
    if (m = l.match(/^(#{1,3})\s+(.*)/)) { out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); i++; continue }
    if (/^\s*[-*•]\s+/.test(l)) { let a = []; while (i < L.length && /^\s*[-*•]\s+/.test(L[i])) a.push("<li>" + inline(L[i++].replace(/^\s*[-*•]\s+/, "")) + "</li>"); out.push("<ul>" + a.join("") + "</ul>"); continue }
    if (/^\s*\d+[.)]\s+/.test(l)) { let a = []; while (i < L.length && /^\s*\d+[.)]\s+/.test(L[i])) a.push("<li>" + inline(L[i++].replace(/^\s*\d+[.)]\s+/, "")) + "</li>"); out.push("<ol>" + a.join("") + "</ol>"); continue }
    if (!l.trim()) { i++; continue }
    let p = []; while (i < L.length && L[i].trim() && !/^(```|#{1,3}\s|\s*[-*•]\s|\s*\d+[.)]\s)/.test(L[i])) p.push(inline(L[i++]));
    out.push("<p>" + p.join("<br>") + "</p>");
  }
  return out.join("");
}

const log = $("#log"), chat = $("#chat");
const ICON = { copy: '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 012-2h9"/></svg>', speak: '<svg viewBox="0 0 24 24"><path d="M11 5L6 9H3v6h3l5 4zM16 9a4 4 0 010 6M19 6a8 8 0 010 12"/></svg>', redo: '<svg viewBox="0 0 24 24"><path d="M20 11a8 8 0 10-2.3 6M20 4v7h-7"/></svg>' };
const THINK = '<span class="think"><span class="sy"><i>∑</i><i>∫</i><i>π</i><i>√</i><i>÷</i></span><span class="shim">Thinking</span></span>';
function aiAv(live) { const e = document.createElement("div"); e.className = "aiav" + (live ? " live" : ""); e.textContent = "π"; e.setAttribute("aria-hidden", "true"); return e }
function caret(b) { let t = b.lastElementChild; if (t && (t.tagName === "UL" || t.tagName === "OL")) t = t.lastElementChild; if (!t || t.tagName === "PRE") t = b; t.insertAdjacentHTML("beforeend", '<span class="caret"></span>') }
function bottom() { chat.scrollTop = chat.scrollHeight }
let tsheet = null;
function openTopics() {
  if (!tsheet) {
    tsheet = document.createElement("div"); tsheet.className = "sheetwrap"; tsheet.hidden = true;
    tsheet.innerHTML = '<div class="sheet" role="dialog" aria-modal="true" aria-label="Browse topics"><div class="sh"><h2>Browse topics</h2><button class="ib" id="tcl" aria-label="Close">✕</button></div><input id="tsearch" class="tsearch" type="search" placeholder="Search: matrix, log, sin..." aria-label="Search topics"><div class="tabs" role="tablist"></div><div class="tgrid" id="tg"></div><p class="none" id="none" hidden>No topic found. Type your question in the chat instead.</p></div>';
    document.body.appendChild(tsheet);
    const T = s => tsheet.querySelector(s), tabs = ["Popular", ...TOPICS.map(g => g[0])], all = TOPICS.flatMap(g => g[1].map(t => ({ sym: t[0], name: t[1], grp: g[0] })));
    const close = () => { tsheet.hidden = true };
    tsheet.onclick = e => { if (e.target === tsheet) close() }; T("#tcl").onclick = close;
    document.addEventListener("keydown", e => { if (e.key === "Escape" && !tsheet.hidden) close() });
    T(".tabs").innerHTML = tabs.map(t => `<button class="tab${t === tab ? " on" : ""}" role="tab" aria-selected="${t === tab}" data-t="${t}">${t}</button>`).join("");
    const list = () => {
      const q = T("#tsearch").value.trim().toLowerCase();
      const items = q ? all.filter(t => (t.name + " " + t.sym + " " + t.grp).toLowerCase().includes(q)) : tab === "Popular" ? POPULAR.map(n => all.find(t => t.name === n)) : all.filter(t => t.grp === tab);
      T("#tg").innerHTML = items.map(t => `<button class="topic" data-n="${t.name}"><span class="sym">${t.sym}</span><span>${t.name}</span></button>`).join("");
      T("#none").hidden = items.length > 0;
      T("#tg").querySelectorAll(".topic").forEach(b => b.onclick = () => { close(); ask(topicPrompt(b.dataset.n), b.dataset.n) });
      T(".tabs").style.opacity = q ? .4 : 1
    };
    T(".tabs").querySelectorAll(".tab").forEach(b => b.onclick = () => { tab = b.dataset.t; T("#tsearch").value = ""; T(".tabs").querySelectorAll(".tab").forEach(x => { const on = x === b; x.classList.toggle("on", on); x.setAttribute("aria-selected", on) }); list() });
    T("#tsearch").oninput = list; list();
  }
  tsheet.hidden = false;
}
function render(anim) {
  log.innerHTML = "";
  if (!cur || !cur.msgs.length) {
    log.innerHTML = `<div class="welcome"><div class="bgsym" aria-hidden="true"><span>π</span><span>∫</span><span>√</span><span>∑</span><span>∞</span><span>θ</span></div>
      <div class="emblem rise" style="--i:0" aria-hidden="true"><div class="orbit"><i>√</i><i>∑</i><i>∫</i><i>∞</i></div><div class="core"><span>π</span></div></div>
      <h1 class="wm rise" style="--i:1">PiQuest<span class="x">X</span></h1>
      <p class="tag rise" style="--i:2">Your math quest starts here.</p>${typeof profile !== "undefined" && profile ? `<p class="hi rise" style="--i:3">Hello, <b>${esc(profile.name)}</b></p>` : ""}</div>`;
  } else cur.msgs.forEach((m, i) => log.appendChild(bubble(m, i, anim && i === cur.msgs.length - 1)));
  if (cur && cur.msgs.length) bottom(); else chat.scrollTop = 0;
  hist();
}
function bubble(m, i, anim) {
  const d = document.createElement("div"); d.className = "msg " + (m.role === "user" ? "user" : "ai");
  const b = document.createElement("div"); b.className = "b";
  if (m.role === "user") b.textContent = m.content; else b.innerHTML = m.error ? `<div class="err">${esc(m.content)}</div>` : md(m.content);
  const col = m.role === "user" ? d : document.createElement("div"); col.appendChild(b);
  if (m.role !== "user" && !m.error) {
    const a = document.createElement("div"); a.className = "acts";
    a.innerHTML = `<button aria-label="Copy" data-a="c">${ICON.copy}</button><button aria-label="Read aloud" data-a="s">${ICON.speak}</button>` + (i === cur.msgs.length - 1 ? `<button aria-label="Regenerate" data-a="r">${ICON.redo}</button>` : "");
    a.onclick = e => { const k = e.target.closest("button")?.dataset.a; if (k === "c") navigator.clipboard?.writeText(m.content); if (k === "s") { speechSynthesis.cancel(); speechSynthesis.speak(new SpeechSynthesisUtterance(m.content)) } if (k === "r") { cur.msgs.pop(); const u = cur.msgs.pop(); save(); ask(u.content, null, u.extra) } };
    col.appendChild(a);
  }
  if (m.role !== "user") { col.className = "col"; d.append(aiAv(), col) }
  if (anim) d.classList.add("in");
  return d;
}
function hist() {
  const h = $("#hist"); h.innerHTML = "";
  if (!chats.length) { h.innerHTML = '<p style="color:var(--mute);padding:4px 12px">No chats yet</p>'; return }
  chats.forEach(c => {
    const w = document.createElement("div"); w.className = "hrow" + (c === cur ? " cur" : "");
    const b = document.createElement("button"); b.className = "row"; b.textContent = c.title; b.onclick = () => { cur = c; render(); closeD() };
    const x = document.createElement("button"); x.className = "hdel"; x.setAttribute("aria-label", "Delete chat: " + c.title); x.title = "Delete chat";
    x.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3"/></svg>';
    x.onclick = e => { e.stopPropagation(); if (!confirm("Delete this chat?")) return; if (busy && c === cur) ctrl?.abort(); chats = chats.filter(k => k !== c); if (cur === c) cur = null; save(); render() };
    w.append(b, x); h.appendChild(w)
  })
}
function newChat() { cur = null; render(); closeD() }
async function ask(text, title, extra) {
  text = text.trim(); if (!text || busy) return;
  if (!cfg.apiKey) { alert("Add your OpenRouter key in config.js"); return }
  if (!cur) { cur = { title: title || text.slice(0, 40), msgs: [] }; chats.unshift(cur) }
  cur.msgs.push(extra ? { role: "user", content: text, extra } : { role: "user", content: text }); save(); render(true); window.onAsked && onAsked(title);
  const holder = document.createElement("div"); holder.className = "msg ai in";
  const hcol = document.createElement("div"); hcol.className = "col"; const hb = document.createElement("div"); hb.className = "b"; hb.innerHTML = THINK; hcol.appendChild(hb); holder.append(aiAv(true), hcol);
  log.appendChild(holder); bottom();
  busy = true; upd(); ctrl = new AbortController();
  const reply = { role: "assistant", content: "" };
  try {
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST", signal: ctrl.signal,
      headers: { "Authorization": "Bearer " + cfg.apiKey, "Content-Type": "application/json", "X-Title": "PiQuest X" },
      body: JSON.stringify({ model: model(), stream: true, temperature: 0.2, messages: [{ role: "system", content: SYSTEM() }, ...cur.msgs.slice(-20).map(({ role, content, extra }) => ({ role, content: extra ? content + "\n\n" + extra : content }))] })
    });
    if (!r.ok) { let t = ""; try { t = (await r.json()).error?.message || "" } catch (e) { } throw new Error(`Request failed (${r.status}). ${t}`) }
    const rd = r.body.getReader(), dec = new TextDecoder(); let buf = "";
    while (true) {
      const { done, value } = await rd.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n"); buf = lines.pop();
      for (const ln of lines) {
        if (!ln.startsWith("data:")) continue; const p = ln.slice(5).trim(); if (!p || p === "[DONE]") continue;
        try { const j = JSON.parse(p); if (j.error) throw new Error(j.error.message); const dlt = j.choices?.[0]?.delta?.content; if (dlt) { reply.content += dlt; hb.innerHTML = md(reply.content); caret(hb); bottom() } } catch (e) { if (e.message && !(e instanceof SyntaxError)) throw e }
      }
    }
    if (!reply.content) throw new Error("The model returned an empty reply. Try again or pick another model.");
  } catch (e) {
    if (e.name === "AbortError") { if (!reply.content) { reply.content = "Stopped."; reply.error = true } }
    else { reply.content = e.message || "Network error. Check your connection and try again."; reply.error = true }
  }
  cur.msgs.push(reply); save(); busy = false; ctrl = null; upd(); render();
}
const inp = $("#in"), send = $("#send");
function upd() { document.body.classList.toggle("busy", busy); send.disabled = !busy && !inp.value.trim(); send.setAttribute("aria-label", busy ? "Stop" : "Send"); send.innerHTML = busy ? '<svg viewBox="0 0 24 24"><rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor"/></svg>' : '<svg viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7"/></svg>'; if (busy) send.disabled = false }
inp.oninput = () => { inp.style.height = "auto"; inp.style.height = Math.min(inp.scrollHeight, 160) + "px"; upd() };
inp.onkeydown = e => { if (e.key === "Enter" && !e.shiftKey && matchMedia("(hover:hover)").matches) { e.preventDefault(); go() } };
function go() { if (busy) { ctrl?.abort(); return } const t = inp.value; inp.value = ""; inp.style.height = "auto"; upd(); ask(t) }
send.onclick = go;
inp.onfocus = () => setTimeout(() => { if (cur && cur.msgs.length) bottom() }, 300);

const SR = window.SpeechRecognition || window.webkitSpeechRecognition; let rec = null;
$("#mic").onclick = () => {
  if (!SR) { alert("Voice input isn't supported in this browser. Try Chrome."); return }
  if (rec) { rec.stop(); return }
  rec = new SR(); rec.lang = "en-US"; rec.interimResults = true;
  const base = inp.value; $("#mic").classList.add("on");
  rec.onresult = e => { inp.value = base + Array.from(e.results).map(r => r[0].transcript).join(""); inp.oninput() };
  rec.onend = () => { rec = null; $("#mic").classList.remove("on") }; rec.start();
};

const dr = $("#drawer"), closeD = () => dr.classList.remove("open");
$("#menu").onclick = () => dr.classList.add("open");
dr.onclick = e => { if (!$("#side").contains(e.target)) closeD() };
$("#new").onclick = newChat; $("#new2").onclick = newChat;
$("#clear").onclick = () => { if (confirm("Delete all chats?")) { chats = []; cur = null; save(); render() } };
$("#goProfile").onclick = () => { closeD(); window.showProfile && showProfile() };
$("#goTopics").onclick = () => { closeD(); openTopics() };
$("#goDaily").onclick = () => { closeD(); window.showDaily && showDaily() };
$("#goDash").onclick = () => { closeD(); window.showDash && showDash() };
window.Dost = { init(id, nat) { uid = id; nature = NATURES[nat] ? nat : "friendly"; chats = JSON.parse(localStorage.getItem("dost.chats." + uid) || "[]"); cur = null; render() }, reset() { uid = "guest"; chats = []; cur = null }, clear() { chats = []; cur = null; save(); render() }, chats: () => chats, open(c) { cur = c || null; render() }, topic(n) { cur = null; render(); ask(topicPrompt(n), n) }, topicGroups: () => TOPICS.map(g => g[0]), groupOf: n => (TOPICS.find(g => g[1].some(t => t[1] === n)) || [])[0], say(t, title, extra) { cur = null; render(); ask(t, title, extra) }, setNature(k) { if (NATURES[k]) nature = k }, natures: NATURES, popular: POPULAR };