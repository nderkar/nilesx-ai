interface Rule {
  method: string;
  pattern: RegExp;
  label: string;
}

// Order matters: more specific patterns (e.g. /tasks/:id/start) must come
// before the generic /tasks/:id PATCH/DELETE rules.
const RULES: Rule[] = [
  { method: "POST", pattern: /^\/auth\/login$/, label: "Logged in" },

  { method: "POST", pattern: /^\/tasks$/, label: "Created a task" },
  { method: "PATCH", pattern: /^\/tasks\/[^/]+\/assign$/, label: "Assigned a task" },
  { method: "POST", pattern: /^\/tasks\/[^/]+\/start$/, label: "Started a task" },
  { method: "POST", pattern: /^\/tasks\/[^/]+\/complete$/, label: "Completed a task" },
  { method: "PATCH", pattern: /^\/tasks\/[^/]+$/, label: "Updated a task" },
  { method: "DELETE", pattern: /^\/tasks\/[^/]+$/, label: "Deleted a task" },

  { method: "POST", pattern: /^\/users$/, label: "Created a user" },
  { method: "PATCH", pattern: /^\/users\/[^/]+\/role$/, label: "Changed a user's role" },
  { method: "PATCH", pattern: /^\/users\/[^/]+$/, label: "Updated a user" },
  { method: "DELETE", pattern: /^\/users\/[^/]+$/, label: "Deleted a user" },

  { method: "POST", pattern: /^\/roles$/, label: "Created a role" },
  { method: "PATCH", pattern: /^\/roles\/[^/]+$/, label: "Updated a role" },
  { method: "DELETE", pattern: /^\/roles\/[^/]+$/, label: "Deleted a role" },

  { method: "PATCH", pattern: /^\/tool-settings\/[^/]+$/, label: "Toggled a tool setting" },
];

export function describeActivity(method: string, path: string): string {
  const rule = RULES.find((r) => r.method === method && r.pattern.test(path));
  return rule ? rule.label : `${method} ${path}`;
}
