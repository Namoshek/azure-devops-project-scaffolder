import React, { useMemo } from "react";
import { Button } from "azure-devops-ui/Components/Button/Button";
import { Card } from "azure-devops-ui/Components/Card/Card";
import { Spinner } from "azure-devops-ui/Components/Spinner/Spinner";
import { SpinnerSize } from "azure-devops-ui/Components/Spinner/Spinner.Props";
import { TextField } from "azure-devops-ui/Components/TextField/TextField";
import { FormItem as FormItemBase } from "azure-devops-ui/Components/FormItem/FormItem";
import { ITableColumn, SimpleTableCell, Table } from "azure-devops-ui/Table";
import { ArrayItemProvider } from "azure-devops-ui/Utilities/Provider";
import { OTHERS_CATEGORY_NAME } from "../../../types/templateTypes";
import { useCategoryEditor } from "../hooks/useCategoryEditor";

const FormItem = FormItemBase as React.ComponentType<
  React.ComponentProps<typeof FormItemBase> & { children?: React.ReactNode }
>;

interface CategoryRow {
  name: string;
  isOthers: boolean;
}

export function TemplateCategoriesTab() {
  const {
    loadingState,
    categories,
    newCategoryName,
    saving,
    feedback,
    canAdd,
    hasChanges,
    setNewCategoryName,
    handleAddCategory,
    handleRemoveCategory,
    handleMoveCategory,
    handleSave,
  } = useCategoryEditor();

  const itemProvider = useMemo(
    () =>
      new ArrayItemProvider<CategoryRow>([
        ...categories.map((name) => ({ name, isOthers: false })),
        { name: OTHERS_CATEGORY_NAME, isOthers: true },
      ]),
    [categories],
  );

  const columns: ITableColumn<CategoryRow>[] = [
    {
      id: "order",
      name: "",
      width: -10,
      renderCell: (rowIndex, columnIndex, tableColumn, item) => (
        <SimpleTableCell key={`ord-${item.name}`} columnIndex={columnIndex} tableColumn={tableColumn}>
          {!item.isOthers && (
            <div className="flex-row">
              <Button
                iconProps={{ iconName: "ChevronUp" }}
                subtle
                ariaLabel={`Move "${item.name}" up`}
                disabled={saving || rowIndex === 0}
                onClick={() => handleMoveCategory(rowIndex, "up")}
              />
              <Button
                iconProps={{ iconName: "ChevronDown" }}
                subtle
                ariaLabel={`Move "${item.name}" down`}
                disabled={saving || rowIndex === categories.length - 1}
                onClick={() => handleMoveCategory(rowIndex, "down")}
              />
            </div>
          )}
        </SimpleTableCell>
      ),
    },
    {
      id: "name",
      name: "Category",
      width: -80,
      renderCell: (_rowIndex, columnIndex, tableColumn, item) => (
        <SimpleTableCell key={`name-${item.name}`} columnIndex={columnIndex} tableColumn={tableColumn}>
          {item.isOthers ? (
            <span className="secondary-text text-ellipsis">
              {item.name}&ensp;<em>(default — always last)</em>
            </span>
          ) : (
            <span className="text-ellipsis">{item.name}</span>
          )}
        </SimpleTableCell>
      ),
    },
    {
      id: "remove",
      name: "",
      width: -10,
      renderCell: (rowIndex, columnIndex, tableColumn, item) => (
        <SimpleTableCell key={`del-${item.name}`} columnIndex={columnIndex} tableColumn={tableColumn}>
          {!item.isOthers && (
            <Button
              iconProps={{ iconName: "Cancel" }}
              subtle
              ariaLabel={`Remove category "${item.name}"`}
              disabled={saving}
              onClick={() => handleRemoveCategory(rowIndex)}
            />
          )}
        </SimpleTableCell>
      ),
    },
  ];

  if (loadingState === "loading") {
    return <Spinner size={SpinnerSize.large} label="Loading settings…" />;
  }

  return (
    <Card className="bolt-card-white" titleProps={{ text: "Template Categories" }}>
      <div className="rhythm-vertical-16" style={{ padding: "8px 0" }}>
        <p className="body-m secondary-text" style={{ margin: 0 }}>
          Define the categories shown in the template selection panel. Templates can declare one or more categories via
          the <code>templateCategories</code> field in their <code>project-template.yml</code>. Templates that do not
          match any configured category are listed under &ldquo;{OTHERS_CATEGORY_NAME}&rdquo;.
        </p>

        <Table<CategoryRow> ariaLabel="Template categories" columns={columns} itemProvider={itemProvider} />

        <FormItem label="New category name">
          <div className="flex-row rhythm-horizontal-8" style={{ gap: 8 }}>
            <div style={{ flex: 1 }}>
              <TextField
                value={newCategoryName}
                onChange={(_e, val) => setNewCategoryName(val)}
                placeholder="e.g. Backend"
                disabled={saving}
              />
            </div>
            <Button text="Add Category" disabled={!canAdd || saving} onClick={handleAddCategory} />
          </div>
        </FormItem>

        <div className="flex-row flex-center" style={{ gap: 8 }}>
          <Button text="Save" primary disabled={!hasChanges || saving} onClick={() => void handleSave()} />
          {feedback && (
            <span
              className="body-m"
              style={
                feedback.type === "error"
                  ? { color: "var(--status-error-foreground)" }
                  : { color: "var(--status-success-foreground)" }
              }
            >
              {feedback.text}
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}
