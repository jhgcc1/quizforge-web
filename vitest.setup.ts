import { afterEach } from "vitest";

// Component tests opt in to jsdom with `// @vitest-environment jsdom`; the node tests need no DOM, so cleanup is conditional.
afterEach(async () => {
  if (typeof document !== "undefined") (await import("@testing-library/react")).cleanup();
});
