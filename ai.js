// ============================================================
//  ai.js — AI API 调用封装
//  Key 已移至服务端，无需在此填写任何敏感信息
// ============================================================

/**
 * 调用 AI 获取下一段故事
 * @param {Array}  messages  - 完整对话历史 [{role, content}, ...]
 * @returns {Promise<{story: string, options: Array, isEnding: boolean}>}
 */
async function fetchStory(messages) {
  const response = await fetch("/.netlify/functions/chat", {
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
function buildMessages(gameState, playerChoice) {
  const attrText = GAME_CONFIG.attributes
    .map(a => `${a.name}${gameState.attrs[a.key]}`)
    .join("，");

  const systemPrompt = `
${GAME_CONFIG.worldBackground}

【输出格式要求】
只输出一个合法 JSON 对象，不要有任何其他文字、代码块标记或解释，结构如下：
{"story":"故事推进文本（80-150字，文风古朴）","options":[{"text":"选项描述","effect":{"属性key":变化值},"hint":"简短提示"}],"isEnding":false}

规则：
- options 提供 3 个，每个选项风格差异明显
- effect 中属性 key 与配置一致（strength/wisdom/charm/luck），变化值为整数（正负均可）
- 若故事自然走向终结，isEnding 设为 true，此时 options 可为空数组
- hint 用一句话暗示该选项适合哪种属性的角色
- 不要在 story 里提示玩家选择
`.trim();

  const messages = [
    { role: "system", content: systemPrompt },
  ];

  // 注入历史摘要（避免 token 过长，只保留最近 6 轮）
  const recentHistory = gameState.history.slice(-6);
  recentHistory.forEach(h => {
    messages.push({ role: "assistant", content: JSON.stringify({ story: h.story }) });
    if (h.choice) messages.push({ role: "user", content: h.choice });
  });

  // 当前轮的用户消息
  const userMsg = playerChoice
    ? `玩家选择：${playerChoice}\n当前属性：${attrText}\n请继续故事。`
    : `游戏开始。玩家名：${gameState.playerName}，属性：${attrText}\n请给出第一个场景和选项。`;

  messages.push({ role: "user", content: userMsg });
  return messages;
}
