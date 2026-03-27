import {
  TemplateDefinition,
  TemplatePermissions,
} from "../types/templateTypes";
import {
  evaluateWhenExpression,
  renderTemplate,
} from "../services/templateEngineService";
import { ResourceExistenceMap } from "../services/preflightCheckService";

export interface ParameterSummarySubItem {
  name: string;
  included: boolean;
}

export interface ParameterSummaryItem {
  type: "repository" | "pipeline";
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
  const repositories = (template.repositories ?? []).map((r) => {
    const included = !r.when || evaluateWhenExpression(r.when, values);
    const conditionalExcludes = (r.exclude ?? []).filter((e) => !!e.when);
    const subItems: ParameterSummarySubItem[] = [
      { name: "All non-conditional files", included },
      ...conditionalExcludes.map((e) => ({
        name: e.path,
        included: !evaluateWhenExpression(e.when!, values),
      })),
    ];
    const renderedName = renderTemplate(r.name, values);
    const repoCheck = preflightChecks?.repos[renderedName.toLowerCase()];
    const permissionDenied =
      permissions !== null && !permissions.canCreateRepos;
    const existsWillSkip =
      included &&
      !permissionDenied &&
      (repoCheck?.exists && repoCheck.isNonEmpty) === true;
    const existsCheckPending =
      included &&
      !permissionDenied &&
      (preflightPending || repoCheck === undefined);

    return {
      type: "repository" as const,
      name: renderedName,
      included,
      permissionDenied,
      existsWillSkip,
      existsCheckPending,
      subItems,
    };
  });

  const pipelines = (template.pipelines ?? []).map((p) => {
    const included = !p.when || evaluateWhenExpression(p.when, values);
    const renderedName = renderTemplate(p.name, values);
    const folder = p.folder ?? "\\";
    const pipelineKey = `${folder.toLowerCase()}::${renderedName.toLowerCase()}`;
    const pipelineCheck = preflightChecks?.pipelines[pipelineKey];
    const permissionDenied =
      permissions !== null && !permissions.canCreatePipelines;
    const existsWillSkip =
      included && !permissionDenied && pipelineCheck?.exists === true;
    const existsCheckPending =
      included &&
      !permissionDenied &&
      (preflightPending || pipelineCheck === undefined);

    return {
      type: "pipeline" as const,
      name: renderedName,
      included,
      permissionDenied,
      existsWillSkip,
      existsCheckPending,
    };
  });

  return [...repositories, ...pipelines];
}
