# Issue Kanban

A small two-column kanban board for the open issues of a single GitHub repository.

- Every **open** issue labelled `status:todo` lands in **To Do**.
- Every **open** issue labelled `status:in-progress` lands in **In Progress**.
- Each card shows the issue title and its number (and links to the issue).

Stack: Node.js 20+ with the built-in `node:http` server, and plain HTML/CSS/JS on the
front end. **Zero runtime dependencies** - nothing to compile, no `node_modules` needed.

## Requirements

- Node.js >= 20 (uses the global `fetch`, `node --test` and `node --watch`)
- A GitHub token in `GITHUB_TOKEN` (needed for private repos and to avoid the 60 req/h
  unauthenticated rate limit)
- The repository to show in `GITHUB_REPO`, as `owner/name`

## Run it locally

```bash
export GITHUB_REPO="owner/name"
export GITHUB_TOKEN="ghp_your_token"

npm run dev     # http://localhost:3000  (restarts on file changes)
# or
npm start       # same, without the watcher
```

Then open <http://localhost:3000>.

`npm install` is not required (there are no dependencies); running it is harmless.

### Configuration

| Variable         | Default | Meaning                                                       |
| ---------------- | ------- | ------------------------------------------------------------- |
| `GITHUB_REPO`    | -       | `owner/name` of the repository to render (required)           |
| `GITHUB_TOKEN`   | -       | GitHub token used to authenticate the API calls               |
| `PORT`           | `3000`  | HTTP port                                                     |
| `BOARD_CACHE_MS` | `60000` | How long a board payload is cached before GitHub is hit again |

## Tests

```bash
npm test        # node --test test/
```

The suite covers the fetching and sorting logic: which endpoint and headers are used,
that pull requests are dropped, that label matching is case-insensitive and exact, and
that issues land in the right column, sorted by number. GitHub itself is faked, so the
tests need no network and no token.

## Layout

```
src/github.js    fetch + normalise + split issues into columns (pure, injectable fetch)
src/server.js    tiny http server: static files, /api/board, /health
public/          index.html, styles.css, app.js - the board UI
test/            node:test suite for src/github.js
```

## HTTP surface

- `GET /` - the board page
- `GET /api/board` - `{ repo, fetchedAt, cached, todo: [...], inProgress: [...] }`
- `GET /api/board?refresh=1` - same, bypassing the cache
- `GET /health` - `{ ok: true, repo }`
