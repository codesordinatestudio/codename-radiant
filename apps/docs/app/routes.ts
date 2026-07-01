import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("docs/:slug", "routes/doc.tsx"),
] satisfies RouteConfig;