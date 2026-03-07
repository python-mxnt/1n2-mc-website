const allowedMethods = new Set(["GET", "POST"]);
const serverPathPattern = /^servers\/[A-Za-z0-9_-]+\/?$/;
const actionPathPattern = /^servers\/[A-Za-z0-9_-]+\/(start|stop|restart)\/?$/;

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

function normalizePath(rawPath) {
  const decoded = decodeURIComponent(String(rawPath || ""));
  return decoded.replace(/^\/+/, "").trim();
}

function isAllowedPath(path, method) {
  const isServerListPath = path === "servers" || path === "servers/";
  if (isServerListPath) return method === "GET";
  if (serverPathPattern.test(path)) return method === "GET";
  if (actionPathPattern.test(path)) return method === "POST";
  return false;
}

async function getBodyPath(request) {
  try {
    const body = await request.json();
    return body?.path;
  } catch {
    return "";
  }
}

export async function onRequest({ request, env }) {
  const method = String(request.method || "GET").toUpperCase();
  if (!allowedMethods.has(method)) {
    return json(405, { success: false, error: "Method not allowed" });
  }

  const token = env?.EXAROTON_TOKEN;
  if (!token) {
    return json(500, { success: false, error: "Missing EXAROTON_TOKEN" });
  }

  const requestUrl = new URL(request.url);
  const rawPath = method === "GET" ? requestUrl.searchParams.get("path") : await getBodyPath(request);

  let path = "";
  try {
    path = normalizePath(rawPath);
  } catch {
    return json(400, { success: false, error: "Invalid path encoding" });
  }

  if (!path || !isAllowedPath(path, method)) {
    return json(400, { success: false, error: "Unsupported API path or method" });
  }

  const upstreamUrl = `https://api.exaroton.com/v1/${path}`;

  let upstreamResponse;
  try {
    upstreamResponse = await fetch(upstreamUrl, {
      method,
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
  } catch {
    return json(502, { success: false, error: "Failed to reach Exaroton API" });
  }

  const contentType = upstreamResponse.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const body = await upstreamResponse.text();
    return new Response(body, {
      status: upstreamResponse.status,
      headers: { "content-type": "application/json; charset=utf-8" }
    });
  }

  const text = await upstreamResponse.text();
  return json(upstreamResponse.status, {
    success: false,
    error: text || `Unexpected upstream response (${upstreamResponse.status})`
  });
}
