import React, { useState } from "react";
import { Button } from "azure-devops-ui/Components/Button/Button";
import { Dialog as DialogBase } from "azure-devops-ui/Components/Dialog/Dialog";
import sampleTemplate from "../../../../../examples/project-template.yml";
import { ContentSize } from "azure-devops-ui/Callout";
import { TitleSize } from "azure-devops-ui/Header";

const Dialog = DialogBase as React.ComponentType<
  React.ComponentProps<typeof DialogBase> & { children?: React.ReactNode }
>;

export function HowItWorksDialog() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        text="How does templating work?"
        iconProps={{ iconName: "Info" }}
        subtle={true}
        onClick={() => setOpen(true)}
      />

      {open && (
        <Dialog
          titleProps={{
            text: "How does templating work?",
            size: TitleSize.Large,
          }}
          showCloseButton
          onDismiss={() => setOpen(false)}
          contentSize={ContentSize.ExtraLarge}
        >
          <div style={{ maxWidth: 680 }}>
            <h3 style={{ marginTop: 0 }}>Template discovery</h3>
            <p>
              The extension automatically discovers templates across all accessible projects in this collection using
              Code Search. Any repository that contains a <code>project-template.yml</code> file at its root is treated
              as a template and appears in this list.
            </p>
            <p>
              You only have access to templates in projects you have access to because the extension runs in the scope
              of the authenticated user that uses it. If you want to create templates per team for example, simply use a
              project per team with the respective permissions.
            </p>

            <h3>What scaffolding does</h3>
            <p>When a project admin runs a template, the extension will:</p>
            <ol>
              <li style={{ listStyle: "disc" }}>
                Create one or more <strong>repositories</strong> by copying files from the template repository,
                rendering all file content and file names through{" "}
                <a href="https://handlebarsjs.com/" target="_blank" rel="noopener noreferrer">
                  Handlebars.js
                </a>{" "}
                using the values you provide in the parameter form.
              </li>
              <li style={{ listStyle: "disc" }}>
                Register <strong>YAML pipelines</strong> pointing to pipeline files within the newly created
                repositories.
              </li>
            </ol>
            <p>
              Scaffolding is <strong>non-destructive</strong>: if a repository already exists and has commits, it is
              skipped rather than overwritten.
            </p>

            <h3>Creating a template</h3>
            <p>
              Create a repository in any project, add a <code>project-template.yml</code> at the root, and place your
              file templates in subfolders referenced by <code>sourcePath</code> (or leave empty if the entire
              repository is a template). The template will appear here automatically within minutes, as soon as the code
              search has indexed the template repository.
            </p>

            <h3>
              Sample <code>project-template.yml</code>
            </h3>
            <pre
              style={{
                background: "var(--palette-black-alpha-6, #f4f4f4)",
                borderRadius: 4,
                padding: "12px 16px",
                overflowX: "auto",
                fontSize: 12,
                margin: "8px 0 0",
              }}
            >
              {sampleTemplate}
            </pre>
          </div>
        </Dialog>
      )}
    </>
  );
}
