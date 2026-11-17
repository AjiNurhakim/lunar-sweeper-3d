import * as THREE from 'three';
import { Moon, MOON_PALETTES } from './entities/Moon';
import { Rover } from './entities/Rover';
import { BaseStation } from './entities/BaseStation';
import { Scenery } from './entities/Scenery';
import { SweeperSystem } from './systems/SweeperSystem';
import { CameraController } from './core/CameraController';
import { InputManager } from './core/InputManager';
import { SoundManager } from './audio/SoundManager';
import { ConfigManager } from './core/Config';
import { HUD } from './ui/HUD';

class Game {
    private scene!: THREE.Scene;
    private camera!: THREE.PerspectiveCamera;
    private renderer!: THREE.WebGLRenderer;
    private container!: HTMLElement;

    private dirLight!: THREE.DirectionalLight;
    private ambientLight!: THREE.AmbientLight;
    private rimLight!: THREE.DirectionalLight;

    private scenery!: Scenery;
    private moon!: Moon;
    private rover!: Rover;
    private baseStation!: BaseStation;

    private sweeperSystem!: SweeperSystem;
    private cameraCtrl!: CameraController;
    private input!: InputManager;
    private sound!: SoundManager;
    private hud!: HUD;

    private lastTime = performance.now();

    constructor() {
        this.init();
    }

    private init(): void {
        this.container = document.getElementById('canvas-container')!;

        // 0. Load persisted custom settings
        ConfigManager.loadFromStorage();

        // 1. Three.js Scene, Camera, Renderer
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color('#0B0E17');

        this.camera = new THREE.PerspectiveCamera(
            ConfigManager.current.camFov,
            window.innerWidth / window.innerHeight,
            0.1,
            150
        );

        this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.container.appendChild(this.renderer.domElement);

        // 2. Lighting (matched with moon creator clay shader)
        this.ambientLight = new THREE.AmbientLight('#E2E8F0', 0.72);
        this.scene.add(this.ambientLight);

        this.dirLight = new THREE.DirectionalLight('#FFFDF5', 1.25);
        this.dirLight.position.set(-5, 6, 8);
        this.scene.add(this.dirLight);

        this.rimLight = new THREE.DirectionalLight('#94A3B8', 0.42);
        this.rimLight.position.set(5, -4, -6);
        this.scene.add(this.rimLight);

        // 3. Audio & Controls
        this.sound = new SoundManager(ConfigManager.current.soundEnabled);

        // 4. Entities
        this.scenery = new Scenery(this.scene);
        this.moon = new Moon(this.scene);
        this.rover = new Rover(this.moon);
        this.baseStation = new BaseStation(this.moon);

        // 5. Systems & Controls
        this.sweeperSystem = new SweeperSystem(this.moon, this.rover);
        this.input = new InputManager();
        this.cameraCtrl = new CameraController(this.camera, this.rover, this.container);

        // 6. UI HUD
        this.hud = new HUD(this.moon, this.rover, this.sweeperSystem, this.sound, this.cameraCtrl);

        // Connect Sweeper Audio & Warning Callbacks
        this.sweeperSystem.onDirtSwept = (tier) => {
            this.sound.playBrush(tier);
        };
        this.sweeperSystem.onTankFullBlocked = () => {
            this.hud.showToast('Tangki Penuh! Buang debu (E) atau setor ke roket.');
        };

        // Random Moon handler
        this.hud.onRandomMoon = () => {
            const nextSeed = Math.floor(Math.random() * 900) + 100;
            this.loadMoon(nextSeed);
        };

        // Space Preset Change handler
        this.hud.onSpacePresetChange = (preset) => {
            const seed = this.moon.seed + 888;
            if (preset === 'auto') {
                this.scenery.build(this.moon.currentPalette.bgPreset, seed);
            } else {
                this.scenery.build(preset, seed);
            }
        };

        // Window resize
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });

        // Load First Moon
        this.loadMoon(108);

        // Start Loop
        this.lastTime = performance.now();
        requestAnimationFrame((now) => this.loop(now));
    }

    private loadMoon(seed: number): void {
        const moonLevel = Math.floor(Math.random() * MOON_PALETTES.length) + 1;
        this.moon.generateMoon(seed, moonLevel);

        const cfg = ConfigManager.current;
        let chosenPreset = this.moon.currentPalette.bgPreset;
        if (cfg.spacePreset && cfg.spacePreset !== 'auto') {
            chosenPreset = cfg.spacePreset;
        } else {
            // Pick across all 10 rich celestial presets when in auto mode!
            const allPresets = ['void', 'nebula', 'sunset', 'emerald', 'aurora', 'comet', 'supernova', 'blackhole', 'asteroid', 'synthwave'];
            chosenPreset = allPresets[Math.floor(Math.random() * allPresets.length)];
        }

        this.scenery.build(chosenPreset, seed + 888);

        this.moon.applyShaderConfig();
        this.rover.applyConfig();
        this.rover.resetPosition();
        this.baseStation.repositionOnMoon();

        // Clean initial small area under sweeper
        this.sweeperSystem.update(0.016, true);

        this.hud.syncAllUIFromConfig();
        this.hud.showToast(`Bulan #${seed}: ${this.moon.currentPalette.name} • ${chosenPreset.toUpperCase()}`);
    }

    private loop(now: number): void {
        requestAnimationFrame((n) => this.loop(n));

        const dt = Math.min((now - this.lastTime) * 0.001, 0.05);
        this.lastTime = now;

        const throttle = this.input.getThrottle();
        const steer = this.input.getSteer();

        // 1. Continuous Sweeper
        this.sweeperSystem.update(dt, false);

        // 2. Fading Tire Trails
        this.moon.updateTrails(dt);

        // 3. Rover Physics with dynamic suspension tilt & roll
        this.rover.updatePhysics(throttle, steer, dt);

        // Auto-deposit dust into Rocket ONLY when suction hose is firmly attached to cart port
        const isNearRocket = this.baseStation.isRoverInDockingZone(this.rover);
        let isUnloading = false;

        if (isNearRocket && this.rover.stats.currentDust > 0 && this.baseStation.isHoseConnected()) {
            const depositRate = 55 * dt;
            const prevDust = this.rover.stats.currentDust;
            this.rover.stats.currentDust = Math.max(0, this.rover.stats.currentDust - depositRate);
            isUnloading = true;

            if (prevDust > 0 && this.rover.stats.currentDust === 0) {
                this.sound.playDepositWhoosh();
                this.hud.showToast('Debu disedot ke Roket! Tangki kini kosong.');
            }
        }

        // 4. Update Base Station & Rocket animations
        const cleanPct = this.moon.getCleanPercentage();
        const isReadyToLaunch = cleanPct >= 98.0;
        this.baseStation.update(dt, this.rover, isUnloading, isReadyToLaunch);

        // 4. Scenery rotation & Camera update
        this.scenery.update(dt);
        this.cameraCtrl.update(dt);

        // 5. Update HUD Clean Percentage
        this.hud.update(cleanPct);

        // 6. Render 3D Scene
        this.renderer.render(this.scene, this.camera);
    }
}

// Start Game on window load
window.addEventListener('DOMContentLoaded', () => {
    new Game();
});
