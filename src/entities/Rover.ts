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
        this.tickMat = new THREE.MeshBasicMaterial({ color: '#BAE6FD' });
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

        // Suction Manifold & Rear Tow Bar Mount
        const suctionManifold = new THREE.Mesh(
            new THREE.CylinderGeometry(0.012, 0.014, 0.040, 12),
            darkChassisMat
        );
        suctionManifold.rotation.z = Math.PI / 2;
        suctionManifold.position.set(0, 0.054, -0.056);
        this.visualBodyGroup.add(suctionManifold);

        // Hitch mount on rover rear
        const hitchMount = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.008, 0.018), darkChassisMat);
        hitchMount.position.set(0, 0.022, -0.058);
        this.visualBodyGroup.add(hitchMount);

        const hitchBall = new THREE.Mesh(new THREE.SphereGeometry(0.0055, 8, 8), darkChassisMat);
        hitchBall.position.set(0, 0.022, -0.065);
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

        // Vacuum Hose from cabin to Left End Cap of cart 0
        const hoseMat = new THREE.MeshStandardMaterial({ color: '#0F172A', roughness: 0.7 });
        const hoseSeg = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.034, 10), hoseMat);
        hoseSeg.position.set(-0.026, 0.052, -0.054);
        hoseSeg.rotation.x = 0.65;
        hoseSeg.rotation.z = -0.30;
        this.visualBodyGroup.add(hoseSeg);

        // Build Multi-Cart Train & Tanks
        this.rebuildCarts(ConfigManager.current.cartCount || 1);
        this.updateSweeperVisualWidth();
    }

    private buildSingleCart(index: number, parent: THREE.Group, tankScale: number, tankLength: number): TrailerCart {
        const pivotGroup = new THREE.Group();
        if (index === 0) {
            pivotGroup.position.set(0, 0.022, -0.065);
        } else {
            // Attached to the rear hitch ball of the preceding cart
            pivotGroup.position.set(0, 0.004, -0.098);
        }
        parent.add(pivotGroup);

        // Trailer Tongue / Hitch
        const tongue = new THREE.Mesh(new THREE.BoxGeometry(0.009, 0.008, 0.024), this.darkChassisMat);
        tongue.position.set(0, 0, -0.012);
        pivotGroup.add(tongue);

        // Cart Tray / Chassis
        const cartChassis = new THREE.Mesh(new THREE.BoxGeometry(0.082, 0.012, 0.088), this.darkChassisMat);
        cartChassis.position.set(0, 0.004, -0.052);
        pivotGroup.add(cartChassis);

        // Yellow Cart Rails & Protective Frame
        const leftRail = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.018, 0.088), this.yellowBodyMat);
        leftRail.position.set(-0.041, 0.015, -0.052);
        pivotGroup.add(leftRail);

        const rightRail = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.018, 0.088), this.yellowBodyMat);
        rightRail.position.set(0.041, 0.015, -0.052);
        pivotGroup.add(rightRail);

        const rearBumper = new THREE.Mesh(new THREE.BoxGeometry(0.088, 0.016, 0.007), this.yellowDarkMat);
        rearBumper.position.set(0, 0.015, -0.095);
        pivotGroup.add(rearBumper);

        // Rear Hitch Mount & Ball for chaining subsequent carts
        const rearHitchMount = new THREE.Mesh(new THREE.BoxGeometry(0.010, 0.008, 0.014), this.darkChassisMat);
        rearHitchMount.position.set(0, 0.004, -0.096);
        pivotGroup.add(rearHitchMount);

        const rearHitchBall = new THREE.Mesh(new THREE.SphereGeometry(0.005, 8, 8), this.darkChassisMat);
        rearHitchBall.position.set(0, 0.004, -0.098);
        pivotGroup.add(rearHitchBall);

        // Cart Wheels (2 wheels per trailer cart - layered with zero Z-fighting)
        const cartWheelMeshes: THREE.Group[] = [];
        [-1, 1].forEach(side => {
            const wheelGroup = new THREE.Group();
            wheelGroup.position.set(side * 0.049, 0, -0.052);

            const tire = new THREE.Mesh(
                new THREE.CylinderGeometry(0.018, 0.018, 0.013, 18),
                this.darkChassisMat
            );
            tire.rotation.z = Math.PI / 2;
            wheelGroup.add(tire);

            const hub = new THREE.Mesh(
                new THREE.CylinderGeometry(0.010, 0.010, 0.0025, 14),
                this.yellowBodyMat
            );
            hub.rotation.z = Math.PI / 2;
            hub.position.x = side * 0.0068;
            wheelGroup.add(hub);

            const nut = new THREE.Mesh(
                new THREE.CylinderGeometry(0.0035, 0.0035, 0.002, 8),
                this.darkChassisMat
            );
            nut.rotation.z = Math.PI / 2;
            nut.position.x = side * 0.0082;
            wheelGroup.add(nut);

            pivotGroup.add(wheelGroup);
            cartWheelMeshes.push(wheelGroup);
        });

        // Top-facing 4-segment stardust gauge on cart deck
        const gaugeBezel = new THREE.Mesh(new THREE.BoxGeometry(0.076, 0.003, 0.014), this.darkChassisMat);
        gaugeBezel.position.set(0, 0.017, -0.082);
        pivotGroup.add(gaugeBezel);

        const topGaugeMats: THREE.MeshBasicMaterial[] = [];
        const segPositions = [-0.025, -0.008, 0.008, 0.025];
        segPositions.forEach(xOffset => {
            const mat = new THREE.MeshBasicMaterial({ color: '#1E293B' });
            const seg = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.004, 0.009), mat);
            seg.position.set(xOffset, 0.019, -0.082);
            pivotGroup.add(seg);
            topGaugeMats.push(mat);
        });

        // Horizontal Transparent Vacuum Capsule Tank
        const horizontalTankGroup = new THREE.Group();
        const yElevation = 0.028 + (tankScale - 1.0) * 0.018;
        horizontalTankGroup.position.set(0, yElevation, -0.048);
        pivotGroup.add(horizontalTankGroup);

        // Heavy-duty mounting cradles under the capsule (spaced by tankLength, sized by tankScale)
        [-0.024 * tankLength, 0.024 * tankLength].forEach(xPos => {
            const cradle = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.014 * tankScale, 0.038 * tankScale), this.darkChassisMat);
            cradle.position.set(xPos, -0.008 * tankScale, 0);
            horizontalTankGroup.add(cradle);
        });

        // Left & Right Metallic End Caps & Collars (positioned at ends of scaled length)
        const capX = 0.034 * tankLength + 0.004 * tankScale;
        const collarX = 0.034 * tankLength + 0.001 * tankScale;
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

        // 3 Vertical Calibration Tick Rings
        [-0.017 * tankLength, 0.0, 0.017 * tankLength].forEach(xPos => {
            const tickRing = new THREE.Mesh(
                new THREE.TorusGeometry(0.0224 * tankScale, 0.0011 * tankScale, 8, 24),
                this.tickMat
            );
            tickRing.rotation.y = Math.PI / 2;
            tickRing.position.set(xPos, 0, 0);
            horizontalTankGroup.add(tickRing);
        });

        // Radiant Luminous Stardust Fill Cylinder
        const fillCol = new THREE.Color('#38BDF8');
        const tankFillMat = new THREE.MeshStandardMaterial({
            color: fillCol,
            emissive: fillCol,
            emissiveIntensity: ConfigManager.current.tankGlowIntensity ?? 0.65,
            roughness: 0.35,
            metalness: 0.1,
            transparent: true,
            opacity: 0.95
        });
        const tankFillMesh = new THREE.Mesh(
            new THREE.CylinderGeometry(0.020 * tankScale, 0.020 * tankScale, 1.0, 18),
            tankFillMat
        );
        tankFillMesh.rotation.z = Math.PI / 2;
        tankFillMesh.scale.set(1.0, 0.001, 1.0);
        tankFillMesh.position.set(-0.033 * tankLength, 0, 0);
        horizontalTankGroup.add(tankFillMesh);

        // Razor-Sharp Glowing Surface Floater Ring
        const tankFloaterMat = new THREE.MeshStandardMaterial({
            color: '#FFFFFF',
            emissive: fillCol,
            emissiveIntensity: 0.92,
            roughness: 0.2
        });
        const tankFloaterMesh = new THREE.Mesh(
            new THREE.TorusGeometry(0.0205 * tankScale, 0.0018 * tankScale, 8, 20),
            tankFloaterMat
        );
        tankFloaterMesh.rotation.y = Math.PI / 2;
        tankFloaterMesh.position.set(-0.033 * tankLength, 0, 0);
        tankFloaterMesh.visible = false;
        horizontalTankGroup.add(tankFloaterMesh);

        // Internal Swirling Dust Particles
        const tankDustParticles: THREE.Mesh[] = [];
        for (let d = 0; d < 6; d++) {
            const bead = new THREE.Mesh(
                new THREE.SphereGeometry(0.0035 * tankScale, 8, 8),
                new THREE.MeshBasicMaterial({ color: d % 2 === 0 ? '#FDE047' : '#38BDF8' })
            );
            bead.position.set(0, 0, 0);
            bead.visible = false;
            horizontalTankGroup.add(bead);
            tankDustParticles.push(bead);
        }

        // 3-Stage Dynamic LEDs on rear bumper
        const cartLedMats: THREE.MeshBasicMaterial[] = [];
        [-0.020, 0.0, 0.020].forEach(xOffset => {
            const mat = new THREE.MeshBasicMaterial({ color: '#1E293B' });
            const led = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.006, 0.003), mat);
            led.position.set(xOffset, 0.015, -0.095);
            pivotGroup.add(led);
            cartLedMats.push(mat);
        });

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
            targetFill: 0
        };
    }

    public rebuildCarts(count: number): void {
        const targetCount = THREE.MathUtils.clamp(Math.round(count), 1, 5);

        // Detach existing cart chain
        if (this.trailerCarts.length > 0 && this.trailerCarts[0].pivotGroup.parent) {
            this.trailerCarts[0].pivotGroup.parent.remove(this.trailerCarts[0].pivotGroup);
        }
        this.trailerCarts = [];

        const tankScale = THREE.MathUtils.clamp(ConfigManager.current.tankScale || 1.0, 0.5, 2.5);
        const tankLength = THREE.MathUtils.clamp(ConfigManager.current.tankLength || 1.0, 0.5, 2.5);
        let parentGroup: THREE.Group = this.visualBodyGroup;

        for (let i = 0; i < targetCount; i++) {
            const cart = this.buildSingleCart(i, parentGroup, tankScale, tankLength);
            this.trailerCarts.push(cart);
            parentGroup = cart.pivotGroup;
        }

        this.syncAliases();
        this.updateAllCartsStyle();
    }

    public updateTankScale(scale: number): void {
        const clamped = THREE.MathUtils.clamp(scale, 0.5, 2.5);
        for (const cart of this.trailerCarts) {
            cart.horizontalTankGroup.scale.set(clamped, clamped, clamped);
            const yElevation = 0.028 + (clamped - 1.0) * 0.018;
            cart.horizontalTankGroup.position.y = yElevation;
        }
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
        this.updateTransform(0.016);
    }

    public addDust(amount: number): void {
        this.stats.currentDust = Math.min(this.stats.tankCapacity, this.stats.currentDust + amount);
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
        // Cart wheels spin and trailer train articulation
        for (let i = 0; i < this.trailerCarts.length; i++) {
            const cart = this.trailerCarts[i];
            for (let w = 0; w < cart.cartWheelMeshes.length; w++) {
                cart.cartWheelMeshes[w].rotation.x = this.wheelSpin;
            }

            let targetYaw = 0;
            if (i === 0) {
                targetYaw = THREE.MathUtils.clamp(-this.steerAngle * 0.70, -0.38, 0.38);
            } else {
                const prevCart = this.trailerCarts[i - 1];
                targetYaw = THREE.MathUtils.clamp(prevCart.yaw * 0.82, -0.38, 0.38);
            }
            cart.targetYaw = targetYaw;
            const springRate = Math.max(4.0, 8.5 - i * 0.9);
            cart.yaw += (targetYaw - cart.yaw) * (1 - Math.exp(-springRate * dt));
            if (cart.pivotGroup) {
                cart.pivotGroup.rotation.y = cart.yaw;
            }
        }

        // Sequential Fill Logic: Carts fill one by one from Cart 0 to Cart N-1
        const numCarts = Math.max(1, this.trailerCarts.length);
        const cartCap = this.stats.tankCapacity / numCarts;
        const currentDust = this.stats.currentDust;
        const tankLength = ConfigManager.current.tankLength || 1.0;
        const swirlTime = performance.now() * 0.005;

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

            const fillLen = Math.max(0.001, cart.visualFill * 0.066 * tankLength);

            if (cart.tankFillMesh) {
                cart.tankFillMesh.scale.set(1.0, fillLen, 1.0);
                cart.tankFillMesh.position.x = -0.033 * tankLength + fillLen * 0.5;
            }

            // Razor-sharp glowing surface floater ring sliding along X axis
            if (cart.tankFloaterMesh) {
                if (cart.visualFill > 0.015) {
                    cart.tankFloaterMesh.visible = true;
                    cart.tankFloaterMesh.position.x = (-0.033 + cart.visualFill * 0.066) * tankLength;
                } else {
                    cart.tankFloaterMesh.visible = false;
                }
            }

            // TOP-FACING 4-SEGMENT STARDUST METER ON THE TRAILER BED (Reflects this cart's fill!)
            if (cart.topGaugeMats.length === 4) {
                const fill = cart.visualFill;
                cart.topGaugeMats[0].color.set(fill >= 0.15 ? '#38BDF8' : '#1E293B');
                cart.topGaugeMats[1].color.set(fill >= 0.40 ? '#38BDF8' : '#1E293B');
                cart.topGaugeMats[2].color.set(fill >= 0.65 ? '#38BDF8' : '#1E293B');
                if (fill >= 0.90) {
                    const isOverallFull = currentDust >= this.stats.tankCapacity * 0.98;
                    if (isOverallFull) {
                        const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.012);
                        cart.topGaugeMats[3].color.set(pulse > 0.4 ? '#FACC15' : '#EF4444');
                        cart.topGaugeMats[0].color.set('#38BDF8');
                        cart.topGaugeMats[1].color.set('#38BDF8');
                        cart.topGaugeMats[2].color.set('#38BDF8');
                    } else {
                        cart.topGaugeMats[3].color.set('#38BDF8');
                    }
                } else {
                    cart.topGaugeMats[3].color.set('#1E293B');
                }
            }

            // 3-Stage Dynamic LEDs on rear bumper of cart
            if (cart.cartLedMats.length === 3) {
                const fill = cart.visualFill;
                cart.cartLedMats[0].color.set(fill > 0.05 ? '#38BDF8' : '#1E293B');
                cart.cartLedMats[1].color.set(fill > 0.50 ? '#38BDF8' : '#1E293B');
                const isOverallFull = currentDust >= this.stats.tankCapacity * 0.98;
                if (fill >= 0.98 && isOverallFull) {
                    const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.012);
                    cart.cartLedMats[2].color.set(pulse > 0.4 ? '#FACC15' : '#EF4444');
                } else if (fill >= 0.95) {
                    cart.cartLedMats[2].color.set('#38BDF8');
                } else {
                    cart.cartLedMats[2].color.set('#1E293B');
                }
            }

            // Swirl internal glowing dust particles inside the horizontal filled volume
            const cartSwirlTime = swirlTime + i * 0.9;
            for (let d = 0; d < cart.tankDustParticles.length; d++) {
                const bead = cart.tankDustParticles[d];
                if (cart.visualFill > 0.03) {
                    bead.visible = true;
                    const angle = cartSwirlTime + d * (Math.PI * 2 / cart.tankDustParticles.length);
                    const r = 0.010 * (0.8 + 0.2 * Math.sin(cartSwirlTime * 0.8 + d));
                    const currentLen = cart.visualFill * 0.066 * tankLength;
                    bead.position.x = -0.033 * tankLength + (d / Math.max(1, cart.tankDustParticles.length - 1)) * currentLen;
                    bead.position.y = Math.sin(angle) * r;
                    bead.position.z = Math.cos(angle) * r;
                } else {
                    bead.visible = false;
                }
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
        // TERRAIN GROUND CONTOURING & CRATER CONFORMANCE FOR ALL CARTS
        // -------------------------------------------------------------
        this.group.updateMatrixWorld(true);

        for (let i = 0; i < this.trailerCarts.length; i++) {
            const cart = this.trailerCarts[i];
            if (!cart.pivotGroup) continue;

            cart.pivotGroup.updateMatrixWorld(true);

            // Wheel axle center point in cart local space: (0, 0, -0.052)
            this._tmpCartCenter.set(0, 0, -0.052);
            cart.pivotGroup.localToWorld(this._tmpCartCenter);

            // Left wheel: (-0.049, 0, -0.052)
            this._tmpCartLeft.set(-0.049, 0, -0.052);
            cart.pivotGroup.localToWorld(this._tmpCartLeft);

            // Right wheel: (0.049, 0, -0.052)
            this._tmpCartRight.set(0.049, 0, -0.052);
            cart.pivotGroup.localToWorld(this._tmpCartRight);

            // Sample actual terrain height beneath cart's wheels
            const dirCenter = this._tmpCartCenter.clone().normalize();
            const groundRadiusCenter = this.moon.sampleActualSurfaceRadiusAt(dirCenter.x, dirCenter.y, dirCenter.z);

            const dirLeft = this._tmpCartLeft.clone().normalize();
            const groundRadiusLeft = this.moon.sampleActualSurfaceRadiusAt(dirLeft.x, dirLeft.y, dirLeft.z);

            const dirRight = this._tmpCartRight.clone().normalize();
            const groundRadiusRight = this.moon.sampleActualSurfaceRadiusAt(dirRight.x, dirRight.y, dirRight.z);

            // Normal expected wheel clearance in world space (sitting on surface)
            const desiredAxleAltitude = 0.005 * invMoonScale;
            const currentAxleAltitude = this._tmpCartCenter.length() - groundRadiusCenter;

            // If currentAxleAltitude > desiredAxleAltitude, cart is floating above ground!
            const altitudeDiff = currentAxleAltitude - desiredAxleAltitude;
            const wheelBase = 0.052 * invMoonScale;

            // Pitch tilts down (+) into craters and tilts up (-) over bumps/ridges
            const targetPitch = THREE.MathUtils.clamp(
                Math.atan2(altitudeDiff, wheelBase),
                -0.65,
                0.65
            );

            // Roll leans with left/right crater wall slope
            const rollDiff = groundRadiusLeft - groundRadiusRight;
            const trackWidth = (2 * 0.049) * invMoonScale;
            const targetRoll = THREE.MathUtils.clamp(
                Math.atan2(rollDiff, trackWidth),
                -0.45,
                0.45
            );

            cart.targetPitch = targetPitch;
            cart.targetRoll = targetRoll;

            // Smooth damping
            cart.pitch += (targetPitch - cart.pitch) * (1 - Math.exp(-14 * dt));
            cart.roll += (targetRoll - cart.roll) * (1 - Math.exp(-12 * dt));

            // Apply 3D orientation (Y = steering yaw, X = ground pitch, Z = slope roll)
            cart.pivotGroup.rotation.order = 'YXZ';
            cart.pivotGroup.rotation.y = cart.yaw;
            cart.pivotGroup.rotation.x = cart.pitch;
            cart.pivotGroup.rotation.z = cart.roll;
        }
    }
}
