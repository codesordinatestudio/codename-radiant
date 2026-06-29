import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
  },
  format: ["esm"],
  dts: true,
  sourcemap: false,
  clean: true,
  noExternal: ["postgres"],
  external: ["@codesordinatestudio/radiant-bun", "@codesordinatestudio/radiant-bun", "bun"],
});
