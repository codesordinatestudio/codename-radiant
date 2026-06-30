import { createRadiant } from "./radiant/runtime";
import { sqlite } from "@codesordinatestudio/radiant-plugin-sqlite";

export const app = createRadiant({
  adapter: sqlite({ url: "file:./temp/radiant.db" }),
});
