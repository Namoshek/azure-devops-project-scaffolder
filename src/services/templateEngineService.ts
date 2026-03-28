import * as Handlebars from "handlebars";

/**
 * Renders a Handlebars template string with the provided parameter values.
 * Used for both file content and file path/name templating.
 */
export function renderTemplate(templateStr: string, values: Record<string, unknown>): string {
  const compiled = Handlebars.compile(templateStr, { noEscape: true });
  return compiled(values);
}

/**
 * Evaluates a simple boolean `when` expression against the current parameter values.
 *
 * Supported syntax (intentionally minimal and safe — no eval()):
 *   - `paramId == "value"` or `paramId == true`
 *   - `paramId != "value"` or `paramId != false`
 *   - `paramId`              (truthy check)
 *   - `!paramId`             (falsy check)
 *   - Combined with `&&` and `||`
 *
 * Returns true if the expression is satisfied (field should be visible).
 */
export function evaluateWhenExpression(expression: string, values: Record<string, unknown>): boolean {
  try {
    return evalOr(expression.trim(), values);
  } catch {
    // If we cannot parse the expression, default to showing the field
    return true;
  }
}

// ─── Expression evaluator ──────────────────────────────────────────────────────

function evalOr(expr: string, values: Record<string, unknown>): boolean {
  const parts = splitTopLevel(expr, "||");
  if (parts.length > 1) {
    return parts.some((p) => evalAnd(p.trim(), values));
  }
  return evalAnd(expr, values);
}

function evalAnd(expr: string, values: Record<string, unknown>): boolean {
  const parts = splitTopLevel(expr, "&&");
  if (parts.length > 1) {
    return parts.every((p) => evalAtom(p.trim(), values));
  }
  return evalAtom(expr, values);
}

function evalAtom(expr: string, values: Record<string, unknown>): boolean {
  expr = expr.trim();

  // NOT prefix
  if (expr.startsWith("!") && !expr.startsWith("!=")) {
    return !evalAtom(expr.slice(1).trim(), values);
  }

  // Equality / inequality
  const eqMatch = expr.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*(==|!=)\s*(.+)$/);
  if (eqMatch) {
    const [, id, op, rawValue] = eqMatch;
    const lhs = values[id];
    const rhs = parseLiteral(rawValue.trim());

    if (op === "==") return lhs === rhs;
    if (op === "!=") return lhs !== rhs;
  }

  // Plain identifier (truthy check)
  const idMatch = expr.match(/^[a-zA-Z_][a-zA-Z0-9_]*$/);
  if (idMatch) {
    return Boolean(values[expr]);
  }

  // Parenthetical
  if (expr.startsWith("(") && expr.endsWith(")")) {
    return evalOr(expr.slice(1, -1), values);
  }

  // Fall back to truthy
  return Boolean(expr);
}

/** Split by a binary operator, but only at the top level (not inside parens or quotes). */
function splitTopLevel(expr: string, operator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let inString = false;
  let stringChar = "";
  let current = "";
  let i = 0;

  while (i < expr.length) {
    const ch = expr[i];

    if (inString) {
      current += ch;
      if (ch === stringChar) inString = false;
      i++;
      continue;
    }

    if (ch === '"' || ch === "'") {
      inString = true;
      stringChar = ch;
      current += ch;
      i++;
      continue;
    }

    if (ch === "(") {
      depth++;
      current += ch;
      i++;
      continue;
    }
    if (ch === ")") {
      depth--;
      current += ch;
      i++;
      continue;
    }

    if (depth === 0 && expr.slice(i, i + operator.length) === operator) {
      parts.push(current);
      current = "";
      i += operator.length;
      continue;
    }

    current += ch;
    i++;
  }

  parts.push(current);
  return parts;
}

/** Parse a stringified literal into a JS value. */
function parseLiteral(raw: string): unknown {
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw === "null") return null;
  if (raw === "undefined") return undefined;
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    return raw.slice(1, -1);
  }
  const num = Number(raw);
  if (!isNaN(num)) return num;
  return raw;
}
