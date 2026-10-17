const V = id => document.getElementById(id);
const safe = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fbOk = typeof firebase !== "undefined" && window.FIREBASE_CONFIG && !/PASTE/.test(window.FIREBASE_CONFIG.apiKey || "PASTE");
let auth = null, db = null, user = null, profile = null, pendingName = "", authNote = "";
const wait = new Promise(r => setTimeout(r, 1400));
function show(v) { ["splash", "landing", "auth", "dash", "daily", "profile", "chatview"].forEach(x => V(x).hidden = x !== v) }

const ERR = { "auth/email-already-in-use": "This email already has an account. Log in instead.", "auth/invalid-email": "Enter a valid email address.", "auth/weak-password": "Use a password with at least 6 characters.", "auth/invalid-credential": "Wrong email or password.", "auth/user-not-found": "No account found for this email.", "auth/wrong-password": "Wrong email or password.", "auth/too-many-requests": "Too many attempts. Wait a few minutes and try again.", "auth/network-request-failed": "No connection. Check your internet and try again.", "auth/operation-not-allowed": "This sign-in method is off. Turn it on in Firebase console > Authentication > Sign-in method.", "auth/popup-closed-by-user": "Google sign-in was closed before it finished.", "auth/popup-blocked": "Your browser blocked the Google pop-up. Allow pop-ups for this site and try again.", "auth/cancelled-popup-request": "Another sign-in window is open. Close it and try again.", "auth/operation-not-supported-in-this-environment": "Google sign-in needs http://localhost or https. Run the app with a local server instead of opening the file directly.", "auth/invalid-api-key": "The Firebase API key is wrong. Check firebase-config.js.", "auth/configuration-not-found": "Authentication isn't started. In Firebase console open Authentication and click Get started.", "auth/internal-error": "Firebase couldn't finish sign-in. Check that Google is enabled with a support email in Authentication > Sign-in method.", "auth/unauthorized-domain": "This address isn't allowed. Add it in Firebase console > Authentication > Settings > Authorized domains." };
const msg = e => e.code === "auth/unauthorized-domain" ? `Firebase doesn't allow "${location.hostname}" for project "${(window.FIREBASE_CONFIG || {}).projectId}". Open the app at http://localhost:8000 (not 127.0.0.1 or 0.0.0.0), and add the domain in that same project: Authentication > Settings > Authorized domains.` : ERR[e.code] || ("Something went wrong (" + (e.code || e.message) + ").");

function showAuth(m) {
  show("auth"); const note = authNote; let mode = "login";
  V("auth").innerHTML = `<div class="acard"><button type="button" class="link" id="ab" style="align-self:flex-start">‹ Back</button><div class="mark">π</div><h1>PiQuest X</h1><p class="mute">Your math tutor, any time.</p>
  ${note ? `<p class="err">${note}</p>` : ""}
  <div class="seg" role="tablist"><button type="button" data-m="login" class="on" role="tab">Log in</button><button type="button" data-m="signup" role="tab">Sign up</button></div>
  <form id="af" novalidate>
    <label id="nl" hidden>Name<input id="an" autocomplete="name"></label>
    <label>Email<input id="ae" type="email" autocomplete="email" inputmode="email"></label>
    <label>Password<input id="ap" type="password" autocomplete="current-password"></label>
    <button type="button" class="link" id="fp">Forgot password?</button>
    <button class="cta" id="sb">Log in</button>
  </form>
  <button type="button" class="ghost" id="gg">Continue with Google</button>
  <p class="err" id="er" role="alert"></p></div>`;
  const err = (t, ok) => { const e = V("er"); e.textContent = t; e.className = ok ? "ok" : "err" };
  const setMode = m => { mode = m; V("auth").querySelectorAll(".seg button").forEach(b => { b.classList.toggle("on", b.dataset.m === m); b.setAttribute("aria-selected", b.dataset.m === m) }); V("nl").hidden = m !== "signup"; V("fp").hidden = m !== "login"; V("sb").textContent = m === "login" ? "Log in" : "Create account"; V("ap").autocomplete = m === "login" ? "current-password" : "new-password"; err("") };
  V("auth").querySelectorAll(".seg button").forEach(b => b.onclick = () => setMode(b.dataset.m));
  const run = async f => { if (!fbOk) return err("Firebase isn't set up yet. Paste your config into firebase-config.js."); err(""); V("sb").disabled = true; try { await f() } catch (e) { err(msg(e)) } V("sb").disabled = false };
  V("af").onsubmit = e => {
    e.preventDefault(); const n = V("an").value.trim(), em = V("ae").value.trim(), pw = V("ap").value;
    if (!em || !pw) return err("Enter your email and password.");
    if (mode === "signup" && !n) return err("Enter your name.");
    run(async () => { if (mode === "signup") { pendingName = n; const c = await auth.createUserWithEmailAndPassword(em, pw); await c.user.updateProfile({ displayName: n }) } else await auth.signInWithEmailAndPassword(em, pw) })
  };
  V("fp").onclick = () => { const em = V("ae").value.trim(); if (!em) return err("Enter your email first, then tap Forgot password."); run(async () => { await auth.sendPasswordResetEmail(em); err("Reset link sent. Check your inbox.", true) }) };
  V("gg").onclick = () => {
    if (location.protocol === "file:") return err("Google sign-in doesn't work from a file. Run python3 -m http.server 8000 in this folder and open http://localhost:8000");
    run(async () => { const p = new firebase.auth.GoogleAuthProvider(); p.setCustomParameters({ prompt: "select_account" }); try { await auth.signInWithPopup(p) } catch (e) { if (e.code === "auth/popup-blocked") await auth.signInWithRedirect(p); else throw e } })
  };
  V("ab").onclick = showLanding;
  setMode(m === "signup" ? "signup" : "login");
}

async function loadProfile(u) {
  const k = "dost.profile." + u.uid;
  let p = { name: pendingName || u.displayName || (u.email || "Student").split("@")[0], nature: "friendly", asked: 0, topics: [], streak: 0, today: 0, day: "", goal: 5, color: 0 };
  try { p = { ...p, ...JSON.parse(localStorage.getItem(k) || "{}") } } catch (e) { }
  try { const r = db.collection("users").doc(u.uid), s = await r.get(); if (s.exists) p = { ...p, ...s.data() }; else await r.set(p) } catch (e) { }
  profile = p;
}
function saveProfile() {
  if (!user) return;
  try { localStorage.setItem("dost.profile." + user.uid, JSON.stringify(profile)) } catch (e) { }
  db && db.collection("users").doc(user.uid).set(profile, { merge: true }).catch(() => { });
}
const ds = d => d.toLocaleDateString("en-CA"), REDUCE = matchMedia("(prefers-reduced-motion: reduce)").matches;
window.onAsked = t => {
  if (!profile) return; const n = ds(new Date()), y = ds(new Date(Date.now() - 864e5));
  if (profile.day !== n) { profile.streak = profile.day === y ? (profile.streak || 0) + 1 : 1; profile.today = 0; profile.day = n }
  profile.today++; profile.asked++; if (t && !profile.topics.includes(t)) profile.topics.push(t); saveProfile()
};

const COLS = [["#10b981", "#0d9488"], ["#0ea5e9", "#10b981"], ["#f97316", "#ef4444"], ["#ec4899", "#f59e0b"], ["#84cc16", "#16a34a"], ["#64748b", "#334155"]];
const grad = i => { const c = COLS[i] || COLS[0]; return `linear-gradient(135deg,${c[0]},${c[1]})` };
function wave(ph, amp) { let d = ""; for (let x = 0; x <= 900; x += 6)d += (x ? "L" : "M") + x + " " + (70 + amp * Math.sin((x + ph) / 40)).toFixed(1); return d }
const IC = { q: '<path d="M4 5h16v11H9l-5 4z"/>', c: '<path d="M5 6h14M5 12h14M5 18h9"/>', t: '<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>', s: '<path d="M5 12l4 4L19 7"/>', b: '<path d="M4 4h12a3 3 0 013 3v13H7a3 3 0 01-3-3zM4 17a3 3 0 013-3h12"/>', p: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/>', x: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>', g: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18"/>', v: '<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/>', f: '<path d="M12 3c1 4 5 5 5 10a5 5 0 01-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z"/>' };
const ico = k => `<span class="ico"><svg viewBox="0 0 24 24">${IC[k]}</svg></span>`;
const f1 = n => n.toFixed(1), TAU = 2 * Math.PI;
const GCOL = { Basics: "#64748b", Algebra: "#10b981", Trigonometry: "#0ea5e9", Geometry: "#8b5cf6", Calculus: "#f97316", "Statistics & probability": "#ec4899", "Real-world math": "#eab308" };
function diagSine() {
  const N = 48, cx = 70, cy = 80, r = 50, x0 = 140, w = 200, t0 = Math.PI / 4;
  const vals = fn => Array.from({ length: N + 1 }, (_, k) => fn(TAU * k / N)).join(";");
  const cxv = t => f1(cx + r * Math.cos(t)), cyv = t => f1(cy - r * Math.sin(t)), sx = t => f1(x0 + w * t / TAU);
  const A = (at, fn) => REDUCE ? "" : `<animate attributeName="${at}" values="${vals(fn)}" dur="7s" repeatCount="indefinite"/>`;
  let curve = ""; for (let k = 0; k <= 96; k++) { const t = TAU * k / 96; curve += (k ? "L" : "M") + f1(x0 + w * t / TAU) + " " + f1(cy - r * Math.sin(t)) }
  return `<svg viewBox="0 0 360 160" class="dg" role="img" aria-label="A point moving around the unit circle draws a sine wave"><line x1="10" y1="80" x2="350" y2="80" class="ax"/><line x1="70" y1="20" x2="70" y2="140" class="ax"/><circle cx="70" cy="80" r="50" class="uc"/><path d="${curve}" class="sinc"/>
  <line x1="${cxv(t0)}" y1="${cyv(t0)}" x2="${sx(t0)}" y2="${cyv(t0)}" class="proj">${A("x1", cxv)}${A("y1", cyv)}${A("x2", sx)}${A("y2", cyv)}</line>
  <line x1="70" y1="80" x2="${cxv(t0)}" y2="${cyv(t0)}" class="rad">${A("x2", cxv)}${A("y2", cyv)}</line>
  <circle r="5" cx="${cxv(t0)}" cy="${cyv(t0)}" class="pt">${A("cx", cxv)}${A("cy", cyv)}</circle>
  <circle r="5" cx="${sx(t0)}" cy="${cyv(t0)}" class="pt2">${A("cx", sx)}${A("cy", cyv)}</circle>
  <text x="76" y="30" class="lb">sin θ</text><text x="322" y="96" class="lb">2π</text></svg>`;
}
function diagPie(cnt) {
  const en = Object.entries(cnt).filter(x => x[1] > 0), tot = en.reduce((s, x) => s + x[1], 0), C = +(TAU * 40).toFixed(1); let off = 0;
  const sl = en.map(([g, n]) => { const len = C * n / tot, o = off; off += len; return `<circle cx="60" cy="60" r="40" class="sl" style="stroke:${GCOL[g] || "#10b981"};stroke-dasharray:${len.toFixed(1)} ${(C - len).toFixed(1)};stroke-dashoffset:${(-o).toFixed(1)}" transform="rotate(-90 60 60)"/>` }).join("");
  const lg = en.length ? `<ul class="lg">${en.map(([g, n]) => `<li><i style="background:${GCOL[g] || "#10b981"}"></i>${safe(g)} <b>${n}</b></li>`).join("")}</ul>` : '<p class="cap">Explore topics and your chart fills up.</p>';
  return `<div class="pie"><svg viewBox="0 0 120 120" class="dg" role="img" aria-label="Pie chart of topics studied"><circle cx="60" cy="60" r="40" class="rt"/>${sl}<text x="60" y="66" class="pn">${tot}</text></svg>${lg}</div>`;
}
const diagParab = () => { let d = ""; for (let x = -3; x <= 3.001; x += .25)d += (d ? "L" : "M") + f1(100 + x * 28) + " " + f1(125 - x * x * 11); return `<svg viewBox="0 0 200 150" class="dg" role="img" aria-label="Graph of y equals x squared"><path d="M10 125H190M100 10V140" class="ax"/><path d="M${[44, 72, 100, 128, 156].map(x => x + " 20V130").join("M")}" class="gr"/><path d="${d}" class="par" pathLength="1"/><circle cx="100" cy="125" r="4" class="pt vtx"/><text x="140" y="38" class="lb">y = x²</text></svg>` };
const diagTri = () => `<svg viewBox="0 0 200 150" class="dg" role="img" aria-label="Right triangle with opposite, adjacent and hypotenuse"><path d="M30 120H165V35Z" class="tri" pathLength="1"/><path d="M153 120V108H165" class="ax"/><path d="M58 120A28 28 0 0 0 54 104" class="arcs"/><text x="64" y="113" class="lb">θ</text><text x="170" y="82" class="lb">opp</text><text x="86" y="138" class="lb">adj</text><text x="72" y="66" class="lb">hyp</text></svg>`;
const diagPi = () => `<svg viewBox="0 0 200 150" class="dg" role="img" aria-label="A circle whose circumference is pi times its diameter"><circle cx="100" cy="72" r="46" class="pic" pathLength="1"/><path d="M54 72H146" class="pd"/><g class="orb2"><circle cx="146" cy="72" r="5" class="pt"/></g><text x="100" y="112" class="pit">π</text></svg>`;
const dc = (t, svg, cap, cls = "", facts = []) => `<div class="dcard ${cls}"><div class="dgbox">${svg}</div><h3>${t}</h3><p class="cap">${cap}</p>${facts.length ? `<ul class="facts">${facts.map(f => `<li>${f}</li>`).join("")}</ul>` : ""}</div>`;

const FEATS = [["s", "Solves problems step by step", "Shows every step with the reason and a clear final answer."], ["b", "Explains any topic", "From fractions to calculus, in simple words with examples."], ["p", "Gives practice questions", "Test yourself, then check your answers."], ["x", "Helps you prepare for exams", "Key formulas, shortcuts and common mistakes."], ["g", "Shows math in real life", "See where math is used in science, AI and money."], ["v", "Understands your language", "Ask in English or Roman Urdu, by typing or by voice."]];
const HOW = ["Pick a topic or type your question.", "PiQuest X answers step by step, in the teaching style you chose.", "Practise, and watch your daily goal and streak grow."];
const KNOW = ["PiQuest X answers math and math-related questions, such as history, exam tips and real-life uses.", "PiQuest X can make mistakes, so double-check important results.", "Chats are saved on this device. Your profile and goal sync to your account."];
const stepsH = () => `<div class="steps">${HOW.map((t, i) => `<div class="step"><span class="sn">${i + 1}</span><p>${t}</p></div>`).join("")}</div>`;
const knowH = () => `<ul class="know">${KNOW.map(t => `<li><span class="ok2" aria-hidden="true">✓</span><span>${t}</span></li>`).join("")}</ul>`;

function setHello() { const e = V("hello"); if (!e) return; if (profile) { e.hidden = false; e.textContent = "Hello, " + profile.name } else e.hidden = true }

function showLanding() {
  show("landing");
  const L = V("landing"), CH = ["Matrices", "Logarithms", "sin cos tan", "Quadratic equations", "Derivatives", "Integrals", "Probability", "Fractions", "Vectors", "Complex numbers", "Limits", "Statistics", "Geometry", "Percentages", "Set theory", "Traffic math", "Computer graphics", "Matrix solver"];
  const chips = CH.map(c => `<span class="chip">${c}</span>`).join("");
  L.innerHTML = `<div class="lp">
  <nav class="dbar rise" style="--i:0"><div class="brand"><div class="mark sm">π</div><b>PiQuest X</b></div><div class="who"><button class="pill" data-go="login">Log in</button><button class="pill dark" data-go="signup">Get started</button></div></nav>
  <header class="lhero"><div class="lt rise" style="--i:1"><span class="eyebrow">Your AI math tutor</span><h1>Math, explained <em>step by step.</em></h1><p>PiQuest X solves problems, explains topics and gives you practice, in English or Roman Urdu.</p><div class="lcta"><button class="cta" data-go="signup">Get started free</button><button class="ghost" data-go="login">I have an account</button></div></div>
  <div class="lv rise" style="--i:2">${dc("Sine, drawn live", diagSine(), "A point circling the unit circle traces the sine wave.", "hero")}</div></header>
  <div class="marq" aria-hidden="true"><div class="mt">${chips}${chips}</div></div>
  <section class="ls reveal"><h2>What PiQuest X can do</h2><div class="feats">${FEATS.map(f => `<div class="feat">${ico(f[0])}<span><b>${f[1]}</b><span>${f[2]}</span></span></div>`).join("")}</div></section>
  <section class="ls reveal"><h2>See math come alive</h2><div class="lab3">${dc("Topics you study", diagPie({ Algebra: 4, Trigonometry: 3, Geometry: 2, Calculus: 2, "Statistics & probability": 1 }), "Your own chart appears here.")}${dc("Parabola", diagParab(), "y = x² drawn point by point.")}${dc("Right triangle", diagTri(), "sin, cos and tan are ratios of its sides.")}</div></section>
  <section class="ls reveal"><h2>How it works</h2>${stepsH()}</section>
  <section class="ls reveal"><h2>Pick your teaching style</h2><div class="natures">${Object.values(Dost.natures).map(v => `<div class="nat"><b>${v[0]}</b><span>${v[1]}</span></div>`).join("")}</div></section>
  <section class="ls reveal"><h2>Good to know</h2>${knowH()}</section>
  <section class="lend reveal"><h2>Ready to make math easier?</h2><button class="cta" data-go="signup">Create your free account</button></section>
  <footer class="lfoot">PiQuest X. AI can make mistakes, so double-check important results.</footer></div>`;
  L.scrollTop = 0;
  L.querySelectorAll("[data-go]").forEach(b => b.onclick = () => showAuth(b.dataset.go));
  const io = new IntersectionObserver(es => es.forEach(x => { if (x.isIntersecting) { x.target.classList.add("on"); io.unobserve(x.target) } }), { root: L, threshold: .1 });
  L.querySelectorAll(".reveal").forEach(el => REDUCE ? el.classList.add("on") : io.observe(el));
}

function showDash() {
  show("dash"); setHello();
  const ch = Dost.chats(), n = ds(new Date()), y = ds(new Date(Date.now() - 864e5));
  const today = profile.day === n ? profile.today : 0, streak = (profile.day === n || profile.day === y) ? profile.streak : 0;
  const G = profile.goal || 5, td = Math.min(today, G), C = +(2 * Math.PI * 44).toFixed(2), hr = new Date().getHours();
  const gr = hr < 12 ? "Good morning" : hr < 18 ? "Good afternoon" : "Good evening";
  const cnt = {}; profile.topics.forEach(t => { const g = Dost.groupOf(t); if (g) cnt[g] = (cnt[g] || 0) + 1 });
  const stat = (k, v, l) => `<div class="dstat">${ico(k)}<b data-n="${v}">${v}</b><span>${l}</span></div>`;
  V("dash").innerHTML = `<div class="dwrap d2">
  <div class="dbar rise" style="--i:0"><div class="brand"><div class="mark sm">π</div><b>PiQuest X</b></div><div class="who"><button class="av" id="pf" aria-label="Open profile" style="background:${grad(profile.color)}">${safe(profile.name.charAt(0).toUpperCase())}</button><button class="pill" id="lo">Log out</button></div></div>
  <section class="hero rise" style="--i:1"><svg class="wv" viewBox="0 0 600 140" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="wg" x1="0" x2="1"><stop offset="0" stop-color="#10b981"/><stop offset="1" stop-color="#0d9488"/></linearGradient></defs><g class="drift"><path d="${wave(60, 16)}" class="w2"/></g><path d="${wave(0, 26)}" class="w1" pathLength="1"/></svg>
    <div class="ht"><p class="mute">${gr}</p><h1>${safe(profile.name)}</h1><p class="sub">${today >= G ? "Daily goal reached. Great work." : today ? `${G - today} more to reach today's goal.` : "What shall we solve today?"}</p><button class="cta" id="go">Start a new chat</button></div></section>
  <div class="dgrid">
    <section class="card goal rise" style="--i:2"><div class="rw"><svg viewBox="0 0 110 110" class="ring" aria-hidden="true"><defs><linearGradient id="rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#10b981"/><stop offset="1" stop-color="#0d9488"/></linearGradient></defs><circle cx="55" cy="55" r="44" class="rt"/><circle cx="55" cy="55" r="44" class="rf" stroke="url(#rg)" stroke-dasharray="${C}" stroke-dashoffset="${C}" transform="rotate(-90 55 55)"/></svg><div class="rn"><b data-n="${td}">${td}</b><span>of ${G}</span></div></div>
      <div><h2>Daily goal</h2><p class="mute">Ask ${G} questions a day to build your habit.</p></div></section>
    <div class="dstats rise" style="--i:3">${stat("f", streak, "Day streak")}${stat("q", profile.asked, "Questions asked")}${stat("c", ch.length, "Chats")}${stat("t", profile.topics.length, "Topics explored")}</div>
  </div>
  ${dailyTeaser()}
  <div class="rise" style="--i:5"><h2>Math lab</h2><p class="mute">Live diagrams of the ideas you will learn.</p>
  <div class="lab">${dc("Sine wave and the unit circle", diagSine(), "As the point goes around the circle, its height draws sin θ.", "wide", ["The circle has radius 1, so the point's height is sin θ and its width is cos θ.", "One full turn is 2π radians (360°). After that the wave repeats.", "sin θ stays between −1 and 1. It is 0 at 0, π and 2π, and 1 at π/2.", "Sound, light and tides are all modelled with sine waves."])}${dc("Your topic mix", diagPie(cnt), "Built from the topics you explore.", "", ["Each slice is one area of math you have explored. The number is how many topics.", "A bigger slice means more of your time went there.", "Try a new area to balance the chart."])}${dc("Parabola", diagParab(), "y = x² has its lowest point at the origin.", "", ["The graph is symmetric about the y-axis.", "The lowest point (0, 0) is called the vertex.", "In y = ax² + bx + c it opens up when a > 0 and down when a < 0.", "Thrown balls and satellite dishes follow parabolas."])}${dc("Right triangle", diagTri(), "sin θ = opp ÷ hyp, cos θ = adj ÷ hyp, tan θ = opp ÷ adj.", "", ["The hypotenuse is the longest side, opposite the right angle.", "Remember SOH-CAH-TOA for the three ratios.", "Pythagoras: opp² + adj² = hyp².", "Used to find heights and distances without measuring them."])}${dc("Pi", diagPi(), "Circumference ÷ diameter = π ≈ 3.14159.", "", ["π is the same for every circle, big or small.", "Its decimals never end and never repeat.", "Circumference C = 2πr and area A = πr².", "22/7 is a handy approximation."])}</div></div></div>`;
  const D = V("dash"); D.scrollTop = 0;
  V("lo").onclick = () => auth && auth.signOut();
  V("pf").onclick = showProfile;
  V("go").onclick = () => { Dost.open(null); show("chatview") };
  bindDaily();
  const rf = D.querySelector(".rf"), off = C * (1 - td / G);
  if (REDUCE) rf.style.strokeDashoffset = off; else requestAnimationFrame(() => requestAnimationFrame(() => rf.style.strokeDashoffset = off));
  D.querySelectorAll("[data-n]").forEach(el => { const to = +el.dataset.n; if (REDUCE || !to) return; el.textContent = 0; let s = null; const f = t => { s = s || t; const p = Math.min((t - s) / 1000, 1); el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(f) }; requestAnimationFrame(f) });
}
function showProfile() {
  show("profile");
  const ids = (user.providerData || []).map(p => p.providerId), google = ids.includes("google.com"), pw = ids.includes("password");
  const since = user.metadata && user.metadata.creationTime ? new Date(user.metadata.creationTime).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : "";
  let goal = profile.goal || 5, color = profile.color || 0;
  V("profile").innerHTML = `<div class="dwrap d2">
  <div class="dbar rise" style="--i:0"><button class="pill" id="bk">‹ Dashboard</button><b>Profile</b><span style="width:96px"></span></div>
  <section class="card pfhead rise" style="--i:1"><div class="av big" id="bav" style="background:${grad(color)}">${safe(profile.name.charAt(0).toUpperCase())}</div>
    <div class="pfi"><h1 id="bnm">${safe(profile.name)}</h1><p class="mute">${safe(user.email || "")}</p><p class="badges">${google ? '<span class="badge">Google</span>' : ""}${pw ? '<span class="badge">Email</span>' : ""}${since ? `<span class="badge soft">Member since ${since}</span>` : ""}</p></div></section>
  <div class="dstats rise" style="--i:2;margin-top:12px">    <div class="dstat">${ico("q")}<b>${profile.asked}</b><span>Questions asked</span></div><div class="dstat">${ico("t")}<b>${profile.topics.length}</b><span>Topics explored</span></div></div>
  <section class="card pfform rise" style="--i:3"><h2>Your titles</h2>${titlesHTML()}</section>
  <section class="card pfform rise" style="--i:3"><h2>Details</h2>
    <label class="fld">Name<input id="pn" value="${safe(profile.name)}" maxlength="40" autocomplete="name"></label>
    <label class="fld">Email<input value="${safe(user.email || "")}" disabled></label>
    <div class="fld">Daily goal<div class="gseg" role="radiogroup" aria-label="Daily goal">${[3, 5, 7, 10].map(n => `<button type="button" role="radio" aria-checked="${n === goal}" class="${n === goal ? "on" : ""}" data-g="${n}">${n}</button>`).join("")}</div></div>
    <div class="fld">Avatar colour<div class="sw" role="radiogroup" aria-label="Avatar colour">${COLS.map((c, i) => `<button type="button" role="radio" aria-checked="${i === color}" aria-label="Colour ${i + 1}" class="${i === color ? "on" : ""}" data-c="${i}" style="background:${grad(i)}"></button>`).join("")}</div></div>
    <p class="err" id="pe" role="alert"></p><p class="ok" id="po" role="status"></p>
    <button class="cta" id="ps">Save changes</button></section>
  <section class="card pfform rise" style="--i:4"><h2>AI nature</h2><p class="mute" style="margin-top:-8px">Choose how PiQuest X explains things to you.</p>
    <div class="natures" role="radiogroup" aria-label="AI nature">${Object.entries(Dost.natures).map(([k, v]) => `<button type="button" class="nat${k === profile.nature ? " on" : ""}" role="radio" aria-checked="${k === profile.nature}" data-k="${k}"><b>${v[0]}</b><span>${v[1]}</span></button>`).join("")}</div></section>
  <section class="card pfform rise" style="--i:5"><h2>Account</h2>
    ${pw ? '<button class="ghost" id="cp">Send password reset email</button>' : '<p class="mute">You sign in with Google, so there is no password to change here.</p>'}
    <button class="ghost" id="dc">Delete all chats</button><button class="ghost danger" id="pl">Log out</button><p class="mute" id="pm" role="status"></p></section></div>`;
  const P = V("profile"); P.scrollTop = 0;
  const pick = (sel, attr, fn) => P.querySelectorAll(sel).forEach(b => b.onclick = () => { fn(+b.dataset[attr]); P.querySelectorAll(sel).forEach(x => { x.classList.toggle("on", x === b); x.setAttribute("aria-checked", x === b) }) });
  pick("[data-g]", "g", v => goal = v); pick("[data-c]", "c", v => { color = v; V("bav").style.background = grad(v) });
  P.querySelectorAll(".nat").forEach(b => b.onclick = () => { profile.nature = b.dataset.k; Dost.setNature(b.dataset.k); saveProfile(); P.querySelectorAll(".nat").forEach(x => { x.classList.toggle("on", x === b); x.setAttribute("aria-checked", x === b) }) });
  V("bk").onclick = showDash; V("pl").onclick = () => auth && auth.signOut();
  V("dc").onclick = () => { if (confirm("Delete all your chats on this device?")) { Dost.clear(); V("pm").textContent = "All chats deleted." } };
  if (pw) V("cp").onclick = async () => { try { await auth.sendPasswordResetEmail(user.email); V("pm").textContent = "Reset link sent to " + user.email + "." } catch (e) { V("pm").textContent = msg(e) } };
  V("ps").onclick = async () => {
    const n = V("pn").value.trim(); V("pe").textContent = ""; V("po").textContent = "";
    if (!n) return V("pe").textContent = "Enter your name.";
    profile.name = n; profile.goal = goal; profile.color = color; saveProfile();
    try { await user.updateProfile({ displayName: n }) } catch (e) { }
    V("bnm").textContent = n; setHello(); V("bav").textContent = n.charAt(0).toUpperCase(); V("po").textContent = "Saved."
  };
}
V("logout").onclick = () => auth && auth.signOut();

if (fbOk) {
  firebase.initializeApp(window.FIREBASE_CONFIG); auth = firebase.auth(); db = firebase.firestore();
  auth.onAuthStateChanged(async u => {
    await wait;
    if (!u) { user = null; profile = null; setHello(); Dost.reset(); showLanding(); return }
    user = u; await loadProfile(u); Dost.init(u.uid, profile.nature); showDash();
  });
} else { authNote = typeof firebase === "undefined" ? "Couldn't load Firebase. Check your internet connection." : "Firebase isn't set up yet. Paste your config into firebase-config.js."; wait.then(showLanding) }