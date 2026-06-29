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
  external: ["@codesordinatestudio/lucent", "@codesordinatestudio/lucent-core", "bun"],
});
