import { useState, useEffect, useRef } from "react";
import { TemplateDefinition } from "../../../types/templateTypes";
import { checkTemplateResourcesExistence, ResourceExistenceMap } from "../../../services/preflightCheckService";

export interface UsePreflightChecksResult {
  preflightChecks: ResourceExistenceMap | null;
  preflightPending: boolean;
}

export function usePreflightChecks(
  projectId: string,
  template: TemplateDefinition,
  values: Record<string, unknown>,
): UsePreflightChecksResult {
  const [preflightChecks, setPreflightChecks] = useState<ResourceExistenceMap | null>(null);
  const [preflightPending, setPreflightPending] = useState(true);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setPreflightPending(true);

    if (debounceTimer.current !== null) {
      clearTimeout(debounceTimer.current);
    }

    debounceTimer.current = setTimeout(() => {
      void checkTemplateResourcesExistence(projectId, template, values).then(
        (result) => {
          setPreflightChecks(result);
          setPreflightPending(false);
        },
        () => {
          // Fail open: if checks error out, leave preflightChecks untouched.
          setPreflightPending(false);
        },
      );
    }, 500);

    return () => {
      if (debounceTimer.current !== null) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [values, projectId, template]);

  return { preflightChecks, preflightPending };
}
