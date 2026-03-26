import React, { useState, useEffect } from "react";
import * as SDK from "azure-devops-extension-sdk";
import { Page as PageBase } from "azure-devops-ui/Components/Page/Page";
const Page = PageBase as React.ComponentType<
  React.ComponentProps<typeof PageBase> & { children?: React.ReactNode }
>;
import { Header } from "azure-devops-ui/Components/Header/Header";
import { TitleSize } from "azure-devops-ui/Components/Header/Header.Props";
import { Spinner } from "azure-devops-ui/Components/Spinner/Spinner";
import { SpinnerSize } from "azure-devops-ui/Components/Spinner/Spinner.Props";
import { TemplateList } from "./components/TemplateList";
import { ParameterForm } from "./components/ParameterForm";
import { ScaffoldProgress } from "./components/ScaffoldProgress";
import { TemplateDefinition, TemplatePermissions } from "./types/templateTypes";
import { ScaffoldResult } from "./services/scaffoldingOrchestrator";
import { checkTemplatePermissions } from "./services/permissionService";

type Screen = "list" | "form" | "progress";

export function ScaffoldApp() {
  const [screen, setScreen] = useState<Screen>("list");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] =
    useState<TemplateDefinition | null>(null);
  const [permissions, setPermissions] = useState<TemplatePermissions | null>(
    null,
  );
  const [parameterValues, setParameterValues] = useState<
    Record<string, unknown>
  >({});
  const [scaffoldResults, setScaffoldResults] = useState<ScaffoldResult[]>([]);

  useEffect(() => {
    async function init() {
      await SDK.ready();
      setProjectId(SDK.getWebContext().project.id);
    }
    void init();
  }, []);

  async function handleTemplateSelected(template: TemplateDefinition) {
    setSelectedTemplate(template);
    setPermissions(null);
    setScreen("form");

    if (projectId) {
      const resolved = await checkTemplatePermissions(projectId, template);
      setPermissions(resolved);
    } else {
      // No project context — fail closed for all resource types that exist.
      setPermissions({
        canCreateRepos: (template.repositories ?? []).length === 0,
        canCreatePipelines: (template.pipelines ?? []).length === 0,
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

  if (projectId === null && screen === "list") {
    return (
      <Page>
        <div className="page-content page-content-top flex-grow flex-row justify-center">
          <Spinner size={SpinnerSize.large} label="Loading…" />
        </div>
      </Page>
    );
  }

  return (
    <Page>
      <Header title="Project Scaffolding" titleSize={TitleSize.Large} />
      <div className="page-content page-content-top rhythm-vertical-24">
        {screen === "list" && (
          <TemplateList onTemplateSelected={handleTemplateSelected} />
        )}

        {screen === "form" && selectedTemplate && (
          <ParameterForm
            template={selectedTemplate}
            permissions={permissions}
            onSubmit={handleFormSubmit}
            onBack={handleBack}
          />
        )}

        {screen === "progress" && selectedTemplate && permissions && (
          <ScaffoldProgress
            template={selectedTemplate}
            parameterValues={parameterValues}
            permissions={permissions}
            onComplete={handleScaffoldComplete}
            onScaffoldAgain={handleScaffoldAgain}
            results={scaffoldResults}
          />
        )}
      </div>
    </Page>
  );
}
