import { useState, useMemo } from "react";
import { TemplateDefinition, TemplateParameter, TemplatePermissions } from "../types/templateTypes";
import { evaluateWhenExpression } from "../services/templateEngineService";
import { buildDefaults, validate } from "../utils/formUtils";
import { buildSummaryItems, ParameterSummaryItem } from "../utils/summaryBuilder";
import { usePreflightChecks } from "./usePreflightChecks";

export interface UseParameterFormResult {
  values: Record<string, unknown>;
  errors: Record<string, string>;
  submitted: boolean;
  visibleParams: TemplateParameter[];
  summaryItems: ParameterSummaryItem[];
  submitDisabled: boolean;
  submitTooltip: string | undefined;
  handleChange: (id: string, value: unknown) => void;
  handleSubmit: () => void;
}

export function useParameterForm(
  template: TemplateDefinition,
  permissions: TemplatePermissions | null,
  projectId: string,
  onSubmit: (values: Record<string, unknown>) => void,
): UseParameterFormResult {
  const [values, setValues] = useState<Record<string, unknown>>(() => buildDefaults(template.parameters));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  const { preflightChecks, preflightPending } = usePreflightChecks(projectId, template, values);

  function handleChange(id: string, value: unknown) {
    setValues((prev) => ({ ...prev, [id]: value }));
    setErrors((prev) => ({ ...prev, [id]: "" }));
  }

  function handleSubmit() {
    setSubmitted(true);
    const errs = validate(template.parameters, values);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    onSubmit(values);
  }

  const visibleParams = useMemo(
    () => template.parameters.filter((p) => !p.when || evaluateWhenExpression(p.when, values)),
    [template.parameters, values],
  );

  const summaryItems = useMemo(
    () => buildSummaryItems(template, values, permissions, preflightChecks, preflightPending),
    [template, values, permissions, preflightChecks, preflightPending],
  );

  const includedItems = summaryItems.filter((i) => i.included);
  const allBlocked =
    permissions !== null &&
    includedItems.length > 0 &&
    includedItems.every((i) => i.permissionDenied || i.existsWillSkip);
  const submitDisabled = permissions === null || allBlocked;

  const submitTooltip = allBlocked
    ? "All resources are either permission-denied or already exist — nothing will be created."
    : permissions === null
      ? "Checking permissions..."
      : undefined;

  return {
    values,
    errors,
    submitted,
    visibleParams,
    summaryItems,
    submitDisabled,
    submitTooltip,
    handleChange,
    handleSubmit,
  };
}
