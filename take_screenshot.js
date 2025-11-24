const puppeteer = require('puppeteer');

(async () => {
  try {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    
    // Set a reasonable viewport
    await page.setViewport({ width: 1280, height: 800 });

    console.log("Navigating to localhost:3000...");
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });

    console.log("Typing message...");
    const prompt = "combine find and ls tool to list the files in the first directory that is named cat in /home/rom1504";
    await page.type('#message-input', prompt);

    console.log("Sending message...");
    await page.click('#send-button');

    console.log("Waiting for response...");
    // Wait for the "Used tool" message to appear
    await page.waitForSelector('.message.tool', { timeout: 10000 });
    
    // Wait for the final text response (simple heuristic: wait for network idle again or a specific amount of time)
    // Since it streams, networkidle might trigger early if chunks are slow, but usually they are keep-alive.
    // Let's wait for the "Thinking Process" to potentially finish or just wait a fixed buffer.
    // Better: wait for the text "black.png" which we know appears in the result.
    try {
        await page.waitForFunction(
            () => document.body.innerText.includes('black.png'),
            { timeout: 20000 }
        );
    } catch (e) {
        console.log("Timed out waiting for specific text, taking screenshot anyway.");
    }

    // Give it a little extra moment for the UI to settle
    await new Promise(r => setTimeout(r, 1000));

    console.log("Taking screenshot...");
    await page.screenshot({ path: 'chat_screenshot.png', fullPage: false });

    await browser.close();
    console.log("Done!");
  } catch (e) {
    console.error("Error:", e);
    process.exit(1);
  }
})();
