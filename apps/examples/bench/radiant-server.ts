import { Type as t } from "@sinclair/typebox";
import { createRadiant } from "../todo-list/radiant/runtime";
import { sqlite } from "../../../plugins/ts/sqlite/src/index";

const port = Number(Bun.env.PORT ?? Bun.env.BENCH_PORT ?? 4100);
process.env.JWT_SECRET = "secret";

const app = createRadiant({
  adapter: sqlite({ url: ":memory:" }),
});

app.router.get("/__bench/ready", () => ({ status: "ok", runtime: "radiant" }));
app.router.get("/hello", () => "Hello Radiant");

app.router.post(
  "/schema",
  ({ body, query, request }) => ({
    name: query.name,
    excitement: query.excitement,
    header: request.headers.get("x-foo") ?? null,
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
      nullableKey: t.Union([t.String(), t.Null()]),
      multipleTypesKey: t.Union([t.Boolean(), t.String()]),
      multipleRestrictedTypesKey: t.Union([t.Literal("test"), t.Literal("bench")]),
      enumKey: t.Union([t.Literal("John"), t.Literal("Jane")]),
    }),
  },
);

app.start({ port }).catch(console.error);
