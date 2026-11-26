import * as THREE from 'three';
import { Moon } from './Moon';
import { Rover } from './Rover';
import { attachOutline } from '../core/OutlineUtils';
import { ConfigManager } from '../core/Config';

export class BaseStation {
    public group: THREE.Group;
    public moon: Moon;

    public positionUnit = new THREE.Vector3(0, 1, 0); // North Pole
    public rocketPosWorld = new THREE.Vector3();

    // Enlarged, comfortable activation radius so player parks with ease
    public activationRadius = 0.36;

    // Rocket Meshes & Group
    private rocketGroup!: THREE.Group;
    private rocketFuselage!: THREE.Group;
    private thrusterFlame!: THREE.Mesh;
    private thrusterCoreFlame!: THREE.Mesh;
    private forceThrust = false;
    private dockingDisabled = false;
    private unloadRings: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; phase: number }[] = [];
    private slotBayGroup!: THREE.Group;
    private slotPortGroup!: THREE.Group;

    // Activation Distance Indicator (Holographic Projected Solid & Dashed Rings)
    public indicatorGroup!: THREE.Group;
    private solidCircleMesh?: THREE.Mesh;
    private solidCircleMat?: THREE.MeshBasicMaterial;
    private dashedOutlineMesh?: THREE.Mesh;
    private dashedOutlineMat?: THREE.MeshBasicMaterial;
    private dashAlphaTexture?: THREE.CanvasTexture;
    private _tmpProjLocal = new THREE.Vector3();
    private _tmpProjWorld = new THREE.Vector3();

    // Semi-Transparent Suction Hose & Continuous Liquid Stream
    private hoseGroup!: THREE.Group;
    private suctionHoseMesh!: THREE.Mesh;
    private suctionHoseOutlineMesh!: THREE.Mesh;
    private innerLiquidMesh!: THREE.Mesh;
    private suctionNozzleGroup!: THREE.Group;
    private suctionHoseMat!: THREE.MeshStandardMaterial;
    private innerLiquidMat!: THREE.MeshStandardMaterial;
    private liquidTexture!: THREE.CanvasTexture;
    private hoseCurvePoints: THREE.Vector3[] = [];

    // Hose Docking & Slot-In State
    public isDocked = false;
    private currentDockT = 0; // 0 = seated firmly in rocket slot-in, 1 = connected to cart port
    private rocketHoseOrigin = new THREE.Vector3(0.038, 0.072, 0.015); // Local origin on rocket manifold
    private idleHoseEnd = new THREE.Vector3(0.044, 0.044, 0.026);      // Seated inside slot bay
    private idleNozzleQuat = new THREE.Quaternion();
    private activeHoseEnd = new THREE.Vector3(0.044, 0.044, 0.026);
    private activeNozzleQuat = new THREE.Quaternion();
    private lastActiveCartIdx = -1;
    private prevCartPortLocal = new THREE.Vector3();
    private cartTransitionT = 1.0;
    private lastBuiltP0 = new THREE.Vector3(999, 999, 999);
    private lastBuiltP4 = new THREE.Vector3(999, 999, 999);
    private hoseLatticeUniforms = {
        uSuctionTime: { value: 0 },
        uSuctionActive: { value: 0 }
    };

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
    private _tmpClearHoseColor = new THREE.Color('#F1F5F9');
    private _tmpP0 = new THREE.Vector3();
    private _tmpP1 = new THREE.Vector3();
    private _tmpP2 = new THREE.Vector3();
    private _tmpP3 = new THREE.Vector3();
    private _tmpP4 = new THREE.Vector3();
    private _tmpInvMat = new THREE.Matrix4();
    private _tmpColorA?: THREE.Color;
    private _tmpColorB?: THREE.Color;
    private _tmpColorIdle?: THREE.Color;
    private _tmpHoverPos?: THREE.Vector3;
    private _tmpTargetDir?: THREE.Vector3;
    private _tmpForward?: THREE.Vector3;
    private _tmpTangentLeft?: THREE.Vector3;
    private _tmpBasisMat?: THREE.Matrix4;

    constructor(moon: Moon) {
        this.moon = moon;
        this.group = new THREE.Group();
        this.moon.group.add(this.group);

        this.navArrowGroup = new THREE.Group();
        this.moon.group.add(this.navArrowGroup);

        this.buildRocketAndHose();
        this.buildActivationIndicator();
        this.buildNavArrow();
        this.repositionOnMoon();
    }

    private createLiquidTexture(): THREE.CanvasTexture {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 32;
        const ctx = canvas.getContext('2d')!;

        // Horizontal continuous fluid streaks along TubeGeometry uv.x (cart -> rocket)
        const grad = ctx.createLinearGradient(0, 0, 128, 0);
        grad.addColorStop(0.00, '#FFFFFF');
        grad.addColorStop(0.20, '#CCCCCC');
        grad.addColorStop(0.45, '#FFFFFF');
        grad.addColorStop(0.70, '#AAAAAA');
        grad.addColorStop(1.00, '#FFFFFF');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 128, 32);

        // Fluid turbulence bubbles flowing along the tube length
        ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
        for (let x = 8; x < 128; x += 22) {
            ctx.beginPath();
            ctx.ellipse(x, 16, 6, 9, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(3, 1);
        return texture;
    }

    private createDashAlphaTexture(): THREE.CanvasTexture {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 8;
        const ctx = canvas.getContext('2d')!;
        ctx.clearRect(0, 0, 128, 8);

        // Crisp dash: 60% solid dash, 40% clean transparent gap
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, 76, 8);

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.repeat.set(24, 1);
        return texture;
    }

    /**
     * Projects a local ring coordinate (rLocal, theta) exactly onto the 3D lunar terrain,
     * sampling actual surface height including procedural craters, noise bumps, and surface dirt.
     */
    private getProjectedSurfaceLocalPoint(
        rLocal: number,
        theta: number,
        yLift: number,
        out: THREE.Vector3
    ): void {
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);
        const lx = rLocal * cosT;
        const lz = rLocal * sinT;

        // Convert (lx, 0, lz) to world space
        this._tmpProjLocal.set(lx, 0, lz);
        this.group.localToWorld(this._tmpProjLocal);

        // World unit direction from Moon center (0, 0, 0)
        const worldDir = this._tmpProjLocal.normalize();

        // Exact terrain surface radius (clean terrain + dirt height)
        const surfaceRadius = this.moon.sampleActualSurfaceRadiusAt(worldDir.x, worldDir.y, worldDir.z);

        // Position slightly elevated above surface to prevent any depth z-fighting
        this._tmpProjWorld.copy(worldDir).multiplyScalar(surfaceRadius + yLift);

        // Map back into this.group local space
        this.group.worldToLocal(out.copy(this._tmpProjWorld));
    }

    /**
     * Builds the activation distance indicator on the ground around the rocket base:
     * - Uses continuous terrain-projected rings that cleanly hug lunar contours
     * - Solid inner circular outline line paired with outer rotating dashed outline
     * - Eliminates all clipping, sinking, and redundant inner disc fills!
     */
    private buildActivationIndicator(): void {
        this.indicatorGroup = new THREE.Group();
        this.group.add(this.indicatorGroup);

        this.dashAlphaTexture = this.createDashAlphaTexture();

        // 1. Solid circular outline line ("garis outline lingkaran pada base")
        this.solidCircleMat = new THREE.MeshBasicMaterial({
            color: '#38BDF8',
            transparent: true,
            opacity: 0.85,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -4,
            polygonOffsetUnits: -6,
            side: THREE.DoubleSide
        });

        // 2. Outer dashed outline ring
        this.dashedOutlineMat = new THREE.MeshBasicMaterial({
            color: '#38BDF8',
            alphaMap: this.dashAlphaTexture,
            transparent: true,
            opacity: 0.85,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -4,
            polygonOffsetUnits: -6,
            side: THREE.DoubleSide
        });
    }

    public rebuildIndicatorGeometries(): void {
        if (!this.dashedOutlineMat || !this.solidCircleMat) return;

        // 1. Solid Circular Outline Line (inner perimeter line, width 0.006)
        const solidGeom = this.createProjectedRingGeometry(
            this.activationRadius - 0.015,
            this.activationRadius - 0.009,
            96,
            0.011 // Elevated safely above terrain & dirt to prevent any cutting/submerging
        );

        if (this.solidCircleMesh) {
            this.solidCircleMesh.geometry.dispose();
            this.solidCircleMesh.geometry = solidGeom;
        } else {
            this.solidCircleMesh = new THREE.Mesh(solidGeom, this.solidCircleMat);
            this.solidCircleMesh.renderOrder = 5;
            this.indicatorGroup.add(this.solidCircleMesh);
        }

        // 2. Holographic terrain-conforming dashed perimeter ring (outer ring, width 0.022)
        const dashedGeom = this.createProjectedDashedRingGeometry(
            this.activationRadius + 0.005,
            this.activationRadius + 0.027,
            96,
            0.012 // Slightly higher so there is zero z-fighting or clipping
        );

        if (this.dashedOutlineMesh) {
            this.dashedOutlineMesh.geometry.dispose();
            this.dashedOutlineMesh.geometry = dashedGeom;
        } else {
            this.dashedOutlineMesh = new THREE.Mesh(dashedGeom, this.dashedOutlineMat);
            this.dashedOutlineMesh.renderOrder = 6;
            this.indicatorGroup.add(this.dashedOutlineMesh);
        }
    }

    /**
     * Builds a continuous solid ring geometry that perfectly conforms to the 3D lunar terrain,
     * using exact surface radius sampling with craters, bumps, and dirt thickness.
     */
    private createProjectedRingGeometry(
        innerR: number,
        outerR: number,
        segments: number,
        yLift: number
    ): THREE.BufferGeometry {
        const positions: number[] = [];
        const indices: number[] = [];
        const p1 = new THREE.Vector3();
        const p2 = new THREE.Vector3();

        for (let i = 0; i <= segments; i++) {
            const theta = (i / segments) * Math.PI * 2;

            this.getProjectedSurfaceLocalPoint(innerR, theta, yLift, p1);
            this.getProjectedSurfaceLocalPoint(outerR, theta, yLift, p2);

            positions.push(p1.x, p1.y, p1.z);
            positions.push(p2.x, p2.y, p2.z);

            if (i < segments) {
                const base = i * 2;
                indices.push(base, base + 1, base + 2);
                indices.push(base + 1, base + 3, base + 2);
            }
        }

        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geom.setIndex(indices);
        geom.computeVertexNormals();
        return geom;
    }

    private createProjectedDashedRingGeometry(
        innerR: number,
        outerR: number,
        segments: number,
        yLift: number
    ): THREE.BufferGeometry {
        const positions: number[] = [];
        const uvs: number[] = [];
        const indices: number[] = [];
        const p1 = new THREE.Vector3();
        const p2 = new THREE.Vector3();

        for (let i = 0; i <= segments; i++) {
            const u = i / segments;
            const theta = u * Math.PI * 2;

            this.getProjectedSurfaceLocalPoint(innerR, theta, yLift, p1);
            this.getProjectedSurfaceLocalPoint(outerR, theta, yLift, p2);

            positions.push(p1.x, p1.y, p1.z);
            positions.push(p2.x, p2.y, p2.z);

            uvs.push(u, 0);
            uvs.push(u, 1);

            if (i < segments) {
                const base = i * 2;
                indices.push(base, base + 1, base + 2);
                indices.push(base + 1, base + 3, base + 2);
            }
        }

        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geom.setIndex(indices);
        geom.computeVertexNormals();
        return geom;
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

        const injectLatticeDeform = (mat: THREE.MeshStandardMaterial, bulgeAmp: number) => {
            mat.onBeforeCompile = (shader) => {
                shader.uniforms.uSuctionTime = this.hoseLatticeUniforms.uSuctionTime;
                shader.uniforms.uSuctionActive = this.hoseLatticeUniforms.uSuctionActive;
                shader.vertexShader = `
                    uniform float uSuctionTime;
                    uniform float uSuctionActive;
                ` + shader.vertexShader;
                shader.vertexShader = shader.vertexShader.replace(
                    '#include <begin_vertex>',
                    `
                    #include <begin_vertex>
                    float lt = uv.x;
                    float lTaper = sin(lt * 3.14159265);
                    float lw1 = pow(0.5 + 0.5 * cos((lt + uSuctionTime * 1.45) * 12.5663706), 3.0);
                    float lw2 = pow(0.5 + 0.5 * cos((lt + uSuctionTime * 2.15 + 0.35) * 18.8495559), 4.0) * 0.55;
                    float lSqueeze = -0.18 * (1.0 - lw1);
                    float lBulge = ((lw1 + lw2) * ${bulgeAmp.toFixed(4)} + lSqueeze * ${(bulgeAmp * 0.65).toFixed(4)}) * lTaper * uSuctionActive;
                    float lSway = sin((lt + uSuctionTime * 1.45) * 12.5663706) * 0.0022 * lTaper * uSuctionActive;
                    transformed += objectNormal * lBulge;
                    transformed.y += lSway;
                    `
                );
            };
        };

        // 1. Crystal-clear silicone outer hose (matches tank glass clarity so inner dust color stays true on all moons)
        this.suctionHoseMat = new THREE.MeshStandardMaterial({
            color: '#F1F5F9',
            roughness: 0.12,
            metalness: 0.08,
            transparent: true,
            opacity: 0.30,
            depthWrite: false
        });
        injectLatticeDeform(this.suctionHoseMat, 0.0085);

        // 2. Continuous flowing liquid core inside the hose (synced Lattice Modifier bulge)
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
        injectLatticeDeform(this.innerLiquidMat, 0.0068);

        this.rocketGroup = new THREE.Group();

        // Compact Launch Collar directly on lunar ground
        const launchCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.074, 0.012, 24), claySlateMat);
        launchCollar.position.y = 0.006;
        attachOutline(launchCollar, { width: 0.0024 });
        this.rocketGroup.add(launchCollar);

        const launchRim = new THREE.Mesh(new THREE.TorusGeometry(0.069, 0.004, 10, 28), clayCoralMat);
        launchRim.rotation.x = Math.PI / 2;
        launchRim.position.y = 0.012;
        attachOutline(launchRim, { width: 0.0018 });
        this.rocketGroup.add(launchRim);

        // Rocket Fuselage
        const rocketFuselage = new THREE.Group();
        this.rocketFuselage = rocketFuselage;
        rocketFuselage.position.y = 0.024;

        // Smooth Retro-Clay Hull (LatheGeometry)
        const hullProfile = [
            new THREE.Vector2(0.000, 0.008),
            new THREE.Vector2(0.032, 0.008),
            new THREE.Vector2(0.039, 0.015),
            new THREE.Vector2(0.043, 0.038),
            new THREE.Vector2(0.045, 0.068),
            new THREE.Vector2(0.042, 0.105),
            new THREE.Vector2(0.036, 0.142),
            new THREE.Vector2(0.031, 0.160),
            new THREE.Vector2(0.000, 0.160)
        ];
        const hullGeom = new THREE.LatheGeometry(hullProfile, 28);
        const hullMesh = new THREE.Mesh(hullGeom, clayWhiteMat);
        attachOutline(hullMesh, { width: 0.0024 });
        rocketFuselage.add(hullMesh);

        // Clean Coral Collar Band
        const collarBand = new THREE.Mesh(
            new THREE.CylinderGeometry(0.0298, 0.0322, 0.010, 28),
            clayCoralMat
        );
        collarBand.position.y = 0.162;
        attachOutline(collarBand, { width: 0.0020 });
        rocketFuselage.add(collarBand);

        // Seamless Rounded Terracotta Nose Cone
        const noseProfile = [
            new THREE.Vector2(0.000, 0.165),
            new THREE.Vector2(0.030, 0.165),
            new THREE.Vector2(0.027, 0.180),
            new THREE.Vector2(0.020, 0.196),
            new THREE.Vector2(0.011, 0.208),
            new THREE.Vector2(0.004, 0.213),
            new THREE.Vector2(0.000, 0.214)
        ];
        const noseMesh = new THREE.Mesh(new THREE.LatheGeometry(noseProfile, 28), clayTerracottaMat);
        attachOutline(noseMesh, { width: 0.0024 });
        rocketFuselage.add(noseMesh);

        // Clean Recessed Clay Porthole Window (flush with upper hull)
        const portholeGroup = new THREE.Group();
        portholeGroup.position.set(0, 0.114, 0.039);
        portholeGroup.rotation.x = -0.17;
        rocketFuselage.add(portholeGroup);

        const windowCollar = new THREE.Mesh(
            new THREE.CylinderGeometry(0.0155, 0.0170, 0.006, 24),
            claySlateMat
        );
        windowCollar.rotation.x = Math.PI / 2;
        attachOutline(windowCollar, { width: 0.0018 });
        portholeGroup.add(windowCollar);

        const windowGlass = new THREE.Mesh(
            new THREE.CylinderGeometry(0.0118, 0.0118, 0.003, 24),
            clayGlassMat
        );
        windowGlass.rotation.x = Math.PI / 2;
        windowGlass.position.z = 0.0022;
        portholeGroup.add(windowGlass);

        // 3 Swept-Back Beveled Clay Fins + Compact Landing Pads
        const finShape = new THREE.Shape();
        finShape.moveTo(0.034, 0.072);
        finShape.quadraticCurveTo(0.058, 0.048, 0.063, 0.006);
        finShape.lineTo(0.044, 0.006);
        finShape.lineTo(0.034, 0.018);
        finShape.closePath();

        const finGeom = new THREE.ExtrudeGeometry(finShape, {
            depth: 0.005,
            bevelEnabled: true,
            bevelThickness: 0.002,
            bevelSize: 0.002,
            bevelSegments: 3
        });
        finGeom.translate(0, 0, -0.0025);
        finGeom.rotateY(-Math.PI / 2);

        for (let i = 0; i < 3; i++) {
            const angle = (i / 3) * Math.PI * 2;
            const finGroup = new THREE.Group();
            finGroup.rotation.y = angle;

            const fin = new THREE.Mesh(finGeom, clayTerracottaMat);
            attachOutline(fin, { width: 0.0022 });
            finGroup.add(fin);

            rocketFuselage.add(finGroup);
        }

        // Flared Thruster Bell Nozzle
        const thrusterNozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.030, 0.024, 20), clayDarkMat);
        thrusterNozzle.position.y = 0.003;
        attachOutline(thrusterNozzle, { width: 0.0022 });
        rocketFuselage.add(thrusterNozzle);

        const goldNozzleRing = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.003, 8, 20), clayGoldMat);
        goldNozzleRing.rotation.x = Math.PI / 2;
        goldNozzleRing.position.y = -0.008;
        rocketFuselage.add(goldNozzleRing);

        // Smooth Stylized Teardrop Thruster Flame (anchored at nozzle exit)
        const outerFlameProfile = [
            new THREE.Vector2(0.000, 0.006),
            new THREE.Vector2(0.019, 0.002),
            new THREE.Vector2(0.027, -0.020),
            new THREE.Vector2(0.022, -0.052),
            new THREE.Vector2(0.012, -0.086),
            new THREE.Vector2(0.004, -0.108),
            new THREE.Vector2(0.000, -0.114)
        ];
        this.thrusterFlame = new THREE.Mesh(
            new THREE.LatheGeometry(outerFlameProfile, 20),
            new THREE.MeshBasicMaterial({ color: '#F97316', transparent: true, opacity: 0.88, depthWrite: false })
        );
        this.thrusterFlame.position.y = -0.006;
        this.thrusterFlame.renderOrder = 1;
        this.thrusterFlame.visible = false;
        rocketFuselage.add(this.thrusterFlame);

        const coreFlameProfile = [
            new THREE.Vector2(0.000, 0.004),
            new THREE.Vector2(0.012, 0.000),
            new THREE.Vector2(0.016, -0.016),
            new THREE.Vector2(0.012, -0.040),
            new THREE.Vector2(0.005, -0.064),
            new THREE.Vector2(0.000, -0.072)
        ];
        this.thrusterCoreFlame = new THREE.Mesh(
            new THREE.LatheGeometry(coreFlameProfile, 16),
            new THREE.MeshBasicMaterial({ color: '#FEF08A', transparent: true, opacity: 0.96, depthWrite: false })
        );
        this.thrusterCoreFlame.renderOrder = 2;
        this.thrusterFlame.add(this.thrusterCoreFlame);

        // Rising Stardust Energy Pulse Rings around Rocket during unloading
        for (let r = 0; r < 2; r++) {
            const ringMat = new THREE.MeshBasicMaterial({
                color: '#38BDF8',
                transparent: false,
                depthWrite: true
            });
            const ringMesh = new THREE.Mesh(new THREE.TorusGeometry(0.056, 0.0028, 8, 28), ringMat);
            ringMesh.rotation.x = Math.PI / 2;
            ringMesh.visible = false;
            attachOutline(ringMesh, { width: 0.0016 });
            rocketFuselage.add(ringMesh);
            this.unloadRings.push({ mesh: ringMesh, mat: ringMat, phase: r * 0.5 });
        }



        // -------------------------------------------------------------
        // DEDICATED SLOT-IN SOCKET BAY (Suction Port Holster Chamber)
        // Hose nozzle enters here firmly when idle ("masuk ke slot in di roket nya dan tidak menggantung")
        // -------------------------------------------------------------
        this.slotBayGroup = new THREE.Group();
        this.slotBayGroup.position.set(0, 0.024, 0);
        this.slotBayGroup.rotation.y = Math.PI / 3; // Fixed static angle: exactly halfway between Fin 0 and Fin 1 (zero collision with fins!)
        this.rocketFuselage.add(this.slotBayGroup);

        this.slotPortGroup = new THREE.Group();
        this.slotPortGroup.position.set(0, 0, 0.044);
        this.slotPortGroup.rotation.x = -0.15;
        this.slotBayGroup.add(this.slotPortGroup);

        // Sturdy mounting bracket onto rocket lower hull
        const slotBracket = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.016, 0.014), claySlateMat);
        slotBracket.position.z = -0.006;
        attachOutline(slotBracket, { width: 0.0020 });
        this.slotPortGroup.add(slotBracket);

        // Outer collar sleeve
        const slotCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.016, 18), clayDarkMat);
        slotCollar.rotation.x = Math.PI / 2;
        attachOutline(slotCollar, { width: 0.0020 });
        this.slotPortGroup.add(slotCollar);

        // Gold beveled entry ring
        const slotRim = new THREE.Mesh(new THREE.TorusGeometry(0.0135, 0.0028, 8, 18), clayGoldMat);
        slotRim.position.z = 0.008;
        this.slotPortGroup.add(slotRim);

        // Deep recessed chamber hole (Slot-In Chamber)
        const slotChamber = new THREE.Mesh(
            new THREE.CylinderGeometry(0.011, 0.011, 0.010, 18),
            new THREE.MeshBasicMaterial({ color: '#09090B' })
        );
        slotChamber.rotation.x = Math.PI / 2;
        slotChamber.position.z = 0.005;
        this.slotPortGroup.add(slotChamber);

        this.rocketGroup.add(rocketFuselage);
        this.group.add(this.rocketGroup);

        // -------------------------------------------------------------
        // DEDICATED HOSE GROUP (translucent silicone tube & inner liquid stream)
        // -------------------------------------------------------------
        this.hoseGroup = new THREE.Group();
        this.group.add(this.hoseGroup);

        // 5 Control Points for ultra-smooth centripetal Catmull-Rom spline
        const p0 = this.rocketHoseOrigin.clone();
        const p1 = new THREE.Vector3(p0.x + 0.015, p0.y - 0.008, p0.z + 0.006);
        const p2 = new THREE.Vector3(0.046, 0.032, 0.024);
        const p3 = new THREE.Vector3(0.045, 0.024, 0.026);
        const p4 = this.idleHoseEnd.clone();

        this.hoseCurvePoints = [p0, p1, p2, p3, p4];
        const initialCurve = new THREE.CatmullRomCurve3(this.hoseCurvePoints, false, 'centripetal', 0.5);

        // Outer translucent hose tube with 36 segments for buttery-smooth roundness & lattice bulges
        const outerGeom = new THREE.TubeGeometry(initialCurve, 36, 0.0075, 14, false);
        this.suctionHoseMesh = new THREE.Mesh(outerGeom, this.suctionHoseMat);
        this.suctionHoseMesh.visible = false; // Hidden when idle inside rocket slot

        // Synced Lattice-Deforming Silhouette Rim Outline for the hose
        const hoseOutlineMat = new THREE.ShaderMaterial({
            uniforms: {
                uOutlineWidth: { value: 0.0020 },
                uOutlineColor: { value: new THREE.Color('#0F172A') },
                uOutlineOpacity: { value: 0.90 },
                uSuctionTime: this.hoseLatticeUniforms.uSuctionTime,
                uSuctionActive: this.hoseLatticeUniforms.uSuctionActive
            },
            vertexShader: `
                varying vec3 vNormalWorld;
                varying vec3 vViewDirWorld;
                uniform float uOutlineWidth;
                uniform float uSuctionTime;
                uniform float uSuctionActive;

                void main() {
                    float lt = uv.x;
                    float lTaper = sin(lt * 3.14159265);
                    float lw1 = pow(0.5 + 0.5 * cos((lt + uSuctionTime * 1.45) * 12.5663706), 3.0);
                    float lw2 = pow(0.5 + 0.5 * cos((lt + uSuctionTime * 2.15 + 0.35) * 18.8495559), 4.0) * 0.55;
                    float lSqueeze = -0.18 * (1.0 - lw1);
                    float lBulge = ((lw1 + lw2) * 0.0085 + lSqueeze * 0.0055) * lTaper * uSuctionActive;
                    float lSway = sin((lt + uSuctionTime * 1.45) * 12.5663706) * 0.0022 * lTaper * uSuctionActive;

                    vec3 transformed = position + normal * (uOutlineWidth * 0.4 + lBulge);
                    transformed.y += lSway;
                    vec4 worldPos = modelMatrix * vec4(transformed, 1.0);
                    vNormalWorld = normalize(mat3(modelMatrix) * normal);
                    vViewDirWorld = normalize(cameraPosition - worldPos.xyz);
                    gl_Position = projectionMatrix * viewMatrix * worldPos;
                }
            `,
            fragmentShader: `
                uniform vec3 uOutlineColor;
                uniform float uOutlineOpacity;
                varying vec3 vNormalWorld;
                varying vec3 vViewDirWorld;

                void main() {
                    float NdotV = abs(dot(vNormalWorld, vViewDirWorld));
                    float rim = smoothstep(0.48, 0.18, NdotV);
                    if (rim < 0.05) discard;
                    gl_FragColor = vec4(uOutlineColor, rim * uOutlineOpacity);
                }
            `,
            side: THREE.DoubleSide,
            transparent: true,
            depthWrite: false
        });
        this.suctionHoseOutlineMesh = new THREE.Mesh(outerGeom, hoseOutlineMat);
        this.suctionHoseOutlineMesh.name = 'outline';
        this.suctionHoseMesh.add(this.suctionHoseOutlineMesh);
        this.hoseGroup.add(this.suctionHoseMesh);

        // Inner continuous liquid stream tube (filled with animated flowing fluid)
        const innerGeom = new THREE.TubeGeometry(initialCurve, 36, 0.0052, 12, false);
        this.innerLiquidMesh = new THREE.Mesh(innerGeom, this.innerLiquidMat);
        this.innerLiquidMesh.visible = false; // Hidden until actively transferring fluid!
        this.hoseGroup.add(this.innerLiquidMesh);

        // Magnetic docking nozzle head
        this.suctionNozzleGroup = new THREE.Group();
        this.suctionNozzleGroup.position.copy(p4);
        this.suctionNozzleGroup.quaternion.copy(this.idleNozzleQuat);

        const nozzleHead = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.013, 0.016, 18), clayDarkMat);
        nozzleHead.rotation.x = Math.PI / 2;
        attachOutline(nozzleHead, { width: 0.0018 });
        this.suctionNozzleGroup.add(nozzleHead);

        const magneticRing = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.003, 8, 18), clayGoldMat);
        magneticRing.position.z = 0.008;
        this.suctionNozzleGroup.add(magneticRing);

        this.hoseGroup.add(this.suctionNozzleGroup);
    }

    private buildNavArrow(): void {
        // Clean, simple, minimalist chevron arrow
        const shape = new THREE.Shape();
        // Pointing along +Y in 2D shape, which rotates to +Z forward in 3D
        shape.moveTo(0, 0.024);
        shape.lineTo(0.015, -0.014);
        shape.lineTo(0.006, -0.007);
        shape.lineTo(0, -0.002);
        shape.lineTo(-0.006, -0.007);
        shape.lineTo(-0.015, -0.014);
        shape.closePath();

        const extrudeSettings = {
            depth: 0.004,
            bevelEnabled: true,
            bevelThickness: 0.001,
            bevelSize: 0.001,
            bevelSegments: 2
        };

        const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        geom.rotateX(Math.PI / 2); // Rotate +Y (tip) into +Z (Forward)
        geom.center();

        // Dark contrasting border backing so arrow is readable on any lunar background
        const borderMat = new THREE.MeshBasicMaterial({ color: '#09090B' });
        const borderMesh = new THREE.Mesh(geom, borderMat);
        borderMesh.scale.set(1.18, 1.1, 1.18);
        borderMesh.position.y = -0.001;

        // Vibrant Golden Chevron arrow
        const arrowMat = new THREE.MeshBasicMaterial({ color: '#FACC15' });
        const arrowMesh = new THREE.Mesh(geom, arrowMat);

        this.navArrowGroup.add(borderMesh);
        this.navArrowGroup.add(arrowMesh);
        this.navArrowGroup.visible = false;
    }

    /**
     * Positions the Rocket firmly on the moon's surface at the North pole.
     * Scale is strictly set to (1, 1, 1) so the rocket NEVER scales with the moon!
     */
    public repositionOnMoon(): void {
        const u = this.positionUnit.clone().normalize();
        const r = this.moon.sampleCleanRadiusAt(u.x, u.y, u.z);
        this.group.position.copy(u).multiplyScalar(r);

        // Orient group tangent to sphere at North pole
        const alignQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), u);
        this.group.quaternion.copy(alignQuat);
        this.group.scale.set(1, 1, 1);

        this.group.updateMatrixWorld(true);
        this.rocketGroup.getWorldPosition(this.rocketPosWorld);

        this.rebuildIndicatorGeometries();
    }

    /**
     * Checks if the rover is within the crisp activation distance of the Rocket.
     */
    public isRoverInDockingZone(rover: Rover): boolean {
        rover.group.getWorldPosition(this._tmpRoverWorld);
        const dist = this._tmpRoverWorld.distanceTo(this.rocketPosWorld);
        return dist <= this.activationRadius;
    }

    public isRoverNearRocket(roverWorldPos: THREE.Vector3): boolean {
        return roverWorldPos.distanceTo(this.rocketPosWorld) <= this.activationRadius;
    }

    /**
     * True only when hose is 100% attached to the cart docking port.
     */
    public isHoseConnected(): boolean {
        return this.isDocked && this.currentDockT >= 0.94;
    }

    public setRocketOffsetY(y: number): void {
        if (this.rocketFuselage) {
            this.rocketFuselage.position.y = y;
        }
    }

    public getRocketFuselageWorldPos(out: THREE.Vector3): THREE.Vector3 {
        if (this.rocketFuselage) {
            return this.rocketFuselage.getWorldPosition(out);
        }
        return out.copy(this.rocketPosWorld);
    }

    public setForceThrust(active: boolean): void {
        this.forceThrust = active;
    }

    public setDockingDisabled(disabled: boolean): void {
        this.dockingDisabled = disabled;
        if (disabled) {
            this.isDocked = false;
            this.currentDockT = 0;
            if (this.suctionHoseMesh) this.suctionHoseMesh.visible = false;
            if (this.suctionNozzleGroup) this.suctionNozzleGroup.visible = false;
        }
    }

    /**
     * Update animations, smooth centripetal hose curve, and docking transfer.
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

        const nearRocket = this.isRoverInDockingZone(rover);

        // 1. Identify active cart being unloaded
        const activeCartIdx = rover.getActiveUnloadingCartIndex();
        const hasDustToUnload = rover.stats.currentDust > 0.05;
        const cartExists = rover.trailerCarts.length > 0;

        // Dock condition: rover is inside activation zone AND has dust to transfer
        // Rule: Saat rover masih menyapu (atau baru saja menyapu < 1.0 detik lalu), roket tidak boleh menyedot
        const isRoverSweepingOrRecent = rover.isActivelySweeping || rover.getTimeSinceLastSweep() < 1.0;
        const shouldDock = !this.dockingDisabled && nearRocket && hasDustToUnload && cartExists && !isRoverSweepingOrRecent;
        this.isDocked = shouldDock;

        // Smooth docking progress interpolation
        const targetT = shouldDock ? 1.0 : 0.0;
        this.currentDockT += (targetT - this.currentDockT) * (1 - Math.exp(-14.0 * dt));

        // Compute local position and orientation of the static fixed slot port
        this.slotPortGroup.getWorldPosition(this._tmpP0);
        this.hoseGroup.worldToLocal(this._tmpP0);
        this.rocketHoseOrigin.copy(this._tmpP0);
        this.idleHoseEnd.copy(this._tmpP0);

        const slotQuatWorld = this.slotPortGroup.getWorldQuaternion(this._tmpTargetQuat);
        const hoseQuatWorldInv = this.hoseGroup.getWorldQuaternion(new THREE.Quaternion()).invert();
        this.idleNozzleQuat.copy(slotQuatWorld).premultiply(hoseQuatWorldInv);

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
                // Smooth transition from slot bay to the port
                const t = this.currentDockT / 0.95;
                const s = t * t * (3 - 2 * t);
                this.activeHoseEnd.copy(this.idleHoseEnd).lerp(this._tmpNozzleCenterLocal, s);
                this.activeNozzleQuat.slerp(this._tmpTargetQuat, s);
            }
        } else {
            this.lastActiveCartIdx = -1;
            this.cartTransitionT = 1.0;
            // Seated firmly inside slot-in socket
            this.activeHoseEnd.copy(this.idleHoseEnd);
            this.activeNozzleQuat.copy(this.idleNozzleQuat);
        }

        // -------------------------------------------------------------
        // 2. ULTRA-SMOOTH CENTRIPETAL CATMULL-ROM SPLINE CURVE
        // -------------------------------------------------------------
        const p0 = this.rocketHoseOrigin;
        const p4 = this.activeHoseEnd;
        const dist = p0.distanceTo(p4);

        if (this.currentDockT <= 0.01) {
            // IDLE HOSE STATE: Nozzle head sits firmly docked in the single rocket slot chamber
            // Hose is retracted inside the rocket with ZERO clipping and ZERO dangling!
            this.suctionHoseMesh.visible = false;
            this.innerLiquidMesh.visible = false;
            this.suctionNozzleGroup.visible = true;
            this.suctionNozzleGroup.position.copy(this.idleHoseEnd);
            this.suctionNozzleGroup.quaternion.copy(this.idleNozzleQuat);
        } else {
            // ACTIVE HOSE STATE: Hose emerges from single slot and extends to cart port
            this.suctionHoseMesh.visible = true;
            this.suctionNozzleGroup.visible = true;
            this.suctionNozzleGroup.position.copy(this.activeHoseEnd);
            this.suctionNozzleGroup.quaternion.copy(this.activeNozzleQuat);

            const exitLen = Math.min(0.045, dist * 0.30);
            const approachLen = Math.min(0.045, dist * 0.30);
            const sag = Math.min(0.035, dist * 0.14);

            // Compute angles of fixed rocket slot and cart in horizontal plane (XZ)
            const theta0 = Math.atan2(p0.z, p0.x);
            const r0 = Math.hypot(p0.x, p0.z);
            const theta4 = Math.atan2(p4.z, p4.x);
            const r4 = Math.hypot(p4.x, p4.z);
            const dTheta = THREE.MathUtils.euclideanModulo(theta4 - theta0 + Math.PI, Math.PI * 2) - Math.PI;

            const minClearanceR = 0.065; // Safe clearance outside rocket fuselage (R_fuselage = 0.046)

            if (Math.abs(dTheta) <= Math.PI * 0.38) {
                // Front quadrant: direct natural catenary curve from fixed slot
                const slotDir = this._tmpHoverPos || (this._tmpHoverPos = new THREE.Vector3());
                slotDir.set(0, 0, 1).applyQuaternion(this.idleNozzleQuat).normalize();
                this._tmpP1.copy(p0).addScaledVector(slotDir, exitLen);

                const portNorm = this._tmpTargetNormalLocal;
                this._tmpP3.copy(p4).addScaledVector(portNorm, approachLen);

                this._tmpP2.copy(this._tmpP1).lerp(this._tmpP3, 0.5);
                this._tmpP2.y = Math.max(0.012, this._tmpP2.y - sag);
            } else {
                // Side / rear quadrants: wrap smoothly around the rocket cylinder outside hull
                const ang1 = theta0 + dTheta * 0.25;
                const r1 = Math.max(minClearanceR, r0 + 0.018);
                this._tmpP1.set(r1 * Math.cos(ang1), p0.y + 0.006, r1 * Math.sin(ang1));

                const ang2 = theta0 + dTheta * 0.55;
                const r2 = Math.max(minClearanceR + 0.014, THREE.MathUtils.lerp(r1, r4, 0.45));
                this._tmpP2.set(
                    r2 * Math.cos(ang2),
                    THREE.MathUtils.lerp(p0.y, p4.y, 0.5) - sag,
                    r2 * Math.sin(ang2)
                );

                const ang3 = theta0 + dTheta * 0.82;
                const r3 = Math.max(minClearanceR, THREE.MathUtils.lerp(r1, r4, 0.80));
                this._tmpP3.set(
                    r3 * Math.cos(ang3),
                    THREE.MathUtils.lerp(p0.y, p4.y, 0.8) - sag * 0.5,
                    r3 * Math.sin(ang3)
                );
            }

            // ANTI-CLIPPING CLEARANCE BARRIER:
            // Ensure no spline point penetrates the rocket fuselage (R_fuselage = 0.046; 0.065 is safe outside)
            [this._tmpP1, this._tmpP2, this._tmpP3].forEach(p => {
                const rSq = p.x * p.x + p.z * p.z;
                if (rSq < minClearanceR * minClearanceR) {
                    const r = Math.sqrt(rSq) || 0.001;
                    p.x = (p.x / r) * minClearanceR;
                    p.z = (p.z / r) * minClearanceR;
                }
                p.y = Math.max(0.012, p.y);
            });

            // Only rebuild TubeGeometry when endpoints moved significantly (avoids 120 allocs/sec when parked!)
            const p0Moved = this.lastBuiltP0.distanceToSquared(p0) > 0.000002;
            const p4Moved = this.lastBuiltP4.distanceToSquared(p4) > 0.000002;
            if (p0Moved || p4Moved || !this.suctionHoseMesh.geometry) {
                this.lastBuiltP0.copy(p0);
                this.lastBuiltP4.copy(p4);

                this.hoseCurvePoints[0].copy(p0);
                this.hoseCurvePoints[1].copy(this._tmpP1);
                this.hoseCurvePoints[2].copy(this._tmpP2);
                this.hoseCurvePoints[3].copy(this._tmpP3);
                this.hoseCurvePoints[4].copy(p4);

                const dynamicCurve = new THREE.CatmullRomCurve3(this.hoseCurvePoints, false, 'centripetal', 0.5);

                // Update Outer Translucent Tube Geometry (36 segments for smooth lattice bulge waves)
                this.suctionHoseMesh.geometry.dispose();
                this.suctionHoseMesh.geometry = new THREE.TubeGeometry(dynamicCurve, 36, 0.0075, 14, false);
                if (this.suctionHoseOutlineMesh) {
                    this.suctionHoseOutlineMesh.geometry = this.suctionHoseMesh.geometry;
                }

                // Update Inner Liquid Tube Geometry
                this.innerLiquidMesh.geometry.dispose();
                this.innerLiquidMesh.geometry = new THREE.TubeGeometry(dynamicCurve, 36, 0.0052, 12, false);
            }
        }

        // -------------------------------------------------------------
        // 3. CONTINUOUS LIQUID STREAM ANIMATION
        // -------------------------------------------------------------
        const isActuallyFlowingLiquid = this.isHoseConnected() && isUnloadingDust && rover.stats.currentDust > 0.05 && this.cartTransitionT >= 0.90;

        const targetActive = isActuallyFlowingLiquid ? 1.0 : 0.0;
        this.hoseLatticeUniforms.uSuctionActive.value += (targetActive - this.hoseLatticeUniforms.uSuctionActive.value) * (1 - Math.exp(-10.0 * dt));
        if (this.hoseLatticeUniforms.uSuctionActive.value > 0.005) {
            this.hoseLatticeUniforms.uSuctionTime.value += dt;
        }

        if (isActuallyFlowingLiquid) {
            this.innerLiquidMesh.visible = true;

            // Match liquid color & glow intensity exactly to the stardust inside the vacuum tank
            const dustColor = rover.getVacuumDustColor(this._tmpDustColor);
            const tankGlow = ConfigManager.current.tankGlowIntensity ?? 0.65;
            this.innerLiquidMat.color.copy(dustColor);
            this.innerLiquidMat.emissive.copy(dustColor);
            this.innerLiquidMat.emissiveIntensity = tankGlow;

            // Animate continuous liquid fluid flow surging along the hose into the Rocket
            this.liquidTexture.offset.x += dt * 3.8;

            // Neutral clear hose tinted subtly toward the active dust color
            this.suctionHoseMat.color.lerpColors(this._tmpClearHoseColor, dustColor, 0.18);

            // Animate rising solid outlined energy pulse rings around Rocket
            for (const ring of this.unloadRings) {
                ring.phase = (ring.phase + dt * 1.15) % 1.0;
                ring.mesh.visible = true;
                ring.mesh.position.y = 0.02 + ring.phase * 0.17;
                const s = (0.75 + ring.phase * 0.50) * Math.max(0.05, Math.sin(ring.phase * Math.PI));
                ring.mesh.scale.setScalar(s);
                ring.mat.color.copy(dustColor);
            }
        } else {
            // Completely clear when not actively unloading dust (prevents phantom flow bug!)
            this.innerLiquidMesh.visible = false;
            this.innerLiquidMat.emissiveIntensity = 0;
            this.suctionHoseMat.color.copy(this._tmpClearHoseColor);
            for (const ring of this.unloadRings) {
                ring.mesh.visible = false;
            }
        }

        const now = performance.now();

        // -------------------------------------------------------------
        // 4. ANIMATE ACTIVATION DISTANCE INDICATOR
        // -------------------------------------------------------------
        if (this.dashAlphaTexture) {
            // Smooth holographic runway rotation via UV scrolling (speeds up when rover is inside zone)
            const rotSpeed = nearRocket ? 0.38 : 0.14;
            this.dashAlphaTexture.offset.x = (this.dashAlphaTexture.offset.x + dt * rotSpeed) % 1.0;
        }

        if (this.dashedOutlineMat && this.solidCircleMat) {
            if (nearRocket) {
                const pulse = 0.5 + 0.5 * Math.sin(now * 0.008);
                const pulseOpacity = 0.82 + 0.18 * pulse;
                this.solidCircleMat.opacity = pulseOpacity;
                this.dashedOutlineMat.opacity = pulseOpacity;

                // Smooth color interpolation between Sky Blue and Amber Gold in sync
                this._tmpColorA = this._tmpColorA || new THREE.Color('#38BDF8');
                this._tmpColorB = this._tmpColorB || new THREE.Color('#FACC15');
                this.solidCircleMat.color.lerpColors(this._tmpColorA, this._tmpColorB, pulse);
                this.dashedOutlineMat.color.lerpColors(this._tmpColorA, this._tmpColorB, pulse);
            } else {
                // Smoothly return to idle state instead of snapping
                this.solidCircleMat.opacity = THREE.MathUtils.lerp(this.solidCircleMat.opacity, 0.72, dt * 8);
                this.dashedOutlineMat.opacity = THREE.MathUtils.lerp(this.dashedOutlineMat.opacity, 0.72, dt * 8);
                this._tmpColorIdle = this._tmpColorIdle || new THREE.Color('#38BDF8');
                this.solidCircleMat.color.lerp(this._tmpColorIdle, dt * 8);
                this.dashedOutlineMat.color.lerp(this._tmpColorIdle, dt * 8);
            }
        }

        // -------------------------------------------------------------
        // 5. THRUSTER FLAME & NAV ARROW
        // -------------------------------------------------------------
        const showFlame = isReadyToLaunch || this.forceThrust;
        this.thrusterFlame.visible = showFlame;
        if (showFlame) {
            const wave = Math.sin(now * 0.026) * 0.08 + Math.cos(now * 0.043) * 0.05;
            const scaleXZ = 0.96 + wave * 0.65;
            const scaleY = (this.forceThrust ? 1.25 : 0.92) + wave * 1.15;

            this.thrusterFlame.scale.set(scaleXZ, scaleY, scaleXZ);
            if (this.thrusterCoreFlame) {
                const corePulse = 0.94 + Math.sin(now * 0.038) * 0.08;
                this.thrusterCoreFlame.scale.set(corePulse, 1.0 + wave * 0.6, corePulse);
            }
        }

        const shouldShowArrow = rover.isTankFull() || isReadyToLaunch;
        this.navArrowGroup.visible = shouldShowArrow;
        if (shouldShowArrow) {
            this._tmpHoverPos = this._tmpHoverPos || new THREE.Vector3();
            this._tmpTargetDir = this._tmpTargetDir || new THREE.Vector3();
            this._tmpTangentLeft = this._tmpTangentLeft || new THREE.Vector3();
            this._tmpBasisMat = this._tmpBasisMat || new THREE.Matrix4();

            const u = rover.up;
            rover.group.getWorldPosition(this._tmpRoverWorld);

            // 1. Great-circle geodesic shortest route on the sphere towards rocket positionUnit (North Pole)
            const uRocket = this.positionUnit; // (0, 1, 0)
            const dot = uRocket.dot(u);

            // Geodesic tangent: T = uRocket - (uRocket · u) * u
            this._tmpTargetDir.copy(uRocket).addScaledVector(u, -dot);
            if (this._tmpTargetDir.lengthSq() > 0.0001) {
                this._tmpTargetDir.normalize();
            } else {
                // At the antipodal point (exact South pole), any direction leads to North pole
                this._tmpTargetDir.copy(rover.forward);
            }

            // 3. Tangent basis: Left = u x Forward, Up = u, Forward = targetDir
            this._tmpTangentLeft.crossVectors(u, this._tmpTargetDir).normalize();
            this._tmpBasisMat.makeBasis(this._tmpTangentLeft, u, this._tmpTargetDir);
            this.navArrowGroup.quaternion.setFromRotationMatrix(this._tmpBasisMat);

            // 4. Hover gracefully above the rover (with safe clearance above beacon/antenna and gentle bobbing)
            const hoverHeight = 0.13 + Math.sin(now * 0.005) * 0.008;
            this._tmpHoverPos.copy(this._tmpRoverWorld).addScaledVector(u, hoverHeight);
            this.navArrowGroup.position.copy(this._tmpHoverPos);
        }
    }
}
