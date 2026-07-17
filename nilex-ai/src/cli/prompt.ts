import readline from "node:readline";

export function prompt(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

/** Reads `count` newline-separated values from stdin in one shot, for
 * non-interactive/piped input (`printf "a\nb\n" | nilex login`).
 *
 * Why not just call `prompt()` twice? Node's `readline.question()` only
 * arms a listener for the NEXT line event at the moment it's called. When
 * piped input delivers multiple lines in a single underlying chunk (the
 * common case), readline's internal parser emits 'line' events for all of
 * them as soon as the chunk arrives — but the second `question()` call
 * hasn't been made yet, so nothing is listening and that line is lost
 * forever, hanging the second prompt. Reading everything up front and
 * doling it out avoids the race entirely. */
export function readStdinLines(count: number): Promise<string[]> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    process.stdin.on("data", (chunk) => chunks.push(chunk));
    process.stdin.on("end", () => {
      const lines = Buffer.concat(chunks).toString("utf8").split(/\r?\n/);
      resolve(lines.slice(0, count));
    });
  });
}

const KEY_ENTER = 13;
const KEY_NEWLINE = 10;
const KEY_CTRL_D = 4;
const KEY_CTRL_C = 3;
const KEY_BACKSPACE = 127;

/** Masked-input prompt for a REAL interactive terminal only (no extra
 * dependency): reads raw keystrokes, echoes nothing back, resolves on
 * Enter. Compares by character code rather than embedding literal control
 * characters in string literals, which are invisible and easy to corrupt.
 * Piped/non-interactive stdin must use `readStdinLines` instead — see its
 * doc comment for why chaining readline prompts there doesn't work. */
export function promptPassword(question: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(question);
    const stdin = process.stdin;
    let password = "";

    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    const onData = (chunk: string) => {
      const char = chunk.toString();
      const code = char.charCodeAt(0);

      if (code === KEY_ENTER || code === KEY_NEWLINE || code === KEY_CTRL_D) {
        stdin.setRawMode?.(false);
        stdin.pause();
        stdin.removeListener("data", onData);
        process.stdout.write("\n");
        resolve(password);
        return;
      }

      if (code === KEY_CTRL_C) {
        process.stdout.write("\n");
        process.exit(1);
      }

      if (code === KEY_BACKSPACE) {
        password = password.slice(0, -1);
        return;
      }

      password += char;
    };

    stdin.on("data", onData);
  });
}
