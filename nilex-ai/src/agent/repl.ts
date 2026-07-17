import readline from "node:readline";
import { AgentSession } from "./agentSession.js";
import { loadEnv } from "../lib/loadEnv.js";

loadEnv();

async function main() {
  console.log("Nilex AI — chat with your task platform in plain English.");
  console.log("Nothing is authenticated yet — try: \"log me in as admin@example.com, password password123\"");
  console.log("Type 'exit' to quit.\n");

  const session = new AgentSession();
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  // On piped/non-TTY stdin, the Interface auto-closes as soon as the
  // underlying stream hits EOF — which can happen while we're still
  // awaiting a slow Claude API call for the previous line. Without this
  // guard, the next ask() call's rl.question() throws ERR_USE_AFTER_CLOSE.
  // A real interactive terminal won't naturally hit EOF mid-conversation,
  // but Ctrl+D while a reply is pending would trigger the same race.
  let closed = false;
  rl.on("close", () => {
    closed = true;
  });

  async function ask() {
    if (closed) {
      await session.close();
      return;
    }
    rl.question("you> ", async (line) => {
      const text = line.trim();
      if (!text) {
        ask();
        return;
      }
      if (text === "exit" || text === "quit") {
        await session.close();
        rl.close();
        return;
      }
      try {
        const reply = await session.sendMessage(text);
        console.log(`\nnilex> ${reply}\n`);
      } catch (err) {
        console.error("Error:", err instanceof Error ? err.message : err);
      }
      if (closed) {
        await session.close();
        return;
      }
      ask();
    });
  }

  ask();
}

main();
