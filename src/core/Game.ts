import * as THREE from 'three';
import { Moon } from '../entities/Moon';
import { Rover } from '../entities/Rover';
import { BaseStation } from '../entities/BaseStation';
import { ObstacleManager } from '../entities/ObstacleManager';
import { Scenery } from '../entities/Scenery';
import { SweeperSystem } from '../systems/SweeperSystem';
import { EconomySystem } from '../systems/EconomySystem';
import { CameraController } from './CameraController';
import { InputManager } from './InputManager';
import { SoundManager } from '../audio/SoundManager';
import { ConfigManager } from './Config';
import { attachOutline } from './OutlineUtils';
import { HUD } from '../ui/HUD';

/**
 * Main Game coordinator: owns the Three.js scene, renderer loop,
 * entity lifecycle, and system orchestration.
 */
export class Game {
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
    private obstacles!: ObstacleManager;

    private sweeperSystem!: SweeperSystem;
    private economy!: EconomySystem;
    private cameraCtrl!: CameraController;
    private input!: InputManager;
    private sound!: SoundManager;
    private hud!: HUD;

    private lastTime = performance.now();
    private unloadDuration = 0;

    // Falling meteor event state (max 1 per moon)
    private meteorTimer = 18;
    private meteorActive = false;
    private meteorTriggeredThisMoon = false;
    private meteorProgress = 0;
    private meteorStartPos = new THREE.Vector3();
    private meteorTargetPos = new THREE.Vector3();
    private meteorTargetDir = new THREE.Vector3();
    private meteorMesh!: THREE.Mesh;

    // Moon-to-moon rocket transition state
    private readonly REQUIRE_CLEAN_FOR_NEXT_MOON = false;
    private transitionPhase: 'none' | 'board' | 'launch' | 'land' | 'deploy' = 'none';
    private transitionTimer = 0;
    private transitionFadeEl = document.getElementById('moon-transition-fade');
    private transitionStartPos = new THREE.Vector3();
    private transitionCartStartPos: THREE.Vector3[] = [];
    private transitionCartSpawnPos: THREE.Vector3[] = [];
    private transitionRocketTarget = new THREE.Vector3();
    private transitionSpawnPos = new THREE.Vector3();
    private _transCamPos = new THREE.Vector3();
    private _transLookAt = new THREE.Vector3();
    private _transUp = new THREE.Vector3(0, 1, 0);

    constructor() {
        this.init();
    }

    private init(): void {
        this.container = document.getElementById('canvas-container')!;
        ConfigManager.loadFromStorage();

        this.initRendererAndCamera();
        this.initLighting();
        this.initEntitiesAndSystems();
        this.bindEvents();

        this.loadLevel(this.economy.moonLevel);
        (window as unknown as { game?: Game }).game = this;

        // Pre-compile WebGL shaders to eliminate first-sweep stutter
        this.rover.preWarmMaterials(this.renderer, this.scene, this.camera);

        this.lastTime = performance.now();
        requestAnimationFrame((now) => this.loop(now));
    }

    private initRendererAndCamera(): void {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color('#0B0E17');

        this.camera = new THREE.PerspectiveCamera(
            ConfigManager.current.camFov,
            window.innerWidth / window.innerHeight,
            0.1,
            250
        );

        this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
        this.container.appendChild(this.renderer.domElement);
    }

    private initLighting(): void {
        this.ambientLight = new THREE.AmbientLight('#E2E8F0', 0.72);
        this.scene.add(this.ambientLight);

        this.dirLight = new THREE.DirectionalLight('#FFFDF5', 1.25);
        this.dirLight.position.set(-5, 6, 8);
        this.scene.add(this.dirLight);

        this.rimLight = new THREE.DirectionalLight('#94A3B8', 0.42);
        this.rimLight.position.set(5, -4, -6);
        this.scene.add(this.rimLight);
    }

    private initEntitiesAndSystems(): void {
        this.sound = new SoundManager(ConfigManager.current.soundEnabled);
        this.scenery = new Scenery(this.scene);
        this.moon = new Moon(this.scene, this.renderer);
        this.obstacles = new ObstacleManager(this.moon);
        this.rover = new Rover(this.moon);
        this.rover.setObstacleManager(this.obstacles);
        this.baseStation = new BaseStation(this.moon);

        this.sweeperSystem = new SweeperSystem(this.moon, this.rover);
        this.economy = new EconomySystem(this.rover);
        this.input = new InputManager();
        this.cameraCtrl = new CameraController(this.camera, this.rover, this.container);

        this.hud = new HUD(this.moon, this.rover, this.sweeperSystem, this.sound, this.cameraCtrl);
        this.hud.setEconomy(this.economy);

        // Falling Meteor Mesh + Stylized Teardrop Fire Tail VFX
        const meteorGeom = new THREE.IcosahedronGeometry(0.058, 1);
        const meteorMat = new THREE.MeshStandardMaterial({
            color: '#FACC15',
            emissive: '#F97316',
            emissiveIntensity: 0.90,
            roughness: 0.35,
            flatShading: true
        });
        this.meteorMesh = new THREE.Mesh(meteorGeom, meteorMat);
        attachOutline(this.meteorMesh, { width: 0.0045 });

        const meteorOuterProfile = [
            new THREE.Vector2(0.000, 0.020),
            new THREE.Vector2(0.062, 0.005),
            new THREE.Vector2(0.070, -0.040),
            new THREE.Vector2(0.050, -0.115),
            new THREE.Vector2(0.022, -0.200),
            new THREE.Vector2(0.006, -0.255),
            new THREE.Vector2(0.000, -0.270)
        ];
        const flameTailOuter = new THREE.Mesh(
            new THREE.LatheGeometry(meteorOuterProfile, 18),
            new THREE.MeshBasicMaterial({ color: '#F97316', transparent: true, opacity: 0.88, depthWrite: false })
        );
        flameTailOuter.rotation.x = Math.PI / 2;
        flameTailOuter.renderOrder = 1;
        this.meteorMesh.add(flameTailOuter);

        const meteorCoreProfile = [
            new THREE.Vector2(0.000, 0.015),
            new THREE.Vector2(0.038, 0.000),
            new THREE.Vector2(0.042, -0.032),
            new THREE.Vector2(0.026, -0.090),
            new THREE.Vector2(0.008, -0.150),
            new THREE.Vector2(0.000, -0.170)
        ];
        const flameTailCore = new THREE.Mesh(
            new THREE.LatheGeometry(meteorCoreProfile, 14),
            new THREE.MeshBasicMaterial({ color: '#FEF08A', transparent: true, opacity: 0.96, depthWrite: false })
        );
        flameTailCore.rotation.x = Math.PI / 2;
        flameTailCore.renderOrder = 2;
        this.meteorMesh.add(flameTailCore);

        this.meteorMesh.visible = false;
        this.scene.add(this.meteorMesh);
    }

    private bindEvents(): void {
        this.sweeperSystem.onDirtSwept = (tier) => {
            this.sound.playBrush(tier);
        };
        this.sweeperSystem.onTankFullBlocked = () => {
            this.hud.showToast('Tangki Penuh! Buang debu (E) atau setor ke roket.');
        };

        this.rover.onHammerImpact = (rock) => {
            const res = this.obstacles.damageRock(rock, 1);
            if (!res.hit) return;
            this.sound.playHammerHit(res.shattered);
            this.cameraCtrl.addScreenShake(res.shattered ? 0.0055 : 0.0028);
            if (res.shattered && res.coinReward > 0) {
                this.economy.addCoins(res.coinReward);
                this.sound.playCoin();
                this.hud.showToast(`Batu Tier ${res.tier} hancur! +🪙 ${res.coinReward}`);
            }
        };

        this.hud.onNextLevel = () => {
            this.economy.moonLevel++;
            this.economy.save();
            this.loadLevel(this.economy.moonLevel);
        };

        this.hud.onBaseNextMoon = () => {
            this.startMoonTransition();
        };

        this.hud.onBaseShop = () => {
            this.hud.showToast('🛒 Shop di Base akan segera hadir!');
        };

        this.hud.onRandomMoon = () => {
            const nextSeed = Math.floor(Math.random() * 900) + 100;
            this.loadLevel(this.economy.moonLevel, nextSeed);
        };

        this.hud.onTriggerMeteor = () => {
            if (this.meteorTriggeredThisMoon) {
                this.hud.showToast('☄️ Meteor sudah jatuh di bulan ini!');
                return;
            }
            if (!this.meteorActive && this.transitionPhase === 'none') {
                this.triggerMeteorFall();
            }
        };

        this.hud.onSpacePresetChange = (preset) => {
            const seed = this.moon.seed + 888;
            const targetPreset = preset === 'auto' ? this.moon.currentPalette.bgPreset : preset;
            this.scenery.build(targetPreset, seed);
        };

        this.hud.onMoonScaleChange = () => {
            this.loadLevel(this.economy.moonLevel);
        };

        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }

    private loadLevel(level: number, customSeed?: number): void {
        const seed = customSeed !== undefined ? customSeed : (100 + level);
        this.moon.generateMoon(seed, level);

        const chosenPreset = ConfigManager.current.spacePreset === 'auto'
            ? this.moon.currentPalette.bgPreset
            : ConfigManager.current.spacePreset;
        this.scenery.build(chosenPreset, seed + 888);

        this.moon.applyShaderConfig();
        this.obstacles.generateRocks(seed, level);
        this.rover.updateDustColorsFromMoon();
        this.rover.applyConfig();
        this.economy.applyUpgradesToRover();
        this.rover.resetPosition();
        this.baseStation.repositionOnMoon();
        this.cameraCtrl.resetCamera();

        // Clean initial small area under sweeper
        this.sweeperSystem.resetSweepHistory();
        this.sweeperSystem.update(0.016, true);

        // Reset per-moon meteor event limit
        this.meteorTriggeredThisMoon = false;
        this.meteorActive = false;
        if (this.meteorMesh) this.meteorMesh.visible = false;
        this.meteorTimer = 18;

        this.hud.syncAllUIFromConfig();
        this.hud.updateLevelBadge(level, this.moon.currentPalette.name);
        this.hud.showToast(`Level ${level}: ${this.moon.currentPalette.name}`);
    }

    private updateMeteorEvent(dt: number): void {
        if (!this.meteorActive) {
            if (this.meteorTriggeredThisMoon) return;
            this.meteorTimer -= dt;
            if (this.meteorTimer <= 0) {
                this.triggerMeteorFall();
            }
            return;
        }

        this.meteorProgress += dt / 3.8;
        if (this.meteorProgress < 1.0) {
            const easeIn = Math.pow(this.meteorProgress, 1.6);
            this.meteorMesh.position.lerpVectors(this.meteorStartPos, this.meteorTargetPos, easeIn);
            this.meteorMesh.lookAt(this.meteorTargetPos);

            // Pulse burning fire tail
            const pulse = 0.90 + Math.sin(performance.now() * 0.03) * 0.14;
            if (this.meteorMesh.children[0]) this.meteorMesh.children[0].scale.set(pulse, 1.0 + (pulse - 0.9), pulse);
            if (this.meteorMesh.children[1]) this.meteorMesh.children[1].scale.set(pulse, 1.0 + (pulse - 0.9), pulse);

            // Minimal pre-impact tremor as meteor approaches
            if (this.meteorProgress > 0.2) {
                this.cameraCtrl.addScreenShake(0.0010 + this.meteorProgress * 0.0020);
            }
        } else {
            this.meteorActive = false;
            this.meteorMesh.visible = false;
            this.meteorTimer = 28 + Math.random() * 14;

            // Carve new crater, spawn huge high-HP golden rock, and shake camera!
            this.moon.addDynamicCrater(this.meteorTargetDir, 0.22, 0.032);
            this.obstacles.spawnGoldenMeteorRock(this.meteorTargetDir, this.economy.moonLevel);
            this.cameraCtrl.addScreenShake(0.022);
            this.sound.playHammerHit(true);
            this.hud.showToast('☄️ Meteor jatuh! Kawah baru & Batu Emas muncul!');
        }
    }

    private triggerMeteorFall(): void {
        const R = Math.max(0.5, this.moon.moonScale);
        const minBaseChord = 0.68; // Safe clearance outside rocket & base pad
        const northPole = new THREE.Vector3(0, 1, 0);
        const dir = new THREE.Vector3();

        for (let tries = 0; tries < 12; tries++) {
            const fwdArc = (0.48 + Math.random() * 0.40) / R;
            const sideArc = ((Math.random() - 0.5) * 1.15) / R;
            dir.copy(this.rover.up)
                .addScaledVector(this.rover.forward, fwdArc)
                .addScaledVector(this.rover.left, sideArc)
                .normalize();

            if (dir.distanceTo(northPole) * R >= minBaseChord) {
                break;
            }
        }

        // Final safeguard if still inside base zone: push radially away from North Pole
        if (dir.distanceTo(northPole) * R < minBaseChord) {
            const away = new THREE.Vector3(dir.x, 0, dir.z);
            if (away.lengthSq() < 0.0001) away.set(0, 0, 1);
            away.normalize();
            const minAngle = Math.min(Math.PI * 0.45, minBaseChord / R);
            dir.copy(northPole).multiplyScalar(Math.cos(minAngle)).addScaledVector(away, Math.sin(minAngle)).normalize();
        }

        this.meteorTargetDir.copy(dir);
        const cleanR = this.moon.sampleCleanRadiusAt(dir.x, dir.y, dir.z);
        this.meteorTargetPos.copy(dir).multiplyScalar(cleanR);
        this.meteorStartPos.copy(dir).multiplyScalar(R + 3.0)
            .add(new THREE.Vector3((Math.random() - 0.5) * 0.8, 0.4, (Math.random() - 0.5) * 0.8));

        this.meteorMesh.position.copy(this.meteorStartPos);
        this.meteorMesh.visible = true;
        this.meteorActive = true;
        this.meteorTriggeredThisMoon = true;
        this.meteorProgress = 0;
    }

    private startMoonTransition(): void {
        if (this.transitionPhase !== 'none') return;
        this.transitionPhase = 'board';
        this.transitionTimer = 0;
        this.transitionStartPos.copy(this.rover.group.position);
        this.transitionCartStartPos = this.rover.trailerCarts.map((c) => c.pivotGroup.position.clone());
        this.baseStation.getRocketFuselageWorldPos(this.transitionRocketTarget);
        this.transitionRocketTarget.y += 0.05;
        this.hud.updateBaseActions(false, false);
        this.baseStation.setDockingDisabled(true);
        this.sound.playDepositWhoosh();
    }

    private setProbeAndCartsVisible(visible: boolean): void {
        this.rover.group.visible = visible;
        for (const cart of this.rover.trailerCarts) {
            cart.pivotGroup.visible = visible;
        }
    }

    private setProbeAndCartsScale(sxz: number, sy: number): void {
        this.rover.group.scale.set(sxz, sy, sxz);
        for (const cart of this.rover.trailerCarts) {
            cart.pivotGroup.scale.set(sxz, sy, sxz);
        }
    }

    private updateMoonTransition(dt: number): void {
        this.transitionTimer += dt;
        const R = Math.max(0.5, this.moon.moonScale);

        if (this.transitionPhase === 'board') {
            const dur = 0.72;
            const p = Math.min(1, this.transitionTimer / dur);
            const easeIn = p * p;

            this.rover.group.position.lerpVectors(this.transitionStartPos, this.transitionRocketTarget, easeIn);
            this.rover.group.position.y += Math.sin(p * Math.PI) * 0.07;
            for (let i = 0; i < this.rover.trailerCarts.length; i++) {
                const startPos = this.transitionCartStartPos[i];
                if (startPos) {
                    const cart = this.rover.trailerCarts[i];
                    cart.pivotGroup.position.lerpVectors(startPos, this.transitionRocketTarget, easeIn);
                    cart.pivotGroup.position.y += Math.sin(p * Math.PI) * 0.07;
                }
            }

            // Squash & shrink probe + attached tank & sweeper into the rocket
            const s = Math.max(0.001, 1 - easeIn);
            const stretchY = Math.max(0.001, s * (1 + Math.sin(p * Math.PI) * 0.25));
            this.setProbeAndCartsScale(s, stretchY);

            this._transCamPos.set(0.68, R + 0.56, 0.88);
            this._transLookAt.copy(this.transitionRocketTarget);
            this.cameraCtrl.setTransitionCamera(this._transCamPos, this._transLookAt, this._transUp);

            this.baseStation.update(dt, this.rover, false, false);
            this.rover.updateDustParticles(dt);

            if (p >= 1) {
                this.setProbeAndCartsVisible(false);
                this.transitionPhase = 'launch';
                this.transitionTimer = 0;
                this.baseStation.setForceThrust(true);
                this.sound.playDepositWhoosh();
            }
        } else if (this.transitionPhase === 'launch') {
            const dur = 1.65;
            const p = Math.min(1, this.transitionTimer / dur);
            const smoothP = p * p * (3 - 2 * p);
            const accel = Math.pow(p, 2.35);
            const rumble = (1 - p) * Math.sin(this.transitionTimer * 55) * 0.003;
            this.baseStation.setRocketOffsetY(0.024 + accel * 3.1 + rumble);

            this.baseStation.getRocketFuselageWorldPos(this._transLookAt);
            this._transLookAt.y += 0.08;

            const orbitAng = 0.62 + smoothP * 0.55;
            const camR = 1.05 + smoothP * 0.40;
            this._transCamPos.set(
                Math.sin(orbitAng) * camR,
                R + 0.52 + accel * 0.72,
                Math.cos(orbitAng) * camR
            );
            this.cameraCtrl.setTransitionCamera(this._transCamPos, this._transLookAt, this._transUp);
            if (p > 0.12 && this.transitionFadeEl) {
                this.transitionFadeEl.style.opacity = '0';
            }
            if (p < 0.45) {
                const fade = 1 - p / 0.45;
                this.cameraCtrl.addScreenShake(0.009 * fade * fade);
            }
            if (p > 0.72 && this.transitionFadeEl) {
                this.transitionFadeEl.style.opacity = '1';
            }
            this.baseStation.update(dt, this.rover, false, false);

            if (p >= 1) {
                this.economy.moonLevel++;
                this.economy.save();
                this.loadLevel(this.economy.moonLevel);

                const newR = Math.max(0.5, this.moon.moonScale);
                this.transitionSpawnPos.copy(this.rover.group.position);
                this.transitionCartSpawnPos = this.rover.trailerCarts.map((c) => c.pivotGroup.position.clone());
                this.setProbeAndCartsVisible(false);
                this.setProbeAndCartsScale(0.001, 0.001);

                this.baseStation.setRocketOffsetY(2.4);
                this.baseStation.setForceThrust(true);
                this.baseStation.getRocketFuselageWorldPos(this._transLookAt);

                this._transCamPos.set(-0.72, newR + 0.65, 1.02);
                this.cameraCtrl.setTransitionCamera(this._transCamPos, this._transLookAt, this._transUp, true);

                this.transitionPhase = 'land';
                this.transitionTimer = 0;
            }
        } else if (this.transitionPhase === 'land') {
            const dur = 1.45;
            const p = Math.min(1, this.transitionTimer / dur);
            const smoothP = p * p * (3 - 2 * p);
            const easeOut = 1 - Math.pow(1 - p, 2.5);
            let y = THREE.MathUtils.lerp(2.4, 0.024, easeOut);
            if (p > 0.88) {
                const b = (p - 0.88) / 0.12;
                y -= Math.sin(b * Math.PI) * 0.008;
            }
            this.baseStation.setRocketOffsetY(y);

            this.baseStation.getRocketFuselageWorldPos(this._transLookAt);
            this._transLookAt.y += 0.06;

            const orbitAng = -0.60 + smoothP * 0.42;
            const camR = 1.22 - smoothP * 0.24;
            this._transCamPos.set(
                Math.sin(orbitAng) * camR,
                R + 0.62 - smoothP * 0.12,
                Math.cos(orbitAng) * camR
            );
            this.cameraCtrl.setTransitionCamera(this._transCamPos, this._transLookAt, this._transUp);
            if (p > 0.12 && this.transitionFadeEl) {
                this.transitionFadeEl.style.opacity = '0';
            }
            this.baseStation.update(dt, this.rover, false, false);

            if (p >= 1) {
                this.baseStation.setRocketOffsetY(0.024);
                this.baseStation.setForceThrust(false);
                this.baseStation.getRocketFuselageWorldPos(this.transitionRocketTarget);
                this.transitionRocketTarget.y += 0.05;

                this.setProbeAndCartsVisible(true);
                this.rover.group.position.copy(this.transitionRocketTarget);
                for (const cart of this.rover.trailerCarts) {
                    cart.pivotGroup.position.copy(this.transitionRocketTarget);
                }
                this.setProbeAndCartsScale(0.02, 0.02);
                this.sound.playDepositWhoosh();

                this.transitionPhase = 'deploy';
                this.transitionTimer = 0;
            }
        } else if (this.transitionPhase === 'deploy') {
            const dur = 0.78;
            const p = Math.min(1, this.transitionTimer / dur);
            const moveEase = 1 - Math.pow(1 - Math.min(1, p * 1.25), 3);

            this.rover.group.position.lerpVectors(this.transitionRocketTarget, this.transitionSpawnPos, moveEase);
            this.rover.group.position.y += Math.sin(Math.min(1, p * 1.25) * Math.PI) * 0.065;
            for (let i = 0; i < this.rover.trailerCarts.length; i++) {
                const spawnPos = this.transitionCartSpawnPos[i];
                if (spawnPos) {
                    const cart = this.rover.trailerCarts[i];
                    cart.pivotGroup.position.lerpVectors(this.transitionRocketTarget, spawnPos, moveEase);
                    cart.pivotGroup.position.y += Math.sin(Math.min(1, p * 1.25) * Math.PI) * 0.065;
                }
            }

            // Juicy jelly pop-out squash & stretch for probe + carts
            const basePop = 1 - Math.pow(1 - Math.min(1, p * 1.45), 3);
            const wobble = Math.sin(p * Math.PI * 3.0) * Math.exp(-p * 4.2) * 0.36;
            const sxz = Math.max(0.02, basePop * (1 + wobble));
            const sy = Math.max(0.02, basePop * (1 - wobble * 0.85));
            this.setProbeAndCartsScale(sxz, sy);

            this._transLookAt.copy(this.rover.group.position);
            this._transLookAt.y += 0.04;
            this._transCamPos.set(-0.22, R + 0.50, 0.96);
            this.cameraCtrl.setTransitionCamera(this._transCamPos, this._transLookAt, this._transUp);
            if (this.transitionFadeEl) {
                this.transitionFadeEl.style.opacity = '0';
            }
            this.baseStation.update(dt, this.rover, false, false);

            if (p >= 1) {
                this.setProbeAndCartsScale(1, 1);
                this.rover.group.position.copy(this.transitionSpawnPos);
                for (let i = 0; i < this.rover.trailerCarts.length; i++) {
                    const spawnPos = this.transitionCartSpawnPos[i];
                    if (spawnPos) this.rover.trailerCarts[i].pivotGroup.position.copy(spawnPos);
                }
                this.cameraCtrl.clearTransitionCamera();
                this.baseStation.setDockingDisabled(false);
                this.transitionPhase = 'none';
            }
        }
    }

    private loop(now: number): void {
        requestAnimationFrame((n) => this.loop(n));

        const dt = Math.min((now - this.lastTime) * 0.001, 0.05);
        this.lastTime = now;

        if (this.transitionPhase !== 'none') {
            this.updateMoonTransition(dt);
            this.scenery.update(dt);
            this.cameraCtrl.update(dt);
            this.renderer.render(this.scene, this.camera);
            return;
        }

        const throttle = this.input.getThrottle();
        const steer = this.input.getSteer();

        // 1. Sweeper & Tire Trails
        this.sweeperSystem.update(dt, false);
        this.moon.updateTrails(dt);

        // 2. Rover Physics & Suspension + Rock Hit Shake / Debris
        this.rover.updatePhysics(throttle, steer, dt);
        this.obstacles.update(dt);
        this.updateMeteorEvent(dt);

        // 3. Base Station Docking & Dust Unloading
        const isNearRocket = this.baseStation.isRoverInDockingZone(this.rover);
        const isRoverSweepingOrRecent = this.rover.isActivelySweeping || this.rover.getTimeSinceLastSweep() < 1.0;
        let isUnloading = false;

        if (isNearRocket && this.rover.stats.currentDust > 0 && this.baseStation.isHoseConnected() && !isRoverSweepingOrRecent) {
            this.unloadDuration += dt;
            const rampMultiplier = 1.0 + this.unloadDuration * 0.85 + this.unloadDuration * this.unloadDuration * 0.35;
            const depositRate = 55 * rampMultiplier * dt;
            const prevDust = this.rover.stats.currentDust;
            const unloaded = this.economy.unloadDust(depositRate);
            isUnloading = unloaded > 0;

            if (prevDust > 0 && this.rover.stats.currentDust === 0) {
                this.unloadDuration = 0;
                this.sound.playDepositWhoosh();
                this.hud.showToast(`Debu terjual! Koin bertambah: 🪙 ${this.economy.coins}`);
            }
        } else {
            this.unloadDuration = 0;
        }

        const cleanPct = this.moon.getCleanPercentage();
        const isReadyToLaunch = cleanPct >= 85.0;
        const isNextMoonUnlocked = !this.REQUIRE_CLEAN_FOR_NEXT_MOON || isReadyToLaunch;
        this.baseStation.update(dt, this.rover, isUnloading, isReadyToLaunch);

        // 4. Scenery, Camera & HUD
        this.scenery.update(dt);
        this.cameraCtrl.update(dt);
        this.hud.update(cleanPct);
        this.hud.updateBaseActions(isNearRocket, isNextMoonUnlocked);

        // 5. Render
        this.renderer.render(this.scene, this.camera);
    }
}
