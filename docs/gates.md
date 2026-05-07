# Security Gate Reference

The pipeline consists of 9 distinct gates, each focusing on a specific security or compliance domain.

## Gate 1: Intake & Validation
- **Location**: `gates/steps/intake.py`
- **Purpose**: Baseline validation of the submission.
- **Checks**:
    - Presence of `manifest.yaml`.
    - Developer ID signature verification.
    - Required file structure.

## Gate 2: Static Analysis (SAST)
- **Location**: `gates/steps/static_analysis.py`
- **Purpose**: Detecting dangerous code patterns.
- **Tools**: `Semgrep`, Python `ast` module.
- **Checks**:
    - **Semgrep**: Scans for known Python vulnerabilities (OWASP Top 10).
    - **Taint Analysis**: Tracks untrusted input (e.g., `os.getenv`) flowing into dangerous sinks (e.g., `os.system`).
    - **Entropy Check**: Detects high-entropy strings which might be obfuscated code.

## Gate 3: Supply Chain Security
- **Location**: `gates/steps/supply_chain.py`
- **Purpose**: Assessing the safety of external dependencies.
- **Checks**:
    - Dependency confusion attacks.
    - Pinning requirements (preventing floating versions).
    - Verification of private vs. public package sources.

## Gate 4: Secret Detection
- **Location**: `gates/steps/secrets.py`
- **Purpose**: Preventing the leakage of credentials.
- **Tools**: `detect-secrets`.
- **Checks**:
    - API Keys (AWS, Stripe, etc.).
    - Private keys and certificates.
    - Hardcoded passwords and tokens.

## Gate 5: Sandbox Verification
- **Location**: `gates/steps/sandbox.py`
- **Purpose**: Ensuring the plugin respects sandbox constraints.
- **Checks**:
    - Attempts to escape the plugin container.
    - Restricted syscall usage.

## Gate 6: Behavioral Analysis
- **Location**: `gates/steps/behavioral.py`
- **Purpose**: Heuristic-based analysis of plugin behavior.
- **Checks**:
    - Network connectivity to unauthorized domains.
    - Unusual file system access patterns.

## Gate 7: Integrity & Signing
- **Location**: `gates/steps/signing.py`
- **Purpose**: Cryptographic verification of the code.
- **Checks**:
    - Merkle root calculation for the source tree.
    - Verification of the digital signature against the developer's public key.

## Gate 8: Compliance
- **Location**: `gates/steps/compliance.md`
- **Purpose**: Legal and organizational policy checks.
- **Checks**:
    - License compatibility (e.g., ensuring no GPL-3.0 in restricted modules).
    - Required metadata fields.

## Gate 9: Dependency Health
- **Location**: `gates/steps/supply_health.py`
- **Purpose**: Long-term maintenance assessment.
- **Tools**: OpenSSF Scorecard.
- **Checks**:
    - Maintainer activity.
    - Usage of MFA by package owners.
    - Presence of a security policy in upstream repos.
