// api/ai.js
// Vercel Serverless Function (Node.js)
// 接收：{ messages: [{role, content}...], meta: {type} }
// 返回：{ content: "模型输出文本（应为JSON字符串）" }

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method Not Allowed" });
      return;
    }

    const { messages, meta } = req.body || {};
    if (!Array.isArray(messages) || messages.length < 1) {
      res.status(400).json({ error: "Bad Request: messages must be a non-empty array" });
      return;
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      // 不要把密钥写前端；密钥应在服务端环境变量中配置。:contentReference[oaicite:1]{index=1}
      res.status(500).json({ error: "Server misconfigured: OPENAI_API_KEY is missing" });
      return;
    }

    const model = process.env.OPENAI_MODEL || "gpt-5";

    const payload = {
      model,
      // 兼容写法：input 直接传 message 数组（system/user/assistant）
      input: messages,
      // 建议不存储（按需）
      store: false,
      temperature: 0.2,
      max_output_tokens: 1600
    };

    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await r.json();

    if (!r.ok) {
      // 把 OpenAI 的错误透出（便于前端显示“AI评估失败…”）
      res.status(r.status).json({ error: data?.error?.message || JSON.stringify(data) });
      return;
    }

    // 从 Responses 结构里抽取 output_text
    const output = Array.isArray(data.output) ? data.output : [];
    const texts = [];
    for (const item of output) {
      const content = Array.isArray(item.content) ? item.content : [];
      for (const c of content) {
        if (c && c.type === "output_text" && typeof c.text === "string") {
          texts.push(c.text);
        }
      }
    }
    const content = texts.join("\n").trim();

    res.status(200).json({ content, meta: meta || null, model: data.model || model });
  } catch (err) {
    res.status(500).json({ error: err?.message || String(err) });
  }
};
