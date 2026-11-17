import * as THREE from 'three';
import { Moon } from './Moon';
import { Rover } from './Rover';

export class BaseStation {
    public group: THREE.Group;
    public moon: Moon;

    public positionUnit = new THREE.Vector3(0, 1, 0); // North Pole
    public rocketPosWorld = new THREE.Vector3();
    public suctionReachRadius = 0.52; // Generous reach for docking

    // Rocket Meshes & Group
    private rocketGroup!: THREE.Group;
    private thrusterFlame!: THREE.Mesh;
    private rocketManifoldMesh!: THREE.Mesh;
    private holsterBracketMesh!: THREE.Mesh;

    // Semi-Transparent Suction Hose & Continuous Liquid Stream
    private hoseGroup!: THREE.Group;
    private suctionHoseMesh!: THREE.Mesh;
    private innerLiquidMesh!: THREE.Mesh;
    private suctionNozzleGroup!: THREE.Group;
    private suctionHoseMat!: THREE.MeshStandardMaterial;
    private innerLiquidMat!: THREE.MeshStandardMaterial;
    private liquidTexture!: THREE.CanvasTexture;
    private hoseCurvePoints: THREE.Vector3[] = [];

    // Hose Docking State
    public isDocked = false;
    private currentDockT = 0; // 0 = holstered on rocket leg, 1 = connected to cart port
    private rocketHoseOrigin = new THREE.Vector3(0.038, 0.072, 0.015); // Local origin on rocket lower hull
    private idleHoseEnd = new THREE.Vector3(0.048, 0.038, 0.040); // Resting on rocket leg holster
    private activeHoseEnd = new THREE.Vector3(0.048, 0.038, 0.040);
    private activeNozzleQuat = new THREE.Quaternion();
    private lastActiveCartIdx = -1;
    private prevCartPortLocal = new THREE.Vector3();
    private cartTransitionT = 1.0;

    // 3D Nav Arrow hovering above rover
    public navArrowGroup: THREE.Group;

    // Temporary math vectors to avoid GC pressure
    private _tmpRoverWorld = new THREE.Vector3();
    private _tmpCartWorld = new THREE.Vector3();
    private _tmpCartNormal = new THREE.Vector3();
    private _tmpTargetLocal = new THREE.Vector3();
    private _tmpTargetNormalLocal = new THREE.Vector3(0, 0, 1);
    private _tmpTargetNormalOpposite = new THREE.Vector3(0, 0, -1);
    private _tmpNozzleCenterLocal = new THREE.Vector3();
    private _tmpTargetQuat = new THREE.Quaternion();
    private _tmpDustColor = new THREE.Color();
    private _tmpP0 = new THREE.Vector3();
    private _tmpP1 = new THREE.Vector3();
    private _tmpP2 = new THREE.Vector3();
    private _tmpInvMat = new THREE.Matrix4();

    constructor(moon: Moon) {
        this.moon = moon;
        this.group = new THREE.Group();
        this.moon.group.add(this.group);

        this.navArrowGroup = new THREE.Group();
        this.moon.group.add(this.navArrowGroup);

        this.buildRocketAndHose();
        this.buildNavArrow();
        this.repositionOnMoon();
    }

    private createLiquidTexture(): THREE.CanvasTexture {
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 128;
        const ctx = canvas.getContext('2d')!;

        // Vertical continuous liquid fluid streaks
        const grad = ctx.createLinearGradient(0, 0, 0, 128);
        grad.addColorStop(0.00, '#FFFFFF');
        grad.addColorStop(0.20, '#DDDDDD');
        grad.addColorStop(0.45, '#FFFFFF');
        grad.addColorStop(0.70, '#BBBBBB');
        grad.addColorStop(1.00, '#FFFFFF');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 32, 128);

        // Fluid turbulence bubbles and wave bands
        ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
        for (let y = 8; y < 128; y += 22) {
            ctx.beginPath();
            ctx.ellipse(16, y, 10, 5, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(1, 3);
        return texture;
    }

    private buildRocketAndHose(): void {
        // --- Stylized Soft 3D Clay Materials ---
        const clayWhiteMat = new THREE.MeshStandardMaterial({
            color: '#F8FAFC',
            roughness: 0.82,
            metalness: 0.04
        });
        const clayTerracottaMat = new THREE.MeshStandardMaterial({
            color: '#EA580C',
            roughness: 0.78,
            metalness: 0.05
        });
        const clayCoralMat = new THREE.MeshStandardMaterial({
            color: '#F97316',
            roughness: 0.78,
            metalness: 0.05
        });
        const clayGoldMat = new THREE.MeshStandardMaterial({
            color: '#F59E0B',
            roughness: 0.76,
            metalness: 0.06
        });
        const claySlateMat = new THREE.MeshStandardMaterial({
            color: '#334155',
            roughness: 0.84,
            metalness: 0.05
        });
        const clayDarkMat = new THREE.MeshStandardMaterial({
            color: '#1E293B',
            roughness: 0.88,
            metalness: 0.04
        });
        const clayGlassMat = new THREE.MeshStandardMaterial({
            color: '#38BDF8',
            roughness: 0.18,
            metalness: 0.10,
            transparent: true,
            opacity: 0.85
        });

        // 1. Semi-transparent silicone outer hose
        this.suctionHoseMat = new THREE.MeshStandardMaterial({
            color: '#BAE6FD',
            roughness: 0.25,
            metalness: 0.05,
            transparent: true,
            opacity: 0.52,
            depthWrite: false
        });

        // 2. Continuous flowing liquid core inside the hose
        this.liquidTexture = this.createLiquidTexture();
        this.innerLiquidMat = new THREE.MeshStandardMaterial({
            color: '#38BDF8',
            emissive: '#38BDF8',
            emissiveIntensity: 0.95,
            map: this.liquidTexture,
            emissiveMap: this.liquidTexture,
            roughness: 0.22,
            metalness: 0.12,
            transparent: true,
            opacity: 0.90
        });

        this.rocketGroup = new THREE.Group();

        // Compact Launch Collar directly on lunar ground
        const launchCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.074, 0.012, 24), claySlateMat);
        launchCollar.position.y = 0.006;
        this.rocketGroup.add(launchCollar);

        const launchRim = new THREE.Mesh(new THREE.TorusGeometry(0.069, 0.004, 10, 28), clayCoralMat);
        launchRim.rotation.x = Math.PI / 2;
        launchRim.position.y = 0.012;
        this.rocketGroup.add(launchRim);

        // Rocket Fuselage
        const rocketFuselage = new THREE.Group();
        rocketFuselage.position.y = 0.024;

        // Lower Fuselage
        const lowerBody = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.046, 0.090, 24), clayWhiteMat);
        lowerBody.position.y = 0.048;
        rocketFuselage.add(lowerBody);

        // Mid Fuselage with Coral Band
        const midBody = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.038, 0.080, 24), clayWhiteMat);
        midBody.position.y = 0.133;
        rocketFuselage.add(midBody);

        const midStripe = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.016, 24), clayCoralMat);
        midStripe.position.y = 0.133;
        rocketFuselage.add(midStripe);

        // Rounded Clay Nose Cone Dome & Bulbous Tip
        const noseCone = new THREE.Mesh(
            new THREE.SphereGeometry(0.035, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.62),
            clayTerracottaMat
        );
        noseCone.position.y = 0.173;
        rocketFuselage.add(noseCone);

        const noseTip = new THREE.Mesh(new THREE.SphereGeometry(0.009, 14, 14), clayTerracottaMat);
        noseTip.position.y = 0.208;
        rocketFuselage.add(noseTip);

        // Round Porthole Window
        const windowFrame = new THREE.Mesh(new THREE.TorusGeometry(0.015, 0.004, 12, 24), claySlateMat);
        windowFrame.position.set(0, 0.133, 0.035);
        rocketFuselage.add(windowFrame);

        const windowGlass = new THREE.Mesh(
            new THREE.SphereGeometry(0.014, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.5),
            clayGlassMat
        );
        windowGlass.rotation.x = Math.PI / 2;
        windowGlass.position.set(0, 0.133, 0.035);
        rocketFuselage.add(windowGlass);

        // 3 Chunky Curved Clay Fin Landing Legs
        for (let i = 0; i < 3; i++) {
            const angle = (i / 3) * Math.PI * 2;
            const finGroup = new THREE.Group();
            finGroup.rotation.y = angle;

            const fin = new THREE.Mesh(new THREE.BoxGeometry(0.009, 0.070, 0.036), clayTerracottaMat);
            fin.position.set(0, 0.035, 0.042);
            fin.rotation.x = -0.34;
            finGroup.add(fin);

            const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.018, 0.008, 14), clayDarkMat);
            foot.position.set(0, -0.010, 0.055);
            finGroup.add(foot);

            rocketFuselage.add(finGroup);
        }

        // Flared Thruster Bell Nozzle
        const thrusterNozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.030, 0.024, 20), clayDarkMat);
        thrusterNozzle.position.y = 0.003;
        rocketFuselage.add(thrusterNozzle);

        const goldNozzleRing = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.003, 8, 20), clayGoldMat);
        goldNozzleRing.rotation.x = Math.PI / 2;
        goldNozzleRing.position.y = -0.008;
        rocketFuselage.add(goldNozzleRing);

        // Translucent Thruster Flame (active when moon is clean)
        this.thrusterFlame = new THREE.Mesh(
            new THREE.ConeGeometry(0.028, 0.11, 16),
            new THREE.MeshBasicMaterial({ color: '#F59E0B', transparent: true, opacity: 0.85 })
        );
        this.thrusterFlame.rotation.x = Math.PI;
        this.thrusterFlame.position.y = -0.062;
        this.thrusterFlame.visible = false;
        rocketFuselage.add(this.thrusterFlame);

        // Suction Manifold Valve on Rocket Fuselage
        const rocketManifold = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.016, 14), claySlateMat);
        rocketManifold.rotation.z = Math.PI / 2;
        rocketManifold.position.set(0.038, 0.048, 0.015);
        rocketFuselage.add(rocketManifold);
        this.rocketManifoldMesh = rocketManifold;

        const valveRing = new THREE.Mesh(new THREE.TorusGeometry(0.011, 0.003, 8, 16), clayGoldMat);
        valveRing.rotation.y = Math.PI / 2;
        valveRing.position.set(0.045, 0.048, 0.015);
        rocketFuselage.add(valveRing);

        // Idle Hose Holster Bracket on Rocket Leg
        const holsterBracket = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.022, 8), claySlateMat);
        holsterBracket.position.set(0.048, 0.014, 0.040);
        rocketFuselage.add(holsterBracket);
        this.holsterBracketMesh = holsterBracket;

        this.rocketGroup.add(rocketFuselage);
        this.group.add(this.rocketGroup);

        // 3. Independent Dedicated Hose Group attached directly to this.group for 100% exact math coordinate alignment
        this.hoseGroup = new THREE.Group();
        this.group.add(this.hoseGroup);

        // Initialize spline points
        const pStart = this.rocketHoseOrigin.clone();
        const pMid1 = new THREE.Vector3(pStart.x + 0.03, pStart.y + 0.02, pStart.z + 0.02);
        const pMid2 = new THREE.Vector3(pStart.x + 0.04, pStart.y - 0.01, pStart.z + 0.04);
        const pEnd = this.idleHoseEnd.clone();

        this.hoseCurvePoints = [pStart, pMid1, pMid2, pEnd];
        const initialCurve = new THREE.CatmullRomCurve3(this.hoseCurvePoints);

        // Outer translucent hose tube
        const outerGeom = new THREE.TubeGeometry(initialCurve, 24, 0.0075, 12, false);
        this.suctionHoseMesh = new THREE.Mesh(outerGeom, this.suctionHoseMat);
        this.hoseGroup.add(this.suctionHoseMesh);

        // Inner continuous liquid stream tube (filled with animated flowing fluid)
        const innerGeom = new THREE.TubeGeometry(initialCurve, 24, 0.0052, 10, false);
        this.innerLiquidMesh = new THREE.Mesh(innerGeom, this.innerLiquidMat);
        this.innerLiquidMesh.visible = false; // Hidden until actively transferring fluid!
        this.hoseGroup.add(this.innerLiquidMesh);

        // Magnetic docking nozzle head
        this.suctionNozzleGroup = new THREE.Group();
        this.suctionNozzleGroup.position.copy(pEnd);

        const nozzleHead = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.013, 0.016, 16), clayDarkMat);
        nozzleHead.rotation.x = Math.PI / 2;
        this.suctionNozzleGroup.add(nozzleHead);

        const magneticRing = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.003, 8, 16), clayGoldMat);
        magneticRing.position.z = 0.008;
        this.suctionNozzleGroup.add(magneticRing);

        this.hoseGroup.add(this.suctionNozzleGroup);
    }

    private buildNavArrow(): void {
        const arrowMat = new THREE.MeshBasicMaterial({ color: '#FACC15' });
        const arrowBody = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.035, 8), arrowMat);
        arrowBody.rotation.x = Math.PI / 2;

        const arrowHead = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.025, 8), arrowMat);
        arrowHead.rotation.x = -Math.PI / 2;
        arrowHead.position.z = 0.025;

        this.navArrowGroup.add(arrowBody);
        this.navArrowGroup.add(arrowHead);
        this.navArrowGroup.visible = false;
    }

    public repositionOnMoon(): void {
        const u = this.positionUnit.clone().normalize();
        const r = this.moon.sampleCleanRadiusAt(u.x, u.y, u.z);
        this.group.position.copy(u).multiplyScalar(r);

        // Orient group tangent to sphere at North pole
        const alignQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), u);
        this.group.quaternion.copy(alignQuat);

        this.group.updateMatrixWorld(true);
        this.rocketGroup.getWorldPosition(this.rocketPosWorld);
    }

    /**
     * Checks if the rover is within docking distance of the Rocket using world coordinates.
     */
    public isRoverInDockingZone(rover: Rover): boolean {
        rover.group.getWorldPosition(this._tmpRoverWorld);
        const dist = this._tmpRoverWorld.distanceTo(this.rocketPosWorld);
        return dist <= 0.68 || rover.up.y >= 0.82;
    }

    public isRoverNearRocket(roverWorldPos: THREE.Vector3): boolean {
        return roverWorldPos.distanceTo(this.rocketPosWorld) <= 0.68;
    }

    /**
     * True only when hose is 100% attached to the cart docking port.
     */
    public isHoseConnected(): boolean {
        return this.isDocked && this.currentDockT >= 0.94;
    }

    /**
     * Update animations, solid multi-cart tank docking, and continuous liquid fluid flow into Rocket.
     */
    public update(
        dt: number,
        rover: Rover,
        isUnloadingDust: boolean,
        isReadyToLaunch: boolean
    ): void {
        // Ensure fresh world matrices
        this.group.updateMatrixWorld(true);
        rover.group.updateMatrixWorld(true);

        // Dynamically compute exact local manifold origin and idle holster end
        if (this.rocketManifoldMesh) {
            this.rocketManifoldMesh.getWorldPosition(this._tmpP0);
            this.hoseGroup.worldToLocal(this._tmpP0);
            this.rocketHoseOrigin.copy(this._tmpP0);
        }
        if (this.holsterBracketMesh) {
            this.holsterBracketMesh.getWorldPosition(this._tmpP1);
            this.hoseGroup.worldToLocal(this._tmpP1);
            this.idleHoseEnd.copy(this._tmpP1);
        }

        const nearRocket = this.isRoverInDockingZone(rover);

        // 1. Identify active cart being unloaded
        const activeCartIdx = rover.getActiveUnloadingCartIndex();
        const hasDustToUnload = rover.stats.currentDust > 0.05;
        const cartExists = rover.trailerCarts.length > 0;

        // Dock condition: rover is near the rocket AND has dust in tank
        const shouldDock = nearRocket && hasDustToUnload && cartExists;
        this.isDocked = shouldDock;

        // Smooth docking progress interpolation
        const targetT = shouldDock ? 1.0 : 0.0;
        this.currentDockT += (targetT - this.currentDockT) * (1 - Math.exp(-14.0 * dt));

        if (this.currentDockT > 0.01 && cartExists) {
            // Check if active cart index changed (sequential emptying)
            if (activeCartIdx !== this.lastActiveCartIdx) {
                if (this.lastActiveCartIdx !== -1 && this.currentDockT >= 0.90) {
                    this.prevCartPortLocal.copy(this.activeHoseEnd);
                    this.cartTransitionT = 0.0;
                }
                this.lastActiveCartIdx = activeCartIdx;
            }

            if (this.cartTransitionT < 1.0) {
                this.cartTransitionT = Math.min(1.0, this.cartTransitionT + dt * 4.0);
            }

            // Get the EXACT world coordinates and surface normal of the active cart's side docking port
            const portData = rover.getCartSuctionPortWorld(
                activeCartIdx,
                this.rocketPosWorld,
                this._tmpCartWorld,
                this._tmpCartNormal
            );

            // Convert port world position into hoseGroup local coordinates
            this._tmpTargetLocal.copy(portData.position);
            this.hoseGroup.worldToLocal(this._tmpTargetLocal);

            // Transform port normal into hoseGroup local orientation
            this._tmpTargetNormalLocal.copy(portData.normal);
            this._tmpInvMat.copy(this.hoseGroup.matrixWorld).invert();
            this._tmpTargetNormalLocal.transformDirection(this._tmpInvMat).normalize();

            // Face INTO the port hole: nozzle's +Z points along -normal
            this._tmpTargetNormalOpposite.copy(this._tmpTargetNormalLocal).negate();
            this._tmpTargetQuat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this._tmpTargetNormalOpposite);

            // Center of nozzle sleeve is offset 0.008 outward along normal so magnetic rim touches port flush
            this._tmpNozzleCenterLocal.copy(this._tmpTargetLocal).addScaledVector(this._tmpTargetNormalLocal, 0.008);

            if (this.currentDockT >= 0.95 && this.cartTransitionT >= 1.0) {
                // SOLID LOCK: 100% rigidly sealed to the cart docking port with zero lag or shifting!
                this.activeHoseEnd.copy(this._tmpNozzleCenterLocal);
                this.activeNozzleQuat.copy(this._tmpTargetQuat);
            } else if (this.cartTransitionT < 1.0) {
                // Smooth glide between cart ports
                const s = this.cartTransitionT * this.cartTransitionT * (3 - 2 * this.cartTransitionT);
                this.activeHoseEnd.copy(this.prevCartPortLocal).lerp(this._tmpNozzleCenterLocal, s);
                this.activeNozzleQuat.slerp(this._tmpTargetQuat, s);
            } else {
                // Smooth transition from idle holster to the port
                const t = this.currentDockT / 0.95;
                const s = t * t * (3 - 2 * t);
                this.activeHoseEnd.copy(this.idleHoseEnd).lerp(this._tmpNozzleCenterLocal, s);
                this.activeNozzleQuat.slerp(this._tmpTargetQuat, s);
            }
        } else {
            this.lastActiveCartIdx = -1;
            this.cartTransitionT = 1.0;
            this.activeHoseEnd.copy(this.idleHoseEnd);
            this.activeNozzleQuat.identity();
        }

        // 2. Recompute flexible Catmull-Rom spline curve from Rocket hull to Cart Port
        const p0 = this.rocketHoseOrigin;
        const p3 = this.activeHoseEnd;
        const dist = p0.distanceTo(p3);

        const sag = Math.min(0.045, dist * 0.16);

        // P1 emerges straight out from rocket manifold
        this._tmpP1.set(
            p0.x + 0.038,
            p0.y + 0.008 - sag * 0.35,
            p0.z + 0.016
        );

        // P2 approaches perpendicularly into the cart's side docking port
        const portNorm = this._tmpTargetNormalLocal;
        const approachLen = Math.min(0.048, dist * 0.32);
        this._tmpP2.set(
            p3.x + portNorm.x * approachLen,
            Math.max(0.012, p3.y + portNorm.y * approachLen - sag),
            p3.z + portNorm.z * approachLen
        );

        this.hoseCurvePoints[0].copy(p0);
        this.hoseCurvePoints[1].copy(this._tmpP1);
        this.hoseCurvePoints[2].copy(this._tmpP2);
        this.hoseCurvePoints[3].copy(p3);

        const dynamicCurve = new THREE.CatmullRomCurve3(this.hoseCurvePoints);

        // Update Outer Translucent Tube Geometry
        this.suctionHoseMesh.geometry.dispose();
        this.suctionHoseMesh.geometry = new THREE.TubeGeometry(dynamicCurve, 24, 0.0075, 12, false);

        // Update Inner Liquid Tube Geometry
        this.innerLiquidMesh.geometry.dispose();
        this.innerLiquidMesh.geometry = new THREE.TubeGeometry(dynamicCurve, 24, 0.0052, 10, false);

        // Position and orient the magnetic suction nozzle head flush onto the port
        this.suctionNozzleGroup.position.copy(p3);
        if (this.currentDockT > 0.05) {
            this.suctionNozzleGroup.quaternion.copy(this.activeNozzleQuat);
        }

        // 3. Liquid Flow Animation: Continuous glowing fluid stream inside the translucent hose
        // STRICT CONDITION: Only show flowing liquid when ACTUALLY connected and transferring dust!
        const isActuallyFlowingLiquid = this.isHoseConnected() && isUnloadingDust && rover.stats.currentDust > 0.05 && this.cartTransitionT >= 0.90;

        if (isActuallyFlowingLiquid) {
            this.innerLiquidMesh.visible = true;

            // Match liquid color exactly to the stardust inside the vacuum tank
            const dustColor = rover.getVacuumDustColor(this._tmpDustColor);
            this.innerLiquidMat.color.copy(dustColor);
            this.innerLiquidMat.emissive.copy(dustColor);
            this.innerLiquidMat.emissiveIntensity = 1.0;

            // Animate continuous liquid fluid flow surging into the Rocket (flows into the rocket)
            this.liquidTexture.offset.y += dt * 3.6;

            // Subtle reactive liquid glow on the outer translucent hose
            this.suctionHoseMat.color.lerpColors(new THREE.Color('#BAE6FD'), dustColor, 0.25);
        } else {
            // Completely clear when not actively unloading dust (prevents phantom flow bug!)
            this.innerLiquidMesh.visible = false;
            this.innerLiquidMat.emissiveIntensity = 0;
            this.suctionHoseMat.color.set('#BAE6FD');
        }

        // 4. Thruster flame active if moon is clean & ready to launch
        this.thrusterFlame.visible = isReadyToLaunch;
        if (isReadyToLaunch) {
            const flicker = 0.8 + 0.4 * Math.random();
            this.thrusterFlame.scale.set(flicker, flicker * 1.3, flicker);
        }

        // 5. Nav Arrow: hover over rover when tank is full or rocket ready to launch
        const shouldShowArrow = rover.isTankFull() || isReadyToLaunch;
        this.navArrowGroup.visible = shouldShowArrow;

        if (shouldShowArrow) {
            const arrowHoverPos = this._tmpRoverWorld.clone().multiplyScalar(1.08);
            this.navArrowGroup.position.copy(arrowHoverPos);

            const targetDir = this.rocketPosWorld.clone().sub(this._tmpRoverWorld).normalize();
            this.navArrowGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), targetDir);
        }
    }
}
