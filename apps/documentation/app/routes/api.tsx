import * as React from "react";
import { AppHeader } from "../components/blocks/AppHeader";
import { Icon } from "@iconify/react";

interface EndpointDoc {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  title: string;
  description: string;
  requestBody?: {
    field: string;
    type: string;
    description: string;
    required?: boolean;
  }[];
  samplePayload?: string;
  responses: {
    status: number;
    statusText: string;
    body: string;
    isError?: boolean;
  }[];
}

const endpoints: EndpointDoc[] = [
  {
    method: "POST",
    path: "/projects",
    title: "Scaffold a Project",
    description:
      "Scaffolds a new Radiant project in a temporary workspace, installs dependencies, and prepares it for configuration.",
    requestBody: [{ field: "name", type: "string", description: "Name of the project.", required: true }],
    samplePayload: `{\n  "name": "my-ecommerce-backend"\n}`,
    responses: [
      {
        status: 200,
        statusText: "OK",
        body: `{\n  "projectId": "8b51a84f-...",\n  "apiKey": "rk_8b51a8...",\n  "targetDir": "/temps/8b5...",\n  "status": "scaffolded",\n  "message": "Project my-ecommerce-backend successfully scaffolded with SQLite database."\n}`,
      },
      {
        status: 500,
        statusText: "Internal Error",
        body: `{\n  "error": "Error scaffolding project..."\n}`,
        isError: true,
      },
    ],
  },
  {
    method: "POST",
    path: "/projects/:projectId/build",
    title: "Build Project",
    description:
      "Triggers `bun run build` inside the specified project directory to compile the Radiant backend into a distributable runtime.",
    responses: [
      {
        status: 200,
        statusText: "OK",
        body: `{\n  "status": "built",\n  "stdout": "...",\n  "stderr": ""\n}`,
      },
      {
        status: 404,
        statusText: "Not Found",
        body: `{\n  "error": "Project not found"\n}`,
        isError: true,
      },
    ],
  },
  {
    method: "POST",
    path: "/projects/:projectId/deploy",
    title: "Deploy Project Locally",
    description: "Spawns the built project locally on an available port.",
    responses: [
      {
        status: 200,
        statusText: "OK",
        body: `{\n  "status": "deployed",\n  "url": "http://localhost:9200",\n  "port": 9200\n}`,
      },
      {
        status: 500,
        statusText: "Internal Error",
        body: `{\n  "error": "Deploy failed",\n  "details": "..."\n}`,
        isError: true,
      },
    ],
  },
  {
    method: "GET",
    path: "/projects/:projectId/collections",
    title: "List Collections",
    description: "Returns the JSON schema AST of all collections currently compiled in the project.",
    responses: [
      {
        status: 200,
        statusText: "OK",
        body: `[\n  {\n    "name": "users",\n    "fields": { ... }\n  }\n]`,
      },
    ],
  },
  {
    method: "POST",
    path: "/projects/:projectId/collections",
    title: "Create Collection",
    description:
      "Generates a new `.radiant` DSL file for a collection, saves it to the project, and automatically runs the compiler to re-generate the schema AST.",
    requestBody: [
      { field: "slug", type: "string", description: "Collection slug (e.g. users).", required: true },
      { field: "fields", type: "array", description: "Array of field definitions.", required: true },
      { field: "auth", type: "boolean", description: "Enable auth on collection." },
    ],
    samplePayload: `{\n  "slug": "posts",\n  "fields": [\n    { "name": "title", "type": "string" },\n    { "name": "content", "type": "text", "optional": true }\n  ]\n}`,
    responses: [
      {
        status: 200,
        statusText: "OK",
        body: `{\n  "collection": "posts",\n  "status": "compiled",\n  "dsl": "\\ncollection posts {..."\n}`,
      },
      {
        status: 409,
        statusText: "Conflict",
        body: `{\n  "error": "Collection already exists"\n}`,
        isError: true,
      },
    ],
  },
  {
    method: "PUT",
    path: "/projects/:projectId/collections/:slug",
    title: "Update Collection",
    description: "Updates an existing collection DSL and recompiles the schema.",
    requestBody: [
      { field: "fields", type: "array", description: "Array of field definitions.", required: true },
      { field: "auth", type: "boolean", description: "Enable auth on collection." },
    ],
    samplePayload: `{\n  "fields": [\n    { "name": "title", "type": "string" }\n  ]\n}`,
    responses: [
      {
        status: 200,
        statusText: "OK",
        body: `{\n  "collection": "posts",\n  "status": "compiled",\n  "dsl": "..."\n}`,
      },
    ],
  },
  {
    method: "DELETE",
    path: "/projects/:projectId/collections/:slug",
    title: "Delete Collection",
    description: "Deletes a collection and recompiles the project.",
    responses: [
      {
        status: 200,
        statusText: "OK",
        body: `{\n  "collection": "posts",\n  "status": "compiled",\n  "removed": true\n}`,
      },
    ],
  },
  {
    method: "POST",
    path: "/projects/:projectId/access",
    title: "Create Access Rules",
    description: "Sets access control rules for a given collection and adds them to the project.",
    requestBody: [
      { field: "collection", type: "string", description: "Target collection.", required: true },
      { field: "rules", type: "object", description: "Map of operations to access logic strings.", required: true },
    ],
    samplePayload: `{\n  "collection": "users",\n  "rules": {\n    "read": "true",\n    "create": "false"\n  }\n}`,
    responses: [
      {
        status: 200,
        statusText: "OK",
        body: `{\n  "collection": "users",\n  "status": "saved",\n  "code": "..."\n}`,
      },
    ],
  },
  {
    method: "PUT",
    path: "/projects/:projectId/access/:collection",
    title: "Update Access Rules",
    description: "Updates the access control rules for a specific collection.",
    requestBody: [
      { field: "rules", type: "object", description: "Map of operations to access logic strings.", required: true },
    ],
    samplePayload: `{\n  "rules": {\n    "read": "ctx.user !== null"\n  }\n}`,
    responses: [
      {
        status: 200,
        statusText: "OK",
        body: `{\n  "collection": "users",\n  "status": "saved",\n  "code": "..."\n}`,
      },
    ],
  },
  {
    method: "DELETE",
    path: "/projects/:projectId/access/:collection",
    title: "Delete Access Rules",
    description: "Removes access control rules for a collection.",
    responses: [
      {
        status: 200,
        statusText: "OK",
        body: `{\n  "collection": "users",\n  "status": "removed"\n}`,
      },
    ],
  },
  {
    method: "POST",
    path: "/projects/:projectId/hooks",
    title: "Create Hook",
    description: "Registers a global application hook (e.g. beforeRequest).",
    requestBody: [
      { field: "slug", type: "string", description: "Name of the hook file.", required: true },
      { field: "code", type: "string", description: "TypeScript source code for the hook.", required: true },
    ],
    samplePayload: `{\n  "slug": "log-hook",\n  "code": "app.plugins.push({ beforeRequest: (ctx) => console.log('req') });"\n}`,
    responses: [
      {
        status: 200,
        statusText: "OK",
        body: `{\n  "slug": "log-hook",\n  "status": "saved",\n  "code": "..."\n}`,
      },
    ],
  },
  {
    method: "PUT",
    path: "/projects/:projectId/hooks/:slug",
    title: "Update Hook",
    description: "Updates the TypeScript code of an existing hook.",
    requestBody: [
      { field: "code", type: "string", description: "TypeScript source code for the hook.", required: true },
    ],
    samplePayload: `{\n  "code": "app.plugins.push({ beforeRequest: (ctx) => console.log('updated') });"\n}`,
    responses: [
      {
        status: 200,
        statusText: "OK",
        body: `{\n  "slug": "log-hook",\n  "status": "saved",\n  "code": "..."\n}`,
      },
    ],
  },
  {
    method: "DELETE",
    path: "/projects/:projectId/hooks/:slug",
    title: "Delete Hook",
    description: "Removes a hook from the project.",
    responses: [
      {
        status: 200,
        statusText: "OK",
        body: `{\n  "slug": "log-hook",\n  "status": "removed"\n}`,
      },
    ],
  },
  {
    method: "PUT",
    path: "/projects/:projectId/config",
    title: "Update Config",
    description: "Updates the project's config.radiant file.",
    requestBody: [{ field: "data", type: "object", description: "Configuration options.", required: true }],
    samplePayload: `{\n  "apiPrefix": "/api/v2"\n}`,
    responses: [
      {
        status: 200,
        statusText: "OK",
        body: `{\n  "status": "compiled",\n  "dsl": "config {\\n  apiPrefix: \\"/api/v2\\";\\n}\\n"\n}`,
      },
    ],
  },
  {
    method: "POST",
    path: "/projects/:projectId/db-sync",
    title: "Database Sync",
    description:
      "Runs the `db:sync` CLI command on the project to synchronize the schema with the underlying database.",
    responses: [
      {
        status: 200,
        statusText: "OK",
        body: `{\n  "status": "synced",\n  "stdout": "...",\n  "stderr": ""\n}`,
      },
    ],
  },
];

export default function ApiReference() {
  React.useEffect(() => {
    document.title = "API Reference - Radiant Documentation";
  }, []);

  return (
    <div className="docs-shell min-h-screen bg-base-100 text-base-content relative">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-64 bg-linear-to-b from-primary/8 to-transparent"></div>
        <div className="absolute top-1/4 right-[-10%] h-125 w-125 rounded-full bg-secondary/5 blur-[100px]"></div>
        <div className="absolute bottom-1/4 left-[-10%] h-125 w-125 rounded-full bg-accent/5 blur-[100px]"></div>
      </div>

      <AppHeader title="API Reference" runtime="ts" />

      <main className="container mx-auto px-6 py-12 md:py-20 max-w-7xl">
        <div className="mb-16 max-w-3xl">
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-base-content mb-6">
            Radiant Builder API
          </h1>
          <p className=" text-base-content/80 leading-relaxed">
            The Radiant Builder API powers the visual builder and CLI, allowing you to programmatically manage projects,
            scaffold collections, define access rules, and deploy your backend. All endpoints are protected via a Bearer
            Token (<code>JWT_SECRET</code>).
          </p>
        </div>

        <div className="space-y-4">
          {endpoints.map((endpoint, idx) => (
            <details
              key={idx}
              className="collapse collapse-arrow bg-base-100 border border-base-content/10 shadow-sm group"
            >
              <summary className="collapse-title p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-6 min-h-0">
                <div className="flex items-center gap-3 shrink-0">
                  <span
                    className={`px-2.5 py-1 text-[11px] font-semibold tracking-wider rounded-md uppercase ${
                      endpoint.method === "POST"
                        ? "text-success bg-success/20"
                        : endpoint.method === "GET"
                          ? "text-info bg-info/20"
                          : endpoint.method === "PUT"
                            ? "text-warning bg-warning/20"
                            : "text-error bg-error/20"
                    }`}
                  >
                    {endpoint.method}
                  </span>
                  <code className="text-sm font-normal tracking-wide text-base-content break-all">{endpoint.path}</code>
                </div>
                <div className="text-sm text-base-content/80 font-normal md:text-right md:pr-10">{endpoint.title}</div>
              </summary>

              <div className="collapse-content px-4 md:px-6 pb-6">
                <div className="flex flex-col xl:flex-row gap-10 items-start mt-2 pt-6 border-t border-base-content/10">
                  <div className="w-full xl:w-4/12">
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-base-content/50 mb-3">
                      Description
                    </h3>
                    <p className="text-base-content/70 leading-relaxed">{endpoint.description}</p>
                  </div>

                  <div className="w-full xl:w-8/12 space-y-4">
                    {endpoint.requestBody && endpoint.requestBody.length > 0 && (
                      <div className="bg-base-200 rounded-2xl border border-base-content/10 overflow-hidden shadow-2xl mb-4">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-base-content/10 bg-base-content/5">
                          <span className="text-xs font-medium text-base-content/60 flex items-center gap-2">
                            <Icon icon="lucide:file-json" className="w-4 h-4" />
                            Request Body
                          </span>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm text-left">
                            <thead className="bg-base-content/5 text-base-content/60 border-b border-base-content/10">
                              <tr>
                                <th className="px-4 py-3 font-medium">Field</th>
                                <th className="px-4 py-3 font-medium">Type</th>
                                <th className="px-4 py-3 font-medium">Description</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-base-content/10">
                              {endpoint.requestBody.map((field, fIdx) => (
                                <tr key={fIdx} className="hover:bg-base-content/5">
                                  <td className="px-4 py-3 font-mono text-xs font-semibold text-base-content">
                                    {field.field} {field.required && <span className="text-error ml-1">*</span>}
                                  </td>
                                  <td className="px-4 py-3 text-base-content/70 font-mono text-xs">{field.type}</td>
                                  <td className="px-4 py-3 text-base-content/70">{field.description}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {endpoint.samplePayload && (
                      <div className="bg-base-200 rounded-2xl border border-base-content/10 overflow-hidden shadow-2xl">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-base-content/10 bg-base-content/5">
                          <span className="text-xs font-medium text-base-content/60 flex items-center gap-2">
                            <Icon icon="lucide:code" className="w-4 h-4" />
                            Sample Payload
                          </span>
                        </div>
                        <div className="p-4 overflow-x-auto">
                          <pre className="text-sm font-mono text-base-content">
                            <code>{endpoint.samplePayload}</code>
                          </pre>
                        </div>
                      </div>
                    )}

                    <div className={`grid grid-cols-1 ${endpoint.responses.length > 1 ? "md:grid-cols-2" : ""} gap-4`}>
                      {endpoint.responses.map((response, rIdx) => (
                        <div
                          key={rIdx}
                          className={`bg-base-200 rounded-2xl border overflow-hidden shadow-xl ${
                            response.isError ? "border-error/20" : "border-success/20"
                          }`}
                        >
                          <div
                            className={`flex items-center justify-between px-4 py-3 border-b border-base-content/10 ${
                              response.isError ? "bg-error/10" : "bg-success/10"
                            }`}
                          >
                            <span
                              className={`text-xs font-medium flex items-center gap-2 ${
                                response.isError ? "text-error" : "text-success"
                              }`}
                            >
                              <Icon
                                icon={response.isError ? "lucide:alert-circle" : "lucide:check-circle"}
                                className="w-4 h-4"
                              />
                              {response.status} {response.statusText}
                            </span>
                          </div>
                          <div className="p-4 overflow-x-auto">
                            <pre className="text-xs font-mono text-base-content">
                              <code>{response.body}</code>
                            </pre>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </details>
          ))}
        </div>
      </main>
    </div>
  );
}
