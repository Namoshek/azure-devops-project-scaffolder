import * as React from "react";
import * as SDK from "azure-devops-extension-sdk";
import {
  CommonServiceIds,
  IProjectPageService,
} from "azure-devops-extension-api";
import { TemplateDefinition } from "../types/templateTypes";
import {
  runScaffold,
  ScaffoldResult,
  ScaffoldStep,
} from "../services/scaffoldingOrchestrator";

interface ScaffoldProgressProps {
  template: TemplateDefinition;
  parameterValues: Record<string, unknown>;
  results: ScaffoldResult[];
  onComplete: (results: ScaffoldResult[]) => void;
  onScaffoldAgain: () => void;
}

interface ScaffoldProgressState {
  steps: ScaffoldStep[];
  running: boolean;
  done: boolean;
  fatalError: string | null;
}

export class ScaffoldProgress extends React.Component<
  ScaffoldProgressProps,
  ScaffoldProgressState
> {
  constructor(props: ScaffoldProgressProps) {
    super(props);
    this.state = {
      steps: props.results.length > 0 ? props.results : [],
      running: props.results.length === 0,
      done: props.results.length > 0,
      fatalError: null,
    };
  }

  async componentDidMount() {
    // Only auto-start if there are no pre-existing results
    if (this.props.results.length > 0) return;
    await this.runOrchestration();
  }

  private async runOrchestration() {
    const { template, parameterValues, onComplete } = this.props;

    let projectId: string;
    try {
      const projectService = await SDK.getService<IProjectPageService>(
        CommonServiceIds.ProjectPageService,
      );
      const project = await projectService.getProject();
      if (!project) throw new Error("Could not determine current project.");
      projectId = project.id;
    } catch (err) {
      this.setState({
        running: false,
        done: true,
        fatalError: `Failed to determine current project: ${(err as Error).message}`,
      });
      return;
    }

    try {
      await runScaffold(projectId, template, parameterValues, (steps) => {
        this.setState({ steps: [...steps] });
      });
    } catch (err) {
      this.setState({
        fatalError: `Unexpected error: ${(err as Error).message}`,
      });
    }

    this.setState((prev) => {
      onComplete(prev.steps);
      return { running: false, done: true };
    });
  }

  render() {
    const { steps, running, done, fatalError } = this.state;
    const { template, onScaffoldAgain } = this.props;

    const hasFailures = steps.some((s) => s.status === "failed");

    return (
      <div>
        <h2 style={styles.title}>
          {running
            ? "Scaffolding in progress…"
            : done && !hasFailures
              ? "Scaffold complete!"
              : "Scaffold finished with issues"}
        </h2>
        <p style={styles.subtitle}>
          Template: <strong>{template.name}</strong>
        </p>

        {fatalError && (
          <div style={styles.fatalErrorBox}>
            <strong>Fatal error</strong>
            <p style={{ margin: "8px 0 0" }}>{fatalError}</p>
          </div>
        )}

        <div style={styles.stepList}>
          {steps.map((step) => (
            <StepRow key={step.id} step={step} />
          ))}
        </div>

        {done && (
          <div style={styles.actions}>
            <button style={styles.button} onClick={onScaffoldAgain}>
              ← Scaffold Another Project
            </button>
          </div>
        )}
      </div>
    );
  }
}

// ─── StepRow ──────────────────────────────────────────────────────────────────

interface StepRowProps {
  step: ScaffoldStep;
}

interface StepRowState {
  expanded: boolean;
}

class StepRow extends React.Component<StepRowProps, StepRowState> {
  constructor(props: StepRowProps) {
    super(props);
    this.state = { expanded: false };
  }

  render() {
    const { step } = this.props;
    const { expanded } = this.state;
    const hasDetail = Boolean(step.detail);

    return (
      <div style={styles.stepRow}>
        <div style={styles.stepHeader}>
          <StatusIcon status={step.status} />
          <span style={styles.stepLabel}>{step.label}</span>
          {hasDetail && (
            <button
              style={styles.expandButton}
              onClick={() =>
                this.setState((prev) => ({ expanded: !prev.expanded }))
              }
            >
              {expanded ? "▲" : "▼"}
            </button>
          )}
        </div>
        {expanded && step.detail && (
          <div style={styles.stepDetail}>{step.detail}</div>
        )}
      </div>
    );
  }
}

function StatusIcon({ status }: { status: ScaffoldStep["status"] }) {
  const map: Record<ScaffoldStep["status"], { symbol: string; color: string }> =
    {
      pending: { symbol: "○", color: "#c8c6c4" },
      running: { symbol: "◌", color: "#0078d4" },
      success: { symbol: "✔", color: "#107c10" },
      skipped: { symbol: "—", color: "#605e5c" },
      failed: { symbol: "✘", color: "#a4262c" },
    };
  const { symbol, color } = map[status];
  return (
    <span
      style={{
        ...styles.statusIcon,
        color,
        animation: status === "running" ? "spin 1s linear infinite" : "none",
      }}
    >
      {symbol}
    </span>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  title: {
    fontSize: 20,
    fontWeight: 600,
    margin: "0 0 4px",
    color: "#323130",
  },
  subtitle: {
    fontSize: 14,
    color: "#605e5c",
    margin: "0 0 24px",
  },
  fatalErrorBox: {
    background: "#fde7e9",
    border: "1px solid #a4262c",
    borderRadius: 4,
    padding: 16,
    color: "#a4262c",
    marginBottom: 20,
  },
  stepList: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    maxWidth: 640,
  },
  stepRow: {
    background: "#faf9f8",
    border: "1px solid #edebe9",
    borderRadius: 4,
    overflow: "hidden",
  },
  stepHeader: {
    display: "flex",
    alignItems: "center",
    padding: "12px 16px",
    gap: 12,
  },
  stepLabel: {
    flex: 1,
    fontSize: 14,
    color: "#323130",
  },
  statusIcon: {
    fontSize: 16,
    width: 20,
    textAlign: "center",
    flexShrink: 0,
    fontWeight: 700,
  },
  expandButton: {
    background: "none",
    border: "none",
    cursor: "pointer",
    color: "#605e5c",
    fontSize: 12,
    padding: "0 4px",
  },
  stepDetail: {
    padding: "0 16px 12px 48px",
    fontSize: 13,
    color: "#605e5c",
    borderTop: "1px solid #edebe9",
    paddingTop: 8,
  },
  actions: {
    marginTop: 32,
  },
  button: {
    background: "none",
    border: "1px solid #c8c6c4",
    borderRadius: 2,
    padding: "8px 20px",
    fontSize: 14,
    cursor: "pointer",
    color: "#323130",
  },
};
