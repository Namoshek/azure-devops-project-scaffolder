/**
 * The input control type of a template parameter. Determines how the field is rendered in the parameter form.
 * `"string"` renders a text field, `"boolean"` a checkbox, `"choice"` a dropdown.
 **/
export type ParameterType = "string" | "boolean" | "choice";

export interface ParameterValidation {
  /** JavaScript-compatible regular expression applied to the user's input. The value must fully match the expression to be considered valid. */
  regex: string;
  /** Error message displayed beneath the input field when the regex validation fails. */
  message: string;
}

export interface TemplateParameter {
  /** Unique identifier used as the Mustache variable name in templates, e.g. `{{projectName}}`. Must be unique within the template. */
  id: string;
  /** Human-readable label displayed next to the input control in the parameter form. */
  label: string;
  /** Optional helper text rendered below the input to guide the user, e.g. format requirements or examples. */
  hint?: string;
  /** Input control type. `"string"` renders a text field, `"boolean"` a checkbox, `"choice"` a dropdown. */
  type: ParameterType;
  /** When true, the user must supply a non-empty value before scaffolding can proceed. */
  required?: boolean;
  /**
   * Value pre-filled in the form when it is first rendered. Use a `string` for `string`/`choice` types
   * and a `boolean` for the `boolean` type. The user can still change it before submitting.
   */
  defaultValue?: string | boolean;
  /** Selectable options for `type: "choice"` parameters. Ignored for all other types. */
  options?: string[];
  /**
   * When true, the input is rendered as a password field so the value is masked while typing.
   * Secret parameter values are also replaced with `"[redacted]"` in the audit log.
   */
  secret?: boolean;
  /**
   * Conditional visibility expression. The parameter is shown only when this expression evaluates to
   * true. Uses the same expression syntax supported by `TemplateRepository.when` and
   * `TemplatePipeline.when`. Example: `"includeDocker"`.
   */
  when?: string;
  /** Optional validation rule applied to the entered value. Only meaningful for `type: "string"`. */
  validation?: ParameterValidation;
}

export interface TemplateFileExclude {
  /**
   * Path relative to `sourcePath`, with no leading slash.
   * - **File** (no trailing slash): excludes that single file, e.g. `"Dockerfile"`.
   * - **Folder** (trailing slash): recursively excludes all files under that folder, e.g. `"docker/"`.
   */
  path: string;
  /**
   * Exclusion condition using the standard `when` expression syntax. The file or folder is excluded
   * when this expression evaluates to **true** — it expresses the exclusion condition, not the
   * inclusion condition. Omit to exclude the path unconditionally.
   */
  when?: string;
}

export interface TemplateRepository {
  /**
   * Name of the ADO Git repository to create in the target project. May contain Mustache
   * expressions, e.g. `"{{projectName}}.backend"`.
   */
  name: string;
  /**
   * Path to the subfolder within the template repository that contains the source files to copy
   * into the new repository. Use an empty string or `"."` to copy from the repository root.
   * File content and file names are rendered through Mustache before being committed.
   */
  sourcePath: string;
  /**
   * Name of the default branch created in the new repository, e.g. `"main"` or `"master"`.
   * Defaults to `"main"` when not specified.
   */
  defaultBranch: string;
  /**
   * Skip this entire repository when the expression evaluates to false. Uses the same expression
   * syntax as parameter `when` fields. Skipped repositories still appear in the scaffolding
   * progress view with a **Skipped** status so the user knows what was conditionally omitted.
   */
  when?: string;
  /**
   * List of individual files or entire folder trees to exclude from the scaffold. Each entry can
   * carry an optional `when` condition so exclusions can depend on parameter values. Entries with
   * a trailing slash (e.g. `"docker/"`) exclude every file under that folder recursively; entries
   * without a trailing slash (e.g. `"Dockerfile"`) exclude that single file only.
   */
  exclude?: TemplateFileExclude[];
}

export interface TemplatePipelineVariable {
  /**
   * Variable name as it will appear on the ADO pipeline definition. May contain Mustache
   * expressions, e.g. `"{{projectName}}_ENV"`.
   */
  name: string;
  /**
   * Variable value set on the pipeline definition at creation time. May contain Mustache
   * expressions referencing any template parameter.
   */
  value: string;
  /**
   * When true, the variable is stored encrypted (as a secret) in the ADO pipeline definition.
   * Secret variables are masked in build logs and cannot be read back through the API.
   */
  secret?: boolean;
}

export interface TemplatePipeline {
  /**
   * Display name of the pipeline definition in ADO. May contain Mustache expressions,
   * e.g. `"{{projectName}}-ci"`.
   */
  name: string;
  /**
   * Name of the repository (evaluated after Mustache rendering) that contains the YAML pipeline
   * file. Must match the rendered `name` of one of the `repositories` entries.
   */
  repository: string;
  /**
   * Relative path within the target repository to the YAML pipeline definition file,
   * e.g. `"pipelines/ci.yml"`. Resolved from the repository root.
   */
  yamlPath: string;
  /**
   * Folder path used to organise the pipeline definition under the ADO Pipelines view.
   * Use backslash-separated segments, e.g. `"\\CI"`. Defaults to the root folder when omitted.
   */
  folder?: string;
  /**
   * Skip this entire pipeline when the expression evaluates to false. Uses the same expression
   * syntax as parameter `when` fields. Skipped pipelines still appear in the scaffolding progress
   * view with a **Skipped** status.
   */
  when?: string;
  /**
   * Pipeline-level variables set directly on the ADO build definition at creation time. Both `name`
   * and `value` support Mustache expressions. Use `secret: true` to store sensitive values encrypted.
   */
  variables?: TemplatePipelineVariable[];
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
  /**
   * Universally unique identifier (UUID/GUID) for this template. Should be generated once when the
   * template is first authored and never changed — it is used as the stable identity key in audit
   * records and must remain constant across template updates.
   */
  id: string;
  /** Display name shown to users in the template selection list and template card. */
  name: string;
  /**
   * Semantic version string, e.g. `"1.0.0"`. Currently informational only — displayed in the
   * template card but not used for compatibility checks or upgrade logic.
   */
  version: string;
  /** Short description of what the template scaffolds. Displayed in the template card. */
  description?: string;
  /**
   * List of team names or contact details responsible for maintaining this template. Shown in the
   * template card to help users know who to contact with questions or issues.
   */
  maintainers?: string[];
  /**
   * Lines of guidance shown to the user **before** they submit the scaffolding form, e.g. naming
   * conventions or required permissions. Each array entry is rendered as a separate paragraph.
   */
  preScaffoldNotes?: string[];
  /**
   * Lines of guidance shown to the user **after** scaffolding completes successfully, e.g. next
   * steps or links to onboarding documentation. Each array entry is rendered as a separate paragraph.
   */
  postScaffoldNotes?: string[];
  /**
   * Optional list of category names that this template belongs to, as declared in the YAML. Used to
   * group templates under filter tabs in the selection UI. Categories must also be configured in
   * Admin Settings to appear as tabs; templates whose declared categories do not match any
   * configured category are grouped under the implicit **Others** tab.
   */
  templateCategories?: string[];
  /** Ordered list of input parameters the user must fill in before scaffolding can proceed. */
  parameters: TemplateParameter[];
  /** Git repositories to create in the target project as part of this template's scaffold. */
  repositories?: TemplateRepository[];
  /** Service connections to create in the target project as part of this template's scaffold. */
  serviceConnections?: TemplateServiceConnection[];
  /** YAML pipeline definitions to create in the target project as part of this template's scaffold. */
  pipelines?: TemplatePipeline[];

  // Metadata injected by the discovery service — not present in the YAML.
  /** ADO project ID of the project that hosts the template repository. Set by the discovery service. */
  _sourceProjectId?: string;
  /** Display name of the ADO project that hosts the template repository. Set by the discovery service. */
  _sourceProjectName?: string;
  /** Repository ID of the Git repository containing the `project-template.yml` file. Set by the discovery service. */
  _sourceRepoId?: string;
  /** Repository name of the Git repository containing the `project-template.yml` file. Set by the discovery service. */
  _sourceRepoName?: string;
}

export interface DiscoveredTemplate {
  /** Parsed and validated template definition as read from the `project-template.yml` file. */
  definition: TemplateDefinition;
  /**
   * Display name of the ADO project that hosts the template repository. Shown in the template card
   * to help users identify where a template comes from.
   */
  sourceProjectName: string;
  /**
   * Name of the ADO Git repository that contains the `project-template.yml` file. Shown in the
   * template card alongside the source project name.
   */
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
