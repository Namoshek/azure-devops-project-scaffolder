import * as SDK from "azure-devops-extension-sdk";
import { getClient } from "azure-devops-extension-api";
import {
  TaskAgentRestClient,
  VariableGroup,
  VariableGroupProjectReference,
} from "azure-devops-extension-api/TaskAgent";
import { renderTemplate } from "./templateEngineService";
import { checkVariableGroupExists } from "./preflightCheckService";
import { getCollectionUrl } from "./locationService";
import { TemplateVariableGroup } from "src/types/templateTypes";

export type VariableGroupScaffoldStatus = "created" | "skipped" | "failed";

export interface VariableGroupScaffoldResult {
  groupName: string;
  status: VariableGroupScaffoldStatus;
  reason?: string;
  groupId?: number;
}

/**
 * Creates a variable group in the target project's Library.
 *
 * Non-destructive: if a variable group with the same name already exists in the
 * target project, returns "skipped".
 *
 * Secret variable values should reference secret template parameters via Mustache
 * expressions (e.g. `"{{mySecret}}"`) so they are masked in the scaffolding form.
 */
export async function scaffoldVariableGroup(
  projectId: string,
  groupTemplate: TemplateVariableGroup,
  parameterValues: Record<string, unknown>,
): Promise<VariableGroupScaffoldResult> {
  const groupName = renderTemplate(groupTemplate.name, parameterValues);

  // 1. Skip if a group with this name already exists
  const { exists } = await checkVariableGroupExists(projectId, groupName, { fresh: true });
  if (exists) {
    return {
      groupName,
      status: "skipped",
      reason: `Variable group '${groupName}' already exists.`,
    };
  }

  // 2. Build the variables map
  const variables: Record<string, { value: string; isSecret: boolean }> = {};
  for (const variable of groupTemplate.variables ?? []) {
    const name = renderTemplate(variable.name, parameterValues);
    const value = renderTemplate(variable.value, parameterValues);
    variables[name] = { value, isSecret: variable.secret ?? false };
  }

  const renderedDescription = groupTemplate.description
    ? renderTemplate(groupTemplate.description, parameterValues)
    : undefined;

  const projectReference: VariableGroupProjectReference = {
    projectReference: { id: projectId, name: "" },
    name: groupName,
    description: renderedDescription ?? "",
  };

  const group: VariableGroup = {
    name: groupName,
    description: renderedDescription ?? "",
    type: "Vsts",
    variables,
    variableGroupProjectReferences: [projectReference],
  } as unknown as VariableGroup;

  // 3. Create the variable group
  let created: VariableGroup;
  try {
    const client = getClient(TaskAgentRestClient);
    created = await client.addVariableGroup(group);
  } catch (err) {
    return {
      groupName,
      status: "failed",
      reason: `Failed to create variable group: ${(err as Error).message}`,
    };
  }

  // 4. Optionally authorize the group for all pipelines in the project
  if (groupTemplate.grantAccessToAllPipelines && created.id) {
    try {
      await authorizeForAllPipelines(projectId, created.id);
    } catch (err) {
      // Non-fatal: group was created; authorization failure is a warning only.
      console.warn(
        `Variable group '${groupName}' created but pipeline authorization failed: ${(err as Error).message}`,
      );
    }
  }

  return {
    groupName,
    status: "created",
    groupId: created.id,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Grants "Allow access to all pipelines" to a variable group by calling the
 * Pipeline Permissions API. This is equivalent to checking
 * "Allow access to all pipelines" in the ADO Library variable group UI.
 */
async function authorizeForAllPipelines(projectId: string, groupId: number): Promise<void> {
  const [accessToken, baseUrl] = await Promise.all([SDK.getAccessToken(), getCollectionUrl()]);

  const url = `${baseUrl}/${projectId}/_apis/pipelines/pipelinepermissions/variablegroup/${groupId}?api-version=7.0-preview`;

  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      allPipelines: { authorized: true },
      resource: { id: String(groupId), name: "", type: "variablegroup" },
    }),
  });

  if (!response.ok) {
    throw new Error(`Pipeline permissions PATCH returned ${response.status}`);
  }
}
