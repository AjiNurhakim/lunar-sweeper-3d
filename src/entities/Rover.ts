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

    // Vacuum Cart Trailer & Horizontal Tank
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
        this.stats.tankCapacity = cfg.tankCapacity || 100;
        this.updateSweeperVisualWidth();

        if (this.tankGlassMat) {
            this.tankGlassMat.opacity = cfg.tankGlassOpacity ?? 0.28;
        }

        if (this.tankFillMat) {
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
                // Boost saturation and brightness for rich, vibrant glowing celestial energy
                fillCol.setHSL(hsl.h, Math.max(0.78, hsl.s), 0.55);
            } else {
                fillCol = new THREE.Color('#38BDF8');
            }

            const glow = cfg.tankGlowIntensity ?? 0.65;
            this.tankFillMat.color.copy(fillCol);
            this.tankFillMat.emissive.copy(fillCol);
            this.tankFillMat.emissiveIntensity = glow;

            if (this.tankFloaterMat) {
                this.tankFloaterMat.color.set('#FFFFFF');
                this.tankFloaterMat.emissive.copy(fillCol);
                this.tankFloaterMat.emissiveIntensity = Math.min(2.0, glow * 1.4);
            }
        }

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

        // 6. Trailer Cart & Vacuum Canister Assembly
        this.cartPivotGroup = new THREE.Group();
        this.cartPivotGroup.position.set(0, 0.022, -0.065);
        this.visualBodyGroup.add(this.cartPivotGroup);

        // Trailer Tongue / Hitch
        const tongue = new THREE.Mesh(new THREE.BoxGeometry(0.009, 0.008, 0.024), darkChassisMat);
        tongue.position.set(0, 0, -0.012);
        this.cartPivotGroup.add(tongue);

        // Cart Tray / Chassis (wider and slightly longer for prominent canister)
        const cartChassis = new THREE.Mesh(new THREE.BoxGeometry(0.082, 0.012, 0.088), darkChassisMat);
        cartChassis.position.set(0, 0.004, -0.052);
        this.cartPivotGroup.add(cartChassis);

        // Yellow Cart Rails & Protective Frame
        const leftRail = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.018, 0.088), yellowBodyMat);
        leftRail.position.set(-0.041, 0.015, -0.052);
        this.cartPivotGroup.add(leftRail);

        const rightRail = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.018, 0.088), yellowBodyMat);
        rightRail.position.set(0.041, 0.015, -0.052);
        this.cartPivotGroup.add(rightRail);

        const rearBumper = new THREE.Mesh(new THREE.BoxGeometry(0.088, 0.016, 0.007), yellowDarkMat);
        rearBumper.position.set(0, 0.015, -0.095);
        this.cartPivotGroup.add(rearBumper);

        // Cart Wheels (2 wheels on the trailer cart - layered with zero Z-fighting)
        this.cartWheelMeshes = [];
        [-1, 1].forEach(side => {
            const wheelGroup = new THREE.Group();
            wheelGroup.position.set(side * 0.049, 0, -0.052);

            const tire = new THREE.Mesh(
                new THREE.CylinderGeometry(0.018, 0.018, 0.013, 18),
                darkChassisMat
            );
            tire.rotation.z = Math.PI / 2;
            wheelGroup.add(tire);

            const hub = new THREE.Mesh(
                new THREE.CylinderGeometry(0.010, 0.010, 0.0025, 14),
                yellowBodyMat
            );
            hub.rotation.z = Math.PI / 2;
            hub.position.x = side * 0.0068;
            wheelGroup.add(hub);

            const nut = new THREE.Mesh(
                new THREE.CylinderGeometry(0.0035, 0.0035, 0.002, 8),
                darkChassisMat
            );
            nut.rotation.z = Math.PI / 2;
            nut.position.x = side * 0.0082;
            wheelGroup.add(nut);

            this.cartPivotGroup.add(wheelGroup);
            this.cartWheelMeshes.push(wheelGroup);
        });

        // -------------------------------------------------------------
        // TOP-FACING 4-SEGMENT STARDUST METER ON THE TRAILER BED
        // (100% visible from pure top-down camera view!)
        // -------------------------------------------------------------
        const gaugeBezel = new THREE.Mesh(new THREE.BoxGeometry(0.076, 0.003, 0.014), darkChassisMat);
        gaugeBezel.position.set(0, 0.017, -0.082);
        this.cartPivotGroup.add(gaugeBezel);

        this.topGaugeMats = [];
        const segPositions = [-0.025, -0.008, 0.008, 0.025];
        segPositions.forEach(xOffset => {
            const mat = new THREE.MeshBasicMaterial({ color: '#1E293B' });
            const seg = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.004, 0.009), mat);
            seg.position.set(xOffset, 0.019, -0.082);
            this.cartPivotGroup.add(seg);
            this.topGaugeMats.push(mat);
        });

        // -------------------------------------------------------------
        // HORIZONTAL TRANSPARENT VACUUM CAPSULE TANK
        // Lies horizontally across trailer (X-axis), completely exposed to top-down view!
        // -------------------------------------------------------------
        this.horizontalTankGroup = new THREE.Group();
        this.horizontalTankGroup.position.set(0, 0.028, -0.048);
        this.cartPivotGroup.add(this.horizontalTankGroup);

        // Heavy-duty mounting cradles / saddles under the capsule
        [-0.024, 0.024].forEach(xPos => {
            const cradle = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.014, 0.038), darkChassisMat);
            cradle.position.set(xPos, -0.008, 0);
            this.horizontalTankGroup.add(cradle);
        });

        // Left & Right Metallic End Caps
        [-0.037, 0.037].forEach(xPos => {
            const cap = new THREE.Mesh(
                new THREE.CylinderGeometry(0.024, 0.024, 0.008, 18),
                yellowDarkMat
            );
            cap.rotation.z = Math.PI / 2;
            cap.position.set(xPos, 0, 0);
            this.horizontalTankGroup.add(cap);

            const collar = new THREE.Mesh(
                new THREE.CylinderGeometry(0.0245, 0.0245, 0.003, 18),
                darkChassisMat
            );
            collar.rotation.z = Math.PI / 2;
            collar.position.set(xPos > 0 ? xPos - 0.004 : xPos + 0.004, 0, 0);
            this.horizontalTankGroup.add(collar);
        });

        // Horizontal Crystal-Clear Glass Capsule Tube
        const glassMat = new THREE.MeshStandardMaterial({
            color: '#E0F2FE',
            roughness: 0.06,
            metalness: 0.12,
            transparent: true,
            opacity: 0.28,
            depthWrite: false
        });
        this.tankGlassMat = glassMat;
        const glassTube = new THREE.Mesh(
            new THREE.CylinderGeometry(0.022, 0.022, 0.068, 20),
            glassMat
        );
        glassTube.rotation.z = Math.PI / 2;
        this.horizontalTankGroup.add(glassTube);

        // Inner Horizontal Polished Chrome Spine / Center Rod (visible when tube is empty!)
        const coreRodMat = new THREE.MeshStandardMaterial({
            color: '#E2E8F0',
            roughness: 0.15,
            metalness: 0.90
        });
        const coreRod = new THREE.Mesh(
            new THREE.CylinderGeometry(0.0035, 0.0035, 0.068, 12),
            coreRodMat
        );
        coreRod.rotation.z = Math.PI / 2;
        this.horizontalTankGroup.add(coreRod);

        // 3 Vertical Calibration Tick Rings (Measurement bands at 25%, 50%, 75% width)
        const tickMat = new THREE.MeshBasicMaterial({ color: '#BAE6FD' });
        [-0.017, 0.0, 0.017].forEach(xPos => {
            const tickRing = new THREE.Mesh(
                new THREE.TorusGeometry(0.0224, 0.0011, 8, 24),
                tickMat
            );
            tickRing.rotation.y = Math.PI / 2;
            tickRing.position.set(xPos, 0, 0);
            this.horizontalTankGroup.add(tickRing);
        });

        // Vacuum Hose from cabin to Left End Cap
        const hoseMat = new THREE.MeshStandardMaterial({ color: '#0F172A', roughness: 0.7 });
        const hoseSeg = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.034, 10), hoseMat);
        hoseSeg.position.set(-0.026, 0.052, -0.054);
        hoseSeg.rotation.x = 0.65;
        hoseSeg.rotation.z = -0.30;
        this.visualBodyGroup.add(hoseSeg);

        // Radiant Luminous Dust Fill Mesh Inside Horizontal Tube
        const p = this.moon.currentPalette;
        const fillCol = new THREE.Color(p ? p.baseColor : '#38BDF8');
        const hsl = { h: 0, s: 0, l: 0 };
        fillCol.getHSL(hsl);
        fillCol.setHSL(hsl.h, Math.max(0.78, hsl.s), 0.55);

        this.tankFillMat = new THREE.MeshStandardMaterial({
            color: fillCol,
            emissive: fillCol,
            emissiveIntensity: 0.65,
            roughness: 0.35,
            metalness: 0.1,
            transparent: true,
            opacity: 0.95
        });
        // Unit length = 1.0 along local Y, rotated so local Y aligns with world X!
        this.tankFillMesh = new THREE.Mesh(
            new THREE.CylinderGeometry(0.020, 0.020, 1.0, 18),
            this.tankFillMat
        );
        this.tankFillMesh.rotation.z = Math.PI / 2;
        this.tankFillMesh.scale.set(1.0, 0.001, 1.0);
        this.tankFillMesh.position.set(-0.033, 0, 0);
        this.horizontalTankGroup.add(this.tankFillMesh);

        // Razor-Sharp Glowing Surface Floater Ring (Sliding level divider along X!)
        this.tankFloaterMat = new THREE.MeshStandardMaterial({
            color: '#FFFFFF',
            emissive: fillCol,
            emissiveIntensity: 0.92,
            roughness: 0.2
        });
        this.tankFloaterMesh = new THREE.Mesh(
            new THREE.TorusGeometry(0.0205, 0.0018, 8, 20),
            new THREE.MeshBasicMaterial({ color: '#FFFFFF' })
        );
        this.tankFloaterMesh.rotation.y = Math.PI / 2;
        this.tankFloaterMesh.position.set(-0.033, 0, 0);
        this.tankFloaterMesh.visible = false;
        this.horizontalTankGroup.add(this.tankFloaterMesh);

        // Internal Swirling Glowing Dust Particles
        this.tankDustParticles = [];
        for (let d = 0; d < 6; d++) {
            const bead = new THREE.Mesh(
                new THREE.SphereGeometry(0.0035, 8, 8),
                new THREE.MeshBasicMaterial({ color: d % 2 === 0 ? '#FDE047' : '#38BDF8' })
            );
            bead.position.set(0, 0, 0);
            bead.visible = false;
            this.horizontalTankGroup.add(bead);
            this.tankDustParticles.push(bead);
        }

        // 3-Stage Dynamic LED Indicators on Cart Rear Bumper
        this.cartLedMats = [];
        [-0.020, 0.0, 0.020].forEach(xOffset => {
            const mat = new THREE.MeshBasicMaterial({ color: '#1E293B' });
            const led = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.006, 0.003), mat);
            led.position.set(xOffset, 0.015, -0.095);
            this.cartPivotGroup.add(led);
            this.cartLedMats.push(mat);
        });

        this.updateSweeperVisualWidth();
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
        if (this.tankFillMat && this.moon.currentPalette) {
            const p = this.moon.currentPalette;
            const fillCol = new THREE.Color(p.baseColor);
            const hsl = { h: 0, s: 0, l: 0 };
            fillCol.getHSL(hsl);
            // Boost saturation and brightness for rich, vibrant glowing celestial energy
            fillCol.setHSL(hsl.h, Math.max(0.78, hsl.s), 0.55);

            this.tankFillMat.color.copy(fillCol);
            this.tankFillMat.emissive.copy(fillCol);
            this.tankFillMat.emissiveIntensity = 0.60;

            if (this.tankFloaterMat) {
                this.tankFloaterMat.color.set('#FFFFFF');
                this.tankFloaterMat.emissive.copy(fillCol);
                this.tankFloaterMat.emissiveIntensity = 0.90;
            }
        }
        if (this.tankFillMesh) {
            this.tankFillMesh.scale.set(1.0, 0.001, 1.0);
            this.tankFillMesh.position.set(-0.033, 0, 0);
        }
        if (this.tankFloaterMesh) {
            this.tankFloaterMesh.visible = false;
        }
        for (let i = 0; i < this.cartLedMats.length; i++) {
            this.cartLedMats[i].color.set('#1E293B');
        }
        for (let i = 0; i < this.topGaugeMats.length; i++) {
            this.topGaugeMats[i].color.set('#1E293B');
        }
        this.applyConfig();
        this.updateTransform();
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
        // Cart wheels spin
        for (let i = 0; i < this.cartWheelMeshes.length; i++) {
            this.cartWheelMeshes[i].rotation.x = this.wheelSpin;
        }

        // Cart articulation trailer physics (sways slightly with steering)
        this.targetCartYaw = THREE.MathUtils.clamp(-this.steerAngle * 0.70, -0.38, 0.38);
        this.cartYaw += (this.targetCartYaw - this.cartYaw) * (1 - Math.exp(-8 * dt));
        if (this.cartPivotGroup) {
            this.cartPivotGroup.rotation.y = this.cartYaw;
        }

        // Update dynamic tank fill level
        const targetFill = THREE.MathUtils.clamp(this.stats.currentDust / this.stats.tankCapacity, 0.0, 1.0);
        this.visualTankFill += (targetFill - this.visualTankFill) * (1 - Math.exp(-9 * dt));

        // Horizontal capsule fill animation (fills left-to-right from -0.033 to +0.033 along X)
        const fillLen = Math.max(0.001, this.visualTankFill * 0.066);
        if (this.tankFillMesh) {
            this.tankFillMesh.scale.set(1.0, fillLen, 1.0);
            this.tankFillMesh.position.x = -0.033 + fillLen * 0.5;
        }

        // Razor-sharp glowing surface floater ring sliding along X axis
        if (this.tankFloaterMesh) {
            if (this.visualTankFill > 0.015) {
                this.tankFloaterMesh.visible = true;
                this.tankFloaterMesh.position.x = -0.033 + this.visualTankFill * 0.066;
            } else {
                this.tankFloaterMesh.visible = false;
            }
        }

        // TOP-FACING 4-SEGMENT STARDUST METER ON THE TRAILER BED (Directly visible from top-down!)
        if (this.topGaugeMats.length === 4) {
            const fill = this.visualTankFill;
            // Segment 0 (25%)
            this.topGaugeMats[0].color.set(fill >= 0.15 ? '#38BDF8' : '#1E293B');
            // Segment 1 (50%)
            this.topGaugeMats[1].color.set(fill >= 0.40 ? '#38BDF8' : '#1E293B');
            // Segment 2 (75%)
            this.topGaugeMats[2].color.set(fill >= 0.65 ? '#38BDF8' : '#1E293B');
            // Segment 3 (100% - Warning Pulse when Full!)
            if (fill >= 0.90) {
                if (fill >= 0.98) {
                    const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.012);
                    this.topGaugeMats[3].color.set(pulse > 0.4 ? '#FACC15' : '#EF4444');
                    this.topGaugeMats[0].color.set('#38BDF8');
                    this.topGaugeMats[1].color.set('#38BDF8');
                    this.topGaugeMats[2].color.set('#38BDF8');
                } else {
                    this.topGaugeMats[3].color.set('#38BDF8');
                }
            } else {
                this.topGaugeMats[3].color.set('#1E293B');
            }
        }

        // 3-Stage Dynamic LEDs on rear bumper of cart
        if (this.cartLedMats.length === 3) {
            const fill = this.visualTankFill;
            // LED 1 (Level > 5%)
            this.cartLedMats[0].color.set(fill > 0.05 ? '#38BDF8' : '#1E293B');
            // LED 2 (Level > 50%)
            this.cartLedMats[1].color.set(fill > 0.50 ? '#38BDF8' : '#1E293B');
            // LED 3 (Level >= 98% - Warning Pulse when Full!)
            if (fill >= 0.98) {
                const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.012);
                this.cartLedMats[2].color.set(pulse > 0.4 ? '#FACC15' : '#EF4444');
            } else {
                this.cartLedMats[2].color.set('#1E293B');
            }
        }

        // Swirl internal glowing dust particles inside the horizontal filled volume
        const swirlTime = performance.now() * 0.005;
        for (let d = 0; d < this.tankDustParticles.length; d++) {
            const bead = this.tankDustParticles[d];
            if (this.visualTankFill > 0.03) {
                bead.visible = true;
                const angle = swirlTime + d * (Math.PI * 2 / this.tankDustParticles.length);
                const r = 0.010 * (0.8 + 0.2 * Math.sin(swirlTime * 0.8 + d));
                const currentLen = this.visualTankFill * 0.066;
                bead.position.x = -0.033 + (d / Math.max(1, this.tankDustParticles.length - 1)) * currentLen;
                bead.position.y = Math.sin(angle) * r;
                bead.position.z = Math.cos(angle) * r;
            } else {
                bead.visible = false;
            }
        }

        if (this.sweeperRollerMesh) {
            this.sweeperRollerMesh.rotation.x = -this.sweeperSpin;
        }
        if (this.beaconMesh) {
            const pulse = 0.85 + 0.3 * Math.sin(performance.now() * 0.008);
            this.beaconMesh.scale.setScalar(pulse);
        }

        this.updateTransform();
        this.updateDustParticles(dt);
    }

    private updateTransform(): void {
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
    }
}
