import * as SDK from "azure-devops-extension-sdk";
import { getClient } from "azure-devops-extension-api";
import { GraphRestClient } from "azure-devops-extension-api/Graph";
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

// Bit 2 = GENERIC_WRITE = "Edit collection-level information".
const EDIT_COLLECTION_PERMISSION_BIT = 2;

// ─── API response types ─────────────────────────────────────────────────────

interface IdentityApiResponse {
  descriptor: string;
}

interface AclEntry {
  descriptor: string;
  allow: number;
  deny: number;
  extendedInfo?: { effectiveAllow: number; effectiveDeny: number };
}

interface AclResponse {
  count: number;
  value: Array<{
    token: string;
    acesDictionary: Record<string, AclEntry>;
  }>;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Resolves a subject descriptor for the given user via the on-premises
 * Identity API (IMS). This endpoint is co-hosted with the collection on
 * Azure DevOps Server / TFS but is **not reachable** from the extension
 * iframe on Azure DevOps Services (cloud) because IMS lives on a separate
 * origin (vssps.dev.azure.com).
 *
 * Throws on any error so callers can fail closed.
 */
async function resolveDescriptorViaIdentityApi(
  userId: string,
): Promise<string> {
  const accessToken = await SDK.getAccessToken();
  const collectionUrl = await getCollectionUrl();
  const url =
    `${collectionUrl}/_apis/identities/${encodeURIComponent(userId)}` +
    `?api-version=6.0`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Identity lookup returned ${response.status}`);
  }

  const data: IdentityApiResponse = await response.json();
  return data.descriptor;
}

/**
 * Resolves a subject descriptor for the given user via the Azure DevOps
 * Services Graph API. The SDK REST client automatically routes requests to
 * the correct VSSPS origin, so this works from the extension iframe on
 * cloud instances.
 *
 * The Graph API is **not available** on Azure DevOps Server (on-premises).
 *
 * Throws on any error so callers can fail closed.
 */
async function resolveDescriptorViaGraphApi(userId: string): Promise<string> {
  const result = await getClient(GraphRestClient).getDescriptor(userId);
  return result.value;
}

/**
 * Resolves the subject descriptor for the given user, choosing the
 * appropriate API based on the current hosting environment:
 * - Azure DevOps Services (cloud): Graph API
 * - Azure DevOps Server / TFS (on-prem): Identity API
 *
 * Throws on any error so callers can fail closed.
 */
async function resolveUserDescriptor(userId: string): Promise<string> {
  if (SDK.getHost().isHosted) {
    return resolveDescriptorViaGraphApi(userId);
  }
  return resolveDescriptorViaIdentityApi(userId);
}

/**
 * Checks whether the user identified by `userDescriptor` has all bits in
 * `permissionBit` set in their effective allow mask for the given security
 * namespace and token. Uses the Access Control List endpoint so that
 * group memberships and inherited permissions are fully accounted for.
 *
 * Fails closed: returns false on any error.
 */
async function checkPermission(
  namespaceId: string,
  permissionBit: number,
  token: string,
  userDescriptor: string,
): Promise<boolean> {
  try {
    const accessToken = await SDK.getAccessToken();
    const collectionUrl = await getCollectionUrl();

    const url =
      `${collectionUrl}/_apis/accesscontrollists/${namespaceId}` +
      `?token=${encodeURIComponent(token)}` +
      `&descriptors=${encodeURIComponent(userDescriptor)}` +
      `&includeExtendedInfo=true&recurse=false&api-version=6.0`;

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      console.warn(
        `ACL check (${namespaceId}) returned ${response.status}. Treating as denied.`,
      );
      return false;
    }

    const data: AclResponse = await response.json();
    const ace = data.value?.[0]?.acesDictionary?.[userDescriptor];
    if (!ace) return false;

    const effectiveAllow = ace.extendedInfo?.effectiveAllow ?? 0;
    return (effectiveAllow & permissionBit) === permissionBit;
  } catch (err) {
    console.warn(
      `ACL check (${namespaceId}) failed: ${(err as Error).message}. Treating as denied.`,
    );
    return false;
  }
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
    const userDescriptor = await resolveUserDescriptor(SDK.getUser().id);

    return await checkPermission(
      GIT_SECURITY_NAMESPACE,
      GIT_REPO_PERMISSION_BIT,
      `repoV2/${projectId}`,
      userDescriptor,
    );
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
    const userDescriptor = await resolveUserDescriptor(SDK.getUser().id);

    return await checkPermission(
      BUILD_SECURITY_NAMESPACE,
      BUILD_PIPELINE_PERMISSION_BIT,
      projectId,
      userDescriptor,
    );
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
 * Resolves the user descriptor once, then checks both namespaces in parallel.
 * If the template defines no repositories, canCreateRepos is trivially true
 * (no repo permission is required). Same for pipelines.
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

  let userDescriptor: string;
  try {
    userDescriptor = await resolveUserDescriptor(SDK.getUser().id);
  } catch (err) {
    console.warn(
      `Identity lookup failed: ${(err as Error).message}. Treating as denied.`,
    );
    return {
      canCreateRepos: needsRepos ? false : true,
      canCreatePipelines: needsPipelines ? false : true,
    };
  }

  const [canCreateRepos, canCreatePipelines] = await Promise.all([
    needsRepos
      ? checkPermission(
          GIT_SECURITY_NAMESPACE,
          GIT_REPO_PERMISSION_BIT,
          `repoV2/${projectId}`,
          userDescriptor,
        )
      : Promise.resolve(true),
    needsPipelines
      ? checkPermission(
          BUILD_SECURITY_NAMESPACE,
          BUILD_PIPELINE_PERMISSION_BIT,
          projectId,
          userDescriptor,
        )
      : Promise.resolve(true),
  ]);

  return { canCreateRepos, canCreatePipelines };
}

/**
 * Checks whether the current user has collection-level admin rights
 * ("Edit collection-level information", bit 2) on the instance.
 *
 * Uses the Security Permissions REST API with the Organization security
 * namespace (e48329a9-9c6a-41b4-a0a4-0cf77f1e6b41) and the $COLLECTION
 * scope token, which are both constant across ADO Services and ADO Server.
 *
 * Fails closed: returns false on any error.
 */
export async function checkCollectionAdminPermission(): Promise<boolean> {
  try {
    const accessToken = await SDK.getAccessToken();
    const collectionUrl = await getCollectionUrl();

    const url =
      `${collectionUrl}/_apis/permissions/${COLLECTION_SECURITY_NAMESPACE}/${EDIT_COLLECTION_PERMISSION_BIT}` +
      `?token=${encodeURIComponent("$COLLECTION")}&alwaysAllowAdministrators=false&api-version=6.0`;

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      console.warn(
        `Collection admin permission check returned ${response.status}. Treating as non-admin.`,
      );
      return false;
    }

    const data: { value: boolean[] } = await response.json();
    return data.value.length === 1 && data.value[0] === true;
  } catch (err) {
    console.warn(
      `Collection admin permission check failed: ${(err as Error).message}. Treating as non-admin.`,
    );
    return false;
  }
}
