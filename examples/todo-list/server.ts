import { createRadiant } from "./radiant";
import { MemoryAdapter, RadiantRuntime } from "@codesordinatestudio/radiant-bun";
import { postgres } from "../../plugins/postgres/src";

async function main() {
  const app = createRadiant({
    adapter: postgres({ url: process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/radiant" }),
    //adapter: new MemoryAdapter()
  });

  // Attach access control rules
  app.access("users", {
    // Anyone can read
    read: (ctx) => true,
    // Only admins can create
    create: (ctx) => ctx.user?.role === "admin",
  });

  app.access("todos", {
    // Anyone can read/write for demo
    read: () => true,
    create: () => true,
    update: () => true,
    delete: () => true,
  });

  // Attach hooks
  app.hooks("todos", {
    beforeCreate: async (ctx) => {
      console.log("Hook intercepted beforeCreate for Todo:", ctx.data);
      // Automatically assign author if not provided
      if (!ctx.data.author) ctx.data.author = ctx.user?.id || "anonymous";
      return ctx.data;
    },
  });

  // Custom route
  app.router.get("/custom", () => {
    return Response.json({ hello: "world" });
  });

  app.router.get("/custom/:id", (req, params) => {
    return new Response(JSON.stringify({ id: params.id }), {
      headers: { "Content-Type": "application/json" },
    });
  });

  await app.start({ port: 3000 });
}

main().catch(console.error);
