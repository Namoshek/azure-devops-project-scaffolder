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
  path: string; // relative to sourcePath, no leading slash
  when?: string; // exclusion condition — file is excluded when this expression is true
}

export interface TemplateRepository {
  name: string; // may contain Mustache expressions
  sourcePath: string; // subfolder within the template repo
  defaultBranch: string; // defaults to "main" if not specified
  when?: string; // skip this entire repository when expression is false
  exclude?: TemplateFileExclude[]; // individual files to exclude based on conditions
}

export interface TemplatePipeline {
  name: string; // may contain Mustache expressions
  repository: string; // must match a TemplateRepository name (after rendering)
  yamlPath: string;
  folder?: string; // pipeline folder grouping in ADO
  when?: string; // skip this entire pipeline when expression is false
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
}
