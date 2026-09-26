# Upstream Submodule Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Track `manucoffin/faster-fixes` at the current `de07294f29fd4c46fb572236ca5b491c9fb72631` commit as the repository's `upstream/` Git submodule and build that pinned revision in CI.

**Architecture:** The parent repository records a `.gitmodules` URL and a `160000` gitlink for `upstream/`. GitHub Actions initializes the submodule at checkout and builds the recorded commit. Local clone and update instructions explain how to fetch the submodule and advance its pointer deliberately.

**Tech Stack:** Git submodules, GitHub Actions checkout v4, Docker, Markdown.

---

## File map

- Create `.gitmodules` with the `upstream` path and `https://github.com/manucoffin/faster-fixes.git` URL.
- Track `upstream` as a Git gitlink at commit `de07294f29fd4c46fb572236ca5b491c9fb72631`.
- Modify `.gitignore` to remove the `upstream/` ignore entry.
- Modify `.github/workflows/publish.yml` to initialize the recorded submodule and remove the separate moving checkout and its `upstream_ref` input.
- Modify `README.md` to describe pinned builds, local initialization, and updating the pointer.

## Task 1: Track upstream as a submodule

**Files:** Create `.gitmodules`; add gitlink `upstream`; modify `.gitignore`.

- [x] Remove only the `upstream/` line from `.gitignore`; keep `.env` ignored.
- [x] Add the local upstream checkout as the submodule at `upstream/`, pinning its clean HEAD `de07294f29fd4c46fb572236ca5b491c9fb72631`. Record this exact committed configuration in `.gitmodules`:

```gitconfig
[submodule "upstream"]
	path = upstream
	url = https://github.com/manucoffin/faster-fixes.git
```

- [x] Check the staged entry and URL. Expected: `git ls-files --stage upstream` shows mode `160000` and the full SHA above; `git config --file .gitmodules --get submodule.upstream.url` shows the GitHub URL; `git -C upstream rev-parse HEAD` shows the same SHA.

## Task 2: Build the pinned checkout in Actions

**Files:** Modify `.github/workflows/publish.yml`.

- [x] Replace the manual upstream input block with plain `workflow_dispatch:`. Preserve push, schedule, permissions, and concurrency triggers.
- [x] Configure the existing parent checkout to initialize the submodule, then remove the separate `Checkout Faster Fixes` step:

```yaml
      - name: Checkout this project
        uses: actions/checkout@v4
        with:
          submodules: true
```

- [x] Keep the `git -C upstream rev-parse --short=12 HEAD` image tag calculation. It now names the commit recorded by the parent repository. Confirm the Dockerfile's `COPY upstream/ /app/` and `.dockerignore`'s `**/.git` work with a populated submodule.

## Task 3: Explain cloning and upstream updates

**Files:** Modify `README.md`.

- [x] State in the introduction and publishing guide that `upstream/` is a pinned submodule. Pushes, scheduled runs, and manual runs build the recorded commit. Explain that moving upstream requires a parent repository commit and compatibility patches may need adjusting when it moves.
- [x] Replace the separate upstream clone instruction in `Build locally` with the equivalent submodule instructions:

```sh
git clone --recurse-submodules https://github.com/dvteixeira24/faster-fixes-containers.git
```

For an existing checkout, use:

```sh
git submodule update --init upstream
```

- [x] Add an update example that deliberately moves the pointer and records it:

```sh
git -C upstream fetch origin
git -C upstream switch --detach origin/main
git add upstream
git commit -m "chore: update upstream submodule"
```

- [x] Review the final diff for stale references to the old moving checkout or ignored `upstream/`. Run `git diff --check`, inspect `.gitmodules`, verify the gitlink mode and SHA, and confirm the Actions YAML has only one checkout step.

## Acceptance checklist

- A fresh clone can initialize `upstream/` from the GitHub URL at the parent repository's pinned commit.
- The parent tracks only the submodule pointer and metadata, not the upstream source files.
- CI builds the recorded commit and still tags the image with that commit's short SHA.
- Local and CI instructions explain initialization and intentional upstream upgrades.
