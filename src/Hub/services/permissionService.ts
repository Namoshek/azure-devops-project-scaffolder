import * as SDK from "azure-devops-extension-sdk";

// Project security namespace GUID (constant across all ADO instances).
const PROJECT_SECURITY_NAMESPACE = "52d39943-cb85-4d7f-8463-6af6cdc3a6c4";

// Permission bit 4 = "Edit project-level information" — the standard proxy for "is a Project Administrator".
const EDIT_PROJECT_PERMISSION_BIT = 4;

/**
 * Checks whether the currently authenticated user has the
 * "Edit project-level information" permission on the given project,
 * which is the canonical permission held by Project Administrators.
 *
 * Uses the ADO Security Permissions REST API:
 *   GET /_apis/permissions/{namespaceId}/{permissions}?token={token}&alwaysAllowAdministrators=false
 *
 * Returns true if the user is an admin, false otherwise (including on errors,
 * to fail closed — the UI will show a warning but won't grant access).
 */
export async function checkProjectAdminPermission(
  projectId: string,
): Promise<boolean> {
  try {
    const accessToken = await SDK.getAccessToken();

    // The security token for a project is its GUID prefixed with "$PROJECT:vstfs:///Classification/TeamProject/"
    // but the simpler form accepted by the permissions endpoint is just the project ID.
    const token = encodeURIComponent(
      `$PROJECT:vstfs:///Classification/TeamProject/${projectId}`,
    );

    const url =
      `${window.location.origin}/_apis/permissions/${PROJECT_SECURITY_NAMESPACE}/${EDIT_PROJECT_PERMISSION_BIT}` +
      `?token=${token}&alwaysAllowAdministrators=false&api-version=7.1`;

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      // Fail closed: treat permission check failures as non-admin
      console.warn(
        `Permission check returned ${response.status}. Treating as non-admin.`,
      );
      return false;
    }

    const data: { value: boolean } = await response.json();
    return data.value === true;
  } catch (err) {
    console.warn(
      `Permission check failed: ${(err as Error).message}. Treating as non-admin.`,
    );
    return false;
  }
}
