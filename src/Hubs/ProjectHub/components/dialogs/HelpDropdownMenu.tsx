import React, { useState } from "react";
import { MenuButton } from "azure-devops-ui/Components/Menu/MenuButton";
import { MenuItemType } from "azure-devops-ui/Components/Menu/Menu.Props";
import { HelpDialog } from "./HelpDialog";

export function HelpDropdownMenu() {
  const [helpOpen, setHelpOpen] = useState(false);

  return (
    <>
      <MenuButton
        text="Help"
        iconProps={{ iconName: "Unknown" }}
        subtle={true}
        contextualMenuProps={{
          menuProps: {
            id: "help-menu",
            items: [
              {
                id: "how-it-works",
                text: "How it works",
                iconProps: { iconName: "Unknown" },
                onActivate: () => setHelpOpen(true),
              },
              {
                id: "divider",
                itemType: MenuItemType.Divider,
              },
              {
                id: "github",
                text: "View on GitHub",
                iconProps: { iconName: "NavigateExternalInline" },
                href: "https://github.com/Namoshek/azure-devops-project-scaffolder",
                target: "_blank",
                rel: "noopener noreferrer",
              },
            ],
          },
        }}
      />

      <HelpDialog open={helpOpen} onDismiss={() => setHelpOpen(false)} />
    </>
  );
}
