import { app } from "./app";

// Custom route
app.router.get("/custom", () => {
  return Response.json({ hello: "world" });
});

app.router.get("/custom/:id", (req, params) => {
  return new Response(JSON.stringify({ id: params.id }), {
    headers: { "Content-Type": "application/json" },
  });
});
