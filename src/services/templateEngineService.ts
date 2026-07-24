import Mustache from "mustache";
import { TemplateDefinition } from "../types/templateTypes";

// Disable HTML escaping so file content and path variables are never mangled.
Mustache.escape = (text: string) => text;

/**
 * Merges computed boolean entries into the raw parameter values object.
 * Each entry's expression is evaluated using `evaluateWhenExpression` against the
 * raw values only (never accumulated), so computed entries cannot reference each other.
 * The returned object is `{ ...rawValues, ...computedBooleans }` — computed values
 * spread last so they take precedence over any raw parameter with the same name.
 *
 * Pass the result of this function to `renderTemplate`, `renderTemplatePreview`, and
 * `evaluateWhenExpression` instead of passing raw parameter values directly.
 */
export function buildViewValues(
  template: TemplateDefinition,
  rawValues: Record<string, unknown>,
): Record<string, unknown> {
  const computed = template.computed;
  if (!computed || computed.length === 0) {
    return rawValues;
  }

  const computedBooleans: Record<string, boolean> = {};
  for (const entry of computed) {
    computedBooleans[entry.id] = evaluateWhenExpression(entry.expression, rawValues);
  }
  return { ...rawValues, ...computedBooleans };
}

/**
 * Renders a Mustache template string with the provided parameter values.
 * Used for both file content and file path/name templating.
 *
 * Variable tags (`{{...}}`) whose names are not present in `values` are left
 * unchanged in the output so that non-Mustache expressions – such as Azure
 * Pipelines `${{ expr }}` syntax – survive the rendering step intact.
 */
export function renderTemplate(templateStr: string, values: Record<string, unknown>): string {
  // Parse the template to discover all variable tags. For each tag whose name
  // does not resolve in `values`, record the exact position and original text
  // (including delimiters and any internal whitespace). Replace those occurrences
  // with unique sentinels before calling Mustache so they pass through as plain
  // text, then restore the original text in the rendered output.
  let tokens: ReturnType<typeof Mustache.parse>;
  try {
    tokens = Mustache.parse(templateStr);
  } catch {
    // Malformed template – fall back to standard rendering.
    return Mustache.render(templateStr, values);
  }

  const occurrences: Array<{ start: number; end: number; original: string }> = [];
  collectMissingVarOccurrences(tokens, values, templateStr, occurrences);

  if (occurrences.length === 0) {
    return Mustache.render(templateStr, values);
  }

  // Build a modified template by replacing each missing-variable occurrence with a
  // sentinel. Process in ascending position order so we can always slice from the
  // original string.
  occurrences.sort((a, b) => a.start - b.start);

  const sentinelMap: [string, string][] = [];
  let modifiedTemplate = "";
  let lastEnd = 0;

  for (let i = 0; i < occurrences.length; i++) {
    const { start, end, original } = occurrences[i];
    const sentinel = `\x00${i}\x00`;
    sentinelMap.push([sentinel, original]);
    modifiedTemplate += templateStr.slice(lastEnd, start) + sentinel;
    lastEnd = end;
  }
  modifiedTemplate += templateStr.slice(lastEnd);

  let result = Mustache.render(modifiedTemplate, values);

  // Restore each sentinel to the exact original tag text (preserving whitespace).
  for (const [sentinel, original] of sentinelMap) {
    result = result.split(sentinel).join(original);
  }

  return result;
}

/**
 * Renders a Mustache template string for live previews (e.g. hints, notes, summary panel).
 * Parameters that are empty, null, or undefined are kept as their raw `{{paramId}}` tag
 * so the user can see the placeholder until the field is filled in.
 * Tags that do not correspond to any known parameter are also preserved unchanged.
 */
export function renderTemplatePreview(templateStr: string | undefined, values: Record<string, unknown>): string {
  if (!templateStr) {
    return "";
  }

  const previewValues: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(values)) {
    previewValues[key] = val !== undefined && val !== null && val !== "" ? val : `{{${key}}}`;
  }
  // Use renderTemplate so that {{...}} patterns not matching any scaffolding
  // parameter (e.g. Azure Pipelines expressions) are preserved as-is.
  return renderTemplate(templateStr, previewValues);
}

// ─── Missing-variable preservation helpers ────────────────────────────────────

/**
 * Walks a Mustache token tree and appends to `occurrences` an entry for every
 * variable tag whose name cannot be resolved from `values`. Each entry records
 * the start/end positions in `templateStr` so the caller can extract the exact
 * original text (including delimiters and any internal whitespace).
 */
function collectMissingVarOccurrences(
  tokens: ReturnType<typeof Mustache.parse>,
  values: Record<string, unknown>,
  templateStr: string,
  occurrences: Array<{ start: number; end: number; original: string }>,
): void {
  for (const token of tokens) {
    const type = token[0] as string;
    const name = token[1] as string;
    const start = token[2] as number;
    const end = token[3] as number;

    if ((type === "name" || type === "&") && !resolvesMustacheVar(name, values)) {
      occurrences.push({ start, end, original: templateStr.slice(start, end) });
    }

    // Recurse into section children (token[4] for "#" and "^" tokens).
    const children = token[4] as ReturnType<typeof Mustache.parse> | undefined;
    if (Array.isArray(children)) {
      collectMissingVarOccurrences(children, values, templateStr, occurrences);
    }
  }
}

/**
 * Returns true if the (potentially dotted) variable path resolves to a defined
 * value in `values`, mirroring the traversal logic Mustache.js applies internally.
 */
function resolvesMustacheVar(name: string, values: Record<string, unknown>): boolean {
  // The implicit iterator and "this" are always considered resolved.
  if (name === "." || name === "this") {
    return true;
  }

  const parts = name.split(".");
  let current: unknown = values;

  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") {
      return false;
    }
    if (!(part in (current as Record<string, unknown>))) {
      return false;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return true;
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
  } catch (err) {
    // If we cannot parse the expression, default to showing the field
    console.error(`Invalid 'when' expression "${expression}":`, err);
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

    if (op === "==") {
      return lhs === rhs;
    }
    if (op === "!=") {
      return lhs !== rhs;
    }
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
  if (raw === "true") {
    return true;
  }

  if (raw === "false") {
    return false;
  }

  if (raw === "null") {
    return null;
  }

  if (raw === "undefined") {
    return undefined;
  }

  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    return raw.slice(1, -1);
  }

  const num = Number(raw);
  if (!isNaN(num)) {
    return num;
  }

  return raw;
}
