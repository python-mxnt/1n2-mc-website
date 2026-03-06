const EXAROTON_BASE = "/api/exaroton?path=";
const SERVER_ID = "2w6bIMJ82X4o9zol";

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

const note = document.getElementById("server-note");
const statusEl = document.getElementById("server-status");
const playersEl = document.getElementById("server-players");
const addressEl = document.getElementById("server-address");
const versionEl = document.getElementById("server-version");
const actionButtons = document.querySelectorAll(".server-actions button");

async function callApi(path) {
    const response = await fetch(`${EXAROTON_BASE}${path}`);
    const json = await response.json();

    if (!json.success) {
        throw new Error(json.error || "Request failed");
    }

    return json.data;
}

async function refreshServer() {
    note.textContent = "loading server info...";
    const data = await callApi(`/servers/${SERVER_ID}`);

    const statusLabel = statusMap[data.status] || `status ${data.status}`;
    statusEl.textContent = statusLabel;
    playersEl.textContent = `${data.players.count}/${data.players.max}`;
    addressEl.textContent = data.address || "-";
    versionEl.textContent = `${data.software.name} ${data.software.version}`;

    note.textContent = "ready";
}

async function runAction(action) {
    note.textContent = `${action}...`;
    await callApi(`/servers/${SERVER_ID}/${action}/`);
    await refreshServer();
}

actionButtons.forEach((button) => {
    button.addEventListener("click", async () => {
        const action = button.dataset.action;
        actionButtons.forEach((btn) => (btn.disabled = true));

        try {
            if (action === "refresh") {
                await refreshServer();
            } else {
                await runAction(action);
            }
        } catch (error) {
            note.textContent = `error: ${error.message}`;
        } finally {
            actionButtons.forEach((btn) => (btn.disabled = false));
        }
    });
});

refreshServer().catch((error) => {
    note.textContent = `error: ${error.message}`;
});
