import { defineConfig } from "tsup";

// One file for App Service: dist/main.js. emitDecoratorMetadata in tsconfig makes tsup use SWC,
// which keeps the type metadata Nest needs for dependency injection.
export default defineConfig((options) => ({
  entry: ["src/main.ts"],
  format: ["esm"],
  target: "node22",
  platform: "node",
  sourcemap: true,
  clean: true,
  noExternal: [/^@ubuzima\//],
  // Only with --watch (pnpm dev): also rebuild when the shared packages or the generated database client change.
  watch: options.watch ? ["src", "../../packages/shared/src", "../../packages/db/src"] : false,
  // Bundled CommonJS packages (pg) call require(); give the ESM bundle a real one.
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
}));
