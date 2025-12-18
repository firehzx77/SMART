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

    // ✅ DeepSeek Key（你现在 Vercel 配的是这个）
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      res.status(500).json({
        error: "Server misconfigured: DEEPSEEK_API_KEY is missing (请在 Vercel 环境变量中设置 DEEPSEEK_API_KEY)"
      });
      return;
    }

    // DeepSeek Base URL（默认官方）
    const baseUrl = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/$/, "");
    const endpoint = `${baseUrl}/chat/completions`;

    // 默认模型：deepseek-chat（更稳定输出 JSON）
    const model = process.env.DEEPSEEK_MODEL || "deepseek-chat";

    // 输出 token 上限（按需调大/调小）
    const maxTokens = Number(process.env.DEEPSEEK_MAX_TOKENS || 2200);

    // 超时控制
    const controller = new AbortController();
    const timeoutMs = Number(process.env.DEEPSEEK_TIMEOUT_MS || 45000);
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const payload = {
      model,
      messages,
      stream: false,
      temperature: 0.2,
      max_tokens: maxTokens,

      // ✅ 强制 JSON 输出（减少“不是合法JSON”导致的前端回填失败）
      // 注意：你仍然要在 system/user prompt 里要求输出 JSON（前端已写）
      response_format: { type: "json_object" }
    };

    try {
      const r = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      const data = await r.json().catch(() => null);

      if (!r.ok) {
        const msg =
          data?.error?.message ||
          data?.message ||
          JSON.stringify(data) ||
          `HTTP ${r.status}`;
        res.status(r.status).json({ error: msg });
        return;
      }

      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== "string" || !content.trim()) {
        res.status(500).json({ error: "DeepSeek returned empty content" });
        return;
      }

      res.status(200).json({
        content,
        meta: meta || null,
        provider: "deepseek",
        model: data?.model || model
      });
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    const msg =
      err?.name === "AbortError"
        ? "Request timed out (DEEPSEEK_TIMEOUT_MS)"
        : (err?.message || String(err));
    res.status(500).json({ error: msg });
  }
};
