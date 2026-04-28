import { useState, useEffect } from "react";
import * as SDK from "azure-devops-extension-sdk";
import { DiscoveredTemplate, TemplatePermissions } from "../../../types/templateTypes";
import { ScaffoldResult } from "../../../services/scaffoldingOrchestrator";
import { checkTemplatePermissions } from "../../../services/permissionService";

type Screen = "list" | "form" | "progress";

export interface UseScaffoldNavigationResult {
  screen: Screen;
  projectId: string | null;
  selectedTemplate: DiscoveredTemplate | null;
  permissions: TemplatePermissions | null;
  parameterValues: Record<string, unknown>;
  scaffoldResults: ScaffoldResult[];
  handleTemplateSelected: (template: DiscoveredTemplate) => void;
  handleFormSubmit: (values: Record<string, unknown>) => void;
  handleBack: () => void;
  handleScaffoldComplete: (results: ScaffoldResult[]) => void;
  handleScaffoldAgain: () => void;
}

export function useScaffoldNavigation(): UseScaffoldNavigationResult {
  const [screen, setScreen] = useState<Screen>("list");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<DiscoveredTemplate | null>(null);
  const [permissions, setPermissions] = useState<TemplatePermissions | null>(null);
  const [parameterValues, setParameterValues] = useState<Record<string, unknown>>({});
  const [scaffoldResults, setScaffoldResults] = useState<ScaffoldResult[]>([]);

  useEffect(() => {
    async function init() {
      await SDK.ready();
      setProjectId(SDK.getWebContext().project.id);
    }
    void init();
  }, []);

  async function handleTemplateSelected(template: DiscoveredTemplate) {
    setSelectedTemplate(template);
    setPermissions(null);
    setScreen("form");

    if (projectId) {
      const resolved = await checkTemplatePermissions(projectId, template.definition);
      setPermissions(resolved);
    } else {
      // No project context — fail closed for all resource types that exist.
      setPermissions({
        canCreateRepos: !template.definition.scaffoldingSteps.some((s) => s.type === "repository"),
        canCreatePipelines: !template.definition.scaffoldingSteps.some((s) => s.type === "pipeline"),
        canCreateServiceConnections: !template.definition.scaffoldingSteps.some((s) => s.type === "serviceConnection"),
        canCreateVariableGroups: !template.definition.scaffoldingSteps.some((s) => s.type === "variableGroup"),
      });
    }
  }

  function handleFormSubmit(values: Record<string, unknown>) {
    setParameterValues(values);
    setScreen("progress");
  }

  function handleBack() {
    setScreen("list");
    setSelectedTemplate(null);
    setPermissions(null);
    setParameterValues({});
  }

  function handleScaffoldComplete(results: ScaffoldResult[]) {
    setScaffoldResults(results);
  }

  function handleScaffoldAgain() {
    setScreen("list");
    setSelectedTemplate(null);
    setPermissions(null);
    setParameterValues({});
    setScaffoldResults([]);
  }

  return {
    screen,
    projectId,
    selectedTemplate,
    permissions,
    parameterValues,
    scaffoldResults,
    handleTemplateSelected,
    handleFormSubmit,
    handleBack,
    handleScaffoldComplete,
    handleScaffoldAgain,
  };
}
