import * as React from "react";
import { TemplateDefinition, TemplateParameter } from "../types/templateTypes";
import { evaluateWhenExpression } from "../services/templateEngineService";

interface ParameterFormProps {
  template: TemplateDefinition;
  isAdmin: boolean;
  onSubmit: (values: Record<string, unknown>) => void;
  onBack: () => void;
}

interface ParameterFormState {
  values: Record<string, unknown>;
  errors: Record<string, string>;
  submitted: boolean;
}

export class ParameterForm extends React.Component<
  ParameterFormProps,
  ParameterFormState
> {
  constructor(props: ParameterFormProps) {
    super(props);
    this.state = {
      values: this.buildDefaults(props.template.parameters),
      errors: {},
      submitted: false,
    };
  }

  private buildDefaults(
    parameters: TemplateParameter[],
  ): Record<string, unknown> {
    const defaults: Record<string, unknown> = {};
    for (const p of parameters) {
      if (p.defaultValue !== undefined) {
        defaults[p.id] = p.defaultValue;
      } else if (p.type === "boolean") {
        defaults[p.id] = false;
      } else if (p.type === "choice" && p.options && p.options.length > 0) {
        defaults[p.id] = p.options[0];
      } else {
        defaults[p.id] = "";
      }
    }
    return defaults;
  }

  private handleChange = (id: string, value: unknown) => {
    this.setState((prev) => ({
      values: { ...prev.values, [id]: value },
      errors: { ...prev.errors, [id]: "" },
    }));
  };

  private validate(): Record<string, string> {
    const { template } = this.props;
    const { values } = this.state;
    const errors: Record<string, string> = {};

    for (const param of template.parameters) {
      // Skip fields that are hidden due to `when`
      if (param.when && !evaluateWhenExpression(param.when, values)) continue;

      const value = values[param.id];

      if (param.required) {
        if (
          param.type === "string" &&
          (value === "" || value === undefined || value === null)
        ) {
          errors[param.id] = `${param.label} is required.`;
          continue;
        }
      }

      if (param.validation && typeof value === "string" && value !== "") {
        try {
          const regex = new RegExp(param.validation.regex);
          if (!regex.test(value)) {
            errors[param.id] = param.validation.message;
          }
        } catch {
          // Invalid regex in template — skip validation
        }
      }
    }

    return errors;
  }

  private handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    this.setState({ submitted: true });

    const errors = this.validate();
    if (Object.keys(errors).length > 0) {
      this.setState({ errors });
      return;
    }

    this.props.onSubmit(this.state.values);
  };

  render() {
    const { template, onBack, isAdmin } = this.props;
    const { values, errors, submitted } = this.state;

    const visibleParams = template.parameters.filter(
      (p) => !p.when || evaluateWhenExpression(p.when, values),
    );

    return (
      <div>
        <div style={styles.header}>
          <button style={styles.backButton} onClick={onBack}>
            ← Back
          </button>
          <div>
            <h2 style={styles.title}>{template.name}</h2>
            {template.description && (
              <p style={styles.description}>{template.description}</p>
            )}
          </div>
        </div>

        <form onSubmit={this.handleSubmit} noValidate>
          <div style={styles.fields}>
            {visibleParams.map((param) => (
              <ParameterField
                key={param.id}
                param={param}
                value={values[param.id]}
                error={submitted ? errors[param.id] : undefined}
                onChange={this.handleChange}
              />
            ))}
          </div>

          <div style={styles.actions}>
            <button type="button" style={styles.cancelButton} onClick={onBack}>
              Cancel
            </button>
            <span
              title={
                !isAdmin
                  ? "You need Project Administrator permissions to scaffold projects."
                  : undefined
              }
            >
              <button
                type="submit"
                style={
                  isAdmin
                    ? styles.submitButton
                    : { ...styles.submitButton, ...styles.submitButtonDisabled }
                }
                disabled={!isAdmin}
              >
                Scaffold Project →
              </button>
            </span>
          </div>
        </form>
      </div>
    );
  }
}

// ─── ParameterField ───────────────────────────────────────────────────────────

interface ParameterFieldProps {
  param: TemplateParameter;
  value: unknown;
  error?: string;
  onChange: (id: string, value: unknown) => void;
}

function ParameterField({
  param,
  value,
  error,
  onChange,
}: ParameterFieldProps) {
  const fieldId = `param-${param.id}`;

  return (
    <div style={styles.field}>
      <label htmlFor={fieldId} style={styles.label}>
        {param.label}
        {param.required && <span style={styles.required}> *</span>}
      </label>
      {param.hint && <div style={styles.hint}>{param.hint}</div>}

      {param.type === "string" && (
        <input
          id={fieldId}
          type={param.secret ? "password" : "text"}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(param.id, e.target.value)}
          style={{ ...styles.input, ...(error ? styles.inputError : {}) }}
          autoComplete={param.secret ? "new-password" : "off"}
        />
      )}

      {param.type === "boolean" && (
        <label style={styles.toggleLabel}>
          <input
            id={fieldId}
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(param.id, e.target.checked)}
            style={styles.checkbox}
          />
          <span>{value ? "Yes" : "No"}</span>
        </label>
      )}

      {param.type === "choice" && param.options && (
        <select
          id={fieldId}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(param.id, e.target.value)}
          style={{
            ...styles.input,
            ...styles.select,
            ...(error ? styles.inputError : {}),
          }}
        >
          {param.options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      )}

      {error && <div style={styles.errorText}>{error}</div>}
    </div>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  header: {
    marginBottom: 24,
  },
  backButton: {
    background: "none",
    border: "none",
    cursor: "pointer",
    color: "#0078d4",
    padding: 0,
    fontSize: 14,
    marginBottom: 12,
  },
  title: {
    margin: "0 0 4px",
    fontSize: 20,
    fontWeight: 600,
    color: "#323130",
  },
  description: {
    margin: 0,
    color: "#605e5c",
    fontSize: 14,
  },
  fields: {
    maxWidth: 480,
    display: "flex",
    flexDirection: "column",
    gap: 20,
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  label: {
    fontWeight: 600,
    fontSize: 14,
    color: "#323130",
  },
  required: {
    color: "#a4262c",
  },
  hint: {
    fontSize: 12,
    color: "#605e5c",
  },
  input: {
    border: "1px solid #c8c6c4",
    borderRadius: 2,
    padding: "6px 8px",
    fontSize: 14,
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
  },
  inputError: {
    borderColor: "#a4262c",
  },
  select: {
    background: "#ffffff",
    cursor: "pointer",
  },
  toggleLabel: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    cursor: "pointer",
    fontSize: 14,
    color: "#323130",
  },
  checkbox: {
    width: 16,
    height: 16,
    cursor: "pointer",
  },
  errorText: {
    fontSize: 12,
    color: "#a4262c",
  },
  actions: {
    marginTop: 32,
    display: "flex",
    gap: 12,
  },
  cancelButton: {
    background: "none",
    border: "1px solid #c8c6c4",
    borderRadius: 2,
    padding: "8px 20px",
    fontSize: 14,
    cursor: "pointer",
    color: "#323130",
  },
  submitButton: {
    background: "#0078d4",
    border: "none",
    borderRadius: 2,
    padding: "8px 24px",
    fontSize: 14,
    cursor: "pointer",
    color: "#ffffff",
    fontWeight: 600,
  },
  submitButtonDisabled: {
    background: "#c8c6c4",
    cursor: "not-allowed",
  },
};
