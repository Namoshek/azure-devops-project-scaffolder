import * as SDK from "azure-devops-extension-sdk";
import {
  TemplateDefinition,
  TemplatePermissions,
} from "../types/templateTypes";
import { getCollectionUrl } from "./locationService";

// ─── Security namespace GUIDs (constant across all ADO instances) ─────────────

/** Git Repositories security namespace */
const GIT_SECURITY_NAMESPACE = "2e9eb7ed-3c0a-47d4-87c1-0ffdd275fd87";
/** Build security namespace */
const BUILD_SECURITY_NAMESPACE = "33344d9c-fc72-4d6f-aba5-fa317101a7e9";
/** Collection/Organization-level security namespace */
const COLLECTION_SECURITY_NAMESPACE = "3e65f728-f8bc-4ecd-8764-7e378b19bfa7";

/**
 * Combined bit for Git repo creation:
 *   CreateRepository (256) + GenericContribute (4) = 260.
 * Both are required to scaffold a repository from a template.
 */
const GIT_REPO_PERMISSION_BIT = 260;

/**
 * Bit for pipeline definition creation:
 *   EditBuildDefinition = 2048.
 */
const BUILD_PIPELINE_PERMISSION_BIT = 2048;

/**
 * Bit for collection-level admin rights:
 *   GENERIC_WRITE = 2
 */
const EDIT_COLLECTION_PERMISSION_BIT = 2;

// ─── API types ───────────────────────────────────────────────────────────────

interface PermissionEvaluation {
  securityNamespaceId: string;
  token: string;
  permissions: number;
  value?: boolean;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Returns the base URL to use for Security API calls.
 */
async function getSecurityBaseUrl(): Promise<string> {
  return await getCollectionUrl();
}

/**
 * Evaluates a batch of permission checks for the currently authenticated user
 * using the Security PermissionsBatch API (api-version 7.0). No prior user
 * descriptor lookup is required; the API resolves the caller automatically.
 *
 * Returns one boolean per input evaluation in the same order.
 * Throws on any HTTP error so callers can fail closed.
 */
async function evaluatePermissionBatch(
  evaluations: PermissionEvaluation[],
): Promise<boolean[]> {
  const [accessToken, baseUrl] = await Promise.all([
    SDK.getAccessToken(),
    getSecurityBaseUrl(),
  ]);

  const url = `${baseUrl}/_apis/security/permissionevaluationbatch?api-version=7.0`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      alwaysAllowAdministrators: true,
      evaluations,
    }),
  });

  if (!response.ok) {
    throw new Error(`permissionevaluationbatch returned ${response.status}`);
  }

  const result: { evaluations: PermissionEvaluation[] } = await response.json();
  return result.evaluations.map((e) => e.value === true);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Checks whether the current user can create and contribute to Git repositories
 * in the given project (CreateRepository + GenericContribute, bit 260).
 *
 * Fails closed: returns false on any error.
 */
export async function checkRepoPermission(projectId: string): Promise<boolean> {
  try {
    const [allowed] = await evaluatePermissionBatch([
      {
        securityNamespaceId: GIT_SECURITY_NAMESPACE,
        token: `repoV2/${projectId}`,
        permissions: GIT_REPO_PERMISSION_BIT,
      },
    ]);
    return allowed;
  } catch (err) {
    console.warn(
      `Repo permission check failed: ${(err as Error).message}. Treating as denied.`,
    );
    return false;
  }
}

/**
 * Checks whether the current user can create build pipeline definitions
 * in the given project (EditBuildDefinition, bit 2048).
 *
 * Fails closed: returns false on any error.
 */
export async function checkPipelinePermission(
  projectId: string,
): Promise<boolean> {
  try {
    const [allowed] = await evaluatePermissionBatch([
      {
        securityNamespaceId: BUILD_SECURITY_NAMESPACE,
        token: projectId,
        permissions: BUILD_PIPELINE_PERMISSION_BIT,
      },
    ]);
    return allowed;
  } catch (err) {
    console.warn(
      `Pipeline permission check failed: ${(err as Error).message}. Treating as denied.`,
    );
    return false;
  }
}

/**
 * Resolves the effective permissions for a given template in the given project.
 *
 * Sends a single batch request containing only the evaluations required by the
 * template. If the template defines no repositories, canCreateRepos is
 * trivially true (no permission required). Same for pipelines.
 *
 * Fails closed on errors.
 */
export async function checkTemplatePermissions(
  projectId: string,
  template: TemplateDefinition,
): Promise<TemplatePermissions> {
  const needsRepos = (template.repositories ?? []).length > 0;
  const needsPipelines = (template.pipelines ?? []).length > 0;

  if (!needsRepos && !needsPipelines) {
    return { canCreateRepos: true, canCreatePipelines: true };
  }

  const evaluations: PermissionEvaluation[] = [];

  if (needsRepos) {
    evaluations.push({
      securityNamespaceId: GIT_SECURITY_NAMESPACE,
      token: `repoV2/${projectId}`,
      permissions: GIT_REPO_PERMISSION_BIT,
    });
  }

  if (needsPipelines) {
    evaluations.push({
      securityNamespaceId: BUILD_SECURITY_NAMESPACE,
      token: projectId,
      permissions: BUILD_PIPELINE_PERMISSION_BIT,
    });
  }

  try {
    const results = await evaluatePermissionBatch(evaluations);
    let idx = 0;
    const canCreateRepos = needsRepos ? results[idx++] : true;
    const canCreatePipelines = needsPipelines ? results[idx] : true;
    return { canCreateRepos, canCreatePipelines };
  } catch (err) {
    console.warn(
      `Template permission check failed: ${(err as Error).message}. Treating as denied.`,
    );
    return {
      canCreateRepos: needsRepos ? false : true,
      canCreatePipelines: needsPipelines ? false : true,
    };
  }
}

/**
 * Checks whether the current user has collection-level admin rights
 * ("Edit collection-level information", bit 2) on the instance.
 *
 * Fails closed: returns false on any error.
 */
export async function checkCollectionAdminPermission(): Promise<boolean> {
  try {
    const [allowed] = await evaluatePermissionBatch([
      {
        securityNamespaceId: COLLECTION_SECURITY_NAMESPACE,
        token: "$COLLECTION",
        permissions: EDIT_COLLECTION_PERMISSION_BIT,
      },
    ]);
    return allowed;
  } catch (err) {
    console.warn(
      `Collection admin permission check failed: ${(err as Error).message}. Treating as non-admin.`,
    );
    return false;
  }
}
