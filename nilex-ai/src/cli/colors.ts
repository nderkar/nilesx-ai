// Hand-rolled ANSI helpers — no chalk dependency, matching the project's
// preference for zero-dependency UI primitives (see the hand-written SVG
// icons in the frontend). Disabled automatically when stdout isn't a TTY
// (piped into a file/another program) or NO_COLOR is set, per convention.
const enabled = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;

function wrap(code: string) {
  return (text: string) => (enabled ? `\x1b[${code}m${text}\x1b[0m` : text);
}

export const color = {
  red: wrap("31"),
  redBold: wrap("1;31"),
  amber: wrap("33"),
  green: wrap("32"),
  slate: wrap("90"),
  bold: wrap("1"),
  dim: wrap("2"),
};

export function priorityColor(priority: string, text: string): string {
  switch (priority) {
    case "HIGH":
      return color.red(text);
    case "MEDIUM":
      return color.amber(text);
    default:
      return color.slate(text);
  }
}

export function statusColor(status: string, text: string): string {
  switch (status) {
    case "IN_PROGRESS":
      return color.amber(text);
    case "COMPLETED":
      return color.green(text);
    default:
      return color.slate(text);
  }
}
