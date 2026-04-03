export type ParameterType = "string" | "boolean" | "choice";

export interface ParameterValidation {
  regex: string;
  message: string;
}

export interface TemplateParameter {
  id: string;
  label: string;
  hint?: string;
  type: ParameterType;
  required?: boolean;
  defaultValue?: string | boolean;
  options?: string[]; // for type: "choice"
  secret?: boolean; // render as password input
  when?: string; // conditional visibility expression, e.g. "includeDocker == true"
  validation?: ParameterValidation;
}

export interface TemplateFileExclude {
  /**
   * Path relative to `sourcePath`, with no leading slash.
   * - **File** (no trailing slash): excludes that single file, e.g. `"Dockerfile"`.
   * - **Folder** (trailing slash): recursively excludes all files under that folder, e.g. `"docker/"`.
   */
  path: string;
  when?: string; // exclusion condition — file is excluded when this expression is true
}

export interface TemplateRepository {
  name: string; // may contain Mustache expressions
  sourcePath: string; // subfolder within the template repo
  defaultBranch: string; // defaults to "main" if not specified
  when?: string; // skip this entire repository when expression is false
  exclude?: TemplateFileExclude[]; // files or folders to exclude based on conditions
}

export interface TemplatePipelineVariable {
  name: string; // may contain Mustache expressions
  value: string; // may contain Mustache expressions
  secret?: boolean; // if true, stored as a secret variable in ADO
}

export interface TemplatePipeline {
  name: string; // may contain Mustache expressions
  repository: string; // must match a TemplateRepository name (after rendering)
  yamlPath: string;
  folder?: string; // pipeline folder grouping in ADO
  when?: string; // skip this entire pipeline when expression is false
  variables?: TemplatePipelineVariable[]; // pipeline-level variables to set on the definition
}

export interface TemplateServiceConnection {
  /** Display name of the service connection. May contain Mustache expressions. */
  name: string;
  /**
   * ADO endpoint type name, e.g. "AzureRM", "github", "dockerregistry".
   * Accepts any string — including types contributed by third-party extensions.
   */
  type: string;
  /**
   * Authorization scheme, e.g. "ServicePrincipal", "Token", "UsernamePassword",
   * "ManagedServiceIdentity". Must match a scheme supported by the chosen type.
   */
  authorizationScheme: string;
  /**
   * Endpoint URL. Required by some types (e.g. AzureRM →
   * "https://management.azure.com/"); can be omitted or left empty for others.
   */
  url?: string;
  /**
   * Authorization parameter key-value pairs. Values may be Mustache
   * expressions referencing template parameters (ideally secret ones for
   * credentials). Keys are the field names expected by the endpoint type,
   * e.g. { serviceprincipalid: "{{clientId}}", serviceprincipalkey: "{{clientSecret}}" }.
   */
  authorization: Record<string, string>;
  /**
   * Non-auth type-specific configuration fields, e.g. subscriptionId,
   * environment, azureEnvironment. Values may contain Mustache expressions.
   */
  data?: Record<string, string>;
  /** Human-readable description shown in ADO. May contain Mustache expressions. */
  description?: string;
  /**
   * When true, the connection is authorized for use by all pipelines in the
   * project immediately after creation (sets "Allow all pipelines" in ADO).
   */
  grantAccessToAllPipelines?: boolean;
  /** Skip this connection when the expression evaluates to false. */
  when?: string;
}

/**
 * The name of the virtual "All" category that is always prepended first and
 * shows every discovered template (after search filtering). This category is
 * never stored in settings — it is a UI-only entry.
 */
export const ALL_CATEGORY_NAME = "All";

/**
 * The name of the implicit fallback category that collects all templates whose
 * `templateCategories` field is absent or contains no match for any configured
 * category. This category is never stored in settings — it is always appended last.
 */
export const OTHERS_CATEGORY_NAME = "Others";

export interface TemplateDefinition {
  id: string; // GUID
  name: string;
  version: string;
  description?: string;
  maintainers?: string[];
  preScaffoldNotes?: string[];
  postScaffoldNotes?: string[];
  templateCategories?: string[]; // optional list of category names declared in the YAML
  parameters: TemplateParameter[];
  repositories?: TemplateRepository[];
  serviceConnections?: TemplateServiceConnection[];
  pipelines?: TemplatePipeline[];

  // Metadata set by discovery, not parsed from YAML
  _sourceProjectId?: string;
  _sourceProjectName?: string;
  _sourceRepoId?: string;
  _sourceRepoName?: string;
}

export interface DiscoveredTemplate {
  definition: TemplateDefinition;
  sourceProjectName: string;
  sourceRepoName: string;
}

export interface TemplatePermissions {
  /** User can create and contribute to Git repositories in this project. */
  canCreateRepos: boolean;
  /** User can create build pipeline definitions in this project. */
  canCreatePipelines: boolean;
  /** User can create service endpoint (service connection) definitions in this project. */
  canCreateServiceConnections: boolean;
}
