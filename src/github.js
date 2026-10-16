/**
 * GitHub issue fetching + column assignment.
 *
 * Every side effect (the network) goes through an injected `fetchImpl`, so the
 * logic here is testable without hitting GitHub.
 */

export const TODO_LABEL = 'status:todo';
export const IN_PROGRESS_LABEL = 'status:in-progress';

export const COLUMNS = [
  { id: 'todo', title: 'To Do', label: TODO_LABEL },
  { id: 'inProgress', title: 'In Progress', label: IN_PROGRESS_LABEL },
];

/** Normalise a raw GitHub issue into the shape the board renders. */
export function normalizeIssue(raw) {
  return {
    number: Number(raw.number),
    title: String(raw.title ?? ''),
    url: raw.html_url ?? raw.url ?? '',
    labels: (raw.labels ?? [])
      .map((label) => (typeof label === 'string' ? label : label?.name))
      .filter((name) => typeof name === 'string' && name.length > 0),
  };
}

function hasLabel(issue, label) {
  const wanted = label.toLowerCase();
  return issue.labels.some((name) => String(name).toLowerCase() === wanted);
}

/** Ascending by issue number, so the board is stable between refreshes. */
export function byIssueNumber(a, b) {
  return a.number - b.number;
}

/**
 * Split issues into the two board columns.
 * An issue carrying both labels appears in both columns: the labels are the
 * single source of truth, so the board never hides an issue that claims a
 * status.
 */
export function splitIntoColumns(issues) {
  const normalized = issues.map(normalizeIssue).sort(byIssueNumber);
  return {
    todo: normalized.filter((issue) => hasLabel(issue, TODO_LABEL)),
    inProgress: normalized.filter((issue) => hasLabel(issue, IN_PROGRESS_LABEL)),
  };
}

async function safeText(response) {
  try {
    return (await response.text()).slice(0, 300);
  } catch {
    return '';
  }
}

/**
 * Fetch every OPEN issue of `repo`. Pull requests are filtered out, since
 * GitHub's issues endpoint includes them.
 */
export async function fetchOpenIssues({ repo, token, fetchImpl = fetch, perPage = 100 }) {
  if (!repo) throw new Error('GITHUB_REPO is not set');

  const url = new URL(`https://api.github.com/repos/${repo}/issues`);
  url.searchParams.set('state', 'open');
  url.searchParams.set('per_page', String(perPage));

  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'issue-kanban',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetchImpl(url, { headers });
  if (!response.ok) {
    const detail = await safeText(response);
    throw new Error(`GitHub API ${response.status} for ${repo}${detail ? `: ${detail}` : ''}`);
  }

  const body = await response.json();
  if (!Array.isArray(body)) throw new Error(`Unexpected GitHub response for ${repo}`);

  return body.filter((issue) => !issue.pull_request).map(normalizeIssue);
}

/** Fetch + split in one step: the board payload. */
export async function loadBoard({ repo, token, fetchImpl = fetch }) {
  const issues = await fetchOpenIssues({ repo, token, fetchImpl });
  return { repo, ...splitIntoColumns(issues) };
}
