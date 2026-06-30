import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("docs/example", "routes/docs.example.tsx")
] satisfies RouteConfig;
