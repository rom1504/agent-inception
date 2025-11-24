# Agent Inception: Building an Agentic Harness for Gemini 3 with Amp

*By Romain Beaumont and Amp and Gemini 3 on 24/11/2025*

In this post, we explore how we utilized **Amp**, a sophisticated AI coding agent, to build a complete agentic chatbot harness for Google's latest **Gemini 3** models in record time.

We call this project **"Agent Inception"** because it represents a recursive leap in AI development: using an AI agent to construct the environment for another AI agent.

The goal was not just to build a chat interface, but to create a **meta-harness**—a flexible environment where the AI is not just a text generator, but an agent capable of thinking, planning, and acting on the world (or at least, the file system).

## The "Meta-Harness" Concept

When working with frontier models like Gemini 3 Pro, simply hitting an API endpoint isn't enough. To unlock their true potential, we needed a system that supports:

1.  **Tools:** The ability for the model to execute code or commands.
2.  **Thinking:** Visibility into the model's hidden "chain of thought".
3.  **Feedback Loops:** A mechanism for the model to see the result of its actions and decide what to do next.

Here is what we built.

## Key Capabilities

### 1. Thinking Process Visualization
One of the most exciting features of Gemini 3 is its ability to "think" before it speaks. We implemented a streaming architecture that captures these thought tokens.

On the frontend, we parse the incoming JSON stream chunks. If a chunk is tagged as `thought`, it gets rendered into a collapsible "Thinking Process" box. This provides users with transparency into *how* the model is solving the problem, not just the solution.

### 2. Tool Calling & Sequential Execution
We gave the model access to real tools:
*   **`fibonacci`**: A computational tool to test math reasoning.
*   **`findFiles` & `listFiles`**: System tools to interact with the local environment.

Crucially, we implemented **sequential tool execution** in the backend. If you ask:
> *"Find the 'cat' directory and list the files inside it."*

The backend loop handles this interaction autonomously:
1.  Model calls `findFiles("cat")`.
2.  Server executes `find` and returns the path.
3.  Model receives the path, analyzes it, and decides to call `listFiles(path)`.
4.  Server executes `ls` and returns the file list.
5.  Model formulates the final answer.

All of this happens in a single user-turn, creating a seamless agentic experience.

### 3. Dual Model Architecture
Different tasks require different brains. We added a dynamic selector allowing users to switch between:
*   **Gemini 2.5 Flash**: Extremely fast, perfect for quick queries and simple tool use. We tailored the `thinkingBudget` to 1024 tokens for optimal speed.
*   **Gemini 3 Pro**: The heavy hitter. We configured this with `thinkingLevel: "low"` (which is still quite deep!) for complex reasoning tasks.

## How Amp Helped

Building this required stitching together several components:
*   **Node.js/Express Backend**: Handling the Gemini API, managing conversation history, and executing safe(ish) system commands.
*   **Streaming Pipeline**: Manually handling chunked transfer encoding to ensure thoughts and tool results appear instantly on the client.
*   **Vanilla JS Frontend**: A lightweight, dependency-free UI that renders the complex stream of thoughts, tool inputs/outputs, and chat messages.

Amp was able to scaffold the project, implement the complex streaming logic, debug API errors (like the tricky 503 retry logic and history synchronization issues), and refine the UI styles iteratively.

This collaboration demonstrates the power of **meta-agentic development**: Amp (the builder agent) understanding and implementing the requirements for Gemini (the user agent), effectively bootstrapping a more advanced intelligence system.

## Conclusion

This project serves as a template for what's possible when combining powerful reasoning models with capable coding agents. We essentially used an AI (Amp) to build a home for another AI (Gemini), resulting in a tool that makes the advanced capabilities of Gemini 3 accessible and visible.

Check out the code in the repository to see how the streaming parser and tool loop are implemented!
