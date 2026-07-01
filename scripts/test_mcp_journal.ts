import { spawn } from "child_process";
import { resolve } from "path";

// A minimal wrapper to interact with the radiant-mcp stdio server
async function runMcpTest() {
  console.log("=== Testing Radiant MCP Server: Journal App ===");

  const mcpPath = resolve(__dirname, "../apps/radiant-mcp/src/index.ts");
  const child = spawn("bun", ["run", mcpPath], {
    stdio: ["pipe", "pipe", "inherit"],
  });

  let messageId = 1;

  const sendRequest = (method: string, params: any): Promise<any> => {
    return new Promise((resolve, reject) => {
      const id = messageId++;
      const req = {
        jsonrpc: "2.0",
        id,
        method,
        params,
      };

      const handleData = (data: Buffer) => {
        const messages = data.toString().trim().split("\n");
        for (const msg of messages) {
          try {
            const parsed = JSON.parse(msg);
            if (parsed.id === id) {
              child.stdout.off("data", handleData);
              if (parsed.error) reject(parsed.error);
              else resolve(parsed.result);
            }
          } catch (e) {
            // ignore non-json lines
          }
        }
      };

      child.stdout.on("data", handleData);
      child.stdin.write(JSON.stringify(req) + "\n");
    });
  };

  try {
    // Wait a brief moment for the server to start
    await new Promise((r) => setTimeout(r, 1000));

    // 1. Scaffold project
    console.log("1. Scaffolding project via MCP...");
    const scaffoldRes = await sendRequest("tools/call", {
      name: "radiant_project",
      arguments: { action: "SCAFFOLD", name: "Journal App" }
    });
    const project = JSON.parse(scaffoldRes.content[0].text);
    const projectId = project.projectId;
    console.log(`Project created with ID: ${projectId}`);

    // 2. Create Journal Collection
    console.log("2. Creating Journal Collection via MCP...");
    const colRes = await sendRequest("tools/call", {
      name: "radiant_collection_crud",
      arguments: {
        projectId,
        operation: "POST",
        name: "entries",
        schema: {
          title: "text",
          content: "text",
          images: "text[]", // URLs to images
          createdAt: "date"
        }
      }
    });
    console.log("Created collection:", JSON.parse(colRes.content[0].text));

    // 3. Create Custom Route for Image Upload Simulation
    console.log("3. Creating Custom Route (Hooks via MCP)...");
    const hookRes = await sendRequest("tools/call", {
      name: "radiant_hooks_crud",
      arguments: {
        projectId,
        operation: "POST",
        slug: "upload-image-route",
        code: `app.router.post("/upload", async (ctx) => {
  return { url: "https://example.com/image.jpg", status: "uploaded" };
});`
      }
    });
    console.log("Created custom route:", JSON.parse(hookRes.content[0].text));

    // 4. Build the project
    console.log("4. Building project via MCP...");
    const buildRes = await sendRequest("tools/call", {
      name: "radiant_project",
      arguments: { projectId, action: "BUILD" }
    });
    console.log("Build result:", JSON.parse(buildRes.content[0].text).status);

    console.log("=== MCP Test Complete ===");

  } catch (error) {
    console.error("Test failed:", error);
  } finally {
    child.kill();
  }
}

runMcpTest();
