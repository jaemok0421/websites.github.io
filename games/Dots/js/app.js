(() => {
  const ROWS = 8;
  const COLS = 8;
  const MIN_CHAIN = 3;
  const START_COLORS = 3;
  const MAX_COLORS = 6;
  const START_TIME = 60;
  const TIME_PER_LEVEL = 12;
  const BASE_TARGET = 25;
  const TARGET_STEP = 12;
  const COLORS = ["#e85d5d", "#3b6cf0", "#e6b325", "#1f9d5a", "#9b5de5", "#f07a3b"];

  const boardEl = document.getElementById("board");
  const linesEl = document.getElementById("lines");
  const wrapEl = document.getElementById("board-wrap");
  const timerEl = document.getElementById("timer");
  const scoreEl = document.getElementById("score");
  const levelEl = document.getElementById("level");
  const colorCountEl = document.getElementById("color-count");
  const quotaLabelEl = document.getElementById("quota-label");
  const quotaBarEl = document.getElementById("quota-bar");
  const toastEl = document.getElementById("toast");
  const startOverlay = document.getElementById("start-overlay");
  const overDialog = document.getElementById("over-dialog");
  const timerStat = timerEl.closest(".stat");

  const state = {
    grid: [],
    nextId: 1,
    colorCount: START_COLORS,
    score: 0,
    level: 1,
    levelScore: 0,
    target: BASE_TARGET,
    timeLeft: START_TIME * 1000,
    running: false,
    busy: false,
    over: false,
    path: [],
    pointer: null,
    lastTs: 0,
    toastTimer: 0,
  };

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const keyOf = (r, c) => `${r},${c}`;
  const inBounds = (r, c) => r >= 0 && r < ROWS && c >= 0 && c < COLS;
  const randomColor = () => Math.floor(Math.random() * state.colorCount);
  const targetForLevel = (level) => BASE_TARGET + (level - 1) * TARGET_STEP;
  const colorsForLevel = (level) => {
    if (level >= 8) return Math.min(6, MAX_COLORS);
    if (level >= 5) return Math.min(5, MAX_COLORS);
    if (level >= 3) return Math.min(4, MAX_COLORS);
    return START_COLORS;
  };

  function formatTime(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  function showToast(text) {
    toastEl.textContent = text;
    toastEl.classList.add("show");
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => toastEl.classList.remove("show"), 1600);
  }

  function adjacent(a, b) {
    const dr = Math.abs(a.r - b.r);
    const dc = Math.abs(a.c - b.c);
    return dr <= 1 && dc <= 1 && dr + dc > 0;
  }

  function componentSize(sr, sc, seen) {
    const color = state.grid[sr][sc].color;
    const stack = [{ r: sr, c: sc }];
    let size = 0;
    seen.add(keyOf(sr, sc));
    while (stack.length) {
      const { r, c } = stack.pop();
      size += 1;
      for (let dr = -1; dr <= 1; dr += 1) {
        for (let dc = -1; dc <= 1; dc += 1) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr;
          const nc = c + dc;
          const k = keyOf(nr, nc);
          if (!inBounds(nr, nc) || seen.has(k)) continue;
          if (state.grid[nr][nc].color !== color) continue;
          seen.add(k);
          stack.push({ r: nr, c: nc });
        }
      }
    }
    return size;
  }

  function hasMatch() {
    const seen = new Set();
    for (let r = 0; r < ROWS; r += 1) {
      for (let c = 0; c < COLS; c += 1) {
        const k = keyOf(r, c);
        if (seen.has(k)) continue;
        if (componentSize(r, c, seen) >= MIN_CHAIN) return true;
      }
    }
    return false;
  }

  function shuffleGrid() {
    const cells = state.grid.flat();
    for (let i = cells.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = cells[i].color;
      cells[i].color = cells[j].color;
      cells[j].color = tmp;
    }
  }

  function fillGrid(fresh) {
    for (let r = 0; r < ROWS; r += 1) {
      state.grid[r] = [];
      for (let c = 0; c < COLS; c += 1) {
        state.grid[r][c] = {
          id: state.nextId,
          color: randomColor(),
          fromR: fresh ? r : r - ROWS,
        };
        state.nextId += 1;
      }
    }
  }

  function ensureMoves() {
    if (hasMatch()) return false;
    let guard = 0;
    while (!hasMatch() && guard < 40) {
      shuffleGrid();
      guard += 1;
    }
    while (!hasMatch()) fillGrid(true);
    return true;
  }

  function cellEl(r, c) {
    return boardEl.querySelector(`[data-r="${r}"][data-c="${c}"]`);
  }

  function renderBoard(animateDrop) {
    boardEl.style.setProperty("--cols", COLS);
    boardEl.innerHTML = "";
    for (let r = 0; r < ROWS; r += 1) {
      for (let c = 0; c < COLS; c += 1) {
        const cell = state.grid[r][c];
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "cell";
        btn.dataset.r = String(r);
        btn.dataset.c = String(c);
        btn.dataset.id = String(cell.id);
        btn.setAttribute("aria-label", `第 ${r + 1} 行第 ${c + 1} 列`);
        const drop = cell.fromR - r;
        const dot = document.createElement("span");
        dot.className = "dot";
        dot.style.setProperty("--c", COLORS[cell.color]);
        if (animateDrop && drop !== 0) {
          btn.classList.add("drop");
          dot.style.setProperty("--drop", String(drop));
        }
        btn.appendChild(dot);
        boardEl.appendChild(btn);
        cell.fromR = r;
      }
    }
    highlightPath();
  }

  function highlightPath() {
    boardEl.querySelectorAll(".cell.selected").forEach((el) => el.classList.remove("selected"));
    state.path.forEach(({ r, c }) => {
      const el = cellEl(r, c);
      if (el) el.classList.add("selected");
    });
    drawLines();
  }

  function ensureLineNodes() {
    let poly = linesEl.querySelector("polyline.path");
    let tip = linesEl.querySelector("line.tip");
    if (!poly) {
      poly = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
      poly.classList.add("path");
      poly.setAttribute("fill", "none");
      poly.setAttribute("stroke-width", "0.14");
      poly.setAttribute("stroke-linecap", "round");
      poly.setAttribute("stroke-linejoin", "round");
      linesEl.appendChild(poly);
    }
    if (!tip) {
      tip = document.createElementNS("http://www.w3.org/2000/svg", "line");
      tip.classList.add("tip");
      tip.setAttribute("stroke-width", "0.14");
      tip.setAttribute("stroke-linecap", "round");
      linesEl.appendChild(tip);
    }
    return { poly, tip };
  }

  function drawLines() {
    const { poly, tip } = ensureLineNodes();

    if (!state.path.length) {
      poly.setAttribute("points", "");
      tip.setAttribute("visibility", "hidden");
      linesEl.querySelectorAll("circle.node").forEach((n) => n.remove());
      return;
    }

    const color = COLORS[state.grid[state.path[0].r][state.path[0].c].color];
    const pathPoints = state.path.map(({ c, r }) => `${c + 0.5},${r + 0.5}`);
    poly.setAttribute("stroke", color);
    poly.setAttribute("points", pathPoints.length >= 2 ? pathPoints.join(" ") : "");

    let nodes = [...linesEl.querySelectorAll("circle.node")];
    while (nodes.length > state.path.length) {
      nodes.pop().remove();
    }
    state.path.forEach(({ r, c }, i) => {
      let circle = nodes[i];
      if (!circle) {
        circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circle.classList.add("node");
        circle.setAttribute("r", "0.16");
        linesEl.appendChild(circle);
        nodes[i] = circle;
      }
      circle.setAttribute("cx", String(c + 0.5));
      circle.setAttribute("cy", String(r + 0.5));
      circle.setAttribute("fill", color);
    });

    const last = state.path[state.path.length - 1];
    if (state.pointer) {
      tip.setAttribute("visibility", "visible");
      tip.setAttribute("stroke", color);
      tip.setAttribute("x1", String(last.c + 0.5));
      tip.setAttribute("y1", String(last.r + 0.5));
      tip.setAttribute("x2", String(state.pointer.x));
      tip.setAttribute("y2", String(state.pointer.y));
    } else {
      tip.setAttribute("visibility", "hidden");
    }
  }

  function updateHud() {
    timerEl.textContent = formatTime(state.timeLeft);
    scoreEl.textContent = String(state.score);
    levelEl.textContent = String(state.level);
    colorCountEl.textContent = String(state.colorCount);
    quotaLabelEl.textContent = `${state.levelScore} / ${state.target}`;
    quotaBarEl.style.width = `${Math.min(100, (state.levelScore / state.target) * 100)}%`;
    document.getElementById("fact-time").textContent = String(TIME_PER_LEVEL);
    document.getElementById("fact-colors").textContent = String(state.colorCount);
    timerStat.classList.toggle("danger", state.running && state.timeLeft <= 10000);
  }

  function advanceLevel() {
    state.level += 1;
    state.timeLeft += TIME_PER_LEVEL * 1000;
    const nextColors = colorsForLevel(state.level);
    const addedColor = nextColors > state.colorCount;
    state.colorCount = nextColors;
    state.target = targetForLevel(state.level);
    if (addedColor) {
      showToast(`第 ${state.level} 关 · 新颜色出现 · +${TIME_PER_LEVEL} 秒`);
    } else {
      showToast(`第 ${state.level} 关 · +${TIME_PER_LEVEL} 秒`);
    }
  }

  function addScore(n) {
    state.score += n;
    state.levelScore += n;
    while (state.levelScore >= state.target) {
      state.levelScore -= state.target;
      advanceLevel();
    }
    updateHud();
  }

  function compact(removed) {
    for (let c = 0; c < COLS; c += 1) {
      const survivors = [];
      for (let r = 0; r < ROWS; r += 1) {
        if (!removed.has(keyOf(r, c))) survivors.push({ ...state.grid[r][c], fromR: r });
      }
      const empty = ROWS - survivors.length;
      for (let r = 0; r < empty; r += 1) {
        state.grid[r][c] = {
          id: state.nextId,
          color: randomColor(),
          fromR: r - empty,
        };
        state.nextId += 1;
      }
      for (let i = 0; i < survivors.length; i += 1) {
        const cell = survivors[i];
        state.grid[empty + i][c] = {
          id: cell.id,
          color: cell.color,
          fromR: cell.fromR,
        };
      }
    }
  }

  async function resolvePath() {
    if (state.busy || !state.path.length) return;
    state.busy = true;
    const path = state.path.slice();
    state.pointer = null;
    if (path.length < MIN_CHAIN) {
      state.path = [];
      highlightPath();
      state.busy = false;
      return;
    }

    const removed = new Set(path.map(({ r, c }) => keyOf(r, c)));
    path.forEach(({ r, c }) => cellEl(r, c)?.classList.add("pop"));
    await wait(180);
    state.path = [];
    linesEl.innerHTML = "";
    compact(removed);
    renderBoard(true);
    addScore(path.length);
    await wait(320);
    if (ensureMoves()) {
      renderBoard(false);
      showToast("没有可消除的组合，已重排");
    }
    state.busy = false;
  }

  function cellFromPoint(x, y) {
    const el = document.elementFromPoint(x, y);
    const cell = el?.closest?.(".cell");
    if (!cell || !boardEl.contains(cell)) return null;
    return { r: Number(cell.dataset.r), c: Number(cell.dataset.c) };
  }

  function svgPoint(clientX, clientY) {
    const rect = wrapEl.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * COLS,
      y: ((clientY - rect.top) / rect.height) * ROWS,
    };
  }

  function beginPath(cell, pointer) {
    if (!state.running || state.busy || state.over) return;
    state.path = [cell];
    state.pointer = pointer || { x: cell.c + 0.5, y: cell.r + 0.5 };
    highlightPath();
  }

  function extendPath(cell) {
    if (!state.path.length) return false;
    const last = state.path[state.path.length - 1];
    if (last.r === cell.r && last.c === cell.c) return false;
    const prev = state.path[state.path.length - 2];
    if (prev && prev.r === cell.r && prev.c === cell.c) {
      state.path.pop();
      highlightPath();
      return true;
    }
    if (state.path.some((p) => p.r === cell.r && p.c === cell.c)) return false;
    if (!adjacent(last, cell)) return false;
    if (state.grid[cell.r][cell.c].color !== state.grid[last.r][last.c].color) return false;
    state.path.push(cell);
    highlightPath();
    return true;
  }

  function onPointerDown(event) {
    if (event.button != null && event.button !== 0) return;
    const cell = cellFromPoint(event.clientX, event.clientY);
    if (!cell) return;
    event.preventDefault();
    wrapEl.setPointerCapture?.(event.pointerId);
    beginPath(cell, svgPoint(event.clientX, event.clientY));
  }

  function onPointerMove(event) {
    if (!state.path.length || state.busy) return;
    state.pointer = svgPoint(event.clientX, event.clientY);
    const cell = cellFromPoint(event.clientX, event.clientY);
    if (cell) extendPath(cell);
    // 无论是否连上新点，都让末端橡皮筋跟随指针
    drawLines();
  }

  async function onPointerUp() {
    if (!state.path.length) return;
    state.pointer = null;
    drawLines();
    await resolvePath();
  }

  function gameOver() {
    if (state.over) return;
    state.over = true;
    state.running = false;
    state.path = [];
    state.pointer = null;
    highlightPath();
    updateHud();
    document.getElementById("over-level").textContent = String(state.level);
    document.getElementById("over-score").textContent = String(state.score);
    if (!overDialog.open) overDialog.showModal();
  }

  function tick(ts) {
    if (state.running) {
      if (state.lastTs) {
        state.timeLeft -= ts - state.lastTs;
        if (state.timeLeft <= 0) {
          state.timeLeft = 0;
          updateHud();
          gameOver();
        } else {
          updateHud();
        }
      }
      state.lastTs = ts;
    } else {
      state.lastTs = 0;
    }
    requestAnimationFrame(tick);
  }

  function startGame() {
    overDialog.close();
    startOverlay.classList.remove("show");
    state.nextId = 1;
    state.colorCount = START_COLORS;
    state.score = 0;
    state.level = 1;
    state.levelScore = 0;
    state.target = targetForLevel(1);
    state.timeLeft = START_TIME * 1000;
    state.running = true;
    state.busy = false;
    state.over = false;
    state.path = [];
    state.pointer = null;
    state.lastTs = 0;
    fillGrid(true);
    ensureMoves();
    renderBoard(true);
    updateHud();
  }

  wrapEl.addEventListener("pointerdown", onPointerDown);
  wrapEl.addEventListener("pointermove", onPointerMove);
  wrapEl.addEventListener("pointerup", onPointerUp);
  wrapEl.addEventListener("pointercancel", onPointerUp);
  wrapEl.addEventListener("contextmenu", (event) => event.preventDefault());

  document.getElementById("btn-start").addEventListener("click", startGame);
  document.getElementById("btn-new").addEventListener("click", startGame);
  document.getElementById("btn-retry").addEventListener("click", startGame);

  linesEl.setAttribute("viewBox", `0 0 ${COLS} ${ROWS}`);
  document.documentElement.style.setProperty("--cols", String(COLS));
  document.documentElement.style.setProperty("--rows", String(ROWS));
  fillGrid(true);
  renderBoard(false);
  updateHud();
  requestAnimationFrame(tick);
})();
