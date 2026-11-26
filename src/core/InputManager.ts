export class InputManager {
    public forward = false;
    public backward = false;
    public left = false;
    public right = false;

    // Joystick state
    private touchActive = false;
    private touchStartX = 0;
    private touchStartY = 0;
    private touchCurrentX = 0;
    private touchCurrentY = 0;
    private readonly MAX_JOYSTICK_DIST = 46;

    private joystickBaseEl: HTMLElement | null = null;
    private joystickKnobEl: HTMLElement | null = null;

    constructor() {
        this.joystickBaseEl = document.getElementById('joystick-base');
        this.joystickKnobEl = document.getElementById('joystick-knob');
        this.setupKeyboard();
        this.setupTouch();
    }

    public isTouchActive(): boolean {
        return this.touchActive;
    }

    private resetInputs(): void {
        this.forward = false;
        this.backward = false;
        this.left = false;
        this.right = false;
        this.touchActive = false;
        if (this.joystickBaseEl) {
            this.joystickBaseEl.classList.add('hidden');
        }
    }

    private setupKeyboard(): void {
        window.addEventListener('keydown', (e) => {
            const k = e.key.toLowerCase();
            if (k === 'w' || e.key === 'ArrowUp') this.forward = true;
            if (k === 's' || e.key === 'ArrowDown') this.backward = true;
            if (k === 'a' || e.key === 'ArrowLeft') this.left = true;
            if (k === 'd' || e.key === 'ArrowRight') this.right = true;
        });

        window.addEventListener('keyup', (e) => {
            const k = e.key.toLowerCase();
            if (k === 'w' || e.key === 'ArrowUp') this.forward = false;
            if (k === 's' || e.key === 'ArrowDown') this.backward = false;
            if (k === 'a' || e.key === 'ArrowLeft') this.left = false;
            if (k === 'd' || e.key === 'ArrowRight') this.right = false;
        });

        window.addEventListener('blur', () => this.resetInputs());
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) this.resetInputs();
        });
    }

    private setupTouch(): void {
        const canvasContainer = document.getElementById('canvas-container');
        if (!canvasContainer) return;

        // Listen on canvas container directly so HUD elements with higher z-index receive all clicks/inputs!
        canvasContainer.addEventListener('touchstart', (e) => {
            const touch = e.touches[0];
            this.touchActive = true;
            this.touchStartX = touch.clientX;
            this.touchStartY = touch.clientY;
            this.touchCurrentX = touch.clientX;
            this.touchCurrentY = touch.clientY;

            if (this.joystickBaseEl && this.joystickKnobEl) {
                this.joystickBaseEl.style.left = `${this.touchStartX}px`;
                this.joystickBaseEl.style.top = `${this.touchStartY}px`;
                this.joystickKnobEl.style.transform = 'translate(-50%, -50%)';
                this.joystickBaseEl.classList.remove('hidden');
            }
        }, { passive: true });

        canvasContainer.addEventListener('touchmove', (e) => {
            if (!this.touchActive) return;
            const touch = e.touches[0];
            this.touchCurrentX = touch.clientX;
            this.touchCurrentY = touch.clientY;

            const dx = this.touchCurrentX - this.touchStartX;
            const dy = this.touchCurrentY - this.touchStartY;
            const dist = Math.hypot(dx, dy);

            let knobX = dx;
            let knobY = dy;
            if (dist > this.MAX_JOYSTICK_DIST) {
                knobX = (dx / dist) * this.MAX_JOYSTICK_DIST;
                knobY = (dy / dist) * this.MAX_JOYSTICK_DIST;
            }

            if (this.joystickKnobEl) {
                this.joystickKnobEl.style.transform = `translate(calc(-50% + ${knobX}px), calc(-50% + ${knobY}px))`;
            }
        }, { passive: true });

        const endTouch = () => {
            this.touchActive = false;
            if (this.joystickBaseEl) {
                this.joystickBaseEl.classList.add('hidden');
            }
        };

        canvasContainer.addEventListener('touchend', endTouch);
        canvasContainer.addEventListener('touchcancel', endTouch);
    }

    public getThrottle(): number {
        if (this.touchActive) {
            const dy = this.touchCurrentY - this.touchStartY;
            // Dragging up = Forward (+1), Dragging down = Backward (-1)
            const raw = -dy / this.MAX_JOYSTICK_DIST;
            return Math.max(-1, Math.min(1, raw));
        }

        let throttle = 0;
        if (this.forward) throttle += 1;
        if (this.backward) throttle -= 1;
        return throttle;
    }

    public getSteer(): number {
        if (this.touchActive) {
            const dx = this.touchCurrentX - this.touchStartX;
            // Dragging left = Left (+1), Dragging right = Right (-1)
            const raw = -dx / this.MAX_JOYSTICK_DIST;
            return Math.max(-1, Math.min(1, raw));
        }

        let steer = 0;
        if (this.left) steer += 1;
        if (this.right) steer -= 1;
        return steer;
    }
}
