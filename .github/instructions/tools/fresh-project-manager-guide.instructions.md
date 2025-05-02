# Comprehensive Guide to `stimagine.freshProjectManager` Tool

## 1. Purpose and Overview

The `stimagine.freshProjectManager` tool is designed to simplify the process of
working with temporary Deno Fresh projects within VS Code, especially when used
in conjunction with language models or AI assistants. It provides a single,
unified interface to perform common tasks related to a temporary Fresh project,
such as:

- **Creating a temporary Fresh project:** Sets up a new, isolated Fresh project
  in your operating system's temporary directory.
- **Starting the development server:** Launches the Fresh development server for
  the temporary project, allowing you to preview your Fresh application.
- **Managing routes:** Provides actions to create, update, and retrieve the
  content of route files within the temporary Fresh project.
- **Disposing of the project:** Stops the development server and cleans up the
  temporary project directory, removing all associated files.

This tool is intended for developers who want a quick and easy way to create and
experiment with Fresh components and routes in a sandboxed environment,
particularly when integrating with AI-powered workflows that can generate or
modify code.

## 2. Tool Name and Invocation

The name of the combined tool you need to use when invoking it (e.g., in
prompts, tool configuration, or programmatically) is:

**`stimagine-freshProjectManager`**

To use this tool, you will need to provide a JSON input object. The structure of
this input object depends on the specific action you want to perform.

## 3. The `action` Parameter: The Core of the Tool

The **`action`** parameter is the **most important and mandatory** parameter for
the `stimagine.freshProjectManager` tool. It tells the tool _what operation_ you
want it to perform.

The possible values for the `action` parameter are:

- `createProject`
- `startServer`
- `createRoute`
- `updateRoute`
- `getRouteContent`
- `disposeProject`

Let's explore each action in detail:

### 3.1. `action: "createProject"`

**Description:**

This action initializes a new temporary Fresh project. It performs the
following:

1. Creates a unique temporary directory on your system.
2. Generates a basic Fresh project structure within this directory (including
   `deno.json`, `dev.ts`, `fresh.config.ts`, `main.ts`, and directories for
   `components`, `islands`, `routes`, `static`).

**Input Parameters:**

- **None.** This action does not require any additional input parameters beyond
  the `action` itself.

**Example Input JSON:**

```json
{
  "action": "createProject"
}
```

**Expected Output:**

On success, the tool will return a success result with a message indicating the
location of the created temporary Fresh project. For example:

```json
{
  "parts": [
    {
      "text": "Successfully created a temporary Fresh project at /tmp/vscode-fresh-preview-1678886400000."
    }
  ]
}
```

On failure, it will return an error result with an error message.

### 3.2. `action: "startServer"`

**Description:**

This action starts the Fresh development server for the temporary project that
was previously created using the `createProject` action. It runs the
`deno run -A --watch dev.ts` command within the temporary project directory.

**Input Parameters:**

- **None.** This action does not require any additional input parameters beyond
  the `action` itself.

**Example Input JSON:**

```json
{
  "action": "startServer"
}
```

**Expected Output:**

On success, the tool will return a success result with a message indicating that
the server has started and is running on `http://localhost:54321/`. For example:

```json
{
  "parts": [
    {
      "text": "Fresh development server started successfully. The server is running on http://localhost:54321/"
    }
  ]
}
```

On failure (e.g., if the project isn't initialized or server fails to start), it
will return an error result with an error message.

**Important Note:** You **must** run `createProject` action successfully before
you can use `startServer`.

### 3.3. `action: "createRoute"`

**Description:**

This action creates a new route file within the `routes` directory of the
temporary Fresh project.

**Input Parameters:**

- **`relativePath` (Required):** A string representing the relative path for the
  new route file within the `routes` directory.
  - Examples: `"about.tsx"`, `"api/users.ts"`, `"products/[id].tsx"`
  - **Important:** Do not start with `/` or `\` and do not use `..` in the path.
- **`initialContent` (Optional):** A string representing the initial content you
  want to put into the new route file. If not provided, the file will be created
  with empty content.

**Example Input JSON:**

```json
{
  "action": "createRoute",
  "relativePath": "my-new-page.tsx",
  "initialContent": "import { PageProps } from '$fresh/server.ts';\n\nexport default function MyNewPage(props: PageProps) {\n  return <div>This is my new page!</div>;\n}"
}
```

**Expected Output:**

On success, the tool will return a success result with a message indicating the
route file was created and providing a unique `routeId` for future reference.
For example:

```json
{
  "parts": [
    {
      "text": "Successfully created route file at my-new-page.tsx. Route ID: route-0"
    }
  ]
}
```

On failure (e.g., invalid `relativePath`, project not initialized), it will
return an error result.

**Important Note:** You **must** run `createProject` action successfully before
you can use `createRoute`.

### 3.4. `action: "updateRoute"`

**Description:**

This action updates the content of an existing route file within the temporary
Fresh project. You need to identify the route file using its `routeId` (which
you received when you created the route using `createRoute`).

**Input Parameters:**

- **`routeId` (Required):** A string representing the `routeId` of the route
  file you want to update. This ID was returned when you initially created the
  route using the `createRoute` action.
- **`content` (Required):** A string representing the new content you want to
  set for the route file.

**Example Input JSON:**

```json
{
  "action": "updateRoute",
  "routeId": "route-0",
  "content": "import { PageProps } from '$fresh/server.ts';\n\nexport default function MyUpdatedPage(props: PageProps) {\n  return <div>This is my updated page content!</div>;\n}"
}
```

**Expected Output:**

On success, the tool will return a success result indicating that the route file
content has been updated. For example:

```json
{
  "parts": [
    {
      "text": "Successfully updated content of route file (ID: route-0)."
    }
  ]
}
```

On failure (e.g., invalid `routeId`, project not initialized), it will return an
error result.

**Important Note:** You **must** run `createProject` and `createRoute` actions
successfully (to get a valid `routeId`) before you can use `updateRoute`.

### 3.5. `action: "getRouteContent"`

**Description:**

This action retrieves the content of an existing route file within the temporary
Fresh project. You need to identify the route file using its `routeId`.

**Input Parameters:**

- **`routeId` (Required):** A string representing the `routeId` of the route
  file whose content you want to retrieve.

**Example Input JSON:**

```json
{
  "action": "getRouteContent",
  "routeId": "route-0"
}
```

**Expected Output:**

On success, the tool will return a success result where the `text` part of the
result contains the content of the route file. For example, if the route file
content is `"Hello, world!"`, the result might be:

```json
{
  "parts": [
    {
      "text": "Hello, world!"
    }
  ]
}
```

On failure (e.g., invalid `routeId`, project not initialized, file read error),
it will return an error result.

**Important Note:** You **must** run `createProject` and `createRoute` actions
successfully (to get a valid `routeId`) before you can use `getRouteContent`.

### 3.6. `action: "disposeProject"`

**Description:**

This action disposes of the temporary Fresh project. It performs the following:

1. Stops the Fresh development server if it is running.
2. Deletes the temporary project directory and all its contents.
3. Resets the internal state of the Fresh project manager.

**Input Parameters:**

- **None.** This action does not require any additional input parameters beyond
  the `action` itself.

**Example Input JSON:**

```json
{
  "action": "disposeProject"
}
```

**Expected Output:**

On success, the tool will return a success result indicating that the project
has been disposed of. For example:

```json
{
  "parts": [
    {
      "text": "Successfully stopped the server and cleaned up the temporary Fresh project."
    }
  ]
}
```

On failure (e.g., server stop error, directory deletion error), it will return
an error result.

**Important Note:** After running `disposeProject`, the temporary Fresh project
is no longer available. You will need to run `createProject` again to start a
new one.

### 3.7. `action: "copyComponentFiles"`

**Description:**

This action copies component files from the `intro` repository's `inspect`
folder to the `static/` directory of the temporary Fresh project. The files are
identified by their component names.

**Input Parameters:**

- **`componentNames` (Required):** An array of strings representing the names of
  the components to copy. Each component corresponds to a file in the `inspect`
  folder of the `intro` repository, with the format `component-name.bundle.js`.

**Example Input JSON:**

```json
{
  "action": "copyComponentFiles",
  "componentNames": ["header", "footer", "sidebar"]
}
```

**Expected Output:**

On success, the tool will return a success result with a message indicating that
the component files have been successfully copied. For example:

```json
{
  "parts": [
    {
      "text": "Successfully copied component files: header, footer, sidebar."
    }
  ]
}
```

On failure (e.g., invalid component names, missing `introRepoPath`
configuration, or project not initialized), it will return an error result with
a descriptive error message.

**Important Notes:**

- You **must** run the `createProject` action successfully before you can use
  `copyComponentFiles`.
- Ensure that the `introRepoPath` configuration is correctly set in your VS Code
  settings to point to the `intro` repository.

## 4. Error Handling

The `stimagine.freshProjectManager` tool is designed to report errors clearly
through the tool result. When an action fails, the tool will return a
`vscode.LanguageModelToolResult` with the `error: true` flag and a descriptive
error message in the `parts` array.

When using this tool, always check the tool result for the `error` flag and
inspect the `text` content to understand if the action was successful or if an
error occurred.

## 5. Example Usage Scenarios in Prompts (Illustrative)

When using this tool with a language model or AI assistant, you would typically
instruct the AI to use the `stimagine-freshProjectManager` tool and provide the
appropriate JSON input. Here are some example prompts and expected tool
invocations:

**Scenario 1: Create a temporary Fresh project and start the server.**

**Prompt:** "Set up a temporary Fresh project and start the development server
so I can preview it."

**Expected Tool Invocation (by the AI):**

```json
{
  "toolReference": "stimagine-freshProjectManager",
  "input": {
    "action": "createProject"
  }
}
```

**(After `createProject` succeeds, then another invocation to start the
server):**

```json
{
  "toolReference": "stimagine-freshProjectManager",
  "input": {
    "action": "startServer"
  }
}
```

**Scenario 2: Create a new route file named `contact.tsx` with some initial
content.**

**Prompt:** "Create a new Fresh route at `contact.tsx` with the content 'Contact
Us Page'."

**Expected Tool Invocation (by the AI):**

```json
{
  "toolReference": "stimagine-freshProjectManager",
  "input": {
    "action": "createRoute",
    "relativePath": "contact.tsx",
    "initialContent": "import { PageProps } from '$fresh/server.ts';\n\nexport default function ContactPage(props: PageProps) {\n  return <div>Contact Us Page</div>;\n}"
  }
}
```

**Scenario 3: Update the content of a route with `routeId: route-0` to display
"Welcome to the updated page!".**

**Prompt:** "Update the route with ID `route-0` to say 'Welcome to the updated
page!'."

**Expected Tool Invocation (by the AI):**

```json
{
  "toolReference": "stimagine-freshProjectManager",
  "input": {
    "action": "updateRoute",
    "routeId": "route-0",
    "content": "import { PageProps } from '$fresh/server.ts';\n\nexport default function UpdatedWelcomePage(props: PageProps) {\n  return <div>Welcome to the updated page!</div>;\n}"
  }
}
```

**Scenario 4: Dispose of the temporary Fresh project.**

**Prompt:** "Clean up and remove the temporary Fresh project."

**Expected Tool Invocation (by the AI):**

```json
{
  "toolReference": "stimagine-freshProjectManager",
  "input": {
    "action": "disposeProject"
  }
}
```

This comprehensive guide should provide you with all the necessary information
to effectively use the `stimagine.freshProjectManager` tool. Remember to always
specify the `action` and provide the required parameters for each action. Happy
coding with Fresh!
