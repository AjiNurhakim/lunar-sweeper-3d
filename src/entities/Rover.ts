import * as THREE from 'three';
import { Moon } from './Moon';
import { ConfigManager } from '../core/Config';

export interface RoverStats {
    speed: number;
    sweeperPower: number;
    sweeperWidth: number;
    tankCapacity: number;
    currentDust: number;
}

export interface TrailerCart {
    pivotGroup: THREE.Group;
    horizontalTankGroup: THREE.Group;
    tankGlassMat: THREE.MeshStandardMaterial;
    tankFillMesh: THREE.Mesh;
    tankFillMat: THREE.MeshStandardMaterial;
    tankFloaterMesh: THREE.Mesh;
    tankFloaterMat: THREE.MeshStandardMaterial;
    tankDustParticles: THREE.Mesh[];
    cartWheelMeshes: THREE.Group[];
    cartLedMats: THREE.MeshBasicMaterial[];
    topGaugeMats: THREE.MeshBasicMaterial[];
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
    private wheelMeshes: THREE.Group[] = [];
    private frontWheelPivots: THREE.Group[] = [];
    private beaconMesh!: THREE.Mesh;

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
    private yellowBodyMat!: THREE.MeshStandardMaterial;
    private yellowDarkMat!: THREE.MeshStandardMaterial;
    private darkChassisMat!: THREE.MeshStandardMaterial;
    private tickMat!: THREE.MeshBasicMaterial;
    private coreRodMat!: THREE.MeshStandardMaterial;

    // Dust particles
    private dustGroup: THREE.Group;
    private dustParticles: {
        mesh: THREE.Mesh;
        vel: THREE.Vector3;
        life: number;
        maxLife: number;
        scale: number;
    }[] = [];
    private dustSpawnCursor = 0;
    private readonly MAX_DUST = 80;

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
        this.applyConfig();
    }

    public applyConfig(): void {
        const cfg = ConfigManager.current;
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

        // Counter-scale the rover and dust groups so the rover maintains constant physical world size
        const invScale = 1.0 / Math.max(0.1, this.moon.moonScale);
        this.group.scale.setScalar(invScale);
        this.dustGroup.scale.setScalar(invScale);
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

        // 1. Sasis Bawah
        const chassis = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.018, 0.115), darkChassisMat);
        chassis.position.set(0, 0.022, 0);
        this.visualBodyGroup.add(chassis);

        // 2. Bodi Utama Mobil
        const mainBody = new THREE.Mesh(new THREE.BoxGeometry(0.082, 0.030, 0.118), yellowBodyMat);
        mainBody.position.set(0, 0.042, -0.004);
        this.visualBodyGroup.add(mainBody);

        // Kap Depan Miring
        const frontHood = new THREE.Mesh(new THREE.BoxGeometry(0.074, 0.022, 0.042), yellowDarkMat);
        frontHood.position.set(0, 0.040, 0.056);
        frontHood.rotation.x = 0.22;
        this.visualBodyGroup.add(frontHood);

        // 3. Kabin Atas & Kaca Visor
        const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.064, 0.026, 0.062), yellowBodyMat);
        cabin.position.set(0, 0.066, -0.012);
        this.visualBodyGroup.add(cabin);

        const visor = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.016, 0.014), visorMat);
        visor.position.set(0, 0.066, 0.018);
        this.visualBodyGroup.add(visor);

        const eyeLeft = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.007, 0.004), cyanGlowMat);
        eyeLeft.position.set(-0.015, 0.066, 0.025);
        this.visualBodyGroup.add(eyeLeft);

        const eyeRight = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.007, 0.004), cyanGlowMat);
        eyeRight.position.set(0.015, 0.066, 0.025);
        this.visualBodyGroup.add(eyeRight);

        // Clean Rear Cabin Exhaust Louver / Grille
        const rearGrille = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.016, 0.004), darkChassisMat);
        rearGrille.position.set(0, 0.062, -0.044);
        this.visualBodyGroup.add(rearGrille);

        const ventStripe = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.003, 0.006), yellowDarkMat);
        ventStripe.position.set(0, 0.062, -0.044);
        this.visualBodyGroup.add(ventStripe);

        // Rugged Probe Rear Bumper with Red Reflectors
        const probeRearBumper = new THREE.Mesh(new THREE.BoxGeometry(0.076, 0.014, 0.008), darkChassisMat);
        probeRearBumper.position.set(0, 0.022, -0.060);
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
        this.visualBodyGroup.add(hitchMount);

        const hitchBall = new THREE.Mesh(new THREE.SphereGeometry(0.005, 8, 8), darkChassisMat);
        hitchBall.position.set(0, 0.022, -0.070);
        this.visualBodyGroup.add(hitchBall);

        // Antena Suar
        const antennaStem = new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.0035, 0.036, 8), darkChassisMat);
        antennaStem.position.set(-0.020, 0.092, -0.030);
        this.visualBodyGroup.add(antennaStem);

        this.beaconMesh = new THREE.Mesh(
            new THREE.SphereGeometry(0.0075, 12, 12),
            new THREE.MeshBasicMaterial({ color: '#FDE047' })
        );
        this.beaconMesh.position.set(-0.020, 0.111, -0.030);
        this.visualBodyGroup.add(this.beaconMesh);

        // 4. Empat Roda Cartoony (Layered with zero Z-fighting)
        this.wheelMeshes = [];
        this.frontWheelPivots = [];

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
            wheelGroup.add(tire);

            // Velg kuning mencolok di sisi luar roda (outer hubcap face)
            // sideSign: -1 untuk roda kiri, +1 untuk roda kanan
            const hub = new THREE.Mesh(
                new THREE.CylinderGeometry(0.0135, 0.0135, 0.0028, 16),
                yellowBodyMat
            );
            hub.rotation.z = Math.PI / 2;
            hub.position.x = sideSign * 0.0094;
            wheelGroup.add(hub);

            // Baut as tengah (center axle nut) menonjol sedikit di atas velg (zero z-fighting!)
            const nut = new THREE.Mesh(
                new THREE.CylinderGeometry(0.0048, 0.0048, 0.0024, 10),
                darkChassisMat
            );
            nut.rotation.z = Math.PI / 2;
            nut.position.x = sideSign * 0.0112;
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

        // 5. Sikat Rol Sweeper Depan
        this.sweeperAssemblyGroup = new THREE.Group();
        this.sweeperAssemblyGroup.position.set(0, 0.018, 0.098);
        this.visualBodyGroup.add(this.sweeperAssemblyGroup);

        const armLeft = new THREE.Mesh(new THREE.BoxGeometry(0.009, 0.010, 0.048), darkChassisMat);
        armLeft.position.set(-0.032, 0.008, -0.022);
        armLeft.rotation.x = 0.25;
        this.sweeperAssemblyGroup.add(armLeft);

        const armRight = new THREE.Mesh(new THREE.BoxGeometry(0.009, 0.010, 0.048), darkChassisMat);
        armRight.position.set(0.032, 0.008, -0.022);
        armRight.rotation.x = 0.25;
        this.sweeperAssemblyGroup.add(armRight);

        this.sweeperRollerMesh = new THREE.Group();
        const coreCylinder = new THREE.Mesh(
            new THREE.CylinderGeometry(0.017, 0.017, 1.0, 18),
            orangeBristleMat
        );
        coreCylinder.rotation.z = Math.PI / 2;
        this.sweeperRollerMesh.add(coreCylinder);

        for (let b = 0; b < 6; b++) {
            const angle = (b / 6) * Math.PI;
            const bristleFin = new THREE.Mesh(
                new THREE.BoxGeometry(0.98, 0.042, 0.005),
                b % 2 === 0 ? lightBristleMat : orangeBristleMat
            );
            bristleFin.rotation.x = angle;
            this.sweeperRollerMesh.add(bristleFin);
        }
        this.sweeperAssemblyGroup.add(this.sweeperRollerMesh);

        this.sweeperSideCaps = [];
        [-1, 1].forEach(side => {
            const cap = new THREE.Mesh(
                new THREE.CylinderGeometry(0.023, 0.023, 0.010, 16),
                yellowBodyMat
            );
            cap.rotation.z = Math.PI / 2;
            this.sweeperAssemblyGroup.add(cap);
            this.sweeperSideCaps.push({ mesh: cap, side });
        });

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
        pivotGroup.add(tongue);

        // Compact Square Box Chassis Body
        const cartChassis = new THREE.Mesh(new THREE.BoxGeometry(cartWidth, cartHeight, cartDepth), this.darkChassisMat);
        cartChassis.position.set(0, cartHeight * 0.5, chassisCenterZ);
        pivotGroup.add(cartChassis);

        // Top Accent Panel / Lid on the box
        const topPlate = new THREE.Mesh(new THREE.BoxGeometry(cartWidth - 0.006, 0.002, cartDepth - 0.006), this.yellowDarkMat);
        topPlate.position.set(0, cartHeight + 0.001, chassisCenterZ);
        pivotGroup.add(topPlate);

        // Rear Bumper Bar on the back of the box
        const rearBumper = new THREE.Mesh(new THREE.BoxGeometry(cartWidth + 0.004, 0.012, 0.005), this.yellowDarkMat);
        rearBumper.position.set(0, 0.008, rearZ);
        pivotGroup.add(rearBumper);

        // 4-Stage Rear Bumper Stardust Indicator LEDs (Placed back on the rear face)
        const cartLedMats: THREE.MeshBasicMaterial[] = [];
        const ledStep = 0.010;
        const ledPositions = [-ledStep * 1.5, -ledStep * 0.5, ledStep * 0.5, ledStep * 1.5];
        ledPositions.forEach(xOffset => {
            const mat = new THREE.MeshBasicMaterial({ color: '#1E293B' });
            const led = new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.005, 0.003), mat);
            led.position.set(xOffset, 0.008, rearZ - 0.002);
            pivotGroup.add(led);
            cartLedMats.push(mat);
        });
        const topGaugeMats: THREE.MeshBasicMaterial[] = cartLedMats;

        // Rear Hitch Mount & Ball for chaining subsequent carts
        const rearHitchMount = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.006, 0.008), this.darkChassisMat);
        rearHitchMount.position.set(0, 0.004, rearZ - 0.003);
        pivotGroup.add(rearHitchMount);

        const rearHitchBall = new THREE.Mesh(new THREE.SphereGeometry(0.0045, 8, 8), this.darkChassisMat);
        rearHitchBall.position.set(0, 0.004, rearHitchZ);
        pivotGroup.add(rearHitchBall);

        // Cart Wheels (2 wheels alongside the compact box chassis)
        const cartWheelMeshes: THREE.Group[] = [];
        const tireRadius = 0.018;
        const tireWidth = 0.012;
        [-1, 1].forEach(side => {
            const wheelGroup = new THREE.Group();
            wheelGroup.position.set(side * wheelX, 0, chassisCenterZ);

            const tire = new THREE.Mesh(
                new THREE.CylinderGeometry(tireRadius, tireRadius, tireWidth, 18),
                this.darkChassisMat
            );
            tire.rotation.z = Math.PI / 2;
            wheelGroup.add(tire);

            const hub = new THREE.Mesh(
                new THREE.CylinderGeometry(tireRadius * 0.55, tireRadius * 0.55, 0.0025, 14),
                this.yellowBodyMat
            );
            hub.rotation.z = Math.PI / 2;
            hub.position.x = side * (tireWidth * 0.5 + 0.0003);
            wheelGroup.add(hub);

            const nut = new THREE.Mesh(
                new THREE.CylinderGeometry(0.0035, 0.0035, 0.002, 8),
                this.darkChassisMat
            );
            nut.rotation.z = Math.PI / 2;
            nut.position.x = side * (tireWidth * 0.5 + 0.0017);
            wheelGroup.add(nut);

            pivotGroup.add(wheelGroup);
            cartWheelMeshes.push(wheelGroup);
        });

        // Elevated Horizontal Vacuum Capsule Tank Position
        const yElevation = 0.038 + (tankScale - 1.0) * 0.018;

        // Structural Support Cradles (Penyangga Tabung) rising from the compact box chassis
        const cradleSpacing = Math.min(0.016 * tankLength, cartWidth * 0.28);
        const riserHeight = yElevation - cartHeight;
        [-cradleSpacing, cradleSpacing].forEach(xPos => {
            // 1. Vertical support riser column
            const riser = new THREE.Mesh(
                new THREE.BoxGeometry(0.006, riserHeight, 0.020 * Math.max(0.8, tankScale)),
                this.darkChassisMat
            );
            riser.position.set(xPos, cartHeight + riserHeight * 0.5, chassisCenterZ);
            pivotGroup.add(riser);

            // 2. Yellow angled reinforcement bracket
            const brace = new THREE.Mesh(
                new THREE.BoxGeometry(0.004, riserHeight * 0.70, 0.026 * Math.max(0.8, tankScale)),
                this.yellowBodyMat
            );
            brace.position.set(xPos, cartHeight + riserHeight * 0.45, chassisCenterZ);
            pivotGroup.add(brace);

            // 3. Saddle clamp cradling the underside of the capsule
            const saddle = new THREE.Mesh(
                new THREE.BoxGeometry(0.007, 0.005 * tankScale, 0.040 * tankScale),
                this.yellowDarkMat
            );
            saddle.position.set(xPos, yElevation - 0.010 * tankScale, chassisCenterZ);
            pivotGroup.add(saddle);
        });

        // Horizontal Transparent Vacuum Capsule Tank Group
        const horizontalTankGroup = new THREE.Group();
        horizontalTankGroup.position.set(0, yElevation, chassisCenterZ);
        pivotGroup.add(horizontalTankGroup);

        // Left & Right Metallic End Caps & Black Suction Docking Port Rings ("lingkaran hitam di samping nya")
        const capX = 0.034 * tankLength + 0.004 * tankScale;
        const collarX = 0.034 * tankLength + 0.001 * tankScale;
        const suctionPortMat = new THREE.MeshStandardMaterial({
            color: '#09090B',
            roughness: 0.85,
            metalness: 0.2
        });
        const suctionHoleMat = new THREE.MeshBasicMaterial({ color: '#000000' });

        [-1, 1].forEach(side => {
            const cap = new THREE.Mesh(
                new THREE.CylinderGeometry(0.024 * tankScale, 0.024 * tankScale, 0.008 * tankScale, 18),
                this.yellowDarkMat
            );
            cap.rotation.z = Math.PI / 2;
            cap.position.set(side * capX, 0, 0);
            horizontalTankGroup.add(cap);

            const collar = new THREE.Mesh(
                new THREE.CylinderGeometry(0.0245 * tankScale, 0.0245 * tankScale, 0.003 * tankScale, 18),
                this.darkChassisMat
            );
            collar.rotation.z = Math.PI / 2;
            collar.position.set(side * collarX, 0, 0);
            horizontalTankGroup.add(collar);

            // Black Suction Docking Port on the side of the tank (for rocket depot hose attachment)
            const portFlange = new THREE.Mesh(
                new THREE.CylinderGeometry(0.015 * tankScale, 0.015 * tankScale, 0.003 * tankScale, 20),
                this.darkChassisMat
            );
            portFlange.rotation.z = Math.PI / 2;
            portFlange.position.set(side * (capX + 0.004 * tankScale), 0, 0);
            horizontalTankGroup.add(portFlange);

            // Deep black circular docking ring ("lingkaran hitam")
            const portRing = new THREE.Mesh(
                new THREE.TorusGeometry(0.0115 * tankScale, 0.0022 * tankScale, 10, 24),
                suctionPortMat
            );
            portRing.rotation.y = Math.PI / 2;
            portRing.position.set(side * (capX + 0.0055 * tankScale), 0, 0);
            horizontalTankGroup.add(portRing);

            // Deep black recessed suction hole in the center
            const portHole = new THREE.Mesh(
                new THREE.CylinderGeometry(0.009 * tankScale, 0.009 * tankScale, 0.0035 * tankScale, 20),
                suctionHoleMat
            );
            portHole.rotation.z = Math.PI / 2;
            portHole.position.set(side * (capX + 0.0045 * tankScale), 0, 0);
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

        // Radiant Luminous Stardust Fill Cylinder (Smooth, Still, 100% Opaque - Zero Shimmer/Flicker)
        const fillCol = new THREE.Color('#38BDF8');
        const tankFillMat = new THREE.MeshStandardMaterial({
            color: fillCol,
            emissive: fillCol,
            emissiveIntensity: ConfigManager.current.tankGlowIntensity ?? 0.65,
            roughness: 0.35,
            metalness: 0.1,
            transparent: false
        });
        const tankFillMesh = new THREE.Mesh(
            new THREE.CylinderGeometry(0.020 * tankScale, 0.020 * tankScale, 1.0, 18),
            tankFillMat
        );
        tankFillMesh.rotation.z = Math.PI / 2;
        tankFillMesh.scale.set(1.0, 0.001, 1.0);
        tankFillMesh.position.set(-0.033 * tankLength, 0, 0);
        tankFillMesh.visible = false;
        horizontalTankGroup.add(tankFillMesh);

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
            tankFloaterMesh,
            tankFloaterMat,
            tankDustParticles,
            cartWheelMeshes,
            cartLedMats,
            topGaugeMats,
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
            tongueMesh: tongue,
            chassisCenterZ,
            rearHitchZ,
            wheelX
        };
    }

    public rebuildCarts(count: number): void {
        const targetCount = THREE.MathUtils.clamp(Math.round(count), 1, 5);

        // Detach existing cart chain from moon.group
        for (const cart of this.trailerCarts) {
            if (cart.pivotGroup.parent) {
                cart.pivotGroup.parent.remove(cart.pivotGroup);
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
    }

    public initCartPositions(): void {
        const invMoonScale = 1.0 / Math.max(0.1, this.moon.moonScale);
        const spacing = THREE.MathUtils.clamp(ConfigManager.current.cartSpacing || 1.0, 0.6, 2.5);

        // Rover rear hitch in moon.group coordinates
        this._tmpCartHitch.set(0, 0.022, -0.070);
        this.visualBodyGroup.localToWorld(this._tmpCartHitch);
        this.moon.group.worldToLocal(this._tmpCartHitch);
        const currentHitch = this._tmpCartHitch.clone();

        // Reverse tangent heading on moon
        const backDir = this.forward.clone().negate().normalize();

        for (let i = 0; i < this.trailerCarts.length; i++) {
            const cart = this.trailerCarts[i];
            const axleOffset = Math.abs(cart.chassisCenterZ || -0.052);
            const axleDist = (axleOffset * spacing) * invMoonScale;
            cart.hitchPos.copy(currentHitch);

            // Place axle along reverse heading from hitch
            cart.axlePos.copy(currentHitch).addScaledVector(backDir, axleDist);
            const u = cart.axlePos.clone().normalize();
            const r = this.moon.sampleActualSurfaceRadiusAt(u.x, u.y, u.z);
            cart.axlePos.copy(u).multiplyScalar(r + 0.018 * invMoonScale);

            cart.forward.subVectors(cart.hitchPos, cart.axlePos).normalize();
            cart.up.copy(u);

            this._tmpLeft.crossVectors(cart.up, cart.forward).normalize();
            this._tmpSlopeNormal.crossVectors(cart.forward, this._tmpLeft).normalize();

            this._tmpBasisMat.makeBasis(this._tmpLeft, this._tmpSlopeNormal, cart.forward);
            cart.pivotGroup.position.copy(cart.hitchPos);
            cart.pivotGroup.quaternion.setFromRotationMatrix(this._tmpBasisMat);
            cart.pivotGroup.scale.setScalar(invMoonScale);

            if (cart.tongueMesh) {
                cart.tongueMesh.scale.z = spacing;
                cart.tongueMesh.position.z = -0.012 * spacing;
            }

            cart.pivotGroup.updateMatrixWorld(true);

            // Compute next hitch ball position
            this._tmpCartHitch.set(0, 0.004, cart.rearHitchZ || -0.098);
            cart.pivotGroup.localToWorld(this._tmpCartHitch);
            this.moon.group.worldToLocal(this._tmpCartHitch);
            currentHitch.copy(this._tmpCartHitch);
        }
    }

    public updateTankScale(scale: number): void {
        ConfigManager.current.tankScale = THREE.MathUtils.clamp(scale, 0.5, 2.5);
        this.applyConfig();
    }

    public updateAllCartsStyle(): void {
        const cfg = ConfigManager.current;
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
            if (cart.tankFillMat) {
                cart.tankFillMat.color.copy(fillCol);
                cart.tankFillMat.emissive.copy(fillCol);
                cart.tankFillMat.emissiveIntensity = glow;
            }
            if (cart.tankFloaterMat) {
                cart.tankFloaterMat.color.set('#FFFFFF');
                cart.tankFloaterMat.emissive.copy(fillCol);
                cart.tankFloaterMat.emissiveIntensity = Math.min(2.0, glow * 1.4);
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
        const puffGeom = new THREE.IcosahedronGeometry(0.012, 1);
        for (let i = 0; i < this.MAX_DUST; i++) {
            const mat = new THREE.MeshBasicMaterial({
                color: '#948CA8',
                transparent: true,
                opacity: 0.0
            });
            const mesh = new THREE.Mesh(puffGeom, mat);
            mesh.visible = false;
            this.dustGroup.add(mesh);

            this.dustParticles.push({
                mesh,
                vel: new THREE.Vector3(),
                life: 0,
                maxLife: 0.45,
                scale: 1
            });
        }
    }

    public spawnDustPuff(originLocal: THREE.Vector3, velLocal: THREE.Vector3): void {
        const p = this.dustParticles[this.dustSpawnCursor];
        this.dustSpawnCursor = (this.dustSpawnCursor + 1) % this.MAX_DUST;

        p.mesh.position.copy(originLocal);
        p.vel.copy(velLocal);
        p.life = 0;
        p.maxLife = 0.28 + Math.random() * 0.22;
        p.scale = 0.7 + Math.random() * 0.8;
        const mat = p.mesh.material as THREE.MeshBasicMaterial;
        mat.color.set(this.moon.currentPalette.dirtHighlight);
        mat.opacity = 0.75;
        p.mesh.scale.setScalar(p.scale);
        p.mesh.visible = true;
    }

    public updateDustParticles(dt: number): void {
        for (let i = 0; i < this.MAX_DUST; i++) {
            const p = this.dustParticles[i];
            if (!p.mesh.visible) continue;

            p.life += dt;
            if (p.life >= p.maxLife) {
                p.mesh.visible = false;
                continue;
            }

            const t = p.life / p.maxLife;
            p.mesh.position.addScaledVector(p.vel, dt);
            const mat = p.mesh.material as THREE.MeshBasicMaterial;
            mat.opacity = (1 - t) * 0.72;
            p.mesh.scale.setScalar(p.scale * (1 + t * 0.9));
        }
    }

    public resetPosition(): void {
        this.up.set(0, 0.28, 0.96).normalize();
        this.forward.set(0.95, 0.08, -0.30).normalize();
        this.left.crossVectors(this.up, this.forward).normalize();
        this.forward.crossVectors(this.left, this.up).normalize();

        this.speed = 0;
        this.steerAngle = 0;
        this.pitchLean = 0;
        this.rollLean = 0;
        this.cartYaw = 0;
        this.targetCartYaw = 0;
        this.stats.currentDust = 0;
        this.visualTankFill = 0;

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

    public addDust(amount: number): void {
        this.stats.currentDust = Math.min(this.stats.tankCapacity, this.stats.currentDust + amount);
    }

    public isTankFull(): boolean {
        return this.stats.currentDust >= (this.stats.tankCapacity - 0.001);
    }

    public setDust(amount: number): void {
        this.stats.currentDust = THREE.MathUtils.clamp(amount, 0, this.stats.tankCapacity);
    }

    public setDustPercent(pct: number): void {
        const fraction = THREE.MathUtils.clamp(pct, 0, 100) / 100;
        this.setDust(fraction * this.stats.tankCapacity);
    }

    public updatePhysics(throttle: number, steer: number, dt: number): void {
        const cfg = ConfigManager.current;
        const maxForwardSpeed = 0.58 * cfg.probeSpeed;
        // Reverse speed is ~45% of forward speed for realistic heavy rover handling
        const maxReverseSpeed = maxForwardSpeed * 0.45;

        let targetSpeed = 0;
        let accelRate = cfg.accelRate;

        if (throttle > 0) {
            targetSpeed = throttle * maxForwardSpeed;
            accelRate = cfg.accelRate;
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

        // Dynamic Suspension Tilt & Roll (Scaled by config)
        const accel = (this.speed - prevSpeed) / dt;
        const targetPitch = Math.max(-0.06, Math.min(0.08, -accel * 0.018 * cfg.suspensionPitch));
        const targetRoll = Math.max(-0.08, Math.min(0.08, this.steerAngle * 0.12 * Math.sign(this.speed || 1) * cfg.suspensionRoll));

        this.pitchLean += (targetPitch - this.pitchLean) * (1 - Math.exp(-10 * dt));
        this.rollLean += (targetRoll - this.rollLean) * (1 - Math.exp(-8 * dt));

        this.visualBodyGroup.rotation.x = this.pitchLean;
        this.visualBodyGroup.rotation.z = this.rollLean;

        // Spin animations
        this.wheelSpin += (this.speed / 0.022) * dt;
        this.sweeperSpin += (10.0 + Math.abs(this.speed) * 28.0) * dt;

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

            const fillLen = Math.max(0.0001, cart.visualFill * 0.066 * tankLength);

            if (cart.tankFillMesh) {
                if (cart.visualFill > 0.008) {
                    cart.tankFillMesh.visible = true;
                    cart.tankFillMesh.scale.set(1.0, fillLen, 1.0);
                    cart.tankFillMesh.position.x = -0.033 * tankLength + fillLen * 0.5;
                } else {
                    cart.tankFillMesh.visible = false;
                }
            }

            if (cart.tankFloaterMesh) {
                cart.tankFloaterMesh.visible = false;
            }

            // 4-Segment Rear Stardust Indicator (Embedded on the rear bumper of the cart)
            if (cart.cartLedMats.length === 4) {
                const fill = cart.visualFill;
                cart.cartLedMats[0].color.set(fill >= 0.15 ? '#38BDF8' : '#1E293B');
                cart.cartLedMats[1].color.set(fill >= 0.40 ? '#38BDF8' : '#1E293B');
                cart.cartLedMats[2].color.set(fill >= 0.65 ? '#38BDF8' : '#1E293B');

                // Trigger full indicator per individual cart!
                const isThisCartFull = fill >= 0.92 || (cartCap > 0 && cartDust >= cartCap * 0.98);
                if (isThisCartFull) {
                    const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.012 + i * 1.5);
                    cart.cartLedMats[3].color.set(pulse > 0.4 ? '#FACC15' : '#EF4444');
                    cart.cartLedMats[0].color.set('#38BDF8');
                    cart.cartLedMats[1].color.set('#38BDF8');
                    cart.cartLedMats[2].color.set('#38BDF8');
                } else if (fill >= 0.90) {
                    cart.cartLedMats[3].color.set('#38BDF8');
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

        this.updateTransform(dt);
        this.updateDustParticles(dt);
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

        // 1. Rover rear hitch in moon.group coordinates
        this._tmpCartHitch.set(0, 0.022, -0.070);
        this.visualBodyGroup.localToWorld(this._tmpCartHitch);
        this.moon.group.worldToLocal(this._tmpCartHitch);
        this._tmpHitchPoint.copy(this._tmpCartHitch);

        let parentForward = this.forward;

        for (let i = 0; i < this.trailerCarts.length; i++) {
            const cart = this.trailerCarts[i];
            if (!cart.pivotGroup) continue;

            const axleOffset = Math.abs(cart.chassisCenterZ || -0.052);
            const axleDist = (axleOffset * spacing) * invMoonScale;

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

            // STRICT ANTI-COLLISION CONSTRAINT:
            // Prevent adjacent trailer carts from ever colliding or overlapping during tight spins
            if (i > 0) {
                const prevCart = this.trailerCarts[i - 1];
                const minAxleDist = (0.070 * spacing) * invMoonScale;
                const dBetween = cart.axlePos.distanceTo(prevCart.axlePos);
                if (dBetween < minAxleDist && dBetween > 0.0001) {
                    this._tmpDiff.subVectors(cart.axlePos, prevCart.axlePos).normalize();
                    cart.axlePos.copy(prevCart.axlePos).addScaledVector(this._tmpDiff, minAxleDist);
                }
            } else {
                const minRoverDist = 0.086 * invMoonScale;
                const dRover = cart.axlePos.distanceTo(this.group.position);
                if (dRover < minRoverDist && dRover > 0.0001) {
                    this._tmpDiff.subVectors(cart.axlePos, this.group.position).normalize();
                    cart.axlePos.copy(this.group.position).addScaledVector(this._tmpDiff, minRoverDist);
                }
            }

            // Project axle directly onto lunar ground terrain (Anti-Nembus 100%)
            const u = this._tmpSlopeNormal.copy(cart.axlePos).normalize();
            const groundRadiusCenter = this.moon.sampleActualSurfaceRadiusAt(u.x, u.y, u.z);
            cart.axlePos.copy(u).multiplyScalar(groundRadiusCenter + 0.018 * invMoonScale);

            // Recompute exact 3D heading from ground axle to hitch
            this._tmpForward.subVectors(cart.hitchPos, cart.axlePos).normalize();
            cart.forward.copy(this._tmpForward);
            cart.up.copy(u);

            // Compute left vector tangent to terrain
            this._tmpLeft.crossVectors(cart.up, this._tmpForward).normalize();

            // Transverse roll sampling (left and right wheel slope)
            const wheelHalfWidth = (cart.wheelX || 0.049) * invMoonScale;
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
            cart.pivotGroup.scale.setScalar(invMoonScale);

            // Scale hitch tongue length to match cart spacing
            if (cart.tongueMesh) {
                cart.tongueMesh.scale.z = spacing;
                cart.tongueMesh.position.z = -0.012 * spacing;
            }

            cart.pivotGroup.updateMatrixWorld(true);

            // Rear hitch position in moon.group coordinates for the next cart
            this._tmpCartHitch.set(0, 0.004, cart.rearHitchZ || -0.098);
            cart.pivotGroup.localToWorld(this._tmpCartHitch);
            this.moon.group.worldToLocal(this._tmpCartHitch);
            this._tmpHitchPoint.copy(this._tmpCartHitch);

            // Parent forward for the next cart in the chain
            parentForward = cart.forward;
        }
    }
}
