import { Elysia, t } from "elysia";

const port = Number(Bun.env.PORT ?? Bun.env.BENCH_PORT ?? 4101);

new Elysia()
  .get("/__bench/ready", () => ({ status: "ok", runtime: "elysia" }))
  .get("/hello", () => "Hello Elysia")
  .post(
    "/schema",
    ({ body, query, headers }) => ({
      name: query.name,
      excitement: query.excitement,
      header: headers["x-foo"] ?? null,
      body,
    }),
    {
      query: t.Object({
        name: t.String(),
        excitement: t.Number(),
      }),
      body: t.Object({
        someKey: t.String(),
        someOtherKey: t.Number(),
        requiredKey: t.Array(t.Number()),
        nullableKey: t.Nullable(t.String()),
        multipleTypesKey: t.Union([t.Boolean(), t.String()]),
        multipleRestrictedTypesKey: t.Union([t.Literal("test"), t.Literal("bench")]),
        enumKey: t.Union([t.Literal("John"), t.Literal("Jane")]),
      }),
    },
  )
  .listen(port);
