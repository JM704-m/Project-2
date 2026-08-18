// ==================== Audio & Asset Variables ====================
let charImg;
let sound1, sound2;
let isSound1Playing = false;
let sound2Triggered = false;

// ==================== Game State & Timing ====================
const TOTAL_GAME_TIME = 120; // Total 120 seconds countdown
let remainingTime = TOTAL_GAME_TIME;
let timerStartMillis = 0;
let gameState = "START"; // "START", "PLAYING", "GAMEOVER"

let score = 0;
let carriedBubbles = 0;
const MAX_CARRY = 2; // Maximum 2 oxygen bubbles per trip

// ==================== Map Dimensions & Waypoints ====================
const CANVAS_W = 900;
const CANVAS_H = 560;

// Depot (Left) and Destination (Right) parameters
const DEPOT = { x: 110, y: 280, radius: 70 };
const DEST = { x: 790, y: 280, radius: 70 };
const CORRIDOR_RADIUS = 30; // Half width of the vessel corridor (60px total width)

// Fixed snake-like route: Depot -> UP -> DOWN -> UP -> DOWN -> Destination
const TRACK_WAYPOINTS = [
  { x: 110, y: 280 }, // Depot Center
  { x: 180, y: 280 }, // Depot Exit
  { x: 180, y: 130 }, // 1. Go UP
  { x: 340, y: 130 }, // Corner 1
  { x: 340, y: 430 }, // 2. Go DOWN
  { x: 490, y: 430 }, // Corner 2
  { x: 490, y: 130 }, // 3. Go UP
  { x: 640, y: 130 }, // Corner 3
  { x: 640, y: 430 }, // 4. Go DOWN
  { x: 720, y: 430 }, // Corner 4
  { x: 720, y: 280 }, // Turn to Destination Entrance
  { x: 790, y: 280 }  // Destination Center
];

// ==================== Entities & Effects ====================
let player;
let oxygenBubbles = [];
let ambientParticles = [];
let floatingTexts = [];
let lastSpawnInterval = 0;

// Background beating heart
let heartScale = 1.0;
let heartBpm = 75;

// ==================== Preload Assets ====================
function preload() {
  // Load red blood cell character image
  charImg = loadImage(
    'assets/Character.png',
    () => console.log("Character loaded successfully"),
    (err) => console.warn("Character image fallback active", err)
  );

  // Initialize background audio tracks
  sound1 = new Audio('assets/sound1.mp3');
  sound1.loop = true;
  sound1.volume = 0.7;

  sound2 = new Audio('assets/sound2.mp3');
  sound2.loop = false;  // Play only once, no loop
  sound2.volume = 0.35; // Lower volume for sound2
}

// ==================== Setup ====================
function setup() {
  let canvas = createCanvas(CANVAS_W, CANVAS_H);
  canvas.parent('game-container');
  textAlign(CENTER, CENTER);
  angleMode(DEGREES);

  resetGame();

  // Create ambient blood stream particles
  for (let i = 0; i < 35; i++) {
    ambientParticles.push({
      x: random(width),
      y: random(90, height - 90),
      radius: random(2, 5),
      speed: random(0.5, 1.6),
      alpha: random(30, 80)
    });
  }
}

// Reset all game data to initial state
function resetGame() {
  score = 0;
  carriedBubbles = 0;
  remainingTime = TOTAL_GAME_TIME;
  sound2Triggered = false;
  floatingTexts = [];
  lastSpawnInterval = 0;

  // Reset player position to depot center
  player = {
    x: DEPOT.x,
    y: DEPOT.y,
    speed: 3.8,
    size: 40,
    facingRight: true
  };

  // Generate 10 initial oxygen bubbles in Depot
  oxygenBubbles = [];
  for (let i = 0; i < 10; i++) {
    spawnBubbleInDepot();
  }
}

// Spawn a single oxygen bubble inside Depot radius
function spawnBubbleInDepot() {
  let angle = random(360);
  let r = random(12, DEPOT.radius - 20);
  oxygenBubbles.push({
    x: DEPOT.x + cos(angle) * r,
    y: DEPOT.y + sin(angle) * r,
    size: random(16, 22),
    seed: random(100),
    collected: false
  });
}

// ==================== Audio Lifecycle Management ====================
function startAudioPlayback() {
  stopAllAudio();
  sound1.currentTime = 0;
  sound1.play().catch(e => console.log("Audio playback error:", e));
  isSound1Playing = true;
}

function stopAllAudio() {
  if (sound1) {
    sound1.pause();
    sound1.currentTime = 0;
  }
  if (sound2) {
    sound2.pause();
    sound2.currentTime = 0;
  }
  isSound1Playing = false;
  sound2Triggered = false;
}

function updateAudioState() {
  // At remaining 26 seconds, stop sound1 and play sound2 once
  if (remainingTime <= 26 && !sound2Triggered) {
    sound2Triggered = true;
    if (isSound1Playing) {
      sound1.pause();
      sound1.currentTime = 0;
      isSound1Playing = false;
    }
    sound2.currentTime = 0;
    sound2.play().catch(e => console.log(e));
  }
}

// ==================== Main Draw Loop ====================
function draw() {
  background(12, 4, 6);

  // 1. Draw Start Screen if not playing
  if (gameState === "START") {
    drawStartScreen();
    return;
  }

  // 2. Draw Game Over Screen if time runs out
  if (gameState === "GAMEOVER") {
    // Render static game background under overlay
    drawBackgroundHeart();
    drawPipeMap();
    drawOxygenBubbles();
    drawPlayer();
    drawMinimalHUD();
    drawGameOverScreen();
    return; // Complete lock: no movement or updates allowed during GAMEOVER
  }

  // 3. Update active gameplay timer
  let elapsedSeconds = (millis() - timerStartMillis) / 1000;
  remainingTime = max(0, TOTAL_GAME_TIME - elapsedSeconds);

  // Update audio transition logic
  updateAudioState();

  // Draw background visuals
  drawBackgroundHeart();
  drawAmbientBlood();

  // Draw pipe layout (Depot -> UP -> DOWN -> UP -> DOWN -> Destination)
  drawPipeMap();

  // Manage oxygen bubble spawning (every 2s in first 30s, then stop)
  manageOxygenSpawning(elapsedSeconds);
  drawOxygenBubbles();

  // Handle player controls and rendering
  handlePlayerMovement();
  drawPlayer();

  // Draw floating score text animations
  drawFloatingTexts();

  // Draw minimal English HUD (Score & Time)
  drawMinimalHUD();

  // Check game over condition
  if (remainingTime <= 0) {
    gameState = "GAMEOVER";
    stopAllAudio(); // Cut off all sounds completely when game ends
  }
}

// ==================== Path Collision Geometry ====================
// Calculate shortest distance from a point to a line segment
function distToSegment(px, py, x1, y1, x2, y2) {
  let dx = x2 - x1;
  let dy = y2 - y1;
  if (dx === 0 && dy === 0) return dist(px, py, x1, y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy);
  t = constrain(t, 0, 1);
  let nearestX = x1 + t * dx;
  let nearestY = y1 + t * dy;
  return dist(px, py, nearestX, nearestY);
}

// Check if position is inside the walkable track corridor
function isInsideWalkableArea(px, py) {
  // Inside Depot circle
  if (dist(px, py, DEPOT.x, DEPOT.y) <= DEPOT.radius - 6) return true;

  // Inside Destination circle
  if (dist(px, py, DEST.x, DEST.y) <= DEST.radius - 6) return true;

  // Inside path corridor segments
  for (let i = 0; i < TRACK_WAYPOINTS.length - 1; i++) {
    let p1 = TRACK_WAYPOINTS[i];
    let p2 = TRACK_WAYPOINTS[i + 1];
    if (distToSegment(px, py, p1.x, p1.y, p2.x, p2.y) <= CORRIDOR_RADIUS) {
      return true;
    }
  }
  return false;
}

// ==================== Render Pipe Map ====================
function drawPipeMap() {
  push();

  // 1. Draw vessel track path
  noFill();
  strokeJoin(ROUND);
  strokeCap(ROUND);

  // Outer vessel glow
  stroke(140, 20, 35, 90);
  strokeWeight(CORRIDOR_RADIUS * 2 + 10);
  beginShape();
  for (let pt of TRACK_WAYPOINTS) vertex(pt.x, pt.y);
  endShape();

  // Inner corridor lane
  stroke(40, 10, 18, 240);
  strokeWeight(CORRIDOR_RADIUS * 2 - 2);
  beginShape();
  for (let pt of TRACK_WAYPOINTS) vertex(pt.x, pt.y);
  endShape();

  // Central stream flow guide
  stroke(255, 75, 100, 75);
  strokeWeight(2);
  beginShape();
  for (let pt of TRACK_WAYPOINTS) vertex(pt.x, pt.y);
  endShape();

  // 2. Left OXYGEN DEPOT
  fill(35, 10, 18, 235);
  stroke(255, 75, 95, 160);
  strokeWeight(3);
  circle(DEPOT.x, DEPOT.y, DEPOT.radius * 2);

  fill(255, 80, 105, 30);
  noStroke();
  circle(DEPOT.x, DEPOT.y, DEPOT.radius * 1.7);

  fill(255, 140, 155);
  textSize(11);
  textStyle(BOLD);
  text("OXYGEN DEPOT", DEPOT.x, DEPOT.y - DEPOT.radius + 16);

  // 3. Right DESTINATION
  fill(35, 10, 18, 235);
  stroke(60, 210, 255, 160);
  strokeWeight(3);
  circle(DEST.x, DEST.y, DEST.radius * 2);

  fill(60, 210, 255, 30);
  noStroke();
  circle(DEST.x, DEST.y, DEST.radius * 1.7);

  fill(100, 230, 255);
  textSize(11);
  textStyle(BOLD);
  text("DESTINATION", DEST.x, DEST.y - DEST.radius + 16);

  // Destination target icon
  let pulse = sin(frameCount * 4) * 4;
  stroke(60, 210, 255, 150);
  strokeWeight(1.5);
  noFill();
  circle(DEST.x, DEST.y, 40 + pulse);
  fill(100, 240, 255);
  noStroke();
  textSize(16);
  text("🎯", DEST.x, DEST.y);

  pop();
}

// ==================== Oxygen Mechanics ====================
function manageOxygenSpawning(elapsedSec) {
  // Spawn 1 bubble every 2s for first 30 seconds; stop completely after 30s
  if (elapsedSec <= 30) {
    let currentInterval = floor(elapsedSec / 2);
    if (currentInterval > lastSpawnInterval) {
      lastSpawnInterval = currentInterval;
      spawnBubbleInDepot();
    }
  }

  // Delivery check at Destination
  if (dist(player.x, player.y, DEST.x, DEST.y) < DEST.radius - 12 && carriedBubbles > 0) {
    let gained = carriedBubbles * 100;
    score += gained;
    floatingTexts.push({
      x: player.x,
      y: player.y - 20,
      text: "+" + gained,
      alpha: 255
    });
    carriedBubbles = 0; // Bubbles disappear on successful delivery
  }
}

function drawOxygenBubbles() {
  push();
  for (let i = 0; i < oxygenBubbles.length; i++) {
    let b = oxygenBubbles[i];
    if (b.collected) continue;

    let floatOffset = sin(frameCount * 3 + b.seed) * 3;
    let bx = b.x;
    let by = b.y + floatOffset;

    // White oxygen bubble appearance
    fill(255, 255, 255, 220);
    stroke(190, 235, 255, 200);
    strokeWeight(1.5);
    circle(bx, by, b.size);

    // Specular highlight
    fill(255);
    noStroke();
    circle(bx - b.size * 0.25, by - b.size * 0.25, b.size * 0.3);

    // Pickup prompt (only when playing)
    let d = dist(player.x, player.y, bx, by);
    if (gameState === "PLAYING" && d < 36 && carriedBubbles < MAX_CARRY) {
      fill(255, 235, 80);
      textSize(10.5);
      textStyle(BOLD);
      text("PRESS [E]", bx, by - 15);
    }
  }
  pop();
}

function keyPressed() {
  // STRICT CONTROL LOCK: Ignore key presses if game is not active
  if (gameState !== "PLAYING") return;

  // Press E to pick up oxygen bubbles (Max 2 per trip)
  if (key === 'e' || key === 'E') {
    if (carriedBubbles < MAX_CARRY) {
      for (let i = 0; i < oxygenBubbles.length; i++) {
        let b = oxygenBubbles[i];
        if (!b.collected) {
          let d = dist(player.x, player.y, b.x, b.y);
          if (d < 45) {
            b.collected = true;
            carriedBubbles++;
            break;
          }
        }
      }
    }
  }
}

// ==================== Player Movement & Rendering ====================
function handlePlayerMovement() {
  // STRICT CONTROL LOCK: Ignore movement inputs if game is not active
  if (gameState !== "PLAYING") return;

  let dx = 0;
  let dy = 0;

  if (keyIsDown(87) || keyIsDown(UP_ARROW)) dy -= player.speed;
  if (keyIsDown(83) || keyIsDown(DOWN_ARROW)) dy += player.speed;
  if (keyIsDown(65) || keyIsDown(LEFT_ARROW)) {
    dx -= player.speed;
    player.facingRight = false;
  }
  if (keyIsDown(68) || keyIsDown(RIGHT_ARROW)) {
    dx += player.speed;
    player.facingRight = true;
  }

  // Strict collision checking with sliding along walls
  let nextX = player.x + dx;
  let nextY = player.y + dy;

  if (isInsideWalkableArea(nextX, nextY)) {
    player.x = nextX;
    player.y = nextY;
  } else if (isInsideWalkableArea(nextX, player.y)) {
    player.x = nextX;
  } else if (isInsideWalkableArea(player.x, nextY)) {
    player.y = nextY;
  }
}

function drawPlayer() {
  push();
  translate(player.x, player.y);

  // Render orbiting bubbles currently carried (Max 2)
  for (let i = 0; i < carriedBubbles; i++) {
    let angle = frameCount * 4 + i * 180;
    let ox = cos(angle) * 24;
    let oy = sin(angle) * 15;
    fill(255, 255, 255, 230);
    stroke(160, 230, 255);
    strokeWeight(1.5);
    circle(ox, oy, 15);
    fill(255);
    noStroke();
    circle(ox - 3, oy - 3, 4);
  }

  // Draw character sprite with directional flipping
  if (!player.facingRight) scale(-1, 1);

  if (charImg && charImg.width > 0) {
    imageMode(CENTER);
    image(charImg, 0, 0, player.size, player.size);
  } else {
    // Procedural fallback character rendering
    fill(235, 60, 75);
    stroke(170, 25, 40);
    strokeWeight(2);
    ellipse(0, 0, player.size, player.size * 0.86);
    fill(190, 30, 50);
    noStroke();
    ellipse(0, 0, player.size * 0.44, player.size * 0.32);
  }
  pop();
}

// ==================== Floating Score Animation ====================
function drawFloatingTexts() {
  push();
  for (let i = floatingTexts.length - 1; i >= 0; i--) {
    let ft = floatingTexts[i];
    fill(100, 255, 180, ft.alpha);
    noStroke();
    textSize(16);
    textStyle(BOLD);
    text(ft.text, ft.x, ft.y);
    ft.y -= 1.2;
    ft.alpha -= 6;
    if (ft.alpha <= 0) floatingTexts.splice(i, 1);
  }
  pop();
}

// ==================== Minimalist HUD ====================
function drawMinimalHUD() {
  push();

  // Top-Left: SCORE
  textAlign(LEFT, TOP);
  fill(255);
  noStroke();
  textSize(22);
  textStyle(BOLD);
  text("SCORE: " + score, 28, 24);

  // Top-Right: TIME (120s -> 0s)
  textAlign(RIGHT, TOP);
  if (remainingTime <= 26) {
    fill(255, 65, 75); // Warning Red
  } else {
    fill(255);
  }
  textSize(22);
  textStyle(BOLD);
  text("TIME: " + ceil(remainingTime) + "s", width - 28, 24);

  pop();
}

// ==================== Background Beating Heart ====================
function drawBackgroundHeart() {
  push();
  translate(width / 2, height / 2);

  if (remainingTime > 26) {
    heartBpm = map(remainingTime, 120, 26, 75, 30);
    let beatVal = (frameCount * (heartBpm / 60) * 6) % 360;
    heartScale = 1.0 + 0.11 * sin(beatVal) * exp(-((beatVal % 180) / 50));
  } else {
    heartScale = 1.0;
  }

  scale(heartScale);
  noStroke();
  fill(120, 15, 25, 40);

  beginShape();
  for (let a = 0; a < 360; a += 6) {
    let x = 16 * pow(sin(a), 3);
    let y = -(13 * cos(a) - 5 * cos(2 * a) - 2 * cos(3 * a) - cos(4 * a));
    vertex(x * 8.5, y * 8.5);
  }
  endShape(CLOSE);
  pop();
}

function drawAmbientBlood() {
  push();
  noStroke();
  for (let p of ambientParticles) {
    fill(220, 40, 60, p.alpha);
    circle(p.x, p.y, p.radius);
    p.x += p.speed;
    if (p.x > width) p.x = 0;
  }
  pop();
}

// ==================== UI Screens & Mouse Input ====================
function drawStartScreen() {
  push();
  // Centered START GAME Button
  let btnW = 200;
  let btnH = 54;
  let btnX = width / 2 - btnW / 2;
  let btnY = height / 2 - btnH / 2;

  let isHover = mouseX > btnX && mouseX < btnX + btnW && mouseY > btnY && mouseY < btnY + btnH;

  fill(isHover ? color(255, 60, 85) : color(190, 25, 45));
  stroke(255, 120, 140);
  strokeWeight(2);
  rect(btnX, btnY, btnW, btnH, 10);

  fill(255);
  noStroke();
  textSize(20);
  textStyle(BOLD);
  text("START GAME", width / 2, height / 2);
  pop();
}

function drawGameOverScreen() {
  push();
  fill(8, 2, 4, 230);
  rect(0, 0, width, height);

  textAlign(CENTER, CENTER);
  fill(255, 65, 75);
  textSize(34);
  textStyle(BOLD);
  text("GAME OVER", width / 2, height / 2 - 60);

  fill(240);
  textSize(20);
  textStyle(NORMAL);
  text("FINAL SCORE: " + score, width / 2, height / 2 - 10);

  // Centered PLAY AGAIN Button
  let btnW = 180;
  let btnH = 46;
  let btnX = width / 2 - btnW / 2;
  let btnY = height / 2 + 50;
  let isHover = mouseX > btnX && mouseX < btnX + btnW && mouseY > btnY && mouseY < btnY + btnH;

  fill(isHover ? color(255, 60, 85) : color(180, 25, 45));
  stroke(255, 120, 140);
  strokeWeight(1.5);
  rect(btnX, btnY, btnW, btnH, 8);

  fill(255);
  noStroke();
  textSize(16);
  textStyle(BOLD);
  text("PLAY AGAIN", width / 2, height / 2 + 73);
  pop();
}

function mousePressed() {
  if (gameState === "START") {
    let btnW = 200;
    let btnH = 54;
    let btnX = width / 2 - btnW / 2;
    let btnY = height / 2 - btnH / 2;

    if (mouseX > btnX && mouseX < btnX + btnW && mouseY > btnY && mouseY < btnY + btnH) {
      gameState = "PLAYING";
      timerStartMillis = millis();
      startAudioPlayback();
    }
  } else if (gameState === "GAMEOVER") {
    let btnW = 180;
    let btnH = 46;
    let btnX = width / 2 - btnW / 2;
    let btnY = height / 2 + 50;

    if (mouseX > btnX && mouseX < btnX + btnW && mouseY > btnY && mouseY < btnY + btnH) {
      resetGame();
      gameState = "PLAYING";
      timerStartMillis = millis();
      startAudioPlayback();
    }
  }
}