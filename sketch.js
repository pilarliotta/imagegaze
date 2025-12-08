// GAZE RECEIPT — Single Image Art Piece
// Thermal Printer Style with Blink Detection
// Pilar Liotta

let W = 450, H = 675;

// THEME COLORS
const BG_COLOR = 255;
const ACCENT_COLOR = [0, 0, 0];
const RECEIPT_BG = [250, 250, 245];
const RECEIPT_BORDER = [0, 0, 0, 30];
const TEXT_COLOR = [20, 20, 20];
const HIGHLIGHT_COLOR = [0, 180, 0];
const ERROR_COLOR = [220, 40, 40];
const FONT_MAIN = 'Courier New';
const FONT_SIZE_MAIN = 15;
const FONT_SIZE_SMALL = 11;
const FONT_SIZE_TINY = 9;
let mode = "attract";
let pic;  // Single image

// camera + facemesh
let video, mesh, faces = [], cam;

// session data
let viewStartTime = 0;
let viewDuration = 0;
let headTravel = 0;
let faceSpan = 0;

let lastHead = null;
let lastEyeSpan = null;

// visibility
const SHOW_LIVE_HEAT = false;
const SHOW_RETICLE   = true;

// heat + gaze capture
const HEAT_DOT_SIZE  = 16;
const HEAT_DOT_ALPHA = 26;
let heat;
let gazePath = [];

let shake = 0.5;
let bootT = 0;

// gaze tracking
let gazeS = null;
const STAMP_COOLDOWN_MS = 55;
let lastStampT = 0;

// BLINK DETECTION
let blinkTimes = [];
let blinkCount = 0;
const BLINK_THRESHOLD = 0.18;
const BLINK_SMOOTH = 0.3;
let eyeOpenL = 1.0;
let eyeOpenR = 1.0;
let wasBlinking = false;

// calibration
let calibState = {
  done: false,
  samples: 0,
  maxSamples: 60,
  sumX: 0,
  sumY: 0,
  offsetX: 0,
  offsetY: 0
};

const GAIN_X = 2.0;
const GAIN_Y = 1.6;

// gaze statistics
let gazeStats = {
  sumX: 0, sumY: 0, count: 0,
  center: 0, edge: 0,
  left: 0, right: 0,
  upper: 0, lower: 0
};

function preload() {
  pic = loadImage('img1.jpeg', 
    () => {}, 
    () => { pic = null; }
  );
}

function setup() {
  createCanvas(W, H);
  imageMode(CENTER);
  textAlign(LEFT, TOP);
  noCursor();

  if (!pic) {
    pic = createGraphics(W, H);
    pic.background(RECEIPT_BG);
    pic.fill(ACCENT_COLOR);
    pic.textAlign(CENTER, CENTER);
    pic.textSize(FONT_SIZE_MAIN);
  }

  video = createCapture(VIDEO);
  video.size(W, H);
  video.hide();

  mesh = new FaceMesh({
    locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4/${f}`
  });
  mesh.setOptions({
    maxNumFaces: 1,
    refineLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
  });
  mesh.onResults(r => { faces = r.multiFaceLandmarks || []; });

  cam = new Camera(video.elt, {
    onFrame: async () => { await mesh.send({ image: video.elt }); },
    width: W,
    height: H
  });
  cam.start();

  heat = createGraphics(W, H);
  heat.clear();

  bootT = millis();
}

function draw() {
  background(BG_COLOR);
  if (mode === "attract") drawAttract();
  else if (mode === "viewing") drawViewing();
  else drawEnd();
}

function drawAttract() {
  // Receipt-style background
  fill(RECEIPT_BG);
  stroke(RECEIPT_BORDER);
  strokeWeight(2);
  rect(0, 0, W, H, 12);

  const t = (millis() - bootT) / 1000;
  const r1 = 12 + 2 * Math.sin(t * 3.2);
  const r2 = 28 + 6 * Math.sin(t * 2.1);
  noFill();
  stroke(80);
  strokeWeight(1);
  circle(W / 2, H / 2, r2);
  stroke(ACCENT_COLOR);
  circle(W / 2, H / 2, r1);

  fill(TEXT_COLOR);
  textSize(FONT_SIZE_MAIN);
  textAlign(CENTER, CENTER);
  textFont(FONT_MAIN);
  text("SURVEILLANCE SYSTEM", W / 2, H / 2 - 60);
  text("══════════════════════", W / 2, H / 2 - 40);
  text("TAP TO BEGIN VIEWING", W / 2, H / 2 + 60);

  // Conceptual message
  textSize(FONT_SIZE_SMALL);
  fill(80);
  textAlign(CENTER, TOP);
  text("Your gaze is a transaction.\nThis system records your attention as data.", W / 2, H / 2 + 90);

  if (!calibState.done) {
    textSize(FONT_SIZE_SMALL);
    fill(HIGHLIGHT_COLOR);
    text("calibrating...", W / 2, H / 2 + 120);
  }

  stroke(200);
  strokeWeight(2);
  line(0, 0, 0, H);
  line(W - 1, 0, W - 1, H);
}

function drawViewing() {
  // Receipt-style background
  fill(RECEIPT_BG);
  stroke(RECEIPT_BORDER);
  strokeWeight(2);
  rect(0, 0, W, H, 12);

  push();
  translate(random(-shake, shake), random(-shake, shake));
  fitImage(pic, W / 2, H / 2, W, H);
  pop();

  // Paper texture
  stroke(0, 8);
  strokeWeight(1);
  for (let y = 0; y < H; y += 3) {
    line(0, y, W, y);
  }

  const g = updateFaceMetrics();
  if (g) {
    if (g.ok) {
      const now = millis();
      if (now - lastStampT >= STAMP_COOLDOWN_MS) {
        lastStampT = now;

        gazePath.push({x: g.x, y: g.y, t: now - viewStartTime});

        heat.noStroke();
        heat.fill(0, HEAT_DOT_ALPHA);
        heat.circle(g.x, g.y, HEAT_DOT_SIZE);

        recordGaze(g.x, g.y);
      }
    }

    if (SHOW_RETICLE) {
      push();
      noFill();
      stroke(calibState.done ? color(0, 180, 0) : color(200, 150, 0));
      strokeWeight(2);
      circle(g.x, g.y, 20);
      line(g.x - 10, g.y, g.x + 10, g.y);
      line(g.x, g.y - 10, g.x, g.y + 10);
      pop();
      
      fill(0);
      textSize(9);
      textAlign(LEFT, TOP);
      textFont('Courier New');
      text(`X:${floor(g.x)} Y:${floor(g.y)}`, 10, 10);
      text(calibState.done ? "READY" : `CAL ${calibState.samples}`, 10, 23);
      text(`BLINKS: ${blinkCount}`, 10, 36);
      text(`TIME: ${floor((millis()-viewStartTime)/1000)}s`, 10, 49);
      
      if (g.blinking) {
        fill(255, 0, 0);
        circle(W - 20, 20, 12);
      }
    }
  }

  if (SHOW_LIVE_HEAT) {
    tint(255, 180);
    image(heat, W / 2, H / 2);
    noTint();
  }

  // Instructions
  fill(TEXT_COLOR);
  textSize(FONT_SIZE_TINY);
  textAlign(CENTER, BOTTOM);
  textFont(FONT_MAIN);
  if (!calibState.done) {
    text("LOOK AT CENTER TO CALIBRATE", W / 2, H - 30);
  } else {
    text("TAP SCREEN TO PRINT RECEIPT", W / 2, H - 30);
  }
  text("System is recording your gaze", W / 2, H - 15);

  stroke(200);
  strokeWeight(2);
  line(0, 0, 0, H);
  line(W - 1, 0, W - 1, H);
}

function updateFaceMetrics() {
  if (!faces.length) {
    lastHead = null;
    return null;
  }

  const lm = faces[0];

  // Head center
  let cx = 0, cy = 0;
  for (let p of lm) {
    cx += p.x;
    cy += p.y;
  }
  cx /= lm.length;
  cy /= lm.length;
  const head = { x: cx * W, y: cy * H };
  if (lastHead) headTravel += dist(head.x, head.y, lastHead.x, lastHead.y);
  lastHead = head;

  // Eye corners
  const L_o = lm[33],  L_i = lm[133];
  const R_i = lm[362], R_o = lm[263];
  if (!L_o || !L_i || !R_i || !R_o) return null;

  lastEyeSpan = dist(L_o.x * W, L_o.y * H, R_o.x * W, R_o.y * H);
  faceSpan = lastEyeSpan;

  // BLINK DETECTION
  const L_up = lm[159], L_lo = lm[145];
  const R_up = lm[386], R_lo = lm[374];

  if (L_up && L_lo && R_up && R_lo) {
    const L_open = eyeAspectRatio(L_up, L_lo, L_o, L_i);
    const R_open = eyeAspectRatio(R_up, R_lo, R_o, R_i);
    
    eyeOpenL = lerp(eyeOpenL, L_open, BLINK_SMOOTH);
    eyeOpenR = lerp(eyeOpenR, R_open, BLINK_SMOOTH);
    
    const avgOpen = (eyeOpenL + eyeOpenR) * 0.5;
    const isBlinking = avgOpen < BLINK_THRESHOLD;
    
    if (isBlinking && !wasBlinking) {
      blinkCount++;
      const blinkTime = millis() - viewStartTime;
      blinkTimes.push(blinkTime);
    }
    
    wasBlinking = isBlinking;
  }

  // Iris centers
  const L_irisIdx = [468, 469, 470, 471, 472];
  const R_irisIdx = [473, 474, 475, 476, 477];
  const Lc = avgPts(lm, L_irisIdx, midPt(L_o, L_i));
  const Rc = avgPts(lm, R_irisIdx, midPt(R_i, R_o));

  let gxNorm = 1.0 - ((Lc.x + Rc.x) * 0.5);
  let gyNorm = (Lc.y + Rc.y) * 0.5;

  // Calibration
  if (!calibState.done) {
    calibState.sumX += gxNorm;
    calibState.sumY += gyNorm;
    calibState.samples++;
    
    if (calibState.samples >= calibState.maxSamples) {
      calibState.offsetX = (calibState.sumX / calibState.samples) - 0.5;
      calibState.offsetY = (calibState.sumY / calibState.samples) - 0.5;
      calibState.done = true;
    }
  }

  let gx = (gxNorm - 0.5 - calibState.offsetX) * GAIN_X;
  let gy = (gyNorm - 0.5 - calibState.offsetY) * GAIN_Y;

  const px = constrain(W / 2 + gx * W * 0.45, 8, W - 8);
  const py = constrain(H / 2 + gy * H * 0.45, 8, H - 8);

  if (!gazeS) gazeS = { x: px, y: py };
  gazeS.x = lerp(gazeS.x, px, 0.4);
  gazeS.y = lerp(gazeS.y, py, 0.4);

  return { 
    x: gazeS.x, 
    y: gazeS.y, 
    ok: calibState.done,
    blinking: wasBlinking
  };
}

function eyeAspectRatio(up, lo, outer, inner) {
  const height = dist(up.x, up.y, lo.x, lo.y);
  const width = dist(outer.x, outer.y, inner.x, inner.y) + 0.0001;
  return constrain(height / width, 0, 1);
}

function mousePressed() { handleInput(); }
function touchStarted() { handleInput(); return false; }
function keyPressed() { 
  if (key === ' ') handleInput();
  if (key === 'r' || key === 'R') {
    calibState = {
      done: false, samples: 0, maxSamples: 60,
      sumX: 0, sumY: 0, offsetX: 0, offsetY: 0
    };
    gazeS = null;
  }
}

function handleInput() {
  if (mode === "attract") {
    mode = "viewing";
    viewStartTime = millis();
  } else if (mode === "viewing") {
    // Second tap = generate receipt
    generateReceipt();
  } else if (mode === "end") {
    // Restart from end screen
    restart();
  }
}

function drawEnd() {
  background(240);
  fill(0);
  textAlign(CENTER, CENTER);
  textSize(14);
  textFont('Courier New');
  text("RECEIPT SAVED", W / 2, H / 2 - 20);
  text("══════════════════════════════", W / 2, H / 2);
  textSize(11);
  text("check downloads folder", W / 2, H / 2 + 40);
  text("tap to restart", W / 2, H / 2 + 60);

  stroke(200);
  strokeWeight(2);
  line(0, 0, 0, H);
  line(W - 1, 0, W - 1, H);
}

function generateReceipt() {
  const out = createGraphics(W, H);
  out.background(240);

  const sessionStamp = stamp();
  const viewTime = nf((millis() - viewStartTime) / 1000, 1, 1);
  const blinkRate = nf(blinkCount / ((millis() - viewStartTime) / 60000), 1, 1);

  // Calculate gaze profile
  const total = gazeStats.count || 1;
  const centerPct = Math.round((gazeStats.center / total) * 100);
  const edgePct = Math.round((gazeStats.edge / total) * 100);

  let profile;
  if (centerPct > 55) profile = "CENTRAL FIXATOR";
  else if (edgePct > 55) profile = "PERIPHERAL SCANNER";
  else profile = "DISTRIBUTED VIEWER";

  const hBias = gazeStats.left > gazeStats.right ? "Left-biased" : gazeStats.right > gazeStats.left ? "Right-biased" : "H-balanced";
  const vBias = gazeStats.upper > gazeStats.lower ? "Upper-focused" : gazeStats.lower > gazeStats.upper ? "Lower-focused" : "V-balanced";

  // Header
  out.fill(0);
  out.textFont('Courier New');
  out.textSize(12);
  out.textAlign(CENTER, TOP);
  let y = 20;
  
  out.text("════════════════════════════════════════", W / 2, y); y += 16;
  out.text("SURVEILLANCE RECEIPT", W / 2, y); y += 14;
  out.text("GAZE ANALYSIS", W / 2, y); y += 14;
  out.text("════════════════════════════════════════", W / 2, y); y += 24;

  // Metadata
  out.textAlign(LEFT, TOP);
  out.textSize(10);
  out.text(`DATE: ${sessionStamp}`, 20, y); y += 14;
  out.text(`SUBJECT ID: ${sessionStamp.slice(-6)}`, 20, y); y += 14;
  out.text(`OBSERVATION TIME: ${viewTime}s`, 20, y); y += 14;
  out.text(`FIXATION POINTS: ${gazePath.length}`, 20, y); y += 14;
  out.text(`HEAD MOTION: ${nf(headTravel, 1, 0)}px`, 20, y); y += 14;
  out.text(`BLINK COUNT: ${blinkCount}`, 20, y); y += 14;
  out.text(`BLINK RATE: ${blinkRate}/min`, 20, y); y += 20;

  // Analysis
  out.textAlign(LEFT, TOP);
  out.textSize(10);
  out.text("GAZE ANALYSIS:", 20, y); y += 14;
  out.text(`Profile: ${profile}`, 20, y); y += 12;
  out.text(`H-Bias: ${hBias}`, 20, y); y += 12;
  out.text(`V-Bias: ${vBias}`, 20, y); y += 12;
  out.text(`Center: ${centerPct}% | Edge: ${edgePct}%`, 20, y); y += 20;

  // Blink pattern
  out.text("BLINK PATTERN:", 20, y); y += 14;
  let blinkBehavior;
  if (blinkRate < 10) blinkBehavior = "LOW (focused/dry)";
  else if (blinkRate < 20) blinkBehavior = "NORMAL";
  else blinkBehavior = "HIGH (stress/fatigue)";
  out.text(`Behavior: ${blinkBehavior}`, 20, y); y += 20;

  // DOT PATTERN VISUALIZATION
  out.text("GAZE PATTERN MAP:", 20, y); y += 14;
  
  const vizH = 200;
  const vizY = y;
  
  // Draw outline of viewing area
  out.noFill();
  out.stroke(0, 40);
  out.strokeWeight(1);
  out.rect(20, vizY, W - 40, vizH);
  
  // Draw all gaze dots at their actual positions
  out.fill(0);
  out.noStroke();
  
  for (let p of gazePath) {
    // Map from canvas coordinates to visualization area
    const x = map(p.x, 0, W, 20, W - 20);
    const y = map(p.y, 0, H, vizY, vizY + vizH);
    const size = random(1.5, 3);
    out.circle(x, y, size);
  }

  // Mark blinks with red dots
  out.fill(255, 0, 0);
  for (let bt of blinkTimes) {
    // Find gaze point closest to blink time
    let closest = null;
    let minDiff = Infinity;
    
    for (let p of gazePath) {
      const diff = Math.abs(p.t - bt);
      if (diff < minDiff) {
        minDiff = diff;
        closest = p;
      }
    }
    
    if (closest && minDiff < 200) {
      const x = map(closest.x, 0, W, 20, W - 20);
      const y = map(closest.y, 0, H, vizY, vizY + vizH);
      out.circle(x, y, 5);
    }
  }

  y = vizY + vizH + 15;

  // Legend for dots
  out.textAlign(LEFT, TOP);
  out.textSize(9);
  out.text("BLINK MARKERS:", 20, y); y += 12;
  out.fill(255, 0, 0);
  out.circle(25, y - 3, 5);
  out.fill(0);
  out.text("  = Blink event detected", 30, y); y += 20;

  // Footer
  out.textAlign(CENTER, TOP);
  out.text("────────────────────────────────────────", W / 2, y); y += 14;
  out.textSize(9);
  out.text("Each dot marks a detected fixation point.", W / 2, y); y += 11;
  out.text("Blinks logged as physiological markers.", W / 2, y); y += 11;
  out.text("Data has been captured and stored.", W / 2, y); y += 11;
  // Conceptual message footer
  out.textSize(9);
  out.fill(80);
  out.text("Your gaze is a transaction.\nThis receipt is a record of your attention.", W / 2, y); y += 22;
  out.fill(0);
  out.text("════════════════════════════════════════", W / 2, y); y += 14;

  // Barcode
  out.stroke(0);
  out.strokeWeight(1);
  for (let i = 0; i < 60; i++) {
    const x = 20 + i * 7;
    const h = random([5, 7, 9, 11]);
    if (random() > 0.3) {
      out.line(x, y, x, y + h);
    }
  }

  // Perforation
  for (let py = 0; py < H; py += 20) {
    out.fill(200);
    out.noStroke();
    out.circle(6, py, 4);
    out.circle(W - 6, py, 4);
  }

  save(out, `receipt_${sessionStamp}.png`);
  mode = "end";
}

function recordGaze(x, y) {
  gazeStats.sumX += x;
  gazeStats.sumY += y;
  gazeStats.count++;

  const dx = Math.abs(x - W / 2) / (W / 2);
  const dy = Math.abs(y - H / 2) / (H / 2);
  const distCenter = Math.sqrt(dx * dx + dy * dy);

  if (distCenter < 0.35) gazeStats.center++;
  else if (distCenter > 0.75) gazeStats.edge++;

  if (x < W / 2) gazeStats.left++; else gazeStats.right++;
  if (y < H / 2) gazeStats.upper++; else gazeStats.lower++;
}

function avgPts(lm, idxs, fb) {
  let sx = 0, sy = 0, n = 0;
  for (let id of idxs) {
    const p = lm[id];
    if (p) { sx += p.x; sy += p.y; n++; }
  }
  if (!n) return { x: fb.x, y: fb.y };
  return { x: sx / n, y: sy / n };
}

function midPt(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function fitImage(img, cx, cy, w, h) {
  const ir = img.width / img.height;
  const cr = w / h;
  let dw, dh;
  if (ir > cr) {
    dh = h;
    dw = h * ir;
  } else {
    dw = w;
    dh = w / ir;
  }
  const OVERSCAN = 1.06;
  dw *= OVERSCAN;
  dh *= OVERSCAN;
  image(img, cx, cy, dw, dh);
}

function stamp() {
  const d = new Date(), z = n => String(n).padStart(2,'0');
  return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}_${z(d.getHours())}-${z(d.getMinutes())}-${z(d.getSeconds())}`;
}

function restart() {
  mode = "attract";
  viewStartTime = 0;
  viewDuration = 0;
  headTravel = 0;
  faceSpan = 0;
  lastHead = null;
  lastEyeSpan = null;
  
  gazePath = [];
  blinkTimes = [];
  blinkCount = 0;
  
  heat.clear();
  
  gazeStats = {
    sumX: 0, sumY: 0, count: 0,
    center: 0, edge: 0,
    left: 0, right: 0,
    upper: 0, lower: 0
  };
  
  calibState = {
    done: false, samples: 0, maxSamples: 60,
    sumX: 0, sumY: 0, offsetX: 0, offsetY: 0
  };
  gazeS = null;
}
