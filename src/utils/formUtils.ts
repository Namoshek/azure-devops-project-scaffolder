import { TemplateParameter } from "../types/templateTypes";
import { evaluateWhenExpression } from "../services/templateEngineService";

export interface ParameterGroup {
  /** Group title, or `undefined` for the implicit ungrouped bucket. */
  title: string | undefined;
  params: TemplateParameter[];
}

/**
 * Splits an ordered list of visible parameters into display groups.
 * Parameters with a `formGroup` value are placed into named buckets in
 * first-appearance order. Parameters without `formGroup` are collected into
 * an implicit ungrouped bucket that is appended at the end. The ungrouped
 * bucket is omitted entirely when all parameters belong to a named group.
 */
export function groupParameters(params: TemplateParameter[]): ParameterGroup[] {
  const namedGroups = new Map<string, TemplateParameter[]>();
  const ungrouped: TemplateParameter[] = [];

  for (const param of params) {
    if (param.formGroup) {
      const existing = namedGroups.get(param.formGroup);
      if (existing) {
        existing.push(param);
      } else {
        namedGroups.set(param.formGroup, [param]);
      }
    } else {
      ungrouped.push(param);
    }
  }

  const result: ParameterGroup[] = [];
  for (const [title, groupParams] of namedGroups) {
    result.push({ title, params: groupParams });
  }
  if (ungrouped.length > 0) {
    result.push({ title: undefined, params: ungrouped });
  }
  return result;
}

export function buildDefaults(parameters: TemplateParameter[]): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  for (const p of parameters) {
    if (p.defaultValue !== undefined) {
      defaults[p.id] = p.defaultValue;
    } else if (p.type === "boolean") {
      defaults[p.id] = false;
    } else if (p.type === "choice" && p.options && p.options.length > 0) {
      defaults[p.id] = p.options[0];
    } else {
      defaults[p.id] = "";
    }
  }
  return defaults;
}

export function validate(parameters: TemplateParameter[], values: Record<string, unknown>): Record<string, string> {
  const errs: Record<string, string> = {};

  for (const parameter of parameters) {
    // Skip validation for parameters that are not currently visible due to "when" conditions.
    if (parameter.when && !evaluateWhenExpression(parameter.when, values)) {
      continue;
    }

    const value = values[parameter.id];

    if (parameter.required) {
      if (parameter.type === "string" && (value === "" || value === undefined || value === null)) {
        errs[parameter.id] = `${parameter.label} is required.`;
        continue;
      }
    }

    // Regex validation only applies to string parameters with a non-empty value,
    // the user should use the required flag for enforcing presence of a value.
    if (parameter.validation && typeof value === "string" && value !== "") {
      try {
        const regex = new RegExp(parameter.validation.regex);
        if (!regex.test(value)) {
          errs[parameter.id] = parameter.validation.message;
        }
      } catch {
        // Invalid regex in template -- skip validation
      }
    }
  }

  return errs;
}
