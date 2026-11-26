import * as THREE from 'three';
import { Moon } from './Moon';
import { ConfigManager, PROBE_COLOR_PRESETS } from '../core/Config';
import { attachOutline } from '../core/OutlineUtils';
import { RoverTrails } from './RoverTrails';
import type { ObstacleManager, MoonRock } from './ObstacleManager';

export interface RoverStats {
    speed: number;
    sweeperPower: number;
    sweeperWidth: number;
    tankCapacity: number;
    currentDust: number;
}

export const DUST_TIER_COLORS: Record<number, THREE.Color> = {
    1: new THREE.Color('#38BDF8'), // Cyan (Warna 1)
    2: new THREE.Color('#FACC15'), // Kuning (Warna 2)
    3: new THREE.Color('#EF4444')  // Merah (Warna 3)
};

export interface TrailerCart {
    pivotGroup: THREE.Group;
    horizontalTankGroup: THREE.Group;
    tankGlassMat: THREE.MeshStandardMaterial;
    tankFillMesh: THREE.Mesh;
    tankFillMat: THREE.MeshStandardMaterial;
    tierFillMeshes: Record<number, THREE.Mesh>;
    tierFillMats: Record<number, THREE.MeshStandardMaterial>;
    tankFloaterMesh: THREE.Mesh;
    tankFloaterMat: THREE.MeshStandardMaterial;
    tankDustParticles: THREE.Mesh[];
    cartWheelMeshes: THREE.Group[];
    cartLedMats: THREE.MeshBasicMaterial[];
    topGaugeMats: THREE.MeshBasicMaterial[];
    tier1Dust: number;
    tier2Dust: number;
    tier3Dust: number;
    visualTier1: number;
    visualTier2: number;
    visualTier3: number;
    layerOrder: number[];
    currentColor: THREE.Color;
    yaw: number;
    targetYaw: number;
    pitch: number;
    targetPitch: number;
    roll: number;
    targetRoll: number;
    visualFill: number;
    targetFill: number;
    axlePos: THREE.Vector3;
    hitchPos: THREE.Vector3;
    forward: THREE.Vector3;
    up: THREE.Vector3;
    bodyGroup: THREE.Group;
    tongueMesh: THREE.Mesh;
    chassisCenterZ: number;
    rearHitchZ: number;
    wheelX: number;
}

export class Rover {
    public group: THREE.Group;
    public visualBodyGroup: THREE.Group; // Group for suspension tilt & roll
    public moon: Moon;

    // Right-handed basis (X = left, Y = up, Z = forward)
    public up = new THREE.Vector3(0, 1, 0);
    public forward = new THREE.Vector3(0, 0, 1);
    public left = new THREE.Vector3(1, 0, 0);

    public speed = 0;
    public steerAngle = 0;
    public wheelSpin = 0;
    public sweeperSpin = 0;

    // Suspension dynamics
    private pitchLean = 0;
    private rollLean = 0;

    public stats: RoverStats = {
        speed: 1.0,
        sweeperPower: 1.0,
        sweeperWidth: 0.24,
        tankCapacity: 100,
        currentDust: 0
    };

    // Meshes
    private sweeperAssemblyGroup!: THREE.Group;
    private sweeperRollerMesh!: THREE.Group;
    private sweeperSideCaps: { mesh: THREE.Mesh; side: number }[] = [];
    private hammerAssemblyGroup!: THREE.Group;
    private hammerPivotGroup!: THREE.Group;
    private wheelMeshes: THREE.Group[] = [];
    private frontWheelPivots: THREE.Group[] = [];
    private beaconMesh!: THREE.Mesh;
    private eyeLeftMesh!: THREE.Mesh;
    private eyeRightMesh!: THREE.Mesh;
    private blinkTimer = 2.5;

    // Auto Tool Swap (Sweeper <-> Hammer) & Juicy Jelly Animation
    public isHammerMode = false;
    private targetRock: MoonRock | null = null;
    private hammerAnimT = 0.0;
    private hammerSwingPhase = 0.0;
    private hammerHitFired = false;
    private hammerYaw = 0.0;
    private hammerRecoil = 0.0;
    private sweeperLiftT = 0.0;
    private sweeperSpinSpeed = 1.0;
    public onHammerImpact?: (rock: MoonRock) => void;

    // Vacuum Cart Trailer & Horizontal Tank (Multi-Cart Train & Scaling)
    public trailerCarts: TrailerCart[] = [];
    public cartPivotGroup!: THREE.Group;
    public horizontalTankGroup!: THREE.Group;
    public tankGlassMat!: THREE.MeshStandardMaterial;
    public tankFillMesh!: THREE.Mesh;
    public tankFillMat!: THREE.MeshStandardMaterial;
    public tankFloaterMesh!: THREE.Mesh;
    public tankFloaterMat!: THREE.MeshStandardMaterial;
    public tankDustParticles: THREE.Mesh[] = [];
    public cartWheelMeshes: THREE.Group[] = [];
    public cartLedMats: THREE.MeshBasicMaterial[] = [];
    public topGaugeMats: THREE.MeshBasicMaterial[] = [];
    private cartYaw = 0;
    private targetCartYaw = 0;
    public visualTankFill = 0;

    // Shared materials for cart building
    private _offLedColor = new THREE.Color('#1E293B');
    private yellowBodyMat!: THREE.MeshStandardMaterial;
    private yellowDarkMat!: THREE.MeshStandardMaterial;
    private darkChassisMat!: THREE.MeshStandardMaterial;
    private beaconMat!: THREE.MeshBasicMaterial;
    private bristlePrimaryMat!: THREE.MeshStandardMaterial;
    private bristleSecondaryMat!: THREE.MeshStandardMaterial;
    private tickMat!: THREE.MeshBasicMaterial;
    private coreRodMat!: THREE.MeshStandardMaterial;

    public trails!: RoverTrails;
    private obstacleManager: ObstacleManager | null = null;

    // Instanced Dust VFX Pool (subtle particles + black outline in 2 draw calls)
    private dustGroup: THREE.Group;
    private dustInstanced!: THREE.InstancedMesh;
    private dustOutlineInstanced!: THREE.InstancedMesh;
    private dustDummy = new THREE.Object3D();
    private _tmpParticleColor = new THREE.Color();
    private dustParticles: {
        active: boolean;
        pos: THREE.Vector3;
        vel: THREE.Vector3;
        rot: THREE.Euler;
        rotVel: THREE.Vector3;
        life: number;
        maxLife: number;
        scale: number;
    }[] = [];
    private dustSpawnCursor = 0;
    private readonly MAX_DUST = 160;

    // Additive subtle sweep-effort vibration offsets (preserves hammer recoil & suspension)
    private lastVibX = 0;
    private lastVibY = 0;
    private lastVibPitch = 0;
    private lastVibRoll = 0;

    // Temporary math objects
    private _tmpBasisMat = new THREE.Matrix4();
    private _tmpSlopeNormal = new THREE.Vector3();
    private _tmpLeft = new THREE.Vector3();
    private _tmpForward = new THREE.Vector3();
    private _tmpCartCenter = new THREE.Vector3();
    private _tmpCartLeft = new THREE.Vector3();
    private _tmpCartRight = new THREE.Vector3();
    private _tmpCartHitch = new THREE.Vector3();
    private _tmpHitchPoint = new THREE.Vector3();
    private _tmpDiff = new THREE.Vector3();

    constructor(moon: Moon) {
        this.moon = moon;
        this.group = new THREE.Group();
        this.moon.group.add(this.group);

        this.visualBodyGroup = new THREE.Group();
        this.group.add(this.visualBodyGroup);

        this.dustGroup = new THREE.Group();
        this.moon.group.add(this.dustGroup);

        this.buildMesh();
        this.initDustParticles();
        this.trails = new RoverTrails(this.moon, this);
        this.applyConfig();
    }

    public setObstacleManager(manager: ObstacleManager): void {
        this.obstacleManager = manager;
    }

    public applyConfig(): void {
        const cfg = ConfigManager.current;
        const colorPreset = PROBE_COLOR_PRESETS.find((p) => p.id === cfg.probeColor) || PROBE_COLOR_PRESETS[0];
        if (this.yellowBodyMat) this.yellowBodyMat.color.set(colorPreset.body);
        if (this.yellowDarkMat) this.yellowDarkMat.color.set(colorPreset.dark);
        if (this.bristlePrimaryMat && this.bristleSecondaryMat && this.beaconMat) {
            if (colorPreset.id === 'yellow') {
                this.bristlePrimaryMat.color.set('#F97316');
                this.bristleSecondaryMat.color.set('#FEF08A');
                this.beaconMat.color.set('#FDE047');
            } else {
                const whiteCol = new THREE.Color('#FFFFFF');
                this.bristlePrimaryMat.color.set(colorPreset.dark);
                this.bristleSecondaryMat.color.set(colorPreset.body).lerp(whiteCol, 0.42);
                this.beaconMat.color.set(colorPreset.body).lerp(whiteCol, 0.35);
            }
        }

        this.stats.speed = cfg.probeSpeed;
        this.stats.sweeperPower = cfg.brushPower;
        this.stats.sweeperWidth = cfg.sweeperWidth;

        const baseCap = cfg.tankCapacity || 100;
        const count = THREE.MathUtils.clamp(Math.round(cfg.cartCount || 1), 1, 5);
        const scale = THREE.MathUtils.clamp(cfg.tankScale || 1.0, 0.5, 2.5);
        const length = THREE.MathUtils.clamp(cfg.tankLength || 1.0, 0.5, 2.5);
        this.stats.tankCapacity = Math.round(baseCap * count * Math.max(0.5, scale) * Math.max(0.5, length));
        this.updateSweeperVisualWidth();

        this.rebuildCarts(count);
        this.updateAllCartsStyle();

        // Rover and dust groups maintain constant physical world size (scale = 1.0)
        this.group.scale.set(1, 1, 1);
        this.dustGroup.scale.set(1, 1, 1);
    }

    /**
     * Builds a beveled 5-spoke stylized clay wheel rim geometry so wheel
     * rotation is clearly readable while looking chunky and cohesive.
     */
    private createCrossRimGeometry(halfLength: number, halfWidth: number, thickness: number): THREE.BufferGeometry {
        const shape = new THREE.Shape();
        const spokes = 5;
        const innerR = halfWidth * 1.45;
        const outerR = halfLength;
        const tipHalfAngle = Math.asin(THREE.MathUtils.clamp((halfWidth * 0.85) / outerR, 0.05, 0.45));
        const valleyHalfAngle = (Math.PI / spokes) * 0.52;

        for (let i = 0; i < spokes; i++) {
            const baseA = (i / spokes) * Math.PI * 2;
            const aTip1 = baseA - tipHalfAngle;
            const aTip2 = baseA + tipHalfAngle;
            const aNextBase = ((i + 1) / spokes) * Math.PI * 2;
            const aVal1 = baseA + valleyHalfAngle;
            const aVal2 = aNextBase - valleyHalfAngle;

            const p1x = Math.cos(aTip1) * outerR;
            const p1y = Math.sin(aTip1) * outerR;
            const p2x = Math.cos(aTip2) * outerR;
            const p2y = Math.sin(aTip2) * outerR;
            const v1x = Math.cos(aVal1) * innerR;
            const v1y = Math.sin(aVal1) * innerR;
            const v2x = Math.cos(aVal2) * innerR;
            const v2y = Math.sin(aVal2) * innerR;

            if (i === 0) {
                shape.moveTo(p1x, p1y);
            } else {
                shape.lineTo(p1x, p1y);
            }
            shape.lineTo(p2x, p2y);
            shape.lineTo(v1x, v1y);
            shape.lineTo(v2x, v2y);
        }
        shape.closePath();

        const geom = new THREE.ExtrudeGeometry(shape, {
            depth: thickness,
            bevelEnabled: true,
            bevelThickness: 0.0007,
            bevelSize: 0.0005,
            bevelSegments: 2
        });
        geom.center();
        geom.rotateY(Math.PI / 2);
        return geom;
    }

    /**
     * Creates a soft, chamfered/rounded clay box geometry (centered at origin)
     * so the probe hull feels sculpted and stylized instead of sharp-edged boxes.
     */
    private createRoundedBoxGeometry(
        w: number,
        h: number,
        d: number,
        cornerRadius: number,
        bevel = 0.0025
    ): THREE.BufferGeometry {
        const innerW = Math.max(0.002, w - bevel * 2);
        const innerH = Math.max(0.002, h - bevel * 2);
        const innerD = Math.max(0.002, d - bevel * 2);
        const r = Math.min(cornerRadius, innerW * 0.45, innerD * 0.45);
        const hw = innerW * 0.5;
        const hd = innerD * 0.5;

        const shape = new THREE.Shape();
        shape.moveTo(-hw + r, -hd);
        shape.lineTo(hw - r, -hd);
        shape.quadraticCurveTo(hw, -hd, hw, -hd + r);
        shape.lineTo(hw, hd - r);
        shape.quadraticCurveTo(hw, hd, hw - r, hd);
        shape.lineTo(-hw + r, hd);
        shape.quadraticCurveTo(-hw, hd, -hw, hd - r);
        shape.lineTo(-hw, -hd + r);
        shape.quadraticCurveTo(-hw, -hd, -hw + r, -hd);

        const geom = new THREE.ExtrudeGeometry(shape, {
            depth: innerH,
            bevelEnabled: true,
            bevelThickness: bevel,
            bevelSize: bevel,
            bevelSegments: 2,
            curveSegments: 6
        });
        geom.rotateX(Math.PI / 2);
        geom.center();
        return geom;
    }

    private buildMesh(): void {
        const yellowBodyMat = new THREE.MeshStandardMaterial({
            color: '#FACC15',
            roughness: 0.42,
            metalness: 0.08
        });
        const yellowDarkMat = new THREE.MeshStandardMaterial({
            color: '#EAB308',
            roughness: 0.48,
            metalness: 0.1
        });
        const darkChassisMat = new THREE.MeshStandardMaterial({
            color: '#1E293B',
            roughness: 0.65,
            metalness: 0.15
        });
        const visorMat = new THREE.MeshStandardMaterial({
            color: '#0F172A',
            roughness: 0.22,
            metalness: 0.4
        });
        const cyanGlowMat = new THREE.MeshBasicMaterial({ color: '#38BDF8' });
        const orangeBristleMat = new THREE.MeshStandardMaterial({
            color: '#F97316',
            roughness: 0.55
        });
        const lightBristleMat = new THREE.MeshStandardMaterial({
            color: '#FEF08A',
            roughness: 0.55
        });

        this.yellowBodyMat = yellowBodyMat;
        this.yellowDarkMat = yellowDarkMat;
        this.darkChassisMat = darkChassisMat;
        this.bristlePrimaryMat = orangeBristleMat;
        this.bristleSecondaryMat = lightBristleMat;
        this.beaconMat = new THREE.MeshBasicMaterial({ color: '#FDE047' });
        this.tickMat = new THREE.MeshBasicMaterial({
            color: '#93C5FD',
            transparent: true,
            opacity: 0.35,
            depthWrite: false
        });
        this.coreRodMat = new THREE.MeshStandardMaterial({
            color: '#E2E8F0',
            roughness: 0.15,
            metalness: 0.90
        });

        // 1. Sasis Bawah & Pelindung Kolong (Rounded Clay Chassis)
        const chassis = new THREE.Mesh(
            this.createRoundedBoxGeometry(0.072, 0.017, 0.118, 0.010, 0.002),
            darkChassisMat
        );
        chassis.position.set(0, 0.022, 0);
        attachOutline(chassis, { width: 0.0022 });
        this.visualBodyGroup.add(chassis);

        // Front Skid Bumper
        const frontBumper = new THREE.Mesh(
            this.createRoundedBoxGeometry(0.076, 0.011, 0.016, 0.005, 0.0018),
            darkChassisMat
        );
        frontBumper.position.set(0, 0.022, 0.062);
        attachOutline(frontBumper, { width: 0.0020 });
        this.visualBodyGroup.add(frontBumper);

        // 2. Bodi Utama Mobil (Clean Rounded Chibi Clay Hull)
        const mainBody = new THREE.Mesh(
            this.createRoundedBoxGeometry(0.084, 0.030, 0.118, 0.016, 0.003),
            yellowBodyMat
        );
        mainBody.position.set(0, 0.042, -0.004);
        attachOutline(mainBody, { width: 0.0024 });
        this.visualBodyGroup.add(mainBody);

        // Sculpted Sloped Front Hood + Cute Twin Headlights
        const frontHood = new THREE.Mesh(
            this.createRoundedBoxGeometry(0.074, 0.020, 0.044, 0.012, 0.0025),
            yellowDarkMat
        );
        frontHood.position.set(0, 0.040, 0.056);
        frontHood.rotation.x = 0.22;
        attachOutline(frontHood, { width: 0.0022 });
        this.visualBodyGroup.add(frontHood);

        const headlightLensMat = new THREE.MeshBasicMaterial({ color: '#FEF08A' });
        [-0.024, 0.024].forEach(xPos => {
            const bezel = new THREE.Mesh(
                new THREE.CylinderGeometry(0.0072, 0.0078, 0.006, 14),
                darkChassisMat
            );
            bezel.rotation.x = Math.PI / 2 + 0.20;
            bezel.position.set(xPos, 0.039, 0.075);
            attachOutline(bezel, { width: 0.0015 });
            this.visualBodyGroup.add(bezel);

            const lens = new THREE.Mesh(
                new THREE.CylinderGeometry(0.0050, 0.0050, 0.007, 14),
                headlightLensMat
            );
            lens.rotation.x = Math.PI / 2 + 0.20;
            lens.position.set(xPos, 0.039, 0.076);
            this.visualBodyGroup.add(lens);
        });

        // 3. Kabin Atas Rounded, Kaca Visor & Mata Ekspresif (Clean & Unobstructed)
        const cabin = new THREE.Mesh(
            this.createRoundedBoxGeometry(0.066, 0.026, 0.066, 0.015, 0.003),
            yellowBodyMat
        );
        cabin.position.set(0, 0.066, -0.010);
        attachOutline(cabin, { width: 0.0024 });
        this.visualBodyGroup.add(cabin);

        const visor = new THREE.Mesh(
            this.createRoundedBoxGeometry(0.058, 0.016, 0.016, 0.006, 0.002),
            visorMat
        );
        visor.position.set(0, 0.066, 0.019);
        attachOutline(visor, { width: 0.0020 });
        this.visualBodyGroup.add(visor);

        this.eyeLeftMesh = new THREE.Mesh(
            this.createRoundedBoxGeometry(0.013, 0.008, 0.004, 0.003, 0.0008),
            cyanGlowMat
        );
        this.eyeLeftMesh.position.set(-0.014, 0.066, 0.0265);
        this.visualBodyGroup.add(this.eyeLeftMesh);

        this.eyeRightMesh = new THREE.Mesh(
            this.createRoundedBoxGeometry(0.013, 0.008, 0.004, 0.003, 0.0008),
            cyanGlowMat
        );
        this.eyeRightMesh.position.set(0.014, 0.066, 0.0265);
        this.visualBodyGroup.add(this.eyeRightMesh);

        // Clean Rear Cabin Grille
        const rearGrille = new THREE.Mesh(
            this.createRoundedBoxGeometry(0.046, 0.016, 0.006, 0.004, 0.001),
            darkChassisMat
        );
        rearGrille.position.set(0, 0.062, -0.044);
        attachOutline(rearGrille, { width: 0.0018 });
        this.visualBodyGroup.add(rearGrille);

        const ventStripe = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.003, 0.007), yellowDarkMat);
        ventStripe.position.set(0, 0.062, -0.044);
        this.visualBodyGroup.add(ventStripe);

        // Rugged Probe Rear Bumper with Red Reflectors
        const probeRearBumper = new THREE.Mesh(
            this.createRoundedBoxGeometry(0.078, 0.014, 0.010, 0.005, 0.0015),
            darkChassisMat
        );
        probeRearBumper.position.set(0, 0.022, -0.060);
        attachOutline(probeRearBumper, { width: 0.0020 });
        this.visualBodyGroup.add(probeRearBumper);

        [-0.026, 0.026].forEach(xPos => {
            const tailReflector = new THREE.Mesh(
                new THREE.BoxGeometry(0.010, 0.005, 0.002),
                new THREE.MeshBasicMaterial({ color: '#EF4444' })
            );
            tailReflector.position.set(xPos, 0.023, -0.0645);
            this.visualBodyGroup.add(tailReflector);
        });

        // Heavy-Duty Tow Hitch Receiver & Ball on Rover Rear
        const hitchMount = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.008, 0.016), darkChassisMat);
        hitchMount.position.set(0, 0.020, -0.064);
        attachOutline(hitchMount, { width: 0.0018 });
        this.visualBodyGroup.add(hitchMount);

        const hitchBall = new THREE.Mesh(new THREE.SphereGeometry(0.005, 8, 8), darkChassisMat);
        hitchBall.position.set(0, 0.022, -0.070);
        this.visualBodyGroup.add(hitchBall);

        // Antena Suar
        const antennaStem = new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.0035, 0.036, 8), darkChassisMat);
        antennaStem.position.set(-0.020, 0.092, -0.030);
        attachOutline(antennaStem, { width: 0.0016 });
        this.visualBodyGroup.add(antennaStem);

        this.beaconMesh = new THREE.Mesh(
            new THREE.SphereGeometry(0.0075, 12, 12),
            this.beaconMat
        );
        this.beaconMesh.position.set(-0.020, 0.111, -0.030);
        attachOutline(this.beaconMesh, { width: 0.0018 });
        this.visualBodyGroup.add(this.beaconMesh);

        // 4. Empat Roda Cartoony (Layered with zero Z-fighting)
        this.wheelMeshes = [];
        this.frontWheelPivots = [];
        const roverRimGeom = this.createCrossRimGeometry(0.013, 0.0036, 0.0028);

        const createWheel = (isFront: boolean, sideSign: number) => {
            const pivot = new THREE.Group();
            pivot.position.set(sideSign * 0.052, 0.022, isFront ? 0.038 : -0.038);

            const wheelGroup = new THREE.Group();
            // Ban luar gelap (dark tire cylinder)
            const tire = new THREE.Mesh(
                new THREE.CylinderGeometry(0.022, 0.022, 0.018, 24),
                darkChassisMat
            );
            tire.rotation.z = Math.PI / 2;
            attachOutline(tire, { width: 0.0022 });
            wheelGroup.add(tire);

            // Ring velg luar (outer alloy lip) + velg 5-spoke beveled
            const rimRing = new THREE.Mesh(
                new THREE.TorusGeometry(0.0142, 0.0020, 8, 22),
                yellowDarkMat
            );
            rimRing.rotation.y = Math.PI / 2;
            rimRing.position.x = sideSign * 0.0091;
            attachOutline(rimRing, { width: 0.0014 });
            wheelGroup.add(rimRing);

            const hub = new THREE.Mesh(roverRimGeom, yellowBodyMat);
            hub.position.x = sideSign * 0.0095;
            attachOutline(hub, { width: 0.0016 });
            wheelGroup.add(hub);

            // Baut as tengah (center axle nut) menonjol sedikit di atas velg (zero z-fighting!)
            const nut = new THREE.Mesh(
                new THREE.CylinderGeometry(0.0046, 0.0052, 0.0026, 10),
                darkChassisMat
            );
            nut.rotation.z = Math.PI / 2;
            nut.position.x = sideSign * 0.0114;
            wheelGroup.add(nut);

            pivot.add(wheelGroup);
            this.visualBodyGroup.add(pivot);

            this.wheelMeshes.push(wheelGroup);
            if (isFront) this.frontWheelPivots.push(pivot);
        };

        createWheel(true, -1);
        createWheel(true, 1);
        createWheel(false, -1);
        createWheel(false, 1);

        // 5. Sikat Rol Sweeper Depan (Clean & Simple Clay Roller)
        this.sweeperAssemblyGroup = new THREE.Group();
        this.sweeperAssemblyGroup.position.set(0, 0.018, 0.098);
        this.visualBodyGroup.add(this.sweeperAssemblyGroup);

        const armGeom = this.createRoundedBoxGeometry(0.008, 0.009, 0.046, 0.003, 0.0012);
        [-0.032, 0.032].forEach(xPos => {
            const arm = new THREE.Mesh(armGeom, darkChassisMat);
            arm.position.set(xPos, 0.008, -0.022);
            arm.rotation.x = 0.25;
            attachOutline(arm, { width: 0.0018 });
            this.sweeperAssemblyGroup.add(arm);
        });

        this.sweeperRollerMesh = new THREE.Group();
        const coreCylinder = new THREE.Mesh(
            new THREE.CylinderGeometry(0.017, 0.017, 1.0, 20),
            orangeBristleMat
        );
        coreCylinder.rotation.z = Math.PI / 2;
        attachOutline(coreCylinder, { width: 0.0020 });
        this.sweeperRollerMesh.add(coreCylinder);

        // 4 clean bristle ribs (no noisy per-fin outlines)
        for (let b = 0; b < 4; b++) {
            const angle = (b / 4) * Math.PI;
            const bristleFin = new THREE.Mesh(
                new THREE.BoxGeometry(0.98, 0.038, 0.0045),
                b % 2 === 0 ? lightBristleMat : orangeBristleMat
            );
            bristleFin.rotation.x = angle;
            this.sweeperRollerMesh.add(bristleFin);
        }
        this.sweeperAssemblyGroup.add(this.sweeperRollerMesh);

        this.sweeperSideCaps = [];
        [-1, 1].forEach(side => {
            const cap = new THREE.Mesh(
                new THREE.CylinderGeometry(0.021, 0.023, 0.009, 18),
                yellowBodyMat
            );
            cap.rotation.z = Math.PI / 2;
            attachOutline(cap, { width: 0.0020 });
            this.sweeperAssemblyGroup.add(cap);
            this.sweeperSideCaps.push({ mesh: cap, side });
        });

        // 5b. Palu Depan (Dedicated overhead turret mount on front roof — sweeper stays always mounted below)
        this.hammerAssemblyGroup = new THREE.Group();
        this.hammerAssemblyGroup.position.set(0, 0.080, 0.046);
        this.hammerAssemblyGroup.visible = false;
        this.hammerAssemblyGroup.scale.setScalar(0.001);
        this.visualBodyGroup.add(this.hammerAssemblyGroup);

        this.hammerPivotGroup = new THREE.Group();
        this.hammerAssemblyGroup.add(this.hammerPivotGroup);

        // Articulated turret collar mounted high on front hood
        const hammerJoint = new THREE.Mesh(
            new THREE.CylinderGeometry(0.012, 0.013, 0.028, 14),
            yellowDarkMat
        );
        hammerJoint.rotation.z = Math.PI / 2;
        attachOutline(hammerJoint, { width: 0.0018 });
        this.hammerPivotGroup.add(hammerJoint);

        // Chunky mechanical hammer arm extending forward over the sweeper
        const hammerHandle = new THREE.Mesh(
            new THREE.BoxGeometry(0.013, 0.013, 0.086),
            darkChassisMat
        );
        hammerHandle.position.set(0, 0.004, 0.043);
        attachOutline(hammerHandle, { width: 0.0018 });
        this.hammerPivotGroup.add(hammerHandle);

        // Stylized Clay Hammer Head (aligned so bottom impact pad faces straight forward-down into the rock)
        const hammerCore = new THREE.Mesh(
            new THREE.CylinderGeometry(0.024, 0.024, 0.056, 18),
            new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.78, metalness: 0.08 })
        );
        hammerCore.position.set(0, 0.004, 0.090);
        attachOutline(hammerCore, { width: 0.0022 });
        this.hammerPivotGroup.add(hammerCore);

        // Vibrant Orange & Gold Impact Striking Caps (bottom cap is extra chunky striking face)
        [-1, 1].forEach(endSign => {
            const impactCap = new THREE.Mesh(
                new THREE.CylinderGeometry(0.027, 0.027, endSign < 0 ? 0.015 : 0.011, 18),
                endSign < 0 ? orangeBristleMat : yellowBodyMat
            );
            impactCap.position.set(0, 0.004 + endSign * 0.031, 0.090);
            attachOutline(impactCap, { width: 0.0020 });
            this.hammerPivotGroup.add(impactCap);
        });

        // Decorative yellow band around hammer center
        const hammerBand = new THREE.Mesh(
            new THREE.CylinderGeometry(0.0255, 0.0255, 0.011, 18),
            yellowBodyMat
        );
        hammerBand.position.set(0, 0.004, 0.090);
        attachOutline(hammerBand, { width: 0.0018 });
        this.hammerPivotGroup.add(hammerBand);

        // Build Multi-Cart Train & Tanks
        this.rebuildCarts(ConfigManager.current.cartCount || 1);
        this.updateSweeperVisualWidth();
    }

    private buildSingleCart(index: number, tankScale: number, tankLength: number): TrailerCart {
        const pivotGroup = new THREE.Group();
        this.moon.group.add(pivotGroup);

        // Compact, neat square box chassis
        const cartWidth = 0.054;
        const cartDepth = 0.054;
        const cartHeight = 0.016;
        const chassisCenterZ = -0.046;
        const frontZ = chassisCenterZ + cartDepth * 0.5; // -0.019
        const rearZ = chassisCenterZ - cartDepth * 0.5;  // -0.073
        const rearHitchZ = rearZ - 0.007;
        const wheelX = cartWidth * 0.5 + 0.008;

        // Trailer Drawbar / Tongue connecting hitch (0, 0, 0) to front face of compact box
        const tongueLen = Math.abs(frontZ) + 0.002;
        const tongue = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.006, tongueLen), this.darkChassisMat);
        tongue.position.set(0, 0.004, frontZ * 0.5);
        attachOutline(tongue, { width: 0.0018 });
        pivotGroup.add(tongue);

        // Body group shifts along -Z when cartSpacing changes, keeping hitch at (0,0,0)
        const bodyGroup = new THREE.Group();
        pivotGroup.add(bodyGroup);

        // Compact Rounded Clay Box Chassis Body
        const cartChassis = new THREE.Mesh(
            this.createRoundedBoxGeometry(cartWidth, cartHeight, cartDepth, 0.010, 0.002),
            this.darkChassisMat
        );
        cartChassis.position.set(0, cartHeight * 0.5, chassisCenterZ);
        attachOutline(cartChassis, { width: 0.0024 });
        bodyGroup.add(cartChassis);

        // Clean Rounded Rear Bumper Bar on the back of the cart
        const rearBumper = new THREE.Mesh(
            this.createRoundedBoxGeometry(cartWidth + 0.004, 0.011, 0.006, 0.003, 0.0012),
            this.yellowDarkMat
        );
        rearBumper.position.set(0, 0.008, rearZ);
        attachOutline(rearBumper, { width: 0.0020 });
        bodyGroup.add(rearBumper);

        // 4-Stage Rear Bumper Stardust Indicator LEDs (Placed back on the rear face)
        const cartLedMats: THREE.MeshBasicMaterial[] = [];
        const ledStep = 0.010;
        const ledPositions = [-ledStep * 1.5, -ledStep * 0.5, ledStep * 0.5, ledStep * 1.5];
        ledPositions.forEach(xOffset => {
            const mat = new THREE.MeshBasicMaterial({ color: '#1E293B' });
            const led = new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.005, 0.003), mat);
            led.position.set(xOffset, 0.008, rearZ - 0.002);
            bodyGroup.add(led);
            cartLedMats.push(mat);
        });
        const topGaugeMats: THREE.MeshBasicMaterial[] = cartLedMats;

        // Rear Hitch Mount & Ball for chaining subsequent carts
        const rearHitchMount = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.006, 0.008), this.darkChassisMat);
        rearHitchMount.position.set(0, 0.004, rearZ - 0.003);
        attachOutline(rearHitchMount, { width: 0.0018 });
        bodyGroup.add(rearHitchMount);

        const rearHitchBall = new THREE.Mesh(new THREE.SphereGeometry(0.0045, 8, 8), this.darkChassisMat);
        rearHitchBall.position.set(0, 0.004, rearHitchZ);
        bodyGroup.add(rearHitchBall);

        // Cart Wheels (2 wheels alongside the compact box chassis)
        const cartWheelMeshes: THREE.Group[] = [];
        const tireRadius = 0.018;
        const tireWidth = 0.012;
        const cartRimGeom = this.createCrossRimGeometry(0.0105, 0.0030, 0.0024);

        [-1, 1].forEach(side => {
            const wheelGroup = new THREE.Group();
            wheelGroup.position.set(side * wheelX, 0, chassisCenterZ);

            const tire = new THREE.Mesh(
                new THREE.CylinderGeometry(tireRadius, tireRadius, tireWidth, 18),
                this.darkChassisMat
            );
            tire.rotation.z = Math.PI / 2;
            attachOutline(tire, { width: 0.0022 });
            wheelGroup.add(tire);

            // Ring velg luar + velg 5-spoke beveled pada roda trailer
            const rimRing = new THREE.Mesh(
                new THREE.TorusGeometry(0.0115, 0.0016, 8, 18),
                this.yellowDarkMat
            );
            rimRing.rotation.y = Math.PI / 2;
            rimRing.position.x = side * (tireWidth * 0.5 + 0.0002);
            attachOutline(rimRing, { width: 0.0013 });
            wheelGroup.add(rimRing);

            const hub = new THREE.Mesh(cartRimGeom, this.yellowBodyMat);
            hub.position.x = side * (tireWidth * 0.5 + 0.0005);
            attachOutline(hub, { width: 0.0015 });
            wheelGroup.add(hub);

            const nut = new THREE.Mesh(
                new THREE.CylinderGeometry(0.0035, 0.0035, 0.002, 8),
                this.darkChassisMat
            );
            nut.rotation.z = Math.PI / 2;
            nut.position.x = side * (tireWidth * 0.5 + 0.0017);
            wheelGroup.add(nut);

            bodyGroup.add(wheelGroup);
            cartWheelMeshes.push(wheelGroup);
        });

        // Elevated Horizontal Vacuum Capsule Tank Position
        const yElevation = 0.038 + (tankScale - 1.0) * 0.018;

        // Clean & Simple Tank Cradle Pillars (2 rounded supports instead of 6 overlapping boxes)
        const cradleSpacing = Math.min(0.017 * tankLength, cartWidth * 0.30);
        const riserHeight = yElevation - cartHeight;
        const cradleGeom = this.createRoundedBoxGeometry(0.007, riserHeight + 0.004, 0.024 * Math.max(0.85, tankScale), 0.003, 0.001);
        [-cradleSpacing, cradleSpacing].forEach(xPos => {
            const pillar = new THREE.Mesh(cradleGeom, this.yellowDarkMat);
            pillar.position.set(xPos, cartHeight + riserHeight * 0.45, chassisCenterZ);
            attachOutline(pillar, { width: 0.0018 });
            bodyGroup.add(pillar);
        });

        // Horizontal Transparent Vacuum Capsule Tank Group
        const horizontalTankGroup = new THREE.Group();
        horizontalTankGroup.position.set(0, yElevation, chassisCenterZ);
        bodyGroup.add(horizontalTankGroup);

        // Clean Left & Right End Caps & Suction Docking Port Rings
        const capX = 0.034 * tankLength + 0.004 * tankScale;
        const suctionPortMat = new THREE.MeshStandardMaterial({
            color: '#09090B',
            roughness: 0.85,
            metalness: 0.2
        });
        const suctionHoleMat = new THREE.MeshBasicMaterial({ color: '#000000' });

        [-1, 1].forEach(side => {
            const cap = new THREE.Mesh(
                new THREE.CylinderGeometry(0.023 * tankScale, 0.0245 * tankScale, 0.008 * tankScale, 20),
                this.yellowDarkMat
            );
            cap.rotation.z = Math.PI / 2;
            cap.position.set(side * capX, 0, 0);
            attachOutline(cap, { width: 0.0022 });
            horizontalTankGroup.add(cap);

            // Clean circular docking ring on the side of the tank
            const portRing = new THREE.Mesh(
                new THREE.TorusGeometry(0.0115 * tankScale, 0.0024 * tankScale, 10, 24),
                suctionPortMat
            );
            portRing.rotation.y = Math.PI / 2;
            portRing.position.set(side * (capX + 0.0045 * tankScale), 0, 0);
            horizontalTankGroup.add(portRing);

            const portHole = new THREE.Mesh(
                new THREE.CylinderGeometry(0.0095 * tankScale, 0.0095 * tankScale, 0.003 * tankScale, 20),
                suctionHoleMat
            );
            portHole.rotation.z = Math.PI / 2;
            portHole.position.set(side * (capX + 0.004 * tankScale), 0, 0);
            horizontalTankGroup.add(portHole);
        });

        // Crystal-Clear Glass Capsule Tube
        const tankGlassMat = new THREE.MeshStandardMaterial({
            color: '#E0F2FE',
            roughness: 0.06,
            metalness: 0.12,
            transparent: true,
            opacity: ConfigManager.current.tankGlassOpacity ?? 0.28,
            depthWrite: false
        });
        const glassTube = new THREE.Mesh(
            new THREE.CylinderGeometry(0.022 * tankScale, 0.022 * tankScale, 0.068 * tankLength, 20),
            tankGlassMat
        );
        glassTube.rotation.z = Math.PI / 2;
        attachOutline(glassTube, { width: 0.0022, isGlass: true });
        horizontalTankGroup.add(glassTube);

        // Polished Chrome Center Rod
        const coreRod = new THREE.Mesh(
            new THREE.CylinderGeometry(0.0035 * tankScale, 0.0035 * tankScale, 0.068 * tankLength, 12),
            this.coreRodMat
        );
        coreRod.rotation.z = Math.PI / 2;
        horizontalTankGroup.add(coreRod);

        // 3 Delicate, Subtle Etched Calibration Tick Rings
        [-0.017 * tankLength, 0.0, 0.017 * tankLength].forEach(xPos => {
            const tickRing = new THREE.Mesh(
                new THREE.TorusGeometry(0.0222 * tankScale, 0.00030 * tankScale, 6, 24),
                this.tickMat
            );
            tickRing.rotation.y = Math.PI / 2;
            tickRing.position.set(xPos, 0, 0);
            horizontalTankGroup.add(tickRing);
        });

        // Radiant Luminous Stardust Layer Cylinders (Distinct unblended layers per tier)
        const glow = ConfigManager.current.tankGlowIntensity ?? 0.65;
        const tierFillMeshes: Record<number, THREE.Mesh> = {};
        const tierFillMats: Record<number, THREE.MeshStandardMaterial> = {};

        for (let t = 1; t <= 3; t++) {
            const col = DUST_TIER_COLORS[t];
            const mat = new THREE.MeshStandardMaterial({
                color: col,
                emissive: col,
                emissiveIntensity: glow,
                roughness: 0.35,
                metalness: 0.1,
                transparent: false
            });
            const mesh = new THREE.Mesh(
                new THREE.CylinderGeometry(0.020 * tankScale, 0.020 * tankScale, 1.0, 18),
                mat
            );
            mesh.rotation.z = Math.PI / 2;
            mesh.scale.set(1.0, 0.001, 1.0);
            mesh.position.set(-0.033 * tankLength, 0, 0);
            mesh.visible = false;
            horizontalTankGroup.add(mesh);

            tierFillMats[t] = mat;
            tierFillMeshes[t] = mesh;
        }

        const tankFillMesh = tierFillMeshes[1];
        const tankFillMat = tierFillMats[1];

        // Dummy floater mesh kept hidden and silent (no Z-fighting)
        const tankFloaterMat = new THREE.MeshStandardMaterial({ visible: false });
        const tankFloaterMesh = new THREE.Mesh(new THREE.BufferGeometry(), tankFloaterMat);
        tankFloaterMesh.visible = false;

        // Dust beads array kept empty so zero particles jitter or vibrate inside the vacuum
        const tankDustParticles: THREE.Mesh[] = [];

        return {
            pivotGroup,
            horizontalTankGroup,
            tankGlassMat,
            tankFillMesh,
            tankFillMat,
            tierFillMeshes,
            tierFillMats,
            tankFloaterMesh,
            tankFloaterMat,
            tankDustParticles,
            cartWheelMeshes,
            cartLedMats,
            topGaugeMats,
            tier1Dust: 0,
            tier2Dust: 0,
            tier3Dust: 0,
            visualTier1: 0,
            visualTier2: 0,
            visualTier3: 0,
            layerOrder: [],
            currentColor: DUST_TIER_COLORS[1].clone(),
            yaw: 0,
            targetYaw: 0,
            pitch: 0,
            targetPitch: 0,
            roll: 0,
            targetRoll: 0,
            visualFill: 0,
            targetFill: 0,
            axlePos: new THREE.Vector3(),
            hitchPos: new THREE.Vector3(),
            forward: new THREE.Vector3(0, 0, 1),
            up: new THREE.Vector3(0, 1, 0),
            bodyGroup,
            tongueMesh: tongue,
            chassisCenterZ,
            rearHitchZ,
            wheelX
        };
    }

    public rebuildCarts(count: number): void {
        const targetCount = THREE.MathUtils.clamp(Math.round(count), 1, 5);
        const preservedDust = this.stats.currentDust;
        const sharedMats = new Set<THREE.Material>([
            this.yellowBodyMat,
            this.yellowDarkMat,
            this.darkChassisMat,
            this.tickMat,
            this.coreRodMat
        ]);

        // Detach and dispose existing cart geometries/materials to prevent WebGL memory leaks
        for (const cart of this.trailerCarts) {
            if (cart.pivotGroup) {
                cart.pivotGroup.traverse((obj) => {
                    if ((obj as THREE.Mesh).isMesh) {
                        const mesh = obj as THREE.Mesh;
                        if (mesh.name !== 'outline' && mesh.geometry) {
                            mesh.geometry.dispose();
                        }
                        if (mesh.name !== 'outline' && mesh.material) {
                            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                            for (const m of mats) {
                                if (!sharedMats.has(m)) m.dispose();
                            }
                        }
                    }
                });
                if (cart.pivotGroup.parent) {
                    cart.pivotGroup.parent.remove(cart.pivotGroup);
                }
            }
        }
        this.trailerCarts = [];

        const tankScale = THREE.MathUtils.clamp(ConfigManager.current.tankScale || 1.0, 0.5, 2.5);
        const tankLength = THREE.MathUtils.clamp(ConfigManager.current.tankLength || 1.0, 0.5, 2.5);

        for (let i = 0; i < targetCount; i++) {
            const cart = this.buildSingleCart(i, tankScale, tankLength);
            this.trailerCarts.push(cart);
        }

        this.initCartPositions();
        this.syncAliases();
        this.updateAllCartsStyle();

        // Restore any dust that was in the tank before rebuilding carts
        if (preservedDust > 0.0001) {
            this.setDust(preservedDust);
        }
    }

    public initCartPositions(): void {
        const invMoonScale = 1.0 / Math.max(0.1, this.moon.moonScale);
        const spacing = THREE.MathUtils.clamp(ConfigManager.current.cartSpacing || 1.0, 0.6, 2.5);
        const extraGap = Math.max(-0.010, (spacing - 1.0) * 0.045);

        // Rover rear hitch in moon.group coordinates
        this._tmpCartHitch.set(0, 0.022, -0.070);
        this.visualBodyGroup.localToWorld(this._tmpCartHitch);
        this.moon.group.worldToLocal(this._tmpCartHitch);
        const currentHitch = this._tmpCartHitch.clone();

        // Reverse tangent heading on moon
        const backDir = this.forward.clone().negate().normalize();

        for (let i = 0; i < this.trailerCarts.length; i++) {
            const cart = this.trailerCarts[i];
            const axleOffset = Math.abs(cart.chassisCenterZ || -0.046);
            const axleDist = axleOffset + extraGap;
            cart.hitchPos.copy(currentHitch);

            // Place axle along reverse heading from hitch
            cart.axlePos.copy(currentHitch).addScaledVector(backDir, axleDist);
            const u = cart.axlePos.clone().normalize();
            const r = this.moon.sampleActualSurfaceRadiusAt(u.x, u.y, u.z);
            cart.axlePos.copy(u).multiplyScalar(r + 0.018);

            cart.forward.subVectors(cart.hitchPos, cart.axlePos).normalize();
            cart.up.copy(u);

            this._tmpLeft.crossVectors(cart.up, cart.forward).normalize();
            this._tmpSlopeNormal.crossVectors(cart.forward, this._tmpLeft).normalize();

            this._tmpBasisMat.makeBasis(this._tmpLeft, this._tmpSlopeNormal, cart.forward);
            cart.pivotGroup.position.copy(cart.hitchPos);
            cart.pivotGroup.quaternion.setFromRotationMatrix(this._tmpBasisMat);
            cart.pivotGroup.scale.set(1, 1, 1);

            if (cart.bodyGroup) {
                cart.bodyGroup.position.z = -extraGap;
            }
            if (cart.tongueMesh) {
                const frontZ = -0.019;
                const desiredLen = Math.abs(frontZ - extraGap) + 0.002;
                cart.tongueMesh.scale.z = desiredLen / 0.021;
                cart.tongueMesh.position.z = (frontZ - extraGap) * 0.5;
            }

            cart.pivotGroup.updateMatrixWorld(true);

            // Compute next hitch ball position
            this._tmpCartHitch.set(0, 0.004, (cart.rearHitchZ || -0.080) - extraGap);
            cart.pivotGroup.localToWorld(this._tmpCartHitch);
            this.moon.group.worldToLocal(this._tmpCartHitch);
            currentHitch.copy(this._tmpCartHitch);
        }
    }

    public updateTankScale(scale: number): void {
        ConfigManager.current.tankScale = THREE.MathUtils.clamp(scale, 0.5, 2.5);
        this.applyConfig();
    }

    public updateDustColorsFromMoon(): void {
        if (this.moon.currentPalette) {
            const p = this.moon.currentPalette;
            DUST_TIER_COLORS[1].set(p.dirt1Color);
            DUST_TIER_COLORS[2].set(p.dirt2Color);
            DUST_TIER_COLORS[3].set(p.dirt3Color);
            this.updateAllCartsStyle();
            this.trails?.updateColorFromMoon();
        }
    }

    public updateAllCartsStyle(): void {
        const cfg = ConfigManager.current;

        // Synchronize dynamic dust tier colors from the active moon palette
        if (this.moon.currentPalette) {
            const p = this.moon.currentPalette;
            DUST_TIER_COLORS[1].set(p.dirt1Color);
            DUST_TIER_COLORS[2].set(p.dirt2Color);
            DUST_TIER_COLORS[3].set(p.dirt3Color);
        }

        let fillCol: THREE.Color;
        const style = cfg.tankColorStyle || 'palette';
        if (style === 'cyan') {
            fillCol = new THREE.Color('#38BDF8');
        } else if (style === 'gold') {
            fillCol = new THREE.Color('#FACC15');
        } else if (style === 'magenta') {
            fillCol = new THREE.Color('#F43F5E');
        } else if (style === 'emerald') {
            fillCol = new THREE.Color('#10B981');
        } else if (style === 'amethyst') {
            fillCol = new THREE.Color('#A855F7');
        } else if (this.moon.currentPalette) {
            const p = this.moon.currentPalette;
            fillCol = new THREE.Color(p.baseColor);
            const hsl = { h: 0, s: 0, l: 0 };
            fillCol.getHSL(hsl);
            fillCol.setHSL(hsl.h, Math.max(0.78, hsl.s), 0.55);
        } else {
            fillCol = new THREE.Color('#38BDF8');
        }

        const glow = cfg.tankGlowIntensity ?? 0.65;
        const glassOpacity = cfg.tankGlassOpacity ?? 0.28;

        for (const cart of this.trailerCarts) {
            if (cart.tankGlassMat) {
                cart.tankGlassMat.opacity = glassOpacity;
            }
            if (cart.tierFillMats) {
                for (let t = 1; t <= 3; t++) {
                    const mat = cart.tierFillMats[t];
                    if (mat) {
                        mat.color.copy(DUST_TIER_COLORS[t]);
                        mat.emissive.copy(DUST_TIER_COLORS[t]);
                        mat.emissiveIntensity = glow;
                    }
                }
            }
            if (cart.tankFillMat) {
                cart.tankFillMat.emissiveIntensity = glow;
            }
        }

        this.syncAliases();
    }

    private syncAliases(): void {
        const c0 = this.trailerCarts[0];
        if (!c0) return;
        this.cartPivotGroup = c0.pivotGroup;
        this.horizontalTankGroup = c0.horizontalTankGroup;
        this.tankGlassMat = c0.tankGlassMat;
        this.tankFillMesh = c0.tankFillMesh;
        this.tankFillMat = c0.tankFillMat;
        this.tankFloaterMesh = c0.tankFloaterMesh;
        this.tankFloaterMat = c0.tankFloaterMat;
        this.tankDustParticles = c0.tankDustParticles;
        this.cartWheelMeshes = c0.cartWheelMeshes;
        this.cartLedMats = c0.cartLedMats;
        this.topGaugeMats = c0.topGaugeMats;
        this.cartYaw = c0.yaw;
        this.targetCartYaw = c0.targetYaw;
    }

    public updateSweeperVisualWidth(): void {
        if (!this.sweeperRollerMesh) return;
        const visualWidth = this.stats.sweeperWidth * 0.96;
        this.sweeperRollerMesh.scale.set(visualWidth, 1, 1);

        this.sweeperSideCaps.forEach(item => {
            item.mesh.position.set(item.side * (visualWidth * 0.5 + 0.004), 0, 0);
        });
    }

    private initDustParticles(): void {
        const puffGeom = new THREE.IcosahedronGeometry(0.013, 1);
        const puffMat = new THREE.MeshStandardMaterial({
            color: '#FFFFFF',
            roughness: 0.85,
            metalness: 0.0
        });

        this.dustInstanced = new THREE.InstancedMesh(puffGeom, puffMat, this.MAX_DUST);
        this.dustInstanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.dustInstanced.frustumCulled = false;

        const outlineGeom = new THREE.IcosahedronGeometry(0.0158, 1);
        const outlineMat = new THREE.MeshBasicMaterial({
            color: '#000000',
            side: THREE.BackSide
        });
        this.dustOutlineInstanced = new THREE.InstancedMesh(outlineGeom, outlineMat, this.MAX_DUST);
        this.dustOutlineInstanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.dustOutlineInstanced.frustumCulled = false;

        this.dustDummy.scale.setScalar(0);
        this.dustDummy.updateMatrix();
        const defaultCol = new THREE.Color('#948CA8');

        for (let i = 0; i < this.MAX_DUST; i++) {
            this.dustInstanced.setMatrixAt(i, this.dustDummy.matrix);
            this.dustOutlineInstanced.setMatrixAt(i, this.dustDummy.matrix);
            this.dustInstanced.setColorAt(i, defaultCol);
            this.dustParticles.push({
                active: false,
                pos: new THREE.Vector3(),
                vel: new THREE.Vector3(),
                rot: new THREE.Euler(),
                rotVel: new THREE.Vector3(),
                life: 0,
                maxLife: 0.45,
                scale: 1
            });
        }
        this.dustInstanced.instanceMatrix.needsUpdate = true;
        this.dustOutlineInstanced.instanceMatrix.needsUpdate = true;
        if (this.dustInstanced.instanceColor) this.dustInstanced.instanceColor.needsUpdate = true;
        this.dustGroup.add(this.dustInstanced);
        this.dustGroup.add(this.dustOutlineInstanced);
    }

    public preWarmMaterials(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): void {
        const prevVis = this.dustInstanced.visible;
        const prevOutlineVis = this.dustOutlineInstanced.visible;
        this.dustInstanced.visible = true;
        this.dustOutlineInstanced.visible = true;

        const prevTierVis: { [key: string]: boolean } = {};
        for (let c = 0; c < this.trailerCarts.length; c++) {
            const cart = this.trailerCarts[c];
            if (cart.tierFillMeshes) {
                for (let t = 1; t <= 3; t++) {
                    const m = cart.tierFillMeshes[t];
                    if (m) {
                        prevTierVis[`${c}_${t}`] = m.visible;
                        m.visible = true;
                    }
                }
            }
        }

        renderer.compile(scene, camera);

        this.dustInstanced.visible = prevVis;
        this.dustOutlineInstanced.visible = prevOutlineVis;
        for (let c = 0; c < this.trailerCarts.length; c++) {
            const cart = this.trailerCarts[c];
            if (cart.tierFillMeshes) {
                for (let t = 1; t <= 3; t++) {
                    const m = cart.tierFillMeshes[t];
                    if (m) {
                        m.visible = prevTierVis[`${c}_${t}`];
                    }
                }
            }
        }
    }

    public spawnDustPuff(originLocal: THREE.Vector3, velLocal: THREE.Vector3, tier = 1): void {
        const idx = this.dustSpawnCursor;
        const p = this.dustParticles[idx];
        this.dustSpawnCursor = (this.dustSpawnCursor + 1) % this.MAX_DUST;

        p.active = true;
        p.pos.copy(originLocal);
        p.vel.copy(velLocal);
        p.rot.set(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28);
        p.rotVel.set((Math.random() - 0.5) * 7, (Math.random() - 0.5) * 7, (Math.random() - 0.5) * 7);
        p.life = 0;
        p.maxLife = 0.28 + Math.random() * 0.18;
        p.scale = 0.80 + Math.random() * 0.70;

        // Match exact color of the swept dust tier on the moon
        const baseCol = DUST_TIER_COLORS[tier] || DUST_TIER_COLORS[1];
        this._tmpParticleColor.copy(baseCol);
        this.dustInstanced.setColorAt(idx, this._tmpParticleColor);
        if (this.dustInstanced.instanceColor) {
            this.dustInstanced.instanceColor.needsUpdate = true;
        }
    }

    public updateDustParticles(dt: number): void {
        let anyUpdated = false;
        const drag = Math.exp(-3.2 * dt);

        for (let i = 0; i < this.MAX_DUST; i++) {
            const p = this.dustParticles[i];
            if (!p.active) continue;

            anyUpdated = true;
            p.life += dt;
            if (p.life >= p.maxLife) {
                p.active = false;
                this.dustDummy.scale.setScalar(0);
                this.dustDummy.updateMatrix();
                this.dustInstanced.setMatrixAt(i, this.dustDummy.matrix);
                this.dustOutlineInstanced.setMatrixAt(i, this.dustDummy.matrix);
                continue;
            }

            const t = p.life / p.maxLife;
            // Arc back toward lunar surface along -rover.up + air drag
            p.vel.addScaledVector(this.up, -0.48 * dt);
            p.vel.multiplyScalar(drag);
            p.pos.addScaledVector(p.vel, dt);

            p.rot.x += p.rotVel.x * dt;
            p.rot.y += p.rotVel.y * dt;
            p.rot.z += p.rotVel.z * dt;

            // Smooth pop-in & shrink-to-zero curve
            const popScale = Math.pow(Math.sin(t * Math.PI), 0.65) * p.scale;

            this.dustDummy.position.copy(p.pos);
            this.dustDummy.rotation.copy(p.rot);
            this.dustDummy.scale.setScalar(popScale);
            this.dustDummy.updateMatrix();
            this.dustInstanced.setMatrixAt(i, this.dustDummy.matrix);
            this.dustOutlineInstanced.setMatrixAt(i, this.dustDummy.matrix);
        }

        if (anyUpdated) {
            this.dustInstanced.instanceMatrix.needsUpdate = true;
            this.dustOutlineInstanced.instanceMatrix.needsUpdate = true;
        }
    }

    public resetPosition(): void {
        const R = Math.max(0.5, this.moon.moonScale);
        // Spawn parked neatly on the base pad (~0.20 world units South of the rocket)
        const thetaSpawn = Math.min(0.40, 0.20 / R);
        const cosT = Math.cos(thetaSpawn);
        const sinT = Math.sin(thetaSpawn);

        // Rover stands at (0, cosT, sinT) on lunar ground
        this.up.set(0, cosT, sinT).normalize();
        // Faces outward into the lunar world (South tangent along +Z away from the rocket)
        this.forward.set(0, -sinT, cosT).normalize();
        this.left.set(1, 0, 0);

        this.speed = 0;
        this.steerAngle = 0;
        this.pitchLean = 0;
        this.rollLean = 0;
        this.cartYaw = 0;
        this.targetCartYaw = 0;
        this.stats.currentDust = 0;
        this.visualTankFill = 0;
        this.isActivelySweeping = false;
        if (this.trails) this.trails.clear();
        this.currentSweepSlowdown = 0;
        this.targetSweepSlowdown = 0;
        this.activeSweepTier = 0;

        // Reset tool swap state to sweeper
        this.isHammerMode = false;
        this.targetRock = null;
        this.hammerAnimT = 0.0;
        this.hammerSwingPhase = 0.0;
        this.hammerHitFired = false;
        this.hammerYaw = 0.0;
        this.hammerRecoil = 0.0;
        this.sweeperLiftT = 0.0;
        this.sweeperSpinSpeed = 1.0;
        if (this.sweeperAssemblyGroup) {
            this.sweeperAssemblyGroup.visible = true;
            this.sweeperAssemblyGroup.scale.set(1, 1, 1);
            this.sweeperAssemblyGroup.position.set(0, 0.018, 0.098);
            this.sweeperAssemblyGroup.rotation.x = 0;
        }
        if (this.hammerAssemblyGroup) {
            this.hammerAssemblyGroup.visible = false;
            this.hammerAssemblyGroup.scale.setScalar(0.001);
            this.hammerAssemblyGroup.rotation.y = 0;
        }

        const tankLength = ConfigManager.current.tankLength || 1.0;
        for (const cart of this.trailerCarts) {
            cart.yaw = 0;
            cart.targetYaw = 0;
            cart.pitch = 0;
            cart.targetPitch = 0;
            cart.roll = 0;
            cart.targetRoll = 0;
            cart.visualFill = 0;
            cart.targetFill = 0;
            if (cart.pivotGroup) {
                cart.pivotGroup.rotation.set(0, 0, 0);
            }
            if (cart.tankFillMesh) {
                cart.tankFillMesh.scale.set(1.0, 0.001, 1.0);
                cart.tankFillMesh.position.set(-0.033 * tankLength, 0, 0);
            }
            if (cart.tankFloaterMesh) {
                cart.tankFloaterMesh.visible = false;
                cart.tankFloaterMesh.position.set(-0.033 * tankLength, 0, 0);
            }
            cart.tier1Dust = 0;
            cart.tier2Dust = 0;
            cart.tier3Dust = 0;
            cart.visualTier1 = 0;
            cart.visualTier2 = 0;
            cart.visualTier3 = 0;
            cart.layerOrder = [];
            cart.currentColor.copy(DUST_TIER_COLORS[1]);
            if (cart.tierFillMeshes) {
                for (let t = 1; t <= 3; t++) {
                    const m = cart.tierFillMeshes[t];
                    if (m) {
                        m.visible = false;
                        m.scale.set(1.0, 0.001, 1.0);
                        m.position.set(-0.033 * tankLength, 0, 0);
                    }
                }
            }
            for (let i = 0; i < cart.cartLedMats.length; i++) {
                cart.cartLedMats[i].color.set('#1E293B');
            }
            for (let i = 0; i < cart.topGaugeMats.length; i++) {
                cart.topGaugeMats[i].color.set('#1E293B');
            }
        }

        this.syncAliases();
        this.applyConfig();
        this.initCartPositions();
        this.updateTransform(0.016);
    }

    public addDustTiers(t1: number, t2: number, t3: number): void {
        const incoming = t1 + t2 + t3;
        if (incoming <= 0) return;

        const maxCanAdd = Math.max(0, this.stats.tankCapacity - this.stats.currentDust);
        if (maxCanAdd <= 0) return;

        const scale = incoming > maxCanAdd ? (maxCanAdd / incoming) : 1.0;
        let rem1 = t1 * scale;
        let rem2 = t2 * scale;
        let rem3 = t3 * scale;
        let remTotal = rem1 + rem2 + rem3;

        this.stats.currentDust = Math.min(this.stats.tankCapacity, this.stats.currentDust + remTotal);

        const numCarts = Math.max(1, this.trailerCarts.length);
        const cartCap = this.stats.tankCapacity / numCarts;

        // Distribute sequentially into carts
        for (let i = 0; i < this.trailerCarts.length && remTotal > 0.0001; i++) {
            const cart = this.trailerCarts[i];
            const currentInCart = cart.tier1Dust + cart.tier2Dust + cart.tier3Dust;
            const roomInCart = Math.max(0, cartCap - currentInCart);

            if (roomInCart > 0.0001) {
                const takeTotal = Math.min(roomInCart, remTotal);
                const frac = takeTotal / remTotal;

                const add1 = rem1 * frac;
                const add2 = rem2 * frac;
                const add3 = rem3 * frac;

                if (add1 > 0.0001) {
                    cart.tier1Dust += add1;
                    if (!cart.layerOrder.includes(1)) cart.layerOrder.push(1);
                }
                if (add2 > 0.0001) {
                    cart.tier2Dust += add2;
                    if (!cart.layerOrder.includes(2)) cart.layerOrder.push(2);
                }
                if (add3 > 0.0001) {
                    cart.tier3Dust += add3;
                    if (!cart.layerOrder.includes(3)) cart.layerOrder.push(3);
                }

                rem1 -= add1;
                rem2 -= add2;
                rem3 -= add3;
                remTotal -= takeTotal;
            }
        }
    }

    public addDust(amount: number, tier = 1): void {
        if (tier >= 3) {
            this.addDustTiers(0, 0, amount);
        } else if (tier >= 2) {
            this.addDustTiers(0, amount, 0);
        } else {
            this.addDustTiers(amount, 0, 0);
        }
    }

    public removeDust(amount: number): void {
        if (this.stats.currentDust <= 0) return;
        const toRemove = Math.min(this.stats.currentDust, amount);
        this.stats.currentDust = Math.max(0, this.stats.currentDust - toRemove);

        // Sequentially drain starting from highest cart and last layer in that cart
        let rem = toRemove;
        for (let i = this.trailerCarts.length - 1; i >= 0 && rem > 0; i--) {
            const cart = this.trailerCarts[i];
            for (let l = cart.layerOrder.length - 1; l >= 0 && rem > 0.0001; l--) {
                const tier = cart.layerOrder[l];
                let currentInTier = 0;
                if (tier === 1) currentInTier = cart.tier1Dust;
                else if (tier === 2) currentInTier = cart.tier2Dust;
                else if (tier === 3) currentInTier = cart.tier3Dust;

                if (currentInTier > 0.0001) {
                    const take = Math.min(currentInTier, rem);
                    if (tier === 1) cart.tier1Dust = Math.max(0, cart.tier1Dust - take);
                    else if (tier === 2) cart.tier2Dust = Math.max(0, cart.tier2Dust - take);
                    else if (tier === 3) cart.tier3Dust = Math.max(0, cart.tier3Dust - take);
                    rem -= take;

                    if (tier === 1 && cart.tier1Dust <= 0.0001) cart.tier1Dust = 0;
                    if (tier === 2 && cart.tier2Dust <= 0.0001) cart.tier2Dust = 0;
                    if (tier === 3 && cart.tier3Dust <= 0.0001) cart.tier3Dust = 0;
                }
            }

            cart.layerOrder = cart.layerOrder.filter(t => {
                if (t === 1) return cart.tier1Dust > 0.0001;
                if (t === 2) return cart.tier2Dust > 0.0001;
                if (t === 3) return cart.tier3Dust > 0.0001;
                return false;
            });
        }

        if (this.stats.currentDust <= 0.0001) {
            for (const cart of this.trailerCarts) {
                cart.tier1Dust = 0;
                cart.tier2Dust = 0;
                cart.tier3Dust = 0;
                cart.layerOrder = [];
            }
        }
    }

    public isTankFull(): boolean {
        return this.stats.currentDust >= (this.stats.tankCapacity - 0.001);
    }

    /**
     * Returns the exact world coordinates and normal vector of a cart's lateral suction docking port.
     * Automatically picks the side (left or right) closest to targetPos (the Rocket).
     */
    public getCartSuctionPortWorld(
        cartIndex: number,
        targetPos?: THREE.Vector3,
        outPos = new THREE.Vector3(),
        outNormal = new THREE.Vector3()
    ): { position: THREE.Vector3; normal: THREE.Vector3 } {
        if (this.trailerCarts.length === 0 || cartIndex < 0 || cartIndex >= this.trailerCarts.length) {
            this.visualBodyGroup.getWorldPosition(outPos);
            outNormal.copy(this.left).negate();
            return { position: outPos, normal: outNormal };
        }

        const cart = this.trailerCarts[cartIndex];
        cart.pivotGroup.updateMatrixWorld(true);
        const tankGroup = cart.horizontalTankGroup;
        tankGroup.updateMatrixWorld(true);

        const cfg = ConfigManager.current;
        const tankScale = cfg.tankScale || 1.0;
        const tankLength = cfg.tankLength || 1.0;
        const portX = 0.034 * tankLength + 0.0095 * tankScale;

        // Both left (-X) and right (+X) ports in tank local space
        const leftLocal = new THREE.Vector3(-portX, 0, 0);
        const rightLocal = new THREE.Vector3(portX, 0, 0);

        const leftWorld = leftLocal.applyMatrix4(tankGroup.matrixWorld);
        const rightWorld = rightLocal.applyMatrix4(tankGroup.matrixWorld);

        // Pick side closest to targetPos (the Rocket)
        if (targetPos && rightWorld.distanceTo(targetPos) < leftWorld.distanceTo(targetPos)) {
            outPos.copy(rightWorld);
            outNormal.set(1, 0, 0).transformDirection(tankGroup.matrixWorld).normalize();
        } else {
            outPos.copy(leftWorld);
            outNormal.set(-1, 0, 0).transformDirection(tankGroup.matrixWorld).normalize();
        }

        return { position: outPos, normal: outNormal };
    }

    /**
     * Determines which cart is currently being unloaded (sequential emptying: highest cart with dust first).
     */
    public getActiveUnloadingCartIndex(): number {
        const numCarts = this.trailerCarts.length;
        if (numCarts === 0) return -1;
        const cartCap = this.stats.tankCapacity / numCarts;
        for (let i = numCarts - 1; i >= 0; i--) {
            const startThreshold = i * cartCap;
            if (this.stats.currentDust > startThreshold + 0.01) {
                return i;
            }
        }
        return 0;
    }

    public getActiveUnloadingTier(): number {
        const activeIdx = this.getActiveUnloadingCartIndex();
        if (activeIdx >= 0 && activeIdx < this.trailerCarts.length) {
            const cart = this.trailerCarts[activeIdx];
            for (let i = cart.layerOrder.length - 1; i >= 0; i--) {
                const tier = cart.layerOrder[i];
                const amt = tier === 1 ? cart.tier1Dust : (tier === 2 ? cart.tier2Dust : cart.tier3Dust);
                if (amt > 0.001) {
                    return tier;
                }
            }
        }
        return 1;
    }

    /**
     * Returns the current stardust color inside the active/dominant vacuum tank.
     */
    public getVacuumDustColor(out = new THREE.Color()): THREE.Color {
        const tier = this.getActiveUnloadingTier();
        return out.copy(DUST_TIER_COLORS[tier] || DUST_TIER_COLORS[1]);
    }

    public setDust(amount: number): void {
        const clamped = THREE.MathUtils.clamp(amount, 0, this.stats.tankCapacity);
        this.stats.currentDust = 0;
        for (const cart of this.trailerCarts) {
            cart.tier1Dust = 0;
            cart.tier2Dust = 0;
            cart.tier3Dust = 0;
            cart.layerOrder = [];
        }
        if (clamped > 0.0001) {
            this.addDustTiers(clamped, 0, 0);
        }
    }

    public setDustPercent(pct: number): void {
        const fraction = THREE.MathUtils.clamp(pct, 0, 100) / 100;
        this.setDust(fraction * this.stats.tankCapacity);
    }

    // Active sweeping drag & slowdown
    public isActivelySweeping = false;
    public lastSweepTime = 0; // Timestamp of the last swept dirt (ms)
    public currentSweepSlowdown = 0.0; // 0.0 = normal speed, 0.10 = 10% slower, 0.50 = 50% slower, 0.90 = 90% slower
    private targetSweepSlowdown = 0.0;
    public activeSweepTier = 0;

    public setSweepingState(isSweeping: boolean, penalty: number, tier: number): void {
        this.isActivelySweeping = isSweeping;
        if (isSweeping) {
            this.lastSweepTime = performance.now();
        }
        this.targetSweepSlowdown = isSweeping ? penalty : 0.0;
        this.activeSweepTier = isSweeping ? tier : 0;
    }

    public getTimeSinceLastSweep(): number {
        if (this.lastSweepTime === 0) return 999999;
        return (performance.now() - this.lastSweepTime) * 0.001; // in seconds
    }

    public updatePhysics(throttle: number, steer: number, dt: number): void {
        const cfg = ConfigManager.current;

        // Smoothly interpolate sweeping drag penalty (responsive onset when hitting dirt, smooth recovery when clean)
        const lerpRate = this.targetSweepSlowdown > this.currentSweepSlowdown ? 16.0 : 8.0;
        this.currentSweepSlowdown += (this.targetSweepSlowdown - this.currentSweepSlowdown) * (1 - Math.exp(-lerpRate * dt));

        // Speed multiplier: 1.0 on clean ground, down to 0.90 on Tier 1 (-10%), 0.50 on Tier 2 (-50%), 0.10 on Tier 3 (-90%)
        const sweepSpeedMult = Math.max(0.08, 1.0 - this.currentSweepSlowdown);

        const maxForwardSpeed = 0.58 * cfg.probeSpeed * sweepSpeedMult;
        // Reverse speed is ~45% of forward speed for realistic heavy rover handling
        const maxReverseSpeed = maxForwardSpeed * 0.45;

        let targetSpeed = 0;
        let accelRate = cfg.accelRate;

        if (throttle > 0) {
            targetSpeed = throttle * maxForwardSpeed;
            // Higher braking drag when driving into thick dirt
            const dragMult = 1.0 + this.currentSweepSlowdown * 2.5;
            accelRate = this.speed > targetSpeed ? (cfg.accelRate * dragMult) : cfg.accelRate;
        } else if (throttle < 0) {
            targetSpeed = throttle * maxReverseSpeed; // Slower, deliberate reverse speed
            accelRate = cfg.accelRate * 0.60;       // Smooth, gentle reverse acceleration
        } else if (steer !== 0) {
            // Reverted back as requested: subtle, gentle creep (or near stationary)
            targetSpeed = Math.abs(steer) * maxForwardSpeed * 0.12;
            accelRate = cfg.accelRate * 0.75;
        } else {
            targetSpeed = 0;
            accelRate = cfg.accelRate * 0.75;       // Natural rolling friction deceleration
        }

        const prevSpeed = this.speed;
        this.speed += (targetSpeed - this.speed) * (1 - Math.exp(-accelRate * dt));

        // Steering
        this.steerAngle += (steer * 0.45 - this.steerAngle) * (1 - Math.exp(-12 * dt));
        const reverseSign = this.speed < -0.02 ? -1 : 1;
        const effectiveTurn = steer !== 0 ? steer * reverseSign : 0;

        if (effectiveTurn !== 0) {
            const isReversing = this.speed < -0.02;
            const turnRate = cfg.turnRate * (0.55 + 0.45 * Math.min(1.3, cfg.probeSpeed)) * (isReversing ? 0.78 : 1.0);
            const dYaw = effectiveTurn * turnRate * dt;
            this.forward.applyAxisAngle(this.up, dYaw).normalize();
        }

        // Re-orthogonalize basis (X = left, Y = up, Z = forward)
        this.left.crossVectors(this.up, this.forward).normalize();
        this.forward.crossVectors(this.left, this.up).normalize();

        // Great-circle translation around left axis (linear speed in world space / moon radius)
        if (Math.abs(this.speed) > 0.0005) {
            const angularStep = (this.speed / Math.max(0.1, this.moon.moonScale)) * dt;
            this.up.applyAxisAngle(this.left, angularStep).normalize();
            this.forward.applyAxisAngle(this.left, angularStep).normalize();

            this.left.crossVectors(this.up, this.forward).normalize();
            this.forward.crossVectors(this.left, this.up).normalize();
        }

        // Indestructible/destructible lunar boulder sliding collision & auto Sweeper <-> Hammer detection
        if (this.obstacleManager) {
            this.speed = this.obstacleManager.resolveRoverCollision(this.up, this.forward, this.left, this.speed);
            this.targetRock = this.obstacleManager.getTargetRockAhead(this.up, this.forward, this.isHammerMode);
            this.isHammerMode = this.targetRock !== null;
        } else {
            this.targetRock = null;
            this.isHammerMode = false;
        }
        this.updateToolSwapAnimation(dt);

        // Dynamic Suspension Tilt & Roll (Scaled by config) + hammer slam recoil
        this.hammerRecoil = Math.max(0, this.hammerRecoil - dt * 6.5);
        const accel = (this.speed - prevSpeed) / dt;
        const targetPitch = Math.max(-0.06, Math.min(0.08, -accel * 0.018 * cfg.suspensionPitch)) - this.hammerRecoil * 0.045;
        const targetRoll = Math.max(-0.08, Math.min(0.08, this.steerAngle * 0.12 * Math.sign(this.speed || 1) * cfg.suspensionRoll));

        this.pitchLean += (targetPitch - this.pitchLean) * (1 - Math.exp(-10 * dt));
        this.rollLean += (targetRoll - this.rollLean) * (1 - Math.exp(-8 * dt));

        // Remove previous frame's additive sweep vibration before applying new one
        this.visualBodyGroup.position.x -= this.lastVibX;
        this.visualBodyGroup.position.y -= this.lastVibY;
        this.visualBodyGroup.rotation.x = this.pitchLean;
        this.visualBodyGroup.rotation.z = this.rollLean;

        const targetEffort = (this.isActivelySweeping && !this.isHammerMode && this.activeSweepTier >= 2)
            ? (this.activeSweepTier === 3 ? 1.0 : 0.48)
            : 0.0;
        const vibNow = performance.now() * 0.001;
        if (targetEffort > 0.01) {
            this.lastVibX = Math.sin(vibNow * 68.0) * 0.0007 * targetEffort;
            this.lastVibY = Math.cos(vibNow * 84.0) * 0.00045 * targetEffort;
            this.lastVibPitch = Math.cos(vibNow * 62.0) * 0.004 * targetEffort;
            this.lastVibRoll = Math.sin(vibNow * 58.0) * 0.006 * targetEffort;
            this.visualBodyGroup.position.x += this.lastVibX;
            this.visualBodyGroup.position.y += this.lastVibY;
            this.visualBodyGroup.rotation.x += this.lastVibPitch;
            this.visualBodyGroup.rotation.z += this.lastVibRoll;
        } else {
            this.lastVibX = 0;
            this.lastVibY = 0;
            this.lastVibPitch = 0;
            this.lastVibRoll = 0;
        }

        // Sweeper lift & spin-stop animation when vacuum tank is full
        const tankFull = this.isTankFull();
        const targetLift = tankFull ? 1.0 : 0.0;
        const targetSpin = tankFull ? 0.0 : 1.0;
        this.sweeperLiftT += (targetLift - this.sweeperLiftT) * (1 - Math.exp(-9.0 * dt));
        this.sweeperSpinSpeed += (targetSpin - this.sweeperSpinSpeed) * (1 - Math.exp(-8.0 * dt));
        if (this.sweeperSpinSpeed < 0.005 && tankFull) this.sweeperSpinSpeed = 0.0;

        if (this.sweeperAssemblyGroup) {
            this.sweeperAssemblyGroup.position.set(
                0,
                0.018 + 0.026 * this.sweeperLiftT,
                0.098 - 0.006 * this.sweeperLiftT
            );
            this.sweeperAssemblyGroup.rotation.x = -0.32 * this.sweeperLiftT;
        }

        // Spin animations
        this.wheelSpin += (this.speed / 0.022) * dt;
        this.sweeperSpin += (10.0 + Math.abs(this.speed) * 28.0) * dt * this.sweeperSpinSpeed;

        for (let i = 0; i < this.wheelMeshes.length; i++) {
            this.wheelMeshes[i].rotation.x = this.wheelSpin;
        }
        for (let i = 0; i < this.frontWheelPivots.length; i++) {
            this.frontWheelPivots[i].rotation.y = this.steerAngle;
        }
        // Cart wheels spin
        for (let i = 0; i < this.trailerCarts.length; i++) {
            const cart = this.trailerCarts[i];
            for (let w = 0; w < cart.cartWheelMeshes.length; w++) {
                cart.cartWheelMeshes[w].rotation.x = this.wheelSpin;
            }
        }

        // Sequential Fill Logic: Carts fill one by one from Cart 0 to Cart N-1
        const numCarts = Math.max(1, this.trailerCarts.length);
        const cartCap = this.stats.tankCapacity / numCarts;
        const currentDust = this.stats.currentDust;
        const tankLength = ConfigManager.current.tankLength || 1.0;
        const tankScale = ConfigManager.current.tankScale || 1.0;

        // Overall visual fill fraction across the entire rover capacity (for HUD compatibility)
        const overallTargetFill = THREE.MathUtils.clamp(this.stats.currentDust / this.stats.tankCapacity, 0.0, 1.0);
        this.visualTankFill += (overallTargetFill - this.visualTankFill) * (1 - Math.exp(-9 * dt));

        for (let i = 0; i < this.trailerCarts.length; i++) {
            const cart = this.trailerCarts[i];

            // Dust allocation for cart i
            const startThreshold = i * cartCap;
            const cartDust = THREE.MathUtils.clamp(currentDust - startThreshold, 0, cartCap);
            cart.targetFill = cartCap > 0 ? (cartDust / cartCap) : 0;
            cart.visualFill += (cart.targetFill - cart.visualFill) * (1 - Math.exp(-9 * dt));

            // Smooth visual fill per tier
            const cap = cartCap > 0 ? cartCap : 1.0;
            cart.visualTier1 += (cart.tier1Dust / cap - cart.visualTier1) * (1 - Math.exp(-9 * dt));
            cart.visualTier2 += (cart.tier2Dust / cap - cart.visualTier2) * (1 - Math.exp(-9 * dt));
            cart.visualTier3 += (cart.tier3Dust / cap - cart.visualTier3) * (1 - Math.exp(-9 * dt));

            // Distinct, non-blended layered cylinder segments inside horizontal tank
            const maxTankLen = 0.066 * tankLength;
            const visualLengths: Record<number, number> = {
                1: Math.max(0, cart.visualTier1) * maxTankLen,
                2: Math.max(0, cart.visualTier2) * maxTankLen,
                3: Math.max(0, cart.visualTier3) * maxTankLen
            };

            let startX = -0.033 * tankLength;
            const renderedTiers = new Set<number>();

            // Render active tiers according to layerOrder without blending!
            const order = cart.layerOrder.length > 0 ? cart.layerOrder : [1, 2, 3];
            for (const t of order) {
                renderedTiers.add(t);
                const len = visualLengths[t] || 0;
                const mesh = cart.tierFillMeshes ? cart.tierFillMeshes[t] : null;
                if (mesh) {
                    if (len > 0.0006 && cart.visualFill > 0.008) {
                        mesh.visible = true;
                        mesh.scale.set(1.0, len, 1.0);
                        mesh.position.x = startX + len * 0.5;
                        startX += len;
                    } else {
                        mesh.visible = false;
                    }
                }
            }

            for (let t = 1; t <= 3; t++) {
                if (!renderedTiers.has(t) && cart.tierFillMeshes && cart.tierFillMeshes[t]) {
                    cart.tierFillMeshes[t].visible = false;
                }
            }

            if (cart.tankFloaterMesh) {
                cart.tankFloaterMesh.visible = false;
            }

            // 4-Segment Rear Stardust Indicator (Embedded on the rear bumper of the cart)
            if (cart.cartLedMats.length === 4) {
                const fill = cart.visualFill;
                const getLayerColorAtFrac = (f: number): THREE.Color => {
                    let acc = 0;
                    for (const t of order) {
                        const amt = t === 1 ? cart.tier1Dust : (t === 2 ? cart.tier2Dust : cart.tier3Dust);
                        acc += (amt / cap);
                        if (acc >= f - 0.05) return DUST_TIER_COLORS[t];
                    }
                    return DUST_TIER_COLORS[order[0] || 1];
                };

                const col0 = getLayerColorAtFrac(0.15);
                const col1 = getLayerColorAtFrac(0.40);
                const col2 = getLayerColorAtFrac(0.65);
                const col3 = getLayerColorAtFrac(0.90);

                cart.cartLedMats[0].color.copy(fill >= 0.15 ? col0 : this._offLedColor);
                cart.cartLedMats[1].color.copy(fill >= 0.40 ? col1 : this._offLedColor);
                cart.cartLedMats[2].color.copy(fill >= 0.65 ? col2 : this._offLedColor);

                const isThisCartFull = fill >= 0.92 || (cartCap > 0 && cartDust >= cartCap * 0.98);
                if (isThisCartFull) {
                    const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.012 + i * 1.5);
                    cart.cartLedMats[3].color.set(pulse > 0.4 ? '#FACC15' : '#EF4444');
                    cart.cartLedMats[0].color.copy(col0);
                    cart.cartLedMats[1].color.copy(col1);
                    cart.cartLedMats[2].color.copy(col2);
                } else if (fill >= 0.90) {
                    cart.cartLedMats[3].color.copy(col3);
                } else {
                    cart.cartLedMats[3].color.set('#1E293B');
                }
            }

            // Stardust inside the tank is completely still and calm (zero jitter or beads)
            for (let d = 0; d < cart.tankDustParticles.length; d++) {
                cart.tankDustParticles[d].visible = false;
            }
        }

        this.syncAliases();

        if (this.sweeperRollerMesh) {
            this.sweeperRollerMesh.rotation.x = -this.sweeperSpin;
        }
        if (this.beaconMesh) {
            const pulse = 0.85 + 0.3 * Math.sin(performance.now() * 0.008);
            this.beaconMesh.scale.setScalar(pulse);
        }

        // Expressive cute eye blink animation
        if (this.eyeLeftMesh && this.eyeRightMesh) {
            this.blinkTimer -= dt;
            let eyeScaleY = 1.0;
            if (this.blinkTimer <= 0) {
                const blinkPhase = -this.blinkTimer / 0.14;
                if (blinkPhase < 1.0) {
                    eyeScaleY = Math.max(0.12, Math.abs(Math.cos(blinkPhase * Math.PI)));
                } else {
                    this.blinkTimer = 2.8 + Math.random() * 2.4;
                }
            }
            this.eyeLeftMesh.scale.y = eyeScaleY;
            this.eyeRightMesh.scale.y = eyeScaleY;
        }

        this.updateTransform(dt);
        this.updateDustParticles(dt);
        if (this.trails) this.trails.update(dt);
    }

    /**
     * Juicy volume-preserving Jelly In & Jelly Out tool swap animation between Sweeper and Hammer.
     */
    private updateToolSwapAnimation(dt: number): void {
        const speed = 4.2; // ~0.24s snappy jelly transition
        const targetHammer = this.isHammerMode ? 1.0 : 0.0;
        const hammerOpening = targetHammer > this.hammerAnimT;

        if (this.hammerAnimT < targetHammer) {
            this.hammerAnimT = Math.min(1.0, this.hammerAnimT + dt * speed);
        } else if (this.hammerAnimT > targetHammer) {
            this.hammerAnimT = Math.max(0.0, this.hammerAnimT - dt * speed);
        }

        // Sweeper remains permanently mounted and visible
        if (this.sweeperAssemblyGroup) {
            this.sweeperAssemblyGroup.visible = true;
            this.sweeperAssemblyGroup.scale.set(1, 1, 1);
        }
        this.applyJellyScale(this.hammerAssemblyGroup, this.hammerAnimT, hammerOpening);

        // Aim hammer head yaw directly toward the rock being hit
        if (this.hammerAssemblyGroup) {
            let desiredYaw = 0;
            if (this.targetRock) {
                this._tmpDiff.subVectors(this.targetRock.dir, this.up);
                const lat = this._tmpDiff.dot(this.left);
                const fwd = this._tmpDiff.dot(this.forward);
                desiredYaw = THREE.MathUtils.clamp(Math.atan2(lat, Math.max(0.04, fwd)), -0.75, 0.75);
            }
            this.hammerYaw += (desiredYaw - this.hammerYaw) * (1 - Math.exp(-14 * dt));
            this.hammerAssemblyGroup.rotation.y = this.hammerYaw;
        }

        // Rhythmic weighty hammer smash cycle (wind-up -> fast slam -> hit -> rebound)
        if (this.hammerPivotGroup) {
            if (this.isHammerMode && this.hammerAnimT > 0.65) {
                this.hammerSwingPhase += dt * 2.35;
                if (this.hammerSwingPhase >= 1.0) {
                    this.hammerSwingPhase -= 1.0;
                    this.hammerHitFired = false;
                }

                const p = this.hammerSwingPhase;
                let angle = -0.35;
                if (p < 0.52) {
                    // Wind up high back (-0.20 -> -0.92 rad)
                    const t = p / 0.52;
                    const ease = 1 - Math.pow(1 - t, 2);
                    angle = THREE.MathUtils.lerp(0.18, -0.92, ease);
                } else if (p < 0.78) {
                    // Fast accelerating power slam (-0.92 -> +0.42 rad)
                    const t = (p - 0.52) / 0.26;
                    angle = THREE.MathUtils.lerp(-0.92, 0.42, t * t);
                } else {
                    // Fire rock damage right at slam bottom!
                    if (!this.hammerHitFired && this.targetRock) {
                        this.hammerHitFired = true;
                        this.hammerRecoil = 1.0;
                        if (this.onHammerImpact) {
                            this.onHammerImpact(this.targetRock);
                        }
                    }
                    // Crisp impact bounce rebound (+0.42 -> +0.18 rad)
                    const t = (p - 0.78) / 0.22;
                    angle = THREE.MathUtils.lerp(0.42, 0.18, 1 - Math.pow(1 - t, 2));
                }
                this.hammerPivotGroup.rotation.x = angle;
            } else {
                this.hammerSwingPhase = 0.15;
                this.hammerHitFired = false;
                this.hammerPivotGroup.rotation.x = THREE.MathUtils.lerp(this.hammerPivotGroup.rotation.x, -0.45, dt * 10);
            }
        }
    }

    private applyJellyScale(group: THREE.Group | undefined, t: number, isOpening: boolean): void {
        if (!group) return;
        if (t <= 0.005) {
            group.visible = false;
            group.scale.setScalar(0.001);
            return;
        }
        group.visible = true;

        if (t >= 0.995 && isOpening) {
            group.scale.set(1, 1, 1);
            return;
        }

        if (isOpening) {
            // Jelly In: elastic overshoot + squash-and-stretch wobble
            const overshoot = 1.0 - Math.exp(-7.2 * t) * Math.cos(t * Math.PI * 3.0);
            const squash = Math.exp(-6.0 * t) * Math.sin(t * Math.PI * 3.0) * 0.30;
            const sx = Math.max(0.01, overshoot * (1.0 + squash));
            const sy = Math.max(0.01, overshoot * (1.0 - squash * 0.85));
            const sz = Math.max(0.01, overshoot * (1.0 + squash * 0.45));
            group.scale.set(sx, sy, sz);
        } else {
            // Jelly Out: quick squash anticipation bulge before snapping down to 0
            const u = 1.0 - t;
            const anticipation = Math.sin(Math.min(1.0, u * 1.35) * Math.PI) * 0.28;
            const shrink = Math.pow(Math.max(0.0, t), 1.45);
            const sx = Math.max(0.001, shrink * (1.0 + anticipation * 1.1));
            const sy = Math.max(0.001, shrink * (1.0 - anticipation * 0.65));
            const sz = Math.max(0.001, shrink * (1.0 + anticipation * 0.55));
            group.scale.set(sx, sy, sz);
        }
    }

    private updateTransform(dt: number = 0.016): void {
        const u = this.up;
        const f = this.forward;
        const l = this.left;

        // 4-Wheel surface contact sampling (world offsets converted to unit sphere angles)
        const invMoonScale = 1.0 / Math.max(0.1, this.moon.moonScale);
        const wheelFwdOff = 0.038 * invMoonScale;
        const wheelSideOff = 0.052 * invMoonScale;

        const hCenter = this.moon.sampleActualSurfaceRadiusAt(u.x, u.y, u.z);
        const hFL = this.moon.sampleActualSurfaceRadiusAt(
            u.x + f.x * wheelFwdOff + l.x * wheelSideOff,
            u.y + f.y * wheelFwdOff + l.y * wheelSideOff,
            u.z + f.z * wheelFwdOff + l.z * wheelSideOff
        );
        const hFR = this.moon.sampleActualSurfaceRadiusAt(
            u.x + f.x * wheelFwdOff - l.x * wheelSideOff,
            u.y + f.y * wheelFwdOff - l.y * wheelSideOff,
            u.z + f.z * wheelFwdOff - l.z * wheelSideOff
        );
        const hBL = this.moon.sampleActualSurfaceRadiusAt(
            u.x - f.x * wheelFwdOff + l.x * wheelSideOff,
            u.y - f.y * wheelFwdOff + l.y * wheelSideOff,
            u.z - f.z * wheelFwdOff + l.z * wheelSideOff
        );
        const hBR = this.moon.sampleActualSurfaceRadiusAt(
            u.x - f.x * wheelFwdOff - l.x * wheelSideOff,
            u.y - f.y * wheelFwdOff - l.y * wheelSideOff,
            u.z - f.z * wheelFwdOff - l.z * wheelSideOff
        );

        const dFwd = ((hFL + hFR) * 0.5 - (hBL + hBR) * 0.5) / (2 * wheelFwdOff);
        const dLeft = ((hFL + hBL) * 0.5 - (hFR + hBR) * 0.5) / (2 * wheelSideOff);

        this._tmpSlopeNormal.copy(u)
            .addScaledVector(f, -dFwd)
            .addScaledVector(l, -dLeft)
            .normalize();

        this._tmpLeft.crossVectors(this._tmpSlopeNormal, f).normalize();
        this._tmpForward.crossVectors(this._tmpLeft, this._tmpSlopeNormal).normalize();

        const hWheelAvg = (hFL + hFR + hBL + hBR) * 0.25;
        const surfaceR = Math.max(hCenter, hWheelAvg) + 0.001;
        this.group.position.copy(u).multiplyScalar(surfaceR);

        this._tmpBasisMat.makeBasis(this._tmpLeft, this._tmpSlopeNormal, this._tmpForward);
        this.group.quaternion.setFromRotationMatrix(this._tmpBasisMat);

        // -------------------------------------------------------------
        // SURFACE KINEMATICS & TERRAIN CONFORMANCE FOR ALL CARTS
        // -------------------------------------------------------------
        this.group.updateMatrixWorld(true);

        const spacing = THREE.MathUtils.clamp(ConfigManager.current.cartSpacing || 1.0, 0.6, 2.5);
        const extraGap = Math.max(-0.010, (spacing - 1.0) * 0.045);

        // 1. Rover rear hitch in moon.group coordinates
        this._tmpCartHitch.set(0, 0.022, -0.070);
        this.visualBodyGroup.localToWorld(this._tmpCartHitch);
        this.moon.group.worldToLocal(this._tmpCartHitch);
        this._tmpHitchPoint.copy(this._tmpCartHitch);

        let parentForward = this.forward;

        for (let i = 0; i < this.trailerCarts.length; i++) {
            const cart = this.trailerCarts[i];
            if (!cart.pivotGroup) continue;

            const axleOffset = Math.abs(cart.chassisCenterZ || -0.046);
            const axleDist = axleOffset + extraGap;

            cart.hitchPos.copy(this._tmpHitchPoint);

            // Direction from axle to hitch
            this._tmpForward.subVectors(cart.hitchPos, cart.axlePos);
            const currentDist = this._tmpForward.length();
            if (currentDist > 0.0001) {
                this._tmpForward.multiplyScalar(1.0 / currentDist);
            } else {
                this._tmpForward.copy(cart.forward);
            }

            // ANTI-COLLISION & ANTI-JACKKNIFE CONSTRAINT:
            // Tight 31 degree (~0.54 rad) max hitch articulation prevents trailer boxes and tanks from ever colliding
            const parentUp = this._tmpCartCenter.copy(cart.hitchPos).normalize();
            const parentLeft = this._tmpCartLeft.crossVectors(parentUp, parentForward).normalize();

            const dotFwd = this._tmpForward.dot(parentForward);
            const dotLeft = this._tmpForward.dot(parentLeft);
            const relAngle = Math.atan2(dotLeft, dotFwd);
            const maxArticAngle = 0.54; // ~31 degrees maximum safe hitch articulation

            if (Math.abs(relAngle) > maxArticAngle) {
                const clampedAngle = THREE.MathUtils.clamp(relAngle, -maxArticAngle, maxArticAngle);
                this._tmpForward.copy(parentForward)
                    .multiplyScalar(Math.cos(clampedAngle))
                    .addScaledVector(parentLeft, Math.sin(clampedAngle))
                    .normalize();
            }

            // Pull axle towards hitch maintaining rigid drawbar distance
            cart.axlePos.copy(cart.hitchPos).addScaledVector(this._tmpForward, -axleDist);

            // STRICT ANTI-COLLISION CONSTRAINT (scaled to actual cart spacing):
            // Prevent adjacent trailer carts from ever colliding or overlapping during tight spins
            if (i > 0) {
                const prevCart = this.trailerCarts[i - 1];
                const minAxleDist = Math.max(0.055, axleDist * 0.85);
                const dBetween = cart.axlePos.distanceTo(prevCart.axlePos);
                if (dBetween < minAxleDist && dBetween > 0.0001) {
                    this._tmpDiff.subVectors(cart.axlePos, prevCart.axlePos).normalize();
                    cart.axlePos.copy(prevCart.axlePos).addScaledVector(this._tmpDiff, minAxleDist);
                }
            } else {
                const minRoverDist = Math.max(0.068, 0.052 + axleDist * 0.55);
                const dRover = cart.axlePos.distanceTo(this.group.position);
                if (dRover < minRoverDist && dRover > 0.0001) {
                    this._tmpDiff.subVectors(cart.axlePos, this.group.position).normalize();
                    cart.axlePos.copy(this.group.position).addScaledVector(this._tmpDiff, minRoverDist);
                }
            }

            // Project axle directly onto lunar ground terrain (Anti-Nembus 100%)
            const u = this._tmpSlopeNormal.copy(cart.axlePos).normalize();
            const groundRadiusCenter = this.moon.sampleActualSurfaceRadiusAt(u.x, u.y, u.z);
            cart.axlePos.copy(u).multiplyScalar(groundRadiusCenter + 0.018);

            // Recompute exact 3D heading from ground axle to hitch
            this._tmpForward.subVectors(cart.hitchPos, cart.axlePos).normalize();
            cart.forward.copy(this._tmpForward);
            cart.up.copy(u);

            // Compute left vector tangent to terrain
            this._tmpLeft.crossVectors(cart.up, this._tmpForward).normalize();

            // Transverse roll sampling (left and right wheel slope)
            const wheelHalfWidth = cart.wheelX || 0.049;
            this._tmpCartLeft.copy(cart.axlePos).addScaledVector(this._tmpLeft, wheelHalfWidth);
            this._tmpCartRight.copy(cart.axlePos).addScaledVector(this._tmpLeft, -wheelHalfWidth);

            const dirL = this._tmpCartCenter.copy(this._tmpCartLeft).normalize();
            const rL = this.moon.sampleActualSurfaceRadiusAt(dirL.x, dirL.y, dirL.z);

            const dirR = this._tmpCartCenter.copy(this._tmpCartRight).normalize();
            const rR = this.moon.sampleActualSurfaceRadiusAt(dirR.x, dirR.y, dirR.z);

            const rollDiff = rL - rR;
            const targetRoll = THREE.MathUtils.clamp(
                Math.atan2(rollDiff, 2 * wheelHalfWidth),
                -0.35,
                0.35
            );
            cart.roll += (targetRoll - cart.roll) * (1 - Math.exp(-12 * dt));

            // Lean left and normal vectors with transverse roll
            if (Math.abs(cart.roll) > 0.001) {
                this._tmpLeft.applyAxisAngle(this._tmpForward, cart.roll);
            }
            this._tmpSlopeNormal.crossVectors(this._tmpForward, this._tmpLeft).normalize();

            // Set final 3D transform for this cart in moon.group coordinates
            this._tmpBasisMat.makeBasis(this._tmpLeft, this._tmpSlopeNormal, this._tmpForward);
            cart.pivotGroup.position.copy(cart.hitchPos);
            cart.pivotGroup.quaternion.setFromRotationMatrix(this._tmpBasisMat);
            cart.pivotGroup.scale.set(1, 1, 1);

            // Shift cart body & stretch drawbar tongue to match cartSpacing
            if (cart.bodyGroup) {
                cart.bodyGroup.position.z = -extraGap;
            }
            if (cart.tongueMesh) {
                const frontZ = -0.019;
                const desiredLen = Math.abs(frontZ - extraGap) + 0.002;
                cart.tongueMesh.scale.z = desiredLen / 0.021;
                cart.tongueMesh.position.z = (frontZ - extraGap) * 0.5;
            }

            cart.pivotGroup.updateMatrixWorld(true);

            // Rear hitch position in moon.group coordinates for the next cart
            this._tmpCartHitch.set(0, 0.004, (cart.rearHitchZ || -0.080) - extraGap);
            cart.pivotGroup.localToWorld(this._tmpCartHitch);
            this.moon.group.worldToLocal(this._tmpCartHitch);
            this._tmpHitchPoint.copy(this._tmpCartHitch);

            // Parent forward for the next cart in the chain
            parentForward = cart.forward;
        }
    }
}
