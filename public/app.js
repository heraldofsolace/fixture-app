const COLUMNS = [
  { id: 'todo', key: 'todo' },
  { id: 'inProgress', key: 'inProgress' },
];

const els = {
  board: document.getElementById('board'),
  repo: document.getElementById('repo'),
  stamp: document.getElementById('stamp'),
  status: document.getElementById('status'),
  refresh: document.getElementById('refresh'),
};

function cardEl(issue) {
  const li = document.createElement('li');
  li.className = 'card';
  li.dataset.issue = String(issue.number);

  const title = document.createElement('a');
  title.className = 'card-title';
  title.href = issue.url || '#';
  title.target = '_blank';
  title.rel = 'noreferrer';
  title.textContent = issue.title;

  const number = document.createElement('div');
  number.className = 'card-number';
  number.textContent = `#${issue.number}`;

  li.append(title, number);
  return li;
}

function renderColumn(id, issues) {
  const section = document.getElementById(`column-${id}`);
  const list = section.querySelector('[data-role="cards"]');
  section.querySelector('[data-role="count"]').textContent = String(issues.length);

  list.replaceChildren();
  if (issues.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'empty';
    empty.textContent = 'Nothing here.';
    list.append(empty);
    return;
  }
  for (const issue of issues) list.append(cardEl(issue));
}

function renderBoard(board) {
  els.repo.textContent = board.repo ? `Repository: ${board.repo}` : 'Repository not configured';
  els.stamp.textContent = board.fetchedAt ? `updated ${new Date(board.fetchedAt).toLocaleTimeString()}` : '';
  for (const column of COLUMNS) renderColumn(column.id, board[column.key] ?? []);
}

async function loadBoard({ refresh = false } = {}) {
  els.refresh.disabled = true;
  els.board.setAttribute('aria-busy', 'true');
  els.status.textContent = refresh ? 'Refreshing from GitHub...' : 'Loading issues from GitHub...';
  try {
    const response = await fetch(`/api/board${refresh ? '?refresh=1' : ''}`);
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? `request failed (${response.status})`);
    renderBoard(body);
    els.status.textContent = '';
  } catch (error) {
    els.status.textContent = `Could not load the board: ${error.message}`;
  } finally {
    els.refresh.disabled = false;
    els.board.setAttribute('aria-busy', 'false');
  }
}

els.refresh.addEventListener('click', () => loadBoard({ refresh: true }));
loadBoard();
