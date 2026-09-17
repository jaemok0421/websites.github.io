(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.SudokuEngine = api;
  }
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const SIZE = 9;
  const BOX = 3;
  const ALL = 0b1111111110;
  const FORMAT = "htmlgames-sudoku";

  const DIFFICULTIES = {
    easy: { id: "easy", label: "简单", minClues: 40, maxClues: 46 },
    medium: { id: "medium", label: "中等", minClues: 32, maxClues: 36 },
    hard: { id: "hard", label: "困难", minClues: 26, maxClues: 30 },
    expert: { id: "expert", label: "专家", minClues: 22, maxClues: 25 },
  };

  function emptyGrid() {
    return Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
  }

  function copyGrid(grid) {
    return grid.map(function (row) {
      return row.slice();
    });
  }

  function boxIndex(r, c) {
    return Math.floor(r / BOX) * BOX + Math.floor(c / BOX);
  }

  function shuffle(list) {
    const arr = list.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  function popcount(n) {
    let count = 0;
    while (n) {
      n &= n - 1;
      count++;
    }
    return count;
  }

  function bitToDigit(bit) {
    return 31 - Math.clz32(bit);
  }

  function digitsToString(grid) {
    let out = "";
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        out += grid[r][c] ? String(grid[r][c]) : ".";
      }
    }
    return out;
  }

  function stringToGrid(text) {
    const chars = String(text).replace(/[_*]/g, ".").replace(/[^0-9.]/g, "");
    if (chars.length !== 81) {
      throw new Error("题目长度必须为 81 个数字（空格用 0 或 . 表示）");
    }
    const grid = emptyGrid();
    for (let i = 0; i < 81; i++) {
      const ch = chars[i];
      grid[(i / SIZE) | 0][i % SIZE] = ch === "." ? 0 : Number(ch);
    }
    return grid;
  }

  function givenConflicts(grid) {
    const rows = Array(SIZE).fill(0);
    const cols = Array(SIZE).fill(0);
    const boxes = Array(SIZE).fill(0);
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const n = grid[r][c];
        if (!n) continue;
        const bit = 1 << n;
        const b = boxIndex(r, c);
        if (rows[r] & bit || cols[c] & bit || boxes[b] & bit) return true;
        rows[r] |= bit;
        cols[c] |= bit;
        boxes[b] |= bit;
      }
    }
    return false;
  }

  function search(startGrid, options) {
    const randomize = Boolean(options && options.randomize);
    const limit = (options && options.limit) || 1;
    const grid = copyGrid(startGrid);
    const rows = Array(SIZE).fill(0);
    const cols = Array(SIZE).fill(0);
    const boxes = Array(SIZE).fill(0);
    const empties = [];

    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const n = grid[r][c];
        if (n) {
          const bit = 1 << n;
          const b = boxIndex(r, c);
          if (rows[r] & bit || cols[c] & bit || boxes[b] & bit) {
            return { count: 0, grid: null };
          }
          rows[r] |= bit;
          cols[c] |= bit;
          boxes[b] |= bit;
        } else {
          empties.push(r * SIZE + c);
        }
      }
    }

    let count = 0;
    let solved = null;

    function dfs() {
      if (count >= limit) return;

      let best = -1;
      let bestMask = 0;
      let bestCount = 10;

      for (let i = 0; i < empties.length; i++) {
        const pos = empties[i];
        const r = (pos / SIZE) | 0;
        const c = pos % SIZE;
        if (grid[r][c]) continue;
        const mask = ALL & ~(rows[r] | cols[c] | boxes[boxIndex(r, c)]);
        const nBits = popcount(mask);
        if (nBits === 0) return;
        if (nBits < bestCount) {
          bestCount = nBits;
          bestMask = mask;
          best = pos;
          if (nBits === 1) break;
        }
      }

      if (best === -1) {
        count += 1;
        if (!solved) solved = copyGrid(grid);
        return;
      }

      const r = (best / SIZE) | 0;
      const c = best % SIZE;
      const b = boxIndex(r, c);
      let mask = bestMask;
      let bits = [];
      while (mask) {
        const bit = mask & -mask;
        bits.push(bit);
        mask ^= bit;
      }
      if (randomize) bits = shuffle(bits);

      for (let i = 0; i < bits.length; i++) {
        const bit = bits[i];
        const n = bitToDigit(bit);
        grid[r][c] = n;
        rows[r] |= bit;
        cols[c] |= bit;
        boxes[b] |= bit;
        dfs();
        if (count >= limit) return;
        grid[r][c] = 0;
        rows[r] ^= bit;
        cols[c] ^= bit;
        boxes[b] ^= bit;
      }
    }

    dfs();
    return { count: count, grid: solved };
  }

  function solve(grid) {
    return search(grid, { limit: 1, randomize: false }).grid;
  }

  function countSolutions(grid, limit) {
    return search(grid, { limit: limit || 2, randomize: false }).count;
  }

  function fillBox(grid, br, bc) {
    const nums = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    let k = 0;
    for (let i = 0; i < BOX; i++) {
      for (let j = 0; j < BOX; j++) {
        grid[br + i][bc + j] = nums[k++];
      }
    }
  }

  function randomCompleteGrid() {
    const grid = emptyGrid();
    fillBox(grid, 0, 0);
    fillBox(grid, 3, 3);
    fillBox(grid, 6, 6);
    const filled = search(grid, { limit: 1, randomize: true }).grid;
    if (!filled) throw new Error("生成终盘失败");
    return filled;
  }

  function clueCount(grid) {
    let n = 0;
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (grid[r][c]) n++;
      }
    }
    return n;
  }

  function carvePuzzle(solution, spec) {
    const puzzle = copyGrid(solution);
    const cells = shuffle(
      Array.from({ length: 81 }, function (_, i) {
        return i;
      })
    );
    let clues = 81;
    const target = spec.minClues;

    for (let i = 0; i < cells.length && clues > target; i++) {
      const pos = cells[i];
      const r = (pos / SIZE) | 0;
      const c = pos % SIZE;
      const r2 = SIZE - 1 - r;
      const c2 = SIZE - 1 - c;
      if (!puzzle[r][c]) continue;

      const saved = puzzle[r][c];
      const saved2 = puzzle[r2][c2];
      const canPair = (r !== r2 || c !== c2) && puzzle[r2][c2] && clues - 2 >= target;
      puzzle[r][c] = 0;
      let removed = 1;
      if (canPair) {
        puzzle[r2][c2] = 0;
        removed = 2;
      }

      if (countSolutions(puzzle, 2) !== 1) {
        if (removed === 2) {
          puzzle[r2][c2] = saved2;
          removed = 1;
          if (countSolutions(puzzle, 2) !== 1) {
            puzzle[r][c] = saved;
            continue;
          }
        } else {
          puzzle[r][c] = saved;
          continue;
        }
      }
      clues -= removed;
    }

    return puzzle;
  }

  function generate(difficulty) {
    const spec = DIFFICULTIES[difficulty] || DIFFICULTIES.medium;
    let best = null;
    for (let attempt = 0; attempt < 6; attempt++) {
      let solution = null;
      for (let i = 0; i < 5 && !solution; i++) {
        try {
          solution = randomCompleteGrid();
        } catch (err) {
          solution = null;
        }
      }
      if (!solution) continue;

      const puzzle = carvePuzzle(solution, spec);
      if (countSolutions(puzzle, 2) !== 1) continue;
      const clues = clueCount(puzzle);
      const candidate = {
        difficulty: spec.id,
        puzzle: puzzle,
        solution: solution,
        clues: clues,
      };
      if (!best || clues < best.clues) best = candidate;
      if (clues <= spec.maxClues) return candidate;
    }
    if (!best) throw new Error("生成关卡失败");
    return best;
  }

  function findDuplicates(grid) {
    const conflicts = [];
    function markUnit(cells) {
      const seen = Object.create(null);
      for (let i = 0; i < cells.length; i++) {
        const cell = cells[i];
        const n = grid[cell.r][cell.c];
        if (!n) continue;
        if (!seen[n]) seen[n] = [];
        seen[n].push(cell);
      }
      Object.keys(seen).forEach(function (key) {
        const list = seen[key];
        if (list.length > 1) {
          for (let i = 0; i < list.length; i++) conflicts.push(list[i]);
        }
      });
    }

    for (let i = 0; i < SIZE; i++) {
      const row = [];
      const col = [];
      for (let j = 0; j < SIZE; j++) {
        row.push({ r: i, c: j });
        col.push({ r: j, c: i });
      }
      markUnit(row);
      markUnit(col);
    }
    for (let br = 0; br < SIZE; br += BOX) {
      for (let bc = 0; bc < SIZE; bc += BOX) {
        const box = [];
        for (let i = 0; i < BOX; i++) {
          for (let j = 0; j < BOX; j++) {
            box.push({ r: br + i, c: bc + j });
          }
        }
        markUnit(box);
      }
    }
    return conflicts;
  }

  function isCompleteAndValid(grid) {
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (!grid[r][c]) return false;
      }
    }
    return findDuplicates(grid).length === 0;
  }

  function matchesSolution(grid, solution) {
    if (!solution) return isCompleteAndValid(grid);
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (grid[r][c] !== solution[r][c]) return false;
      }
    }
    return true;
  }

  function wrongCells(grid, solution, puzzle) {
    const wrong = [];
    if (!solution) return wrong;
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (puzzle && puzzle[r][c]) continue;
        if (grid[r][c] && grid[r][c] !== solution[r][c]) {
          wrong.push({ r: r, c: c });
        }
      }
    }
    return wrong;
  }

  function hintCell(grid, solution, puzzle) {
    if (!solution) return null;
    const options = [];
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (puzzle[r][c]) continue;
        if (grid[r][c] === solution[r][c]) continue;
        options.push({ r: r, c: c, value: solution[r][c] });
      }
    }
    if (!options.length) return null;
    return options[(Math.random() * options.length) | 0];
  }

  function notesMapToSparse(notes) {
    const sparse = {};
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const set = notes[r][c];
        if (set && set.size) {
          sparse[r + "," + c] = Array.from(set).sort(function (a, b) {
            return a - b;
          });
        }
      }
    }
    return sparse;
  }

  function sparseToNotes(sparse) {
    const notes = Array.from({ length: SIZE }, function () {
      return Array.from({ length: SIZE }, function () {
        return new Set();
      });
    });
    if (!sparse || typeof sparse !== "object") return notes;
    Object.keys(sparse).forEach(function (key) {
      const parts = key.split(",");
      const r = Number(parts[0]);
      const c = Number(parts[1]);
      if (r >= 0 && r < SIZE && c >= 0 && c < SIZE && Array.isArray(sparse[key])) {
        sparse[key].forEach(function (n) {
          if (n >= 1 && n <= 9) notes[r][c].add(n);
        });
      }
    });
    return notes;
  }

  function emptyNotes() {
    return Array.from({ length: SIZE }, function () {
      return Array.from({ length: SIZE }, function () {
        return new Set();
      });
    });
  }

  function serializeLevel(state) {
    const payload = {
      format: FORMAT,
      version: 1,
      difficulty: state.difficulty || "medium",
      puzzle: digitsToString(state.puzzle),
      solution: state.solution ? digitsToString(state.solution) : undefined,
      clues: clueCount(state.puzzle),
      exportedAt: new Date().toISOString(),
    };
    if (state.board) payload.board = digitsToString(state.board);
    if (state.notes) payload.notes = notesMapToSparse(state.notes);
    if (typeof state.elapsedSeconds === "number") {
      payload.elapsedSeconds = state.elapsedSeconds;
    }
    if (state.name) payload.name = state.name;
    return JSON.stringify(payload, null, 2);
  }

  function looksLikeJson(text) {
    const t = text.trim();
    return t.charAt(0) === "{" && t.charAt(t.length - 1) === "}";
  }

  function analyzePuzzle(puzzle) {
    if (givenConflicts(puzzle)) {
      throw new Error("题目本身存在重复数字，无法导入");
    }
    const solved = search(puzzle, { limit: 2, randomize: false });
    if (!solved.count) {
      throw new Error("题目无解，无法导入");
    }
    return {
      solution: solved.grid,
      unique: solved.count === 1,
    };
  }

  function parseLevel(raw) {
    const text = String(raw || "").trim();
    if (!text) throw new Error("没有可导入的内容");

    let data;
    if (looksLikeJson(text)) {
      try {
        data = JSON.parse(text);
      } catch (err) {
        throw new Error("JSON 格式不正确");
      }
      if (!data.puzzle) throw new Error("JSON 中缺少 puzzle 字段");
    } else {
      data = { puzzle: text };
    }

    const puzzle = stringToGrid(data.puzzle);
    const info = analyzePuzzle(puzzle);
    let solution = info.solution;
    if (data.solution) {
      try {
        const imported = stringToGrid(data.solution);
        if (clueCount(imported) === 81 && !givenConflicts(imported)) {
          solution = imported;
        }
      } catch (err) {
        /* 使用求解结果 */
      }
    }

    let board = copyGrid(puzzle);
    if (data.board) {
      try {
        board = stringToGrid(data.board);
        for (let r = 0; r < SIZE; r++) {
          for (let c = 0; c < SIZE; c++) {
            if (puzzle[r][c] && board[r][c] !== puzzle[r][c]) {
              board[r][c] = puzzle[r][c];
            }
          }
        }
      } catch (err) {
        board = copyGrid(puzzle);
      }
    }

    const difficulty =
      data.difficulty && DIFFICULTIES[data.difficulty] ? data.difficulty : "medium";

    return {
      difficulty: difficulty,
      puzzle: puzzle,
      solution: solution,
      board: board,
      notes: sparseToNotes(data.notes),
      elapsedSeconds: Number(data.elapsedSeconds) || 0,
      unique: info.unique,
      clues: clueCount(puzzle),
      name: data.name || "",
    };
  }

  return {
    SIZE: SIZE,
    DIFFICULTIES: DIFFICULTIES,
    FORMAT: FORMAT,
    emptyGrid: emptyGrid,
    copyGrid: copyGrid,
    emptyNotes: emptyNotes,
    digitsToString: digitsToString,
    stringToGrid: stringToGrid,
    generate: generate,
    solve: solve,
    countSolutions: countSolutions,
    findDuplicates: findDuplicates,
    isCompleteAndValid: isCompleteAndValid,
    matchesSolution: matchesSolution,
    wrongCells: wrongCells,
    hintCell: hintCell,
    serializeLevel: serializeLevel,
    parseLevel: parseLevel,
    clueCount: clueCount,
  };
});
