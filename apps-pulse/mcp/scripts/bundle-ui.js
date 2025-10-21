import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..");

try {
  // Ensure dist directory exists
  const distDir = join(rootDir, "mcp", "dist");
  mkdirSync(distDir, { recursive: true });

  // Copy template to dist first
  const srcTemplatePath = join(rootDir, "mcp", "src", "ui-template.html");
  const distTemplatePath = join(distDir, "ui-template.html");
  copyFileSync(srcTemplatePath, distTemplatePath);
  console.log("✅ Template copied to dist");

  // Read the web bundle
  const webBundlePath = join(rootDir, "web", "dist", "assets", "index.js");
  const bundle = readFileSync(webBundlePath, "utf-8");
  let template = readFileSync(distTemplatePath, "utf-8");

  // Inject the script inline
  const scriptTag = `<script type="module">\n${bundle}\n</script>`;
  template = template.replace("<!--BUILD_INJECT_SCRIPT-->", scriptTag);

  writeFileSync(distTemplatePath, template);
  console.log("✅ UI bundle injected into template");
} catch (error) {
  console.error("❌ Failed to bundle UI:", error.message);
  process.exit(1);
}
