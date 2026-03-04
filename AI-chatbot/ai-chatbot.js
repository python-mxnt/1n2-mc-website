const API_URL = "https://novae-ai.verxateam.workers.dev/";

const form = document.getElementById("chat-form");
const input = document.getElementById("chat-input");
const log = document.getElementById("chat-log");
const sendButton = document.getElementById("send-button");

function addMessage(text, role) {
    const message = document.createElement("div");
    message.className = `message ${role}`;
    message.textContent = text;
    log.appendChild(message);
    log.scrollTop = log.scrollHeight;
}

async function fetchReply(message) {
    const body = JSON.stringify({ prompt: message });

    const response = await fetch(API_URL, {
        method: "POST",
        body
    });

    if (!response.ok) {
        let errorText = "";
        try {
            errorText = await response.text();
        } catch {
            errorText = "";
        }
        throw new Error(`AI request failed: ${response.status} ${errorText}`.trim());
    }

    const data = await response.json();
    return data.response || "no response";
}

form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const message = input.value.trim();
    if (!message) return;

    addMessage(message, "user");
    input.value = "";
    input.focus();

    sendButton.disabled = true;
    addMessage("typing...", "system");

    try {
        const reply = await fetchReply(message);
        const typing = log.querySelector(".message.system:last-child");
        if (typing) typing.remove();
        addMessage(reply, "ai");
    } catch (error) {
        const typing = log.querySelector(".message.system:last-child");
        if (typing) typing.remove();
        addMessage(`could not reach the AI right now. ${error.message}`, "system");
        console.error(error);
    } finally {
        sendButton.disabled = false;
    }
});

addMessage("send a message to start chatting.", "system");
