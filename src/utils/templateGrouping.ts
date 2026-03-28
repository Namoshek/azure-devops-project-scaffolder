import { DiscoveredTemplate, ALL_CATEGORY_NAME, OTHERS_CATEGORY_NAME } from "../types/templateTypes";

export interface TemplateCategory {
  name: string;
  templates: DiscoveredTemplate[];
  isEmpty: boolean;
}

export function groupTemplates(templates: DiscoveredTemplate[], configuredCategories: string[]): TemplateCategory[] {
  // Prepend the virtual "All" category that shows every filtered template.
  const result: TemplateCategory[] = [
    {
      name: ALL_CATEGORY_NAME,
      templates,
      isEmpty: templates.length === 0,
    },
  ];

  const grouped: Record<string, DiscoveredTemplate[]> = {};
  for (const category of configuredCategories) {
    grouped[category] = [];
  }

  const others: DiscoveredTemplate[] = [];

  for (const template of templates) {
    let matchedAny = false;
    for (const category of template.definition.templateCategories ?? []) {
      if (grouped[category] !== undefined) {
        grouped[category].push(template);
        matchedAny = true;
      }
    }
    if (!matchedAny) {
      others.push(template);
    }
  }

  for (const name of configuredCategories) {
    result.push({
      name,
      templates: grouped[name],
      isEmpty: grouped[name].length === 0,
    });
  }

  result.push({
    name: OTHERS_CATEGORY_NAME,
    templates: others,
    isEmpty: others.length === 0,
  });

  return result;
}
