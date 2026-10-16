import assert from 'node:assert/strict';
import test from 'node:test';

import {
  fetchOpenIssues,
  loadBoard,
  normalizeIssue,
  splitIntoColumns,
} from '../src/github.js';

const rawIssue = (number, title, labels, extra = {}) => ({
  number,
  title,
  labels: labels.map((name) => ({ name })),
  html_url: `https://github.com/acme/widgets/issues/${number}`,
  ...extra,
});

/** A fetch double that records calls and replays one canned response. */
function fakeFetch({ status = 200, body = [], text } = {}) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    return {
      ok: status >= 200 && status < 300,
      status,
      async json() {
        return body;
      },
      async text() {
        return text ?? JSON.stringify(body);
      },
    };
  };
  impl.calls = calls;
  return impl;
}

test('normalizeIssue keeps number, title, url and label names', () => {
  const issue = normalizeIssue(rawIssue(7, 'Fix the thing', ['bug', 'status:todo']));
  assert.deepEqual(issue, {
    number: 7,
    title: 'Fix the thing',
    url: 'https://github.com/acme/widgets/issues/7',
    labels: ['bug', 'status:todo'],
  });
});

test('splitIntoColumns puts each issue in the column its label names', () => {
  const { todo, inProgress } = splitIntoColumns([
    rawIssue(3, 'docs', ['documentation', 'status:todo']),
    rawIssue(5, 'keyboard nav', ['accessibility', 'status:in-progress']),
    rawIssue(1, 'dark mode', ['enhancement', 'status:todo']),
  ]);

  assert.deepEqual(todo.map((i) => i.number), [1, 3]);
  assert.deepEqual(inProgress.map((i) => i.number), [5]);
});

test('splitIntoColumns sorts every column by issue number', () => {
  const { todo } = splitIntoColumns([
    rawIssue(42, 'later', ['status:todo']),
    rawIssue(7, 'earlier', ['status:todo']),
    rawIssue(19, 'middle', ['status:todo']),
  ]);
  assert.deepEqual(todo.map((i) => i.title), ['earlier', 'middle', 'later']);
});

test('splitIntoColumns ignores issues with no status label', () => {
  const { todo, inProgress } = splitIntoColumns([
    rawIssue(1, 'unlabelled', ['bug']),
    rawIssue(2, 'other', []),
  ]);
  assert.equal(todo.length, 0);
  assert.equal(inProgress.length, 0);
});

test('label matching is case-insensitive and exact', () => {
  const { todo } = splitIntoColumns([
    rawIssue(1, 'shouty label', ['Status:ToDo']),
    rawIssue(2, 'near miss', ['status:todoish']),
    rawIssue(3, 'prefixed', ['wip:status:todo']),
  ]);
  assert.deepEqual(todo.map((i) => i.number), [1]);
});

test('an issue carrying both labels shows up in both columns', () => {
  const { todo, inProgress } = splitIntoColumns([
    rawIssue(9, 'moved', ['status:todo', 'status:in-progress']),
  ]);
  assert.deepEqual(todo.map((i) => i.number), [9]);
  assert.deepEqual(inProgress.map((i) => i.number), [9]);
});

test('splitIntoColumns accepts plain string labels', () => {
  const { inProgress } = splitIntoColumns([
    { number: 4, title: 'string labels', labels: ['status:in-progress'], html_url: 'u' },
  ]);
  assert.deepEqual(inProgress.map((i) => i.number), [4]);
});

test('fetchOpenIssues asks for open issues and sends the token', async () => {
  const fetchImpl = fakeFetch({ body: [rawIssue(1, 'a', ['status:todo'])] });
  await fetchOpenIssues({ repo: 'acme/widgets', token: 'secret-token', fetchImpl });

  const { url, init } = fetchImpl.calls[0];
  assert.equal(url.pathname, '/repos/acme/widgets/issues');
  assert.equal(url.searchParams.get('state'), 'open');
  assert.equal(url.searchParams.get('per_page'), '100');
  assert.equal(init.headers.Authorization, 'Bearer secret-token');
  assert.equal(init.headers.Accept, 'application/vnd.github+json');
});

test('fetchOpenIssues omits the Authorization header when no token is set', async () => {
  const fetchImpl = fakeFetch({ body: [] });
  await fetchOpenIssues({ repo: 'acme/widgets', token: '', fetchImpl });
  assert.equal('Authorization' in fetchImpl.calls[0].init.headers, false);
});

test('fetchOpenIssues drops pull requests, which the issues endpoint returns', async () => {
  const fetchImpl = fakeFetch({
    body: [
      rawIssue(1, 'real issue', ['status:todo']),
      rawIssue(2, 'a pr', ['status:todo'], { pull_request: { url: 'x' } }),
    ],
  });
  const issues = await fetchOpenIssues({ repo: 'acme/widgets', token: 't', fetchImpl });
  assert.deepEqual(issues.map((i) => i.number), [1]);
});

test('fetchOpenIssues fails loudly on a GitHub error status', async () => {
  const fetchImpl = fakeFetch({ status: 404, text: '{"message":"Not Found"}' });
  await assert.rejects(
    () => fetchOpenIssues({ repo: 'acme/missing', token: 't', fetchImpl }),
    /GitHub API 404 for acme\/missing/,
  );
});

test('fetchOpenIssues requires a repo', async () => {
  await assert.rejects(() => fetchOpenIssues({ repo: '', token: 't' }), /GITHUB_REPO is not set/);
});

test('fetchOpenIssues rejects a non-array payload', async () => {
  const fetchImpl = fakeFetch({ body: { message: 'nope' } });
  await assert.rejects(
    () => fetchOpenIssues({ repo: 'acme/widgets', token: 't', fetchImpl }),
    /Unexpected GitHub response/,
  );
});

test('loadBoard returns the repo and its two sorted columns', async () => {
  const fetchImpl = fakeFetch({
    body: [
      rawIssue(5, 'Improve keyboard navigation', ['accessibility', 'status:in-progress']),
      rawIssue(3, 'Write onboarding docs', ['documentation', 'status:todo']),
      rawIssue(1, 'Add dark mode toggle', ['enhancement', 'status:todo']),
    ],
  });
  const board = await loadBoard({ repo: 'acme/widgets', token: 't', fetchImpl });
  assert.equal(board.repo, 'acme/widgets');
  assert.deepEqual(board.todo.map((i) => i.number), [1, 3]);
  assert.deepEqual(board.inProgress.map((i) => i.number), [5]);
});
