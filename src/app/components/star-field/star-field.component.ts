import {
  Component,
  ElementRef,
  OnInit,
  OnDestroy,
  ViewChild,
  AfterViewInit,
  signal,
  inject,
  ChangeDetectionStrategy,
  NgZone,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MartyrsDataService, Martyr } from '../../services/martyrs-data.service';

// ─── WebGL Shaders ────────────────────────────────────────────────────────────

const VERTEX_SHADER = `
  attribute vec2 a_position;
  attribute float a_size;
  attribute float a_alpha;
  attribute float a_phase;

  uniform vec2 u_resolution;
  uniform float u_time;

  varying float v_alpha;
  varying float v_phase;

  void main() {
    float drift  = sin(u_time * 0.3 + a_phase) * 2.0;
    float driftY = cos(u_time * 0.2 + a_phase * 1.3) * 1.5;

    vec2 pos  = a_position + vec2(drift, driftY);
    vec2 clip = (pos / u_resolution) * 2.0 - 1.0;
    clip.y   *= -1.0;

    gl_Position = vec4(clip, 0.0, 1.0);
    gl_PointSize = a_size;
    v_alpha = a_alpha;
    v_phase = a_phase;
  }
`;

const FRAGMENT_SHADER = `
  precision mediump float;
  varying float v_alpha;
  varying float v_phase;

  void main() {
    vec2  center = gl_PointCoord - 0.5;
    float dist   = length(center);
    if (dist > 0.5) discard;

    // Soft glow edge
    float edge = smoothstep(0.5, 0.2, dist);

    // Warm star colour: white core → golden halo
    float warmth = smoothstep(0.0, 0.5, dist);
    vec3  col    = mix(vec3(1.0, 1.0, 1.0), vec3(1.0, 0.92, 0.6), warmth);

    gl_FragColor = vec4(col, v_alpha * edge);
  }
`;

// ─── Particle System ──────────────────────────────────────────────────────────

interface ParticleSystem {
  gl: WebGLRenderingContext;
  program: WebGLProgram;
  count: number;
  width: number;
  height: number;
  cols: number;
  rows: number;
  cellW: number;
  cellH: number;
  positions: Float32Array;
  basePositions: Float32Array;
  sizes: Float32Array;
  alphas: Float32Array;
  baseAlphas: Float32Array;
  phases: Float32Array;
  visible: Uint8Array;
  hoveredIndex: number;
  hoverScale: number;
  time: number;
  // GL locations
  a_position: number;
  a_size: number;
  a_alpha: number;
  a_phase: number;
  u_resolution: WebGLUniformLocation | null;
  u_time: WebGLUniformLocation | null;
  posBuffer: WebGLBuffer;
  sizeBuffer: WebGLBuffer;
  alphaBuffer: WebGLBuffer;
  phaseBuffer: WebGLBuffer;
}

function compileShader(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(s) ?? 'Shader compile error');
  }
  return s;
}

function createParticleSystem(canvas: HTMLCanvasElement): ParticleSystem {
  const gl = canvas.getContext('webgl', {
    alpha: true,
    antialias: true,
    premultipliedAlpha: false,
  })!;
  if (!gl) throw new Error('WebGL not supported');

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  const program = gl.createProgram()!;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.useProgram(program);

  return {
    gl,
    program,
    count: 0,
    width: 0,
    height: 0,
    cols: 0,
    rows: 0,
    cellW: 0,
    cellH: 0,
    positions: new Float32Array(0),
    basePositions: new Float32Array(0),
    sizes: new Float32Array(0),
    alphas: new Float32Array(0),
    baseAlphas: new Float32Array(0),
    phases: new Float32Array(0),
    visible: new Uint8Array(0),
    hoveredIndex: -1,
    hoverScale: 0,
    time: 0,
    a_position: gl.getAttribLocation(program, 'a_position'),
    a_size: gl.getAttribLocation(program, 'a_size'),
    a_alpha: gl.getAttribLocation(program, 'a_alpha'),
    a_phase: gl.getAttribLocation(program, 'a_phase'),
    u_resolution: gl.getUniformLocation(program, 'u_resolution'),
    u_time: gl.getUniformLocation(program, 'u_time'),
    posBuffer: gl.createBuffer()!,
    sizeBuffer: gl.createBuffer()!,
    alphaBuffer: gl.createBuffer()!,
    phaseBuffer: gl.createBuffer()!,
  };
}

function initParticles(ps: ParticleSystem, count: number, width: number, height: number): void {
  ps.count = count;
  ps.width = width;
  ps.height = height;

  const cols = Math.ceil(Math.sqrt(count * (width / height)));
  const rows = Math.ceil(count / cols);
  ps.cols = cols;
  ps.rows = rows;
  ps.cellW = width / cols;
  ps.cellH = height / rows;

  ps.positions     = new Float32Array(count * 2);
  ps.basePositions = new Float32Array(count * 2);
  ps.sizes         = new Float32Array(count);
  ps.alphas        = new Float32Array(count);
  ps.baseAlphas    = new Float32Array(count);
  ps.phases        = new Float32Array(count);
  ps.visible       = new Uint8Array(count).fill(1);

  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = (col + 0.5) * ps.cellW + (Math.random() - 0.5) * ps.cellW * 0.6;
    const y = (row + 0.5) * ps.cellH + (Math.random() - 0.5) * ps.cellH * 0.6;

    ps.basePositions[i * 2]     = x;
    ps.basePositions[i * 2 + 1] = y;
    ps.positions[i * 2]         = x;
    ps.positions[i * 2 + 1]     = y;

    ps.sizes[i]      = 2.0 + Math.random() * 2.5;
    const a          = 0.35 + Math.random() * 0.5;
    ps.alphas[i]     = a;
    ps.baseAlphas[i] = a;
    ps.phases[i]     = Math.random() * Math.PI * 2;
  }

  uploadBuffers(ps);
}

function uploadBuffers(ps: ParticleSystem): void {
  const gl = ps.gl;
  gl.bindBuffer(gl.ARRAY_BUFFER, ps.posBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, ps.positions, gl.DYNAMIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, ps.sizeBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, ps.sizes, gl.DYNAMIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, ps.alphaBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, ps.alphas, gl.DYNAMIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, ps.phaseBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, ps.phases, gl.STATIC_DRAW);
}

function setHovered(ps: ParticleSystem, index: number): void {
  if (ps.hoveredIndex !== index) {
    if (ps.hoveredIndex >= 0 && ps.hoveredIndex < ps.count) {
      ps.sizes[ps.hoveredIndex]  = ps.baseAlphas[ps.hoveredIndex] > 0 ? 2.5 + Math.random() * 2.0 : 0;
      ps.alphas[ps.hoveredIndex] = ps.baseAlphas[ps.hoveredIndex];
    }
    ps.hoveredIndex = index;
    ps.hoverScale   = 0;
  }
}

function renderParticles(ps: ParticleSystem, dt: number): void {
  const gl = ps.gl;
  ps.time += dt;

  if (ps.hoveredIndex >= 0 && ps.hoveredIndex < ps.count) {
    ps.hoverScale = Math.min(1, ps.hoverScale + dt * 5);
    ps.sizes[ps.hoveredIndex]  = 3.0 + ps.hoverScale * 10;
    ps.alphas[ps.hoveredIndex] = 0.6 + ps.hoverScale * 0.4;
  }

  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(ps.program);
  gl.uniform2f(ps.u_resolution, ps.width, ps.height);
  gl.uniform1f(ps.u_time, ps.time);

  gl.bindBuffer(gl.ARRAY_BUFFER, ps.posBuffer);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, ps.positions);
  gl.enableVertexAttribArray(ps.a_position);
  gl.vertexAttribPointer(ps.a_position, 2, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, ps.sizeBuffer);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, ps.sizes);
  gl.enableVertexAttribArray(ps.a_size);
  gl.vertexAttribPointer(ps.a_size, 1, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, ps.alphaBuffer);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, ps.alphas);
  gl.enableVertexAttribArray(ps.a_alpha);
  gl.vertexAttribPointer(ps.a_alpha, 1, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, ps.phaseBuffer);
  gl.enableVertexAttribArray(ps.a_phase);
  gl.vertexAttribPointer(ps.a_phase, 1, gl.FLOAT, false, 0, 0);

  gl.drawArrays(gl.POINTS, 0, ps.count);
}

function getIndexAt(ps: ParticleSystem, mx: number, my: number): number {
  const col = Math.floor(mx / ps.cellW);
  const row = Math.floor(my / ps.cellH);

  let bestDist = 35 * 35;
  let bestIdx  = -1;

  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const r = row + dr;
      const c = col + dc;
      if (r < 0 || r >= ps.rows || c < 0 || c >= ps.cols) continue;
      const idx = r * ps.cols + c;
      if (idx >= ps.count || !ps.visible[idx]) continue;

      const phase  = ps.phases[idx];
      const drift  = Math.sin(ps.time * 0.3 + phase) * 2.0;
      const driftY = Math.cos(ps.time * 0.2 + phase * 1.3) * 1.5;
      const px = ps.basePositions[idx * 2]     + drift;
      const py = ps.basePositions[idx * 2 + 1] + driftY;
      const dx = mx - px;
      const dy = my - py;
      const d  = dx * dx + dy * dy;

      if (d < bestDist) { bestDist = d; bestIdx = idx; }
    }
  }
  return bestIdx;
}

function resizeParticles(ps: ParticleSystem, width: number, height: number): void {
  if (ps.count === 0) return;
  const sx = width / ps.width;
  const sy = height / ps.height;
  ps.width  = width;
  ps.height = height;

  for (let i = 0; i < ps.count; i++) {
    ps.basePositions[i * 2]     *= sx;
    ps.basePositions[i * 2 + 1] *= sy;
    ps.positions[i * 2]          = ps.basePositions[i * 2];
    ps.positions[i * 2 + 1]      = ps.basePositions[i * 2 + 1];
  }

  ps.cols  = Math.ceil(Math.sqrt(ps.count * (width / height)));
  ps.rows  = Math.ceil(ps.count / ps.cols);
  ps.cellW = width / ps.cols;
  ps.cellH = height / ps.rows;
}

// ─── Component ────────────────────────────────────────────────────────────────

export interface HoverInfo {
  martyr: Martyr;
  x: number;
  y: number;
}

@Component({
  selector: 'app-star-field',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './star-field.component.html',
  styleUrl: './star-field.component.css',
})
export class StarFieldComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('glCanvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;

  private dataService = inject(MartyrsDataService);
  private zone        = inject(NgZone);

  readonly loading     = this.dataService.loading;
  readonly loadProgress = this.dataService.loadProgress;
  readonly totalCount  = signal(0);

  readonly hoverInfo   = signal<HoverInfo | null>(null);
  readonly aboutOpen   = signal(false);

  private ps!: ParticleSystem;
  private rafId = 0;
  private lastTime = 0;
  private resizeObserver!: ResizeObserver;

  ngOnInit(): void {
    this.dataService.load();
  }

  ngAfterViewInit(): void {
    const canvas = this.canvasRef.nativeElement;
    this.ps = createParticleSystem(canvas);

    // Watch for data to arrive
    const checkData = () => {
      const martyrs = this.dataService.martyrs();
      if (martyrs.length > 0) {
        this.initScene(martyrs);
      } else if (this.dataService.loading()) {
        setTimeout(checkData, 100);
      }
    };
    checkData();

    // Resize observer
    this.resizeObserver = new ResizeObserver(() => this.onResize());
    this.resizeObserver.observe(canvas.parentElement!);
  }

  private initScene(martyrs: Martyr[]): void {
    const canvas = this.canvasRef.nativeElement;
    const w = canvas.clientWidth  * devicePixelRatio;
    const h = canvas.clientHeight * devicePixelRatio;
    canvas.width  = w;
    canvas.height = h;
    this.ps.gl.viewport(0, 0, w, h);

    initParticles(this.ps, martyrs.length, w, h);
    this.totalCount.set(martyrs.length);

    this.zone.runOutsideAngular(() => this.startLoop());
  }

  private startLoop(): void {
    const loop = (ts: number) => {
      const dt = Math.min((ts - this.lastTime) / 1000, 0.05);
      this.lastTime = ts;
      renderParticles(this.ps, dt);
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  private onResize(): void {
    const canvas = this.canvasRef.nativeElement;
    const w = canvas.clientWidth  * devicePixelRatio;
    const h = canvas.clientHeight * devicePixelRatio;
    canvas.width  = w;
    canvas.height = h;
    this.ps.gl.viewport(0, 0, w, h);
    resizeParticles(this.ps, w, h);
  }

  toggleAbout(): void {
    this.aboutOpen.update(v => !v);
  }

  onMouseMove(event: MouseEvent): void {
    if (!this.ps || this.ps.count === 0) return;

    const canvas = this.canvasRef.nativeElement;
    const rect   = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    const mx = (event.clientX - rect.left) * scaleX;
    const my = (event.clientY - rect.top)  * scaleY;

    const idx = getIndexAt(this.ps, mx, my);
    setHovered(this.ps, idx);

    if (idx >= 0) {
      const martyrs = this.dataService.martyrs();
      if (martyrs[idx]) {
        // Position card near cursor but keep it on screen
        const cardW = 280;
        const cardH = 140;
        let cx = event.clientX + 20;
        let cy = event.clientY - 20;
        if (cx + cardW > window.innerWidth)  cx = event.clientX - cardW - 20;
        if (cy + cardH > window.innerHeight) cy = event.clientY - cardH - 20;
        if (cy < 0) cy = 10;

        this.zone.run(() => {
          this.hoverInfo.set({ martyr: martyrs[idx], x: cx, y: cy });
        });
      }
    } else {
      this.zone.run(() => this.hoverInfo.set(null));
    }
  }

  onMouseLeave(): void {
    setHovered(this.ps, -1);
    this.hoverInfo.set(null);
  }

  onTouchMove(event: TouchEvent): void {
    event.preventDefault();
    const t = event.touches[0];
    this.onMouseMove({ clientX: t.clientX, clientY: t.clientY } as MouseEvent);
  }

  formatAge(g: string): string {
    return g || 'Unknown';
  }

  formatDate(b: string): string {
    if (!b) return '';
    try {
      return new Date(b).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch { return b; }
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.rafId);
    this.resizeObserver?.disconnect();
  }
}
