const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const chatMessages = document.getElementById('chat-messages');
const modelSelect = document.getElementById('model-select');
const stopButton = document.getElementById('stop-button');

let history = [];
let controller = null; // AbortController for current request

function addMessage(text, sender) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', sender);
    messageDiv.textContent = text;
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addToolMessage(tool) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', 'tool');
    
    const toolName = document.createElement('div');
    toolName.classList.add('tool-name');
    toolName.textContent = `🛠️ Used tool: ${tool.name}`;
    
    const toolDetails = document.createElement('pre');
    toolDetails.classList.add('tool-details');
    toolDetails.textContent = `Args: ${JSON.stringify(tool.args)}\nResult: ${JSON.stringify(tool.result)}`;
    
    messageDiv.appendChild(toolName);
    messageDiv.appendChild(toolDetails);
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function sendMessage() {
    const message = messageInput.value.trim();
    if (message === "") return;

    addMessage(message, 'user');
    messageInput.value = '';
    messageInput.disabled = true;
    sendButton.disabled = true;
    stopButton.disabled = false;

    // Create new AbortController
    controller = new AbortController();
    const signal = controller.signal;

    try {
        const response = await fetch('/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: message,
                history: history,
                model: modelSelect.value
            }),
            signal: signal
        });

        if (!response.ok) {
            throw new Error(`Server error: ${response.statusText}`);
        }

        // Start reading the stream
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        
        let currentBotMessageDiv = null;
        let currentThoughtsDiv = null;
        let currentTextContent = null;

        // Helper to ensure we have a message bubble
        const ensureBotMessage = () => {
            if (!currentBotMessageDiv) {
                currentBotMessageDiv = document.createElement('div');
                currentBotMessageDiv.classList.add('message', 'bot');
                chatMessages.appendChild(currentBotMessageDiv);
                currentTextContent = document.createElement('span');
                currentBotMessageDiv.appendChild(currentTextContent);
                chatMessages.scrollTop = chatMessages.scrollHeight;
            }
        };

        // Helper to ensure we have a thoughts section
        const ensureThoughts = () => {
            ensureBotMessage();
            if (!currentThoughtsDiv) {
                currentThoughtsDiv = document.createElement('div');
                currentThoughtsDiv.classList.add('thoughts');
                // Insert thoughts before text content
                currentBotMessageDiv.insertBefore(currentThoughtsDiv, currentTextContent);
            }
        };

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop(); // Keep the incomplete line in buffer

            for (const line of lines) {
                if (!line.trim()) continue;
                
                try {
                    const chunk = JSON.parse(line);
                    
                    if (chunk.type === 'thought') {
                        ensureThoughts();
                        currentThoughtsDiv.textContent += chunk.data;
                        chatMessages.scrollTop = chatMessages.scrollHeight;
                    } else if (chunk.type === 'text') {
                        ensureBotMessage();
                        currentTextContent.textContent += chunk.data;
                        chatMessages.scrollTop = chatMessages.scrollHeight;
                    } else if (chunk.type === 'tool') {
                        // If we have a current message, finish it (visually) and create a new tool bubble
                        currentBotMessageDiv = null; // Reset so next text creates new bubble
                        currentThoughtsDiv = null;
                        currentTextContent = null;
                        addToolMessage(chunk.data);
                    } else if (chunk.type === 'history') {
                        history = chunk.data;
                    } else if (chunk.type === 'error') {
                         addMessage(`Error: ${chunk.data}`, 'bot');
                    }
                } catch (e) {
                    console.error("Error parsing JSON chunk", e);
                }
            }
        }

    } catch (error) {
        if (error.name === 'AbortError') {
            addMessage('🛑 Request stopped by user.', 'bot');
            console.log('Fetch aborted');
        } else {
            console.error("Error sending message:", error);
            addMessage("Sorry, something went wrong.", 'bot');
        }
    } finally {
        messageInput.disabled = false;
        sendButton.disabled = false;
        stopButton.disabled = true;
        messageInput.focus();
        controller = null;
    }
}

function stopRequest() {
    if (controller) {
        controller.abort();
    }
}

sendButton.addEventListener('click', sendMessage);
stopButton.addEventListener('click', stopRequest);

messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});
