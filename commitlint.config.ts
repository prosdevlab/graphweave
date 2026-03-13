import type { UserConfig } from "@commitlint/types";

const config: UserConfig = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // Enforce max header length
    "header-max-length": [2, "always", 72],

    // Allowed commit types
    "type-enum": [
      2,
      "always",
      [
        "feat",
        "fix",
        "docs",
        "style",
        "refactor",
        "perf",
        "test",
        "chore",
        "ci",
        "build",
        "revert",
      ],
    ],

    // Allowed scopes — packages + cross-cutting concerns
    "scope-enum": [
      2,
      "always",
      [
        // Packages
        "canvas",
        "shared",
        "sdk-core",
        "execution",
        "docs",
        // Cross-cutting
        "deps",
        "docker",
        "schema",
        "skills",
      ],
    ],

    // Allow empty scope for repo-wide changes
    "scope-empty": [0],

    // Enforce lowercase type and scope
    "type-case": [2, "always", "lower-case"],
    "scope-case": [2, "always", "lower-case"],

    // Body/footer formatting
    "body-leading-blank": [2, "always"],
    "footer-leading-blank": [2, "always"],
    "body-max-line-length": [1, "always", 100],
  },
};

export default config;
