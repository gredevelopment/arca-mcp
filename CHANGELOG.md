# Changelog

All notable changes to the Arca MCP Server will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-04-08

### Added

Initial release of the Arca MCP Server for Claude Desktop and MCP-compatible LLMs.

- **STDIO Transport** — Runs locally on user's machine via `npx arca-mcp`
- **npm Distribution** — Install with a single command, no setup required
- **Direct API Integration** — Authenticates to Arca API with user's personal API key

#### Available Tools

**Workspace Management:**

- `list_workspaces` — List all accessible workspaces
- `get_workspace` — Get detailed workspace information

**Task Management:**

- `list_tasks` — List tasks with optional list filtering
- `get_task` — Get detailed task information with full metadata
- `create_task` — Create new tasks with title, description, priority, status, dates
- `update_task` — Update task properties (title, description, priority, status, dates, list)
- `delete_task` — Delete tasks permanently

**List Management:**

- `list_lists` — List all lists in a workspace or folder
- `create_list` — Create new lists with optional folder assignment
- `update_list` — Update list properties and move between folders
- `delete_list` — Delete lists (cascades to contained tasks)

**Folder Management:**

- `list_folders` — List all folders in a workspace
- `create_folder` — Create new folders with name, icon, color
- `update_folder` — Update folder properties
- `delete_folder` — Delete folders (cascades to lists and tasks)

**Comment Management:**

- `list_comments` — List all comments on a task
- `create_comment` — Add comments to tasks (HTML supported)

#### Features

- ✅ **Zero-config installation** — Works immediately with `npx`
- ✅ **Secure authentication** — API key stays on user's machine
- ✅ **Type-safe** — Full TypeScript support with Zod validation
- ✅ **Error handling** — User-friendly error messages
- ✅ **ISC License** — Open source and free to use

#### Requirements

- Node.js 16 or higher
- Arca account with API access
- Claude Desktop or MCP-compatible client

- API keys required for all operations
- Environment variable-based configuration (no hardcoded secrets)
- HTTPS-only communication with Arca API
- Bearer token authentication

### Documentation

- Complete README with setup and usage instructions
- Example Claude for Desktop configuration
- Tool descriptions for all 20 available tools
- Troubleshooting guide
