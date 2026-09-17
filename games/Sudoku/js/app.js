(function () {
  "use strict";

  const Engine = window.SudokuEngine;
  const STORAGE_KEY = "htmlgames-sudoku-state";

  const boardEl = document.getElementById("board");
  const padEl = document.getElementById("pad");
  const chipsEl = document.getElementById("difficulty-chips");
  const timerEl = document.getElementById("timer");
  const difficultyLabelEl = document.getElementById("difficulty-label");
  const clueLabelEl = document.getElementById("clue-label");
  const toastEl = document.getElementById("toast");
  const loadingEl = document.getElementById("loading");
  const notesBtn = document.getElementById("btn-notes");
  const importDialog = document.getElementById("import-dialog");
  const exportDialog = document.getElementById("export-dialog");
  const winDialog = document.getElementById("win-dialog");
  const importText = document.getElementById("import-text");
  const importFile = document.getElementById("import-file");
  const exportPreview = document.getElementById("export-preview");

  const cellEls = [];
  let difficulty = "medium";
  let puzzle = Engine.emptyGrid();
  let solution = Engine.emptyGrid();
  let board = Engine.emptyGrid();
  let notes = Engine.emptyNotes();
  let selected = { r: 0, c: 0 };
  let noteMode = false;
  let history = [];
  let elapsed = 0;
  let timerId = null;
  let won = false;
  let checkMarks = [];
  let toastTimer = null;
  let unique = true;
  let generating = false;

  function showToast(message) {
    toastEl.textContent = message;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove("show");
    }, 2200);
  }

  function formatTime(total) {
    const m = String(Math.floor(total / 60)).padStart(2, "0");
    const s = String(total % 60).padStart(2, "0");
    return m + ":" + s;
  }

  function setLoading(on) {
    loadingEl.classList.toggle("show", on);
  }

  function stopTimer() {
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
  }

  function startTimer() {
    stopTimer();
    timerId = setInterval(function () {
      if (won || document.hidden) return;
      elapsed += 1;
      timerEl.textContent = formatTime(elapsed);
      persist();
    }, 1000);
  }

  function persist() {
    const payload = {
      difficulty: difficulty,
      puzzle: Engine.digitsToString(puzzle),
      solution: Engine.digitsToString(solution),
      board: Engine.digitsToString(board),
      notes: serializeNotes(),
      elapsedSeconds: elapsed,
      selected: selected,
      noteMode: noteMode,
      won: won,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (err) {
      /* 忽略隐私模式写入失败 */
    }
  }

  function serializeNotes() {
    const sparse = {};
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (notes[r][c].size) {
          sparse[r + "," + c] = Array.from(notes[r][c]);
        }
      }
    }
    return sparse;
  }

  function isGiven(r, c) {
    return puzzle[r][c] !== 0;
  }

  function snapshot() {
    return {
      board: Engine.copyGrid(board),
      notes: notes.map(function (row) {
        return row.map(function (set) {
          return new Set(set);
        });
      }),
    };
  }

  function pushHistory() {
    history.push(snapshot());
    if (history.length > 200) history.shift();
  }

  function countDigit(n) {
    let total = 0;
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (board[r][c] === n) total++;
      }
    }
    return total;
  }

  function renderPad() {
    padEl.querySelectorAll("[data-num]").forEach(function (btn) {
      const n = Number(btn.getAttribute("data-num"));
      btn.classList.toggle("done", countDigit(n) >= 9);
      const selectedValue = board[selected.r][selected.c];
      btn.classList.toggle("active", selectedValue === n);
    });
    notesBtn.classList.toggle("primary", noteMode);
    notesBtn.classList.toggle("ghost", !noteMode);
    notesBtn.textContent = noteMode ? "笔记中" : "笔记";
  }

  function renderMeta() {
    const spec = Engine.DIFFICULTIES[difficulty];
    difficultyLabelEl.textContent = spec ? spec.label : "自定义";
    clueLabelEl.textContent = String(Engine.clueCount(puzzle));
    timerEl.textContent = formatTime(elapsed);
    chipsEl.querySelectorAll(".chip").forEach(function (chip) {
      chip.classList.toggle("active", chip.getAttribute("data-diff") === difficulty);
    });
  }

  function renderBoard() {
    const duplicates = Engine.findDuplicates(board);
    const dupSet = {};
    duplicates.forEach(function (cell) {
      dupSet[cell.r + "," + cell.c] = true;
    });
    const checkSet = {};
    checkMarks.forEach(function (cell) {
      checkSet[cell.r + "," + cell.c] = true;
    });

    const selectedValue = board[selected.r][selected.c];
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const el = cellEls[r][c];
        const value = board[r][c];
        const sameUnit =
          r === selected.r ||
          c === selected.c ||
          (Math.floor(r / 3) === Math.floor(selected.r / 3) &&
            Math.floor(c / 3) === Math.floor(selected.c / 3));

        el.className = "cell";
        if (isGiven(r, c)) el.classList.add("given");
        if (sameUnit) el.classList.add("peer");
        if (selectedValue && value === selectedValue) el.classList.add("same");
        if (r === selected.r && c === selected.c) el.classList.add("selected");
        if (dupSet[r + "," + c]) el.classList.add("error");
        if (checkSet[r + "," + c]) el.classList.add("wrong");

        el.textContent = "";
        if (value) {
          el.textContent = String(value);
        } else if (notes[r][c].size) {
          const wrap = document.createElement("div");
          wrap.className = "notes";
          for (let n = 1; n <= 9; n++) {
            const span = document.createElement("span");
            span.textContent = String(n);
            if (notes[r][c].has(n)) span.classList.add("on");
            wrap.appendChild(span);
          }
          el.appendChild(wrap);
        }
      }
    }
    renderPad();
    renderMeta();
  }

  function selectCell(r, c) {
    selected = { r: r, c: c };
    checkMarks = [];
    renderBoard();
  }

  function maybeWin() {
    if (won) return;
    if (!Engine.matchesSolution(board, solution)) return;
    won = true;
    stopTimer();
    persist();
    document.getElementById("win-difficulty").textContent =
      (Engine.DIFFICULTIES[difficulty] && Engine.DIFFICULTIES[difficulty].label) || "自定义";
    document.getElementById("win-time").textContent = formatTime(elapsed);
    if (typeof winDialog.showModal === "function") winDialog.showModal();
    else showToast("恭喜完成！用时 " + formatTime(elapsed));
  }

  function clearNotesFor(r, c, n) {
    for (let i = 0; i < 9; i++) {
      notes[r][i].delete(n);
      notes[i][c].delete(n);
    }
    const br = Math.floor(r / 3) * 3;
    const bc = Math.floor(c / 3) * 3;
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        notes[br + i][bc + j].delete(n);
      }
    }
  }

  function enterNumber(n) {
    if (won || isGiven(selected.r, selected.c)) return;
    const r = selected.r;
    const c = selected.c;
    pushHistory();
    checkMarks = [];

    if (noteMode) {
      if (board[r][c]) {
        renderBoard();
        return;
      }
      if (notes[r][c].has(n)) notes[r][c].delete(n);
      else notes[r][c].add(n);
    } else if (board[r][c] === n) {
      board[r][c] = 0;
    } else {
      board[r][c] = n;
      notes[r][c] = new Set();
      clearNotesFor(r, c, n);
    }
    persist();
    renderBoard();
    maybeWin();
  }

  function eraseCell() {
    if (won || isGiven(selected.r, selected.c)) return;
    const r = selected.r;
    const c = selected.c;
    if (!board[r][c] && !notes[r][c].size) return;
    pushHistory();
    board[r][c] = 0;
    notes[r][c] = new Set();
    checkMarks = [];
    persist();
    renderBoard();
  }

  function undo() {
    if (!history.length || won) return;
    const prev = history.pop();
    board = prev.board;
    notes = prev.notes;
    checkMarks = [];
    persist();
    renderBoard();
  }

  function giveHint() {
    if (won) return;
    const hint = Engine.hintCell(board, solution, puzzle);
    if (!hint) {
      showToast("没有可提示的空格");
      return;
    }
    selected = { r: hint.r, c: hint.c };
    pushHistory();
    board[hint.r][hint.c] = hint.value;
    notes[hint.r][hint.c] = new Set();
    clearNotesFor(hint.r, hint.c, hint.value);
    checkMarks = [];
    persist();
    renderBoard();
    cellEls[hint.r][hint.c].classList.add("hint");
    maybeWin();
  }

  function checkBoard() {
    const wrong = Engine.wrongCells(board, solution, puzzle);
    checkMarks = wrong;
    renderBoard();
    if (!wrong.length) showToast("目前填写没有错误");
    else showToast("发现 " + wrong.length + " 处与解答不符");
  }

  function loadLevel(level, options) {
    difficulty = level.difficulty || difficulty;
    puzzle = Engine.copyGrid(level.puzzle);
    solution = Engine.copyGrid(level.solution || Engine.solve(level.puzzle));
    board = Engine.copyGrid(level.board || level.puzzle);
    notes = level.notes ? level.notes : Engine.emptyNotes();
    elapsed = level.elapsedSeconds || 0;
    history = [];
    won = Engine.matchesSolution(board, solution);
    unique = level.unique !== false;
    selected = { r: 0, c: 0 };
    checkMarks = [];
    if (!options || !options.keepTimer) startTimer();
    if (won) stopTimer();
    renderBoard();
    persist();
    if (level.unique === false) showToast("该题有多解，仍可游玩");
  }

  function newGame(nextDifficulty) {
    if (generating) return;
    if (nextDifficulty) difficulty = nextDifficulty;
    generating = true;
    setLoading(true);
    window.setTimeout(function () {
      try {
        const level = Engine.generate(difficulty);
        loadLevel(level);
        showToast("已生成" + Engine.DIFFICULTIES[difficulty].label + "关卡");
      } catch (err) {
        showToast(err.message || "生成失败");
      } finally {
        generating = false;
        setLoading(false);
      }
    }, 40);
  }

  function restart() {
    loadLevel({
      difficulty: difficulty,
      puzzle: puzzle,
      solution: solution,
      board: Engine.copyGrid(puzzle),
      notes: Engine.emptyNotes(),
      elapsedSeconds: 0,
      unique: unique,
    });
    showToast("已重新开始本关");
  }

  function currentExportText() {
    return Engine.serializeLevel({
      difficulty: difficulty,
      puzzle: puzzle,
      solution: solution,
      board: board,
      notes: notes,
      elapsedSeconds: elapsed,
    });
  }

  function downloadText(filename, text) {
    const blob = new Blob([text], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      showToast("已复制到剪贴板");
    } catch (err) {
      const area = document.createElement("textarea");
      area.value = text;
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
      showToast("已复制到剪贴板");
    }
  }

  function openImport() {
    importText.value = "";
    importFile.value = "";
    if (typeof importDialog.showModal === "function") importDialog.showModal();
  }

  function applyImport() {
    try {
      const level = Engine.parseLevel(importText.value);
      loadLevel(level);
      importDialog.close();
      showToast("关卡已导入");
    } catch (err) {
      showToast(err.message || "导入失败");
    }
  }

  function openExport() {
    exportPreview.value = currentExportText();
    if (typeof exportDialog.showModal === "function") exportDialog.showModal();
  }

  function buildBoard() {
    boardEl.innerHTML = "";
    for (let r = 0; r < 9; r++) {
      cellEls[r] = [];
      for (let c = 0; c < 9; c++) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "cell";
        btn.setAttribute("role", "gridcell");
        btn.setAttribute("data-r", String(r));
        btn.setAttribute("data-c", String(c));
        btn.setAttribute("aria-label", "第 " + (r + 1) + " 行第 " + (c + 1) + " 列");
        btn.addEventListener("click", function () {
          selectCell(r, c);
        });
        boardEl.appendChild(btn);
        cellEls[r][c] = btn;
      }
    }
  }

  function buildPad() {
    padEl.innerHTML = "";
    for (let n = 1; n <= 9; n++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "pad-btn";
      btn.setAttribute("data-num", String(n));
      btn.textContent = String(n);
      btn.addEventListener("click", function () {
        enterNumber(n);
      });
      padEl.appendChild(btn);
    }
    const erase = document.createElement("button");
    erase.type = "button";
    erase.className = "pad-btn wide";
    erase.textContent = "擦除";
    erase.addEventListener("click", eraseCell);
    padEl.appendChild(erase);
  }

  function buildChips() {
    chipsEl.innerHTML = "";
    Object.keys(Engine.DIFFICULTIES).forEach(function (id) {
      const spec = Engine.DIFFICULTIES[id];
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip";
      btn.setAttribute("data-diff", id);
      btn.textContent = spec.label;
      btn.addEventListener("click", function () {
        if (difficulty !== id) difficulty = id;
        renderMeta();
        newGame(id);
      });
      chipsEl.appendChild(btn);
    });
  }

  function restoreOrGenerate() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        const level = Engine.parseLevel(JSON.stringify(saved));
        level.elapsedSeconds = saved.elapsedSeconds || 0;
        loadLevel(level);
        if (saved.selected) selected = saved.selected;
        noteMode = Boolean(saved.noteMode);
        won = Boolean(saved.won);
        if (won) stopTimer();
        renderBoard();
        return;
      }
    } catch (err) {
      localStorage.removeItem(STORAGE_KEY);
    }
    newGame(difficulty);
  }

  function onKey(event) {
    const tag = (event.target && event.target.tagName) || "";
    if (tag === "TEXTAREA" || tag === "INPUT") return;

    const key = event.key;
    if (key === "ArrowUp") {
      event.preventDefault();
      selectCell(Math.max(0, selected.r - 1), selected.c);
    } else if (key === "ArrowDown") {
      event.preventDefault();
      selectCell(Math.min(8, selected.r + 1), selected.c);
    } else if (key === "ArrowLeft") {
      event.preventDefault();
      selectCell(selected.r, Math.max(0, selected.c - 1));
    } else if (key === "ArrowRight") {
      event.preventDefault();
      selectCell(selected.r, Math.min(8, selected.c + 1));
    } else if (key >= "1" && key <= "9") {
      enterNumber(Number(key));
    } else if (key === "0" || key === "Backspace" || key === "Delete") {
      eraseCell();
    } else if (key === "n" || key === "N") {
      noteMode = !noteMode;
      renderPad();
    } else if ((event.ctrlKey || event.metaKey) && (key === "z" || key === "Z")) {
      event.preventDefault();
      undo();
    }
  }

  document.getElementById("btn-new").addEventListener("click", function () {
    newGame(difficulty);
  });
  document.getElementById("btn-restart").addEventListener("click", restart);
  document.getElementById("btn-import").addEventListener("click", openImport);
  document.getElementById("btn-export").addEventListener("click", openExport);
  document.getElementById("btn-notes").addEventListener("click", function () {
    noteMode = !noteMode;
    renderPad();
  });
  document.getElementById("btn-undo").addEventListener("click", undo);
  document.getElementById("btn-hint").addEventListener("click", giveHint);
  document.getElementById("btn-check").addEventListener("click", checkBoard);
  document.getElementById("btn-import-confirm").addEventListener("click", applyImport);
  document.getElementById("btn-copy-puzzle").addEventListener("click", function () {
    copyText(Engine.digitsToString(puzzle));
  });
  document.getElementById("btn-copy-json").addEventListener("click", function () {
    copyText(currentExportText());
  });
  document.getElementById("btn-download").addEventListener("click", function () {
    const name = "sudoku-" + difficulty + "-" + Date.now() + ".json";
    downloadText(name, currentExportText());
  });
  document.getElementById("btn-win-new").addEventListener("click", function () {
    winDialog.close();
    newGame(difficulty);
  });
  importFile.addEventListener("change", function () {
    const file = importFile.files && importFile.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function () {
      importText.value = String(reader.result || "");
      applyImport();
    };
    reader.readAsText(file, "utf-8");
  });
  document.addEventListener("keydown", onKey);

  buildBoard();
  buildPad();
  buildChips();
  restoreOrGenerate();
})();
