# Security Gate Reference

The pipeline consists of **11** gates (`pipelines/steps/*.py`), each
focusing on a specific security or compliance domain. Gate 1 runs first and
can short-circuit the pipeline; gates 2–11 then run concurrently — see
[architecture.md](architecture.md#gate-execution-flow).

## Gate 1: Intake & Validation
- **Location**: `pipelines/steps/intake.py`
- **Purpose**: Baseline validation of the submission — blocking.
- **Checks**: manifest (`plugin.yaml`/`service.yaml`) presence and schema,
  lockfile detection, typosquatting against known plugin names, forbidden
  files.
- **Fail-fast**: a score ≥ 80 here rejects the submission immediately —
  gates 2–11 never run.

## Gate 2: Static Analysis (SAST)
- **Location**: `pipelines/steps/static_analysis.py`
- **Purpose**: Detecting dangerous code patterns.
- **Checks**: custom AST scanner over every `.py` file, entropy checks
  (obfuscated/encoded strings), taint tracking (untrusted input flowing
  into dangerous sinks).

## Gate 3: Supply Chain Security
- **Location**: `pipelines/steps/supply_chain.py`
- **Purpose**: Assessing the safety of external dependencies.
- **Tools**: `pip-audit` against `requirements.txt`, plus a direct-URL
  dependency check (packages pinned to a raw URL rather than a registry).

## Gate 4: Secret Detection
- **Location**: `pipelines/steps/secrets.py`
- **Purpose**: Preventing the leakage of credentials.
- **Tools**: `detect-secrets`, plus Gitleaks-style regex patterns (API keys,
  private keys/certificates, hardcoded passwords/tokens).

## Gate 5: Sandbox Verification
- **Location**: `pipelines/steps/sandbox.py`
- **Purpose**: Validates the plugin actually loads under its declared
  `execution_mode` (`sandboxed`, `trusted`, or `legacy`) — instantiates the
  `Plugin` class and checks the required lifecycle methods
  (`on_load`/`on_unload`/`get_router`) exist and don't raise. For
  `execution_mode: trusted`, also verifies the plugin's own `plugin.sig`
  against the host-local `plugin_secret_key`.

## Gate 6: Behavioral Analysis
- **Location**: `pipelines/steps/behavioral.py`
- **Purpose**: Diffs the permissions declared in the manifest against the
  imports actually present in the AST, per file — an import outside the
  declared permission scope is a finding.

## Gate 7: Integrity & Signing
- **Location**: `pipelines/steps/signing.py`
- **Purpose**: Cryptographic verification of the code.
- **Produces**: the Merkle root of the source tree and the HMAC-SHA256
  signature bundle later used to publish the version
  (`PluginVersion.merkle_root`). Also checks a Rekor transparency-log entry
  where applicable.

## Gate 8: Compliance
- **Location**: `pipelines/steps/compliance.py`
- **Purpose**: License compatibility of every dependency, resolved live
  against PyPI metadata.

## Gate 9: Supply Health
- **Location**: `pipelines/steps/supply_health.py`
- **Purpose**: Longer-term maintenance/trust signal for each dependency —
  dependency-confusion risk and an OpenSSF-Scorecard-style score pulled from
  `deps.dev`.

## Gate 10: Outbound HTTP Audit
- **Location**: `pipelines/steps/http_audit.py`
- **Purpose**: Finds every outbound HTTP call the plugin could make
  (`httpx`/`urllib`/`requests`/`aiohttp`, via AST scan) and classifies the
  target domain: a hardcoded call to a known/trusted provider auto-passes
  (score 0); an unknown host or a fully dynamic URL (built at runtime,
  can't be resolved statically) is flagged for manual review.

## Gate 11: Runtime Sandbox
- **Location**: `pipelines/steps/runtime_sandbox.py`
- **Purpose**: Two passes looking for shell/system command execution.
  1. **Static AST pass** — every `subprocess.*`/`os.system`/`os.popen`/
     `os.exec*` call, cross-referenced against `allowed_imports` in
     `plugin.yaml`: declared → `LOW`, undeclared → `HIGH`, and a literal
     dangerous pattern (`rm -rf`, `wget`, `curl | bash`, …) → `CRITICAL`
     regardless.
  2. **Best-effort sandboxed execution pass** — runs the entry point in an
     isolated subprocess with `os.system`/`subprocess.*`/`os.popen`/
     `os.exec*` monkey-patched and a 10-second timeout; any intercepted call
     is reported as a finding. Skipped without penalty if the plugin can't
     even be imported (e.g. missing dependencies) — only the AST pass counts
     in that case.
