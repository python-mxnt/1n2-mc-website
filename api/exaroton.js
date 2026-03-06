export default async function handler(req, res) {
  const rawPath = Array.isArray(req.query.path) ? req.query.path[0] : (req.query.path || "");
  const path = decodeURIComponent(String(rawPath)).replace(/^\/+/, "");
  const method = req.method || "GET";

  if (!process.env.EXAROTON_TOKEN) {
    return res.status(500).json({ error: "Missing EXAROTON_TOKEN" });
  }

  const url = `https://api.exaroton.com/v1/${path}`;

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.EXAROTON_TOKEN}`
    }
  });

  const contentType = response.headers.get("content-type") || "";
  res.status(response.status);

  if (contentType.includes("application/json")) {
    const data = await response.json();
    return res.json(data);
  }

  const text = await response.text();
  return res.send(text);
}
