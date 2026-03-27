# Template Authoring Guide

This guide explains how to create project templates for the **Project Scaffolding** Azure DevOps extension.

---

## Overview

A template is any repository in the collection that contains a `project-template.yml` file in its root. The extension discovers these automatically via Code Search and presents them to project administrators in the "Project Scaffolding" page under Project Settings.

When a user selects a template and fills in the parameter form, the extension:

1. Creates new repositories by copying files from `sourcePath` subfolders, rendering all content and file names through [Handlebars.js](https://handlebarsjs.com/).
2. Creates YAML pipeline definitions pointing to the created repositories.

Everything is **non-destructive**: if a repository already exists and has commits, it is skipped (not overwritten).

---

## `project-template.yml` Schema Reference

```yaml
# ── Required ──────────────────────────────────────────────────────────
id: "04bd1234-5678-90ab-cdef-1234567890ab" # Unique GUID — generate once and never change
name: "My Template" # Display name shown to users
version: "1.0.0" # Informational; shown in the template card

# ── Optional ──────────────────────────────────────────────────────────
description: "Short description shown in the template card"
maintainers:
  - "Your Team Name"

# ── Parameters ────────────────────────────────────────────────────────
parameters:
  - id: projectName # Used in Handlebars: {{projectName}}
    label: "Project Name"
    hint: "Lowercase letters, numbers, and hyphens only"
    type: string # string | boolean | choice
    required: true
    validation:
      regex: "^[a-z][a-z0-9-]+$"
      message: "Lowercase letters, numbers, hyphens only. Must start with a letter."

  - id: teamName
    label: "Team"
    type: choice
    required: true
    options:
      - "Platform Team"
      - "Web Team"

  - id: includeDocker
    label: "Include Docker Support"
    type: boolean
    defaultValue: false

  - id: dockerRegistry
    label: "Container Registry URL"
    type: string
    when: "includeDocker == true" # Only shown when includeDocker is checked

# ── Repositories ──────────────────────────────────────────────────────
repositories:
  - name: "{{projectName}}.backend" # Handlebars in repo name ✔
    sourcePath: "templates/backend" # Subfolder in THIS repository
    defaultBranch: "main"
    exclude: # Optional: exclude individual files
      - path: "Dockerfile"
        when: "!includeDocker" # excluded when includeDocker is false
      - path: "docker-compose.yml"
        when: "!includeDocker"

  - name: "{{projectName}}.docker-infra"
    sourcePath: "templates/docker"
    defaultBranch: "main"
    when: "includeDocker" # Optional: skip this entire repo when false

# ── Pipelines ─────────────────────────────────────────────────────────
pipelines:
  - name: "{{projectName}}-ci"
    repository: "{{projectName}}.backend" # Must match a repository name above (after rendering)
    yamlPath: "pipelines/ci.yml" # Path within the target repo
    folder: "\\CI" # Pipeline folder in ADO (optional)

  - name: "{{projectName}}-docker-build"
    repository: "{{projectName}}.backend"
    yamlPath: "pipelines/docker.yml"
    folder: "\\CI"
    when: "includeDocker" # Optional: skip this pipeline when false
```

---

## File Structure

Place template files in subfolders referenced by `sourcePath`. The `project-template.yml` itself is **never** copied into the created repositories.

```
your-template-repo/
├── project-template.yml          ← required at root
└── templates/
    ├── backend/
    │   ├── README.md
    │   ├── src/
    │   │   └── {{projectName}}.csproj    ← file name rendered via Handlebars
    │   └── pipelines/
    │       └── ci.yml
    └── frontend/
        ├── package.json
        └── src/
            └── index.ts
```

---

## Handlebars in File Content

All text files are rendered through [Handlebars.js](https://handlebarsjs.com/). Every parameter `id` is available as a variable:

```yaml
# In any text file:
<PackageId>{{projectName}}</PackageId>
<Authors>{{teamName}}</Authors>

{{#if includeDocker}}
# Docker support enabled
FROM mcr.microsoft.com/dotnet/runtime:8.0
{{/if}}
```

File **paths and names** are also rendered:

```
src/{{projectName}}.csproj   →   src/my-service.csproj
```

Binary files (images, fonts, etc.) are copied as-is without Handlebars rendering.

---

## `when` Expressions

Use the `when` field on any parameter to conditionally show or hide it based on the value of another parameter.

Supported syntax:

| Expression                | Meaning        |
| ------------------------- | -------------- |
| `paramId`                 | Show if truthy |
| `!paramId`                | Show if falsy  |
| `paramId == "value"`      | Equality       |
| `paramId != "value"`      | Inequality     |
| `a == true && b == "x"`   | AND            |
| `a == true \|\| b == "x"` | OR             |

---

## Optional Files and Resources

### Conditional repositories and pipelines

Add a `when` field to any `repository` or `pipeline` entry to skip it entirely when the condition evaluates to false. The same expression syntax used for parameter visibility applies here.

```yaml
repositories:
  - name: "{{projectName}}.docker-infra"
    sourcePath: "templates/docker"
    defaultBranch: "main"
    when: "includeDocker" # entire repo is skipped when includeDocker is false

pipelines:
  - name: "{{projectName}}-docker-build"
    repository: "{{projectName}}.backend"
    yamlPath: "pipelines/docker.yml"
    folder: "\\CI"
    when: "includeDocker" # pipeline is skipped when includeDocker is false
```

Skipped entries still appear in the scaffolding progress view with a **Skipped** status, giving the user full visibility into what was conditionally omitted.

### Excluding individual files from a repository

Add an `exclude` list to a repository entry to drop specific files based on parameter values:

```yaml
repositories:
  - name: "{{projectName}}.backend"
    sourcePath: "templates/backend"
    defaultBranch: "main"
    exclude:
      - path: "Dockerfile"
        when: "!includeDocker" # exclude this file when Docker is disabled
      - path: "docker-compose.yml"
        when: "!includeDocker"
      - path: "always-omitted.txt" # no when = always excluded
```

- `path` must match the file path **relative to `sourcePath`**, with no leading slash.
- `when` uses the same expression syntax as parameter `when` fields. The file is excluded when the expression evaluates to **true** — the `when` expresses the _exclusion condition_, not the inclusion condition.
- Omitting `when` always excludes the file.

> **Tip:** Use `{{#if}}` blocks inside files for inline optional content, and `exclude` for entirely optional files.

---

## Tips for Template Authors

1. **Use globally unique GUIDs** for the `id` field. Generate one at [uuidgenerator.net](https://www.uuidgenerator.net/) and never reuse it across templates.
2. **Validate with Code Search** — after adding your `project-template.yml`, open the Project Scaffolding page and confirm your template appears. If it doesn't, check the browser console for parse errors.
3. **Test non-destructive re-runs** — scaffold the same template twice. All repos with commits should appear as "skipped" on the second run.
4. **Keep `sourcePath` relative** — e.g. `templates/backend`, not `/templates/backend`.
5. **Binary files** — any file with a non-text extension (`.png`, `.zip`, `.dll`, etc.) is copied using base64 encoding. No Handlebars processing is applied.
