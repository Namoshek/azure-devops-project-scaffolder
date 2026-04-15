import z from "zod";
import {
  TemplateDefinitionSchema,
  TemplateParameterSchema,
  ParameterValidationSchema,
  TemplateFileExcludeSchema,
  TemplateRepositorySchema,
  TemplatePipelineVariableSchema,
  TemplatePipelineSchema,
  TemplateServiceConnectionSchema,
  TemplateVariableGroupVariableSchema,
  TemplateVariableGroupSchema,
  TemplateComputedSchema,
} from "./templateSchemas";

export type TemplateDefinition = z.infer<typeof TemplateDefinitionSchema>;
export type ParameterType = z.infer<typeof TemplateParameterSchema>["type"];
export type ParameterValidation = z.infer<typeof ParameterValidationSchema>;
export type TemplateParameter = z.infer<typeof TemplateParameterSchema>;
export type TemplateFileExclude = z.infer<typeof TemplateFileExcludeSchema>;
export type TemplateRepository = z.infer<typeof TemplateRepositorySchema>;
export type TemplatePipelineVariable = z.infer<typeof TemplatePipelineVariableSchema>;
export type TemplatePipeline = z.infer<typeof TemplatePipelineSchema>;
export type TemplateServiceConnection = z.infer<typeof TemplateServiceConnectionSchema>;
export type TemplateVariableGroupVariable = z.infer<typeof TemplateVariableGroupVariableSchema>;
export type TemplateVariableGroup = z.infer<typeof TemplateVariableGroupSchema>;
export type TemplateComputed = z.infer<typeof TemplateComputedSchema>;

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

export interface DiscoveredTemplate {
  /** Parsed and validated template definition as read from the `project-template.yml` file. */
  definition: TemplateDefinition;
  /** ADO project ID of the project that hosts the template repository. */
  sourceProjectId: string;
  /**
   * Display name of the ADO project that hosts the template repository. Shown in the template card
   * to help users identify where a template comes from.
   */
  sourceProjectName: string;
  /** Repository ID of the Git repository containing the `project-template.yml` file. */
  sourceRepoId: string;
  /**
   * Name of the ADO Git repository that contains the `project-template.yml` file. Shown in the
   * template card alongside the source project name.
   */
  sourceRepoName: string;
  /**
   * Git commit SHA of the `project-template.yml` file at the time it was discovered. Used for
   * traceability — recorded in the audit log so the exact version of the template can be traced.
   */
  sourceCommitId?: string;
}

export interface TemplatePermissions {
  /** User can create and contribute to Git repositories in this project. */
  canCreateRepos: boolean;
  /** User can create build pipeline definitions in this project. */
  canCreatePipelines: boolean;
  /** User can create service endpoint (service connection) definitions in this project. */
  canCreateServiceConnections: boolean;
  /** User can create variable groups in the project's Library. */
  canCreateVariableGroups: boolean;
}
