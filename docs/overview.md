# Project Scaffolder

Scaffold repositories and Azure Pipelines across your Azure DevOps projects from your own templates — guided, parameterized, and non-destructive.

![Template Selection](https://raw.githubusercontent.com/Namoshek/azure-devops-project-scaffolder/refs/heads/main/images/screenshot_template_selection.png)

---

## Overview

**Project Scaffolder** is an Azure DevOps extension that puts consistent project bootstrapping in the hands of every project administrator — no scripts, no manual steps.

Teams define reusable templates as YAML files stored in ordinary Git repositories anywhere in the collection. The extension discovers those templates automatically via Code Search, presents them in a clean selection UI, prompts for the parameters each template needs, and then creates the requested repositories and pipelines in a single orchestrated run.

Users can only use templates that they have access to, since the extension runs in the context of the user. Furthermore, users can only create repositories and pipelines in projects where they have permissions, and the extension will skip any resources that the user may not create (e.g. when they are allowed to create repositories, but not pipelines).

Everything is **non-destructive**: if a repository already exists and has commits, the extension skips it rather than overwriting it. Failed steps are clearly flagged while successfully completed steps are preserved.

---

## Features

- **Automatic template discovery** — Templates are discovered automatically from all repositories in the collection that contain a `project-template.yml` file. No manual registration required.
- **Parameterized templates** — Templates declare typed parameters (string, boolean, choice) with optional validation, hints, and conditional visibility rules. Repository names, file paths, and file contents are all rendered through Mustache.js.
- **Conditional resources** — Entire repositories, service connections, variable groups, or pipelines can be skipped based on parameter values, keeping templates flexible without forking.
- **Guided progress UI** — A step-by-step progress view shows which repositories, service connections, variable groups, and pipelines are being created, with clear success and error indicators.
- **Non-destructive execution** — Existing repositories with content are never modified. The extension creates only what is missing.
- **Template categories** — Organization administrators can define categories to group and filter templates, making large template libraries easy to navigate.
- **Project restriction** — Administrators may restrict which project's templates are offered to users, enabling centralized governance of the template library.
- **Admin hub** — A dedicated settings page gives organization / collection administrators control over categories and project restrictions.

---

## How It Works

1. **Browse templates** — Open _Project Settings_ → _Project Scaffolding_. The extension discovers all `project-template.yml` files across the accessible projects (or where configured by the administrator) and presents them as cards, grouped by category.

2. **Select a template** — Choose the template that matches your project type. Each card shows the template name, description, version, and maintainer(s).

3. **Fill in parameters** — A form renders the template's declared parameters including validation rules and conditional fields. All inputs are validated before submission.

4. **Preview** — During parameterization, a preview summarizes the repositories, service connections, variable groups, and pipelines that will be created, or why they cannot be created. Any resources that already exist are clearly flagged.

5. **Scaffold** — The extension creates repositories (copying and rendering template files via Mustache), creates service connections, creates Library variable groups, and registers YAML pipelines pointing to the newly created repos. A live progress view tracks each step.

---

## Getting Started

### 1. Install the extension

Install **Project Scaffolder** from the Visual Studio Marketplace into your Azure DevOps organization or server instance.

### 2. Create your first template

Create a new repository in any project in your collection and add a `project-template.yml` file at the root. The minimal template looks like this:

```yaml
id: "your-guid-here"
name: "My First Template"
version: "1.0.0"
description: "A short description shown on the template card."
templateCategories:
  - "Backend"
maintainers:
  - "Platform Team"

parameters:
  - id: projectName
    label: "Project Name"
    hint: "A descriptive but technical name for your project (lowercase, no spaces)"
    type: string
    required: true
    validation:
      regex: "^[a-zA-Z][a-zA-Z0-9-]+$"
      message: "Letters, numbers, hyphens only. Must start with a letter."

scaffoldingSteps:
  - type: repository
    name: "{{projectName}}.backend"
    sourcePath: "templates/backend"
    defaultBranch: "main"

  - type: pipeline
    name: "{{projectName}}-backend-ci"
    repository: "{{projectName}}.backend"
    yamlPath: "pipelines/ci.yml"
```

Place the files you want to copy into the `templates/backend` subfolder. File names and file contents can use Mustache expressions like `{{projectName}}`.

### 3. Open Project Scaffolding

Navigate to any project → _Project Settings_ → _Project Scaffolding_. Your template will appear in the list (Code Search indexes new files within a few minutes).

For the full template schema and authoring guide, see the [Template Authoring Guide](https://github.com/Namoshek/azure-devops-project-scaffolder/blob/main/docs/template_authoring.md).

---

## Admin Configuration

Organization administrators have access to a dedicated _Project Scaffolding_ page under _Organization Settings_:

- **Template categories** — Define custom category names. Template authors assign one or more of these categories to their template via the `templateCategories` field in `project-template.yml`. An _All_ tab and an _Others_ fallback are always present.
- **Project restriction** — Optionally restrict template discovery to one or more projects. This is useful when you maintain one or more dedicated "template" projects and want to prevent ad-hoc templates from appearing organization-wide.

---

## Permissions

The extension requests the following OAuth scopes on behalf of the signed-in user:

| Scope                        | Purpose                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------- |
| `vso.code_manage`            | Required to read template files and create repositories                         |
| `vso.build_execute`          | Required to read and create YAML pipeline definitions                           |
| `vso.agentpools`             | Required to read agent queues for pipeline registration                         |
| `vso.project`                | Required to read project list (used in the admin restriction dropdown)          |
| `vso.serviceendpoint_manage` | Required to manage service endpoints (create and configure service connections) |
| `vso.variablegroups_manage`  | Required to create and configure library variable groups                        |

All API calls are made directly from the browser using the user's own OAuth token — no server-side component or service principal is required.

---

## Screenshots

![Template Selection](https://raw.githubusercontent.com/Namoshek/azure-devops-project-scaffolder/refs/heads/main/images/screenshot_template_selection.png)

![Template Parameterization](https://raw.githubusercontent.com/Namoshek/azure-devops-project-scaffolder/refs/heads/main/images/screenshot_template_parameterization.png)

![Template Summary / Permission Error](https://raw.githubusercontent.com/Namoshek/azure-devops-project-scaffolder/refs/heads/main/images/screenshot_template_summary_permission_error.png)

![Template Scaffolding Progress](https://raw.githubusercontent.com/Namoshek/azure-devops-project-scaffolder/refs/heads/main/images/screenshot_template_scaffolding_progress.png)

![Admin Hub Project Restriction](https://raw.githubusercontent.com/Namoshek/azure-devops-project-scaffolder/refs/heads/main/images/screenshot_admin_hub_project_restriction.png)

![Admin Hub Template Categories](https://raw.githubusercontent.com/Namoshek/azure-devops-project-scaffolder/refs/heads/main/images/screenshot_admin_hub_template_categories.png)

![Admin Hub Audit](https://raw.githubusercontent.com/Namoshek/azure-devops-project-scaffolder/refs/heads/main/images/screenshot_admin_hub_audit.png)
