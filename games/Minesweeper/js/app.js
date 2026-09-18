(() => {
  const LEVELS = {
    beginner: { rows: 9, cols: 9, mines: 10 },
    intermediate: { rows: 16, cols: 16, mines: 40 },
    expert: { rows: 16, cols: 30, mines: 99 },
  };

  const boardEl = document.getElementById("board");
  const mineCountEl = document.getElementById("mine-count");
  const timerEl = document.getElementById("timer");
  const statusEl = document.getElementById("status-text");
  const bestTimeEl = document.getElementById("best-time");
  const resetBtn = document.getElementById("reset-btn");
  const faceEl = resetBtn.querySelector("span");
  const overlayEl = document.getElementById("result-overlay");

  const state = {
    level: "beginner",
    cells: [],
    phase: "ready",
    flags: 0,
    revealed: 0,
    elapsed: 0,
    timerId: null,
    longPressId: null,
    pressStart: null,
    suppressClickUntil: 0,
  };

  const config = () => LEVELS[state.level];
  const key = (row, col) => row * config().cols + col;
  const inBounds = (row, col) =>
    row >= 0 && row < config().rows && col >= 0 && col < config().cols;

  function neighbors(index) {
    const { row, col } = state.cells[index];
    const result = [];
    for (let dr = -1; dr <= 1; dr += 1) {
      for (let dc = -1; dc <= 1; dc += 1) {
        if (dr === 0 && dc === 0) continue;
        if (inBounds(row + dr, col + dc)) result.push(key(row + dr, col + dc));
      }
    }
    return result;
  }

  function formatCounter(value) {
    return String(Math.max(0, Math.min(999, value))).padStart(3, "0");
  }

  function bestStorageKey() {
    return `minesweeper-best-${state.level}`;
  }

  function getBest() {
    try {
      return Number(localStorage.getItem(bestStorageKey())) || 0;
    } catch {
      return 0;
    }
  }

  function saveBest(seconds) {
    const previous = getBest();
    if (previous && previous <= seconds) return false;
    try {
      localStorage.setItem(bestStorageKey(), String(seconds));
    } catch {
      // 隐私模式下存储可能不可用，游戏仍可正常进行。
    }
    return true;
  }

  function updateBest() {
    const best = getBest();
    bestTimeEl.textContent = best ? `${best} 秒` : "—";
  }

  function updateHud() {
    mineCountEl.textContent = formatCounter(config().mines - state.flags);
    timerEl.textContent = formatCounter(state.elapsed);
  }

  function stopTimer() {
    window.clearInterval(state.timerId);
    state.timerId = null;
  }

  function startTimer() {
    if (state.timerId) return;
    state.timerId = window.setInterval(() => {
      state.elapsed = Math.min(999, state.elapsed + 1);
      timerEl.textContent = formatCounter(state.elapsed);
      if (state.elapsed === 999) stopTimer();
    }, 1000);
  }

  function buildEmptyCells() {
    state.cells = [];
    for (let row = 0; row < config().rows; row += 1) {
      for (let col = 0; col < config().cols; col += 1) {
        state.cells.push({
          row,
          col,
          mine: false,
          number: 0,
          revealed: false,
          flagged: false,
          exploded: false,
          wrongFlag: false,
        });
      }
    }
  }

  function cellLabel(cell) {
    if (cell.flagged) return `第 ${cell.row + 1} 行第 ${cell.col + 1} 列，已标记`;
    if (!cell.revealed) return `第 ${cell.row + 1} 行第 ${cell.col + 1} 列，未翻开`;
    if (cell.mine) return "地雷";
    if (cell.number) return `数字 ${cell.number}`;
    return "空白";
  }

  function renderBoard() {
    boardEl.style.setProperty("--cols", String(config().cols));
    boardEl.setAttribute("aria-rowcount", String(config().rows));
    boardEl.setAttribute("aria-colcount", String(config().cols));
    boardEl.innerHTML = "";

    state.cells.forEach((cell, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "cell";
      button.dataset.index = String(index);
      button.setAttribute("role", "gridcell");
      button.setAttribute("aria-rowindex", String(cell.row + 1));
      button.setAttribute("aria-colindex", String(cell.col + 1));
      boardEl.appendChild(button);
      paintCell(index);
    });
  }

  function paintCell(index) {
    const cell = state.cells[index];
    const button = boardEl.children[index];
    if (!button) return;

    button.className = "cell";
    button.replaceChildren();
    button.removeAttribute("data-number");

    if (cell.revealed) {
      button.classList.add("revealed");
      if (cell.mine) {
        button.classList.add("mine");
        button.textContent = "✹";
      } else if (cell.number > 0) {
        button.dataset.number = String(cell.number);
        button.textContent = String(cell.number);
      }
    } else if (cell.flagged) {
      const flag = document.createElement("span");
      flag.className = "flag-shape";
      flag.setAttribute("aria-hidden", "true");
      button.appendChild(flag);
    }

    if (cell.exploded) button.classList.add("exploded");
    if (cell.wrongFlag) button.classList.add("wrong-flag");
    button.setAttribute("aria-label", cellLabel(cell));
    button.setAttribute("aria-pressed", String(cell.flagged));
  }

  function placeMines(firstIndex) {
    const excluded = new Set([firstIndex, ...neighbors(firstIndex)]);
    let candidates = state.cells
      .map((_, index) => index)
      .filter((index) => !excluded.has(index));

    for (let i = candidates.length - 1; i > 0; i -= 1) {
      const random = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[random]] = [candidates[random], candidates[i]];
    }

    candidates.slice(0, config().mines).forEach((index) => {
      state.cells[index].mine = true;
    });

    state.cells.forEach((cell, index) => {
      if (!cell.mine) {
        cell.number = neighbors(index).filter((nearby) => state.cells[nearby].mine).length;
      }
    });
  }

  function beginGame(firstIndex) {
    placeMines(firstIndex);
    state.phase = "running";
    statusEl.textContent = "排雷进行中";
    startTimer();
  }

  function revealArea(startIndex) {
    const queue = [startIndex];
    const queued = new Set(queue);

    while (queue.length) {
      const index = queue.shift();
      const cell = state.cells[index];
      if (cell.revealed || cell.flagged || cell.mine) continue;

      cell.revealed = true;
      state.revealed += 1;
      paintCell(index);

      if (cell.number === 0) {
        neighbors(index).forEach((nearby) => {
          const next = state.cells[nearby];
          if (!next.revealed && !next.flagged && !next.mine && !queued.has(nearby)) {
            queued.add(nearby);
            queue.push(nearby);
          }
        });
      }
    }
  }

  function revealAllMines(explodedIndex) {
    state.cells.forEach((cell, index) => {
      if (cell.mine) {
        cell.revealed = true;
        cell.exploded = index === explodedIndex;
      } else if (cell.flagged) {
        cell.wrongFlag = true;
      }
      paintCell(index);
    });
  }

  function showResult(won, isBest = false) {
    const mark = document.getElementById("result-mark");
    mark.textContent = won ? "✓" : "×";
    mark.classList.toggle("lose", !won);
    document.getElementById("result-eyebrow").textContent = won
      ? (isBest ? "新的最佳纪录" : "排雷完成")
      : "排雷失败";
    document.getElementById("result-title").textContent = won ? "干得漂亮！" : "踩到地雷了";
    document.getElementById("result-copy").textContent = won
      ? "你成功找出了全部地雷。"
      : "别灰心，记住数字提供的线索再试一次。";
    document.getElementById("result-time").textContent = `${state.elapsed} 秒`;
    overlayEl.classList.add("show");
    overlayEl.setAttribute("aria-hidden", "false");
    document.getElementById("play-again").focus();
  }

  function finishGame(won, explodedIndex = -1) {
    state.phase = won ? "won" : "lost";
    stopTimer();
    faceEl.textContent = won ? "😎" : "😵";

    let isBest = false;
    if (won) {
      state.cells.forEach((cell, index) => {
        if (cell.mine && !cell.flagged) {
          cell.flagged = true;
          state.flags += 1;
          paintCell(index);
        }
      });
      isBest = saveBest(state.elapsed);
      updateBest();
      statusEl.textContent = isBest ? "完成！创造了新的最佳纪录" : "完成！所有地雷都已找到";
    } else {
      revealAllMines(explodedIndex);
      statusEl.textContent = "游戏结束，点击笑脸重新开始";
    }

    updateHud();
    window.setTimeout(() => showResult(won, isBest), 260);
  }

  function checkWin() {
    if (state.revealed === state.cells.length - config().mines) finishGame(true);
  }

  function chord(index) {
    const cell = state.cells[index];
    if (!cell.revealed || cell.number === 0) return;

    const around = neighbors(index);
    const flagged = around.filter((nearby) => state.cells[nearby].flagged).length;
    if (flagged !== cell.number) return;

    const hidden = around.filter((nearby) => {
      const next = state.cells[nearby];
      return !next.revealed && !next.flagged;
    });
    const mine = hidden.find((nearby) => state.cells[nearby].mine);
    if (mine !== undefined) {
      finishGame(false, mine);
      return;
    }
    hidden.forEach(revealArea);
    checkWin();
  }

  function reveal(index) {
    if (state.phase === "won" || state.phase === "lost") return;
    const cell = state.cells[index];
    if (cell.flagged) return;
    if (cell.revealed) {
      chord(index);
      return;
    }

    if (state.phase === "ready") beginGame(index);
    if (cell.mine) {
      finishGame(false, index);
      return;
    }
    revealArea(index);
    checkWin();
  }

  function toggleFlag(index) {
    if (state.phase === "won" || state.phase === "lost") return;
    const cell = state.cells[index];
    if (cell.revealed) return;
    if (!cell.flagged && state.flags >= config().mines) {
      statusEl.textContent = "可用旗帜已经全部放置";
      return;
    }

    cell.flagged = !cell.flagged;
    state.flags += cell.flagged ? 1 : -1;
    paintCell(index);
    updateHud();
    statusEl.textContent = cell.flagged ? "已标记一处可疑位置" : "已取消标记";
  }

  function hideResult() {
    overlayEl.classList.remove("show");
    overlayEl.setAttribute("aria-hidden", "true");
  }

  function resetGame() {
    stopTimer();
    window.clearTimeout(state.longPressId);
    hideResult();
    state.phase = "ready";
    state.flags = 0;
    state.revealed = 0;
    state.elapsed = 0;
    state.pressStart = null;
    faceEl.textContent = "🙂";
    statusEl.textContent = "点击任意方格开始";
    buildEmptyCells();
    renderBoard();
    updateHud();
    updateBest();
  }

  boardEl.addEventListener("click", (event) => {
    const cell = event.target.closest(".cell");
    if (!cell || Date.now() < state.suppressClickUntil) return;
    const index = Number(cell.dataset.index);
    if (event.shiftKey) toggleFlag(index);
    else reveal(index);
  });

  boardEl.addEventListener("contextmenu", (event) => {
    const cell = event.target.closest(".cell");
    if (!cell) return;
    event.preventDefault();
    toggleFlag(Number(cell.dataset.index));
  });

  boardEl.addEventListener("pointerdown", (event) => {
    const cell = event.target.closest(".cell");
    if (!cell || event.pointerType === "mouse") return;
    const index = Number(cell.dataset.index);
    state.pressStart = { x: event.clientX, y: event.clientY };
    state.longPressId = window.setTimeout(() => {
      toggleFlag(index);
      state.suppressClickUntil = Date.now() + 500;
      navigator.vibrate?.(35);
    }, 480);
  });

  boardEl.addEventListener("pointermove", (event) => {
    if (!state.pressStart) return;
    if (
      Math.abs(event.clientX - state.pressStart.x) > 10 ||
      Math.abs(event.clientY - state.pressStart.y) > 10
    ) {
      window.clearTimeout(state.longPressId);
      state.pressStart = null;
    }
  });

  const clearLongPress = () => {
    window.clearTimeout(state.longPressId);
    state.pressStart = null;
  };

  boardEl.addEventListener("pointerup", clearLongPress);
  boardEl.addEventListener("pointercancel", clearLongPress);
  resetBtn.addEventListener("click", resetGame);
  document.getElementById("play-again").addEventListener("click", resetGame);
  document.getElementById("close-result").addEventListener("click", hideResult);

  overlayEl.addEventListener("click", (event) => {
    if (event.target === overlayEl) hideResult();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") hideResult();
  });

  document.querySelectorAll(".difficulty-btn").forEach((button) => {
    button.addEventListener("click", () => {
      state.level = button.dataset.level;
      document.querySelectorAll(".difficulty-btn").forEach((item) => {
        item.classList.toggle("active", item === button);
      });
      resetGame();
    });
  });

  resetGame();
})();
