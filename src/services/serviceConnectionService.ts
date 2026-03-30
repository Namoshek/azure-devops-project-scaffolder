import * as SDK from "azure-devops-extension-sdk";
import { getClient } from "azure-devops-extension-api";
import {
  ServiceEndpointRestClient,
  ServiceEndpoint,
  EndpointAuthorization,
  ServiceEndpointProjectReference,
} from "azure-devops-extension-api/ServiceEndpoint";
import { TemplateServiceConnection } from "../types/templateTypes";
import { renderTemplate } from "./templateEngineService";
import { checkServiceConnectionExists } from "./preflightCheckService";
import { getCollectionUrl } from "./locationService";

export type ServiceConnectionScaffoldStatus = "created" | "skipped" | "failed";

export interface ServiceConnectionScaffoldResult {
  connectionName: string;
  status: ServiceConnectionScaffoldStatus;
  reason?: string;
  endpointId?: string;
}

/**
 * Creates a service connection (endpoint) in the target project.
 *
 * Non-destructive: if a connection with the same name already exists in the
 * target project, returns "skipped".
 *
 * Credential fields should reference secret template parameters via Mustache
 * expressions (e.g. `"{{clientSecret}}"`).
 */
export async function scaffoldServiceConnection(
  projectId: string,
  connectionTemplate: TemplateServiceConnection,
  parameterValues: Record<string, unknown>,
): Promise<ServiceConnectionScaffoldResult> {
  const connectionName = renderTemplate(connectionTemplate.name, parameterValues);

  // 1. Skip if a connection with this name already exists
  const { exists } = await checkServiceConnectionExists(projectId, connectionName, { fresh: true });
  if (exists) {
    return {
      connectionName,
      status: "skipped",
      reason: `Service connection '${connectionName}' already exists.`,
    };
  }

  // 2. Render all authorization and data values
  const renderedAuthParams: Record<string, string> = {};
  for (const [key, value] of Object.entries(connectionTemplate.authorization)) {
    renderedAuthParams[key] = renderTemplate(value, parameterValues);
  }

  const renderedData: Record<string, string> | undefined = connectionTemplate.data
    ? Object.fromEntries(
        Object.entries(connectionTemplate.data).map(([k, v]) => [k, renderTemplate(v, parameterValues)]),
      )
    : undefined;

  const renderedDescription = connectionTemplate.description
    ? renderTemplate(connectionTemplate.description, parameterValues)
    : undefined;

  const projectReference: ServiceEndpointProjectReference = {
    projectReference: { id: projectId, name: "" },
    name: connectionName,
    description: renderedDescription ?? "",
  };

  const url = connectionTemplate.url ? renderTemplate(connectionTemplate.url, parameterValues) : undefined;

  const endpoint: ServiceEndpoint = {
    name: connectionName,
    type: connectionTemplate.type,
    url: url ?? "",
    description: renderedDescription ?? "",
    authorization: {
      scheme: connectionTemplate.authorizationScheme,
      parameters: renderedAuthParams,
    } as EndpointAuthorization,
    data: renderedData ?? {},
    isReady: true,
    serviceEndpointProjectReferences: [projectReference],
  } as unknown as ServiceEndpoint;

  // 3. Create the service connection
  let created: ServiceEndpoint;
  try {
    const client = getClient(ServiceEndpointRestClient);
    created = await client.createServiceEndpoint(endpoint);
  } catch (err) {
    return {
      connectionName,
      status: "failed",
      reason: `Failed to create service connection: ${(err as Error).message}`,
    };
  }

  // 4. Optionally authorize the connection for all pipelines in the project
  if (connectionTemplate.grantAccessToAllPipelines && created.id) {
    try {
      await authorizeForAllPipelines(projectId, created.id);
    } catch (err) {
      // Non-fatal: connection was created; authorization failure is a warning only.
      console.warn(
        `Service connection '${connectionName}' created but pipeline authorization failed: ${(err as Error).message}`,
      );
    }
  }

  return {
    connectionName,
    status: "created",
    endpointId: created.id,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Grants "Allow all pipelines" access to a service connection by calling the
 * Pipeline Permissions API. This is equivalent to checking
 * "Grant access permission to all pipelines" in the ADO service connection UI.
 */
async function authorizeForAllPipelines(projectId: string, endpointId: string): Promise<void> {
  const [accessToken, baseUrl] = await Promise.all([SDK.getAccessToken(), getCollectionUrl()]);

  const url = `${baseUrl}/${projectId}/_apis/pipelines/pipelinepermissions/endpoint/${endpointId}?api-version=7.0-preview`;

  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      allPipelines: { authorized: true },
      resource: { id: endpointId, name: "", type: "endpoint" },
    }),
  });

  if (!response.ok) {
    throw new Error(`Pipeline permissions PATCH returned ${response.status}`);
  }
}
