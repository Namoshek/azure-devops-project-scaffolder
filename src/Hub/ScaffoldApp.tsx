import * as React from "react";
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

interface AppState {
  screen: Screen;
  isAdmin: boolean | null;
  selectedTemplate: TemplateDefinition | null;
  parameterValues: Record<string, unknown>;
  scaffoldResults: ScaffoldResult[];
}

export class ScaffoldApp extends React.Component<{}, AppState> {
  constructor(props: {}) {
    super(props);
    this.state = {
      screen: "list",
      isAdmin: null,
      selectedTemplate: null,
      parameterValues: {},
      scaffoldResults: [],
    };
  }

  async componentDidMount() {
    await SDK.ready();
    const isAdmin = await this.checkAdminPermission();
    this.setState({ isAdmin });
  }

  private async checkAdminPermission(): Promise<boolean> {
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

  private handleTemplateSelected = (template: TemplateDefinition) => {
    this.setState({ selectedTemplate: template, screen: "form" });
  };

  private handleFormSubmit = (values: Record<string, unknown>) => {
    this.setState({ parameterValues: values, screen: "progress" });
  };

  private handleBack = () => {
    this.setState({
      screen: "list",
      selectedTemplate: null,
      parameterValues: {},
    });
  };

  private handleScaffoldComplete = (results: ScaffoldResult[]) => {
    this.setState({ scaffoldResults: results });
  };

  private handleScaffoldAgain = () => {
    this.setState({
      screen: "list",
      selectedTemplate: null,
      parameterValues: {},
      scaffoldResults: [],
    });
  };

  render() {
    const {
      screen,
      isAdmin,
      selectedTemplate,
      parameterValues,
      scaffoldResults,
    } = this.state;

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
        <div className="page-content page-content-top rhythm-vertical-16">
          {!isAdmin && (
            <MessageCard severity={MessageCardSeverity.Warning}>
              You need Project Administrator permissions to initialize projects
              from templates. Contact your project admin if you need access.
            </MessageCard>
          )}

          {screen === "list" && (
            <TemplateList
              isAdmin={isAdmin === true}
              onTemplateSelected={this.handleTemplateSelected}
            />
          )}

          {screen === "form" && selectedTemplate && (
            <ParameterForm
              template={selectedTemplate}
              isAdmin={isAdmin === true}
              onSubmit={this.handleFormSubmit}
              onBack={this.handleBack}
            />
          )}

          {screen === "progress" && selectedTemplate && (
            <ScaffoldProgress
              template={selectedTemplate}
              parameterValues={parameterValues}
              onComplete={this.handleScaffoldComplete}
              onScaffoldAgain={this.handleScaffoldAgain}
              results={scaffoldResults}
            />
          )}
        </div>
      </Page>
    );
  }
}
