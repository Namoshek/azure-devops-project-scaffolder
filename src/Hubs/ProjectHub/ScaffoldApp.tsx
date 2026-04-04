import React from "react";
import { Page as PageBase } from "azure-devops-ui/Components/Page/Page";
import { Header } from "azure-devops-ui/Components/Header/Header";
import { TitleSize } from "azure-devops-ui/Components/Header/Header.Props";
import { Spinner } from "azure-devops-ui/Components/Spinner/Spinner";
import { SpinnerSize } from "azure-devops-ui/Components/Spinner/Spinner.Props";
import { TemplateList } from "./components/overview/TemplateList";
import { ParameterForm } from "./components/scaffolding/ParameterForm";
import { ScaffoldProgress } from "./components/scaffolding/ScaffoldProgress";
import { useScaffoldNavigation } from "./hooks/useScaffoldNavigation";

const Page = PageBase as React.ComponentType<React.ComponentProps<typeof PageBase> & { children?: React.ReactNode }>;

export function ScaffoldApp() {
  const {
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
  } = useScaffoldNavigation();

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
        {screen === "list" && <TemplateList onTemplateSelected={handleTemplateSelected} />}

        {screen === "form" && selectedTemplate && (
          <ParameterForm
            template={selectedTemplate.definition}
            permissions={permissions}
            projectId={projectId!}
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
