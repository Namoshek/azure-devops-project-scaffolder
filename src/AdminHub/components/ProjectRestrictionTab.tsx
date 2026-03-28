import React, { useMemo, useRef, useEffect } from "react";
import { Button } from "azure-devops-ui/Components/Button/Button";
import { Card } from "azure-devops-ui/Components/Card/Card";
import { Dropdown } from "azure-devops-ui/Components/Dropdown/Dropdown";
import { FormItem as FormItemBase } from "azure-devops-ui/Components/FormItem/FormItem";
import { IListBoxItem } from "azure-devops-ui/Components/ListBox/ListBox.Props";
import { IListSelection } from "azure-devops-ui/Components/List/List.Props";
import { MessageCard } from "azure-devops-ui/Components/MessageCard/MessageCard";
import { MessageCardSeverity } from "azure-devops-ui/Components/MessageCard/MessageCard.Props";
import { Spinner } from "azure-devops-ui/Components/Spinner/Spinner";
import { SpinnerSize } from "azure-devops-ui/Components/Spinner/Spinner.Props";
import { DropdownMultiSelection } from "azure-devops-ui/Utilities/DropdownSelection";
import { ISelectionRange } from "azure-devops-ui/Utilities/Selection";
import { useProjectRestriction } from "../hooks/useProjectRestriction";

const FormItem = FormItemBase as React.ComponentType<
  React.ComponentProps<typeof FormItemBase> & { children?: React.ReactNode }
>;

const MAX_SHOWN_NAMES = 2;

export function ProjectRestrictionTab() {
  const { loadingState, saving, feedback, allProjects, checkedIds, hasChanges, setAllChecked, handleSave } =
    useProjectRestriction();

  const dropdownSelection = useMemo(() => new DropdownMultiSelection(), []);
  const isInitialized = useRef(false);
  const setAllCheckedRef = useRef(setAllChecked);
  setAllCheckedRef.current = setAllChecked;

  const allItems = useMemo<IListBoxItem[]>(() => allProjects.map((p) => ({ id: p.id!, text: p.name })), [allProjects]);

  // Set initial selection once after data loads.
  // This runs before the subscription effect, so setting dropdownSelection.value
  // here does not trigger the subscription callback yet.
  useEffect(() => {
    if (loadingState !== "ready" || isInitialized.current) return;
    isInitialized.current = true;
    const ranges: ISelectionRange[] = allProjects
      .map((p, i) => (checkedIds.has(p.id!) ? i : -1))
      .filter((i) => i >= 0)
      .map((i) => ({ beginIndex: i, endIndex: i }));
    dropdownSelection.value = ranges;
  }, [loadingState, allProjects, checkedIds, dropdownSelection]);

  // Sync dropdown selection changes back to hook state.
  // Subscribe only to "select" and "unselect" actions (user-driven toggling).
  // We deliberately avoid the catch-all subscription so that the "set" event
  // fired by the init effect (dropdownSelection.value = ranges) never triggers
  // this handler — that would race with the hook's loaded checkedIds and clear
  // the restriction list before the user has touched anything.
  useEffect(() => {
    function handleChange() {
      const newIds = new Set<string>();
      for (const range of dropdownSelection.value) {
        for (let i = range.beginIndex; i <= range.endIndex; i++) {
          const item = allItems[i];
          if (item) newIds.add(item.id as string);
        }
      }
      setAllCheckedRef.current(newIds);
    }
    dropdownSelection.subscribe(handleChange, "select");
    dropdownSelection.subscribe(handleChange, "unselect");
    return () => {
      dropdownSelection.unsubscribe(handleChange, "select");
      dropdownSelection.unsubscribe(handleChange, "unselect");
    };
  }, [dropdownSelection, allItems]);

  function renderSelectedItems(sel: IListSelection, items: IListBoxItem[]): string {
    const names: string[] = [];
    items.forEach((item, i) => {
      if (sel.selected(i)) names.push(item.text ?? (item.id as string));
    });
    if (names.length === 0) return "";
    if (names.length <= MAX_SHOWN_NAMES) return names.join(", ");
    const extra = names.length - MAX_SHOWN_NAMES;
    return `${names.slice(0, MAX_SHOWN_NAMES).join(", ")} +${extra} more`;
  }

  if (loadingState === "loading") {
    return <Spinner size={SpinnerSize.large} label="Loading settings…" />;
  }

  return (
    <Card className="bolt-card-white" titleProps={{ text: "Template Source Restriction" }}>
      <div className="rhythm-vertical-16" style={{ padding: "8px 0" }}>
        <p className="body-m secondary-text" style={{ margin: 0 }}>
          By default, the Project Scaffolding hub discovers templates from all projects in this collection. You can
          restrict discovery to specific projects so that only templates from those projects are shown to users.
        </p>

        {checkedIds.size === 0 && (
          <MessageCard severity={MessageCardSeverity.Info}>
            No restriction configured — templates will be discovered across the entire collection.
          </MessageCard>
        )}

        <FormItem label="Restricted to projects">
          <Dropdown
            items={allItems}
            selection={dropdownSelection}
            showFilterBox
            filterPlaceholderText="Search projects…"
            placeholder="All projects (no restriction)"
            renderSelectedItems={renderSelectedItems}
            showChecksColumn
            disabled={saving}
          />
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
