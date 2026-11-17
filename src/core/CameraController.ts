import * as THREE from 'three';
import { Rover } from '../entities/Rover';
import { clamp } from './MathUtils';
import { ConfigManager } from './Config';

export class CameraController {
    public camera: THREE.PerspectiveCamera;
    public rover: Rover;
    public domElement: HTMLElement;

    public yawOffset = 0;
    public pitchOffset = 0.42;

    public freeTheta = 0.35;
    public freePhi = Math.PI / 2 - 0.2;

    public radius = 3.15;
    public targetRadius = 3.15;

    public isDragging = false;
    private prevX = 0;
    private prevY = 0;
    private pinchStartDist = 0;
    private pinchStartRadius = 3.15;

    // Idle & Cinematic Moon Orbit
    public idleTimer = 0;
    public cinematicBlend = 0;
    public cinematicOrbitAngle = 0;
    private _cinematicCamPos = new THREE.Vector3();
    private _cinematicLookAt = new THREE.Vector3();
    private _cinematicCamUp = new THREE.Vector3(0, 1, 0);

    public smoothCamPos = new THREE.Vector3(0, 1.2, 3.2);
    public smoothLookAt = new THREE.Vector3(0, 0.3, 0.9);
    public smoothCamUp = new THREE.Vector3(0, 1, 0);

    public smoothBackDir = new THREE.Vector3(0, 0, -1);
    public smoothSurfaceR = 1.0;
    private _targetBackDir = new THREE.Vector3();

    private _desiredCamPos = new THREE.Vector3();
    private _desiredLookAt = new THREE.Vector3();
    private _desiredCamUp = new THREE.Vector3(0, 1, 0);
    private _camBackDir = new THREE.Vector3();

    constructor(camera: THREE.PerspectiveCamera, rover: Rover, domElement: HTMLElement) {
        this.camera = camera;
        this.rover = rover;
        this.domElement = domElement;

        this.applyConfig();
        this.setupListeners();
    }

    public applyConfig(): void {
        const cfg = ConfigManager.current;
        this.pitchOffset = cfg.camPitch;
        this.radius = cfg.camDistance;
        this.targetRadius = cfg.camDistance;
        if (this.camera.fov !== cfg.camFov) {
            this.camera.fov = cfg.camFov;
            this.camera.updateProjectionMatrix();
        }
    }

    public resetCamera(): void {
        const cfg = ConfigManager.current;
        this.yawOffset = 0;
        this.pitchOffset = cfg.camPitch;
        this.radius = cfg.camDistance;
        this.targetRadius = cfg.camDistance;
        this.freeTheta = 0.35;
        this.freePhi = Math.PI / 2 - 0.2;
        this.smoothBackDir.copy(this.rover.forward).negate().normalize();
        this.smoothSurfaceR = this.rover.moon.moonScale;
        this.idleTimer = 0;
        this.cinematicBlend = 0;
        this.cinematicOrbitAngle = 0;
    }

    public resetIdle(): void {
        this.idleTimer = 0;
    }

    public triggerIdleCinematic(): void {
        const cfg = ConfigManager.current;
        const threshold = cfg.camIdleSeconds !== undefined ? cfg.camIdleSeconds : 25.0;
        this.idleTimer = threshold + 0.1;
    }

    private setupListeners(): void {
        this.domElement.addEventListener('mousedown', (e) => {
            this.isDragging = true;
            this.resetIdle();
            this.prevX = e.clientX;
            this.prevY = e.clientY;
        });

        window.addEventListener('mousemove', (e) => {
            if (!this.isDragging) return;
            this.resetIdle();
            const dx = e.clientX - this.prevX;
            const dy = e.clientY - this.prevY;
            this.prevX = e.clientX;
            this.prevY = e.clientY;

            if (ConfigManager.current.followCamera) {
                this.yawOffset -= dx * 0.008;
                this.pitchOffset = clamp(this.pitchOffset + dy * 0.007, 0.10, 1.35);
            } else {
                this.freeTheta -= dx * 0.0075;
                this.freePhi = clamp(this.freePhi - dy * 0.0075, 0.12, Math.PI - 0.12);
            }
        });

        window.addEventListener('mouseup', () => {
            this.isDragging = false;
        });

        this.domElement.addEventListener('wheel', (e) => {
            e.preventDefault();
            this.resetIdle();
            const zoomStep = e.deltaY * 0.0022;
            this.targetRadius = clamp(this.targetRadius + zoomStep, 1.2, 12.0);
        }, { passive: false });

        this.domElement.addEventListener('touchstart', (e) => {
            this.resetIdle();
            if (e.touches.length === 1) {
                this.isDragging = true;
                this.prevX = e.touches[0].clientX;
                this.prevY = e.touches[0].clientY;
            } else if (e.touches.length === 2) {
                this.isDragging = false;
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                this.pinchStartDist = Math.hypot(dx, dy);
                this.pinchStartRadius = this.targetRadius;
            }
        }, { passive: false });

        this.domElement.addEventListener('touchmove', (e) => {
            this.resetIdle();
            if (e.touches.length === 1 && this.isDragging) {
                const dx = e.touches[0].clientX - this.prevX;
                const dy = e.touches[0].clientY - this.prevY;
                this.prevX = e.touches[0].clientX;
                this.prevY = e.touches[0].clientY;

                if (ConfigManager.current.followCamera) {
                    this.yawOffset -= dx * 0.0085;
                    this.pitchOffset = clamp(this.pitchOffset + dy * 0.0075, 0.10, 1.35);
                } else {
                    this.freeTheta -= dx * 0.0085;
                    this.freePhi = clamp(this.freePhi - dy * 0.0085, 0.12, Math.PI - 0.12);
                }
            } else if (e.touches.length === 2 && this.pinchStartDist > 0) {
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                const dist = Math.hypot(dx, dy);
                const scaleFactor = this.pinchStartDist / Math.max(dist, 1);
                this.targetRadius = clamp(this.pinchStartRadius * scaleFactor, 1.2, 12.0);
            }
        }, { passive: false });

        this.domElement.addEventListener('touchend', () => {
            this.isDragging = false;
            this.pinchStartDist = 0;
        });

        // Key presses reset idle timer
        window.addEventListener('keydown', () => this.resetIdle());
        window.addEventListener('keyup', () => this.resetIdle());
    }

    public update(dt: number): void {
        const cfg = ConfigManager.current;
        const lerpFactor = 1 - Math.exp(-10 * dt);
        this.radius += (this.targetRadius - this.radius) * lerpFactor;

        const scale = this.rover.moon.moonScale;
        const isMoving = Math.abs(this.rover.speed) > 0.015;

        // 1. Idle Detection & Tracking
        if (isMoving || this.isDragging) {
            this.idleTimer = 0;
        } else {
            this.idleTimer += dt;
        }

        // 2. Auto-Realign to Default Angle when Moving
        if (isMoving && !this.isDragging && (cfg.camAutoRealign ?? true)) {
            // Wrap yawOffset to [-PI, PI] to ensure shortest angular route
            while (this.yawOffset > Math.PI) this.yawOffset -= Math.PI * 2;
            while (this.yawOffset < -Math.PI) this.yawOffset += Math.PI * 2;

            const realignRate = 2.8; // Smooth, elegant realignment
            const realignFactor = 1 - Math.exp(-realignRate * dt);
            this.yawOffset += (0 - this.yawOffset) * realignFactor;
            this.pitchOffset += (cfg.camPitch - this.pitchOffset) * realignFactor;

            if (Math.abs(this.yawOffset) < 0.0005) this.yawOffset = 0;
        }

        // 3. Cinematic Moon Orbit Blend
        const idleThreshold = cfg.camIdleSeconds !== undefined ? cfg.camIdleSeconds : 25.0;
        const isIdle = (cfg.camIdleCinematic ?? true) && this.idleTimer >= idleThreshold;
        const targetBlend = isIdle ? 1.0 : 0.0;

        // Smoothly fade in over ~3.5s, fade out responsively over ~1.2s when player moves
        const blendRate = targetBlend > 0.5 ? 0.85 : 2.6;
        this.cinematicBlend += (targetBlend - this.cinematicBlend) * (1 - Math.exp(-blendRate * dt));
        if (this.cinematicBlend < 0.0001) this.cinematicBlend = 0;
        if (this.cinematicBlend > 0.9999) this.cinematicBlend = 1;

        if (this.cinematicBlend > 0.001) {
            // Initialize orbit angle from current horizontal position to prevent angle jump
            if (this.cinematicBlend < 0.06 && this.cinematicOrbitAngle === 0) {
                this.cinematicOrbitAngle = Math.atan2(this.smoothCamPos.x, this.smoothCamPos.z);
            }
            this.cinematicOrbitAngle += dt * 0.09; // Majestic slow orbit around the moon

            const cinematicDist = Math.max(3.2, scale * 3.4);
            const incAngle = 0.38; // ~22 degrees elevation above equator for cinematic horizon
            const cosInc = Math.cos(incAngle);
            const sinInc = Math.sin(incAngle);
            this._cinematicCamPos.set(
                cinematicDist * cosInc * Math.sin(this.cinematicOrbitAngle),
                cinematicDist * sinInc,
                cinematicDist * cosInc * Math.cos(this.cinematicOrbitAngle)
            );
            this._cinematicLookAt.set(0, 0, 0); // Center of moon
            this._cinematicCamUp.set(0, 1, 0);
        } else {
            this.cinematicOrbitAngle = 0;
        }

        if (cfg.followCamera) {
            const u = this.rover.up;
            const f = this.rover.forward;

            // Target backward direction
            this._targetBackDir.copy(f).negate();

            if (cfg.comfortMode && cfg.lazyFollow) {
                // Keep smoothBackDir perpendicular to rover.up (tangent to sphere)
                this.smoothBackDir.addScaledVector(u, -this.smoothBackDir.dot(u));
                if (this.smoothBackDir.lengthSq() < 0.001) {
                    this.smoothBackDir.copy(this._targetBackDir);
                } else {
                    this.smoothBackDir.normalize();
                }

                // Check angle between smoothed camera back direction and rover's reverse heading
                const dot = clamp(this.smoothBackDir.dot(this._targetBackDir), -1, 1);
                const angle = Math.acos(dot);

                // Deadzone (~20 degrees / 0.35 rad): Inside deadzone, camera barely rotates
                // When turning continuously or sharp (> 0.35 rad), smoothly rotate to follow
                let catchupRate = 0.5; // Very slow drift inside deadzone
                if (angle >= 0.35) {
                    const excess = angle - 0.35;
                    catchupRate = 2.2 + Math.min(3.5, excess * 2.8);
                }

                this.smoothBackDir.lerp(this._targetBackDir, 1 - Math.exp(-catchupRate * dt)).normalize();

                // Apply manual yaw offset if user dragged with mouse/touch
                this._camBackDir.copy(this.smoothBackDir)
                    .applyAxisAngle(u, this.yawOffset)
                    .normalize();
            } else {
                // Legacy dynamic mode: snappy lock behind rover.forward
                this._camBackDir.copy(f).negate()
                    .applyAxisAngle(u, this.yawOffset)
                    .normalize();
                this.smoothBackDir.copy(this._camBackDir);
            }

            // Crater / Terrain bump filtering:
            const actualR = this.rover.moon.sampleActualSurfaceRadiusAt(u.x, u.y, u.z) * scale;
            if (cfg.comfortMode) {
                // Smooth surface radius heavily absorbs crater vibrations
                this.smoothSurfaceR += (actualR - this.smoothSurfaceR) * (1 - Math.exp(-3.5 * dt));
            } else {
                this.smoothSurfaceR = actualR;
            }

            const camDist = this.radius * 0.72;
            const camHeight = cfg.camHeight + this.pitchOffset * 1.15;

            this._desiredCamPos.copy(u)
                .multiplyScalar(this.smoothSurfaceR + camHeight)
                .addScaledVector(this._camBackDir, camDist);

            // Anchor look target stably at rover center in comfort mode
            if (cfg.comfortMode) {
                this._desiredLookAt.copy(u)
                    .multiplyScalar(this.smoothSurfaceR + 0.05);
            } else {
                this._desiredLookAt.copy(u)
                    .multiplyScalar(this.smoothSurfaceR + 0.04)
                    .addScaledVector(f, 0.14);
            }

            this._desiredCamUp.copy(u);

            // Blend with Cinematic Idle Orbit if active
            if (this.cinematicBlend > 0.001) {
                const t = this.cinematicBlend;
                const s = t * t * (3 - 2 * t); // Smooth Hermite curve
                this._desiredCamPos.lerp(this._cinematicCamPos, s);
                this._desiredLookAt.lerp(this._cinematicLookAt, s);
                this._desiredCamUp.lerp(this._cinematicCamUp, s).normalize();
            }

            const posSmoothRate = cfg.comfortMode ? Math.min(cfg.camSmoothPos, 6.5) : cfg.camSmoothPos;
            const lookSmoothRate = cfg.comfortMode ? Math.min(cfg.camSmoothLook, 8.0) : cfg.camSmoothLook;
            const upSmoothRate = cfg.comfortMode ? 4.5 : 10.0;

            this.smoothCamPos.lerp(this._desiredCamPos, 1 - Math.exp(-posSmoothRate * dt));
            this.smoothLookAt.lerp(this._desiredLookAt, 1 - Math.exp(-lookSmoothRate * dt));
            this.smoothCamUp.lerp(this._desiredCamUp, 1 - Math.exp(-upSmoothRate * dt)).normalize();

            this.camera.up.copy(this.smoothCamUp);
            this.camera.position.copy(this.smoothCamPos);
            this.camera.lookAt(this.smoothLookAt);
        } else {
            // Free orbit around center
            const r = this.radius * scale;
            this._desiredCamPos.set(
                r * Math.sin(this.freePhi) * Math.sin(this.freeTheta),
                r * Math.cos(this.freePhi),
                r * Math.sin(this.freePhi) * Math.cos(this.freeTheta)
            );

            this.smoothCamPos.lerp(this._desiredCamPos, lerpFactor);
            this.smoothLookAt.lerp(new THREE.Vector3(0, 0, 0), lerpFactor);

            this.camera.position.copy(this.smoothCamPos);
            this.camera.lookAt(this.smoothLookAt);
        }
    }
}
