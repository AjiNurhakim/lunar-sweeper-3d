# GAME CONTEXT & TECHNICAL ARCHITECTURE
## Project: Lunar Sweeper 3D
**Path:** `c:\Users\LENOVO\OneDrive\Dokumen\Aji\Games\Codename--Moon`  
**Target:** Poki Web Game Portal  
**Document Type:** Living Architecture & Decision Memory  
**Last Updated:** November 2026 (Initialized from Grill-Me Session)  

---

## 1. Technical Stack & Dependencies

```text
┌─────────────────────────────────────────────────────────────┐
│                       Browser Runtime                       │
│  ┌───────────────────────┐         ┌─────────────────────┐  │
│  │   Canvas 3D (WebGL)   │         │    HTML/CSS Overlay │  │
│  │   Three.js Engine     │         │    Clean Boxy UI    │  │
│  └───────────▲───────────┘         └──────────▲──────────┘  │
│              │                                │             │
│  ┌───────────┴────────────────────────────────┴──────────┐  │
│  │            TypeScript Core Architecture               │  │
│  │   - Game Loop & State Machine                         │  │
│  │   - Spherical Physics & Rover Controller              │  │
│  │   - Spatial Partitioned Dirt & Sweeper System         │  │
│  │   - Economy & Upgrade Store                           │  │
│  └──────▲────────────────────────────▲────────────────▲──┘  │
│         │                            │                │     │
│  ┌──────┴─────────┐         ┌────────┴─────────┐ ┌────┴──┐  │
│  │    Howler.js   │         │     Poki SDK     │ │ Local │  │
│  │   Audio System │         │    Integration   │ │ Store │  │
│  └────────────────┘         └──────────────────┘ └───────┘  │
└─────────────────────────────────────────────────────────────┘
```

| Area | Solution | Justification |
| :--- | :--- | :--- |
| **Bundler & Build** | **Vite** | Fast HMR, minimal production output bundle (< 1.5MB), ES Module native. |
| **Language** | **TypeScript** | Strict typing for physics vectors, upgrade structures, and Poki SDK payloads. |
| **Rendering** | **Three.js** | Production-proven WebGL library; native support for custom shaders and buffer geometries. |
| **Audio** | **Howler.js** | Handles mobile audio unlocking, pooling, spatial panning, and separate volume channels. |
| **SDK** | **Poki SDK v2** | Required for commercial ads, rewarded ads, and gameplay lifecycle events. |
| **UI System** | **HTML5 + CSS (Tailwind/Custom)** | Clean boxy minimalist design, high responsiveness across aspect ratios. |

---

## 2. Directory Structure

```text
Codename--Moon/
├── docs/
│   ├── GDD.md                   # Living Game Design Document
│   └── GAME_CONTEXT.md          # Technical Architecture & Decision Memory
├── public/
│   ├── audio/                   # SFX & BGM files (mp3/ogg)
│   ├── favicon.ico
│   └── poki-sdk.js              # Mock / Live Poki SDK
├── src/
│   ├── audio/
│   │   └── SoundManager.ts      # Howler wrapper, audio channels, haptic feedback
│   ├── core/
│   │   ├── Game.ts              # Main game coordinator, loop, lifecycle
│   │   ├── InputManager.ts      # Keyboard, mouse, and floating virtual joystick
│   │   ├── StateManager.ts      # Game state machine (PLAYING, BASE, UPGRADE, LAUNCH)
│   │   └── SaveManager.ts       # LocalStorage auto-save and persistence
│   ├── entities/
│   │   ├── Moon.ts              # Subdivided icosahedron, craters, shaders
│   │   ├── Rover.ts             # 3D Yellow probe mesh, wheels, sweeper assembly
│   │   ├── BaseStation.ts       # Lander Rocket, deposit ring, upgrade pads
│   │   ├── ObstacleManager.ts   # Meteorite boulders & buried relics
│   │   └── Scenery.ts           # Procedural starfield, nebulae, distant planets
│   ├── systems/
│   │   ├── DirtSpatialGrid.ts   # Spatial hash/partitioning for 60 FPS sweeping
│   │   ├── SweeperSystem.ts     # Collision math between brush and dirt vertices
│   │   └── EconomySystem.ts     # Coins, dust tier multipliers, upgrade calculations
│   ├── ui/
│   │   ├── HUD.ts               # Clean boxy cards, progress %, tank bar, coins
│   │   ├── UpgradeModal.ts      # Interactive shop UI on the base pad
│   │   └── VirtualJoystick.ts   # Dynamic floating joystick for touch screens
│   ├── sdk/
│   │   └── PokiWrapper.ts       # Safe Poki SDK caller with ad cooldowns & mock mode
│   ├── main.ts                  # Entry point
│   └── style.css                # Boxy minimal dark theme styles
├── index.html                   # HTML host container
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## 3. Critical Technical Optimizations (The 60 FPS Guarantee)

### 3.1 The Spatial Partitioning Dirt Grid
- **The Problem in Prototype**: The prototype looped through `20,000+` vertices every single frame on the CPU inside `applySweeperAndTrails()`, and recalculated vertex normals with `moonGeometry.computeVertexNormals()`. This is fatal for mobile browser performance.
- **The Production Solution**:
  1. **Spherical Spatial Hash**: Pre-partition the sphere into angular bins (latitude/longitude chunks or icosahedron face buckets).
  2. **Active Cell Queries**: In each frame, only query vertices in the 1–2 cells directly under the rover's front sweeper roller (~100 to 250 vertices instead of 20,480).
  3. **No CPU Normal Recalculations**: Instead of recomputing vertex normals on the CPU whenever dirt changes, calculate dirt shading in the Fragment Shader using analytical normal perturbations or a precomputed tangent space normal map.

### 3.2 Mobile-First Performance Budget
- **Draw Calls**: Maximum 25–40 draw calls per frame.
- **Triangle Budget**: Sphere resolution balanced at Detail 5 or 6 (~20k - 35k triangles) with single-draw-call instanced meshes for stars and rocks.
- **Initial Load Size**: Total payload under 4 MB (Textures procedural or SVG, sounds compressed OGG/MP3).

---

## 4. Game Systems & Mathematical Formulas

### 4.1 Spherical Movement Math (Adopted from `lunar_sweeper_3d_moon_cleaning_game (1).html`)
- Rover coordinates are stored as a strict right-handed orthonormal basis:
  - $\mathbf{u}$ (Up): Normal vector pointing out from moon center to rover.
  - $\mathbf{f}$ (Forward): Heading vector tangent to the sphere.
  - $\mathbf{l}$ (Left): $\mathbf{u} \times \mathbf{f}$ (det = +1).
- Translation along great circle by angular delta:
  $$\Delta \theta = \frac{v_{\text{rover}} \cdot \Delta t}{R_{\text{moon}}}$$
  $$\mathbf{u}' = \mathbf{u} \cos(\Delta \theta) + (\mathbf{l} \times \mathbf{u}) \sin(\Delta \theta)$$
- **4-Wheel Surface Height & Slope Normal Sampling**:
  - Sample height at Front-Left ($h_{\text{FL}}$), Front-Right ($h_{\text{FR}}$), Back-Left ($h_{\text{BL}}$), Back-Right ($h_{\text{BR}}$).
  - Compute slopes:
    $$d_{\text{fwd}} = \frac{(h_{\text{FL}} + h_{\text{FR}}) \cdot 0.5 - (h_{\text{BL}} + h_{\text{BR}}) \cdot 0.5}{2 \cdot \text{wheelFwdOff}}$$
    $$d_{\text{left}} = \frac{(h_{\text{FL}} + h_{\text{BL}}) \cdot 0.5 - (h_{\text{FR}} + h_{\text{BR}}) \cdot 0.5}{2 \cdot \text{wheelSideOff}}$$
  - Surface slope normal:
    $$\mathbf{N}_{\text{slope}} = \text{normalize}(\mathbf{u} - d_{\text{fwd}} \cdot \mathbf{f} - d_{\text{left}} \cdot \mathbf{l})$$
- **Camera Smooth Up-Vector Lerp**:
  - Camera Up vector is interpolated smoothly to prevent pole flipping and gimbal lock:
    $$\mathbf{Up}_{\text{cam}} = \text{normalize}(\text{lerp}(\mathbf{Up}_{\text{cam}}, \mathbf{u}, 1 - e^{-10 \Delta t}))$$
  - `camera.up.copy(smoothCamUp)` ensures butter-smooth tracking over any lunar terrain.

### 4.2 Shading Model & Space Art Style (Adopted from `moon_generator_3d_stylized_moon_creator.html`)
- **Wrap-Diffuse Clay Shading**:
  $$I_{\text{diff}} = \left(\text{clamp}\left(\frac{\mathbf{N} \cdot \mathbf{L} + w}{1.0 + w}, 0.0, 1.0\right)\right)^{1.12}$$
  where $w = 0.55$ provides the soft matte clay look.
- **Tinted Shadows (No Murky Blacks)**:
  $$\mathbf{C}_{\text{shadow}} = \mathbf{C}_{\text{vertex}} \cdot (0.84, 0.84, 0.98) \cdot u_{\text{ShadowBrightness}}$$
- **Crater Rim Satin Sheen**:
  $$\mathbf{C}_{\text{spec}} = \mathbf{C}_{\text{light}} \cdot (\max(\mathbf{N} \cdot \mathbf{H}, 0.0))^{16.0} \cdot 0.14$$
- **Space Scenery Architecture**:
  - Geometric Octahedron stars with pastel space palettes (`#FFFFFF`, `#BAE6FD`, `#FDE68A`, `#F5D0FE`).
  - Layered translucent Icosahedron nebula puffs with soft opacity (`0.11`, `depthWrite: false`).
  - Distant low-poly planets and ringed gas giants per celestial theme.

### 4.2 Dust Friction & Drag Formula
When rover enters a dust vertex of tier $T$ with strength $S_{\text{dirt}}$:
$$v_{\text{effective}} = v_{\text{max}} \cdot \max\left(0.35, 1.0 - \frac{S_{\text{dirt}} - P_{\text{brush}}}{100}\right)$$
- If player's *Sweeper Power* $P_{\text{brush}} \ge S_{\text{dirt}}$, there is **zero speed penalty**.
- If player has low power on Tier 3 dust, rover slows down to a crawl until upgraded.

### 4.3 Upgrade Progression Formula
Cost of upgrade level $L$:
$$\text{Cost}(L) = \text{BaseCost} \cdot (\text{Multiplier})^{L-1}$$
- **Sweeper Power**: Base 100, Multiplier 1.45
- **Sweeper Width**: Base 150, Multiplier 1.55
- **Tank Capacity**: Base 120, Multiplier 1.40

---

## 5. Poki SDK Integration Checklist

- [ ] `PokiSDK.init()` called before any game logic starts, handling adblock detection gracefully.
- [ ] `PokiSDK.gameplayStart()` called when player first engages movement.
- [ ] `PokiSDK.gameplayStop()` called when opening menus, watching ads, or launching rocket.
- [ ] Commercial breaks wrapped in cooldown timers ($\ge 3$ minutes) and only during Moon transition screens.
- [ ] Rewarded breaks provide guaranteed rewards via callback:
  - Free stat upgrade
  - Temporary 60s Speed Boost
  - Temporary 60s Width Boost
  - Exclusive Rover Skins
- [ ] Audio Mute sync: Game audio automatically mutes when Poki ad is playing and unmutes on resume.

---

## 6. Living Prompt & Decision Log

| Date | Session / Request | Key Decisions & Alignment |
| :--- | :--- | :--- |
| **Nov 2026** | Initial Code Analysis | Analyzed `lunar_sweeper_3d_moon_cleaning_game.html`. Identified core math strengths and CPU bottleneck. |
| **Nov 2026** | `/grill-me` Core Loop | Selected **Arcade-Idle Sweeper** as primary genre (Sweep -> Tank Fill -> Base Deposit -> Upgrade -> Fly to Next Moon). |
| **Nov 2026** | `/grill-me` World Structure | Confirmed **Procedural Infinite Moons** with scaling size, crater count, and obstacles. |
| **Nov 2026** | `/grill-me` Dust System | Established **2–3 Dust Tiers** per moon with distinct colors; heavier dust slows down the rover unless *Sweeper Power* is upgraded. |
| **Nov 2026** | `/grill-me` Base & Tank | Selected **Glowing Canister Tank** on rover, **Drive-Through Deposit** ring at the Lander Rocket, and interactive Upgrade Pads. |
| **Nov 2026** | `/grill-me` Upgrades | Confirmed 3 core upgrade stats: (1) **Sweeper Power**, (2) **Sweeper Width**, (3) **Tank Capacity**. |
| **Nov 2026** | `/grill-me` Milestone | Confirmed **85% Clean Launch Threshold** to trigger rocket launch, with optional 100% clean for gold bonus. |
| **Nov 2026** | `/grill-me` Monetization | Interstitials only between moon launches; Rewarded Ads for free upgrades, speed boost, width boost, and skins. |
| **Nov 2026** | `/grill-me` Art & UI | Stylized Clay Chibi aesthetic + ASMR cozy audio; Boxy minimalist clean dark UI (`#171A23`) with Plus Jakarta Sans. |
| **Nov 2026** | `/grill-me` Controls & Save | Hybrid WASD (PC) + Floating Virtual Joystick (Mobile); LocalStorage auto-save. |
| **Nov 2026** | Reference Integration | Adopted smooth 4-wheel height sampling & camera up-vector from `lunar_sweeper_3d_moon_cleaning_game (1).html`. Adopted wrap-diffuse clay shader, tinted shadows, and space presets from `moon_generator_3d_stylized_moon_creator.html`. |
| **Nov 2026** | Game Feel & Visual Polish Mode | Temporarily deactivated economy & tank limits. Added real-time chassis suspension dynamics (pitch tilt & roll lean on steering), uninterrupted infinite sweeping, and collapsible live tuning panel for speed, width, brush power, dirt height, and moon scale. |
| **Nov 2026** | UI Click Fix & Comprehensive Tabbed Settings | Fixed UI z-index/touch event intercept bug. Built 4-tab settings panel (Probe, Kamera, Bulan, Simpan JSON) with camera distance, pitch, height, FOV, smoothness tuning, and 1-click JSON export/download. |
| **Nov 2026** | Visual Smoothing & Baseline Locking | Locked user's exported config as default (`probeSpeed: 0.90`, `turn: 2.80`, `width: 0.20`, `camDist: 2.40`, `camPitch: 1.20`, `camFov: 45°`). Solved blocky visual edges by replacing discrete `floor()` noise with continuous cubic-interpolated 3D noise, organic micro-warp boundary perturbation, cosine brush profiling, and continuous Gaussian tire track ribbons. |
| **Nov 2026** | Ultra-Smooth Detail 7 Mesh, Per-Pixel Craters & Fading Trails | Upgraded mesh to Detail 7 (81,920 vertices) with 36x72 spatial bins. Moved crater rim & cavity coloring to fragment shader uniforms (100% circular, zero hexagon/polygon faceting). Softened sweeper brush with wide cubic Hermite feathering. Implemented dynamic fading tire trail decay system (disappears smoothly in ~4.5s) with dedicated UI slider. |
| **Nov 2026** | Procedural North Pole Landing Pad & Reverse Trail Fix | Rendered the North Pole base circle procedurally in fragment shader (`smoothstep(0.852, 0.878, dir.y)`), completely eliminating circular sawtooth stepping. Fixed reverse driving trail bug by widening candidate query to center of rover (radius 0.22) and protecting fresh trails from front roller erasing during reverse motion. |
| **Nov 2026** | Reverse Speed Tuning & Subtle Harmonious Craters | Reduced reverse speed to ~45% of forward speed with gentle reverse acceleration and controlled turn rate for realistic vehicle handling. Softened crater palettes and fragment shader blending (`min(0.26)` rim and `min(0.38)` bowl) for subtle, harmonious clay craters without harsh glowing rings or pitch-dark pits. |
| **Nov 2026** | Expanded 10 Celestial Space Scenery Themes | Added 10 diverse stylized space environments (Deep Space Voyager, Violet Dream Nebula, Solar Horizon, Emerald Titan, Aurora Borealis, Glacial Comet & Neptune, Crimson Supernova, Gargantua Black Hole with accretion disk, Asteroid Belt, and Neon Synthwave) with slow orbital rotation, dynamic diagonal shooting stars/meteors, and an interactive UI dropdown selector in Tab Bulan. |
| **Nov 2026** | 24 Moon Color Palettes & Multiplied Moon Scaling (up to 6x) | Expanded procedural moon palette pool to 24 diverse themes (Crimson Mars, Obsidian Shadow, Amethyst Kristal, Gurun Sahara, Sakura Blossom, etc.). Fixed moon scale illusion: decoupled rover and camera world scale (`invScale = 1 / moonScale`) so the probe maintains its true world size, allowing the moon to expand up to 6.00x into a massive celestial sphere with a vast, gentle planetary horizon. |
| **Nov 2026** | Anti-Motion Sickness "Comfort Mode" & Lazy Follow Spring-Arm | Eliminated dizziness caused by rapid horizon whipping during zigzag sweeping. Implemented soft deadzone lazy-follow spring-arm heading damping (rotates probe on-screen without whipping background), heavy terrain bump filtering, stabilized rover look-at anchor, cozy 3/4 top-down angle (`camHeight: 0.85`, `camPitch: 0.85`, `camFov: 54°`, `camSmoothPos: 6.0`), and 1-click toggle button in Tab Kamera. |
| **Nov 2026** | Horizontal Transparent Vacuum Tank Trailer & 4-Segment Meter | Built articulated trailer cart attached to rover with horizontal crystal-clear glass capsule tank across the X-axis (100% visible from top-down / high-angle view). Left-to-right fill animation with razor-sharp sliding floater meniscus, calibration rings (25%, 50%, 75%), 4-segment deck gauge, and bumper LEDs. |
| **Nov 2026** | Layered Wheel Architecture (Zero Z-Fighting) | Completely resolved wheel and velg z-fighting flickering by removing the coplanar intersecting tread box. Built clean layered chibi wheels: dark tire cylinder, outer yellow velg hubcap with positive depth offset, and raised center axle nut for both rover and trailer wheels. |
| **Nov 2026** | Dedicated Tank Debug & Tuning Panel (Tab  Tangki) | Added 5th settings tab with quick 100%, 50%, 0% fill buttons, real-time manual fill slider, capacity, fill rate, glass opacity, glow intensity, and 6 glowing stardust color styles (Palette, Cyan, Gold, Magenta, Emerald, Amethyst). |
| **Nov 2026** | Device Handoff & GitHub Publication | Initialized clean Git repository, generated comprehensive documentation, pushed full codebase and living memory to GitHub (`https://github.com/AjiNurhakim/lunar-sweeper-3d`). |
