import * as THREE from 'three';
import { Moon } from './Moon';

export class BaseStation {
    public group: THREE.Group;
    public moon: Moon;

    public positionUnit = new THREE.Vector3(0, 1, 0); // North pole
    public depositRadius = 0.22;
    public upgradeRadius = 0.18;

    public depositPadPos = new THREE.Vector3();
    public upgradePadPos = new THREE.Vector3();

    private rocketMesh!: THREE.Group;
    private depositRingMesh!: THREE.Mesh;
    private upgradePadMesh!: THREE.Mesh;
    private thrusterFlame!: THREE.Mesh;

    // 3D Nav Arrow hovering above rover
    public navArrowGroup: THREE.Group;

    constructor(moon: Moon) {
        this.moon = moon;
        this.group = new THREE.Group();
        this.moon.group.add(this.group);

        this.navArrowGroup = new THREE.Group();
        this.moon.group.add(this.navArrowGroup);

        this.buildRocketAndBase();
        this.buildNavArrow();
    }

    private buildRocketAndBase(): void {
        const whiteMat = new THREE.MeshStandardMaterial({ color: '#F8FAFC', roughness: 0.35, metalness: 0.1 });
        const redMat = new THREE.MeshStandardMaterial({ color: '#EF4444', roughness: 0.4, metalness: 0.1 });
        const darkMat = new THREE.MeshStandardMaterial({ color: '#1E293B', roughness: 0.6 });
        const goldMat = new THREE.MeshStandardMaterial({ color: '#FACC15', roughness: 0.3, metalness: 0.5 });
        const cyanGlowMat = new THREE.MeshBasicMaterial({ color: '#38BDF8' });

        this.rocketMesh = new THREE.Group();

        // Rocket Capsule
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.055, 0.18, 18), whiteMat);
        body.position.y = 0.12;
        this.rocketMesh.add(body);

        // Nose Cone
        const nose = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.08, 18), redMat);
        nose.position.y = 0.25;
        this.rocketMesh.add(nose);

        // Window Porthole
        const windowFrame = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.008, 16), darkMat);
        windowFrame.rotation.x = Math.PI / 2;
        windowFrame.position.set(0, 0.14, 0.045);
        this.rocketMesh.add(windowFrame);

        const windowGlass = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.010, 16), cyanGlowMat);
        windowGlass.rotation.x = Math.PI / 2;
        windowGlass.position.set(0, 0.14, 0.045);
        this.rocketMesh.add(windowGlass);

        // Thruster Nozzle
        const thruster = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.04, 16), darkMat);
        thruster.rotation.x = Math.PI;
        thruster.position.y = 0.02;
        this.rocketMesh.add(thruster);

        // Thruster flame (visible when ready to launch)
        this.thrusterFlame = new THREE.Mesh(
            new THREE.ConeGeometry(0.025, 0.08, 14),
            new THREE.MeshBasicMaterial({ color: '#F59E0B', transparent: true, opacity: 0.85 })
        );
        this.thrusterFlame.rotation.x = Math.PI;
        this.thrusterFlame.position.y = -0.03;
        this.thrusterFlame.visible = false;
        this.rocketMesh.add(this.thrusterFlame);

        // 3 Landing Struts / Legs
        for (let i = 0; i < 3; i++) {
            const angle = (i / 3) * Math.PI * 2;
            const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.006, 0.10, 8), goldMat);
            leg.position.set(Math.cos(angle) * 0.045, 0.04, Math.sin(angle) * 0.045);
            leg.rotation.z = Math.cos(angle) * 0.35;
            leg.rotation.x = -Math.sin(angle) * 0.35;
            this.rocketMesh.add(leg);

            const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.005, 8), darkMat);
            foot.position.set(Math.cos(angle) * 0.065, 0.002, Math.sin(angle) * 0.065);
            this.rocketMesh.add(foot);
        }

        this.group.add(this.rocketMesh);

        // 1. Glowing Drive-Through Deposit Ring
        const ringGeom = new THREE.RingGeometry(0.12, 0.16, 32);
        const ringMat = new THREE.MeshBasicMaterial({
            color: '#38BDF8',
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.65
        });
        this.depositRingMesh = new THREE.Mesh(ringGeom, ringMat);
        this.depositRingMesh.rotation.x = -Math.PI / 2;
        this.depositRingMesh.position.set(0, 0.003, 0.16);
        this.group.add(this.depositRingMesh);

        // 2. Upgrade Pad
        const padGeom = new THREE.PlaneGeometry(0.18, 0.18);
        const padMat = new THREE.MeshBasicMaterial({
            color: '#FACC15',
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.55
        });
        this.upgradePadMesh = new THREE.Mesh(padGeom, padMat);
        this.upgradePadMesh.rotation.x = -Math.PI / 2;
        this.upgradePadMesh.position.set(-0.16, 0.003, 0);
        this.group.add(this.upgradePadMesh);

        this.repositionOnMoon();
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
        const u = this.positionUnit.normalize();
        const r = this.moon.sampleCleanRadiusAt(u.x, u.y, u.z);
        this.group.position.copy(u).multiplyScalar(r);

        // Orient group straight up from moon center
        const alignQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), u);
        this.group.quaternion.copy(alignQuat);

        // Compute world coordinates for deposit & upgrade pads
        this.depositRingMesh.getWorldPosition(this.depositPadPos);
        this.upgradePadMesh.getWorldPosition(this.upgradePadPos);
    }

    public update(dt: number, roverPos: THREE.Vector3, isTankFull: boolean, isReadyToLaunch: boolean): void {
        // Pulse ring glow
        const pulse = 0.5 + 0.35 * Math.sin(performance.now() * 0.005);
        (this.depositRingMesh.material as THREE.MeshBasicMaterial).opacity = pulse;

        // Thruster flame active if ready to launch
        this.thrusterFlame.visible = isReadyToLaunch;
        if (isReadyToLaunch) {
            const flicker = 0.8 + 0.4 * Math.random();
            this.thrusterFlame.scale.set(flicker, flicker * 1.3, flicker);
        }

        // Nav Arrow Logic: show if tank is full or rocket is ready to launch
        const shouldShowArrow = isTankFull || isReadyToLaunch;
        this.navArrowGroup.visible = shouldShowArrow;

        if (shouldShowArrow) {
            // Hover arrow 0.12 units above rover
            const arrowHoverPos = roverPos.clone().multiplyScalar(1.08);
            this.navArrowGroup.position.copy(arrowHoverPos);

            // Point arrow toward Base Station
            const targetDir = this.group.position.clone().sub(roverPos).normalize();
            this.navArrowGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), targetDir);
        }
    }

    public checkRoverInDepositZone(roverPos: THREE.Vector3): boolean {
        return roverPos.distanceTo(this.depositPadPos) <= this.depositRadius;
    }

    public checkRoverInUpgradeZone(roverPos: THREE.Vector3): boolean {
        return roverPos.distanceTo(this.upgradePadPos) <= this.upgradeRadius;
    }
}
