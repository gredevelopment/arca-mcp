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

// Tool: List Workspaces
server.tool(
  "list_workspaces",
  "List all workspaces the API key owner belongs to, ordered alphabetically by name",
  {},
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
server.tool(
  "get_workspace",
  "Get details of a specific workspace by ID",
  {
    workspace_id: z.string().describe("The workspace ID"),
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
server.tool(
  "list_tasks",
  "List all tasks in a workspace, optionally filtered by list",
  {
    workspace_id: z.string().describe("The workspace ID"),
    list_id: z.string().optional().describe("Optional list ID to filter by"),
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
server.tool(
  "get_task",
  "Get details of a specific task by ID",
  {
    task_id: z.string().describe("The task ID"),
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
server.tool(
  "create_task",
  "Create a new task in a workspace",
  {
    workspace_id: z.string().describe("The workspace ID"),
    title: z.string().describe("Task title"),
    description: z.string().optional().describe("Task description (HTML)"),
    list_id: z.string().optional().describe("List ID to add task to"),
    status_id: z.string().optional().describe("Status ID"),
    priority: z
      .enum(["low", "medium", "high", "urgent"])
      .optional()
      .describe("Task priority"),
    due_date: z.string().optional().describe("Due date (ISO 8601 format)"),
    start_date: z.string().optional().describe("Start date (ISO 8601 format)"),
  },
  async (args) => {
    const data = await makeApiRequest<any>(`/tasks`, {
      method: "POST",
      body: JSON.stringify(args),
    });

    return {
      content: [
        {
          type: "text" as const,
          text: `Task created successfully!\n\nID: ${data.id}\nIdentifier: ${data.identifier}\nTitle: ${data.title}\nPriority: ${data.priority || "none"}\nStatus: ${data.status?.name || "N/A"}`,
        },
      ],
    };
  },
);

// Tool: Update Task
server.tool(
  "update_task",
  "Update an existing task",
  {
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
    start_date: z.string().optional().describe("Start date (ISO 8601 format)"),
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
server.tool(
  "delete_task",
  "Delete a task by ID",
  {
    task_id: z.string().describe("The task ID"),
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
server.tool(
  "list_lists",
  "List all lists in a workspace, optionally filtered by folder",
  {
    workspace_id: z.string().describe("The workspace ID"),
    folder_id: z
      .string()
      .optional()
      .describe("Optional folder ID to filter by"),
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
server.tool(
  "create_list",
  "Create a new list in a workspace",
  {
    workspace_id: z.string().describe("The workspace ID"),
    name: z.string().describe("List name"),
    folder_id: z.string().optional().describe("Optional folder ID"),
    icon: z.string().optional().describe("Icon name"),
    color: z.string().optional().describe("Color value"),
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
server.tool(
  "update_list",
  "Update an existing list",
  {
    list_id: z.string().describe("The list ID"),
    name: z.string().optional().describe("List name"),
    folder_id: z.string().optional().describe("Folder ID (null to unassign)"),
    icon: z.string().optional().describe("Icon name"),
    color: z.string().optional().describe("Color value"),
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
server.tool(
  "delete_list",
  "Delete a list by ID",
  {
    list_id: z.string().describe("The list ID"),
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
server.tool(
  "list_folders",
  "List all folders in a workspace",
  {
    workspace_id: z.string().describe("The workspace ID"),
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
server.tool(
  "create_folder",
  "Create a new folder in a workspace",
  {
    workspace_id: z.string().describe("The workspace ID"),
    name: z.string().describe("Folder name"),
    icon: z.string().optional().describe("Icon name"),
    color: z.string().optional().describe("Color value"),
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
server.tool(
  "update_folder",
  "Update an existing folder",
  {
    folder_id: z.string().describe("The folder ID"),
    name: z.string().optional().describe("Folder name"),
    icon: z.string().optional().describe("Icon name"),
    color: z.string().optional().describe("Color value"),
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
server.tool(
  "delete_folder",
  "Delete a folder by ID",
  {
    folder_id: z.string().describe("The folder ID"),
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
server.tool(
  "list_comments",
  "List all comments on a task",
  {
    task_id: z.string().describe("The task ID"),
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
server.tool(
  "create_comment",
  "Create a comment on a task",
  {
    task_id: z.string().describe("The task ID"),
    content: z.string().describe("Comment content (HTML supported)"),
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
