import { TemplateDefinition, TemplatePermissions } from "../types/templateTypes";
import {
  evaluateWhenExpression,
  renderTemplate,
  renderTemplatePreview,
  buildViewValues,
} from "../services/templateEngineService";
import { ResourceExistenceMap } from "../services/preflightCheckService";

export interface ParameterSummarySubItem {
  name: string;
  included: boolean;
}

export interface ParameterSummaryItem {
  type: "repository" | "serviceConnection" | "variableGroup" | "pipeline";
  name: string;
  included: boolean;
  permissionDenied: boolean;
  existsWillSkip: boolean;
  existsCheckPending: boolean;
  subItems?: ParameterSummarySubItem[];
}

export function buildSummaryItems(
  template: TemplateDefinition,
  values: Record<string, unknown>,
  permissions: TemplatePermissions | null,
  preflightChecks: ResourceExistenceMap | null,
  preflightPending: boolean,
): ParameterSummaryItem[] {
  const viewValues = buildViewValues(template.computed, values);

  const repositories = (template.repositories ?? []).map((r) => {
    const included = !r.when || evaluateWhenExpression(r.when, viewValues);
    const conditionalExcludes = (r.exclude ?? []).filter((e) => !!e.when);
    const subItems: ParameterSummarySubItem[] = [
      { name: "All non-conditional files", included },
      ...conditionalExcludes.map((e) => ({
        name: e.path,
        included: !evaluateWhenExpression(e.when!, viewValues),
      })),
    ];
    const lookupName = renderTemplate(r.name, viewValues);
    const repositoryCheck = preflightChecks?.repos[lookupName.toLowerCase()];
    const permissionDenied = permissions !== null && !permissions.canCreateRepos;
    const existsWillSkip =
      included && !permissionDenied && (repositoryCheck?.exists && repositoryCheck.isNonEmpty) === true;
    const existsCheckPending = included && !permissionDenied && (preflightPending || repositoryCheck === undefined);

    return {
      type: "repository" as const,
      name: renderTemplatePreview(r.name, viewValues),
      included,
      permissionDenied,
      existsWillSkip,
      existsCheckPending,
      subItems,
    };
  });

  const pipelines = (template.pipelines ?? []).map((p) => {
    const included = !p.when || evaluateWhenExpression(p.when, viewValues);
    const lookupName = renderTemplate(p.name, viewValues);
    const folder = p.folder ?? "\\";
    const pipelineKey = `${folder.toLowerCase()}::${lookupName.toLowerCase()}`;
    const pipelineCheck = preflightChecks?.pipelines[pipelineKey];
    const permissionDenied = permissions !== null && !permissions.canCreatePipelines;
    const existsWillSkip = included && !permissionDenied && pipelineCheck?.exists === true;
    const existsCheckPending = included && !permissionDenied && (preflightPending || pipelineCheck === undefined);

    const subItems: ParameterSummarySubItem[] = (p.variables ?? []).map((v) => {
      const varName = renderTemplatePreview(v.name, viewValues);
      const varValue = v.secret ? "******" : renderTemplatePreview(v.value, viewValues);
      return { name: `${varName} = ${varValue}`, included: true };
    });

    return {
      type: "pipeline" as const,
      name: renderTemplatePreview(p.name, viewValues),
      included,
      permissionDenied,
      existsWillSkip,
      existsCheckPending,
      subItems,
    };
  });

  const serviceConnections = (template.serviceConnections ?? []).map((sc) => {
    const included = !sc.when || evaluateWhenExpression(sc.when, viewValues);
    const lookupName = renderTemplate(sc.name, viewValues);
    const serviceConnectionCheck = preflightChecks?.serviceConnections[lookupName.toLowerCase()];
    const permissionDenied = permissions !== null && !permissions.canCreateServiceConnections;
    const existsWillSkip = included && !permissionDenied && serviceConnectionCheck?.exists === true;
    const existsCheckPending =
      included && !permissionDenied && (preflightPending || serviceConnectionCheck === undefined);

    return {
      type: "serviceConnection" as const,
      name: renderTemplatePreview(sc.name, viewValues),
      included,
      permissionDenied,
      existsWillSkip,
      existsCheckPending,
    };
  });

  const variableGroups = (template.variableGroups ?? []).map((vg) => {
    const included = !vg.when || evaluateWhenExpression(vg.when, viewValues);
    const lookupName = renderTemplate(vg.name, viewValues);
    const variableGroupCheck = preflightChecks?.variableGroups[lookupName.toLowerCase()];
    const permissionDenied = permissions !== null && !permissions.canCreateVariableGroups;
    const existsWillSkip = included && !permissionDenied && variableGroupCheck?.exists === true;
    const existsCheckPending = included && !permissionDenied && (preflightPending || variableGroupCheck === undefined);

    const subItems: ParameterSummarySubItem[] = (vg.variables ?? []).map((v) => {
      const varName = renderTemplatePreview(v.name, viewValues);
      const varValue = v.secret ? "******" : renderTemplatePreview(v.value, viewValues);
      return { name: `${varName} = ${varValue}`, included: true };
    });

    return {
      type: "variableGroup" as const,
      name: renderTemplatePreview(vg.name, viewValues),
      included,
      permissionDenied,
      existsWillSkip,
      existsCheckPending,
      subItems,
    };
  });

  return [...repositories, ...serviceConnections, ...variableGroups, ...pipelines];
}
