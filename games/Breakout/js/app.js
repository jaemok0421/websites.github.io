(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const stage = document.getElementById("stage-wrap");
  const message = document.getElementById("message");
  const actionBtn = document.getElementById("action-btn");
  const pauseBtn = document.getElementById("pause-btn");
  const soundBtn = document.getElementById("sound-btn");
  const scoreEl = document.getElementById("score");
  const levelEl = document.getElementById("level");
  const livesEl = document.getElementById("lives");
  const statusEl = document.getElementById("status");
  const activeEffectsEl = document.getElementById("active-effects");

  const WIDTH = 900;
  const HEIGHT = 560;
  const COLORS = ["#ff6b5f", "#ff9f43", "#ffd166", "#4ecdc4", "#5c8dff", "#a78bfa"];
  const POWER_TYPES = {
    expand: { label: "加长挡板", icon: "↔", color: "#5c8dff", duration: 12 },
    slow: { label: "小球减速", icon: "◷", color: "#4ecdc4", duration: 10 },
    shield: { label: "底部护盾", icon: "◇", color: "#ffd166", duration: 12 },
    split: { label: "分裂球", icon: "●●", color: "#ff7eb6", duration: 0 },
  };
  const state = {
    phase: "ready",
    score: 0,
    level: 1,
    lives: 3,
    sound: true,
    keys: { left: false, right: false },
    animationId: 0,
    lastTime: 0,
    bricks: [],
    balls: [],
    drops: [],
    effects: { expand: 0, slow: 0, shield: 0 },
    effectSignature: "",
  };

  const paddle = { x: 360, y: 520, width: 180, height: 16, speed: 560 };

  function createBall(x = 450, y = 495, vx = 0, vy = 0, stuck = true) {
    return { x, y, radius: 9, vx, vy, stuck };
  }

  function updateHud() {
    scoreEl.textContent = String(state.score).padStart(4, "0");
    levelEl.textContent = String(state.level).padStart(2, "0");
    livesEl.textContent = Array.from({ length: state.lives }, () => "●").join(" ");
  }

  function updateEffectHud() {
    const signature = Object.entries(state.effects)
      .filter(([, remaining]) => remaining > 0)
      .map(([type, remaining]) => `${type}:${Math.ceil(remaining)}`)
      .join("|");
    if (signature === state.effectSignature) return;
    state.effectSignature = signature;
    activeEffectsEl.innerHTML = "";
    Object.entries(state.effects).forEach(([type, remaining]) => {
      if (remaining <= 0) return;
      const chip = document.createElement("span");
      chip.className = "effect-chip";
      chip.textContent = `${POWER_TYPES[type].icon} ${POWER_TYPES[type].label} ${Math.ceil(remaining)}s`;
      activeEffectsEl.appendChild(chip);
    });
  }

  function showMessage(eyebrow, title, copy, action) {
    document.getElementById("message-eyebrow").textContent = eyebrow;
    document.getElementById("message-title").textContent = title;
    document.getElementById("message-copy").textContent = copy;
    actionBtn.textContent = action;
    message.classList.add("show");
  }

  function hideMessage() {
    message.classList.remove("show");
  }

  function beep(frequency, duration = 45) {
    if (!state.sound) return;
    try {
      const audio = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.045, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + duration / 1000);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start();
      oscillator.stop(audio.currentTime + duration / 1000);
      oscillator.addEventListener("ended", () => audio.close());
    } catch {
      // 浏览器禁止音频时不影响游戏。
    }
  }

  function buildBricks() {
    const rows = Math.min(4 + state.level, 7);
    const cols = 10;
    const gap = 8;
    const margin = 42;
    const width = (WIDTH - margin * 2 - gap * (cols - 1)) / cols;
    state.bricks = [];
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        state.bricks.push({
          x: margin + col * (width + gap),
          y: 58 + row * 31,
          width,
          height: 21,
          color: COLORS[row % COLORS.length],
          alive: true,
          special: false,
        });
      }
    }
    const choices = state.bricks.map((_, index) => index);
    for (let index = choices.length - 1; index > 0; index -= 1) {
      const random = Math.floor(Math.random() * (index + 1));
      [choices[index], choices[random]] = [choices[random], choices[index]];
    }
    choices.slice(0, Math.min(4 + state.level, 8)).forEach((index) => {
      state.bricks[index].special = true;
    });
    state.drops = [];
  }

  function resetBall() {
    const baseWidth = Math.max(115, 180 - (state.level - 1) * 10);
    paddle.width = baseWidth * (state.effects.expand > 0 ? 1.45 : 1);
    paddle.x = (WIDTH - paddle.width) / 2;
    state.balls = [createBall(paddle.x + paddle.width / 2, paddle.y - 11)];
  }

  function launchBall() {
    if (state.phase !== "running") return;
    const speed = Math.min(510, 340 + state.level * 24);
    state.balls.forEach((ball) => {
      if (!ball.stuck) return;
      ball.vx = speed * (Math.random() > 0.5 ? 0.62 : -0.62);
      ball.vy = -Math.sqrt(speed * speed - ball.vx * ball.vx);
      ball.stuck = false;
    });
    statusEl.textContent = "击碎所有砖块！";
  }

  function startGame() {
    if (state.phase === "over" || state.phase === "won") {
      state.score = 0;
      state.level = 1;
      state.lives = 3;
      state.drops = [];
      state.effects = { expand: 0, slow: 0, shield: 0 };
      buildBricks();
      resetBall();
    }
    state.phase = "running";
    pauseBtn.textContent = "暂停";
    hideMessage();
    updateHud();
    updateEffectHud();
    launchBall();
  }

  function togglePause() {
    if (state.phase === "ready" || state.phase === "over" || state.phase === "won") return;
    if (state.phase === "paused") {
      state.phase = "running";
      pauseBtn.textContent = "暂停";
      hideMessage();
      state.lastTime = performance.now();
    } else {
      state.phase = "paused";
      pauseBtn.textContent = "继续";
      showMessage("游戏暂停", "休息一下", "准备好后继续清除砖块。", "继续游戏");
    }
  }

  function nextLevel() {
    state.level += 1;
    if (state.level > 5) {
      state.phase = "won";
      showMessage("全部通关", "完美收官！", `最终得分 ${state.score}，五个关卡全部完成。`, "再玩一次");
      statusEl.textContent = "恭喜通关！";
      beep(880, 180);
      return;
    }
    buildBricks();
    resetBall();
    state.phase = "ready";
    updateHud();
    showMessage("关卡完成", `进入第 ${state.level} 关`, "砖块更多、球速更快，继续挑战吧。", "开始下一关");
    statusEl.textContent = `第 ${state.level} 关准备就绪`;
  }

  function loseLife() {
    state.lives -= 1;
    updateHud();
    beep(120, 180);
    if (state.lives <= 0) {
      state.phase = "over";
      showMessage("挑战结束", "游戏结束", `本局得分 ${state.score}，再试一次吧。`, "重新开始");
      statusEl.textContent = "游戏结束";
      return;
    }
    resetBall();
    state.phase = "ready";
    showMessage("失去一颗球", `还剩 ${state.lives} 次机会`, "稳住挡板，继续挑战。", "继续游戏");
  }

  function circleHitsRect(ball, rect) {
    const closestX = Math.max(rect.x, Math.min(ball.x, rect.x + rect.width));
    const closestY = Math.max(rect.y, Math.min(ball.y, rect.y + rect.height));
    const dx = ball.x - closestX;
    const dy = ball.y - closestY;
    return dx * dx + dy * dy <= ball.radius * ball.radius;
  }

  function spawnPowerUp(brick) {
    const types = Object.keys(POWER_TYPES);
    const type = types[Math.floor(Math.random() * types.length)];
    state.drops.push({
      type,
      x: brick.x + brick.width / 2,
      y: brick.y + brick.height / 2,
      radius: 14,
      speed: 145,
    });
  }

  function activatePowerUp(type) {
    const power = POWER_TYPES[type];
    if (type === "split") {
      const added = splitBalls();
      statusEl.textContent = added
        ? `获得${power.label}，场上增加 ${added} 个小球`
        : "小球已达到上限，道具转化为 100 分";
      beep(820, 140);
      return;
    }
    state.effects[type] = power.duration;
    if (type === "expand") {
      const center = paddle.x + paddle.width / 2;
      const baseWidth = Math.max(115, 180 - (state.level - 1) * 10);
      paddle.width = baseWidth * 1.45;
      paddle.x = Math.max(0, Math.min(WIDTH - paddle.width, center - paddle.width / 2));
    }
    statusEl.textContent = `获得${power.label}，持续 ${power.duration} 秒`;
    updateEffectHud();
    beep(760, 120);
  }

  function splitBalls() {
    const source = state.balls.find((ball) => !ball.stuck) || state.balls[0];
    if (!source) return 0;
    const additions = Math.min(2, 5 - state.balls.length);
    if (additions <= 0) {
      state.score += 100;
      updateHud();
      return 0;
    }
    const baseAngle = Math.atan2(source.vy || -1, source.vx || 0);
    const speed = Math.hypot(source.vx, source.vy) || Math.min(510, 340 + state.level * 24);
    const offsets = additions === 1 ? [0.38] : [-0.38, 0.38];
    offsets.forEach((offset) => {
      state.balls.push(createBall(
        source.x,
        source.y,
        Math.cos(baseAngle + offset) * speed,
        Math.sin(baseAngle + offset) * speed,
        false,
      ));
    });
    return additions;
  }

  function updatePowerUps(dt) {
    Object.keys(state.effects).forEach((type) => {
      if (state.effects[type] <= 0) return;
      const previous = state.effects[type];
      state.effects[type] = Math.max(0, previous - dt);
      if (type === "expand" && state.effects[type] === 0) {
        const center = paddle.x + paddle.width / 2;
        paddle.width = Math.max(115, 180 - (state.level - 1) * 10);
        paddle.x = Math.max(0, Math.min(WIDTH - paddle.width, center - paddle.width / 2));
        statusEl.textContent = "加长挡板效果已结束";
      }
    });

    state.drops.forEach((drop) => {
      drop.y += drop.speed * dt;
      if (
        drop.y + drop.radius >= paddle.y &&
        drop.y - drop.radius <= paddle.y + paddle.height &&
        drop.x >= paddle.x &&
        drop.x <= paddle.x + paddle.width
      ) {
        drop.caught = true;
        activatePowerUp(drop.type);
      }
    });
    state.drops = state.drops.filter((drop) => !drop.caught && drop.y - drop.radius < HEIGHT);
    updateEffectHud();
  }

  function update(dt) {
    if (state.keys.left) paddle.x -= paddle.speed * dt;
    if (state.keys.right) paddle.x += paddle.speed * dt;
    paddle.x = Math.max(0, Math.min(WIDTH - paddle.width, paddle.x));

    const ballDt = dt * (state.effects.slow > 0 ? 0.72 : 1);
    updatePowerUps(dt);

    state.balls.forEach((ball) => {
      if (state.phase !== "running") return;
      if (ball.stuck) {
        ball.x = paddle.x + paddle.width / 2;
        return;
      }

      ball.x += ball.vx * ballDt;
      ball.y += ball.vy * ballDt;

      if (ball.x - ball.radius <= 0 && ball.vx < 0) {
        ball.x = ball.radius;
        ball.vx *= -1;
        beep(220);
      } else if (ball.x + ball.radius >= WIDTH && ball.vx > 0) {
        ball.x = WIDTH - ball.radius;
        ball.vx *= -1;
        beep(220);
      }
      if (ball.y - ball.radius <= 0 && ball.vy < 0) {
        ball.y = ball.radius;
        ball.vy *= -1;
        beep(220);
      }
      if (state.effects.shield > 0 && ball.y + ball.radius >= HEIGHT - 5 && ball.vy > 0) {
        ball.y = HEIGHT - ball.radius - 5;
        ball.vy = -Math.abs(ball.vy);
        beep(640, 90);
      } else if (ball.y - ball.radius > HEIGHT) {
        ball.lost = true;
        return;
      }

      if (ball.vy > 0 && circleHitsRect(ball, paddle)) {
        const relative = (ball.x - (paddle.x + paddle.width / 2)) / (paddle.width / 2);
        const speed = Math.hypot(ball.vx, ball.vy);
        const angle = relative * Math.PI * 0.38;
        ball.vx = speed * Math.sin(angle);
        ball.vy = -Math.abs(speed * Math.cos(angle));
        ball.y = paddle.y - ball.radius - 1;
        beep(330);
      }

      for (const brick of state.bricks) {
        if (!brick.alive || !circleHitsRect(ball, brick)) continue;
        brick.alive = false;
        state.score += 10 * state.level;
        if (brick.special || Math.random() < 0.16) spawnPowerUp(brick);
        updateHud();
        const overlapLeft = ball.x + ball.radius - brick.x;
        const overlapRight = brick.x + brick.width - (ball.x - ball.radius);
        const overlapTop = ball.y + ball.radius - brick.y;
        const overlapBottom = brick.y + brick.height - (ball.y - ball.radius);
        if (Math.min(overlapLeft, overlapRight) < Math.min(overlapTop, overlapBottom)) ball.vx *= -1;
        else ball.vy *= -1;
        beep(480 + state.level * 40);
        if (state.bricks.every((item) => !item.alive)) nextLevel();
        break;
      }
    });

    if (state.phase !== "running") return;
    state.balls = state.balls.filter((ball) => !ball.lost);
    if (state.balls.length === 0) loseLife();
  }

  function roundedRect(x, y, width, height, radius) {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
  }

  function draw() {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    gradient.addColorStop(0, "#15263d");
    gradient.addColorStop(1, "#0b1421");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.fillStyle = "rgba(255,255,255,.025)";
    for (let x = 25; x < WIDTH; x += 50) {
      for (let y = 25; y < HEIGHT; y += 50) {
        ctx.fillRect(x, y, 2, 2);
      }
    }

    state.bricks.forEach((brick) => {
      if (!brick.alive) return;
      ctx.shadowColor = `${brick.color}55`;
      ctx.shadowBlur = 9;
      roundedRect(brick.x, brick.y, brick.width, brick.height, 5);
      ctx.fillStyle = brick.color;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(255,255,255,.25)";
      roundedRect(brick.x + 4, brick.y + 3, brick.width - 8, 3, 2);
      ctx.fill();
      if (brick.special) {
        ctx.fillStyle = "#fff";
        ctx.font = "bold 13px Segoe UI";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("★", brick.x + brick.width / 2, brick.y + brick.height / 2 + 1);
      }
    });

    state.drops.forEach((drop) => {
      const power = POWER_TYPES[drop.type];
      ctx.beginPath();
      ctx.arc(drop.x, drop.y, drop.radius, 0, Math.PI * 2);
      ctx.fillStyle = power.color;
      ctx.shadowColor = power.color;
      ctx.shadowBlur = 12;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#102036";
      ctx.font = "bold 17px Segoe UI";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(power.icon, drop.x, drop.y + 1);
    });

    if (state.effects.shield > 0) {
      const shield = ctx.createLinearGradient(0, 0, WIDTH, 0);
      shield.addColorStop(0, "rgba(255,209,102,0)");
      shield.addColorStop(.18, "rgba(255,209,102,.85)");
      shield.addColorStop(.82, "rgba(255,209,102,.85)");
      shield.addColorStop(1, "rgba(255,209,102,0)");
      ctx.fillStyle = shield;
      ctx.shadowColor = "#ffd166";
      ctx.shadowBlur = 12;
      ctx.fillRect(0, HEIGHT - 6, WIDTH, 3);
      ctx.shadowBlur = 0;
    }

    ctx.shadowColor = "rgba(92,141,255,.55)";
    ctx.shadowBlur = 14;
    roundedRect(paddle.x, paddle.y, paddle.width, paddle.height, 8);
    ctx.fillStyle = "#5c8dff";
    ctx.fill();
    ctx.shadowBlur = 0;

    state.balls.forEach((ball) => {
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
      ctx.fillStyle = "#fff";
      ctx.shadowColor = "rgba(255,255,255,.7)";
      ctx.shadowBlur = 12;
      ctx.fill();
    });
    ctx.shadowBlur = 0;
  }

  function loop(time) {
    const dt = Math.min((time - state.lastTime) / 1000 || 0, 0.025);
    state.lastTime = time;
    if (state.phase === "running") update(dt);
    draw();
    state.animationId = requestAnimationFrame(loop);
  }

  function movePaddle(clientX) {
    const rect = canvas.getBoundingClientRect();
    paddle.x = ((clientX - rect.left) / rect.width) * WIDTH - paddle.width / 2;
    paddle.x = Math.max(0, Math.min(WIDTH - paddle.width, paddle.x));
  }

  stage.addEventListener("pointermove", (event) => movePaddle(event.clientX));
  stage.addEventListener("pointerdown", (event) => {
    movePaddle(event.clientX);
    if (state.phase === "running") launchBall();
  });

  document.querySelectorAll("[data-move]").forEach((button) => {
    const direction = Number(button.dataset.move);
    const set = (active) => {
      state.keys[direction < 0 ? "left" : "right"] = active;
    };
    button.addEventListener("pointerdown", () => set(true));
    button.addEventListener("pointerup", () => set(false));
    button.addEventListener("pointercancel", () => set(false));
    button.addEventListener("pointerleave", () => set(false));
  });

  document.addEventListener("keydown", (event) => {
    if (["ArrowLeft", "ArrowRight", " ", "a", "A", "d", "D"].includes(event.key)) event.preventDefault();
    if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") state.keys.left = true;
    if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") state.keys.right = true;
    if (event.key === " ") {
      if (state.phase === "paused") togglePause();
      else if (state.phase === "ready" || state.phase === "over" || state.phase === "won") startGame();
      else launchBall();
    }
    if (event.key.toLowerCase() === "p") togglePause();
  });

  document.addEventListener("keyup", (event) => {
    if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") state.keys.left = false;
    if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") state.keys.right = false;
  });

  actionBtn.addEventListener("click", () => {
    if (state.phase === "paused") togglePause();
    else startGame();
  });
  pauseBtn.addEventListener("click", togglePause);
  soundBtn.addEventListener("click", () => {
    state.sound = !state.sound;
    soundBtn.textContent = `音效：${state.sound ? "开" : "关"}`;
    soundBtn.setAttribute("aria-pressed", String(state.sound));
    soundBtn.setAttribute("aria-label", state.sound ? "关闭音效" : "开启音效");
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state.phase === "running") togglePause();
  });

  buildBricks();
  resetBall();
  updateHud();
  updateEffectHud();
  state.animationId = requestAnimationFrame(loop);
})();
