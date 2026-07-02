import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("api", "routes/api.tsx"),
  route("mcp", "routes/mcp.tsx"),
  route("docs/:runtime/:slug?", "routes/doc.tsx"),
] satisfies RouteConfig;