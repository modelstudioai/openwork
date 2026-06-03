# OpenWork

**A local-first desktop application for AI agent workflows from ModelStudio.**

OpenWork lets you work with AI agents on your desktop: chat with agents, manage multiple sessions, connect local projects and external tools, preview files and execution results, and move real development tasks forward in a permission-controlled environment.

Built for AI agents, OpenWork brings model capabilities, tool use, local engineering context, and multi-step task workflows into one desktop workspace.

## Features

OpenWork gives your AI agent a ready-to-use desktop environment and lets it combine the following capabilities during complex tasks:

- **Multi-session management** - Create separate sessions for different projects, tasks, or experiments, preserve context, and switch between them at any time.
- **Local project workspaces** - Work against local codebases, filesystems, and development environments for real engineering tasks.
- **Agent conversation interface** - View conversations, task progress, tool calls, and execution results inside the desktop app.
- **Code execution and debugging** - Let agents read projects, run commands, analyze logs, modify code, and verify results.
- **File and artifact previews** - Inspect code, documents, spreadsheets, command output, and generated content in the app.
- **External data source connections** - Connect MCP servers, local filesystems, GitHub, and other tools or services.
- **Skills extension** - Capture domain knowledge, tool usage patterns, and team workflows as reusable skills.
- **Automated workflows** - Combine model capabilities, tool calls, and data sources to complete cross-system, multi-step tasks.
- **Permission mode controls** - Confirm and manage file reads and writes, command execution, and external calls.
- **Cross-platform distribution** - Use OpenWork as a desktop app for macOS, Windows, and Linux.

## Example: Complete a Local Engineering Task in One Prompt

A typical desktop agent workflow can start with a single natural-language request:

> "Help me figure out why this project's tests are failing, fix the issue, and summarize the changes."

OpenWork turns that request into a set of executable steps:

1. Read the current project structure, configuration files, and test scripts.
2. Run local commands to reproduce the failure.
3. Analyze error logs and locate the relevant code.
4. Modify files after user authorization.
5. Rerun tests or build commands to verify the fix.
6. Summarize the changes, verification results, and recommended next steps.

You do not need to jump back and forth between the terminal, editor, browser, and documents. You start the task in the desktop app, and the agent performs analysis, execution, and feedback inside the local workspace.

## How It Works

OpenWork runs as a desktop application paired with an agent runtime.

The desktop app handles session management, workspace management, file previews, permission confirmation, external data source configuration, and user interaction. The agent runtime handles model interaction, tool use, command execution, and task progress.

This approach keeps the engineering power of command-line agents while providing a graphical experience better suited for long-running tasks. Developers can continue using local projects and existing toolchains while gaining clearer context management, process visibility, and permission control through the desktop app.

## Use Cases

- Understand the structure and key modules of a codebase.
- Diagnose test, build, or runtime failures.
- Modify code and automatically run verification commands.
- Work with local files, documents, spreadsheets, and execution results.
- Connect GitHub, MCP services, or internal APIs to agent workflows.
- Package recurring team processes as skills or automations.
- Use agent automation in environments that require permission confirmation.

## Relationship to ModelStudio CLI

ModelStudio CLI is designed for terminal workflows and structured tool invocation. It lets AI agents directly call model, search, multimodal, application, and knowledge-base capabilities.

OpenWork provides a graphical workspace for sessions, project context, file previews, permission control, and long-running task management.

The CLI is better suited as a command-line tool and automation entry point. OpenWork is better suited as the daily interactive surface for using, observing, and managing agent workflows. Together, they serve the same goal: bringing ModelStudio models and tools into real development and business processes.

## Related Links

| Resource | Link |
| :--- | :--- |
| ModelStudio CLI | https://github.com/modelstudioai/cli |
| Alibaba Cloud ModelStudio Console | https://bailian.console.aliyun.com/ |
| ModelStudio API Documentation | https://help.aliyun.com/zh/model-studio/ |
| Qwen Model List | https://help.aliyun.com/zh/model-studio/getting-started/models |

## Project Positioning

OpenWork is the desktop entry point for the ModelStudio AI agent ecosystem. It organizes capabilities that are often scattered across terminals, editors, tool platforms, and local files into one workspace, so agents can do more than answer questions: they can connect context, call tools, execute tasks, and produce results.

## Acknowledgments

ModelStudio OpenWork is adapted and extended from the desktop architecture of [Craft Agents OSS](https://github.com/craft-ai-agents/craft-agents-oss), which provides important foundations for the desktop app, session workspace, agent interaction model, and local-first experience.

OpenWork's technical foundation is [Qwen Code](https://github.com/QwenLM/qwen-code), whose agent runtime capabilities support code understanding, tool use, command execution, and engineering task workflows.

We are grateful to these open source projects for the foundations they provide to ModelStudio OpenWork.

## License

Apache 2.0. Third-party dependencies are listed in package manifests and are subject to their respective licenses.
