# Template Authoring Guide

This guide explains how to create project templates for the **Project Scaffolding** Azure DevOps extension.

---

## Overview

A template is any repository in the collection that contains a `project-template.yml` file in its root. The extension discovers these automatically via Code Search and presents them to project administrators in the "Project Scaffolding" page under Project Settings. If project restrictions are configured, only templates from allowed projects will be shown.
Users can only see templates from projects they have at least read access to.

When a user selects a template and fills in the parameter form, the extension executes each entry in `scaffoldingSteps` in the order defined by the template:

1. **Repository** — copies files from the specified `sourcePath` subfolder (or the template root if `sourcePath` is empty), rendering all file names and content through [Mustache.js](https://mustache.github.io/).
2. **Service connection** — creates an ADO service endpoint, with all fields rendered through Mustache. Credential fields should reference `secret: true` parameters to ensure secure handling (see [Service Connections](#service-connections) below).
3. **Variable group** — creates a Library variable group, with all fields rendered through Mustache. Secret variables should reference `secret: true` parameters (see [Variable Groups](#variable-groups) below).
4. **Pipeline** — registers a YAML pipeline definition pointing to a designated file in a created repository. The referenced repository must appear earlier in `scaffoldingSteps`.

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
    **Before you start**, please ensure the following:

    | Requirement | Details |
    |---|---|
    | Naming convention | Use kebab-case, e.g. `my-awesome-service` |
    | Permissions | Project Administrator in the target project |
  - "Contact the **{{teamName}}** team if you have questions before proceeding."

postScaffoldNotes:
  - |-
    Your repositories have been created and the CI pipelines are ready.

    **Next steps:**
    1. Clone your new **{{projectName}}** repository and push your first commit.
    2. The pipeline will trigger automatically on every push to `main`.
    3. Review the onboarding checklist in the repo's `README.md`.

# ── Parameters used by Mustache.js ───────────────────────────────────────────────
parameters:
  - id: projectName # Used in Mustache: {{projectName}}
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
    formGroup: "Docker" # Groups this parameter visually with others that share the same label
    when: "includeDocker == true" # Only shown when includeDocker is checked

  - id: includeSonarQube
    label: "Include SonarQube Analysis"
    type: boolean
    formGroup: "Code Quality"
    defaultValue: true

  - id: sonarqubePersonalAccessToken
    label: "SonarQube Personal Access Token"
    type: string
    formGroup: "Code Quality"
    required: true
    when: "includeSonarQube"

# ── Computed booleans (optional) ───────────────────────────────────────────────────
computed:
  - id: isWebTeam # Used in Mustache: {{#isWebTeam}}...{{/isWebTeam}}
    expression: "teamName == 'Web Team'" # Same syntax as any 'when' field
  - id: dockerAndSonar
    expression: "includeDocker && includeSonarQube"

# ── Scaffolding Steps ──────────────────────────────────────────────────────────────
scaffoldingSteps:
  - type: repository
    name: "{{projectName}}.backend" # Mustache in repo name ✔
    sourcePath: "templates/backend" # Subfolder in the template repository
    defaultBranch: "main" # Optional, the default is 'main'
    exclude: # Optional: exclude individual files
      - path: "Dockerfile"
        when: "!includeDocker" # excluded when includeDocker is false
      - path: "docker-compose.yml"
        when: "!includeDocker"

  - type: repository
    name: "{{projectName}}.docker-infra"
    sourcePath: "templates/docker"
    defaultBranch: "main"
    when: "includeDocker" # Optional: skip this entire repo when false

  - type: serviceConnection
    name: "SonarQube"
    endpointType: "sonarqube"
    authorizationScheme: "UsernamePassword"
    authorization:
      username: "{{sonarqubePersonalAccessToken}}"
      password: ""
    url: "https://sonarqube.example.com"
    description: "SonarQube for static code analysis"
    grantAccessToAllPipelines: true
    when: "includeSonarQube" # Optional: skip this connection when false

  - type: variableGroup
    name: "{{projectName}}-pipeline-vars"
    description: "Shared pipeline variables for {{projectName}}"
    grantAccessToAllPipelines: true
    variables:
      - name: "PROJECT_NAME"
        value: "{{projectName}}"
      - name: "DB_PASSWORD"
        value: "{{dbPassword}}"
        secret: true
    when: "includeBackend"

  - type: pipeline
    name: "{{projectName}}-ci"
    repository: "{{projectName}}.backend" # Must match a repository name above
    yamlPath: "pipelines/ci.yml" # Path within the target repo
    folder: "\\CI" # Pipeline folder in ADO (optional, default is root)

  - type: pipeline
    name: "{{projectName}}-docker-build"
    repository: "{{projectName}}.backend"
    yamlPath: "pipelines/docker.yml"
    folder: "\\CI"
    when: "includeDocker" # Optional: skip this pipeline when false
```

---

## Markdown in Notes

`preScaffoldNotes` and `postScaffoldNotes` support GitHub-flavored Markdown (GFM). Use Markdown to structure guidance clearly, particularly for multi-step instructions or tables of required information.

### Supported syntax

| Syntax          | Example                                  |
| --------------- | ---------------------------------------- |
| **Bold**        | `**important**`                          |
| _Italic_        | `*note*`                                 |
| Headings        | `## Section Title`                       |
| Bullet list     | `- item one`                             |
| Numbered list   | `1. first step`                          |
| Table           | `\| Col A \| Col B \|` + pipe rows (GFM) |
| Strikethrough   | `~~removed~~`                            |
| Inline code     | `` `kebab-case` ``                       |
| Link            | `[docs](https://example.com)`            |
| Horizontal rule | `---`                                    |
| Task list       | `- [ ] unchecked` / `- [x] checked`      |

### Mustache tokens inside Markdown

`{{paramId}}` tokens are **interpolated before** the Markdown step, so they work anywhere inside your Markdown:

```yaml
postScaffoldNotes:
  - |-
    ## Your project **{{projectName}}** is ready

    | Resource | Link |
    |---|---|
    | Repository | `{{projectName}}.backend` |
    | Team | {{teamName}} |

    Contact **{{teamName}}** for onboarding support.
```

Unfilled tokens (values not yet entered or left empty) are shown as literal `{{paramId}}` text rather than blank space.

### Backwards compatibility

Existing plain-text notes continue to work without any changes. Multi-line entries written with the YAML `|-` block scalar already displayed each line as a separate visible line, and that behaviour is preserved — single newlines are rendered as visible line breaks.

### Security

Raw HTML inside note strings is **intentionally stripped** and never executed. Only Markdown syntax is rendered. This prevents any HTML injection through template files.

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
    │   │   └── {{projectName}}.csproj    ← file name rendered via Mustache
    │   └── pipelines/
    │       └── ci.yml
    └── frontend/
        ├── package.json
        └── src/
            └── index.ts
```

---

## Mustache in File Content

All text files are rendered through [Mustache.js](https://mustache.github.io/). Every parameter is available as a variable.

**Use `string` and `choice` parameters:**

```xml
<PackageId>{{projectName}}</PackageId>
<Authors>{{teamName}}</Authors>
```

**Use `boolean` parameters for conditions (Mustache truthy sections):**

```xml
{{#includeDocker}}
<ContainerImageName>{{projectName}}-backend</ContainerImageName>
<ContainerImageTag>1.0.0</ContainerImageTag>
{{/includeDocker}}
```

File **paths and names** are also rendered:

```
src/{{projectName}}.csproj   →   src/my-service.csproj
```

Binary files (images, fonts, etc.) are copied as-is without Mustache rendering.

---

## Computed Booleans

Mustache supports `{{#flag}}...{{/flag}}` section blocks but cannot evaluate expressions directly inside template files. The `computed` section solves this by letting you **pre-compute named booleans** from any expression so they become available as Mustache variables alongside your parameters.

### Why you need this

`choice` parameters (and compound conditions across multiple parameters) cannot drive Mustache sections directly, because Mustache only checks whether a value is truthy — it cannot compare strings. `computed` entries bridge that gap.

**Without `computed`** the following is not possible in Mustache:

```
{{#typeOfFrontend == "vite"}}  ← invalid, Mustache cannot do this
...
{{/typeOfFrontend == "vite"}}
```

**With `computed`** we can make this work though:

```yaml
computed:
  - id: isVite
    expression: "typeOfFrontend == 'vite'"
```

We can then use a simple boolean section in Mustache:

```
{{#isVite}}
// vite.config.ts content
{{/isVite}}
```

### YAML syntax

```yaml
# Computed booleans are derived from parameter values at render time.
# They are available as Mustache section tags in template files and as
# identifiers in any 'when' field — but they are NOT shown in the form
# and are NOT written to the audit log.
computed:
  - id: isVite
    expression: "typeOfFrontend == 'vite'"
  - id: isWebpack
    expression: "typeOfFrontend == 'webpack'"
  - id: fullStack
    expression: "includeBackend && includeFrontend"
  - id: isWebTeam
    expression: "teamName == 'Web Team'"
```

| Field        | Required | Description                                                                                                                                |
| ------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`         | Yes      | The identifier injected into the Mustache context. Must be a valid identifier (letters, digits, underscores; must not start with a digit). |
| `expression` | Yes      | A boolean expression using the same syntax as all `when` fields (see [`when` Expressions](#when-expressions) below).                       |

Please be aware that the `id` has to be unique across all `computed` and `parameters` entries.

### Usage in template file content

Once declared, a computed id is available as a Mustache section tag in any template file:

```mustache
{{#isVite}}
  import { defineConfig } from 'vite'; export default defineConfig({ ... });
{{/isVite}}
{{#isWebpack}}
  const path = require('path'); module.exports = { ... };
{{/isWebpack}}
```

Use `{{^id}}` for the inverted (else) branch:

```mustache
{{^isVite}}
// non-vite build setup
{{/isVite}}
```

### Usage in `when` fields

Computed ids can also be used in any `when:` field on parameters and `scaffoldingSteps` entries — exactly like any other parameter id:

```yaml
parameters:
  - id: vitePort
    label: "Dev Server Port"
    type: string
    defaultValue: "5173"
    when: "isVite" # ← computed id used here

scaffoldingSteps:
  - type: repository
    name: "{{projectName}}.frontend"
    sourcePath: "templates/frontend-vite"
    when: "isVite" # ← and here
```

### Scoping and audit behaviour

- Computed ids are **not shown in the parameter form** — they are invisible to the user.
- Computed values are **not written to the audit log** — only raw parameter values are logged.
- Expressions are evaluated against **raw parameter values only**. Computed entries cannot reference each other.
- If a computed `id` collides with a parameter `id`, the computed value takes precedence. Avoid naming collisions.

---

## Parameter Groups

Use the `formGroup` field on any parameter to cluster related parameters into a named section inside the scaffolding form. Parameters that share the same `formGroup` string are rendered together inside the same group of form fields. Parameters without a `formGroup` are rendered after all groups with no visual decoration.

```yaml
parameters:
  - id: projectName
    label: "Project Name"
    type: string
    formGroup: "Project Info"

  - id: teamName
    label: "Team Name"
    type: choice
    formGroup: "Project Info"
    options:
      - "Platform Team"
      - "Web Team"

  - id: includeDocker
    label: "Include Docker Support"
    type: boolean
    formGroup: "Feature Flags"

  - id: includeSonarQube
    label: "Include SonarQube"
    type: boolean
    formGroup: "Feature Flags"

  - id: notes
    label: "Additional Notes" # no formGroup — rendered after all groups
    type: string
```

**Rules:**

- Groups appear in the form in **first-appearance order** — the order of the first parameter that names a given group determines where that group block is placed.
- Parameters without `formGroup` are always rendered **after** all named groups.
- `when` expressions still work normally inside grouped parameters; hidden parameters never produce an empty group block because visibility is evaluated before grouping.
- `formGroup` is purely a form presentation hint and has no effect on Mustache rendering, audit logging, or `when` expression evaluation.

---

## `when` Expressions

Use the `when` field to conditionally control visibility or inclusion based on the current parameter values. It is supported on **parameters** (show/hide the field), all `scaffoldingSteps` entry types — repositories, pipelines, service connections, variable groups — (skip that step when the condition is false), and file **exclude** rules within repository steps (exclude the file/folder when the condition is true).

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

### Conditional steps

Add a `when` field to any entry in `scaffoldingSteps` to skip it entirely when the condition evaluates to false. The same expression syntax used for parameter visibility applies here.

```yaml
scaffoldingSteps:
  - type: repository
    name: "{{projectName}}.docker-infra"
    sourcePath: "templates/docker"
    defaultBranch: "main"
    when: "includeDocker" # entire repo is skipped when includeDocker is false

  - type: pipeline
    name: "{{projectName}}-docker-build"
    repository: "{{projectName}}.backend"
    yamlPath: "pipelines/docker.yml"
    folder: "\\CI"
    when: "includeDocker" # pipeline is skipped when includeDocker is false
```

Skipped entries still appear in the scaffolding progress view with a **Skipped** status, giving the user full visibility into what was conditionally omitted.

### Excluding files and folders from a repository

Add an `exclude` list to a repository entry to drop specific files or entire folders based on parameter values:

**Exclude individual files** — use a path with no trailing slash:

```yaml
scaffoldingSteps:
  - type: repository
    name: "{{projectName}}.backend"
    sourcePath: "templates/backend"
    defaultBranch: "main"
    exclude:
      - path: "Dockerfile"
        when: "!includeDocker" # exclude this file when Docker is disabled
      - path: "docker-compose.yml"
        when: "!includeDocker"
      - path: "always-omitted.txt" # no when = always excluded
```

**Exclude an entire folder** — add a trailing slash to the path. All files under that folder (including subfolders) are excluded:

```yaml
scaffoldingSteps:
  - type: repository
    name: "{{projectName}}.backend"
    sourcePath: "templates/backend"
    defaultBranch: "main"
    exclude:
      - path: "docker/" # always exclude everything under docker/
      - path: "tests/" # conditionally exclude the entire tests folder
        when: "!includeTests"
      - path: "infra/terraform/" # nested folder exclusion is also supported
        when: "!includeInfra"
```

The trailing slash is what signals folder exclusion. `"docker/"` excludes every file under `docker/` recursively, whereas `"docker"` (no slash) would only exclude a file literally named `docker` at the root.

#### `path` field

| Pattern                  | Behaviour                                                          |
| ------------------------ | ------------------------------------------------------------------ |
| `"Dockerfile"`           | Excludes the single file `Dockerfile` at the root of `sourcePath`. |
| `"config/settings.json"` | Excludes that specific nested file.                                |
| `"docker/"`              | Excludes **all** files recursively under the `docker/` folder.     |
| `"infra/terraform/"`     | Excludes **all** files recursively under `infra/terraform/`.       |

- `path` is always relative to `sourcePath`, with no leading slash.
- `when` uses the same expression syntax as parameter `when` fields. The file or folder is excluded when the expression evaluates to **true** — the `when` expresses the _exclusion condition_, not the inclusion condition.
- Omitting `when` always excludes the file or folder.
- Glob wildcards (e.g. `"**/*.json"`) are **not** supported — use exact file paths or folder prefixes with a trailing slash.

> **Tip:** Use `{{#myBooleanParameter}} ... conditional content ... {{/myBooleanParameter}}` blocks inside files for inline optional content, and `exclude` for entirely optional files or folders.

---

## Pipeline Variables

Use the `variables` field on a pipeline entry to define pipeline-level variables that are set directly on the ADO build definition when the pipeline is created. Both the variable name and value are Mustache-rendered, so they can include any parameter.

```yaml
scaffoldingSteps:
  - type: pipeline
    name: "{{projectName}}-ci"
    repository: "{{projectName}}.backend"
    yamlPath: "pipelines/ci.yml"
    folder: "\\CI"
    variables:
      - name: "PROJECT_NAME" # plain variable
        value: "{{projectName}}"
      - name: "DB_CONNECTION_STRING" # secret variable stored encrypted
        value: "{{dbConnectionString}}"
        secret: true
```

### Fields

| Field    | Required | Description                                                                                                                        |
| -------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `name`   | yes      | Variable name (Mustache-rendered).                                                                                                 |
| `value`  | yes      | Variable value (Mustache-rendered).                                                                                                |
| `secret` | no       | If `true`, the value is stored as a secret (encrypted) in ADO and masked in pipeline logs / scaffolding logs. Defaults to `false`. |

### Secrets

When `secret: true`, the variable's value is never displayed again in ADO once saved — not even in pipeline edit screens. Make sure to use a `secret: true` parameter as the source so the value is also masked in the scaffolding form:

```yaml
parameters:
  - id: dbConnectionString
    label: "Database Connection String"
    type: string
    secret: true # renders as a password input in the scaffolding form
    when: "includeBackend"

scaffoldingSteps:
  - type: pipeline
    name: "{{projectName}}-backend-ci"
    repository: "{{projectName}}.backend"
    yamlPath: "pipelines/ci.yml"
    variables:
      - name: "DB_CONNECTION_STRING"
        value: "{{dbConnectionString}}"
        secret: true
```

---

## Service Connections

Add `serviceConnection` entries to `scaffoldingSteps` to create ADO service connections (endpoints) as part of scaffolding. Place them after repository steps and before pipeline steps so that pipelines can reference them immediately.

### Basic example

```yaml
scaffoldingSteps:
  - type: serviceConnection
    name: "{{projectName}}-azure"
    endpointType: "AzureRM"
    authorizationScheme: "ServicePrincipal"
    url: "https://management.azure.com/"
    authorization:
      tenantid: "{{azureTenantId}}"
      serviceprincipalid: "{{azureClientId}}"
      serviceprincipalkey: "{{azureClientSecret}}"
    data:
      subscriptionId: "{{azureSubscriptionId}}"
      subscriptionName: "{{azureSubscriptionName}}"
      environment: "AzureCloud"
    description: "Azure connection for {{projectName}}"
    grantAccessToAllPipelines: true
    when: "includeAzureDeployment"
```

### Fields

| Field                       | Required | Description                                                                                                                       |
| --------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `name`                      | yes      | Display name for the connection. Mustache-rendered.                                                                               |
| `endpointType`              | yes      | ADO endpoint type name, e.g. `"AzureRM"`, `"github"`, `"dockerregistry"`. Accepts any type, including extension-contributed ones. |
| `authorizationScheme`       | yes      | Scheme supported by the chosen type, e.g. `"ServicePrincipal"`, `"Token"`, `"UsernamePassword"`, `"ManagedServiceIdentity"`.      |
| `url`                       | no       | Endpoint URL. Required by some types (see table below). Defaults to empty string.                                                 |
| `authorization`             | yes      | Map of authorization parameter key-value pairs. Values are Mustache-rendered.                                                     |
| `data`                      | no       | Map of non-auth type-specific fields (e.g. `subscriptionId`). Values are Mustache-rendered.                                       |
| `description`               | no       | Human-readable description. Mustache-rendered.                                                                                    |
| `grantAccessToAllPipelines` | no       | If `true`, grants "Allow all pipelines" access immediately after creation. Defaults to `false`.                                   |
| `when`                      | no       | Skip this connection when the expression evaluates to false. Same syntax as parameter `when`.                                     |

### Credential security — important

> **Never hardcode credentials in the template YAML.** Authorization field values should always reference `secret: true` template parameters via Mustache expressions. Secret parameters are masked in the scaffolding form and never stored in the template repository.

```yaml
parameters:
  - id: clientSecret
    label: "Service Principal Client Secret"
    type: string
    secret: true # ← renders as a password input; value is never logged

scaffoldingSteps:
  - type: serviceConnection
    name: "{{projectName}}-azure"
    endpointType: "AzureRM"
    authorizationScheme: "ServicePrincipal"
    url: "https://management.azure.com/"
    authorization:
      serviceprincipalkey: "{{clientSecret}}" # ← references the secret param
```

### Type reference

To find field names for connection types (built-in or extension-contributed), inspect an existing connection via `GET /_apis/serviceendpoint/endpoints/{endpointId}?api-version=7.0`.

Alternatively, you can also create a sample connection of the desired type and inspect the request payload in the browser dev tools network tab when saving it.

Example for a SonarQube service connection (only relevant fields shown). Note that the ADO API uses `type` where the template YAML uses `endpointType`:

```json
// POST https://ado.example.com/DefaultCollection/_apis/serviceendpoint/endpoints?api-version=7.0
{
  "authorization": {
    "parameters": {
      "username": "MySecretPersonalAccessToken",
      "password": ""
    },
    "scheme": "UsernamePassword"
  },
  "name": "SonarQube",
  "type": "sonarqube",
  "url": "https://sonarqube.example.com",
  "description": "This service connection is used by our CI pipelines to run SonarQube analysis on our repositories.",
  "serviceEndpointProjectReferences": [
    {
      "description": "",
      "name": "SonarQube",
      "projectReference": {
        "id": "6ae1de48-ee89-49ab-97f0-6ff468ff5d81",
        "name": "MySampleProject"
      }
    }
  ]
}
```

### Behaviour

- **Non-destructive**: if a service connection with the same name already exists in the project, it is skipped, not overwritten. This is consistent with how repositories and pipelines are handled.
- **`grantAccessToAllPipelines`**: sets "Grant access permission to all pipelines" on the connection. If this call fails after the connection is already created, scaffolding still reports success for that step and logs a warning — the connection exists and you can grant access manually.
- **Extension-contributed types**: the scaffolder passes `endpointType` (as `type` in the ADO API) and all `authorization`/`data` fields as-is to the ADO Service Endpoint API. Any endpoint type that ADO can create via REST — including types contributed by installed extensions — is supported.

---

## Variable Groups

Add `variableGroup` entries to `scaffoldingSteps` to create [Azure Pipelines Library variable groups](https://learn.microsoft.com/en-us/azure/devops/pipelines/library/variable-groups) as part of scaffolding. Place them before pipeline steps so the groups are available by name when pipelines run.

### Basic example

```yaml
scaffoldingSteps:
  - type: variableGroup
    name: "{{projectName}}-pipeline-vars"
    description: "Shared pipeline variables for {{projectName}}"
    grantAccessToAllPipelines: true
    variables:
      - name: "PROJECT_NAME"
        value: "{{projectName}}"
      - name: "DB_PASSWORD"
        value: "{{dbPassword}}"
        secret: true
    when: "includeBackend"
```

### Fields

| Field                       | Required | Description                                                                                                |
| --------------------------- | -------- | ---------------------------------------------------------------------------------------------------------- |
| `name`                      | yes      | Display name for the variable group. Mustache-rendered.                                                    |
| `description`               | no       | Human-readable description shown in the Library. Mustache-rendered.                                        |
| `variables`                 | no       | List of variables to add to the group (see sub-table below). Omit or leave empty to create an empty group. |
| `grantAccessToAllPipelines` | no       | If `true`, grants "Allow all pipelines" access immediately after creation. Defaults to `false`.            |
| `when`                      | no       | Skip this group when the expression evaluates to false. Same syntax as parameter `when`.                   |

#### `variables` sub-fields

| Field    | Required | Description                                                                                          |
| -------- | -------- | ---------------------------------------------------------------------------------------------------- |
| `name`   | yes      | Variable name as it will appear in the Library group.                                                |
| `value`  | yes      | Variable value. Mustache-rendered. May be an empty string (useful for secret placeholder variables). |
| `secret` | no       | If `true`, the variable is stored as a secret in ADO (masked in logs and UI). Defaults to `false`.   |

### Secret variables

Secret variables are never revealed in the ADO UI after creation. If a value placeholder is needed (so teams can fill it in later), use an empty string value:

```yaml
variables:
  - name: "API_KEY"
    value: "" # placeholder — team fills this in after scaffolding
    secret: true
```

To populate a secret variable from a template parameter, reference the secret parameter via Mustache:

```yaml
parameters:
  - id: dbPassword
    label: "Database Password"
    type: string
    secret: true # masked in the scaffolding form; never logged

scaffoldingSteps:
  - type: variableGroup
    name: "{{projectName}}-secrets"
    variables:
      - name: "DB_PASSWORD"
        value: "{{dbPassword}}"
        secret: true
```

### Behaviour

- **Non-destructive**: if a variable group with the same name already exists in the project, it is skipped, not overwritten.
- **`grantAccessToAllPipelines`**: sets "Allow all pipelines" access. If this call fails after the group is already created, scaffolding still reports success for that step and logs a warning.
- **Empty groups**: a group with no `variables` (or an empty list) is created successfully — useful when the group will be populated manually after scaffolding.
