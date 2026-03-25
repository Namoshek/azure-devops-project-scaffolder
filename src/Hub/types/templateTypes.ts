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

export interface TemplateRepository {
  name: string; // may contain Handlebars expressions
  sourcePath: string; // subfolder within the template repo
  defaultBranch: string;
}

export interface TemplatePipeline {
  name: string; // may contain Handlebars expressions
  repository: string; // must match a TemplateRepository name (after rendering)
  yamlPath: string;
  folder?: string; // pipeline folder grouping in ADO
}

export interface TemplateServiceConnection {
  name: string;
  type: string; // e.g. "AzureRM"
  subscriptionId?: string;
  subscriptionName?: string;
}

export interface TemplateTeam {
  name: string;
  description?: string;
}

export interface TemplateDefinition {
  id: string; // GUID
  name: string;
  version: string;
  description?: string;
  maintainers?: string[];
  preScaffoldNotes?: string[];
  postScaffoldNotes?: string[];
  parameters: TemplateParameter[];
  repositories?: TemplateRepository[];
  pipelines?: TemplatePipeline[];
  serviceConnections?: TemplateServiceConnection[];
  teams?: TemplateTeam[];

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
