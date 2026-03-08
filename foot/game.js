// ============================================================
//  game.js — 游戏核心逻辑
// ============================================================

// ── 游戏状态 ──────────────────────────────────────────────
const gameState = {
  playerName: "",
  attrs: {},       // { strength: 5, wisdom: 3, ... }
  history: [],     // [{ story, choice }, ...]
  turn: 0,
};

// ── 初始化页面 ────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("game-title").textContent    = GAME_CONFIG.title;
  document.getElementById("game-subtitle").textContent = GAME_CONFIG.subtitle;
  buildAttrAllocator();
});

// ── 开始界面 → 角色创建 ───────────────────────────────────
function startGame() {
  showScreen("screen-create");
}

// 构建属性分配 UI
function buildAttrAllocator() {
  const container = document.getElementById("attr-list");
  container.innerHTML = "";

  // 初始化属性为默认值
  GAME_CONFIG.attributes.forEach(a => {
    gameState.attrs[a.key] = a.default;
  });

  GAME_CONFIG.attributes.forEach(a => {
    const row = document.createElement("div");
    row.className = "attr-row";
    row.innerHTML = `
      <span class="attr-name">${a.name}</span>
      <span class="attr-desc">${a.desc}</span>
      <button onclick="adjustAttr('${a.key}', -1)">－</button>
      <span class="attr-val" id="val-${a.key}">${a.default}</span>
      <button onclick="adjustAttr('${a.key}', +1)">＋</button>
    `;
    container.appendChild(row);
  });

  updatePointsLeft();
}

function adjustAttr(key, delta) {
  const cfg = GAME_CONFIG.attributes.find(a => a.key === key);
  const newVal = gameState.attrs[key] + delta;
  if (newVal < cfg.min || newVal > cfg.max) return;

  const pointsLeft = getPointsLeft();
  if (delta > 0 && pointsLeft <= 0) return;

  gameState.attrs[key] = newVal;
  document.getElementById(`val-${key}`).textContent = newVal;
  updatePointsLeft();
}

function getPointsLeft() {
  const used = GAME_CONFIG.attributes.reduce((sum, a) => {
    return sum + (gameState.attrs[a.key] - a.default);
  }, 0);
  return GAME_CONFIG.totalPoints - used;
}

function updatePointsLeft() {
  document.getElementById("points-left").textContent = getPointsLeft();
}

// 确认创建角色
function confirmCreate() {
  const name = document.getElementById("player-name").value.trim();
  if (!name) {
    document.getElementById("player-name").focus();
    return;
  }
  gameState.playerName = name;
  enterGame();
}

// ── 进入游戏主界面 ────────────────────────────────────────
function enterGame() {
  showScreen("screen-game");
  renderSidebar();

  // 显示开场白，然后调用 AI 获取第一个场景
  typeText(GAME_CONFIG.openingText, () => {
    setTimeout(() => callAI(null), 800);
  });
}

// ── 调用 AI ───────────────────────────────────────────────
async function callAI(playerChoice) {
  setLoading(true);
  clearOptions();

  try {
    const messages = buildMessages(gameState, playerChoice);
    const result   = await fetchStory(messages);

    // 记录历史
    gameState.history.push({ story: result.story, choice: playerChoice });
    gameState.turn++;

    // 追加到日志
    addLog(result.story, playerChoice);

    // 显示故事
    typeText(result.story, () => {
      setLoading(false);
      if (result.isEnding) {
        showEnding(result.story);
      } else {
        renderOptions(result.options || []);
      }
    });

  } catch (err) {
    setLoading(false);
    showError(err.message);
  }
}

// ── 玩家选择选项 ──────────────────────────────────────────
function chooseOption(optionText, effect) {
  // 应用属性变化
  if (effect) {
    Object.entries(effect).forEach(([key, delta]) => {
      if (gameState.attrs[key] !== undefined) {
        const cfg = GAME_CONFIG.attributes.find(a => a.key === key);
        gameState.attrs[key] = Math.max(cfg.min, Math.min(cfg.max, gameState.attrs[key] + delta));
      }
    });
    renderSidebar();
  }

  clearOptions();
  callAI(optionText);
}

// ── 渲染选项 ──────────────────────────────────────────────
function renderOptions(options) {
  const box = document.getElementById("options-box");
  box.innerHTML = "";

  options.forEach((opt, i) => {
    const btn = document.createElement("button");
    btn.className = "option-btn";

    const effectText = opt.effect
      ? Object.entries(opt.effect)
          .map(([k, v]) => {
            const name = GAME_CONFIG.attributes.find(a => a.key === k)?.name || k;
            return `${name} ${v > 0 ? "+" : ""}${v}`;
          })
          .join("  ")
      : "";

    btn.innerHTML = `${i + 1}. ${opt.text}${effectText ? `<span class="option-effect">${effectText}${opt.hint ? "  ·  " + opt.hint : ""}</span>` : ""}`;
    btn.onclick = () => chooseOption(opt.text, opt.effect);
    box.appendChild(btn);
  });
}

// ── 侧边栏渲染 ────────────────────────────────────────────
function renderSidebar() {
  document.getElementById("player-name-display").textContent = gameState.playerName;

  const display = document.getElementById("attr-display");
  display.innerHTML = "";

  GAME_CONFIG.attributes.forEach(a => {
    const val = gameState.attrs[a.key];
    const pct = ((val - a.min) / (a.max - a.min)) * 100;
    const row = document.createElement("div");
    row.className = "attr-bar-row";
    row.innerHTML = `
      <div class="attr-bar-label">
        <span>${a.name}</span>
        <span>${val}</span>
      </div>
      <div class="attr-bar-track">
        <div class="attr-bar-fill" style="width:${pct}%"></div>
      </div>
    `;
    display.appendChild(row);
  });
}

// ── 历史日志 ──────────────────────────────────────────────
function addLog(story, choice) {
  const log = document.getElementById("log-content");
  const entry = document.createElement("div");
  entry.className = "log-entry";
  const preview = story.length > 40 ? story.slice(0, 40) + "…" : story;
  entry.textContent = choice ? `▶ ${choice}\n${preview}` : preview;
  log.prepend(entry);
}

// ── 结局 ──────────────────────────────────────────────────
function showEnding(text) {
  document.getElementById("end-title").textContent = "故事终章";
  document.getElementById("end-text").textContent  = text;
  setTimeout(() => showScreen("screen-end"), 1500);
}

// ── 工具函数 ──────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

function setLoading(on) {
  document.getElementById("loading").classList.toggle("hidden", !on);
}

function clearOptions() {
  document.getElementById("options-box").innerHTML = "";
}

function showError(msg) {
  const box = document.getElementById("options-box");
  box.innerHTML = `<p style="color:var(--danger);font-size:0.9rem;">⚠ ${msg}</p>
    <button onclick="callAI(null)" style="margin-top:0.5rem">重试</button>`;
}

// 打字机效果
function typeText(text, callback) {
  const el = document.getElementById("story-text");
  el.textContent = "";
  let i = 0;
  const speed = 25; // ms per char

  function tick() {
    if (i < text.length) {
      el.textContent += text[i++];
      setTimeout(tick, speed);
    } else {
      callback && callback();
    }
  }
  tick();
}
