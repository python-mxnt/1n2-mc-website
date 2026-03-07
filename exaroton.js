const EXAROTON_BASE = "/api/exaroton";
const SERVER_ID = "ZRjrKM5sbeLNYmjZ";
const POLL_INTERVAL_MS = 15_000;
const PROXY_ENDPOINT = "/api/exaroton";
let activeServerId = SERVER_ID.trim();
let latestStatus = "";
let isBusy = false;
let pollTimer = null;
let controlsLocked = false;

const statusMap = {
    0: "offline",
    1: "online",
    2: "starting",
    3: "stopping",
    4: "restarting",
    5: "saving",
    6: "loading",
    7: "crashed",
    8: "pending",
    9: "transferring",
    10: "preparing"
};

const allowedStatesByAction = {
    start: new Set(["offline", "crashed"]),
    stop: new Set(["online", "starting", "loading", "saving", "pending", "preparing", "transferring", "restarting"]),
    restart: new Set(["online", "saving"])
};

const note = document.getElementById("server-note");
const nameEl = document.getElementById("server-name");
const statusEl = document.getElementById("server-status");
const playersEl = document.getElementById("server-players");
const addressEl = document.getElementById("server-address");
const versionEl = document.getElementById("server-version");
const updatedEl = document.getElementById("server-updated");
const autoRefreshEl = document.getElementById("server-autorefresh");
const actionButtons = Array.from(document.querySelectorAll(".server-actions button"));

function setNote(message) {
    note.textContent = message;
}

function disableControls(message) {
    controlsLocked = true;
    isBusy = false;
    autoRefreshEl.checked = false;
    autoRefreshEl.disabled = true;
    setNote(message);
    applyButtonState();
}

function setUpdatedNow() {
    updatedEl.textContent = new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    });
}

function formatSoftware(software) {
    if (!software) return "-";
    const name = software.name || "";
    const version = software.version || "";
    return `${name} ${version}`.trim() || "-";
}

function setStatus(statusLabel) {
    latestStatus = statusLabel;
    statusEl.textContent = statusLabel || "unknown";
    statusEl.dataset.state = statusLabel || "unknown";
}

function canRunAction(action) {
    if (action === "refresh") return true;
    if (!latestStatus) return false;
    const allowed = allowedStatesByAction[action];
    return Boolean(allowed && allowed.has(latestStatus));
}

function applyButtonState() {
    actionButtons.forEach((button) => {
        const action = button.dataset.action;
        button.disabled = controlsLocked || isBusy || !canRunAction(action);
    });
}

async function callApi(path, options = {}) {
    const normalizedPath = String(path || "").replace(/^\/+/, "");
    const method = (options.method || "GET").toUpperCase();
    const requestInit = { method };
    let url = EXAROTON_BASE;

    if (method === "GET") {
        const query = new URLSearchParams({ path: normalizedPath });
        url = `${EXAROTON_BASE}?${query.toString()}`;
    } else {
        requestInit.headers = { "content-type": "application/json" };
        requestInit.body = JSON.stringify({ path: normalizedPath });
    }

    let response;
    try {
        response = await fetch(url, requestInit);
    } catch {
        throw new Error("Network error while contacting the control API");
    }

    let json;
    try {
        json = await response.json();
    } catch {
        if (response.status === 404) {
            const error = new Error(`Control API not found at ${PROXY_ENDPOINT} (404)`);
            error.isProxyMissing = true;
            throw error;
        }
        throw new Error(`Unexpected proxy response (${response.status})`);
    }

    if (!response.ok || !json.success) {
        throw new Error(json.error || `Request failed (${response.status})`);
    }

    return json.data;
}

async function listServers() {
    return callApi("servers/");
}

async function getWorkingServerId() {
    if (!activeServerId) {
        const servers = await listServers();
        if (!servers.length) {
            throw new Error("No servers found for this API token");
        }
        activeServerId = servers[0].id;
        return activeServerId;
    }

    try {
        await callApi(`servers/${activeServerId}/`);
        return activeServerId;
    } catch (error) {
        const message = String(error.message || "").toLowerCase();
        if (!message.includes("server not found")) {
            throw error;
        }

        const servers = await listServers();
        if (!servers.length) {
            throw new Error("Server not found and no servers are visible for this API token");
        }

        const fallback = servers[0];
        activeServerId = fallback.id;
        setNote(`configured id not found, switched to ${fallback.name} (${fallback.id})`);
        return activeServerId;
    }
}

async function refreshServer(options = {}) {
    const { silent = false } = options;
    if (!silent) {
        setNote("loading server info...");
    }

    const serverId = await getWorkingServerId();
    const data = await callApi(`servers/${serverId}/`);

    nameEl.textContent = data.name || serverId;
    setStatus(statusMap[data.status] || `status ${data.status}`);
    playersEl.textContent = `${data.players?.count ?? 0}/${data.players?.max ?? "-"}`;
    addressEl.textContent = data.address || "-";
    versionEl.textContent = formatSoftware(data.software);
    setUpdatedNow();
    applyButtonState();

    if (!silent) {
        setNote("ready");
    }
}

async function runAction(action) {
    setNote(`${action} requested...`);
    const serverId = await getWorkingServerId();
    await callApi(`servers/${serverId}/${action}/`, { method: "POST" });

    if (action === "start") {
        setStatus("starting");
    } else if (action === "stop") {
        setStatus("stopping");
    } else if (action === "restart") {
        setStatus("restarting");
    }
    applyButtonState();

    await refreshServer();
    window.setTimeout(() => {
        refreshServer({ silent: true }).catch(() => {});
    }, 3500);
}

function startPolling() {
    if (pollTimer) {
        window.clearInterval(pollTimer);
        pollTimer = null;
    }

    if (!autoRefreshEl.checked) {
        return;
    }

    pollTimer = window.setInterval(() => {
        if (isBusy || document.hidden) {
            return;
        }
        refreshServer({ silent: true }).catch((error) => {
            setNote(`auto refresh failed: ${error.message}`);
        });
    }, POLL_INTERVAL_MS);
}

actionButtons.forEach((button) => {
    button.addEventListener("click", async () => {
        const action = button.dataset.action;
        if (!action) return;

        isBusy = true;
        applyButtonState();

        try {
            if (action === "refresh") {
                await refreshServer();
            } else {
                await runAction(action);
            }
        } catch (error) {
            if (error.isProxyMissing) {
                disableControls("Control API missing. Deploy /api/exaroton and set EXAROTON_TOKEN.");
                return;
            }
            setNote(`error: ${error.message}`);
        } finally {
            isBusy = false;
            applyButtonState();
        }
    });
});

autoRefreshEl.addEventListener("change", () => {
    startPolling();
    setNote(autoRefreshEl.checked ? "auto refresh enabled" : "auto refresh paused");
});

document.addEventListener("visibilitychange", () => {
    if (document.hidden || !autoRefreshEl.checked || isBusy) {
        return;
    }
    refreshServer({ silent: true }).catch(() => {});
});

setStatus("");
applyButtonState();
refreshServer()
    .then(() => {
        startPolling();
    })
    .catch((error) => {
        if (error.isProxyMissing) {
            disableControls("Control API missing. Deploy /api/exaroton and set EXAROTON_TOKEN.");
            return;
        }
        setNote(`error: ${error.message}`);
        applyButtonState();
    });
