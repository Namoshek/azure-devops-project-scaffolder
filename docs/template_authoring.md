# Template Authoring Guide

This guide explains how to create project templates for the **Project Scaffolding** Azure DevOps extension.

---

## Overview

A template is any repository in the collection that contains a `project-template.yml` file in its root. The extension discovers these automatically via Code Search and presents them to project administrators in the "Project Scaffolding" page under Project Settings. If project restrictions are configured, only templates from allowed projects will be shown.
Users can only see templates from projects they have at least read access to.

When a user selects a template and fills in the parameter form, the extension:

1. Creates new repositories by copying files from `sourcePath` subfolders (or the template repository root if `sourcePath` is empty), rendering all content and file names through [Handlebars.js](https://handlebarsjs.com/).
2. Creates YAML pipeline definitions pointing to designated files in the created repositories.

Everything is **non-destructive**: if a repository already exists and has commits, it is skipped (not overwritten).

---

## `project-template.yml` Schema Reference

```yaml
# ── Template metadata ──────────────────────────────────────────────────────────────
id: "04bd1234-5678-90ab-cdef-1234567890ab" # UUID, generate once and never change
name: "My Template" # Display name shown to users
version: "1.0.0" # Currently only informational, shown in the template card
description: "Short description shown in the template card"
templateCategories:
  - "Backend"
  - "Docker"
maintainers:
  - "Your Team Name"
  - "Or individual names or contact info"

# ── Optional notes (displayed before and after scaffolding) ────────────────────────

preScaffoldNotes:
  - |-
    Make sure your project name matches the naming convention agreed upon by the Platform Team.
    Use kebab-case (e.g. my-awesome-service).
  - "You will need at least Project Administrator permissions in the target project."

postScaffoldNotes:
  - |-
    Your repositories have been created and the CI pipelines are ready.
    The first pipeline run will be triggered automatically on the next commit to main.
  - |-
    Remember to configure your service connections and environment-specific variable
    groups before deploying to production.

# ── Parameters used by Handlebars.js ───────────────────────────────────────────────
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

# ── Repositories ───────────────────────────────────────────────────────────────────
repositories:
  - name: "{{projectName}}.backend" # Handlebars in repo name ✔
    sourcePath: "templates/backend" # Subfolder in the template repository
    defaultBranch: "main" # Optional, the default is 'main'
    exclude: # Optional: exclude individual files
      - path: "Dockerfile"
        when: "!includeDocker" # excluded when includeDocker is false
      - path: "docker-compose.yml"
        when: "!includeDocker"

  - name: "{{projectName}}.docker-infra"
    sourcePath: "templates/docker"
    defaultBranch: "main"
    when: "includeDocker" # Optional: skip this entire repo when false

# ── Pipelines ──────────────────────────────────────────────────────────────────────
pipelines:
  - name: "{{projectName}}-ci"
    repository: "{{projectName}}.backend" # Must match a repository name above
    yamlPath: "pipelines/ci.yml" # Path within the target repo
    folder: "\\CI" # Pipeline folder in ADO (optional, default is root)

  - name: "{{projectName}}-docker-build"
    repository: "{{projectName}}.backend"
    yamlPath: "pipelines/docker.yml"
    folder: "\\CI"
    when: "includeDocker" # Optional: skip this pipeline when false
```

---

## File Structure

Place template files either in the template repository root or in subfolders referenced by `sourcePath`. The latter is useful if multiple repositories will be scaffolded from a single template, e.g. a frontend and a backend.

Note: the `project-template.yml` itself is **never** copied into the created repositories. Excluding it manually is not necessary.

**Example repository structure:**

```
/
├── project-template.yml          ← must be placed in the template repository root
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

All text files are rendered through [Handlebars.js](https://handlebarsjs.com/). Every parameter is available as a variable.

**Use `string` and `choice` parameters:**

```xml
<PackageId>{{projectName}}</PackageId>
<Authors>{{teamName}}</Authors>
```

**Use `boolean` parameters for conditions:**

```xml
{{#if includeDocker}}
<ContainerImageName>{{projectName}}-backend</ContainerImageName>
<ContainerImageTag>1.0.0</ContainerImageTag>
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
