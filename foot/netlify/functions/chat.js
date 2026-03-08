// netlify/functions/chat.js
// 代理转发请求到火山方舟，API Key 安全存在服务端

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const ARK_API_KEY = process.env.ARK_API_KEY;
  const ARK_MODEL   = process.env.ARK_MODEL;

  // 调试用：返回环境变量是否存在（不暴露值）
  if (!ARK_API_KEY || !ARK_MODEL) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "服务端环境变量未配置",
        debug: {
          hasKey:   !!ARK_API_KEY,
          hasModel: !!ARK_MODEL,
        }
      })
    };
  }

  try {
    const { messages } = JSON.parse(event.body);

    const response = await fetch("https://ark.cn-beijing.volces.com/api/v3/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${ARK_API_KEY}`,
      },
      body: JSON.stringify({
        model: ARK_MODEL,
        messages,
        temperature: 0.85,
        max_tokens: 600,
        response_format: { type: "json_object" },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return { statusCode: response.status, body: JSON.stringify(data) };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
