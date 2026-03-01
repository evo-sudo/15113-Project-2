// PokéArena Ranked Frontend (local ranked via localStorage)
// Backend stays EXACTLY as you currently have it (Render Flask):
//   GET  /api/health
//   GET  /api/new-round
//   POST /api/guess   { id, guess }
//   GET  /api/hint/types/<id>
//   GET  /api/hint/generation/<id>
//   GET  /api/hint/dex/<id>
//   GET  /api/reveal/<id>
//
// This ranked system is LOCAL (per browser) until you add DB endpoints.

const DEFAULT_BACKEND = "http://localhost:5000";
let BASE_URL = "https://one5113-apihw-backend.onrender.com";

// ---- DOM ----
const el = (id) => document.getElementById(id);

const backendStatus = el("backendStatus");

const ratingEl = el("rating");
const winsEl = el("wins");
const lossesEl = el("losses");
const streakEl = el("streak");

const playerNameInput = el("playerName");
const difficultySel = el("difficulty");
const saveProfileBtn = el("saveProfileBtn");

const newBtn = el("newBtn");
const giveUpBtn = el("giveUpBtn");
const submitBtn = el("submitBtn");
const guessInput = el("guessInput");

const roundStatus = el("roundStatus");
const msg = el("msg");

const yourImg = el("yourImg");
const oppImg = el("oppImg");
const placeholder = el("placeholder");
const yourNamePlate = el("yourName");
const oppNamePlate = el("oppName");

const loadingOverlay = el("loadingOverlay");

const hintGenBtn = el("hintGenBtn");
const hintTypeBtn = el("hintTypeBtn");
const hintDexBtn = el("hintDexBtn");

const hintGen = el("hintGen");
const hintTypes = el("hintTypes");
const hintDex = el("hintDex");

const revealName = el("revealName");
const revealTypes = el("revealTypes");
const statsBars = el("statsBars");

const attemptsEl = el("attempts");
const roundPointsEl = el("roundPoints");
const kFactorEl = el("kFactor");

const hpText = el("hpText");
const hpFill = el("hpFill");
const botRatingText = el("botRatingText");
const botPill = el("botPill");

const lastResult = el("lastResult");
const deltaRating = el("deltaRating");
const winRate = el("winRate");
const bestStreakEl = el("bestStreak");

const historyEl = el("history");
const clearHistoryBtn = el("clearHistoryBtn");

// ---- Ranked model (LOCAL) ----
const STORAGE_KEY = "pokearena_ranked_v1";

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function freshState() {
  return {
    profile: {
      name: "",
      rating: 1000,
      wins: 0,
      losses: 0,
      streak: 0,
      bestStreak: 0
    },
    history: [] // newest first
  };
}

let state = loadState() || freshState();

// ---- Round state ----
let round = {
  active: false,
  yourId: null,
  attempts: 0,
  hp: 100,
  hpMax: 100,
  botRating: 1000,
  kFactor: 24,
  used: { gen: false, types: false, dex: false }
};

// Difficulty tuning (controls bot rating and K-factor and starting HP)
const DIFF = {
  easy:    { bot: 930,  k: 18, hp: 120, label: "EASY" },
  standard:{ bot: 1000, k: 24, hp: 100, label: "STANDARD" },
  hard:    { bot: 1080, k: 32, hp: 90,  label: "HARD" }
};

function setMessage(text) {
  msg.textContent = text || "";
}

function setLoading(on) {
  loadingOverlay.classList.toggle("hidden", !on);
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function formatPct(x) {
  return `${Math.round(x * 100)}%`;
}

// Elo expected score
function expectedScore(rA, rB) {
  return 1 / (1 + Math.pow(10, (rB - rA) / 400));
}

// Elo update
function updateRating(rPlayer, rBot, didWin, k) {
  const Ea = expectedScore(rPlayer, rBot);
  const Sa = didWin ? 1 : 0;
  const delta = Math.round(k * (Sa - Ea));
  return { newRating: rPlayer + delta, delta };
}

// Local history row
function pushHistoryRow(entry) {
  state.history.unshift(entry);
  if (state.history.length > 30) state.history.length = 30;
  saveState(state);
  renderDashboard();
}

// ---- Backend helpers ----
async function apiGet(path) {
  const r = await fetch(`${BASE_URL}${path}`);
  if (!r.ok) throw new Error(`GET ${path} failed (${r.status})`);
  return r.json();
}

async function apiPost(path, body) {
  const r = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(data.error || `POST ${path} failed (${r.status})`);
  }
  return data;
}

async function checkBackend() {
  try {
    const data = await apiGet("/api/health");
    if (data && data.ok) {
      backendStatus.textContent = "OK";
      return true;
    }
    backendStatus.textContent = "UNKNOWN";
    return false;
  } catch {
    backendStatus.textContent = "DOWN";
    return false;
  }
}

// ---- UI rendering ----
function renderHeader() {
  ratingEl.textContent = state.profile.rating;
  winsEl.textContent = state.profile.wins;
  lossesEl.textContent = state.profile.losses;
  streakEl.textContent = state.profile.streak;

  playerNameInput.value = state.profile.name || "";
  bestStreakEl.textContent = state.profile.bestStreak ?? 0;

  const total = state.profile.wins + state.profile.losses;
  winRate.textContent = total === 0 ? "—" : formatPct(state.profile.wins / total);
}

function renderRoundMeta() {
  attemptsEl.textContent = String(round.attempts);
  roundPointsEl.textContent = String(round.hp);
  kFactorEl.textContent = String(round.kFactor);

  hpText.textContent = `${round.hp} / ${round.hpMax}`;
  const pct = clamp(round.hp / round.hpMax, 0, 1);
  hpFill.style.transform = `scaleX(${pct})`;

  botRatingText.textContent = `Rating ${round.botRating}`;
  const d = DIFF[difficultySel.value] || DIFF.standard;
  botPill.textContent = d.label;
}

function resetHintUI() {
  hintGen.textContent = "—";
  hintTypes.textContent = "—";
  hintDex.textContent = "—";
  round.used = { gen: false, types: false, dex: false };

  hintGenBtn.disabled = false;
  hintTypeBtn.disabled = false;
  hintDexBtn.disabled = false;
}

function clearRevealUI() {
  revealName.textContent = "—";
  revealTypes.textContent = "—";
  statsBars.innerHTML = "";
}

function renderHistory() {
  if (!state.history.length) {
    historyEl.innerHTML = `<div class="row"><div class="left"><span class="smallText">No matches yet.</span></div></div>`;
    return;
  }

  historyEl.innerHTML = state.history.map((h) => {
    const badgeClass = h.result === "WIN" ? "win" : "loss";
    const sign = h.delta >= 0 ? "+" : "";
    return `
      <div class="row">
        <div class="left">
          <span class="badge ${badgeClass}">${h.result}</span>
          <span class="smallText">${h.when}</span>
          <span class="smallText">Answer: ${escapeHtml(h.answer)} • Attempts: ${h.attempts} • HP left: ${h.hpLeft}</span>
        </div>
        <div>
          <div style="text-align:right;font-weight:900;">${sign}${h.delta}</div>
          <div class="smallText" style="text-align:right;">vs BOT ${h.botRating}</div>
        </div>
      </div>
    `;
  }).join("");
}

function renderDashboard() {
  renderHeader();
  renderRoundMeta();
  renderHistory();
}

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

// ===========================
// Pokéball Round Transition
// ===========================

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

function centerOf(elm) {
  const r = elm.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function makeBallAt(x, y) {
  const ball = document.createElement("div");
  ball.className = "pokeball spin";
  ball.style.left = `${x}px`;
  ball.style.top = `${y}px`;
  ball.style.transform = "translate(-50%, -50%)";
  document.body.appendChild(ball);
  return ball;
}

async function recallIntoBallIfVisible() {
  // If sprite isn't visible, nothing to recall.
  if (!yourImg) return;
  if (yourImg.classList.contains("hiddenSprite")) return;

  // If placeholder is still showing, treat as "no active visual"
  if (placeholder && placeholder.style.display !== "none") return;

  const p = centerOf(yourImg);
  const ball = makeBallAt(p.x, p.y);

  // Shrink sprite
  yourImg.classList.add("recallOut");
  await sleep(320);

  // Cleanup
  yourImg.classList.remove("recallOut");
  yourImg.classList.add("hiddenSprite");
  yourImg.classList.remove("invisibleSprite");
  ball.remove();
}

async function throwBallAndPopSprite(targetEl) {
  // We need target position; keep element in layout but invisible.
  targetEl.classList.remove("hiddenSprite");
  targetEl.classList.add("invisibleSprite");

  const target = centerOf(targetEl);

  // Start off-screen bottom-left (feels like a throw)
  const start = { x: 80, y: window.innerHeight - 60 };
  const ball = makeBallAt(start.x, start.y);

  // Fly to target
  ball.animate(
    [
      { transform: "translate(-50%, -50%) rotate(0deg) scale(1)" },
      { transform: "translate(-50%, -50%) rotate(360deg) scale(1.05)" },
      { transform: "translate(-50%, -50%) rotate(540deg) scale(1)" }
    ],
    { duration: 420, easing: "cubic-bezier(.22,1,.36,1)" }
  );

  ball.animate(
    [
      { left: `${start.x}px`, top: `${start.y}px` },
      { left: `${target.x}px`, top: `${target.y}px` }
    ],
    { duration: 420, easing: "cubic-bezier(.22,1,.36,1)", fill: "forwards" }
  );

  await sleep(420);

  // "Open" flash
  ball.classList.remove("spin");
  ball.animate(
    [
      { transform: "translate(-50%, -50%) scale(1)", opacity: 1 },
      { transform: "translate(-50%, -50%) scale(1.45)", opacity: 0 }
    ],
    { duration: 180, easing: "ease-out", fill: "forwards" }
  );

  await sleep(180);
  ball.remove();

  // Pop sprite in
  targetEl.classList.remove("invisibleSprite");
  targetEl.classList.add("popIn");
  await sleep(340);
  targetEl.classList.remove("popIn");
}

// ---- Game flow ----
function requireProfile() {
  const name = (state.profile.name || "").trim();
  if (!name) {
    setMessage("Set a username first (top bar), then click Save.");
    return false;
  }
  return true;
}

function applyDifficultyToRound() {
  const d = DIFF[difficultySel.value] || DIFF.standard;
  round.botRating = d.bot;
  round.kFactor = d.k;
  round.hpMax = d.hp;
  round.hp = d.hp;
}

async function newRound() {
  setMessage("");
  clearRevealUI();
  resetHintUI();

  // ✅ Recall previous Pokémon (if one is visible)
  await recallIntoBallIfVisible();

  if (!requireProfile()) return;

  applyDifficultyToRound();
  renderRoundMeta();

  setLoading(true);
  try {
    const data = await apiGet("/api/new-round");
    // backend returns your.id + your.back sprite, and opponent prettyName/front
    round.yourId = data?.your?.id;
    round.attempts = 0;
    round.active = true;

    // Opponent visible
    oppNamePlate.textContent = data?.opponent?.name || "Opponent";
    oppImg.src = data?.opponent?.front || "";
    oppImg.classList.toggle("hiddenSprite", !oppImg.src);

    // Your silhouette setup (but we will pop it in with a Pokéball)
    yourNamePlate.textContent = "???";
    yourImg.src = data?.your?.back || "";
    yourImg.classList.remove("hiddenSprite");
    yourImg.classList.add("silhouette");

    placeholder.style.display = "none";
    roundStatus.textContent = "Match started. Guess your Pokémon to win rating.";

    // ✅ Throw Pokéball & pop silhouette
    await throwBallAndPopSprite(yourImg);

    guessInput.value = "";
    guessInput.focus();

    renderRoundMeta();
  } catch (e) {
    setMessage(`Backend error: ${e.message}`);
    roundStatus.textContent = "Could not start round.";
  } finally {
    setLoading(false);
  }
}

async function revealAndEndLoss(reason) {
  if (!round.active || !round.yourId) return;

  setLoading(true);
  try {
    const info = await apiGet(`/api/reveal/${round.yourId}`);
    showReveal(info);
    finalizeMatch(false, info?.name || "Unknown", reason);
  } catch (e) {
    setMessage(`Reveal failed: ${e.message}`);
  } finally {
    setLoading(false);
  }
}

function showReveal(info) {
  const name = info?.name || "—";
  const types = (info?.types || []).map(t => String(t)).join(", ") || "—";
  revealName.textContent = name;
  revealTypes.textContent = types;

  // reveal player sprite
  yourNamePlate.textContent = name;
  yourImg.classList.remove("silhouette");

  // Stats bars
  const stats = info?.stats || [];
  const max = Math.max(1, ...stats.map(s => s.value || 0));
  statsBars.innerHTML = stats.map(s => {
    const label = (s.name || "stat").replaceAll("-", " ");
    const val = s.value || 0;
    const pct = Math.round((val / max) * 100);
    return `
      <div style="margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;font-weight:900;">
          <span>${escapeHtml(label)}</span><span>${val}</span>
        </div>
        <div style="height:10px;border-radius:999px;background:#e5e7eb;overflow:hidden;border:1px solid rgba(0,0,0,0.12);">
          <div style="height:100%;width:${pct}%;background:#111827;"></div>
        </div>
      </div>
    `;
  }).join("");
}

function damage(amount, why) {
  round.hp = clamp(round.hp - amount, 0, round.hpMax);

  // ✅ SHAKE ON DAMAGE
  yourImg.classList.add("shake");
  setTimeout(() => yourImg.classList.remove("shake"), 300);

  renderRoundMeta();
  setMessage(why);

  if (round.hp <= 0) {
    revealAndEndLoss("HP reached 0 (too many hints/misses).");
  }
}

async function submitGuess() {
  if (!round.active || !round.yourId) {
    setMessage("Start a New Round first.");
    return;
  }

  const guess = (guessInput.value || "").trim();
  if (!guess) {
    setMessage("Enter a guess.");
    return;
  }

  setLoading(true);

  // ✅ STEP 7 — BATTLE FLASH ONLY ON GUESS
  document.body.classList.add("battleFlash");
  setTimeout(() => document.body.classList.remove("battleFlash"), 200);

  try {
    round.attempts += 1;
    renderRoundMeta();

    const res = await apiPost("/api/guess", { id: round.yourId, guess });
    if (res.correct) {
      const info = await apiGet(`/api/reveal/${round.yourId}`);
      showReveal(info);
      finalizeMatch(true, info?.name || "Unknown", "Correct guess!");
    } else {
      const diff = difficultySel.value;
      const dmg = diff === "hard" ? 12 : diff === "easy" ? 8 : 10;
      damage(dmg, `Not quite. You took ${dmg} damage.`);
      guessInput.select();
    }
  } catch (e) {
    setMessage(`Guess failed: ${e.message}`);
  } finally {
    setLoading(false);
  }
}

function nowString() {
  const d = new Date();
  return d.toLocaleString();
}

function finalizeMatch(didWin, answer, reason) {
  if (!round.active) return;
  round.active = false;

  // ✅ Step 5: Win/Loss visual feedback
  const bf = document.querySelector(".battlefield");
  if (bf) {
    bf.classList.remove("winFlash", "lossFade");
    bf.classList.add(didWin ? "winFlash" : "lossFade");
    setTimeout(() => bf.classList.remove("winFlash", "lossFade"), didWin ? 650 : 750);
  }

  const r0 = state.profile.rating;
  const { newRating, delta } = updateRating(r0, round.botRating, didWin, round.kFactor);
  state.profile.rating = newRating;

  if (didWin) {
    state.profile.wins += 1;
    state.profile.streak += 1;
    state.profile.bestStreak = Math.max(state.profile.bestStreak || 0, state.profile.streak);
    roundStatus.textContent = "WIN — Rating updated.";
    setMessage(`✅ WIN! ${reason} Rating ${r0} → ${newRating} (${delta >= 0 ? "+" : ""}${delta})`);
    lastResult.textContent = "WIN";
  } else {
    state.profile.losses += 1;
    state.profile.streak = 0;
    roundStatus.textContent = "LOSS — Rating updated.";
    setMessage(`❌ LOSS. ${reason} Rating ${r0} → ${newRating} (${delta >= 0 ? "+" : ""}${delta})`);
    lastResult.textContent = "LOSS";
  }

  deltaRating.textContent = `${delta >= 0 ? "+" : ""}${delta}`;

  saveState(state);
  pushHistoryRow({
    when: nowString(),
    result: didWin ? "WIN" : "LOSS",
    delta,
    botRating: round.botRating,
    attempts: round.attempts,
    hpLeft: round.hp,
    answer,
    reason
  });

  guessInput.blur();
}

// ---- Hints ----
async function useGenHint() {
  if (!round.active || !round.yourId) return setMessage("Start a New Round first.");
  if (round.used.gen) return;

  setLoading(true);
  try {
    const data = await apiGet(`/api/hint/generation/${round.yourId}`);
    hintGen.textContent = data.generation || "—";
    round.used.gen = true;
    hintGenBtn.disabled = true;
    damage(10, "Used Generation hint (-10 HP).");
  } catch (e) {
    setMessage(`Hint failed: ${e.message}`);
  } finally {
    setLoading(false);
  }
}

async function useTypeHint() {
  if (!round.active || !round.yourId) return setMessage("Start a New Round first.");
  if (round.used.types) return;

  setLoading(true);
  try {
    const data = await apiGet(`/api/hint/types/${round.yourId}`);
    const types = (data.types || []).join(", ") || "—";
    hintTypes.textContent = types;
    round.used.types = true;
    hintTypeBtn.disabled = true;
    damage(15, "Used Type hint (-15 HP).");
  } catch (e) {
    setMessage(`Hint failed: ${e.message}`);
  } finally {
    setLoading(false);
  }
}

async function useDexHint() {
  if (!round.active || !round.yourId) return setMessage("Start a New Round first.");
  if (round.used.dex) return;

  setLoading(true);
  try {
    const data = await apiGet(`/api/hint/dex/${round.yourId}`);
    hintDex.textContent = data.dex || "—";
    round.used.dex = true;
    hintDexBtn.disabled = true;
    damage(20, "Used Pokédex hint (-20 HP).");
  } catch (e) {
    setMessage(`Hint failed: ${e.message}`);
  } finally {
    setLoading(false);
  }
}

// ---- Profile ----
function saveProfile() {
  const name = (playerNameInput.value || "").trim();
  if (!name) {
    setMessage("Username cannot be empty.");
    return;
  }
  state.profile.name = name;
  saveState(state);
  setMessage(`Saved profile for ${name}.`);
  renderDashboard();
}

// ---- History ----
function clearHistory() {
  state.history = [];
  saveState(state);
  renderDashboard();
  setMessage("Cleared local match history.");
}

// ---- Init ----
async function init() {
  renderDashboard();
  const ok = await checkBackend();
  if (!ok) {
    setMessage("Backend appears down. If you are on GitHub Pages, make sure BASE_URL points to your Render URL in app.js.");
  } else {
    setMessage("Backend OK. Save your username, then start a round.");
  }
}

// === Cursor Trail: PokéSparks ===
(() => {
  let last = 0;

  window.addEventListener("pointermove", (e) => {
    const now = performance.now();
    if (now - last < 25) return;
    last = now;

    const spark = document.createElement("div");
    spark.className = "spark";

    spark.style.left = `${e.clientX}px`;
    spark.style.top = `${e.clientY}px`;

    const angle = Math.random() * 360;
    spark.style.setProperty("--angle", `${angle}deg`);

    document.body.appendChild(spark);
    setTimeout(() => spark.remove(), 400);
  });
})();

saveProfileBtn.addEventListener("click", saveProfile);
newBtn.addEventListener("click", newRound);

submitBtn.addEventListener("click", submitGuess);
guessInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") submitGuess();
});

giveUpBtn.addEventListener("click", () => {
  revealAndEndLoss("Gave up.");
});

hintGenBtn.addEventListener("click", useGenHint);
hintTypeBtn.addEventListener("click", useTypeHint);
hintDexBtn.addEventListener("click", useDexHint);

clearHistoryBtn.addEventListener("click", clearHistory);

difficultySel.addEventListener("change", () => {
  renderRoundMeta();
});

init();