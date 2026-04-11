# Arca MCP Server

Model Context Protocol (MCP) server for the Arca API. Enables Claude Desktop and other MCP-compatible LLMs to interact with your Arca workspaces, tasks, lists, folders, and comments.

## Features

- **Workspaces**: List and get workspace details
- **Tasks**: List, create, update, delete, and get task details
- **Lists**: List, create, update, and delete lists
- **Folders**: List, create, update, and delete folders
- **Comments**: List and create comments on tasks
- **Statuses**: List, create, update, and delete workspace statuses
- **Labels**: List, create, update, and delete workspace labels

All operations use your personal Arca API key to authenticate directly with the Arca API.

## Installation

### Quick Setup (Recommended)

Add this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "arca": {
      "command": "npx",
      "args": ["-y", "arca-mcp"],
      "env": {
        "ARCA_API_KEY": "arca_your_api_key_here"
      }
    }
  }
}
```

**Get your API key** from **Settings → API Keys** in the Arca app.

**Config file locations:**

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

Then **restart Claude Desktop** to connect.

### Build from Source

If you prefer to build locally:

```bash
git clone https://github.com/gredevelopment/arca-mcp.git
cd arca-mcp
npm install
npm run build
```

Update your Claude Desktop config to use the local build:

```json
{
  "mcpServers": {
    "arca": {
      "command": "node",
      "args": ["/absolute/path/to/arca-mcp/build/index.js"],
      "env": {
        "ARCA_API_KEY": "arca_your_api_key_here"
      }
    }
  }
}
```

## Usage

Once connected, you can ask Claude to interact with your Arca workspace:

- _"List all my Arca workspaces"_
- _"Show me tasks in the [workspace name] workspace"_
- _"Create a task called 'Review PR' in the Development list"_
- _"Update task #42 to high priority"_
- _"Add a comment to task #42: 'Looks good to merge'"_

## Available Tools

### Workspaces

- `list_workspaces` - List all workspaces you have access to
- `get_workspace` - Get detailed information about a specific workspace

### Tasks

- `list_tasks` - List tasks in a workspace (optionally filtered by list)
- `get_task` - Get detailed information about a task
- `create_task` - Create a new task
- `update_task` - Update task properties (title, description, status, priority, dates)
- `delete_task` - Delete a task

### Lists

- `list_lists` - List all lists in a workspace (optionally filtered by folder)
- `create_list` - Create a new list
- `update_list` - Update list properties
- `delete_list` - Delete a list

### Folders

- `list_folders` - List all folders in a workspace
- `create_folder` - Create a new folder
- `update_folder` - Update folder properties
- `delete_folder` - Delete a folder

### Comments

- `list_comments` - List all comments on a task
- `create_comment` - Add a comment to a task

### Statuses

- `list_statuses` - List all statuses in a workspace
- `create_status` - Create a new status (owner/admin only)
- `update_status` - Update status properties (owner/admin only)
- `delete_status` - Delete a status, optionally reassigning tasks (owner/admin only)

### Labels

- `list_labels` - List all labels in a workspace
- `create_label` - Create a new label
- `update_label` - Update label properties (owner/admin only)
- `delete_label` - Delete a label (owner/admin only)

## How It Works

1. The MCP server runs locally on your machine via `npx`
2. It authenticates to the Arca API using your personal API key
3. Claude Desktop communicates with the server via STDIO (standard input/output)
4. All data stays between your machine and Arca's API - no third-party servers involved

## Requirements

- Node.js 16 or higher
- An Arca account with API access
- Claude Desktop (or another MCP-compatible client)

## Security

Your API key is stored locally in the Claude Desktop config and never leaves your machine except to authenticate with the official Arca API (`https://api.getarca.app`).

## Support

For issues or questions:

- **GitHub Issues**: https://github.com/gredevelopment/arca-mcp/issues
- **Arca Support**: https://getarca.app/support

## License

ISC License - see [LICENSE](LICENSE) file for details.
