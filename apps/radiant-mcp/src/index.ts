import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";

const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:3000";

const server = new Server(
  {
    name: "radiant-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// Define the tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "radiant_collection_crud",
        description: "Create, read, update, or delete a Radiant collection via API.",
        inputSchema: {
          type: "object",
          properties: {
            projectId: { type: "string" },
            operation: { type: "string", enum: ["POST", "PUT", "DELETE", "GET"] },
            name: { type: "string", description: "Collection name" },
            schema: { type: "object", description: "Collection schema (required for POST/PUT)" },
          },
          required: ["projectId", "operation", "name"],
        },
      },
      {
        name: "radiant_access_crud",
        description: "Configure collection access rules.",
        inputSchema: {
          type: "object",
          properties: {
            projectId: { type: "string" },
            operation: { type: "string", enum: ["POST", "PUT", "DELETE"] },
            collection: { type: "string", description: "Collection name" },
            rules: {
              type: "object",
              description: "Access rules mapping e.g. { read: '() => true' } (required for POST/PUT)",
            },
          },
          required: ["projectId", "operation", "collection"],
        },
      },
      {
        name: "radiant_hooks_crud",
        description: "Configure hooks and custom logic.",
        inputSchema: {
          type: "object",
          properties: {
            projectId: { type: "string" },
            operation: { type: "string", enum: ["POST", "PUT", "DELETE"] },
            slug: { type: "string", description: "Hook slug identifier" },
            code: { type: "string", description: "TypeScript code block (required for POST/PUT)" },
          },
          required: ["projectId", "operation", "slug"],
        },
      },
      {
        name: "radiant_cron_crud",
        description: "Configure cron jobs.",
        inputSchema: {
          type: "object",
          properties: {
            projectId: { type: "string" },
            operation: { type: "string", enum: ["POST", "PUT", "DELETE"] },
            slug: { type: "string", description: "Cron slug identifier" },
            code: { type: "string", description: "TypeScript code block for cron (required for POST/PUT)" },
          },
          required: ["projectId", "operation", "slug"],
        },
      },
      {
        name: "radiant_realtime_crud",
        description: "Configure realtime utilities (SSE, Websockets).",
        inputSchema: {
          type: "object",
          properties: {
            projectId: { type: "string" },
            operation: { type: "string", enum: ["POST", "PUT", "DELETE"] },
            slug: { type: "string", description: "Realtime slug identifier" },
            code: { type: "string", description: "TypeScript code block (required for POST/PUT)" },
          },
          required: ["projectId", "operation", "slug"],
        },
      },
      {
        name: "radiant_queues_crud",
        description: "Configure background queues.",
        inputSchema: {
          type: "object",
          properties: {
            projectId: { type: "string" },
            operation: { type: "string", enum: ["POST", "PUT", "DELETE"] },
            slug: { type: "string", description: "Queue slug identifier" },
            code: { type: "string", description: "TypeScript code block (required for POST/PUT)" },
          },
          required: ["projectId", "operation", "slug"],
        },
      },
      {
        name: "radiant_config",
        description: "Update the configuration for a Radiant project.",
        inputSchema: {
          type: "object",
          properties: {
            projectId: { type: "string" },
            config: { type: "object", description: "Configuration mapping to apply" },
          },
          required: ["projectId", "config"],
        },
      },
      {
        name: "radiant_project",
        description: "Scaffold, build, or deploy a Radiant project.",
        inputSchema: {
          type: "object",
          properties: {
            projectId: { type: "string", description: "Required for build/deploy" },
            action: { type: "string", enum: ["SCAFFOLD", "BUILD", "DEPLOY"] },
            name: { type: "string", description: "Project name (required for SCAFFOLD)" },
          },
          required: ["action"],
        },
      },
    ],
  };
});

// Helper for making requests to the Builder API
async function apiRequest(endpoint: string, method: string, body?: any) {
  const url = `${API_BASE_URL}${endpoint}`;
  const options: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
    },
  };
  if (body) {
    options.body = JSON.stringify(body);
  }

  const res = await fetch(url, options);
  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(`API Error (${res.status}): ${JSON.stringify(data)}`);
  }
  return data;
}

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "radiant_collection_crud": {
        const { projectId, operation, name: colName, schema } = args as any;
        const fieldsArray = Object.entries(schema).map(([name, type]) => {
          if (typeof type === "string" && type.endsWith("[]")) {
            return { name, type: "array", items: type.replace("[]", "") };
          }
          return { name, type: type as string };
        });
        const endpoint =
          operation === "POST" ? `/projects/${projectId}/collections` : `/projects/${projectId}/collections/${colName}`;
        const body = operation === "DELETE" || operation === "GET" ? undefined : { name: colName, fields: fieldsArray };
        const result = await apiRequest(endpoint, operation, body);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "radiant_access_crud": {
        const { projectId, operation, collection, rules } = args as any;
        const endpoint =
          operation === "POST" ? `/projects/${projectId}/access` : `/projects/${projectId}/access/${collection}`;
        const body = operation === "DELETE" ? undefined : operation === "POST" ? { collection, rules } : { rules };
        const result = await apiRequest(endpoint, operation, body);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "radiant_hooks_crud": {
        const { projectId, operation, slug, code } = args as any;
        const endpoint = operation === "POST" ? `/projects/${projectId}/hooks` : `/projects/${projectId}/hooks/${slug}`;
        const body = operation === "DELETE" ? undefined : operation === "POST" ? { slug, code } : { code };
        const result = await apiRequest(endpoint, operation, body);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "radiant_cron_crud": {
        const { projectId, operation, slug, code } = args as any;
        const endpoint = operation === "POST" ? `/projects/${projectId}/cron` : `/projects/${projectId}/cron/${slug}`;
        const body = operation === "DELETE" ? undefined : operation === "POST" ? { slug, code } : { code };
        const result = await apiRequest(endpoint, operation, body);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "radiant_realtime_crud": {
        const { projectId, operation, slug, code } = args as any;
        const endpoint =
          operation === "POST" ? `/projects/${projectId}/realtime` : `/projects/${projectId}/realtime/${slug}`;
        const body = operation === "DELETE" ? undefined : operation === "POST" ? { slug, code } : { code };
        const result = await apiRequest(endpoint, operation, body);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "radiant_queues_crud": {
        const { projectId, operation, slug, code } = args as any;
        const endpoint =
          operation === "POST" ? `/projects/${projectId}/queues` : `/projects/${projectId}/queues/${slug}`;
        const body = operation === "DELETE" ? undefined : operation === "POST" ? { slug, code } : { code };
        const result = await apiRequest(endpoint, operation, body);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "radiant_config": {
        const { projectId, config } = args as any;
        const result = await apiRequest(`/projects/${projectId}/config`, "PUT", config);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "radiant_project": {
        const { projectId, action, name: projectName } = args as any;
        let endpoint = "";
        let method = "POST";
        let body: any = undefined;

        if (action === "SCAFFOLD") {
          endpoint = "/projects";
          body = { name: projectName };
        } else if (action === "BUILD") {
          endpoint = `/projects/${projectId}/build`;
        } else if (action === "DEPLOY") {
          endpoint = `/projects/${projectId}/deploy`;
        }

        const result = await apiRequest(endpoint, method, body);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  } catch (error: any) {
    return {
      content: [
        {
          type: "text",
          text: `Error executing ${name}: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Radiant MCP server running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
