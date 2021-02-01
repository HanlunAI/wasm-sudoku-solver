import rescale from "./steps/rescale.js";
import threshold from "./steps/threshold.js";
import findSudokuGrid from "./steps/findSudokuGrid.js";
import copyAndProject from "./steps/copyAndProject.js";
import removeGridlines from "./steps/removeGridlines.js";
import renderDigits from "./steps/renderDigits.js";
import mergeImages from "./steps/mergeImages.js";
import { init as initSolverModule, solver } from "./steps/solver.js";
import {
  matchDigits,
  init as initTensorflowModel
} from "./steps/matchDigits.js";

import { imgRead, imgWrite } from "./steps/utils.js";

// const videoTargetCanvas = document.querySelector('canvas:not([id])');
// const rangeElement = document.getElementById("range");

const colorNormalize = c => {
  c = '0x' + c.substring(1);
  c = [(c >> 16) & 255, (c >> 8) & 255, c & 255];
  return c.map(v => v / c.reduce((sum, v) => sum + v, 0));
}
let colorRaw = '#bb12bb';
document.body.style.setProperty('--user', colorRaw);
let color = colorNormalize(colorRaw);
document.querySelector('input[type=color]').onchange = ev => {
  colorRaw = ev.target.value;
  color = colorNormalize(colorRaw);
  document.body.style.setProperty('--user', colorRaw);
}

cv["onRuntimeInitialized"] = async () => {
  await initSolverModule();
  await initTensorflowModel();

  // const urlParams = new URLSearchParams(window.location.search);
  // const testImage = urlParams.get("testImage");
  // if (testImage) {
  //   const img = new Image();
  //   img.onload = function () {
  //     videoTargetCanvas.width = img.width;
  //     videoTargetCanvas.height = img.height;
  //     const ctx = videoTargetCanvas.getContext("2d");
  //     ctx.drawImage(img, 0, 0);
  //     setInterval(() => run(false), 100);
  //   };
  //   img.src = testImage;
  //}
};

const message = document.querySelector('#message');

class Upload {
  constructor() {
    this.canvas = document.querySelector('body>canvas');
    document.querySelector('input[type=file]').onchange = ev => {
      const reader = new FileReader();
      reader.onload = () => {
        this.img = new Image();
        this.img.onload = () => this.go();
        this.img.src = reader.result;
      }
      reader.readAsDataURL(ev.target.files[0]);
    }
  }
  go() {
    if (this.img.height / this.img.width > window.innerHeight / window.innerWidth) {
      this.canvas.height = window.innerHeight;
      this.canvas.width = window.innerHeight * this.img.width / this.img.height;
    }
    else {
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerWidth * this.img.height / this.img.width;
    }
    this.bg = new Image();
    this.bg.src = '/src/bg.jpeg';
    this.events();
    this.draw();
    this.repeater = setInterval(() => this.run(true), 100);
  }
  events() {
    this.canvas.onpointerdown = pressed => {
      document.onpointermove = document.ontouchmove = moving => {
        moving.preventDefault();
        Upload.pressStart = ['X', 'Y'].map(c => pressed['client'+c] || pressed.targetTouches?.[0]['page'+c]);
        Upload.pressMove = ['X', 'Y'].map(c => moving['client'+c] || moving.targetTouches?.[0]['page'+c]);
        this.draw(Upload.pressMove[0] - Upload.pressStart[0], Upload.pressMove[1] - Upload.pressStart[1]);
      }
    }
    document.onpointerup = document.ontouchend = lifted => {
      if (!document.onpointermove)
        return;
      document.onpointermove = document.ontouchmove = null;
    }
  }
  draw(...pos) {
    const ctx = this.canvas.getContext('2d');
    ctx.drawImage(this.bg, 0, 0);
    if (pos.length === 0) {
      Upload.pos = [Math.random()+10, Math.random()+10];
      pos = [0, 0];
    }
    ctx.drawImage(this.img, Upload.pos[0]+pos[0], Upload.pos[1]+pos[1], this.canvas.width - 30, this.canvas.height - 30);
  }
  run(randomize) {
    if (randomize) {
      const ctx = this.canvas.getContext('2d');
      ctx.drawImage(this.img, Math.random()+10, Math.random()+10, Math.random()*10+this.canvas.width-20, Math.random()*10+this.canvas.height-20);
    }
    new Processor(this.canvas);
  }
}
const upload = new Upload();

class Camera {
  constructor() {
    this.section = document.getElementById('cam');
    this.camera = document.querySelector('canvas:not([id])');
    this.video = document.getElementById('videoElement');

    message.innerText = 'Camera turning on';
    this.camera.hidden = false;
    this.on();
  }
  async on() {
    await initSolverModule();
    await initTensorflowModel();
    await navigator.mediaDevices.getUserMedia({audio: false, video: {facingMode: "environment"}})
      .then(stream => {
        const videoSettings = stream.getVideoTracks()[0].getSettings();
        [this.camera.width, this.camera.height] = [videoSettings.width, videoSettings.height];
        this.video.srcObject = stream;
        this.video.play();
      }).catch(err => console.log(err));

    setInterval(() => this.run(), 100);
    state('idle');
  }
  run() {
    this.camera.getContext("2d").drawImage(this.video, 0, 0);
    new Processor(this.camera);
  }
  static message = document.querySelector('#message');
}
let stateCounter = 0;
const state = state => {
  if (state == 'exhausted') {
    message.innerText = 'Memory exhausted. Refresh the page to restart.';
    message.style.fontcolor = 'red';
  }
  if (state == 'idle')
    message.innerText = 'Show your puzzle to camera';
  else if (state == 'found') {
    stateCounter++;
    if (stateCounter > 5)
      message.innerText = 'Analyzing...';
    return;
  }
  if (state == 'unsolvable')
    message.innerText = '0 or > 1 solution exist';
  else if (state == 'solved') {
    clearInterval(upload.repeater);
    message.innerText = 'Unique solution exists';
  }
  stateCounter = 0;
}
class Processor {
  constructor(canvas) {
    this.run(canvas);
  }
  run(canvas) {
    const buffer = new Buffer(canvas, Number(document.querySelector('input[type=range]').value));

    try {
      buffer.read().rescale(500).threshold()
          .renderStep(0).findSudokuGrid()
          .renderStep(1);
    } catch (e) {
      state('exhausted');
    }

    if (!buffer.coords)
      return state('idle');

    buffer.copyAndProject1(Buffer.square(180, 0), new cv.Size(180, 180))
        .renderStep(2).removeGridlines()
        .renderStep(3).matchDigits();

    //console.log(buffer.puzzle);
    if (buffer.puzzle)
      state('found');
    else
      return state('idle');

    if (buffer.solve().solution.length === 0)
      return;
    else
      state('solved');

    buffer.renderDigits(colorRaw).renderStep(4).copyAndProject2(Buffer.square(180, -2))
        .renderStep(4).rescale(canvas.width)
        .renderStep(5).mergeImages(canvas, color);
    buffer.delete();
  }
}
class Buffer {
  static square = (a, b) => [a, b, a, a, b, a, b, b]
  constructor(canvas, steps) {
    this.canvas = canvas;
    this.steps = steps;
  }
  read() {
    this.buffer = imgRead(this.canvas);
    return this;
  }
  rescale(width) {
    this.rescaled = rescale(this.buffer, width);
    this.buffer = rescale(this.buffer, width);
    return this;
  }
  threshold() {
    threshold(this.buffer);
    threshold(this.rescaled);
    return this;
  }
  renderStep(step) {
    if (step === this.steps) {
      const tempCanvas = document.getElementById('tempCanvas');
      imgWrite(this.buffer, tempCanvas);
      tempCanvas.style.display = "block";
      document.querySelector('canvas:not([id])').style.display = "none";
    }
    return this;
  }
  findSudokuGrid() {
    const g = findSudokuGrid(this.buffer);
    [this.coords, this.buffer] = [g.coords, g.countourBuffer];
    return this;
  }
  copyAndProject1(coords, size) {
    this.buffer = copyAndProject(this.rescaled, this.coords, coords, size);
    return this;
  }
  copyAndProject2(coords) {
    this.buffer = copyAndProject(this.digits, coords, this.coords, new cv.Size(this.rescaled.cols, this.rescaled.rows));
    return this;
  }
  removeGridlines() {
    removeGridlines(this.buffer);
    return this;
  }
  matchDigits() {
    this.puzzle = matchDigits(this.buffer);
    return this;
  }
  solve() {
    this.solution = [...solver(this.puzzle)].map((c, i) => this.puzzle[i] === "." ? c : " ").join("");
    return this;
  }
  renderDigits(colorRaw) {
    this.digits = renderDigits(this.buffer, this.solution, colorRaw);
    return this;
  }
  mergeImages(videoTargetCanvas, color) {
    return mergeImages(this.buffer, videoTargetCanvas, color);
  }
  delete() {
    this.buffer.delete();
    this.rescaled.delete();
    this.digits.delete();
  }
}

class Board {
  constructor() {
    this.section = document.getElementById('grid');
    this.board = this.section.querySelector('div:last-of-type');
    for (let i = 1; i <= 81; i++)
      this.board.insertAdjacentHTML('beforeend', '<input type=number min=1 max=9 autocomplete=off>');

    message.innerText = 'Input your puzzle'
    this.tiles.forEach(t => t.oninput = () => this.solve(t));
    this.section.querySelector('#sample').onclick = () =>
        this.tiles.forEach((input, i) => input.value = Board.sample[i].replace('.',''));
    this.section.querySelector('#clear').onclick = () => {
      message.innerText = 'Input your puzzle';
      this.tiles.forEach(input => {
        input.value = '';
        input.classList.remove('sol');
      });
    }
  }
  get tiles() {
    return [...this.board.querySelectorAll('input[type=number]')];
  }
  solve(tile) {
    const sol = solver(this.tiles.map(input => input.value || '.').join(''));
    message.innerText = sol ? 'Unique solution exists.' : '0 or > 1 solutions exist.';
    if (!sol)
      return tile.nextElementSibling.focus();
    this.tiles.forEach((input, i) => {
      if (input.value) return;
      input.value = sol[i];
      input.classList.add('sol');
    });
    tile.blur();
  }
  static sample = '.5.....62834..6.9....1.9...6.75.438124..9..7.51..8.9...6.932718381.652499724.....'
  static message = document.querySelector('#message');
}
document.querySelector('label[for=show-grid]').addEventListener('click', () => new Board(), {once: true});
document.querySelector('label[for=show-cam]').addEventListener('click', () => new Camera(), {once: true});
