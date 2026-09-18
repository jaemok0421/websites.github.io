(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const message = document.getElementById("message");
  const actionBtn = document.getElementById("action-btn");
  const pauseBtn = document.getElementById("pause-btn");
  const soundBtn = document.getElementById("sound-btn");
  const floorEl = document.getElementById("floor");
  const healthEl = document.getElementById("health");
  const bestEl = document.getElementById("best");
  const statusEl = document.getElementById("status");

  const WIDTH = 560;
  const HEIGHT = 720;
  const SPIKE_HEIGHT = 34;
  const PLAYER_SIZE = 30;
  const STORAGE_KEY = "down100-best";

  const state = {
    phase: "ready",
    floor: 1,
    health: 3,
    best: Math.max(1, Number(localStorage.getItem(STORAGE_KEY)) || 1),
    sound: true,
    keys: { left: false, right: false },
    platforms: [],
    nextFloor: 1,
    standingOn: null,
    lastTime: 0,
    invulnerable: 0,
  };

  const player = {
    x: WIDTH / 2 - PLAYER_SIZE / 2,
    y: 194,
    width: PLAYER_SIZE,
    height: 34,
    vx: 0,
    vy: 0,
  };

  function updateHud() {
    floorEl.textContent = String(state.floor).padStart(3, "0");
    healthEl.textContent = Array.from({ length: state.health }, () => "♥").join(" ");
    bestEl.textContent = String(state.best).padStart(3, "0");
  }

  function showMessage(eyebrow, title, copy, action) {
    document.getElementById("message-eyebrow").textContent = eyebrow;
    document.getElementById("message-title").textContent = title;
    document.getElementById("message-copy").textContent = copy;
    actionBtn.textContent = action;
    message.classList.add("show");
  }

  function beep(frequency, duration = 55) {
    if (!state.sound) return;
    try {
      const audio = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = "square";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.035, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + duration / 1000);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start();
      oscillator.stop(audio.currentTime + duration / 1000);
      oscillator.addEventListener("ended", () => audio.close());
    } catch {
      // 音频不可用时继续游戏。
    }
  }

  function platformType(floor) {
    const roll = Math.random();
    if (floor > 8 && roll < 0.13) return "fragile";
    if (floor > 14 && roll < 0.24) return "moving";
    if (floor > 20 && roll < 0.3) return "spring";
    return "normal";
  }

  function addPlatform(y, floor, x) {
    const width = floor === 0 ? 150 : Math.max(82, 132 - Math.floor(floor / 12) * 4);
    state.platforms.push({
      x: x ?? 34 + Math.random() * (WIDTH - width - 68),
      y,
      width,
      height: 14,
      floor,
      type: floor === 0 ? "normal" : platformType(floor),
      direction: Math.random() > 0.5 ? 1 : -1,
      breakTimer: 0,
      broken: false,
    });
  }

  function buildScene(fromFloor = 0) {
    state.platforms = [];
    const startX = WIDTH / 2 - 75;
    addPlatform(240, fromFloor, startX);
    let y = 380;
    let previousX = startX;
    state.nextFloor = fromFloor + 1;
    while (y < HEIGHT + 130) {
      const width = Math.max(82, 132 - Math.floor(state.nextFloor / 12) * 4);
      const minX = Math.max(28, previousX - 190);
      const maxX = Math.min(WIDTH - width - 28, previousX + 190);
      const x = minX + Math.random() * Math.max(1, maxX - minX);
      addPlatform(y, state.nextFloor, x);
      previousX = x;
      state.nextFloor += 1;
      y += 112 + Math.random() * 22;
    }
    player.x = startX + 60;
    player.y = 240 - player.height;
    player.vx = 0;
    player.vy = 0;
    state.standingOn = state.platforms[0];
  }

  function saveBest() {
    if (state.floor <= state.best) return;
    state.best = state.floor;
    localStorage.setItem(STORAGE_KEY, String(state.best));
  }

  function startGame() {
    if (state.phase === "over" || state.phase === "won") {
      state.floor = 1;
      state.health = 3;
      buildScene(0);
    }
    state.phase = "running";
    state.lastTime = performance.now();
    message.classList.remove("show");
    pauseBtn.textContent = "暂停";
    statusEl.textContent = "向左右移动，寻找下一块平台";
    updateHud();
  }

  function togglePause() {
    if (!["running", "paused"].includes(state.phase)) return;
    if (state.phase === "running") {
      state.phase = "paused";
      pauseBtn.textContent = "继续";
      showMessage("游戏暂停", "喘口气吧", "平台不会趁你休息时移动。", "继续挑战");
    } else {
      state.phase = "running";
      state.lastTime = performance.now();
      pauseBtn.textContent = "暂停";
      message.classList.remove("show");
    }
  }

  function loseLife(reason) {
    if (state.phase !== "running") return;
    state.health -= 1;
    state.standingOn = null;
    beep(110, 200);
    updateHud();
    if (state.health <= 0) {
      state.phase = "over";
      saveBest();
      updateHud();
      showMessage("挑战结束", "还差一点！", `本次抵达第 ${state.floor} 层，最高纪录为第 ${state.best} 层。`, "重新挑战");
      statusEl.textContent = reason;
      return;
    }
    state.phase = "ready";
    buildScene(Math.max(0, state.floor - 1));
    showMessage("损失一颗心", `还剩 ${state.health} 次机会`, `${reason}，从第 ${state.floor} 层附近继续。`, "继续挑战");
    statusEl.textContent = reason;
  }

  function land(platform) {
    player.y = platform.y - player.height;
    player.vy = 0;
    state.standingOn = platform;
    if (platform.floor > state.floor) {
      state.floor = platform.floor;
      saveBest();
      updateHud();
      beep(platform.type === "spring" ? 650 : 390);
    }
    if (state.floor >= 100) {
      state.phase = "won";
      saveBest();
      showMessage("第一百层", "挑战成功！", "你穿过了全部平台，成功抵达第一百层。", "再玩一次");
      statusEl.textContent = "百层挑战完成！";
      beep(880, 260);
      return;
    }
    if (platform.type === "fragile") platform.breakTimer = 0.42;
    if (platform.type === "spring") {
      state.standingOn = null;
      player.vy = 390;
      player.y += 5;
    }
  }

  function spawnPlatforms() {
    let lowest = state.platforms.reduce((max, item) => Math.max(max, item.y), 0);
    let previous = state.platforms.reduce((best, item) => item.y > best.y ? item : best, state.platforms[0]);
    while (lowest < HEIGHT + 150) {
      lowest += 112 + Math.random() * 22;
      const width = Math.max(82, 132 - Math.floor(state.nextFloor / 12) * 4);
      const minX = Math.max(28, previous.x - 190);
      const maxX = Math.min(WIDTH - width - 28, previous.x + 190);
      const x = minX + Math.random() * Math.max(1, maxX - minX);
      addPlatform(lowest, state.nextFloor, x);
      previous = state.platforms[state.platforms.length - 1];
      state.nextFloor += 1;
    }
  }

  function update(dt) {
    state.invulnerable = Math.max(0, state.invulnerable - dt);
    const scrollSpeed = Math.min(82, 37 + state.floor * 0.42);
    const acceleration = 1900;
    const maxSpeed = 285;

    if (state.keys.left) player.vx -= acceleration * dt;
    if (state.keys.right) player.vx += acceleration * dt;
    if (!state.keys.left && !state.keys.right) player.vx *= Math.pow(0.0008, dt);
    player.vx = Math.max(-maxSpeed, Math.min(maxSpeed, player.vx));
    player.x += player.vx * dt;
    if (player.x < 0) {
      player.x = 0;
      player.vx = 0;
    } else if (player.x + player.width > WIDTH) {
      player.x = WIDTH - player.width;
      player.vx = 0;
    }

    state.platforms.forEach((platform) => {
      platform.y -= scrollSpeed * dt;
      if (platform.type === "moving" && !platform.broken) {
        platform.x += platform.direction * (52 + state.floor * 0.2) * dt;
        if (platform.x < 18 || platform.x + platform.width > WIDTH - 18) {
          platform.direction *= -1;
          platform.x = Math.max(18, Math.min(WIDTH - platform.width - 18, platform.x));
        }
      }
      if (platform.breakTimer > 0) {
        platform.breakTimer -= dt;
        if (platform.breakTimer <= 0) {
          platform.broken = true;
          if (state.standingOn === platform) {
            state.standingOn = null;
            player.vy = 45;
          }
          beep(150, 90);
        }
      }
    });

    if (state.standingOn && !state.standingOn.broken) {
      const platform = state.standingOn;
      const overlaps = player.x + player.width > platform.x && player.x < platform.x + platform.width;
      if (overlaps) {
        player.y = platform.y - player.height;
      } else {
        state.standingOn = null;
        player.vy = 20;
      }
    } else {
      const previousBottom = player.y + player.height;
      player.vy = Math.min(660, player.vy + 1050 * dt);
      player.y += player.vy * dt;
      if (player.vy >= 0) {
        const newBottom = player.y + player.height;
        const target = state.platforms
          .filter((platform) =>
            !platform.broken &&
            previousBottom <= platform.y + 3 &&
            newBottom >= platform.y &&
            player.x + player.width - 4 > platform.x &&
            player.x + 4 < platform.x + platform.width)
          .sort((a, b) => a.y - b.y)[0];
        if (target) land(target);
      }
    }

    state.platforms = state.platforms.filter((platform) => platform.y > -55 && !platform.broken);
    spawnPlatforms();

    if (player.y < SPIKE_HEIGHT && state.invulnerable <= 0) {
      state.invulnerable = 1;
      player.y = SPIKE_HEIGHT + 5;
      player.vy = 250;
      state.standingOn = null;
      loseLife("被顶部尖刺扎到了");
    } else if (player.y > HEIGHT + 30) {
      loseLife("掉出了平台区域");
    }
  }

  function roundRect(x, y, width, height, radius) {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
  }

  function drawBackground() {
    const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    gradient.addColorStop(0, "#13283a");
    gradient.addColorStop(1, "#09141f");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = "rgba(255,255,255,.035)";
    const offset = (performance.now() * 0.012) % 44;
    for (let y = -44 + offset; y < HEIGHT; y += 44) {
      ctx.fillRect(0, y, WIDTH, 1);
    }
    for (let x = 28; x < WIDTH; x += 56) ctx.fillRect(x, 0, 1, HEIGHT);
  }

  function drawSpikes() {
    ctx.fillStyle = "#ff5d73";
    const width = 28;
    for (let x = 0; x < WIDTH; x += width) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + width / 2, SPIKE_HEIGHT);
      ctx.lineTo(x + width, 0);
      ctx.fill();
    }
    ctx.fillStyle = "rgba(255,255,255,.45)";
    ctx.fillRect(0, 0, WIDTH, 4);
  }

  function drawPlatform(platform) {
    if (platform.broken) return;
    const colors = {
      normal: "#54d5a4",
      moving: "#68a7ff",
      fragile: "#ffd166",
      spring: "#d58cff",
    };
    ctx.save();
    if (platform.breakTimer > 0) ctx.globalAlpha = 0.45 + Math.abs(Math.sin(platform.breakTimer * 30)) * 0.5;
    ctx.shadowColor = `${colors[platform.type]}66`;
    ctx.shadowBlur = 10;
    roundRect(platform.x, platform.y, platform.width, platform.height, 5);
    ctx.fillStyle = colors[platform.type];
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,255,255,.34)";
    ctx.fillRect(platform.x + 7, platform.y + 3, platform.width - 14, 2);
    if (platform.type === "fragile") {
      ctx.strokeStyle = "#9f7722";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(platform.x + platform.width * .42, platform.y);
      ctx.lineTo(platform.x + platform.width * .52, platform.y + 7);
      ctx.lineTo(platform.x + platform.width * .46, platform.y + platform.height);
      ctx.stroke();
    } else if (platform.type === "moving") {
      ctx.fillStyle = "rgba(9,20,31,.55)";
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("↔", platform.x + platform.width / 2, platform.y + 11);
    } else if (platform.type === "spring") {
      ctx.fillStyle = "rgba(9,20,31,.45)";
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("↓↓", platform.x + platform.width / 2, platform.y + 11);
    }
    ctx.restore();
  }

  function drawPlayer() {
    if (state.invulnerable > 0 && Math.floor(state.invulnerable * 12) % 2 === 0) return;
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.shadowColor = "rgba(255,255,255,.28)";
    ctx.shadowBlur = 10;
    roundRect(0, 0, player.width, player.height, 8);
    ctx.fillStyle = "#f5f8fa";
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#122131";
    ctx.beginPath();
    ctx.arc(9, 13, 2.2, 0, Math.PI * 2);
    ctx.arc(21, 13, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#54d5a4";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(15, 18, 6, 0.2, Math.PI - 0.2);
    ctx.stroke();
    ctx.fillStyle = "#ff5d73";
    ctx.fillRect(3, player.height - 4, 9, 4);
    ctx.fillRect(18, player.height - 4, 9, 4);
    ctx.restore();
  }

  function draw() {
    drawBackground();
    state.platforms.forEach(drawPlatform);
    drawPlayer();
    drawSpikes();
    ctx.fillStyle = "rgba(255,255,255,.42)";
    ctx.font = "700 12px Consolas, monospace";
    ctx.textAlign = "right";
    ctx.fillText(`FLOOR ${String(state.floor).padStart(3, "0")}`, WIDTH - 14, HEIGHT - 14);
  }

  function loop(time) {
    const dt = Math.min((time - state.lastTime) / 1000 || 0, 0.025);
    state.lastTime = time;
    if (state.phase === "running") update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  function setMove(direction, active) {
    state.keys[direction < 0 ? "left" : "right"] = active;
  }

  document.querySelectorAll("[data-move]").forEach((button) => {
    const direction = Number(button.dataset.move);
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      setMove(direction, true);
    });
    ["pointerup", "pointercancel", "lostpointercapture"].forEach((name) => {
      button.addEventListener(name, () => setMove(direction, false));
    });
  });

  document.addEventListener("keydown", (event) => {
    if (["ArrowLeft", "ArrowRight", " ", "a", "A", "d", "D", "p", "P"].includes(event.key)) event.preventDefault();
    if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") setMove(-1, true);
    if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") setMove(1, true);
    if (event.key === " " && ["ready", "over", "won"].includes(state.phase)) startGame();
    if (event.key.toLowerCase() === "p" || (event.key === " " && state.phase === "paused")) togglePause();
  });

  document.addEventListener("keyup", (event) => {
    if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") setMove(-1, false);
    if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") setMove(1, false);
  });

  actionBtn.addEventListener("click", () => state.phase === "paused" ? togglePause() : startGame());
  pauseBtn.addEventListener("click", togglePause);
  soundBtn.addEventListener("click", () => {
    state.sound = !state.sound;
    soundBtn.textContent = `音效：${state.sound ? "开" : "关"}`;
    soundBtn.setAttribute("aria-pressed", String(state.sound));
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state.phase === "running") togglePause();
  });

  buildScene(0);
  updateHud();
  requestAnimationFrame(loop);
})();
