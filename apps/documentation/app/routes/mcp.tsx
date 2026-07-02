import * as React from "react";
import { AppHeader } from "../components/blocks/AppHeader";
import { Icon } from "@iconify/react";

const mcpTools = [
  {
    name: "radiant_collection_crud",
    title: "Collection CRUD",
    description: "Create, read, update, or delete a Radiant collection via API.",
    arguments: [
      { name: "projectId", type: "string", description: "Project Identifier", optional: false },
      { name: "operation", type: "string", description: '"POST", "PUT", "DELETE", or "GET"', optional: false },
      { name: "name", type: "string", description: "Collection name", optional: false },
      { name: "schema", type: "object", description: "Collection schema (required for POST/PUT)", optional: true },
    ],
    agentRequest: `{
  "name": "radiant_collection_crud",
  "arguments": {
    "projectId": "proj_123",
    "operation": "POST",
    "name": "users",
    "schema": {
      "fields": {
        "email": { "type": "email", "unique": true }
      }
    }
  }
}`,
  },
  {
    name: "radiant_access_crud",
    title: "Access Rules CRUD",
    description: "Configure collection access rules.",
    arguments: [
      { name: "projectId", type: "string", description: "Project Identifier", optional: false },
      { name: "operation", type: "string", description: '"POST", "PUT", or "DELETE"', optional: false },
      { name: "collection", type: "string", description: "Collection name", optional: false },
      { name: "rules", type: "object", description: "Access rules mapping", optional: true },
    ],
    agentRequest: `{
  "name": "radiant_access_crud",
  "arguments": {
    "projectId": "proj_123",
    "operation": "PUT",
    "collection": "users",
    "rules": {
      "read": "() => true",
      "write": "(user) => user.role === 'admin'"
    }
  }
}`,
  },
  {
    name: "radiant_hooks_crud",
    title: "Hooks CRUD",
    description: "Configure hooks and custom logic.",
    arguments: [
      { name: "projectId", type: "string", description: "Project Identifier", optional: false },
      { name: "operation", type: "string", description: '"POST", "PUT", or "DELETE"', optional: false },
      { name: "slug", type: "string", description: "Hook slug identifier", optional: false },
      { name: "code", type: "string", description: "TypeScript code block", optional: true },
    ],
    agentRequest: `{
  "name": "radiant_hooks_crud",
  "arguments": {
    "projectId": "proj_123",
    "operation": "POST",
    "slug": "onUserSignup",
    "code": "export default async function onUserSignup(ctx) { ... }"
  }
}`,
  },
  {
    name: "radiant_cron_crud",
    title: "Cron Jobs CRUD",
    description: "Configure cron jobs.",
    arguments: [
      { name: "projectId", type: "string", description: "Project Identifier", optional: false },
      { name: "operation", type: "string", description: '"POST", "PUT", or "DELETE"', optional: false },
      { name: "slug", type: "string", description: "Cron slug identifier", optional: false },
      { name: "code", type: "string", description: "TypeScript code block for cron", optional: true },
    ],
    agentRequest: `{
  "name": "radiant_cron_crud",
  "arguments": {
    "projectId": "proj_123",
    "operation": "POST",
    "slug": "dailyReport",
    "code": "export default async function dailyReport() { ... }"
  }
}`,
  },
  {
    name: "radiant_realtime_crud",
    title: "Realtime Utilities CRUD",
    description: "Configure realtime utilities (SSE, Websockets).",
    arguments: [
      { name: "projectId", type: "string", description: "Project Identifier", optional: false },
      { name: "operation", type: "string", description: '"POST", "PUT", or "DELETE"', optional: false },
      { name: "slug", type: "string", description: "Realtime slug identifier", optional: false },
      { name: "code", type: "string", description: "TypeScript code block", optional: true },
    ],
    agentRequest: `{
  "name": "radiant_realtime_crud",
  "arguments": {
    "projectId": "proj_123",
    "operation": "POST",
    "slug": "liveUpdates",
    "code": "export default function onConnect(ws) { ... }"
  }
}`,
  },
  {
    name: "radiant_queues_crud",
    title: "Queues CRUD",
    description: "Configure background queues.",
    arguments: [
      { name: "projectId", type: "string", description: "Project Identifier", optional: false },
      { name: "operation", type: "string", description: '"POST", "PUT", or "DELETE"', optional: false },
      { name: "slug", type: "string", description: "Queue slug identifier", optional: false },
      { name: "code", type: "string", description: "TypeScript code block", optional: true },
    ],
    agentRequest: `{
  "name": "radiant_queues_crud",
  "arguments": {
    "projectId": "proj_123",
    "operation": "POST",
    "slug": "emailQueue",
    "code": "export default async function processEmail(job) { ... }"
  }
}`,
  },
  {
    name: "radiant_config",
    title: "Project Configuration",
    description: "Update the configuration for a Radiant project.",
    arguments: [
      { name: "projectId", type: "string", description: "Project Identifier", optional: false },
      { name: "config", type: "object", description: "Configuration mapping to apply", optional: false },
    ],
    agentRequest: `{
  "name": "radiant_config",
  "arguments": {
    "projectId": "proj_123",
    "config": {
      "cors": "*",
      "port": 8080
    }
  }
}`,
  },
  {
    name: "radiant_project",
    title: "Project Lifecycle",
    description: "Scaffold, build, or deploy a Radiant project.",
    arguments: [
      { name: "action", type: "string", description: '"SCAFFOLD", "BUILD", or "DEPLOY"', optional: false },
      { name: "projectId", type: "string", description: "Required for build/deploy", optional: true },
      { name: "name", type: "string", description: "Project name (required for SCAFFOLD)", optional: true },
    ],
    agentRequest: `{
  "name": "radiant_project",
  "arguments": {
    "action": "BUILD",
    "projectId": "proj_123"
  }
}`,
  },
];

export default function McpReference() {
  React.useEffect(() => {
    document.title = "MCP Reference - Radiant Documentation";
  }, []);

  const [activeTab, setActiveTab] = React.useState("cursor");

  const CodeBlock = ({ code, filename }: { code: string; filename?: string }) => (
    <div className="bg-base-300 rounded-xl overflow-hidden relative group border border-base-content/10 shadow-sm">
      {filename && (
        <div className="px-4 py-2 border-b border-base-content/10 bg-base-200 text-xs text-base-content/50 font-mono">
          {filename}
        </div>
      )}
      <div className="p-4 overflow-x-auto">
        <pre className="text-sm font-mono text-base-content/80 leading-relaxed">
          <code>{code}</code>
        </pre>
      </div>
      <button className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity bg-base-100 hover:bg-base-200 border border-base-content/10 rounded px-3 py-1.5 text-xs font-medium text-base-content/70 shadow-sm">
        Copy
      </button>
    </div>
  );

  return (
    <div className="docs-shell min-h-screen text-base-content flex flex-col selection:bg-primary/30">
      <AppHeader title="MCP Reference" runtime="ts" />

      {/* --- HERO & INSTALLATION SECTION --- */}
      <section className="bg-base-100 py-12 md:py-16 w-full border-b border-base-content/5">
        <div className="container mx-auto px-6 max-w-7xl">
          <h1 className="text-5xl md:text-7xl font-black tracking-tight text-base-content mb-3">Radiant MCP.</h1>
          <p className="text-base-content/70 mb-8 max-w-3xl font-light leading-relaxed">
            Empower AI agents with direct, deeply integrated access to your Radiant backend. Introspect schemas, execute
            operations, and deploy seamlessly.
          </p>

          <div className="bg-base-200/30 rounded-4xl border border-base-content/10 p-8 md:p-12 shadow-sm text-left w-full">
            <h3 className="font-bold text-xl text-base-content mb-8">Agentic AI CLI Tools</h3>

            {/* Minimal Underline Tabs */}
            <div className="flex flex-wrap gap-8 border-b border-base-content/10 mb-8">
              {[
                { id: "cursor", label: "Cursor" },
                { id: "claude", label: "Claude Desktop" },
                { id: "codex", label: "Codex" },
                { id: "others", label: "Others" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`pb-3 text-sm font-semibold transition-all duration-300 border-b-2 -mb-px ${
                    activeTab === tab.id
                      ? "border-primary text-primary"
                      : "border-transparent text-base-content/50 hover:text-base-content"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab Contents */}
            <div className="relative min-h-37.5">
              {activeTab === "cursor" && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <p className="text-sm text-base-content/70 mb-4 font-medium">
                    1. Append this to your workspace{" "}
                    <code className="font-mono text-primary/80 bg-primary/10 px-1.5 py-0.5 rounded mx-1">
                      .cursor/mcp.json
                    </code>
                    :
                  </p>
                  <CodeBlock
                    filename="cursor_mcp.json"
                    code={`{
  "mcpServers": {
    "radiant": {
      "command": "bun",
      "args": ["run", "apps/radiant-mcp/src/index.ts"],
      "env": {
        "API_BASE_URL": "http://localhost:9100",
        "API_KEY": "your-jwt-token-here"
      }
    }
  }
}`}
                  />
                </div>
              )}

              {activeTab === "claude" && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <p className="text-sm text-base-content/70 mb-4 font-medium">
                    1. Append this to your global{" "}
                    <code className="font-mono text-primary/80 bg-primary/10 px-1.5 py-0.5 rounded mx-1">
                      claude_desktop_config.json
                    </code>
                    :
                  </p>
                  <CodeBlock
                    filename="claude_desktop_config.json"
                    code={`{
  "mcpServers": {
    "radiant": {
      "command": "bun",
      "args": ["run", "apps/radiant-mcp/src/index.ts"],
      "env": {
        "API_BASE_URL": "http://localhost:9100",
        "API_KEY": "your-jwt-token-here"
      }
    }
  }
}`}
                  />
                </div>
              )}

              {activeTab === "codex" && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <p className="text-sm text-base-content/70 mb-4 font-medium">
                    1. Append this to your workspace{" "}
                    <code className="font-mono text-primary/80 bg-primary/10 px-1.5 py-0.5 rounded mx-1">mcp.json</code>
                    :
                  </p>
                  <CodeBlock
                    filename="mcp.json"
                    code={`{
  "mcpServers": {
    "radiant": {
      "command": "bun",
      "args": ["run", "apps/radiant-mcp/src/index.ts"],
      "env": {
        "API_BASE_URL": "http://localhost:9100",
        "API_KEY": "your-jwt-token-here"
      }
    }
  }
}`}
                  />
                </div>
              )}

              {activeTab === "others" && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <p className="text-sm text-base-content/70 mb-4 font-medium">
                    1. For any other compliant agent, implement the standard stdio configuration block:
                  </p>
                  <CodeBlock
                    filename="generic_mcp.json"
                    code={`{
  "mcpServers": {
    "radiant": {
      "command": "bun",
      "args": ["run", "apps/radiant-mcp/src/index.ts"],
      "env": {
        "API_BASE_URL": "http://localhost:9100",
        "API_KEY": "your-jwt-token-here"
      }
    }
  }
}`}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* --- TOOLS SECTION --- */}
      <section className="bg-base-200 py-12 md:py-16 w-full border-t border-base-content/5 grow">
        <div className="container mx-auto px-6 max-w-7xl">
          <div className="mb-8">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-base-content mb-3">
              {mcpTools.length} tools. Endless possibilities.
            </h2>
            <p className="text-lg text-base-content/60 font-medium max-w-2xl">
              Everything your agent needs to navigate, modify, and build on Radiant.
            </p>
          </div>

          <div className="space-y-4">
            {mcpTools.map((tool, idx) => (
              <details
                key={idx}
                className="collapse collapse-arrow bg-base-100 border border-base-content/10 shadow-sm group"
              >
                <summary className="collapse-title p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-6 min-h-0">
                  <div className="flex items-center gap-3 shrink-0 mb-2 md:mb-0">
                    <span className="px-2.5 py-1 text-[11px] font-semibold tracking-wider rounded-md uppercase text-primary bg-primary/20">
                      TOOL
                    </span>
                    <code className="text-sm font-normal tracking-wide text-base-content break-all">{tool.name}</code>
                  </div>
                  <div className="md:text-right md:pr-10 flex flex-col gap-1">
                    <div className="text-sm text-base-content font-medium">{tool.title}</div>
                    <div className="text-xs text-base-content/60 font-normal line-clamp-2 md:line-clamp-1">
                      {tool.description}
                    </div>
                  </div>
                </summary>

                <div className="collapse-content px-4 md:px-6 pb-6">
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start mt-2 pt-6 border-t border-base-content/10">
                    {tool.arguments && tool.arguments.length > 0 && (
                      <div className="bg-base-200 rounded-2xl border border-base-content/10 overflow-hidden shadow-2xl h-full flex flex-col">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-base-content/10 bg-base-content/5 shrink-0">
                          <span className="text-xs font-medium text-base-content/60 flex items-center gap-2">
                            <Icon icon="lucide:file-json" className="w-4 h-4" />
                            Arguments
                          </span>
                        </div>
                        <div className="overflow-x-auto flex-grow">
                          <table className="w-full text-sm text-left">
                            <thead className="bg-base-content/5 text-base-content/60 border-b border-base-content/10">
                              <tr>
                                <th className="px-4 py-3 font-medium">Field</th>
                                <th className="px-4 py-3 font-medium">Type</th>
                                <th className="px-4 py-3 font-medium">Description</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-base-content/10">
                              {tool.arguments.map((arg, argIdx) => (
                                <tr key={argIdx} className="hover:bg-base-content/5">
                                  <td className="px-4 py-3 font-mono text-xs font-semibold text-base-content">
                                    {arg.name} {!arg.optional && <span className="text-error ml-1">*</span>}
                                  </td>
                                  <td className="px-4 py-3 text-base-content/70 font-mono text-xs">{arg.type}</td>
                                  <td className="px-4 py-3 text-base-content/70">{arg.description}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {tool.agentRequest && (
                      <div className="bg-base-200 rounded-2xl border border-base-content/10 overflow-hidden shadow-2xl h-full flex flex-col">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-base-content/10 bg-base-content/5 shrink-0">
                          <span className="text-xs font-medium text-base-content/60 flex items-center gap-2">
                            <Icon icon="lucide:bot" className="w-4 h-4" />
                            Expected LLM Request
                          </span>
                        </div>
                        <div className="p-4 overflow-x-auto flex-grow">
                          <pre className="text-xs font-mono text-base-content">
                            <code>{tool.agentRequest}</code>
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
