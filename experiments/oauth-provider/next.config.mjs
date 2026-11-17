import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
export default { reactStrictMode: true, turbopack: { root }, outputFileTracingRoot: root };
