import * as SDK from "azure-devops-extension-sdk";

// Project security namespace GUID (constant across all ADO instances).
const PROJECT_SECURITY_NAMESPACE = "52d39943-cb85-4d7f-8fa8-c6baac873819";

// Bit 2 = GENERIC_WRITE = "Edit project-level information".
// This is the canonical permission held by Project Administrators and is
// available via the Security REST API on both ADO Services and ADO Server.
const EDIT_PROJECT_PERMISSION_BIT = 2;

/**
 * Checks whether the currently authenticated user has the
 * "Edit project-level information" permission on the given project,
 * which is the canonical permission held by Project Administrators.
 *
 * Uses the Security Permissions REST API, which is available on both
 * Azure DevOps Services and Azure DevOps Server (on-premises).
 *
 * Returns true if the user is an admin, false otherwise (including on errors,
 * to fail closed — the UI will show a warning but won't grant access).
 */
export async function checkProjectAdminPermission(
  projectId: string,
): Promise<boolean> {
  try {
    const accessToken = await SDK.getAccessToken();
    const collection = SDK.getHost().name;

    const token = encodeURIComponent(
      `$PROJECT:vstfs:///Classification/TeamProject/${projectId}`,
    );

    const url =
      `${window.location.origin}/${collection}/_apis/permissions/${PROJECT_SECURITY_NAMESPACE}/${EDIT_PROJECT_PERMISSION_BIT}` +
      `?token=${token}&alwaysAllowAdministrators=false&api-version=7.1`;

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      console.warn(
        `Permission check returned ${response.status}. Treating as non-admin.`,
      );
      return false;
    }

    const data: { value: boolean[] } = await response.json();
    return data.value.length === 1 && data.value[0] === true;
  } catch (err) {
    console.warn(
      `Permission check failed: ${(err as Error).message}. Treating as non-admin.`,
    );
    return false;
  }
}
