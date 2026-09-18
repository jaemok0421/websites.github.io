(() => {
  const BLACK = 1;
  const WHITE = -1;
  const TYPES = ["R", "B", "G", "S", "N", "L", "P"];
  const LABEL = { K: "王", R: "飛", B: "角", G: "金", S: "銀", N: "桂", L: "香", P: "歩" };
  const PROMOTED_LABEL = { R: "龍", B: "馬", S: "全", N: "圭", L: "杏", P: "と" };
  const VALUE = { K: 20000, R: 900, B: 780, G: 520, S: 470, N: 330, L: 280, P: 100 };
  const DIFFICULTY_HINT = {
    easy: "以随机着法为主，也会优先吃子。",
    medium: "会权衡吃子、升变与王的安全。",
    hard: "会预判对手回应，并主动制造王手。",
  };

  const boardEl = document.getElementById("board");
  const blackHandEl = document.getElementById("hand-black");
  const whiteHandEl = document.getElementById("hand-white");
  const turnCard = document.getElementById("turn-card");
  const turnLabel = document.getElementById("turn-label");
  const boardTip = document.getElementById("board-tip");
  const thinkingEl = document.getElementById("thinking");
  const undoButton = document.getElementById("btn-undo");
  const promotionDialog = document.getElementById("promotion-dialog");
  const resultDialog = document.getElementById("result-dialog");

  function initialBoard() {
    const board = Array.from({ length: 9 }, () => Array(9).fill(null));
    const back = ["L", "N", "S", "G", "K", "G", "S", "N", "L"];
    back.forEach((type, c) => {
      board[0][c] = { type, side: WHITE, promoted: false };
      board[8][c] = { type, side: BLACK, promoted: false };
    });
    board[1][1] = { type: "R", side: WHITE, promoted: false };
    board[1][7] = { type: "B", side: WHITE, promoted: false };
    board[7][1] = { type: "B", side: BLACK, promoted: false };
    board[7][7] = { type: "R", side: BLACK, promoted: false };
    for (let c = 0; c < 9; c += 1) {
      board[2][c] = { type: "P", side: WHITE, promoted: false };
      board[6][c] = { type: "P", side: BLACK, promoted: false };
    }
    return board;
  }

  const state = {
    game: newPosition(),
    mode: "ai",
    difficulty: "medium",
    humanSide: BLACK,
    selected: null,
    legalTargets: [],
    history: [],
    snapshots: [],
    over: false,
    thinking: false,
    token: 0,
    pendingPromotion: null,
  };

  function newPosition() {
    return {
      board: initialBoard(),
      hands: { [BLACK]: emptyHand(), [WHITE]: emptyHand() },
      turn: BLACK,
    };
  }

  function emptyHand() {
    return { R: 0, B: 0, G: 0, S: 0, N: 0, L: 0, P: 0 };
  }

  function cloneGame(game) {
    return {
      board: game.board.map((row) => row.map((piece) => piece ? { ...piece } : null)),
      hands: { [BLACK]: { ...game.hands[BLACK] }, [WHITE]: { ...game.hands[WHITE] } },
      turn: game.turn,
    };
  }

  function inBounds(r, c) {
    return r >= 0 && r < 9 && c >= 0 && c < 9;
  }

  function promotionZone(side, row) {
    return side === BLACK ? row <= 2 : row >= 6;
  }

  function canPromote(piece, fromRow, toRow) {
    return !piece.promoted && !["K", "G"].includes(piece.type)
      && (promotionZone(piece.side, fromRow) || promotionZone(piece.side, toRow));
  }

  function mustPromote(piece, toRow) {
    if (piece.type === "P" || piece.type === "L") return toRow === (piece.side === BLACK ? 0 : 8);
    if (piece.type === "N") return piece.side === BLACK ? toRow <= 1 : toRow >= 7;
    return false;
  }

  function addStepMoves(game, moves, r, c, piece, steps) {
    const forward = piece.side === BLACK ? -1 : 1;
    for (const [vertical, horizontal] of steps) {
      const nr = r + vertical * forward;
      const nc = c + horizontal;
      if (!inBounds(nr, nc)) continue;
      const target = game.board[nr][nc];
      if (!target || target.side !== piece.side) moves.push({ from: { r, c }, to: { r: nr, c: nc } });
    }
  }

  function addSlides(game, moves, r, c, piece, directions) {
    for (const [dr, dc] of directions) {
      let nr = r + dr;
      let nc = c + dc;
      while (inBounds(nr, nc)) {
        const target = game.board[nr][nc];
        if (!target) {
          moves.push({ from: { r, c }, to: { r: nr, c: nc } });
        } else {
          if (target.side !== piece.side) moves.push({ from: { r, c }, to: { r: nr, c: nc } });
          break;
        }
        nr += dr;
        nc += dc;
      }
    }
  }

  function pseudoMovesForPiece(game, r, c) {
    const piece = game.board[r][c];
    if (!piece) return [];
    const moves = [];
    const goldSteps = [[1, -1], [1, 0], [1, 1], [0, -1], [0, 1], [-1, 0]];
    if (piece.promoted && ["P", "L", "N", "S"].includes(piece.type)) {
      addStepMoves(game, moves, r, c, piece, goldSteps);
    } else if (piece.type === "K") {
      addStepMoves(game, moves, r, c, piece, [[1,-1],[1,0],[1,1],[0,-1],[0,1],[-1,-1],[-1,0],[-1,1]]);
    } else if (piece.type === "G") {
      addStepMoves(game, moves, r, c, piece, goldSteps);
    } else if (piece.type === "S") {
      addStepMoves(game, moves, r, c, piece, [[1,-1],[1,0],[1,1],[-1,-1],[-1,1]]);
    } else if (piece.type === "N") {
      addStepMoves(game, moves, r, c, piece, [[2,-1],[2,1]]);
    } else if (piece.type === "L") {
      addSlides(game, moves, r, c, piece, [[piece.side === BLACK ? -1 : 1, 0]]);
    } else if (piece.type === "P") {
      addStepMoves(game, moves, r, c, piece, [[1, 0]]);
    } else if (piece.type === "R") {
      addSlides(game, moves, r, c, piece, [[1,0],[-1,0],[0,1],[0,-1]]);
      if (piece.promoted) addStepMoves(game, moves, r, c, piece, [[1,-1],[1,1],[-1,-1],[-1,1]]);
    } else if (piece.type === "B") {
      addSlides(game, moves, r, c, piece, [[1,1],[1,-1],[-1,1],[-1,-1]]);
      if (piece.promoted) addStepMoves(game, moves, r, c, piece, [[1,0],[-1,0],[0,1],[0,-1]]);
    }
    return moves;
  }

  function expandedPieceMoves(game, r, c) {
    const piece = game.board[r][c];
    const moves = [];
    for (const move of pseudoMovesForPiece(game, r, c)) {
      if (mustPromote(piece, move.to.r)) {
        moves.push({ ...move, promote: true });
      } else if (canPromote(piece, r, move.to.r)) {
        moves.push({ ...move, promote: false }, { ...move, promote: true });
      } else {
        moves.push({ ...move, promote: false });
      }
    }
    return moves;
  }

  function kingPosition(game, side) {
    for (let r = 0; r < 9; r += 1) {
      for (let c = 0; c < 9; c += 1) {
        const piece = game.board[r][c];
        if (piece && piece.side === side && piece.type === "K") return { r, c };
      }
    }
    return null;
  }

  function isAttacked(game, row, col, bySide) {
    for (let r = 0; r < 9; r += 1) {
      for (let c = 0; c < 9; c += 1) {
        const piece = game.board[r][c];
        if (!piece || piece.side !== bySide) continue;
        if (pseudoMovesForPiece(game, r, c).some((move) => move.to.r === row && move.to.c === col)) return true;
      }
    }
    return false;
  }

  function inCheck(game, side) {
    const king = kingPosition(game, side);
    return !king || isAttacked(game, king.r, king.c, -side);
  }

  function applyMove(game, move) {
    const side = game.turn;
    if (move.drop) {
      game.board[move.to.r][move.to.c] = { type: move.drop, side, promoted: false };
      game.hands[side][move.drop] -= 1;
    } else {
      const piece = game.board[move.from.r][move.from.c];
      const captured = game.board[move.to.r][move.to.c];
      if (captured) game.hands[side][captured.type] += 1;
      game.board[move.from.r][move.from.c] = null;
      game.board[move.to.r][move.to.c] = { ...piece, promoted: piece.promoted || Boolean(move.promote) };
    }
    game.turn = -side;
  }

  function legalAfterSimulation(game, move, side) {
    const copy = cloneGame(game);
    applyMove(copy, move);
    return !inCheck(copy, side);
  }

  function hasUnpromotedPawnOnFile(game, side, col) {
    return game.board.some((row) => {
      const piece = row[col];
      return piece && piece.side === side && piece.type === "P" && !piece.promoted;
    });
  }

  function dropAllowedOnRow(type, side, row) {
    if ((type === "P" || type === "L") && row === (side === BLACK ? 0 : 8)) return false;
    if (type === "N" && (side === BLACK ? row <= 1 : row >= 7)) return false;
    return true;
  }

  function legalMoves(game, side = game.turn, checkPawnDropMate = true) {
    const moves = [];
    for (let r = 0; r < 9; r += 1) {
      for (let c = 0; c < 9; c += 1) {
        const piece = game.board[r][c];
        if (!piece || piece.side !== side) continue;
        for (const move of expandedPieceMoves(game, r, c)) {
          if (legalAfterSimulation(game, move, side)) moves.push(move);
        }
      }
    }
    for (const type of TYPES) {
      if (!game.hands[side][type]) continue;
      for (let r = 0; r < 9; r += 1) {
        for (let c = 0; c < 9; c += 1) {
          if (game.board[r][c] || !dropAllowedOnRow(type, side, r)) continue;
          if (type === "P" && hasUnpromotedPawnOnFile(game, side, c)) continue;
          const move = { drop: type, to: { r, c }, promote: false };
          if (!legalAfterSimulation(game, move, side)) continue;
          if (checkPawnDropMate && type === "P" && isIllegalPawnDropMate(game, move, side)) continue;
          moves.push(move);
        }
      }
    }
    return moves;
  }

  function isIllegalPawnDropMate(game, move, side) {
    const copy = cloneGame(game);
    applyMove(copy, move);
    if (!inCheck(copy, -side)) return false;
    return legalMoves(copy, -side, false).length === 0;
  }

  function moveKey(move) {
    return `${move.drop || `${move.from.r},${move.from.c}`}>${move.to.r},${move.to.c}:${move.promote ? 1 : 0}`;
  }

  function pieceText(piece) {
    if (piece.type === "K") return piece.side === BLACK ? "王" : "玉";
    return piece.promoted ? PROMOTED_LABEL[piece.type] : LABEL[piece.type];
  }

  function render() {
    const legalMap = new Map(state.legalTargets.map((move) => [`${move.to.r},${move.to.c}`, move]));
    const lastMove = state.history[state.history.length - 1]?.move;
    boardEl.innerHTML = "";
    for (let r = 0; r < 9; r += 1) {
      for (let c = 0; c < 9; c += 1) {
        const square = document.createElement("button");
        square.type = "button";
        square.className = "square";
        square.dataset.r = String(r);
        square.dataset.c = String(c);
        square.setAttribute("role", "gridcell");
        const piece = state.game.board[r][c];
        if (state.selected?.from?.r === r && state.selected?.from?.c === c) square.classList.add("selected");
        if (lastMove?.to.r === r && lastMove?.to.c === c) square.classList.add("last");
        if (legalMap.has(`${r},${c}`)) {
          square.classList.add("legal");
          if (piece) square.classList.add("capture");
        }
        if (piece) {
          const node = document.createElement("span");
          node.className = `piece ${piece.side === WHITE ? "white" : "black"} ${piece.promoted ? "promoted" : ""} ${piece.type === "K" ? "king" : ""}`;
          node.textContent = pieceText(piece);
          square.appendChild(node);
          square.setAttribute("aria-label", `${piece.side === BLACK ? "先手" : "后手"}${pieceText(piece)}`);
        } else {
          square.setAttribute("aria-label", `第${9 - c}列第${r + 1}行`);
        }
        boardEl.appendChild(square);
      }
    }
    renderHand(BLACK, blackHandEl);
    renderHand(WHITE, whiteHandEl);
    updateHud();
  }

  function renderHand(side, container) {
    container.innerHTML = "";
    let any = false;
    for (const type of TYPES) {
      const count = state.game.hands[side][type];
      if (!count) continue;
      any = true;
      const button = document.createElement("button");
      button.type = "button";
      button.className = `hand-piece ${side === WHITE ? "white" : ""}`;
      if (state.selected?.drop === type && state.game.turn === side) button.classList.add("selected");
      button.dataset.type = type;
      button.dataset.side = String(side);
      button.disabled = side !== state.game.turn || state.over || state.thinking || !isHumanTurn();
      button.innerHTML = `<span class="mini">${LABEL[type]}</span><b>×${count}</b>`;
      button.setAttribute("aria-label", `${LABEL[type]}${count}枚`);
      container.appendChild(button);
    }
    if (!any) {
      const empty = document.createElement("span");
      empty.className = "hand-empty";
      empty.textContent = "暂无";
      container.appendChild(empty);
    }
  }

  function isHumanTurn() {
    return state.mode === "local" || state.game.turn === state.humanSide;
  }

  function sideName(side) {
    if (state.mode === "local") return side === BLACK ? "先手" : "后手";
    return side === state.humanSide ? "玩家" : "电脑";
  }

  function updateHud() {
    const turn = state.game.turn;
    turnCard.classList.toggle("white", turn === WHITE);
    let status = `${sideName(turn)}（${turn === BLACK ? "先手" : "后手"}）`;
    if (state.over) status = "本局结束";
    turnLabel.textContent = status;
    document.getElementById("black-name").textContent = state.mode === "ai" ? sideName(BLACK) : "先手玩家";
    document.getElementById("white-name").textContent = state.mode === "ai" ? sideName(WHITE) : "后手玩家";
    document.getElementById("move-count").textContent = String(state.history.length);
    thinkingEl.classList.toggle("show", state.thinking);
    undoButton.disabled = state.snapshots.length === 0 || state.thinking || state.pendingPromotion;
    if (state.over) boardTip.textContent = "本局已经结束，可查看棋盘或重新开局";
    else if (state.thinking) boardTip.textContent = "电脑正在计算着法…";
    else if (inCheck(state.game, turn)) boardTip.textContent = `${sideName(turn)}正被王手，请解除将军`;
    else if (state.selected?.drop) boardTip.textContent = `请选择打入${LABEL[state.selected.drop]}的位置`;
    else boardTip.textContent = "点击己方棋子，再点击高亮位置行棋";

    const historyEl = document.getElementById("history");
    historyEl.innerHTML = "";
    if (!state.history.length) {
      historyEl.innerHTML = '<span class="empty-history">尚未行棋</span>';
    } else {
      state.history.slice(-24).forEach((entry, index) => {
        const span = document.createElement("span");
        span.textContent = `${state.history.length - Math.min(24, state.history.length) + index + 1}. ${entry.text}`;
        historyEl.appendChild(span);
      });
      historyEl.scrollTop = historyEl.scrollHeight;
    }
  }

  function availableMovesFrom(selection) {
    const all = legalMoves(state.game);
    if (selection.drop) return all.filter((move) => move.drop === selection.drop);
    return all.filter((move) => move.from && move.from.r === selection.from.r && move.from.c === selection.from.c);
  }

  function selectBoardSquare(r, c) {
    if (state.over || state.thinking || state.pendingPromotion || !isHumanTurn()) return;
    const piece = state.game.board[r][c];
    if (piece && piece.side === state.game.turn) {
      state.selected = { from: { r, c } };
      state.legalTargets = availableMovesFrom(state.selected);
      render();
      return;
    }
    if (!state.selected) return;
    const choices = state.legalTargets.filter((move) => move.to.r === r && move.to.c === c);
    if (!choices.length) {
      state.selected = null;
      state.legalTargets = [];
      render();
      return;
    }
    if (choices.length === 2) {
      state.pendingPromotion = choices;
      promotionDialog.showModal();
      updateHud();
    } else {
      commitMove(choices[0]);
    }
  }

  function selectHand(type, side) {
    if (side !== state.game.turn || !isHumanTurn() || state.over || state.thinking) return;
    if (state.selected?.drop === type) {
      state.selected = null;
      state.legalTargets = [];
    } else {
      state.selected = { drop: type };
      state.legalTargets = availableMovesFrom(state.selected);
    }
    render();
  }

  function notation(move, movingSide, captured) {
    const destination = `${9 - move.to.c}${["一","二","三","四","五","六","七","八","九"][move.to.r]}`;
    const type = move.drop ? move.drop : state.game.board[move.from.r][move.from.c]?.type;
    return `${movingSide === BLACK ? "☗" : "☖"}${destination}${LABEL[type]}${move.drop ? "打" : (move.promote ? "成" : "")}${captured ? "取" : ""}`;
  }

  function commitMove(move) {
    const movingSide = state.game.turn;
    const captured = state.game.board[move.to.r][move.to.c];
    const text = notation(move, movingSide, captured);
    state.snapshots.push(cloneGame(state.game));
    applyMove(state.game, move);
    state.history.push({ move: { ...move, from: move.from ? { ...move.from } : undefined, to: { ...move.to } }, text });
    state.selected = null;
    state.legalTargets = [];
    state.pendingPromotion = null;
    render();
    finishTurn(movingSide);
  }

  function finishTurn(movingSide) {
    const replies = legalMoves(state.game);
    if (!replies.length) {
      state.over = true;
      render();
      const checked = inCheck(state.game, state.game.turn);
      const winner = checked ? movingSide : 0;
      document.getElementById("result-title").textContent = winner ? `${sideName(winner)}获胜` : "持将棋";
      document.getElementById("result-text").textContent = checked
        ? `${sideName(state.game.turn)}被将死，已无合法着法。`
        : "当前一方无合法着法，本局和棋。";
      setTimeout(() => {
        if (!resultDialog.open) resultDialog.showModal();
      }, 300);
      return;
    }
    requestComputerMove();
  }

  function evaluate(game, aiSide) {
    let score = 0;
    for (let r = 0; r < 9; r += 1) {
      for (let c = 0; c < 9; c += 1) {
        const piece = game.board[r][c];
        if (!piece) continue;
        let value = VALUE[piece.type];
        if (piece.promoted) value += piece.type === "R" || piece.type === "B" ? 180 : 220;
        const advance = piece.side === BLACK ? 8 - r : r;
        value += piece.type !== "K" ? advance * 3 : 0;
        score += piece.side === aiSide ? value : -value;
      }
    }
    for (const side of [BLACK, WHITE]) {
      for (const type of TYPES) {
        const value = game.hands[side][type] * VALUE[type] * .92;
        score += side === aiSide ? value : -value;
      }
    }
    if (inCheck(game, -aiSide)) score += 85;
    if (inCheck(game, aiSide)) score -= 110;
    return score;
  }

  function scoredMoves(game, side) {
    return legalMoves(game, side).map((move) => {
      const copy = cloneGame(game);
      const target = copy.board[move.to.r][move.to.c];
      applyMove(copy, move);
      let tactical = evaluate(copy, side);
      if (target) tactical += VALUE[target.type] * .7;
      if (move.promote) tactical += 100;
      if (inCheck(copy, -side)) tactical += 130;
      return { move, score: tactical };
    }).sort((a, b) => b.score - a.score);
  }

  function chooseComputerMove() {
    const aiSide = state.game.turn;
    const ranked = scoredMoves(state.game, aiSide);
    if (state.difficulty === "easy") {
      const pool = ranked.slice(0, Math.min(12, ranked.length));
      return pool[Math.floor(Math.random() * pool.length)]?.move;
    }
    if (state.difficulty === "medium") {
      const pool = ranked.slice(0, Math.min(3, ranked.length));
      const weighted = Math.random() < .72 ? 0 : Math.floor(Math.random() * pool.length);
      return pool[weighted]?.move;
    }
    let bestMove = ranked[0]?.move;
    let bestScore = -Infinity;
    for (const candidate of ranked.slice(0, 32)) {
      const copy = cloneGame(state.game);
      applyMove(copy, candidate.move);
      const responses = scoredMoves(copy, -aiSide).slice(0, 24);
      let worst = evaluate(copy, aiSide);
      if (responses.length) {
        worst = Infinity;
        for (const response of responses) {
          const reply = cloneGame(copy);
          applyMove(reply, response.move);
          worst = Math.min(worst, evaluate(reply, aiSide));
        }
      } else if (inCheck(copy, -aiSide)) {
        worst = 100000;
      }
      worst += Math.random() * 3;
      if (worst > bestScore) {
        bestScore = worst;
        bestMove = candidate.move;
      }
    }
    return bestMove;
  }

  function requestComputerMove() {
    if (state.mode !== "ai" || state.game.turn === state.humanSide || state.over) return;
    state.thinking = true;
    const token = state.token;
    render();
    setTimeout(() => {
      if (token !== state.token || state.over || state.mode !== "ai" || state.game.turn === state.humanSide) return;
      const move = chooseComputerMove();
      state.thinking = false;
      if (move) commitMove(move);
    }, state.difficulty === "hard" ? 520 : 350);
  }

  function newGame() {
    state.token += 1;
    state.game = newPosition();
    state.selected = null;
    state.legalTargets = [];
    state.history = [];
    state.snapshots = [];
    state.over = false;
    state.thinking = false;
    state.pendingPromotion = null;
    if (promotionDialog.open) promotionDialog.close();
    if (resultDialog.open) resultDialog.close();
    render();
    requestComputerMove();
  }

  function undo() {
    if (!state.snapshots.length || state.thinking || state.pendingPromotion) return;
    state.token += 1;
    let count = 1;
    if (state.mode === "ai" && state.snapshots.length >= 2 && state.game.turn === state.humanSide) count = 2;
    while (count > 0 && state.snapshots.length) {
      state.game = state.snapshots.pop();
      state.history.pop();
      count -= 1;
    }
    state.over = false;
    state.selected = null;
    state.legalTargets = [];
    if (resultDialog.open) resultDialog.close();
    render();
    requestComputerMove();
  }

  boardEl.addEventListener("click", (event) => {
    const square = event.target.closest(".square");
    if (square) selectBoardSquare(Number(square.dataset.r), Number(square.dataset.c));
  });
  [blackHandEl, whiteHandEl].forEach((container) => {
    container.addEventListener("click", (event) => {
      const button = event.target.closest(".hand-piece");
      if (button) selectHand(button.dataset.type, Number(button.dataset.side));
    });
  });
  document.getElementById("btn-promote").addEventListener("click", () => {
    const move = state.pendingPromotion?.find((choice) => choice.promote);
    promotionDialog.close();
    if (move) commitMove(move);
  });
  document.getElementById("btn-no-promote").addEventListener("click", () => {
    const move = state.pendingPromotion?.find((choice) => !choice.promote);
    promotionDialog.close();
    if (move) commitMove(move);
  });
  promotionDialog.addEventListener("cancel", (event) => event.preventDefault());

  document.getElementById("mode-select").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-mode]");
    if (!button || button.dataset.mode === state.mode) return;
    state.mode = button.dataset.mode;
    document.querySelectorAll("#mode-select button").forEach((item) => item.classList.toggle("active", item === button));
    document.getElementById("difficulty-section").hidden = state.mode === "local";
    document.getElementById("side-section").hidden = state.mode === "local";
    newGame();
  });
  document.getElementById("difficulty-select").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-level]");
    if (!button || button.dataset.level === state.difficulty) return;
    state.difficulty = button.dataset.level;
    document.querySelectorAll("#difficulty-select button").forEach((item) => item.classList.toggle("active", item === button));
    document.getElementById("difficulty-hint").textContent = DIFFICULTY_HINT[state.difficulty];
    newGame();
  });
  document.getElementById("side-select").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-side]");
    if (!button) return;
    const side = button.dataset.side === "black" ? BLACK : WHITE;
    if (side === state.humanSide) return;
    state.humanSide = side;
    document.querySelectorAll("#side-select button").forEach((item) => item.classList.toggle("active", item === button));
    newGame();
  });
  document.getElementById("btn-new").addEventListener("click", newGame);
  document.getElementById("btn-again").addEventListener("click", newGame);
  document.getElementById("btn-close").addEventListener("click", () => resultDialog.close());
  undoButton.addEventListener("click", undo);

  render();
})();
