# Release checklist

## Review before publication

- Review the final automated and browser checks in [Phase 5 verification](PHASE_5_VERIFICATION.md).
- Review the public candidate file list with `git ls-files --cached --others --exclude-standard` and confirm that the genuine sanitized evidence is included.
- Keep original Kane and Codex records in ignored local storage. The secret-pattern audit and Git history checks covered the publication candidate, including untracked publishable files.
- Keep generated builds, dependency directories, local project configurations, credentials, and raw agent streams outside the Git index.
- Obtain explicit approval for the GitHub repository, initial commit, deployment, and submission. Confirm the event's submission requirements and any licensing decision before publishing.

## GitHub publication commands

Run only after approval. Create an empty GitHub repository first and substitute the confirmed owner and repository name. If a remote already exists, verify it before updating or using it.

```powershell
git status --short --untracked-files=all
git log --all --oneline
git branch -M main
git add -- .gitignore AGENTS.md README.md app contracts docs examples scripts src tests eslint.config.mjs package.json package-lock.json postcss.config.mjs tsconfig.json tsconfig.tools.json
git diff --cached --stat
git diff --cached --name-only
git diff --cached --check
git commit -m "Release Invariant verification workspace"
git remote add origin https://github.com/OWNER/REPOSITORY.git
git push -u origin main
```

Inspect the staged file list before the commit. A clean publication candidate includes only the explicit application source, configurations, tests, and audited documentation and sanitized receipts.

## Vercel configuration

| Setting | Recommended value |
| --- | --- |
| Framework preset | Next.js |
| Root directory | Repository root |
| Node.js version | 24.x LTS |
| Install command | npm ci |
| Build command | npm run build |
| Output directory | Next.js framework default |
| Preview and Production environment | INVARIANT_PUBLIC_ONLY=1 |
| Visitor entry path | /demo |

Use Vercel's build-time project environment variable for the public-only flag. Configure only the public-mode application setting. Native agent tools, private evidence directories and their credentials belong to the local development environment. [Vercel build settings](https://vercel.com/docs/builds/configure-a-build) · [Supported Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)

After hosting approval, import the approved GitHub repository from **Add New → Project** in Vercel. Apply the settings above before the first deployment. Git integration can deploy later pushes automatically.

After a separately approved deployment, open `/demo` on the assigned host and verify the guided replay and exports. Check that `/workspace` redirects to the demo, Projects returns HTTP 404, and attempted execution endpoint requests return HTTP 404. Use the confirmed public demo URL and GitHub repository URL in the submission.

## Remaining publication steps

The repository is still pre-publication. Repository ownership and visibility, Vercel project settings, and actual hosting behavior remain to be confirmed. Public build settings were verified locally. The submission needs the eventual URLs, required media, and explicit approval.
