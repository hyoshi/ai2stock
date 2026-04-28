# Security Policy

## Supported Versions

Only the latest minor release on the `main` branch receives security fixes. AI2Stock is a small personal project; older versions are not patched.

| Version | Supported |
| ------- | --------- |
| 0.6.x   | Yes       |
| < 0.6   | No        |

## Reporting a Vulnerability

Please **do not** open a public GitHub issue for security problems.

Report privately via one of the following:

1. **GitHub Private Vulnerability Reporting** (preferred) — open the repository's **Security** tab and click **Report a vulnerability**.
2. **Email** — send details to the maintainer via the address listed on the GitHub profile of the repository owner.

Please include:

- A clear description of the issue and its impact.
- Reproduction steps or a minimal proof of concept.
- Affected version / commit hash.
- Your environment (OS, Node.js version, target backend: Obsidian or Notion).

## Response Expectations

- Acknowledgement within **7 days**.
- Triage and severity assessment within **14 days**.
- Coordinated disclosure timeline agreed with the reporter (typically 30–90 days depending on severity).

This is a best-effort timeline for a personal project; complex issues may take longer.

## Scope

In scope:

- The CLI shipped from this repository (`@yoshinaga/ai2stock`).
- The Obsidian and Notion adapter code under `src/adapters/`.
- The slash-command definition in `commands/stock.md`.

Out of scope:

- Vulnerabilities in third-party dependencies — please report those upstream. If a dependency advisory affects AI2Stock, we will track it via Dependabot.
- Issues in Obsidian or Notion themselves.
- Social-engineering or phishing attacks unrelated to this codebase.

## Disclosure

After a fix is released, the advisory will be published via GitHub Security Advisories with credit to the reporter (unless anonymity is requested).
