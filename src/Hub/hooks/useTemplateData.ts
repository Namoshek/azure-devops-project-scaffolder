import { useState, useEffect, useMemo } from "react";
import { DiscoveredTemplate, ALL_CATEGORY_NAME } from "../types/templateTypes";
import { discoverTemplates } from "../services/templateDiscoveryService";
import { getTemplateCategories } from "../services/extensionSettingsService";
import { ListSelection } from "azure-devops-ui/List";
import { ArrayItemProvider } from "azure-devops-ui/Utilities/Provider";
import { groupTemplates, TemplateCategory } from "../utils/templateGrouping";

export interface UseTemplateDataResult {
  loading: boolean;
  error: string | null;
  templates: DiscoveredTemplate[];
  selectedCategory: string;
  setSelectedCategory: (name: string) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  groups: TemplateCategory[];
  groupItemProvider: ArrayItemProvider<TemplateCategory>;
  groupSelection: ListSelection;
}

export function useTemplateData(): UseTemplateDataResult {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<DiscoveredTemplate[]>([]);
  const [configuredCategories, setConfiguredCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>(ALL_CATEGORY_NAME);
  const [searchQuery, setSearchQuery] = useState("");

  // Stable selection object for the ADO List component — must not change between renders.
  const groupSelection = useMemo(() => new ListSelection({ selectOnFocus: false }), []);

  // Filter templates by name and description based on the search query.
  const filteredTemplates = useMemo(() => {
    const searchTerm = searchQuery.trim().toLowerCase();

    if (!searchTerm) {
      return templates;
    }

    return templates.filter(
      (t) =>
        t.definition.name.toLowerCase().includes(searchTerm) ||
        (t.definition.description ?? "").toLowerCase().includes(searchTerm),
    );
  }, [templates, searchQuery]);

  const groups = useMemo(
    () => groupTemplates(filteredTemplates, configuredCategories),
    [filteredTemplates, configuredCategories],
  );

  const groupItemProvider = useMemo(() => new ArrayItemProvider(groups), [groups]);

  useEffect(() => {
    Promise.all([discoverTemplates(), getTemplateCategories()])
      .then(([templates, categories]) => {
        setTemplates(templates);
        setConfiguredCategories(categories);

        // Always start on the "All" category (index 0).
        setSelectedCategory(ALL_CATEGORY_NAME);
        groupSelection.select(0);
      })
      .catch((err) => {
        setError((err as Error).message);
      })
      .finally(() => setLoading(false));
  }, [groupSelection]);

  return {
    loading,
    error,
    templates,
    selectedCategory,
    setSelectedCategory,
    searchQuery,
    setSearchQuery,
    groups,
    groupItemProvider,
    groupSelection,
  };
}
