const allowedMethods = new Set(["GET", "POST"]);
const serverPathPattern = /^servers\/[A-Za-z0-9_-]+\/?$/;
const actionPathPattern = /^servers\/[A-Za-z0-9_-]+\/(start|stop|restart)\/?$/;

function normalizePath(rawPath) {
  const decoded = decodeURIComponent(String(rawPath || ""));
  return decoded.replace(/^\/+/, "").trim();
}

function parseBody(body) {
  if (!body) return {};
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }
  if (typeof body === "object") return body;
  return {};
}

function isAllowedPath(path, method) {
  const isServerListPath = path === "servers" || path === "servers/";
  if (isServerListPath) return method === "GET";
  if (serverPathPattern.test(path)) return method === "GET";
  if (actionPathPattern.test(path)) return method === "POST";
  return false;
}

export default async function handler(req, res) {
  const method = String(req.method || "GET").toUpperCase();
  if (!allowedMethods.has(method)) {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  if (!process.env.EXAROTON_TOKEN) {
    return res.status(500).json({ success: false, error: "Missing EXAROTON_TOKEN" });
  }

  const queryPath = Array.isArray(req.query.path) ? req.query.path[0] : (req.query.path || "");
  const body = parseBody(req.body);
  const bodyPath = body.path;
  const rawPath = method === "GET" ? queryPath : bodyPath;

  let path = "";
  try {
    path = normalizePath(rawPath);
  } catch {
    return res.status(400).json({ success: false, error: "Invalid path encoding" });
  }

  if (!path || !isAllowedPath(path, method)) {
    return res.status(400).json({ success: false, error: "Unsupported API path or method" });
  }

  const url = `https://api.exaroton.com/v1/${path}`;

  let response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${process.env.EXAROTON_TOKEN}`
      }
    });
  } catch {
    return res.status(502).json({ success: false, error: "Failed to reach Exaroton API" });
  }

  const contentType = response.headers.get("content-type") || "";
  res.status(response.status);

  if (contentType.includes("application/json")) {
    const data = await response.json();
    return res.json(data);
  }

  const text = await response.text();
  return res.json({
    success: false,
    error: text || `Unexpected upstream response (${response.status})`
  });
}
