import { execSync } from "child_process";

const API_URL = "http://localhost:3000";

async function run() {
  console.log("=== Testing Radiant API: E-Commerce ===");
  
  // 1. Scaffold project
  console.log("1. Scaffolding project...");
  const scaffoldRes = await fetch(`${API_URL}/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "E-Commerce Test" })
  });
  const project = await scaffoldRes.json();
  if (!project.projectId) throw new Error("Scaffold failed: " + JSON.stringify(project));
  const { projectId } = project;
  console.log(`Project created with ID: ${projectId}`);

  // 2. Set Config
  console.log("2. Setting configuration...");
  const configRes = await fetch(`${API_URL}/projects/${projectId}/config`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      apiPrefix: "/api/v1",
      port: 3000
    })
  });
  console.log(await configRes.json());

  // 3. Create Collections
  console.log("3. Creating Collections...");
  const collections = [
    {
      name: "products",
      fields: [
        { name: "name", type: "text" },
        { name: "price", type: "number" },
        { name: "inStock", type: "boolean" },
        { name: "description", type: "text", optional: true }
      ]
    },
    {
      name: "orders",
      fields: [
        { name: "total", type: "number" },
        { name: "status", type: "text" },
        { name: "userId", type: "text" }
      ]
    }
  ];

  for (const col of collections) {
    const colRes = await fetch(`${API_URL}/projects/${projectId}/collections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(col)
    });
    console.log(`Created collection ${col.name}:`, await colRes.json());
  }

  // 4. Set Access Rules
  console.log("4. Setting Access Rules...");
  const accessRes = await fetch(`${API_URL}/projects/${projectId}/access`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      collection: "products",
      rules: {
        read: "() => true", // Public can read products
        write: "(ctx) => ctx.user?.role === 'admin'" // Only admins can write
      }
    })
  });
  console.log("Products access rules:", await accessRes.json());

  // 5. Create Hooks
  console.log("5. Creating Hooks...");
  const hookRes = await fetch(`${API_URL}/projects/${projectId}/hooks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      slug: "orders-before-create",
      code: `app.hooks.beforeCreate("orders", async (ctx) => {
  if (ctx.data.total < 0) {
    throw new Error("Order total cannot be negative");
  }
  ctx.data.status = "pending";
});`
    })
  });
  console.log("Orders hook:", await hookRes.json());

  // 6. Build the project
  console.log("6. Building project...");
  const buildRes = await fetch(`${API_URL}/projects/${projectId}/build`, {
    method: "POST"
  });
  const buildResult = await buildRes.json();
  console.log("Build result:", buildResult.status === "built" ? "SUCCESS" : buildResult);

  console.log("=== API Test Complete ===");
}

run().catch(console.error);
