const { spawn } = require('child_process');
const { get } = require('http');

const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;

console.log("Starting server for testing...");
const server = spawn('node', ['server.js'], {
    stdio: ['ignore', 'inherit', 'inherit'] // Pipe stdout/stderr to parent
});

// Handle server unexpected exit
server.on('exit', (code) => {
    if (code !== null && code !== 0) {
        console.error(`Server exited unexpectedly with code ${code}`);
        process.exit(1);
    }
});

function waitForServer(retries = 10) {
    return new Promise((resolve, reject) => {
        if (retries === 0) return reject(new Error("Server failed to start in time"));

        const req = get(BASE_URL, (res) => {
            // Consume data to free memory
            res.resume();
            if (res.statusCode === 200) {
                resolve();
            } else {
                reject(new Error(`Server returned status ${res.statusCode}`));
            }
        });

        req.on('error', () => {
            setTimeout(() => {
                waitForServer(retries - 1).then(resolve).catch(reject);
            }, 1000);
        });
        req.end();
    });
}

async function runTests() {
    try {
        await waitForServer();
        console.log("✅ Server is up and running");

        // Test 1: Check index.html
        await new Promise((resolve, reject) => {
            get(BASE_URL, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    if (data.includes('<title>Gemini Chatbot')) {
                        console.log("✅ served index.html correctly");
                        resolve();
                    } else {
                        reject(new Error("index.html content mismatch"));
                    }
                });
            }).on('error', reject);
        });

        console.log("All tests passed!");
        server.kill();
        process.exit(0);

    } catch (error) {
        console.error("❌ Tests failed:", error.message);
        server.kill();
        process.exit(1);
    }
}

runTests();
