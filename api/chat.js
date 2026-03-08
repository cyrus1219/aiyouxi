// api/chat.js — Vercel Serverless Function
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const ARK_API_KEY = process.env.ARK_API_KEY;
  const ARK_MODEL   = process.env.ARK_MODEL;

  if (!ARK_API_KEY || !ARK_MODEL) {
    return res.status(500).json({ error: "服务端环境变量未配置" });
  }

  try {
    const { messages } = req.body;

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
      }),
    });

    const data = await response.json();
    return res.status(response.status).json(data);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
