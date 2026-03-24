import * as React from "react";
import { TemplateDefinition, TemplateParameter } from "../types/templateTypes";
import { evaluateWhenExpression } from "../services/templateEngineService";
import { Button } from "azure-devops-ui/Components/Button/Button";
import { Checkbox } from "azure-devops-ui/Components/Checkbox/Checkbox";
import { Dropdown } from "azure-devops-ui/Components/Dropdown/Dropdown";
import { FormItem as FormItemBase } from "azure-devops-ui/Components/FormItem/FormItem";
import { TextField } from "azure-devops-ui/Components/TextField/TextField";
const FormItem = FormItemBase as React.ComponentType<
  React.ComponentProps<typeof FormItemBase> & { children?: React.ReactNode }
>;
import { IListBoxItem } from "azure-devops-ui/Components/ListBox/ListBox.Props";
import { DropdownSelection } from "azure-devops-ui/Utilities/DropdownSelection";

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
          // Invalid regex in template -- skip validation
        }
      }
    }

    return errors;
  }

  private handleSubmit = () => {
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
        <div
          className="flex-row rhythm-horizontal-8"
          style={{ marginBottom: 24 }}
        >
          <div>
            <div className="title-m">Selected Template: {template.name}</div>
            {template.description && (
              <p
                className="body-m secondary-text"
                style={{ margin: "4px 0 0" }}
              >
                {template.description}
              </p>
            )}
          </div>
        </div>

        <div className="flex-column rhythm-vertical-20">
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

        <div className="flex-row rhythm-horizontal-8" style={{ marginTop: 32 }}>
          <Button text="Cancel" onClick={onBack} />
          <Button
            text="Scaffold Project"
            primary
            disabled={!isAdmin}
            tooltipProps={
              !isAdmin
                ? {
                    text: "You need Project Administrator permissions to scaffold projects.",
                  }
                : undefined
            }
            onClick={this.handleSubmit}
          />
        </div>
      </div>
    );
  }
}

// --- ParameterField ---

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
  const dropdownSelection = React.useMemo(() => new DropdownSelection(), []);
  const dropdownItems = React.useMemo<IListBoxItem[]>(
    () => (param.options || []).map((opt) => ({ id: opt, text: opt })),
    [param.options],
  );

  React.useEffect(() => {
    if (param.type === "choice" && param.options) {
      const idx = param.options.indexOf(typeof value === "string" ? value : "");
      if (idx >= 0) {
        dropdownSelection.select(idx);
      }
    }
  }, [value, param.options, param.type, dropdownSelection]);

  const hasError = Boolean(error);

  if (param.type === "boolean") {
    return (
      <FormItem label={param.label} message={param.hint}>
        <Checkbox
          label={Boolean(value) ? "Yes" : "No"}
          checked={Boolean(value)}
          onChange={(_e, checked) => onChange(param.id, checked)}
        />
      </FormItem>
    );
  }

  if (param.type === "choice" && param.options) {
    return (
      <FormItem
        label={param.label}
        required={param.required}
        message={hasError ? error : param.hint}
        error={hasError}
      >
        <Dropdown
          items={dropdownItems}
          selection={dropdownSelection}
          onSelect={(_e, item) => onChange(param.id, item.id)}
        />
      </FormItem>
    );
  }

  // string / secret
  return (
    <FormItem
      label={param.label}
      required={param.required}
      message={hasError ? error : param.hint}
      error={hasError}
    >
      <TextField
        value={typeof value === "string" ? value : ""}
        inputType={param.secret ? "password" : "text"}
        autoComplete={param.secret ? false : undefined}
        onChange={(_e, newValue) => onChange(param.id, newValue)}
      />
    </FormItem>
  );
}
