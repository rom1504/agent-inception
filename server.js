require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const app = express();
const port = 3000;

app.use(bodyParser.json());
app.use(express.static('public'));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Tool definition
function fibonacci(n) {
    if (n <= 1) return n;
    let a = 0, b = 1;
    for (let i = 2; i <= n; i++) {
        let temp = a + b;
        a = b;
        b = temp;
    }
    return b;
}

function listFiles(path = '.') {
    try {
        // Simple security check to prevent going out of project root for this demo
        if (path.includes('..')) {
            return "Error: Access to parent directories is restricted.";
        }
        const files = fs.readdirSync(path);
        return files.join('\n');
    } catch (error) {
        return `Error listing files: ${error.message}`;
    }
}

function findFiles(pattern, searchPath = '.', type = 'all') {
    try {
        if (searchPath.includes('..') || pattern.includes('..') || pattern.includes('|') || pattern.includes(';') || pattern.includes('&')) {
             return "Error: Invalid characters or path traversal detected.";
        }
        
        let typeFlag = '';
        if (type === 'file') typeFlag = '-type f';
        else if (type === 'directory') typeFlag = '-type d';

        // Using 'find' command (works on Linux/Mac, might need adjustment for Windows)
        // Using execSync for simplicity in this demo
        // Added -maxdepth 5 to prevent taking too long on large directories if not specified
        // Removing maxdepth as it might be too restrictive for deep node_modules
        const command = `find ${searchPath} -name "${pattern}" ${typeFlag} 2>/dev/null | head -n 20`;
        
        const result = execSync(command).toString();
        return result || "No matches found.";
    } catch (error) {
        return `Error finding files: ${error.message}`;
    }
}

const tools = [
    {
        functionDeclarations: [
            {
                name: "fibonacci",
                description: "Calculates the nth Fibonacci number.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        n: {
                            type: "NUMBER",
                            description: "The position in the Fibonacci sequence (0-based index)."
                        }
                    },
                    required: ["n"]
                }
            },
            {
                name: "listFiles",
                description: "Lists files and directories in the current directory or a subdirectory.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        path: {
                            type: "STRING",
                            description: "The relative path to list files from (default is current directory '.')."
                        }
                    },
                    required: []
                }
            },
            {
                name: "findFiles",
                description: "Searches for files or directories matching a pattern recursively.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        pattern: {
                            type: "STRING",
                            description: "The glob pattern or filename to search for (e.g., '*.js', 'server.js')."
                        },
                        searchPath: {
                            type: "STRING",
                            description: "The directory to start searching from (default is '.')."
                        },
                        type: {
                            type: "STRING",
                            description: "The type of item to search for. Can be 'file', 'directory', or 'all'. Default is 'all'.",
                            enum: ["file", "directory", "all"]
                        }
                    },
                    required: ["pattern"]
                }
            }
        ]
    }
];

// Remove global model instance since we create it per request now
// const model = genAI.getGenerativeModel({
//     model: "gemini-2.5-flash",
//     tools: tools,
//     generationConfig: {
//         thinkingConfig: {
//             includeThoughts: true,
//             thinkingBudget: 1024
//         }
//     }
// });

const functions = {
    fibonacci: ({ n }) => fibonacci(n),
    listFiles: ({ path }) => listFiles(path || '.'),
    findFiles: ({ pattern, searchPath, type }) => findFiles(pattern, searchPath || '.', type || 'all')
};

app.post('/chat', async (req, res) => {
    try {
        const { history, message, model: modelName } = req.body;
        
        // Choose model config based on selection
        const selectedModelName = modelName || "gemini-2.5-flash";
        
        const modelConfig = {
            model: selectedModelName,
            tools: tools,
            generationConfig: {
                thinkingConfig: {
                    includeThoughts: true,
                    thinkingBudget: selectedModelName.includes('flash') ? 1024 : undefined,
                    thinkingLevel: selectedModelName.includes('pro') ? 'low' : undefined
                }
            }
        };
        
        // Clean up undefined properties
        if (!modelConfig.generationConfig.thinkingConfig.thinkingBudget) delete modelConfig.generationConfig.thinkingConfig.thinkingBudget;
        if (!modelConfig.generationConfig.thinkingConfig.thinkingLevel) delete modelConfig.generationConfig.thinkingConfig.thinkingLevel;

        const model = genAI.getGenerativeModel(modelConfig);

        // Set headers for streaming
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Transfer-Encoding', 'chunked');

        const chat = model.startChat({
            history: history || [],
        });

        // Helper to send JSON chunks
        const sendChunk = (type, data) => {
            res.write(JSON.stringify({ type, data }) + "\n");
        };

        // Function to handle the stream processing
        async function processStream(result) {
            let functionCall = null;
            
            for await (const chunk of result.stream) {
                const candidates = chunk.candidates;
                if (!candidates || candidates.length === 0) continue;
                
                const parts = candidates[0].content.parts;
                
                for (const part of parts) {
                    if (part.thought) {
                        // It's a thought
                        sendChunk('thought', part.text);
                    } else if (part.functionCall) {
                        // It's a function call
                        functionCall = part.functionCall;
                    } else if (part.text) {
                        // It's a regular answer
                        sendChunk('text', part.text);
                    }
                }
            }
            
            return functionCall;
        }

        // Helper to retry stream initiation
        async function sendMessageStreamWithRetry(chat, msg, maxRetries = 3) {
            for (let i = 0; i < maxRetries; i++) {
                try {
                    return await chat.sendMessageStream(msg);
                } catch (error) {
                    if (error.status === 503 && i < maxRetries - 1) {
                        console.log(`Got 503, retrying... (${i + 1}/${maxRetries})`);
                        await new Promise(resolve => setTimeout(resolve, 2000 * (i + 1)));
                        continue;
                    }
                    throw error;
                }
            }
        }

        // Initial message
        let result = await sendMessageStreamWithRetry(chat, message);
        let functionCall = await processStream(result);
        
        // IMPORTANT: Wait for the full response to be processed by the SDK 
        // to ensure the conversation history is correctly updated before sending the next message.
        await result.response;

        // Loop to handle sequential tool calls
        while (functionCall) {
            const functionName = functionCall.name;
            const args = functionCall.args;

            if (functions[functionName]) {
                const functionResponse = functions[functionName](args);
                
                // Notify client about tool execution
                sendChunk('tool', {
                    name: functionName,
                    args: args,
                    result: functionResponse
                });

                // Send result back to model
                result = await sendMessageStreamWithRetry(chat, [{
                    functionResponse: {
                        name: functionName,
                        response: { result: functionResponse }
                    }
                }]);
                
                // Process the new stream (post-tool)
                functionCall = await processStream(result);
                await result.response; // Ensure history is updated
            } else {
                // Handle unknown tool
                sendChunk('error', `Unknown tool: ${functionName}`);
                break;
            }
        }

        // Send updated history at the end
        const newHistory = await chat.getHistory();
        sendChunk('history', newHistory);
        res.end();

    } catch (error) {
        console.error("Error:", error);
        // If headers already sent, we can only write a chunk
        if (res.headersSent) {
            res.write(JSON.stringify({ type: 'error', data: error.message }) + "\n");
            res.end();
        } else {
            // If we haven't sent headers yet, but we set Transfer-Encoding above,
            // res.json() might conflict. Safer to just use write.
            if (!res.headersSent) {
                 // Ensure headers are set if they weren't (though we set them at start)
                 // If we set them at start, headersSent is false until we write.
                 // But we already set them.
            }
            res.write(JSON.stringify({ type: 'error', data: error.message }) + "\n");
            res.end();
        }
    }
});

// Helper to extract history in a serializable format if needed, 
// though client usually manages history state or we just pass what Gemini returns.
// For simplicity in this "stateless" REST API, we might just return the text.
// However, `model.startChat` manages state in-memory for the instance. 
// Since this is a REST API, we should ideally pass history back and forth or use a session.
// For this demo, I'll assume the client sends the full history formatted for Gemini.
// Wait, `chat.sendMessage` updates the internal history. 
// The client sends `history` which we pass to `startChat`.
// We need to return the updated history to the client so they can send it back next time.

async function getHistory(chat) {
    return await chat.getHistory();
}

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
