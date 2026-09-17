(() => {
  const SIZE = 15;
  const EMPTY = 0;
  const BLACK = 1;
  const WHITE = 2;
  const DIRECTIONS = [[1, 0], [0, 1], [1, 1], [1, -1]];
  const HINTS = {
    easy: "平时随机落子，但会阻挡明显的三子、四子连线。",
    medium: "会主动进攻，也会阻挡明显威胁。",
    hard: "会判断活棋、冲四与多重威胁，攻防更积极。",
  };

  const canvas = document.getElementById("board");
  const ctx = canvas.getContext("2d");
  const turnStone = document.getElementById("turn-stone");
  const turnLabel = document.getElementById("turn-label");
  const boardTip = document.getElementById("board-tip");
  const thinkingEl = document.getElementById("thinking");
  const difficultySection = document.getElementById("difficulty-section");
  const sideSection = document.getElementById("side-section");
  const difficultyHint = document.getElementById("difficulty-hint");
  const resultDialog = document.getElementById("result-dialog");
  const undoButton = document.getElementById("btn-undo");

  const state = {
    board: Array.from({ length: SIZE }, () => Array(SIZE).fill(EMPTY)),
    moves: [],
    current: BLACK,
    mode: "ai",
    difficulty: "medium",
    humanColor: BLACK,
    over: false,
    thinking: false,
    hover: null,
    winningLine: null,
    gameToken: 0,
    wins: { black: 0, white: 0 },
  };

  const computerColor = () => state.humanColor === BLACK ? WHITE : BLACK;

  function setupCanvas() {
    const size = canvas.clientWidth;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(size * ratio);
    canvas.height = Math.round(size * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    draw();
  }

  function metrics() {
    const size = canvas.clientWidth;
    const padding = size * 0.055;
    return { size, padding, gap: (size - padding * 2) / (SIZE - 1) };
  }

  function draw() {
    const { size, padding, gap } = metrics();
    ctx.clearRect(0, 0, size, size);

    ctx.strokeStyle = "rgba(83, 51, 21, .72)";
    ctx.lineWidth = Math.max(1, size / 650);
    ctx.beginPath();
    for (let i = 0; i < SIZE; i += 1) {
      const p = padding + i * gap;
      ctx.moveTo(padding, p);
      ctx.lineTo(size - padding, p);
      ctx.moveTo(p, padding);
      ctx.lineTo(p, size - padding);
    }
    ctx.stroke();

    [[3, 3], [3, 11], [7, 7], [11, 3], [11, 11]].forEach(([r, c]) => {
      ctx.beginPath();
      ctx.arc(padding + c * gap, padding + r * gap, Math.max(2, gap * 0.09), 0, Math.PI * 2);
      ctx.fillStyle = "#60401f";
      ctx.fill();
    });

    for (let r = 0; r < SIZE; r += 1) {
      for (let c = 0; c < SIZE; c += 1) {
        if (state.board[r][c] !== EMPTY) drawStone(r, c, state.board[r][c], 1);
      }
    }

    if (state.hover && !state.over && !state.thinking && state.board[state.hover.r][state.hover.c] === EMPTY) {
      drawStone(state.hover.r, state.hover.c, state.current, 0.35);
    }

    const last = state.moves[state.moves.length - 1];
    if (last) {
      ctx.beginPath();
      ctx.arc(padding + last.c * gap, padding + last.r * gap, Math.max(2, gap * 0.1), 0, Math.PI * 2);
      ctx.fillStyle = last.player === BLACK ? "#f2f4f8" : "#e24a4a";
      ctx.fill();
    }

    if (state.winningLine) {
      const [start, end] = state.winningLine;
      ctx.beginPath();
      ctx.moveTo(padding + start.c * gap, padding + start.r * gap);
      ctx.lineTo(padding + end.c * gap, padding + end.r * gap);
      ctx.strokeStyle = "#e64848";
      ctx.lineWidth = Math.max(3, gap * 0.12);
      ctx.lineCap = "round";
      ctx.stroke();
    }
  }

  function drawStone(r, c, player, alpha) {
    const { padding, gap } = metrics();
    const x = padding + c * gap;
    const y = padding + r * gap;
    const radius = gap * 0.43;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowColor = "rgba(35, 25, 16, .32)";
    ctx.shadowBlur = gap * 0.16;
    ctx.shadowOffsetY = gap * 0.1;
    const gradient = ctx.createRadialGradient(
      x - radius * 0.34, y - radius * 0.4, radius * 0.08,
      x, y, radius
    );
    if (player === BLACK) {
      gradient.addColorStop(0, "#606874");
      gradient.addColorStop(0.48, "#242a34");
      gradient.addColorStop(1, "#090c11");
    } else {
      gradient.addColorStop(0, "#ffffff");
      gradient.addColorStop(0.62, "#f4f5f7");
      gradient.addColorStop(1, "#cfd4dc");
    }
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function pointFromEvent(event) {
    const rect = canvas.getBoundingClientRect();
    const { padding, gap } = metrics();
    const c = Math.round((event.clientX - rect.left - padding) / gap);
    const r = Math.round((event.clientY - rect.top - padding) / gap);
    if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) return null;
    const x = padding + c * gap;
    const y = padding + r * gap;
    if (Math.hypot(event.clientX - rect.left - x, event.clientY - rect.top - y) > gap * 0.48) return null;
    return { r, c };
  }

  function inBounds(r, c) {
    return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
  }

  function lineThrough(r, c, player) {
    for (const [dr, dc] of DIRECTIONS) {
      const cells = [{ r, c }];
      let nr = r - dr;
      let nc = c - dc;
      while (inBounds(nr, nc) && state.board[nr][nc] === player) {
        cells.unshift({ r: nr, c: nc });
        nr -= dr;
        nc -= dc;
      }
      nr = r + dr;
      nc = c + dc;
      while (inBounds(nr, nc) && state.board[nr][nc] === player) {
        cells.push({ r: nr, c: nc });
        nr += dr;
        nc += dc;
      }
      if (cells.length >= 5) return [cells[0], cells[cells.length - 1]];
    }
    return null;
  }

  function updateHud() {
    const isBlack = state.current === BLACK;
    turnStone.className = `stone ${isBlack ? "black" : "white"}`;
    let name = isBlack ? "黑方" : "白方";
    if (state.mode === "ai") {
      const owner = state.current === state.humanColor ? "玩家" : "电脑";
      name = `${owner}（${isBlack ? "黑" : "白"}）`;
    }
    turnLabel.textContent = state.over ? "本局结束" : name;
    thinkingEl.classList.toggle("show", state.thinking);
    document.getElementById("black-name").textContent = state.mode === "ai"
      ? (state.humanColor === BLACK ? "玩家" : "电脑")
      : "黑方";
    document.getElementById("white-name").textContent = state.mode === "ai"
      ? (state.humanColor === WHITE ? "玩家" : "电脑")
      : "白方";
    document.getElementById("black-wins").textContent = String(state.wins.black);
    document.getElementById("white-wins").textContent = String(state.wins.white);
    document.getElementById("move-count").textContent = String(state.moves.length);
    const hasHumanMove = state.moves.some((move) => move.player === state.humanColor);
    undoButton.disabled = state.moves.length === 0 || state.over || (state.mode === "ai" && !hasHumanMove);
    boardTip.textContent = state.thinking
      ? "电脑正在选择落点…"
      : (state.over ? "本局已结束，可查看获胜连线或重新开局" : "黑方先行，率先连成五子者获胜");
  }

  function place(r, c, player) {
    if (state.board[r][c] !== EMPTY || state.over) return false;
    state.board[r][c] = player;
    state.moves.push({ r, c, player });
    state.winningLine = lineThrough(r, c, player);

    if (state.winningLine) {
      state.over = true;
      if (player === BLACK) state.wins.black += 1;
      else state.wins.white += 1;
      finishGame(player);
    } else if (state.moves.length === SIZE * SIZE) {
      state.over = true;
      finishGame(EMPTY);
    } else {
      state.current = player === BLACK ? WHITE : BLACK;
    }
    draw();
    updateHud();
    return true;
  }

  function finishGame(player) {
    const resultStone = document.getElementById("result-stone");
    const title = document.getElementById("result-title");
    const text = document.getElementById("result-text");
    if (player === EMPTY) {
      resultStone.hidden = true;
      title.textContent = "和棋";
      text.textContent = "棋盘已满，双方未分胜负。";
    } else {
      resultStone.hidden = false;
      resultStone.className = `result-stone stone ${player === BLACK ? "black" : "white"}`;
      const who = state.mode === "ai"
        ? (player === state.humanColor ? "玩家" : "电脑")
        : (player === BLACK ? "黑方" : "白方");
      title.textContent = `${who}获胜`;
      text.textContent = player === BLACK ? "黑方率先连成五子！" : "白方率先连成五子！";
    }
    setTimeout(() => {
      if (!resultDialog.open) resultDialog.showModal();
    }, 320);
  }

  function candidateCells(radius = 2) {
    if (!state.moves.length) return [{ r: 7, c: 7 }];
    const cells = [];
    for (let r = 0; r < SIZE; r += 1) {
      for (let c = 0; c < SIZE; c += 1) {
        if (state.board[r][c] !== EMPTY) continue;
        let near = false;
        for (let dr = -radius; dr <= radius && !near; dr += 1) {
          for (let dc = -radius; dc <= radius; dc += 1) {
            if (inBounds(r + dr, c + dc) && state.board[r + dr][c + dc] !== EMPTY) {
              near = true;
              break;
            }
          }
        }
        if (near) cells.push({ r, c });
      }
    }
    return cells;
  }

  function patternScore(r, c, player) {
    let total = 0;
    for (const [dr, dc] of DIRECTIONS) {
      let countA = 0;
      let countB = 0;
      let rr = r + dr;
      let cc = c + dc;
      while (inBounds(rr, cc) && state.board[rr][cc] === player) {
        countA += 1; rr += dr; cc += dc;
      }
      const openA = inBounds(rr, cc) && state.board[rr][cc] === EMPTY;
      rr = r - dr;
      cc = c - dc;
      while (inBounds(rr, cc) && state.board[rr][cc] === player) {
        countB += 1; rr -= dr; cc -= dc;
      }
      const openB = inBounds(rr, cc) && state.board[rr][cc] === EMPTY;
      const count = countA + countB + 1;
      const open = Number(openA) + Number(openB);
      if (count >= 5) total += 1000000;
      else if (count === 4 && open === 2) total += 90000;
      else if (count === 4 && open === 1) total += 15000;
      else if (count === 3 && open === 2) total += 7000;
      else if (count === 3 && open === 1) total += 900;
      else if (count === 2 && open === 2) total += 400;
      else if (count === 2 && open === 1) total += 80;
      else total += open * 8;
    }
    const center = 14 - (Math.abs(7 - r) + Math.abs(7 - c));
    return total + center * 2;
  }

  function isWinningMove(cell, player) {
    state.board[cell.r][cell.c] = player;
    const wins = Boolean(lineThrough(cell.r, cell.c, player));
    state.board[cell.r][cell.c] = EMPTY;
    return wins;
  }

  function bestComputerMove() {
    const computer = computerColor();
    const human = state.humanColor;
    const candidates = candidateCells(state.difficulty === "hard" ? 2 : 1);
    for (const cell of candidates) if (isWinningMove(cell, computer)) return cell;
    for (const cell of candidates) if (isWinningMove(cell, human)) return cell;

    if (state.difficulty === "easy") {
      let threatScore = -Infinity;
      let threatCells = [];
      for (const cell of candidates) {
        const score = patternScore(cell.r, cell.c, human);
        if (score > threatScore) {
          threatScore = score;
          threatCells = [cell];
        } else if (score === threatScore) {
          threatCells.push(cell);
        }
      }
      if (threatScore >= 12000) {
        return threatCells[Math.floor(Math.random() * threatCells.length)];
      }
      return candidates[Math.floor(Math.random() * candidates.length)];
    }

    let best = [];
    let bestScore = -Infinity;
    for (const cell of candidates) {
      const attack = patternScore(cell.r, cell.c, computer);
      const defense = patternScore(cell.r, cell.c, human);
      let score = attack + defense * (state.difficulty === "hard" ? 1.08 : 0.82);
      if (state.difficulty === "hard") {
        state.board[cell.r][cell.c] = computer;
        const followUps = candidateCells(1)
          .map((next) => patternScore(next.r, next.c, computer))
          .sort((a, b) => b - a);
        state.board[cell.r][cell.c] = EMPTY;
        score += (followUps[0] || 0) * 0.12;
        score += (followUps[1] || 0) * 0.05;
      }
      score += Math.random() * 5;
      if (score > bestScore) {
        bestScore = score;
        best = [cell];
      } else if (Math.abs(score - bestScore) < 1) {
        best.push(cell);
      }
    }
    return best[Math.floor(Math.random() * best.length)] || { r: 7, c: 7 };
  }

  function requestComputerMove() {
    const computer = computerColor();
    if (state.mode !== "ai" || state.current !== computer || state.over) return;
    state.thinking = true;
    const token = state.gameToken;
    updateHud();
    setTimeout(() => {
      if (token !== state.gameToken || state.over || state.mode !== "ai") return;
      const move = bestComputerMove();
      state.thinking = false;
      place(move.r, move.c, computer);
    }, state.difficulty === "hard" ? 520 : 360);
  }

  function newGame() {
    state.gameToken += 1;
    state.board = Array.from({ length: SIZE }, () => Array(SIZE).fill(EMPTY));
    state.moves = [];
    state.current = BLACK;
    state.over = false;
    state.thinking = false;
    state.hover = null;
    state.winningLine = null;
    if (resultDialog.open) resultDialog.close();
    draw();
    updateHud();
    requestComputerMove();
  }

  function undo() {
    if (!state.moves.length || state.over) return;
    state.gameToken += 1;
    const removeCount = state.mode === "ai" && !state.thinking && state.moves.length >= 2 ? 2 : 1;
    for (let i = 0; i < removeCount; i += 1) {
      const move = state.moves.pop();
      if (move) state.board[move.r][move.c] = EMPTY;
    }
    state.thinking = false;
    state.current = state.moves.length ? (state.moves[state.moves.length - 1].player === BLACK ? WHITE : BLACK) : BLACK;
    state.winningLine = null;
    draw();
    updateHud();
  }

  canvas.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch") return;
    state.hover = pointFromEvent(event);
    draw();
  });
  canvas.addEventListener("pointerleave", () => {
    state.hover = null;
    draw();
  });
  canvas.addEventListener("click", (event) => {
    if (state.over || state.thinking || (state.mode === "ai" && state.current !== state.humanColor)) return;
    const point = pointFromEvent(event);
    if (!point || !place(point.r, point.c, state.current)) return;
    requestComputerMove();
  });

  document.getElementById("mode-select").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-mode]");
    if (!button || button.dataset.mode === state.mode) return;
    state.mode = button.dataset.mode;
    document.querySelectorAll("#mode-select button").forEach((el) => el.classList.toggle("active", el === button));
    difficultySection.hidden = state.mode === "local";
    sideSection.hidden = state.mode === "local";
    newGame();
  });

  document.getElementById("difficulty-select").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-level]");
    if (!button || button.dataset.level === state.difficulty) return;
    state.difficulty = button.dataset.level;
    document.querySelectorAll("#difficulty-select button").forEach((el) => el.classList.toggle("active", el === button));
    difficultyHint.textContent = HINTS[state.difficulty];
    newGame();
  });

  document.getElementById("side-select").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-side]");
    if (!button) return;
    const color = button.dataset.side === "black" ? BLACK : WHITE;
    if (color === state.humanColor) return;
    state.humanColor = color;
    document.querySelectorAll("#side-select button").forEach((el) => el.classList.toggle("active", el === button));
    newGame();
  });

  document.getElementById("btn-new").addEventListener("click", newGame);
  document.getElementById("btn-again").addEventListener("click", newGame);
  document.getElementById("btn-close").addEventListener("click", () => resultDialog.close());
  undoButton.addEventListener("click", undo);
  window.addEventListener("resize", setupCanvas);

  setupCanvas();
  updateHud();
})();
