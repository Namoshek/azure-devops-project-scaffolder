import * as React from "react";
import * as SDK from "azure-devops-extension-sdk";
import {
  CommonServiceIds,
  IProjectPageService,
} from "azure-devops-extension-api";
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
    const styles = ScaffoldApp.styles;
    const {
      screen,
      isAdmin,
      selectedTemplate,
      parameterValues,
      scaffoldResults,
    } = this.state;

    if (isAdmin === null) {
      return (
        <div style={{ padding: 24 }}>
          <span>Loading…</span>
        </div>
      );
    }

    return (
      <div style={{ padding: 24, maxWidth: 960 }}>
        <h1 style={{ marginTop: 0, marginBottom: 24 }}>Project Scaffolding</h1>

        {!isAdmin && (
          <div style={styles.warningBanner}>
            <strong>Read-only view</strong> — you need Project Administrator
            permissions to scaffold projects. Contact your project admin if you
            need access.
          </div>
        )}

        {screen === "list" && (
          <TemplateList onTemplateSelected={this.handleTemplateSelected} />
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
    );
  }

  private static readonly styles: Record<string, React.CSSProperties> = {
    warningBanner: {
      background: "#fff4ce",
      border: "1px solid #c8a600",
      borderRadius: 4,
      padding: "10px 16px",
      marginBottom: 20,
      fontSize: 14,
      color: "#323130",
    },
  };
}
