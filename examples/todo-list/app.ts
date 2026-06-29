import { createRadiant } from "./radiant/runtime";
import { postgres } from "../../plugins/postgres/src";

export const app = createRadiant({
  adapter: postgres({ url: process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/radiant" })
});
