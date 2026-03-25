import React, { useState, useEffect } from "react";
import * as SDK from "azure-devops-extension-sdk";
import {
  CommonServiceIds,
  IProjectPageService,
} from "azure-devops-extension-api";
import { Page as PageBase } from "azure-devops-ui/Components/Page/Page";
const Page = PageBase as React.ComponentType<
  React.ComponentProps<typeof PageBase> & { children?: React.ReactNode }
>;
import { Header } from "azure-devops-ui/Components/Header/Header";
import { TitleSize } from "azure-devops-ui/Components/Header/Header.Props";
import { Spinner } from "azure-devops-ui/Components/Spinner/Spinner";
import { SpinnerSize } from "azure-devops-ui/Components/Spinner/Spinner.Props";
import { MessageCard } from "azure-devops-ui/Components/MessageCard/MessageCard";
import { MessageCardSeverity } from "azure-devops-ui/Components/MessageCard/MessageCard.Props";
import { TemplateList } from "./components/TemplateList";
import { ParameterForm } from "./components/ParameterForm";
import { ScaffoldProgress } from "./components/ScaffoldProgress";
import { TemplateDefinition } from "./types/templateTypes";
import { ScaffoldResult } from "./services/scaffoldingOrchestrator";
import { checkProjectAdminPermission } from "./services/permissionService";

type Screen = "list" | "form" | "progress";

export function ScaffoldApp() {
  const [screen, setScreen] = useState<Screen>("list");
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [selectedTemplate, setSelectedTemplate] =
    useState<TemplateDefinition | null>(null);
  const [parameterValues, setParameterValues] = useState<
    Record<string, unknown>
  >({});
  const [scaffoldResults, setScaffoldResults] = useState<ScaffoldResult[]>([]);

  useEffect(() => {
    async function init() {
      await SDK.ready();
      setIsAdmin(await checkAdminPermission());
    }
    void init();
  }, []);

  async function checkAdminPermission(): Promise<boolean> {
    try {
      const projectService = await SDK.getService<IProjectPageService>(
        CommonServiceIds.ProjectPageService,
      );
      const project = await projectService.getProject();
      if (!project) return false;
      return await checkProjectAdminPermission(project.id);
    } catch {
      return false;
    }
  }

  function handleTemplateSelected(template: TemplateDefinition) {
    setSelectedTemplate(template);
    setScreen("form");
  }

  function handleFormSubmit(values: Record<string, unknown>) {
    setParameterValues(values);
    setScreen("progress");
  }

  function handleBack() {
    setScreen("list");
    setSelectedTemplate(null);
    setParameterValues({});
  }

  function handleScaffoldComplete(results: ScaffoldResult[]) {
    setScaffoldResults(results);
  }

  function handleScaffoldAgain() {
    setScreen("list");
    setSelectedTemplate(null);
    setParameterValues({});
    setScaffoldResults([]);
  }

  if (isAdmin === null) {
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
        {!isAdmin && (
          <MessageCard severity={MessageCardSeverity.Warning}>
            You need Project Administrator permissions to initialize projects
            from templates. Contact your project admin if you need access.
          </MessageCard>
        )}

        {screen === "list" && (
          <TemplateList
            isAdmin={isAdmin === true}
            onTemplateSelected={handleTemplateSelected}
          />
        )}

        {screen === "form" && selectedTemplate && (
          <ParameterForm
            template={selectedTemplate}
            isAdmin={isAdmin === true}
            onSubmit={handleFormSubmit}
            onBack={handleBack}
          />
        )}

        {screen === "progress" && selectedTemplate && (
          <ScaffoldProgress
            template={selectedTemplate}
            parameterValues={parameterValues}
            onComplete={handleScaffoldComplete}
            onScaffoldAgain={handleScaffoldAgain}
            results={scaffoldResults}
          />
        )}
      </div>
    </Page>
  );
}
