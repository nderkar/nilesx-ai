// Not part of the shipped product — drives AgentSession directly with a
// scripted multi-turn conversation, no readline/stdin involved. This is the
// right way to test a multi-turn conversation programmatically; piping
// canned input into the interactive REPL fights its line-by-line design.
// Run with: npm run test:agent
import { AgentSession } from "./agentSession.js";
import { loadEnv } from "../lib/loadEnv.js";

loadEnv();

const script = [
  "log me in as admin@example.com, password password123",
  "what tasks do I have open right now?",
  "create a task titled 'Draft Q3 board deck', assign it to Sam Member",
  "now show me every task assigned to Sam Member",
];

async function main() {
  const session = new AgentSession();
  try {
    for (const line of script) {
      console.log(`\nyou> ${line}`);
      const reply = await session.sendMessage(line);
      console.log(`nilex> ${reply}`);
    }
  } finally {
    await session.close();
  }
}

main().catch((err) => {
  console.error("Agent test failed:", err);
  process.exit(1);
});
