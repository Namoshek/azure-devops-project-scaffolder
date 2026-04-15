import { z } from "zod";

export const ParameterValidationSchema = z.object({
  /** JavaScript-compatible regular expression applied to the user's input. The value must fully match the expression to be considered valid. */
  regex: z.string(),
  /** Error message displayed beneath the input field when the regex validation fails. */
  message: z.string(),
});

export const TemplateParameterSchema = z.object({
  /** Unique identifier used as the Mustache variable name in templates, e.g. `{{projectName}}`. Must be unique within the template. */
  id: z.string().min(1),
  /** Human-readable label displayed next to the input control in the parameter form. */
  label: z.string().min(1),
  /** Input control type. `"string"` renders a text field, `"boolean"` a checkbox, `"choice"` a dropdown. */
  type: z.enum(["string", "boolean", "choice"]),
  /** Optional helper text rendered below the input to guide the user, e.g. format requirements or examples. */
  hint: z.string().optional(),
  /** When true, the user must supply a non-empty value before scaffolding can proceed. */
  required: z.boolean().optional(),
  /**
   * Value pre-filled in the form when it is first rendered. Use a `string` for `string`/`choice` types
   * and a `boolean` for the `boolean` type. The user can still change it before submitting.
   */
  defaultValue: z.union([z.string(), z.boolean()]).optional(),
  /** Selectable options for `type: "choice"` parameters. Ignored for all other types. */
  options: z.array(z.string()).optional(),
  /**
   * When true, the input is rendered as a password field so the value is masked while typing.
   * Secret parameter values are also replaced with `"[redacted]"` in the audit log.
   */
  secret: z.boolean().optional(),
  /**
   * Conditional visibility expression. The parameter is shown only when this expression evaluates to
   * true. Uses the same expression syntax supported by `TemplateRepository.when` and
   * `TemplatePipeline.when`. Example: `"includeDocker"`.
   */
  when: z.string().optional(),
  /** Optional validation rule applied to the entered value. Only meaningful for `type: "string"`. */
  validation: ParameterValidationSchema.optional(),
});

export const TemplateFileExcludeSchema = z.object({
  /**
   * Path relative to `sourcePath`, with no leading slash.
   * - **File** (no trailing slash): excludes that single file, e.g. `"Dockerfile"`.
   * - **Folder** (trailing slash): recursively excludes all files under that folder, e.g. `"docker/"`.
   */
  path: z.string(),
  /**
   * Exclusion condition using the standard `when` expression syntax. The file or folder is excluded
   * when this expression evaluates to **true** — it expresses the exclusion condition, not the
   * inclusion condition. Omit to exclude the path unconditionally.
   */
  when: z.string().optional(),
});

export const TemplateRepositorySchema = z.object({
  /**
   * Name of the ADO Git repository to create in the target project. May contain Mustache
   * expressions, e.g. `"{{projectName}}.backend"`.
   */
  name: z.string().min(1),
  /**
   * Path to the subfolder within the template repository that contains the source files to copy
   * into the new repository. Use an empty string or `"."` to copy from the repository root.
   * File content and file names are rendered through Mustache before being committed.
   */
  sourcePath: z.string().default(""),
  /**
   * Name of the default branch created in the new repository, e.g. `"main"` or `"master"`.
   * Defaults to `"main"` when not specified.
   */
  defaultBranch: z.string().default("main"),
  /**
   * Skip this entire repository when the expression evaluates to false. Uses the same expression
   * syntax as parameter `when` fields. Skipped repositories still appear in the scaffolding
   * progress view with a **Skipped** status so the user knows what was conditionally omitted.
   */
  when: z.string().optional(),
  /**
   * List of individual files or entire folder trees to exclude from the scaffold. Each entry can
   * carry an optional `when` condition so exclusions can depend on parameter values. Entries with
   * a trailing slash (e.g. `"docker/"`) exclude every file under that folder recursively; entries
   * without a trailing slash (e.g. `"Dockerfile"`) exclude that single file only.
   */
  exclude: z.array(TemplateFileExcludeSchema).optional(),
});

export const TemplatePipelineVariableSchema = z.object({
  /**
   * Variable name as it will appear on the ADO pipeline definition. May contain Mustache
   * expressions, e.g. `"{{projectName}}_ENV"`.
   */
  name: z.string().min(1),
  /**
   * Variable value set on the pipeline definition at creation time. May contain Mustache
   * expressions referencing any template parameter.
   */
  value: z.string().min(1),
  /**
   * When true, the variable is stored encrypted (as a secret) in the ADO pipeline definition.
   * Secret variables are masked in build logs and cannot be read back through the API.
   */
  secret: z.boolean().optional(),
});

export const TemplatePipelineSchema = z.object({
  /**
   * Display name of the pipeline definition in ADO. May contain Mustache expressions,
   * e.g. `"{{projectName}}-ci"`.
   */
  name: z.string().min(1),
  /**
   * Name of the repository (evaluated after Mustache rendering) that contains the YAML pipeline
   * file. Must match the rendered `name` of one of the `repositories` entries.
   */
  repository: z.string().min(1),
  /**
   * Relative path within the target repository to the YAML pipeline definition file,
   * e.g. `"pipelines/ci.yml"`. Resolved from the repository root.
   */
  yamlPath: z.string().min(1),
  /**
   * Folder path used to organise the pipeline definition under the ADO Pipelines view.
   * Use backslash-separated segments, e.g. `"\\CI"`. Defaults to the root folder when omitted.
   */
  folder: z.string().optional(),
  /**
   * Skip this entire pipeline when the expression evaluates to false. Uses the same expression
   * syntax as parameter `when` fields. Skipped pipelines still appear in the scaffolding progress
   * view with a **Skipped** status.
   */
  when: z.string().optional(),
  /**
   * Pipeline-level variables set directly on the ADO build definition at creation time. Both `name`
   * and `value` support Mustache expressions. Use `secret: true` to store sensitive values encrypted.
   */
  variables: z.array(TemplatePipelineVariableSchema).optional(),
});

export const TemplateVariableGroupVariableSchema = z.object({
  /**
   * Variable name as it will appear in the variable group. May contain Mustache expressions,
   * e.g. `"{{projectName}}_ENV"`.
   */
  name: z.string().min(1),
  /**
   * Variable value. May contain Mustache expressions referencing any template parameter.
   * An empty string is valid — ADO allows empty values, and secrets are often set to an empty
   * placeholder that is filled in manually after scaffolding.
   */
  value: z.string(),
  /**
   * When true, the variable is stored encrypted (as a secret) in the ADO variable group.
   * Secret variables cannot be read back through the API once saved.
   */
  secret: z.boolean().optional(),
});

export const TemplateVariableGroupSchema = z.object({
  /**
   * Display name of the variable group in ADO Library. May contain Mustache expressions,
   * e.g. `"{{projectName}}-vars"`. Must be unique within the project.
   */
  name: z.string().min(1),
  /** Human-readable description shown in ADO Library. May contain Mustache expressions. */
  description: z.string().optional(),
  /**
   * Variables to populate in the group at creation time. Both `name` and `value` support Mustache
   * expressions. Use `secret: true` to store sensitive values encrypted. Omitting this field or
   * providing an empty list creates an empty variable group, which is valid in ADO and can be
   * populated manually after scaffolding.
   */
  variables: z.array(TemplateVariableGroupVariableSchema).optional(),
  /**
   * When true, the variable group is authorized for use by all pipelines in the project immediately
   * after creation (sets "Allow access to all pipelines" in ADO Library).
   */
  grantAccessToAllPipelines: z.boolean().optional(),
  /** Skip this variable group when the expression evaluates to false. */
  when: z.string().optional(),
});

export const TemplateServiceConnectionSchema = z.object({
  /** Display name of the service connection. May contain Mustache expressions. */
  name: z.string().min(1),
  /**
   * ADO endpoint type name, e.g. "AzureRM", "github", "dockerregistry".
   * Accepts any string — including types contributed by third-party extensions.
   */
  type: z.string().min(1),
  /**
   * Authorization scheme, e.g. "ServicePrincipal", "Token", "UsernamePassword",
   * "ManagedServiceIdentity". Must match a scheme supported by the chosen type.
   */
  authorizationScheme: z.string().min(1),
  /**
   * Authorization parameter key-value pairs. Values may be Mustache expressions referencing
   * template parameters (ideally secret ones for credentials). Keys are the field names expected
   * by the endpoint type, e.g. `{ serviceprincipalid: "{{clientId}}", serviceprincipalkey: "{{clientSecret}}" }`.
   */
  authorization: z.record(z.string(), z.string()),
  /** Human-readable description shown in ADO. May contain Mustache expressions. */
  description: z.string().optional(),
  /**
   * Endpoint URL. Required by some types (e.g. AzureRM → "https://management.azure.com/");
   * can be omitted or left empty for others.
   */
  url: z.string().optional(),
  /**
   * Non-auth type-specific configuration fields, e.g. subscriptionId, environment,
   * azureEnvironment. Values may contain Mustache expressions.
   */
  data: z.record(z.string(), z.string()).optional(),
  /**
   * When true, the connection is authorized for use by all pipelines in the project immediately
   * after creation (sets "Allow all pipelines" in ADO).
   */
  grantAccessToAllPipelines: z.boolean().optional(),
  /** Skip this connection when the expression evaluates to false. */
  when: z.string().optional(),
});

/**
 * A named boolean derived at render time from a `when`-style expression.
 * Computed entries are injected into the Mustache context alongside the raw parameter values,
 * enabling `{{#id}}` / `{{^id}}` sections in template files and `when:` fields on any resource.
 * They are not shown in the parameter form and are not written to the audit log.
 */
export const TemplateComputedSchema = z.object({
  /**
   * Unique identifier for this computed boolean. Used as the Mustache variable name, e.g.
   * `{{#isVite}}...{{/isVite}}`. Must not start with a digit. Avoid names that clash with
   * parameter ids — if a clash occurs the computed value takes precedence.
   */
  id: z.string().min(1),
  /**
   * Boolean expression evaluated against the current parameter values at render time.
   * Uses exactly the same syntax as the `when` fields on parameters, repositories, pipelines,
   * service connections, and variable groups.
   *
   * Examples:
   *   - `typeOfFrontend == 'vite'`
   *   - `includeBackend && deployTarget == 'kubernetes'`
   *   - `!useExistingRepo`
   */
  expression: z.string().min(1),
});

export const TemplateDefinitionSchema = z.object({
  /**
   * Universally unique identifier (UUID/GUID) for this template. Should be generated once when the
   * template is first authored and never changed — it is used as the stable identity key in audit
   * records and must remain constant across template updates.
   */
  id: z.guid(),
  /** Display name shown to users in the template selection list and template card. */
  name: z.string().min(1),
  /**
   * Semantic version string, e.g. `"1.0.0"`. Currently informational only — displayed in the
   * template card but not used for compatibility checks or upgrade logic.
   */
  version: z.string().min(1),
  /** Short description of what the template scaffolds. Displayed in the template card. */
  description: z.string().optional(),
  /**
   * List of team names or contact details responsible for maintaining this template. Shown in the
   * template card to help users know who to contact with questions or issues.
   */
  maintainers: z.array(z.string()).optional(),
  /**
   * Guidance shown to the user **before** they submit the scaffolding form, e.g. naming
   * conventions or required permissions. Each array entry is rendered as a separate
   * [MessageCard](https://developer.microsoft.com/en-us/azure-devops/components/message-card).
   *
   * **GitHub-flavored Markdown is supported** — use bold, italic, headings, bullet/numbered
   * lists, tables, strikethrough, inline code, and links. Raw HTML is intentionally stripped
   * for security.
   *
   * `{{paramId}}` Mustache tokens work inside Markdown and are interpolated from the current
   * form values before the Markdown is rendered.
   */
  preScaffoldNotes: z.array(z.string()).optional(),
  /**
   * Guidance shown to the user **after** scaffolding completes successfully, e.g. next steps
   * or links to onboarding documentation. Each array entry is rendered as a separate
   * [MessageCard](https://developer.microsoft.com/en-us/azure-devops/components/message-card).
   *
   * **GitHub-flavored Markdown is supported** — use bold, italic, headings, bullet/numbered
   * lists, tables, strikethrough, inline code, and links. Raw HTML is intentionally stripped
   * for security.
   *
   * `{{paramId}}` Mustache tokens work inside Markdown and are interpolated from the final
   * parameter values before the Markdown is rendered.
   */
  postScaffoldNotes: z.array(z.string()).optional(),
  /**
   * Optional list of category names that this template belongs to, as declared in the YAML. Used to
   * group templates under filter tabs in the selection UI. Categories must also be configured in
   * Admin Settings to appear as tabs; templates whose declared categories do not match any
   * configured category are grouped under the implicit **Others** tab.
   */
  templateCategories: z.array(z.string()).optional(),
  /**
   * Named booleans computed from expressions at render time and injected into the Mustache
   * context alongside raw parameter values. Use this to derive reusable flags from choice
   * parameters or compound conditions.
   * They are not surfaced in the parameter form and are not written to the audit log.
   */
  computed: z.array(TemplateComputedSchema).optional(),
  /** Ordered list of input parameters the user must fill in before scaffolding can proceed. */
  parameters: z.array(TemplateParameterSchema).default([]),
  /** Git repositories to create in the target project as part of this template's scaffold. */
  repositories: z.array(TemplateRepositorySchema).default([]),
  /** YAML pipeline definitions to create in the target project as part of this template's scaffold. */
  pipelines: z.array(TemplatePipelineSchema).default([]),
  /** Service connections to create in the target project as part of this template's scaffold. */
  serviceConnections: z.array(TemplateServiceConnectionSchema).default([]),
  /** Variable groups to create in the target project's Library as part of this template's scaffold. */
  variableGroups: z.array(TemplateVariableGroupSchema).default([]),
});
