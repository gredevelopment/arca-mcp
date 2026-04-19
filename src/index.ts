#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// API configuration
const API_BASE_URL = "https://api.getarca.app/api/v1";

// Get API key from environment variable
const API_KEY = process.env.ARCA_API_KEY;

if (!API_KEY) {
  console.error("Error: ARCA_API_KEY environment variable is required");
  console.error("Get your API key from Settings → API Keys in the Arca app");
  process.exit(1);
}

// Server instance
const server = new McpServer({
  name: "arca-mcp",
  version: "1.0.0",
});

// Provide server instructions to guide LLMs
const SERVER_INSTRUCTIONS = `# Arca MCP Server Usage Instructions

## Architecture Overview
Arca is a workspace-based task management system. All operations require workspace context.

## Key Principles

### 1. Workspace ID Resolution
**IMPORTANT**: Most tools require workspace_id or task_id parameters. When users provide workspace or task names instead of IDs:
- ALWAYS use \`list_workspaces\` first to find the workspace ID by name
- ALWAYS use \`list_tasks\` to find task IDs by title when searching by name
- Never tell users "workspace name is not supported" - resolve it automatically

**Example**: "List tasks in My Project workspace"
1. Call \`list_workspaces\` to get all workspaces
2. Find "My Project" in the results to get its workspace_id
3. Call \`list_tasks\` with that workspace_id

### 2. Multi-Step Workflows
Common patterns require multiple tool calls:
- **Creating tasks with context**: Get workspace → List statuses/lists → Create task with proper IDs
- **Searching tasks**: List workspaces → List tasks → Filter in-memory by title/description
- **Moving tasks**: Get task → Update task with new list_id/status_id
- **Task context**: Get task → List comments for full conversation history

### 3. Data Relationships
- Workspaces contain: Lists, Labels, Statuses, Tasks
- Lists optionally belong to Folders (organizational only)
- Tasks optionally belong to Lists
- Tasks have: Status (required), Priority, Assignee, Labels, Due dates

### 4. Efficient Tool Selection
- Use \`get_task\` for single task details (includes all fields)
- Use \`list_tasks\` for bulk operations or searching
- Use \`list_workspaces\` as the starting point when workspace context is ambiguous
- Batch creates/updates when possible (e.g., creating multiple tasks)

### 5. Status vs Priority
- **Status**: Workflow state (e.g., "To Do", "In Progress", "Done") - workspace-specific, get from \`list_statuses\`
- **Priority**: Urgency level - standardized enum: \`low\`, \`medium\`, \`high\`, \`urgent\`

### 6. Date Formats
- Use ISO 8601 format for dates: \`YYYY-MM-DDTHH:mm:ss.sssZ\`
- Example: \`2024-03-15T14:30:00.000Z\`

### 7. HTML Descriptions
Task descriptions support HTML. For rich formatting:
- Use \`<p>\`, \`<strong>\`, \`<em>\`, \`<ul>\`, \`<ol>\` tags
- Plain text is acceptable but less powerful

## Common User Request Patterns

### "Show me all tasks in [Workspace Name]"
1. \`list_workspaces\` → find workspace_id
2. \`list_tasks\` with workspace_id

### "Create a task called [Title] in [List Name]"
1. \`list_lists\` → find list_id
2. (Optional) \`list_statuses\` to get default status
3. \`create_task\` with list_id (workspace_id is derived automatically)

### "Update task [Name/Title]"
1. \`list_tasks\` in likely workspace
2. Find task by title match → get task_id
3. \`update_task\` with task_id

### "What's the status of [Task Name]?"
1. \`list_tasks\` to search by title
2. Return status from results (no need for \`get_task\` unless more detail needed)

## Error Handling
- If a workspace name doesn't match exactly, try case-insensitive or partial matching
- If no workspace is specified, list all and ask user to clarify
- If a tool fails, explain why and suggest the correct approach

## Best Practices
✅ **DO**: Resolve names to IDs transparently
✅ **DO**: Chain tools to fulfill complex requests
✅ **DO**: Provide context when creating tasks (list, status, priority)
✅ **DO**: Use descriptive responses with task identifiers and titles

❌ **DON'T**: Tell users "this tool requires an ID" - fetch the ID for them
❌ **DON'T**: Give up if one tool call fails - try alternative approaches
❌ **DON'T**: Assume workspace context - always verify or list available workspaces`;

// Helper function for making authenticated API requests
async function makeApiRequest<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  const headers = {
    Authorization: `Bearer ${API_KEY}`,
    "Content-Type": "application/json",
    ...options.headers,
  };

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage =
        errorData.error || `HTTP ${response.status}: ${response.statusText}`;
      throw new Error(errorMessage);
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Request failed: ${error}`);
  }
}

// Register server instructions as a prompt
server.registerPrompt(
  "server_instructions",
  {
    description: "Instructions for using the Arca MCP server effectively",
  },
  async () => ({
    messages: [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text: SERVER_INSTRUCTIONS,
        },
      },
    ],
  }),
);

// Tool: List Workspaces
server.registerTool(
  "list_workspaces",
  {
    description:
      "List all workspaces the API key owner belongs to, ordered alphabetically by name. **IMPORTANT**: Use this tool first when users provide workspace names instead of IDs - find the workspace ID from the results, then use it in subsequent calls to other tools (e.g., list_tasks, create_task).",
  },
  async () => {
    const workspaces = await makeApiRequest<any[]>(`/workspaces`);

    const workspaceList = workspaces
      .map(
        (ws: any) =>
          `- ${ws.name} (ID: ${ws.id}, slug: ${ws.slug}, role: ${ws.role})`,
      )
      .join("\n");

    return {
      content: [
        {
          type: "text" as const,
          text: workspaces.length
            ? `Workspaces:\n${workspaceList}`
            : "No workspaces found",
        },
      ],
    };
  },
);

// Tool: Get Workspace
server.registerTool(
  "get_workspace",
  {
    description: "Get details of a specific workspace by ID",
    inputSchema: z.object({
      workspace_id: z.string().describe("The workspace ID"),
    }),
  },
  async ({ workspace_id }) => {
    const data = await makeApiRequest<any>(`/workspaces/${workspace_id}`);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  },
);

// Tool: List Tasks
server.registerTool(
  "list_tasks",
  {
    description:
      "List all tasks in a workspace, optionally filtered by list. Returns task titles with IDs - useful for finding task_id when users provide task names. Can be used to search for tasks by filtering results in-memory by title/description.",
    inputSchema: z.object({
      workspace_id: z.string().describe("The workspace ID"),
      list_id: z.string().optional().describe("Optional list ID to filter by"),
    }),
  },
  async ({ workspace_id, list_id }) => {
    const endpoint = list_id
      ? `/workspaces/${workspace_id}/tasks?listId=${list_id}`
      : `/workspaces/${workspace_id}/tasks`;

    const response = await makeApiRequest<any>(endpoint);
    const tasks = response.data || [];

    const taskList = tasks
      .map(
        (task: any) =>
          `- ${task.title} (ID: ${task.id}, status: ${task.status?.name || "N/A"}, priority: ${task.priority || "N/A"})`,
      )
      .join("\n");

    return {
      content: [
        {
          type: "text" as const,
          text: tasks.length ? `Tasks:\n${taskList}` : "No tasks found",
        },
      ],
    };
  },
);

// Tool: Get Task
server.registerTool(
  "get_task",
  {
    description: "Get details of a specific task by ID",
    inputSchema: z.object({
      task_id: z.string().describe("The task ID"),
    }),
  },
  async ({ task_id }) => {
    const data = await makeApiRequest<any>(`/tasks/${task_id}`);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  },
);

// Tool: Create Task
server.registerTool(
  "create_task",
  {
    description:
      "Create a new task in a list. The list_id is required and determines the workspace automatically. If user provides list name instead of ID, first call list_lists to resolve it. For better context, consider calling list_statuses to get available status options before creating. To assign users, call list_members first to get user IDs, then pass them in assignee_ids.",
    inputSchema: z.object({
      list_id: z.string().describe("List ID to add task to (required)"),
      title: z.string().describe("Task title"),
      description: z.string().optional().describe("Task description (HTML)"),
      status_id: z.string().optional().describe("Status ID"),
      priority: z
        .enum(["low", "medium", "high", "urgent"])
        .optional()
        .describe("Task priority"),
      due_date: z.string().optional().describe("Due date (ISO 8601 format)"),
      start_date: z
        .string()
        .optional()
        .describe("Start date (ISO 8601 format)"),
      assignee_ids: z
        .array(z.string())
        .optional()
        .describe(
          "User IDs to assign to the task. Use list_members to resolve member IDs.",
        ),
    }),
  },
  async (args) => {
    const data = await makeApiRequest<any>(`/tasks`, {
      method: "POST",
      body: JSON.stringify(args),
    });

    const assigneeNames =
      data.assignees && data.assignees.length > 0
        ? data.assignees.map((a: any) => a.name).join(", ")
        : "None";

    return {
      content: [
        {
          type: "text" as const,
          text: `Task created successfully!\n\nID: ${data.id}\nIdentifier: ${data.identifier}\nTitle: ${data.title}\nPriority: ${data.priority || "none"}\nStatus: ${data.status?.name || "N/A"}\nAssignees: ${assigneeNames}`,
        },
      ],
    };
  },
);

// Tool: Update Task
server.registerTool(
  "update_task",
  {
    description: "Update an existing task",
    inputSchema: z.object({
      task_id: z.string().describe("The task ID"),
      title: z.string().optional().describe("Task title"),
      description: z.string().optional().describe("Task description (HTML)"),
      list_id: z.string().optional().describe("List ID to move task to"),
      status_id: z.string().optional().describe("Status ID"),
      priority: z
        .enum(["low", "medium", "high", "urgent"])
        .optional()
        .describe("Task priority"),
      due_date: z.string().optional().describe("Due date (ISO 8601 format)"),
      start_date: z
        .string()
        .optional()
        .describe("Start date (ISO 8601 format)"),
      assignee_ids: z
        .array(z.number())
        .optional()
        .describe(
          "Array of user IDs to assign. Replaces current assignees. Pass [] to remove all. Omit to keep unchanged. Use list_members to resolve member IDs.",
        ),
    }),
  },
  async ({ task_id, ...updates }) => {
    const data = await makeApiRequest<any>(`/tasks/${task_id}`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    });

    return {
      content: [
        {
          type: "text" as const,
          text: `Task updated successfully!\n\nID: ${data.id}\nIdentifier: ${data.identifier}\nTitle: ${data.title}`,
        },
      ],
    };
  },
);

// Tool: Delete Task
server.registerTool(
  "delete_task",
  {
    description: "Delete a task by ID",
    inputSchema: z.object({
      task_id: z.string().describe("The task ID"),
    }),
  },
  async ({ task_id }) => {
    await makeApiRequest<any>(`/tasks/${task_id}`, {
      method: "DELETE",
    });

    return {
      content: [
        {
          type: "text" as const,
          text: `Task ${task_id} deleted successfully`,
        },
      ],
    };
  },
);

// Tool: List Lists
server.registerTool(
  "list_lists",
  {
    description: "List all lists in a workspace, optionally filtered by folder",
    inputSchema: z.object({
      workspace_id: z.string().describe("The workspace ID"),
      folder_id: z
        .string()
        .optional()
        .describe("Optional folder ID to filter by"),
    }),
  },
  async ({ workspace_id, folder_id }) => {
    const endpoint = folder_id
      ? `/folders/${folder_id}/lists`
      : `/workspaces/${workspace_id}/lists`;

    const lists = await makeApiRequest<any[]>(endpoint);

    const listText = lists
      .map(
        (list: any) =>
          `- ${list.name} (ID: ${list.id}, folder: ${list.folder_id || "None"}, position: ${list.position})`,
      )
      .join("\n");

    return {
      content: [
        {
          type: "text" as const,
          text: lists.length ? `Lists:\n${listText}` : "No lists found",
        },
      ],
    };
  },
);

// Tool: Create List
server.registerTool(
  "create_list",
  {
    description: "Create a new list in a workspace",
    inputSchema: z.object({
      workspace_id: z.string().describe("The workspace ID"),
      name: z.string().describe("List name"),
      folder_id: z.string().optional().describe("Optional folder ID"),
      icon: z.string().optional().describe("Icon name"),
      color: z.string().optional().describe("Color value"),
    }),
  },
  async (args) => {
    const data = await makeApiRequest<any>(`/lists`, {
      method: "POST",
      body: JSON.stringify(args),
    });

    return {
      content: [
        {
          type: "text" as const,
          text: `List created successfully!\n\nID: ${data.id}\nName: ${data.name}\nPosition: ${data.position}`,
        },
      ],
    };
  },
);

// Tool: Update List
server.registerTool(
  "update_list",
  {
    description: "Update an existing list",
    inputSchema: z.object({
      list_id: z.string().describe("The list ID"),
      name: z.string().optional().describe("List name"),
      folder_id: z.string().optional().describe("Folder ID (null to unassign)"),
      icon: z.string().optional().describe("Icon name"),
      color: z.string().optional().describe("Color value"),
    }),
  },
  async ({ list_id, ...updates }) => {
    const data = await makeApiRequest<any>(`/lists/${list_id}`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    });

    return {
      content: [
        {
          type: "text" as const,
          text: `List updated successfully!\n\nID: ${data.id}\nName: ${data.name}`,
        },
      ],
    };
  },
);

// Tool: Delete List
server.registerTool(
  "delete_list",
  {
    description: "Delete a list by ID",
    inputSchema: z.object({
      list_id: z.string().describe("The list ID"),
    }),
  },
  async ({ list_id }) => {
    await makeApiRequest<any>(`/lists/${list_id}`, {
      method: "DELETE",
    });

    return {
      content: [
        {
          type: "text" as const,
          text: `List ${list_id} deleted successfully`,
        },
      ],
    };
  },
);

// Tool: List Folders
server.registerTool(
  "list_folders",
  {
    description: "List all folders in a workspace",
    inputSchema: z.object({
      workspace_id: z.string().describe("The workspace ID"),
    }),
  },
  async ({ workspace_id }) => {
    const folders = await makeApiRequest<any[]>(
      `/workspaces/${workspace_id}/folders`,
    );

    const folderList = folders
      .map(
        (folder: any) =>
          `- ${folder.name} (ID: ${folder.id}, position: ${folder.position})`,
      )
      .join("\n");

    return {
      content: [
        {
          type: "text" as const,
          text: folders.length ? `Folders:\n${folderList}` : "No folders found",
        },
      ],
    };
  },
);

// Tool: Create Folder
server.registerTool(
  "create_folder",
  {
    description: "Create a new folder in a workspace",
    inputSchema: z.object({
      workspace_id: z.string().describe("The workspace ID"),
      name: z.string().describe("Folder name"),
      icon: z.string().optional().describe("Icon name"),
      color: z.string().optional().describe("Color value"),
    }),
  },
  async (args) => {
    const data = await makeApiRequest<any>(`/folders`, {
      method: "POST",
      body: JSON.stringify(args),
    });

    return {
      content: [
        {
          type: "text" as const,
          text: `Folder created successfully!\n\nID: ${data.id}\nName: ${data.name}\nPosition: ${data.position}`,
        },
      ],
    };
  },
);

// Tool: Update Folder
server.registerTool(
  "update_folder",
  {
    description: "Update an existing folder",
    inputSchema: z.object({
      folder_id: z.string().describe("The folder ID"),
      name: z.string().optional().describe("Folder name"),
      icon: z.string().optional().describe("Icon name"),
      color: z.string().optional().describe("Color value"),
    }),
  },
  async ({ folder_id, ...updates }) => {
    const data = await makeApiRequest<any>(`/folders/${folder_id}`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    });

    return {
      content: [
        {
          type: "text" as const,
          text: `Folder updated successfully!\n\nID: ${data.id}\nName: ${data.name}`,
        },
      ],
    };
  },
);

// Tool: Delete Folder
server.registerTool(
  "delete_folder",
  {
    description: "Delete a folder by ID",
    inputSchema: z.object({
      folder_id: z.string().describe("The folder ID"),
    }),
  },
  async ({ folder_id }) => {
    await makeApiRequest<any>(`/folders/${folder_id}`, {
      method: "DELETE",
    });

    return {
      content: [
        {
          type: "text" as const,
          text: `Folder ${folder_id} deleted successfully`,
        },
      ],
    };
  },
);

// Tool: List Comments
server.registerTool(
  "list_comments",
  {
    description: "List all comments on a task",
    inputSchema: z.object({
      task_id: z.string().describe("The task ID"),
    }),
  },
  async ({ task_id }) => {
    const comments = await makeApiRequest<any[]>(`/tasks/${task_id}/comments`);

    const commentList = comments
      .map(
        (comment: any) =>
          `- ${comment.author?.name || "Unknown"} (${new Date(comment.created_at).toLocaleString()}): ${comment.content}`,
      )
      .join("\n");

    return {
      content: [
        {
          type: "text" as const,
          text: comments.length
            ? `Comments:\n${commentList}`
            : "No comments found",
        },
      ],
    };
  },
);

// Tool: Create Comment
server.registerTool(
  "create_comment",
  {
    description: "Create a comment on a task",
    inputSchema: z.object({
      task_id: z.string().describe("The task ID"),
      content: z.string().describe("Comment content (HTML supported)"),
    }),
  },
  async (args) => {
    const data = await makeApiRequest<any>(`/comments`, {
      method: "POST",
      body: JSON.stringify(args),
    });

    return {
      content: [
        {
          type: "text" as const,
          text: `Comment created successfully!\n\nID: ${data.id}\nAuthor: ${data.author?.name || "Unknown"}\nContent: ${data.content}`,
        },
      ],
    };
  },
);

// Tool: List Statuses
server.registerTool(
  "list_statuses",
  {
    description: "List all statuses in a workspace, ordered by position",
    inputSchema: z.object({
      workspace_id: z.string().describe("The workspace ID"),
    }),
  },
  async ({ workspace_id }) => {
    const statuses = await makeApiRequest<any[]>(
      `/workspaces/${workspace_id}/statuses`,
    );

    const statusList = statuses
      .map(
        (s: any) =>
          `- ${s.name} (ID: ${s.id}, category: ${s.category}, color: ${s.color || "none"}, position: ${s.position})`,
      )
      .join("\n");

    return {
      content: [
        {
          type: "text" as const,
          text: statuses.length
            ? `Statuses:\n${statusList}`
            : "No statuses found",
        },
      ],
    };
  },
);

// Tool: Create Status
server.registerTool(
  "create_status",
  {
    description:
      "Create a new status in a workspace (requires owner or admin role)",
    inputSchema: z.object({
      workspace_id: z.string().describe("The workspace ID"),
      name: z.string().describe("Status name"),
      category: z
        .enum(["pending", "active", "done", "completed", "cancelled"])
        .describe("Status category"),
      icon: z.string().optional().describe("Icon name"),
      color: z.string().optional().describe("Color value"),
    }),
  },
  async (args) => {
    const data = await makeApiRequest<any>(`/statuses`, {
      method: "POST",
      body: JSON.stringify(args),
    });

    return {
      content: [
        {
          type: "text" as const,
          text: `Status created successfully!\n\nID: ${data.id}\nName: ${data.name}\nCategory: ${data.category}\nPosition: ${data.position}`,
        },
      ],
    };
  },
);

// Tool: Update Status
server.registerTool(
  "update_status",
  {
    description: "Update an existing status (requires owner or admin role)",
    inputSchema: z.object({
      status_id: z.string().describe("The status ID"),
      name: z.string().optional().describe("Status name"),
      category: z
        .enum(["pending", "active", "done", "completed", "cancelled"])
        .optional()
        .describe("Status category"),
      icon: z.string().optional().describe("Icon name"),
      color: z.string().optional().describe("Color value"),
      position: z.number().optional().describe("Display position (integer)"),
    }),
  },
  async ({ status_id, ...updates }) => {
    const data = await makeApiRequest<any>(`/statuses/${status_id}`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    });

    return {
      content: [
        {
          type: "text" as const,
          text: `Status updated successfully!\n\nID: ${data.id}\nName: ${data.name}\nCategory: ${data.category}`,
        },
      ],
    };
  },
);

// Tool: Delete Status
server.registerTool(
  "delete_status",
  {
    description:
      "Delete a status by ID (requires owner or admin role). If tasks use this status, provide reassign_to.",
    inputSchema: z.object({
      status_id: z.string().describe("The status ID to delete"),
      reassign_to: z
        .string()
        .optional()
        .describe(
          "Status ID to reassign tasks to before deleting (required if tasks use this status)",
        ),
    }),
  },
  async ({ status_id, reassign_to }) => {
    const endpoint = reassign_to
      ? `/statuses/${status_id}?reassign_to=${reassign_to}`
      : `/statuses/${status_id}`;

    await makeApiRequest<any>(endpoint, { method: "DELETE" });

    return {
      content: [
        {
          type: "text" as const,
          text: `Status ${status_id} deleted successfully`,
        },
      ],
    };
  },
);

// Tool: List Labels
server.registerTool(
  "list_labels",
  {
    description: "List all labels in a workspace, ordered alphabetically",
    inputSchema: z.object({
      workspace_id: z.string().describe("The workspace ID"),
    }),
  },
  async ({ workspace_id }) => {
    const labels = await makeApiRequest<any[]>(
      `/workspaces/${workspace_id}/labels`,
    );

    const labelList = labels
      .map((l: any) => `- ${l.name} (ID: ${l.id}, color: ${l.color || "none"})`)
      .join("\n");

    return {
      content: [
        {
          type: "text" as const,
          text: labels.length ? `Labels:\n${labelList}` : "No labels found",
        },
      ],
    };
  },
);

// Tool: Create Label
server.registerTool(
  "create_label",
  {
    description: "Create a new label in a workspace",
    inputSchema: z.object({
      workspace_id: z.string().describe("The workspace ID"),
      name: z.string().describe("Label name"),
      color: z.string().optional().describe("Color value"),
    }),
  },
  async (args) => {
    const data = await makeApiRequest<any>(`/labels`, {
      method: "POST",
      body: JSON.stringify(args),
    });

    return {
      content: [
        {
          type: "text" as const,
          text: `Label created successfully!\n\nID: ${data.id}\nName: ${data.name}\nColor: ${data.color || "none"}`,
        },
      ],
    };
  },
);

// Tool: Update Label
server.registerTool(
  "update_label",
  {
    description: "Update an existing label (requires owner or admin role)",
    inputSchema: z.object({
      label_id: z.string().describe("The label ID"),
      name: z.string().optional().describe("Label name"),
      color: z.string().optional().describe("Color value"),
    }),
  },
  async ({ label_id, ...updates }) => {
    const data = await makeApiRequest<any>(`/labels/${label_id}`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    });

    return {
      content: [
        {
          type: "text" as const,
          text: `Label updated successfully!\n\nID: ${data.id}\nName: ${data.name}`,
        },
      ],
    };
  },
);

// Tool: Delete Label
server.registerTool(
  "delete_label",
  {
    description: "Delete a label by ID (requires owner or admin role)",
    inputSchema: z.object({
      label_id: z.string().describe("The label ID"),
    }),
  },
  async ({ label_id }) => {
    await makeApiRequest<any>(`/labels/${label_id}`, { method: "DELETE" });

    return {
      content: [
        {
          type: "text" as const,
          text: `Label ${label_id} deleted successfully`,
        },
      ],
    };
  },
);

// Start the server with STDIO transport
async function main() {
  const transport = new StdioServerTransport();

  await server.connect(transport);

  console.error("Arca MCP Server running on stdio");
  console.error(`API Key configured: ${API_KEY!.substring(0, 8)}...`);
}

main().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
