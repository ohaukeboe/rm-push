# rm-push Constitution

## Core Principles

### I. Test-First (NON-NEGOTIABLE)

- Every behavior change MUST start with a failing automated test that captures the intended
  behavior; implementation follows until the test passes (red-green-refactor).
- Every bug fix MUST include a regression test that fails without the fix.
- Code without tests MUST NOT be merged. Exceptions require a written justification in the
  plan's Complexity Tracking section.

Rationale: a browser extension runs in an environment that is slow and awkward to test by hand;
automated tests are the only reliable guard against regressions.

### II. Layered Test Coverage

- **Unit tests** MUST cover all pure logic (parsing, transforms, state handling) and run without
  a browser.
- **Integration tests** MUST cover interaction between extension components (background/service
  worker, content scripts, popup/options pages, messaging, storage) using faked or mocked
  extension APIs.
- **End-to-end tests** MUST load the built extension into a real browser for each primary user
  flow.
- The full suite MUST be runnable with a single documented command and MUST pass locally and in
  CI before merge.
- Tests MUST be deterministic: no reliance on wall-clock timing, network access to live third-party
  services, or test execution order. External services MUST be stubbed.

Rationale: each layer catches a different class of failure; unit tests stay fast, E2E tests
prove the packaged extension actually works.

### III. Testable Browser-API Boundary

- Direct calls to `browser.*` / `chrome.*` extension APIs MUST be confined to thin adapter
  modules. Business logic MUST receive these capabilities through injection or imports that tests
  can replace.
- Messages passed between extension contexts MUST have explicitly defined shapes, validated at
  the receiving end, and covered by tests.

Rationale: isolating platform APIs keeps the core logic unit-testable and makes cross-browser
differences a contained concern.

### IV. Reproducible Dev Environment via shell.nix

- Every development dependency (runtimes, package managers, browsers and drivers for E2E tests,
  linters, formatters, build and packaging tools) MUST be declared in `shell.nix`.
- The project MUST build, lint, and pass its full test suite from a fresh clone using only
  `nix-shell` (or `direnv` with `use nix`), with no globally installed tools assumed.
- Language-level packages (e.g. npm dependencies) MAY be managed by their native lockfile, but the
  tool that installs them MUST come from `shell.nix`, and lockfiles MUST be committed.
- Adding a dev dependency outside `shell.nix` or the committed lockfile is a constitution
  violation.

Rationale: one declarative environment removes "works on my machine" failures and makes CI and
local runs identical.

### V. Least Privilege & Simplicity

- The extension manifest MUST request only the permissions and host permissions that a shipped
  feature requires; each permission MUST be justified in the feature plan.
- Remote code execution (loading or `eval`-ing code not bundled in the package) is forbidden.
- Prefer the simplest design that satisfies the spec (YAGNI); added abstraction or dependencies
  MUST be justified.

Rationale: extensions run with elevated access to user data; minimal permissions reduce risk and
ease store review.

## Technology & Environment Constraints

- Product type: browser extension. Target browsers and manifest version MUST be stated in the
  feature plan and exercised by E2E tests.
- All tooling MUST be available from nixpkgs via `shell.nix` (see Principle IV).
- Static analysis (linter and type checking where the language supports it) MUST run as part of
  the standard quality gate.

## Development Workflow & Quality Gates

- Work is tracked in beads (`bd`); features follow the Spec Kit flow
  (specify → plan → tasks → implement).
- Before a change is considered complete, all of the following MUST pass inside `nix-shell`:
  lint, type check (if applicable), unit tests, integration tests, E2E tests, and an extension
  build/package step.
- Plans MUST include a Constitution Check confirming compliance with each principle; deviations
  MUST be recorded with justification.
- Reviews MUST verify that new behavior is covered by tests at the appropriate layer.

## Governance

- This constitution supersedes other development practices for this project. Where it conflicts
  with other guidance, it wins unless the user explicitly overrides it for a specific change.
- Amendments MUST be made via `/speckit-constitution`, recorded with a Sync Impact Report, and
  approved by the project owner.
- Versioning follows semantic versioning: MAJOR for removing or redefining a principle, MINOR for
  adding a principle or materially expanding guidance, PATCH for clarifications.
- Compliance is checked at plan time (Constitution Check) and at review time.
- Runtime agent guidance lives in `CLAUDE.md` and `AGENTS.md`.

**Version**: 1.0.0 | **Ratified**: 2026-10-07 | **Last Amended**: 2026-10-07
