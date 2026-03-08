// ============================================================
//  ai.js — AI API 调用封装
//  Key 已移至服务端，无需在此填写任何敏感信息
// ============================================================

async function fetchStory(messages) {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`API 请求失败: ${response.status} — ${err}`);
  }

  const data = await response.json();
  const raw = data.choices?.[0]?.message?.content;

  try {
    // 提取内容中的 JSON 块（兼容模型在前后输出多余文字的情况）
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("未找到 JSON 内容");
    return JSON.parse(match[0]);
  } catch {
    throw new Error("AI 返回格式解析失败: " + raw);
  }
}

/**
 * 构建发给 AI 的消息列表
 * @param {Object} gameState  - 当前游戏状态
 * @param {string} playerChoice - 玩家刚才的选择文本（第一轮为空）
 */
function buildMessages(gameState, playerChoice, rollResult) {
  const attrText = GAME_CONFIG.attributes
    .map(a => `${a.name}${gameState.attrs[a.key]}`)
    .join("，");

  const itemText = gameState.inventory.length > 0
    ? gameState.inventory.map(i => i.name).join("、")
    : "无";

  const systemPrompt = `
${GAME_CONFIG.worldBackground}

【输出格式】
只输出一个合法JSON对象，不要有任何其他文字、代码块标记或解释，结构如下：
{
  "story": "当前场景描述（80-150字）",
  "options": [
    {
      "text": "选项描述",
      "attr": "对应属性key（strength/wisdom/charm/luck）",
      "dc": 难度数字(5/10/15/20),
      "requireItem": "需要的物品名（没有则为null）",
      "successEffect": {"属性key": 变化值},
      "failEffect": {"属性key": 变化值},
      "successItems": [{"action":"add/remove","name":"物品名","desc":"物品描述"}],
      "failItems": [{"action":"add/remove","name":"物品名","desc":"物品描述"}]
    }
  ],
  "isEnding": false
}

规则：
- options 提供3个，每个选项对应不同属性，风格差异明显
- dc根据情境合理设置，不要全部相同
- requireItem为null时任何人都可选；有值时只有持有该物品的玩家才能选
- successStory和failStory都要有趣，失败也要推进故事
- 物品要自然融入情节，不要随意给予
- successEffect和failEffect绝大多数情况应为null或{}，只有在故事中发生了极其重要的转折（如获得神秘传承、受到诅咒、经历生死考验）时才允许属性变化，且每次只变化1点；普通的成功或失败不应改变属性
- 若故事走向终结，isEnding或successIsEnding/failIsEnding设为true
`.trim();

  const messages = [{ role: "system", content: systemPrompt }];

  const recentHistory = gameState.history.slice(-5);
  recentHistory.forEach(h => {
    messages.push({ role: "assistant", content: JSON.stringify({ story: h.story }) });
    if (h.choice) {
      const rollInfo = h.rollResult ? `【${h.rollResult}】` : "";
      messages.push({ role: "user", content: `${h.choice}${rollInfo}` });
    }
  });

  let userMsg;
  if (!playerChoice) {
    userMsg = `游戏开始。玩家名：${gameState.playerName}，属性：${attrText}，物品：${itemText}\n请给出第一个场景和选项。`;
  } else {
    const rollInfo = rollResult ? `\n检定结果：${rollResult.desc}（掷出${rollResult.roll}+修正${rollResult.mod}=${rollResult.total} vs DC${rollResult.dc}，${rollResult.success ? "成功" : "失败"}）` : "";
    userMsg = `玩家选择：${playerChoice}${rollInfo}\n当前属性：${attrText}，物品：${itemText}\n请继续故事。`;
  }

  messages.push({ role: "user", content: userMsg });
  return messages;
}
