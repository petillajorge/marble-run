import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import confetti from 'canvas-confetti';
import { initPhysics, PhysicsWorldContext } from './physics/physics';
import { soundEngine } from './audio/sound';
import { TrackBuilder } from './tracks/builder';
import { TrackPieceType } from './tracks/types';
import { PRESET_GRAND_HELIX, PRESET_ROLLERCOASTER } from './tracks/presets';
import { MarbleManager } from './marbles/marbleManager';
import { MarbleCustomization, PatternType } from './marbles/texture';

type Mode = 'build' | 'race';
type CameraMode = 'leader' | 'player' | 'free' | 'marble_select';

class GameApp {
  private container: HTMLElement;
  private uiContainer!: HTMLElement;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private controls!: OrbitControls;

  private physicsContext!: PhysicsWorldContext;
  private builder!: TrackBuilder;
  private marbleManager!: MarbleManager;

  private mode: Mode = 'build';
  private cameraMode: CameraMode = 'free';
  private selectedMarbleFollowIndex: number = 0;

  // Race state
  private isRaceActive: boolean = false;
  private isCountingDown: boolean = false;
  private countdownTime: number = 3;
  private raceStartTime: number = 0;
  private raceResults: { name: string; isPlayer: boolean; time: number }[] = [];

  // Marble Customization (4 AI + 1 Player)
  private marbleConfigs: MarbleCustomization[] = [
    { id: 'm1', name: 'Player Marble', primaryColor: '#ef4444', secondaryColor: '#fef08a', pattern: 'stripes', isPlayer: true },
    { id: 'm2', name: 'Speedy Blue', primaryColor: '#3b82f6', secondaryColor: '#ffffff', pattern: 'dots', isPlayer: false },
    { id: 'm3', name: 'Neon Comet', primaryColor: '#10b981', secondaryColor: '#a855f7', pattern: 'swirl', isPlayer: false },
    { id: 'm4', name: 'Golden Blaze', primaryColor: '#f59e0b', secondaryColor: '#dc2626', pattern: 'solid', isPlayer: false },
    { id: 'm5', name: 'Cosmic Purple', primaryColor: '#8b5cf6', secondaryColor: '#06b6d4', pattern: 'stripes', isPlayer: false },
  ];

  // Selection state in Builder
  private selectedPieceId: string | null = null;
  private isDraggingPiece: boolean = false;
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  private dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  constructor(container: HTMLElement) {
    this.container = container;
  }

  public async init() {
    this.setupThree();
    this.setupUIOverlayContainer();
    this.physicsContext = await initPhysics();
    this.builder = new TrackBuilder(this.scene, this.physicsContext.world);
    this.marbleManager = new MarbleManager(this.scene, this.physicsContext.world);

    // Load default preset scenario
    this.builder.loadTrack(PRESET_GRAND_HELIX);

    this.setupEvents();
    this.renderUI();
    this.animate();
  }

  private setupThree() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0f172a);
    this.scene.fog = new THREE.FogExp2(0x0f172a, 0.015);

    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500);
    this.camera.position.set(0, 15, 25);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.target.set(0, 5, 5);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(20, 40, 20);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 150;
    const d = 30;
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
    this.scene.add(dirLight);

    // Studio Grid Floor
    const gridHelper = new THREE.GridHelper(100, 100, 0x38bdf8, 0x1e293b);
    gridHelper.position.y = -0.01;
    this.scene.add(gridHelper);
  }

  private setupUIOverlayContainer() {
    this.uiContainer = document.createElement('div');
    this.uiContainer.id = 'ui-overlay';
    this.uiContainer.className = 'absolute inset-0 pointer-events-none z-10';
    this.container.appendChild(this.uiContainer);
  }

  private setupEvents() {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // Pointer events for selecting and moving track pieces in builder mode
    const dom = this.renderer.domElement;

    dom.addEventListener('pointerdown', (e) => {
      if (this.mode !== 'build') return;

      this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

      this.raycaster.setFromCamera(this.mouse, this.camera);
      const pieceGroups = Array.from(this.builder.placedPieces.values()).map(p => p.group);
      const intersects = this.raycaster.intersectObjects(pieceGroups, true);

      if (intersects.length > 0) {
        let topObj: THREE.Object3D | null = intersects[0].object;
        while (topObj && !topObj.userData.pieceId) {
          topObj = topObj.parent;
        }
        if (topObj && typeof topObj.userData.pieceId === 'string') {
          this.selectedPieceId = topObj.userData.pieceId;
          this.isDraggingPiece = true;
          this.controls.enabled = false; // Disable orbit camera while dragging piece

          const piece = this.builder.placedPieces.get(this.selectedPieceId);
          if (piece) {
            this.dragPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), piece.group.position);
          }
          this.renderUI();
        }
      } else {
        this.selectedPieceId = null;
        this.renderUI();
      }
    });

    dom.addEventListener('pointermove', (e) => {
      if (this.mode !== 'build' || !this.isDraggingPiece || !this.selectedPieceId) return;

      this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

      this.raycaster.setFromCamera(this.mouse, this.camera);
      const intersectionPoint = new THREE.Vector3();
      if (this.raycaster.ray.intersectPlane(this.dragPlane, intersectionPoint)) {
        this.builder.movePiece(this.selectedPieceId, [intersectionPoint.x, intersectionPoint.y, intersectionPoint.z]);
      }
    });

    dom.addEventListener('pointerup', () => {
      if (this.isDraggingPiece) {
        this.isDraggingPiece = false;
        this.controls.enabled = true;
      }
    });
  }

  // Animation & Main Loop
  private lastTime = performance.now();
  private animate = () => {
    requestAnimationFrame(this.animate);

    const now = performance.now();
    const delta = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;

    // Physics step
    if (this.isRaceActive) {
      this.physicsContext.step(delta);
      this.marbleManager.update(delta);
      this.checkFinishLine();
    }

    // Track piece animations (e.g. gates opening, paddles moving)
    this.builder.placedPieces.forEach(p => {
      if (p.updateAnimation) p.updateAnimation(delta);
    });

    // Camera follow logic during race
    if (this.mode === 'race' && this.cameraMode !== 'free' && this.marbleManager.marbles.length > 0) {
      let targetMarble = this.marbleManager.marbles[0];

      if (this.cameraMode === 'player') {
        const player = this.marbleManager.marbles.find(m => m.customization.isPlayer);
        if (player) targetMarble = player;
      } else if (this.cameraMode === 'leader') {
        let maxProgress = -Infinity;
        this.marbleManager.marbles.forEach(m => {
          const z = m.mesh.position.z;
          if (z > maxProgress) {
            maxProgress = z;
            targetMarble = m;
          }
        });
      } else {
        targetMarble = this.marbleManager.marbles[this.selectedMarbleFollowIndex % this.marbleManager.marbles.length];
      }

      if (targetMarble) {
        const pos = targetMarble.mesh.position;
        this.controls.target.lerp(pos, 0.1);
        this.camera.position.lerp(new THREE.Vector3(pos.x, pos.y + 6, pos.z - 10), 0.05);
      }
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  // Race Start Countdown & Mechanics
  private startRaceCountdown() {
    this.mode = 'race';
    this.cameraMode = 'leader';
    this.isCountingDown = true;
    this.isRaceActive = false;
    this.countdownTime = 3;
    this.raceResults = [];

    // Spawn marbles at Start Gate
    const spawnPoints = this.builder.getStartGateSpawnPoints(this.marbleConfigs.length);
    this.marbleManager.spawnMarbles(this.marbleConfigs, spawnPoints);

    // Reset gates
    this.builder.placedPieces.forEach(p => {
      if (p.resetGate) p.resetGate();
    });

    this.renderUI();

    const timer = setInterval(() => {
      this.countdownTime--;
      if (this.countdownTime > 0) {
        soundEngine.playCountdownBeep(false);
      } else if (this.countdownTime === 0) {
        soundEngine.playCountdownBeep(true);
        soundEngine.playGateRelease();
        clearInterval(timer);
        this.isCountingDown = false;
        this.isRaceActive = true;
        this.raceStartTime = performance.now();

        // Trigger start gate release
        this.builder.placedPieces.forEach(p => {
          if (p.gateTrigger) p.gateTrigger();
        });
      }
      this.renderUI();
    }, 1000);
  }

  // Check when marbles reach Finish Gate
  private checkFinishLine() {
    const finishGate = Array.from(this.builder.placedPieces.values()).find(p => p.data.type === 'finish_gate');
    if (!finishGate) return;

    const finishPos = finishGate.group.position;

    this.marbleManager.marbles.forEach(marble => {
      if (marble.finished) return;

      const dist = marble.mesh.position.distanceTo(finishPos);
      if (dist < 2.5) {
        marble.finished = true;
        const time = (performance.now() - this.raceStartTime) / 1000;
        marble.finishTime = time;

        this.raceResults.push({
          name: marble.customization.name,
          isPlayer: marble.customization.isPlayer,
          time
        });

        // First marble finish victory event
        if (this.raceResults.length === 1) {
          soundEngine.playVictoryFanfare();
          confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
        }

        this.renderUI();
      }
    });
  }

  // UI Rendering & Controls overlay
  private renderUI() {
    const hud = this.uiContainer;
    hud.innerHTML = '';

    const overlay = document.createElement('div');
    overlay.className = 'absolute inset-0 pointer-events-none flex flex-col justify-between p-4';

    // Top Bar (Title & Mode Switchers)
    const topBar = document.createElement('div');
    topBar.className = 'pointer-events-auto flex items-center justify-between glass-panel p-3 rounded-2xl shadow-2xl';
    topBar.innerHTML = `
      <div class="flex items-center space-x-3">
        <div class="w-10 h-10 rounded-xl bg-sky-500/20 border border-sky-400/30 flex items-center justify-center text-sky-400 font-bold text-xl">🏀</div>
        <div>
          <h1 class="text-lg font-bold text-white tracking-wide">3D Marble Run Simulator</h1>
          <p class="text-xs text-slate-400">Realistic Physics & 3D Builder</p>
        </div>
      </div>

      <div class="flex items-center space-x-2">
        <button id="btn-mode-build" class="glass-button px-4 py-2 rounded-xl text-sm font-semibold flex items-center space-x-2 ${this.mode === 'build' ? 'active text-sky-400' : 'text-slate-300'}">
          <span>🛠️ Builder</span>
        </button>
        <button id="btn-mode-race" class="glass-button px-4 py-2 rounded-xl text-sm font-semibold flex items-center space-x-2 ${this.mode === 'race' ? 'active text-sky-400' : 'text-slate-300'}">
          <span>🏁 Race Mode</span>
        </button>
        <button id="btn-mute" class="glass-button p-2.5 rounded-xl text-slate-300">
          <span>${soundEngine.getMuted() ? '🔇' : '🔊'}</span>
        </button>
      </div>
    `;
    overlay.appendChild(topBar);

    // Builder Sidebar Menu
    if (this.mode === 'build') {
      const builderMenu = document.createElement('div');
      builderMenu.className = 'pointer-events-auto absolute top-24 left-4 w-72 glass-panel p-4 rounded-2xl space-y-4 max-h-[80vh] overflow-y-auto shadow-2xl';
      builderMenu.innerHTML = `
        <h2 class="text-sm font-bold uppercase tracking-wider text-sky-400 border-b border-slate-700/50 pb-2">Track Pieces</h2>
        <div class="grid grid-cols-2 gap-2">
          <button data-piece="start_gate" class="btn-piece glass-button p-2.5 rounded-xl text-xs font-medium text-left flex items-center space-x-2">🟢 Start Gate</button>
          <button data-piece="finish_gate" class="btn-piece glass-button p-2.5 rounded-xl text-xs font-medium text-left flex items-center space-x-2">🏁 Finish Gate</button>
          <button data-piece="straight" class="btn-piece glass-button p-2.5 rounded-xl text-xs font-medium text-left flex items-center space-x-2">➡️ Straight</button>
          <button data-piece="slope_down" class="btn-piece glass-button p-2.5 rounded-xl text-xs font-medium text-left flex items-center space-x-2">📉 Slope Down</button>
          <button data-piece="slope_up" class="btn-piece glass-button p-2.5 rounded-xl text-xs font-medium text-left flex items-center space-x-2">📈 Slope Up</button>
          <button data-piece="curve_90" class="btn-piece glass-button p-2.5 rounded-xl text-xs font-medium text-left flex items-center space-x-2">↪️ 90° Curve</button>
          <button data-piece="loop" class="btn-piece glass-button p-2.5 rounded-xl text-xs font-medium text-left flex items-center space-x-2">🔄 Loop</button>
          <button data-piece="funnel" class="btn-piece glass-button p-2.5 rounded-xl text-xs font-medium text-left flex items-center space-x-2">🌪️ Funnel</button>
          <button data-piece="splitter_paddle" class="btn-piece glass-button p-2.5 rounded-xl text-xs font-medium text-left flex items-center space-x-2">🔀 Paddle Splitter</button>
          <button data-piece="splitter_dual" class="btn-piece glass-button p-2.5 rounded-xl text-xs font-medium text-left flex items-center space-x-2">🌿 Geometry Splitter</button>
        </div>

        <h2 class="text-sm font-bold uppercase tracking-wider text-sky-400 border-b border-slate-700/50 pb-2 pt-2">Preset Scenarios</h2>
        <div class="flex space-x-2">
          <button id="btn-preset-1" class="glass-button flex-1 py-2 rounded-xl text-xs font-semibold">Preset 1</button>
          <button id="btn-preset-2" class="glass-button flex-1 py-2 rounded-xl text-xs font-semibold">Preset 2</button>
        </div>

        <h2 class="text-sm font-bold uppercase tracking-wider text-sky-400 border-b border-slate-700/50 pb-2 pt-2">Track File Management</h2>
        <div class="flex space-x-2">
          <button id="btn-save-local" class="glass-button flex-1 py-2 rounded-xl text-xs font-semibold">💾 Save</button>
          <button id="btn-load-local" class="glass-button flex-1 py-2 rounded-xl text-xs font-semibold">📂 Load</button>
        </div>
        <div class="flex space-x-2">
          <button id="btn-download-json" class="glass-button flex-1 py-2 rounded-xl text-xs font-semibold">⬇️ Export</button>
          <label class="glass-button flex-1 py-2 rounded-xl text-xs font-semibold text-center cursor-pointer">
            ⬆️ Import
            <input type="file" id="input-upload-json" accept=".json" class="hidden" />
          </label>
        </div>
        <button id="btn-clear-track" class="glass-button w-full py-2 rounded-xl text-xs font-semibold text-red-400 hover:text-red-300">🗑️ Clear Track</button>
      `;
      overlay.appendChild(builderMenu);

      // Selected Piece Floating Toolbar
      if (this.selectedPieceId) {
        const toolbar = document.createElement('div');
        toolbar.className = 'pointer-events-auto absolute bottom-8 left-1/2 -translate-x-1/2 glass-panel px-6 py-3 rounded-2xl flex items-center space-x-4 shadow-2xl border border-sky-400/40';
        toolbar.innerHTML = `
          <span class="text-xs font-bold text-sky-400">Selected Piece</span>
          <button id="btn-rotate-cw" class="glass-button px-3 py-1.5 rounded-lg text-xs font-semibold">🔄 Rotate +90°</button>
          <button id="btn-rotate-ccw" class="glass-button px-3 py-1.5 rounded-lg text-xs font-semibold">↩️ Rotate -90°</button>
          <button id="btn-delete-piece" class="glass-button px-3 py-1.5 rounded-lg text-xs font-semibold text-red-400">❌ Delete</button>
        `;
        overlay.appendChild(toolbar);
      }
    }

    // Race Mode Customization & HUD controls
    if (this.mode === 'race') {
      const raceHUD = document.createElement('div');
      raceHUD.className = 'pointer-events-auto absolute top-24 left-4 w-80 glass-panel p-4 rounded-2xl space-y-4 shadow-2xl';

      const playerMarble = this.marbleConfigs[0];

      raceHUD.innerHTML = `
        <h2 class="text-sm font-bold uppercase tracking-wider text-sky-400 border-b border-slate-700/50 pb-2">Customize Player Marble</h2>
        <div class="space-y-3">
          <div>
            <label class="text-xs text-slate-300 block mb-1">Primary Color</label>
            <input type="color" id="color-primary" value="${playerMarble.primaryColor}" class="w-full h-8 rounded-lg cursor-pointer bg-transparent border-0" />
          </div>
          <div>
            <label class="text-xs text-slate-300 block mb-1">Secondary Color</label>
            <input type="color" id="color-secondary" value="${playerMarble.secondaryColor}" class="w-full h-8 rounded-lg cursor-pointer bg-transparent border-0" />
          </div>
          <div>
            <label class="text-xs text-slate-300 block mb-1">Pattern</label>
            <select id="select-pattern" class="w-full bg-slate-800 text-xs text-white p-2 rounded-lg border border-slate-700">
              <option value="stripes" ${playerMarble.pattern === 'stripes' ? 'selected' : ''}>Stripes</option>
              <option value="dots" ${playerMarble.pattern === 'dots' ? 'selected' : ''}>Polka Dots</option>
              <option value="swirl" ${playerMarble.pattern === 'swirl' ? 'selected' : ''}>Swirl</option>
              <option value="solid" ${playerMarble.pattern === 'solid' ? 'selected' : ''}>Solid</option>
            </select>
          </div>
        </div>

        <button id="btn-start-race" class="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-xl text-sm font-bold text-white shadow-lg hover:from-emerald-400 hover:to-teal-500 transition-all ${this.isCountingDown ? 'opacity-50 cursor-not-allowed' : ''}">
          🚀 Start Race!
        </button>

        <h2 class="text-sm font-bold uppercase tracking-wider text-sky-400 border-b border-slate-700/50 pb-2 pt-2">Camera Mode</h2>
        <div class="grid grid-cols-2 gap-2">
          <button id="cam-leader" class="glass-button p-2 rounded-xl text-xs ${this.cameraMode === 'leader' ? 'active text-sky-400' : ''}">🏆 Leader</button>
          <button id="cam-player" class="glass-button p-2 rounded-xl text-xs ${this.cameraMode === 'player' ? 'active text-sky-400' : ''}">🎮 Player Marble</button>
          <button id="cam-free" class="glass-button p-2 rounded-xl text-xs ${this.cameraMode === 'free' ? 'active text-sky-400' : ''}">🛸 Free Orbit</button>
          <button id="cam-next" class="glass-button p-2 rounded-xl text-xs">👁️ Switch Marble</button>
        </div>
      `;
      overlay.appendChild(raceHUD);

      // Countdown overlay
      if (this.isCountingDown) {
        const cdOverlay = document.createElement('div');
        cdOverlay.className = 'absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm pointer-events-none';
        cdOverlay.innerHTML = `
          <div class="text-9xl font-black text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-emerald-400 animate-ping">
            ${this.countdownTime}
          </div>
        `;
        overlay.appendChild(cdOverlay);
      }

      // Post-Race Scoreboard & Winner Overlay
      if (this.raceResults.length > 0) {
        const scoreboard = document.createElement('div');
        scoreboard.className = 'pointer-events-auto absolute top-24 right-4 w-80 glass-panel p-5 rounded-2xl space-y-4 shadow-2xl border border-emerald-500/30';

        const winner = this.raceResults[0];

        scoreboard.innerHTML = `
          <div class="text-center py-2 bg-emerald-500/20 border border-emerald-400/40 rounded-xl">
            <span class="text-2xl">🎉</span>
            <h2 class="text-xl font-black text-emerald-400 uppercase tracking-wide mt-1">${winner.name} WINS!</h2>
          </div>

          <h3 class="text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-700/50 pb-2">Leaderboard</h3>
          <div class="space-y-2">
            ${this.raceResults.map((r, i) => `
              <div class="flex items-center justify-between p-2 rounded-lg ${r.isPlayer ? 'bg-sky-500/20 border border-sky-400/30' : 'bg-slate-800/60'} text-xs">
                <span class="font-bold text-slate-300">#${i + 1} ${r.name}</span>
                <span class="font-mono text-emerald-400">${r.time.toFixed(2)}s</span>
              </div>
            `).join('')}
          </div>
        `;
        overlay.appendChild(scoreboard);
      }
    }

    hud.appendChild(overlay);

    // Attach Event Listeners to UI
    document.getElementById('btn-mode-build')?.addEventListener('click', () => {
      this.mode = 'build';
      this.cameraMode = 'free';
      this.marbleManager.clearMarbles();
      this.renderUI();
    });

    document.getElementById('btn-mode-race')?.addEventListener('click', () => {
      this.mode = 'race';
      this.renderUI();
    });

    document.getElementById('btn-mute')?.addEventListener('click', () => {
      soundEngine.toggleMute();
      this.renderUI();
    });

    // Builder Buttons
    document.querySelectorAll('.btn-piece').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const type = (e.currentTarget as HTMLElement).getAttribute('data-piece') as TrackPieceType;
        this.builder.addPiece(type, [0, 5, 0]);
      });
    });

    document.getElementById('btn-preset-1')?.addEventListener('click', () => {
      this.builder.loadTrack(PRESET_GRAND_HELIX);
    });

    document.getElementById('btn-preset-2')?.addEventListener('click', () => {
      this.builder.loadTrack(PRESET_ROLLERCOASTER);
    });

    document.getElementById('btn-save-local')?.addEventListener('click', () => {
      const json = JSON.stringify(this.builder.serializeTrack());
      localStorage.setItem('marble_run_track', json);
      alert('Track saved to browser LocalStorage!');
    });

    document.getElementById('btn-load-local')?.addEventListener('click', () => {
      const json = localStorage.getItem('marble_run_track');
      if (json) {
        this.builder.loadTrack(JSON.parse(json));
      } else {
        alert('No saved track found in LocalStorage.');
      }
    });

    document.getElementById('btn-download-json')?.addEventListener('click', () => {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.builder.serializeTrack(), null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", "marble_track.json");
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    });

    document.getElementById('input-upload-json')?.addEventListener('change', (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const content = event.target?.result;
            if (typeof content === 'string') {
              const trackData = JSON.parse(content);
              this.builder.loadTrack(trackData);
            }
          } catch (err) {
            alert('Invalid JSON track file.');
          }
        };
        reader.readAsText(file);
      }
    });

    document.getElementById('btn-clear-track')?.addEventListener('click', () => {
      if (confirm('Clear the current track?')) {
        this.builder.clearTrack();
      }
    });

    // Selected Toolbar Listeners
    document.getElementById('btn-rotate-cw')?.addEventListener('click', () => {
      if (this.selectedPieceId) this.builder.rotatePiece(this.selectedPieceId, Math.PI / 2);
    });

    document.getElementById('btn-rotate-ccw')?.addEventListener('click', () => {
      if (this.selectedPieceId) this.builder.rotatePiece(this.selectedPieceId, -Math.PI / 2);
    });

    document.getElementById('btn-delete-piece')?.addEventListener('click', () => {
      if (this.selectedPieceId) {
        this.builder.removePiece(this.selectedPieceId);
        this.selectedPieceId = null;
        this.renderUI();
      }
    });

    // Marble Customization Listeners
    document.getElementById('color-primary')?.addEventListener('change', (e) => {
      this.marbleConfigs[0].primaryColor = (e.target as HTMLInputElement).value;
    });

    document.getElementById('color-secondary')?.addEventListener('change', (e) => {
      this.marbleConfigs[0].secondaryColor = (e.target as HTMLInputElement).value;
    });

    document.getElementById('select-pattern')?.addEventListener('change', (e) => {
      this.marbleConfigs[0].pattern = (e.target as HTMLSelectElement).value as PatternType;
    });

    document.getElementById('btn-start-race')?.addEventListener('click', () => {
      if (!this.isCountingDown) {
        this.startRaceCountdown();
      }
    });

    // Camera Controls
    document.getElementById('cam-leader')?.addEventListener('click', () => {
      this.cameraMode = 'leader';
      this.renderUI();
    });

    document.getElementById('cam-player')?.addEventListener('click', () => {
      this.cameraMode = 'player';
      this.renderUI();
    });

    document.getElementById('cam-free')?.addEventListener('click', () => {
      this.cameraMode = 'free';
      this.renderUI();
    });

    document.getElementById('cam-next')?.addEventListener('click', () => {
      this.selectedMarbleFollowIndex++;
      this.cameraMode = 'leader';
      this.renderUI();
    });
  }
}

// Instantiate and start app
window.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('app')!;
  const app = new GameApp(container);
  app.init();
});
