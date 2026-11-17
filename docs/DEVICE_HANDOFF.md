#  DEVICE HANDOFF & CONTINUATION GUIDE
## Project: Lunar Sweeper 3D (Codename: Moon)
**Repository:** [https://github.com/AjiNurhakim/lunar-sweeper-3d](https://github.com/AjiNurhakim/lunar-sweeper-3d)  
**Author:** Aji Nurhakim  
**Document Type:** Seamless Handoff & Developer Instructions  
**Date:** November 2026

---

##  1. Quick Setup on New Device (Windows, macOS, Linux)

### Step 1: Clone the Repository
```bash
git clone https://github.com/AjiNurhakim/lunar-sweeper-3d.git
cd lunar-sweeper-3d
```

### Step 2: Install Node Dependencies
Make sure you have Node.js 18+ installed.
```bash
npm install
```

### Step 3: Run the Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### Step 4: Build for Production
```bash
npm run build
npm run preview
```

---

##  2. Complete Context & Current Project Status

### What is this Game?
A commercial-grade 3D stylized web game targeted for the **Poki Web Game Portal**.
The player pilots a cute, stylized yellow cleaning rover across the 3D spherical surface of procedurally generated moons, sweeping cosmic dust and stardust into a vacuum tank.

### Key Features Completed & Polished:
1. **Procedural Spherical Moon & Surface Dirt:**
   - Ultra-smooth Detail 7 subdivided icosahedron (81,920 vertices).
   - High-performance 36x72 spherical spatial hash grid (`DirtSpatialGrid.ts`) running at steady 60 FPS without CPU normal recalculations.
   - Smooth continuous 3D Simplex noise with cubic interpolation for organic dust edges.
   - 24 vibrant procedural moon color palettes + procedural circular craters rendered in fragment shader.
   - Multiplied moon scaling (up to 6.00x) with decoupled probe scale for vast planetary horizons.

2. **Chibi Rover & Articulated Trailer Cart (`Rover.ts`):**
   - Arcade-style vehicle physics (acceleration, deceleration, smooth steering, controlled ~45% reverse speed).
   - Real-time chassis suspension dynamics (pitch tilt on acceleration, roll lean on steering).
   - Multi-layered wheel architecture: dark tire cylinder, outer yellow velg hubcap with positive depth offset, and raised center axle nut (100% zero Z-fighting).
   - Frontend sweeper roller with animated rotation and side guard plates.
   - Articulated trailer cart hitched to the rear with dynamic yaw lag and trailer wheels.

3. **Horizontal Transparent Vacuum Tank:**
   - Horizontal crystal-clear glass capsule tank mounted across the trailer cart (X-axis).
   - Fills left-to-right with luminous glowing stardust.
   - Razor-sharp sliding white floater meniscus divider ring.
   - 3 vertical calibration tick marks (25%, 50%, 75%).
   - Top-mounted 4-segment gauge on the cart deck (100% visible from top-down camera views).
   - 3-stage rear bumper LEDs.

4. **Anti-Dizziness "Comfort Mode" Camera (`CameraController.ts`):**
   - Eliminates motion sickness from zigzag sweeping.
   - Soft deadzone lazy-follow spring-arm heading damping (rotates probe on screen instead of violently whipping the horizon).
   - Heavy terrain bump filtering and stabilized look-at target.
   - Full real-time sliders for distance, height, pitch, FOV, and smoothness.

5. **Live In-Game HUD & Tuning Panel (`HUD.ts`):**
   - Collapsible 5-tab settings panel: `️ Probe`, ` Kamera`, ` Bulan`, ` Tangki`, ` JSON`.
   - Dedicated Tank debug controls: Quick 100%, 50%, 0% fill buttons, manual fill slider, capacity, fill rate, glass opacity, glow intensity, and 6 glowing stardust color styles.
   - One-click JSON export/download and browser `localStorage` synchronization (`lunar_sweeper_custom_config_v6`).

6. **10 Celestial Space Skybox Themes (`Scenery.ts`):**
   - Voyager, Nebula, Solar Horizon, Emerald Titan, Aurora Borealis, Comet & Neptune, Supernova, Gargantua Black Hole, Asteroid Belt, Synthwave.

7. **Audio System (`SoundManager.ts`):**
   - Procedural Web Audio API sound generator for ASMR dust brushing, deposit whoosh, coin pick, upgrade chime, and rocket launch fanfare.

---

##  3. Codebase File Map

| Path | Purpose |
|---|---|
| `src/main.ts` | Game entry point, Three.js renderer loop, scene creation, and coordinator. |
| `src/core/Config.ts` | Centralized game configuration, default values, and `localStorage` manager. |
| `src/core/CameraController.ts` | Spherical camera system, comfort mode, lazy spring-arm, and orbit controls. |
| `src/core/InputManager.ts` | Keyboard and mouse input handling with active input checks. |
| `src/entities/Rover.ts` | 3D rover mesh, layered wheels, trailer cart, horizontal capsule tank, physics & suspension. |
| `src/entities/Moon.ts` | Spherical terrain geometry, wrap-diffuse clay shader, procedural craters, and color palettes. |
| `src/entities/BaseStation.ts` | Lander Rocket, deposit ring, and upgrade pads for moon launch. |
| `src/entities/Scenery.ts` | Procedural stars, animated meteors, nebulae, and 10 celestial environments. |
| `src/systems/DirtSpatialGrid.ts` | 36x72 angular spatial partition grid for 60 FPS sweeping. |
| `src/systems/SweeperSystem.ts` | Sweeper brush collision math, dust collection rate, and tank fill integration. |
| `src/systems/EconomySystem.ts` | Coin economy and upgrade tier formulas. |
| `src/audio/SoundManager.ts` | Web Audio procedural sound effects. |
| `src/ui/HUD.ts` | HTML HUD, 5-tab settings panel, tank debug controls, JSON import/export. |
| `docs/GAME_CONTEXT.md` | Comprehensive living memory and architectural decision log. |
| `docs/GDD.md` | Complete Game Design Document for Poki release. |

---

##  4. Next Development Steps (When Continuing)

Currently, the game is in **Visual & Game Feel Polish Mode** (uninterrupted sweeping with full live tuning panel). When you are ready to transition to the full **Poki Commercial Game Loop**:
1. **Re-Enable the Deposit & Upgrade Loop:**
   - Link the vacuum tank capacity to the Rover's deposit ring at `BaseStation.ts`.
   - When the tank reaches 100%, the player drives through the Lander Rocket ring to dump stardust and receive coins.
2. **Interactive Upgrade Shop:**
   - Open the shop modal on the upgrade pads to spend coins on *Sweeper Power*, *Sweeper Width*, and *Tank Capacity*.
3. **Moon Completion & Launch:**
   - When the moon reaches $\ge 85\%$ clean (or 100% bonus), trigger the Lander Rocket launch sequence to fly to the next procedural moon.
4. **Poki SDK Integration:**
   - Connect `PokiSDK.gameplayStart()`, `gameplayStop()`, interstitial ads between moons, and rewarded ads for speed/width boosts.
