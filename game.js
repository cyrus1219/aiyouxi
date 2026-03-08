// ============================================================
//  game.js — 游戏核心逻辑（DND检定 + 物品栏 + 预生成）
// ============================================================

const gameState = {
  playerName: "",
  attrs: {},
  inventory: [],
  history: [],
  turn: 0,
};

// ── 初始化 ────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("game-title").textContent    = GAME_CONFIG.title;
  document.getElementById("game-subtitle").textContent = GAME_CONFIG.subtitle;
  buildAttrAllocator();
});

function startGame() { showScreen("screen-create"); }

// ── 属性分配 ──────────────────────────────────────────────
function buildAttrAllocator() {
  const container = document.getElementById("attr-list");
  container.innerHTML = "";
  GAME_CONFIG.attributes.forEach(a => { gameState.attrs[a.key] = a.default; });
  GAME_CONFIG.attributes.forEach(a => {
    const row = document.createElement("div");
    row.className = "attr-row";
    row.innerHTML = `
      <span class="attr-name">${a.name}</span>
      <span class="attr-desc">${a.desc}</span>
      <button onclick="adjustAttr('${a.key}',-1)">－</button>
      <span class="attr-val" id="val-${a.key}">${a.default}</span>
      <button onclick="adjustAttr('${a.key}',+1)">＋</button>
    `;
    container.appendChild(row);
  });
  updatePointsLeft();
}

function adjustAttr(key, delta) {
  const cfg = GAME_CONFIG.attributes.find(a => a.key === key);
  const newVal = gameState.attrs[key] + delta;
  if (newVal < cfg.min || newVal > cfg.max) return;
  if (delta > 0 && getPointsLeft() <= 0) return;
  gameState.attrs[key] = newVal;
  document.getElementById(`val-${key}`).textContent = newVal;
  updatePointsLeft();
}

function getPointsLeft() {
  return GAME_CONFIG.totalPoints - GAME_CONFIG.attributes.reduce((sum, a) =>
    sum + (gameState.attrs[a.key] - a.default), 0);
}

function updatePointsLeft() {
  document.getElementById("points-left").textContent = getPointsLeft();
}

function confirmCreate() {
  const name = document.getElementById("player-name").value.trim();
  if (!name) { document.getElementById("player-name").focus(); return; }
  gameState.playerName = name;
  enterGame();
}

// ── 进入游戏 ──────────────────────────────────────────────
function enterGame() {
  showScreen("screen-game");
  renderSidebar();
  typeText(GAME_CONFIG.openingText, () => {
    setTimeout(() => callAI(null, null), 800);
  });
}

// ── DND 骰子检定 ──────────────────────────────────────────
function rollD20() { return Math.floor(Math.random() * 20) + 1; }

function attrModifier(attrVal) { return attrVal - 5; }

function doCheck(attrKey, dc) {
  const roll = rollD20();
  const mod  = attrModifier(gameState.attrs[attrKey] || 0);
  const total = roll + mod;
  const success = total >= dc;
  const attrName = GAME_CONFIG.attributes.find(a => a.key === attrKey)?.name || attrKey;
  return {
    roll, mod, total, dc, success,
    desc: `${attrName}检定`,
  };
}

// ── 调用 AI ───────────────────────────────────────────────
async function callAI(playerChoice, rollResult) {
  setLoading(true);
  clearOptions();

  try {
    const messages = buildMessages(gameState, playerChoice, rollResult);
    const result   = await fetchStory(messages);

    gameState.history.push({ story: result.story, choice: playerChoice, rollResult });
    gameState.turn++;
    addLog(result.story, playerChoice, rollResult);

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

// ── 玩家选择选项（本地处理，无需再调 AI）────────────────
function chooseOption(index, opt) {
  if (opt.requireItem && !hasItem(opt.requireItem)) return;

  const rollResult = doCheck(opt.attr, opt.dc);

  // 应用属性变化
  const effect = rollResult.success ? opt.successEffect : opt.failEffect;
  if (effect) {
    Object.entries(effect).forEach(([key, delta]) => {
      if (gameState.attrs[key] !== undefined) {
        const cfg = GAME_CONFIG.attributes.find(a => a.key === key);
        gameState.attrs[key] = Math.max(cfg.min, Math.min(cfg.max, gameState.attrs[key] + delta));
      }
    });
  }

  // 应用物品变化
  const itemChanges = rollResult.success ? (opt.successItems || []) : (opt.failItems || []);
  itemChanges.forEach(change => {
    if (change.action === "add" && !hasItem(change.name)) {
      gameState.inventory.push({ name: change.name, desc: change.desc || "" });
    } else if (change.action === "remove") {
      gameState.inventory = gameState.inventory.filter(i => i.name !== change.name);
    }
  });

  renderSidebar();
  clearOptions();

  showRollResult(rollResult, () => {
    callAI(opt.text, rollResult);
  });
}

// ── 显示骰子检定结果 ──────────────────────────────────────
function showRollResult(r, callback) {
  const box = document.getElementById("options-box");
  const resultClass = r.success ? "roll-success" : "roll-fail";
  const resultText  = r.success ? "检定成功" : "检定失败";
  box.innerHTML = `
    <div class="roll-result ${resultClass}">
      <span class="roll-dice">🎲 d20: ${r.roll}</span>
      <span class="roll-detail">${r.desc} +${r.mod} = ${r.total} vs DC${r.dc}</span>
      <span class="roll-verdict">${resultText}</span>
    </div>
  `;
  setTimeout(callback, 1800);
}

// ── 渲染选项 ──────────────────────────────────────────────
function renderOptions(options) {
  const box = document.getElementById("options-box");
  box.innerHTML = "";

  options.forEach((opt, i) => {
    const locked = opt.requireItem && !hasItem(opt.requireItem);
    const btn = document.createElement("button");
    btn.className = "option-btn" + (locked ? " locked" : "");
    btn.disabled = locked;

    const attrName = GAME_CONFIG.attributes.find(a => a.key === opt.attr)?.name || opt.attr;
    const itemTip  = opt.requireItem ? `<span class="option-item ${locked ? "item-missing" : "item-owned"}">🎒 需要：${opt.requireItem}</span>` : "";

    btn.innerHTML = `
      <span class="option-main">${i + 1}. ${opt.text}</span>
      <span class="option-meta">${attrName}检定 DC${opt.dc}${itemTip ? "  " + itemTip : ""}</span>
    `;
    btn.onclick = () => { if (!locked) chooseOption(i, opt); };
    box.appendChild(btn);
  });
}

// ── 物品栏 ────────────────────────────────────────────────
function hasItem(name) {
  return gameState.inventory.some(i => i.name === name);
}

function renderInventory() {
  const box = document.getElementById("inventory-list");
  if (!box) return;
  box.innerHTML = "";
  if (gameState.inventory.length === 0) {
    box.innerHTML = `<span class="inv-empty">空</span>`;
    return;
  }
  gameState.inventory.forEach(item => {
    const el = document.createElement("div");
    el.className = "inv-item";
    el.title = item.desc;
    el.textContent = item.name;
    box.appendChild(el);
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
    const mod = attrModifier(val);
    const modStr = mod >= 0 ? `+${mod}` : `${mod}`;
    const row = document.createElement("div");
    row.className = "attr-bar-row";
    row.innerHTML = `
      <div class="attr-bar-label">
        <span>${a.name}</span>
        <span>${val} <em>${modStr}</em></span>
      </div>
      <div class="attr-bar-track">
        <div class="attr-bar-fill" style="width:${pct}%"></div>
      </div>
    `;
    display.appendChild(row);
  });

  renderInventory();
}

// ── 历史日志 ──────────────────────────────────────────────
function addLog(story, choice, rollResult) {
  const log = document.getElementById("log-content");
  const entry = document.createElement("div");
  entry.className = "log-entry";
  const preview = story.length > 40 ? story.slice(0, 40) + "…" : story;
  const rollTag = rollResult
    ? ` [${rollResult.success ? "✓" : "✗"}${rollResult.total}]`
    : "";
  entry.textContent = choice ? `▶ ${choice}${rollTag}\n${preview}` : preview;
  log.prepend(entry);
}

// ── 结局 ──────────────────────────────────────────────────
function showEnding(text) {
  document.getElementById("end-title").textContent = "故事终章";
  document.getElementById("end-text").textContent  = text;
  setTimeout(() => showScreen("screen-end"), 1800);
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
    <button onclick="callAI(null,null)" style="margin-top:0.5rem">重试</button>`;
}

function typeText(text, callback) {
  const el = document.getElementById("story-text");
  el.textContent = "";
  let i = 0;
  function tick() {
    if (i < text.length) {
      el.textContent += text[i++];
      setTimeout(tick, 22);
    } else {
      callback && callback();
    }
  }
  tick();
}
