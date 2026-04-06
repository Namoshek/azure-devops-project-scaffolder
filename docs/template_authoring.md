# Template Authoring Guide

This guide explains how to create project templates for the **Project Scaffolding** Azure DevOps extension.

---

## Overview

A template is any repository in the collection that contains a `project-template.yml` file in its root. The extension discovers these automatically via Code Search and presents them to project administrators in the "Project Scaffolding" page under Project Settings. If project restrictions are configured, only templates from allowed projects will be shown.
Users can only see templates from projects they have at least read access to.

When a user selects a template and fills in the parameter form, the extension:

1. Creates new repositories by copying files from `sourcePath` subfolders (or the template repository root if `sourcePath` is empty), rendering all content and file names through [Mustache.js](https://mustache.github.io/).
2. Creates service connections as defined in the template, rendering all fields through Mustache. Credential fields should reference `secret: true` parameters to ensure secure handling (see Service Connections section below).
3. Creates Library variable groups as defined in the template, rendering all fields through Mustache. Secret variables should reference `secret: true` parameters (see Variable Groups section below).
4. Creates YAML pipeline definitions pointing to designated files in the created repositories.

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
    when: "includeDocker == true" # Only shown when includeDocker is checked

  - id: includeSonarQube
    label: "Include SonarQube Analysis"
    type: boolean
    defaultValue: true

  - id: sonarqubePersonalAccessToken
    label: "SonarQube Personal Access Token"
    type: string
    required: true
    when: "includeSonarQube"

# ── Repositories ───────────────────────────────────────────────────────────────────
repositories:
  - name: "{{projectName}}.backend" # Mustache in repo name ✔
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

# ── Service Connections ─────────────────────────────────────────────────────────────
serviceConnections:
  - name: "SonarQube"
    type: "sonarqube"
    authorizationScheme: "UsernamePassword"
    authorization:
      username: "{{sonarqubePersonalAccessToken}}"
      password: ""
    url: "https://sonarqube.example.com"
    description: "SonarQube for static code analysis"
    grantAccessToAllPipelines: true
    when: "includeSonarQube" # Optional: skip this connection when false

# ── Variable Groups ────────────────────────────────────────────────────────────────
variableGroups:
  - name: "{{projectName}}-pipeline-vars"
    description: "Shared pipeline variables for {{projectName}}"
    grantAccessToAllPipelines: true
    variables:
      - name: "PROJECT_NAME"
        value: "{{projectName}}"
      - name: "DB_PASSWORD"
        value: "{{dbPassword}}"
        secret: true
    when: "includeBackend"

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

### Excluding files and folders from a repository

Add an `exclude` list to a repository entry to drop specific files or entire folders based on parameter values:

**Exclude individual files** — use a path with no trailing slash:

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

**Exclude an entire folder** — add a trailing slash to the path. All files under that folder (including subfolders) are excluded:

```yaml
repositories:
  - name: "{{projectName}}.backend"
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
pipelines:
  - name: "{{projectName}}-ci"
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

pipelines:
  - name: "{{projectName}}-backend-ci"
    repository: "{{projectName}}.backend"
    yamlPath: "pipelines/ci.yml"
    variables:
      - name: "DB_CONNECTION_STRING"
        value: "{{dbConnectionString}}"
        secret: true
```

---

## Service Connections

Use the `serviceConnections` section to create ADO service connections (endpoints) as part of scaffolding. Service connections are created after all repositories are provisioned and before pipelines, so pipelines can reference them immediately.

### Basic example

```yaml
serviceConnections:
  - name: "{{projectName}}-azure"
    type: "AzureRM"
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
| `type`                      | yes      | ADO endpoint type name, e.g. `"AzureRM"`, `"github"`, `"dockerregistry"`. Accepts any type, including extension-contributed ones. |
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

serviceConnections:
  - name: "{{projectName}}-azure"
    type: "AzureRM"
    authorizationScheme: "ServicePrincipal"
    url: "https://management.azure.com/"
    authorization:
      serviceprincipalkey: "{{clientSecret}}" # ← references the secret param
```

### Type reference

To find field names for connection types (built-in or extension-contributed), inspect an existing connection via `GET /_apis/serviceendpoint/endpoints/{endpointId}?api-version=7.0`.

Alternatively, you can also create a sample connection of the desired type and inspect the request payload in the browser dev tools network tab when saving it.

Example for a SonarQube service connection (only relevant fields shown):

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
- **Extension-contributed types**: the scaffolder passes `type` and all `authorization`/`data` fields as-is to the ADO Service Endpoint API. Any endpoint type that ADO can create via REST — including types contributed by installed extensions — is supported.

---

## Variable Groups

Use the `variableGroups` section to create [Azure Pipelines Library variable groups](https://learn.microsoft.com/en-us/azure/devops/pipelines/library/variable-groups) as part of scaffolding. Variable groups are created before pipelines, so the groups are available by name when pipelines run.

### Basic example

```yaml
variableGroups:
  - name: "{{projectName}}-pipeline-vars"
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

variableGroups:
  - name: "{{projectName}}-secrets"
    variables:
      - name: "DB_PASSWORD"
        value: "{{dbPassword}}"
        secret: true
```

### Behaviour

- **Non-destructive**: if a variable group with the same name already exists in the project, it is skipped, not overwritten.
- **`grantAccessToAllPipelines`**: sets "Allow all pipelines" access. If this call fails after the group is already created, scaffolding still reports success for that step and logs a warning.
- **Empty groups**: a group with no `variables` (or an empty list) is created successfully — useful when the group will be populated manually after scaffolding.
