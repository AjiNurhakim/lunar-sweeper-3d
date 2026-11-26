# Laporan Analisis Proyek: Lunar Sweeper 3D

**Tanggal Analisis:** 25 November 2026  
**Status Proyek:** Prototipe Validasi Mekanik & *Game Feel* (Belum ada *Game Loop* penuh)  
**Target Platform:** Web (Desktop & Mobile — Poki Web Portal)  
**Tech Stack:** TypeScript (`5.3.3`), Three.js (`0.160.0`), Vite (`5.1.0`), Howler.js (`2.2.4` — terpasang di `package.json`, belum digunakan)

---

## 1. Ringkasan Eksekutif

Secara fondasi teknis, proyek **Lunar Sweeper 3D** memiliki **inti mekanik dan visual 3D yang sudah sangat solid** untuk tahap validasi:
- Fisika pergerakan *rover* di permukaan bola (*great-circle spherical movement*), *4-wheel slope sampling*, dan suspensi sasis berjalan baik.
- Optimasi *spatial partitioning* (`DirtSpatialGrid`) dan *custom wrap-diffuse clay shader* di `Moon.ts` memungkinkan penyapuan permukaan Detail 7 tanpa mengorbankan performa.
- Sistem kamera *Anti-Pusing* (`Comfort Mode` + *lazy-follow spring-arm*) serta animasi selang penyedot (`BaseStation.ts`) dan tangki trailer transparan (`Rover.ts`) sudah terbangun.
- Build TypeScript (`npx tsc --noEmit`) dan produksi (`npm run build`) berjalan **bersih tanpa error kompilasi**.

Namun, karena pengembangan berhenti di tengah transisi antara **"Mode Validasi Mekanik / Tuning"** menuju **"Game Loop Komersial"**, terdapat **konflik arsitektur antar sistem**, **bug logika runtime**, **kebocoran memori GPU**, serta **fitur inti game loop yang belum terhubung**.

---

## 2. Status Implementasi Fitur (Aktual vs Rencana GDD)

| Komponen / Fitur | Status Saat Ini | Catatan Teknis |
| :--- | :--- | :--- |
| **Build & TypeScript** | Berjalan (0 Error) | `tsc --noEmit` & `vite build` sukses (`dist/` ~635 KB JS). |
| **Fisika Rover & Trailer** | Berjalan | Pergerakan bola, suspensi, *articulated trailer*, dan *tire trails* (`RoverTrails.ts`) berfungsi. |
| **Penyapuan Debu 3D** | Berjalan (Parsial) | `DirtSpatialGrid` + `SweeperSystem` bekerja, namun **tidak membaca stat upgrade** dari `EconomySystem`. |
| **Base Station & Docking** | Berjalan (Parsial) | Selang penyedot & deteksi zona roket jalan, namun **belum ada animasi peluncuran roket / pad upgrade 3D**. |
| **Ekonomi & Upgrade** | **Rusak / Konflik** | UI & rumus ada di `EconomySystem.ts`, tapi **tertimpa** oleh `ConfigManager` dan diabaikan oleh `SweeperSystem`. |
| **Game Loop (Start–Clear–Next)** | **Belum Ada** | Langsung masuk gameplay + panel debug 6-tab; tidak ada *title screen*, *launch sequence*, atau *progress loop* utuh. |
| **Obstacle & Relics** | **Belum Ada** | `ObstacleManager.ts` (batu meteor, relik terkubur) yang ada di GDD belum dibuat. |
| **Audio** | Berjalan (Procedural) | Menggunakan Web Audio API di `SoundManager.ts` (bukan Howler.js). Belum ada BGM. |
| **Poki SDK** | **Belum Terhubung** | `src/sdk/PokiSDK.ts` (`PokiWrapper`) sudah ditulis tapi tidak pernah di-import di `main.ts`. |

---

## 3. Daftar Bug & Masalah Teknis yang Ditemukan

### A. Bug Kritis / Prioritas Tinggi (Merusak Gameplay & Logika)

#### 1. Konflik Upgrade `EconomySystem` vs `ConfigManager` & `SweeperSystem`
- **Upgrade tidak berefek pada penyapuan:** `SweeperSystem.ts` (baris 41 & 59) membaca `ConfigManager.current.sweeperWidth` dan `ConfigManager.current.brushPower`, **bukan** `this.rover.stats.sweeperWidth` dan `this.rover.stats.sweeperPower` yang diubah oleh `EconomySystem`. Akibatnya, membeli upgrade *Power Sikat* atau *Lebar Sikat* hanya mengubah visual roller sikat, tidak mengubah area atau kekuatan sapuan.
- **Upgrade langsung tertimpa/hilang:** `Rover.applyConfig()` (`Rover.ts` baris 164–175) menimpa `this.stats.speed`, `sweeperPower`, `sweeperWidth`, dan `tankCapacity` dengan nilai dari `ConfigManager.current`. Karena `applyConfig()` dipanggil di `loadLevel()` (`main.ts` baris 160) dan setiap kali slider tuning digeser, seluruh level upgrade pemain ter-reset setiap pindah level.
- **Power Sikat tidak mengurangi perlambatan debu:** Di `SweeperSystem.ts` baris 162, penalti kecepatan di-hardcode per tier (`0.10`, `0.50`, `0.90`) tanpa memperhitungkan `sweeperPower` (berbeda dengan deskripsi UI dan GDD).

#### 2. Bug Perhitungan Koin & Spam `localStorage` saat Unloading
- Di `main.ts` baris 198–200, `economy.unloadDust(55 * dt)` dipanggil setiap frame saat rover terhubung selang roket.
- Di `EconomySystem.ts` baris 113–117:
  - Koin dihitung dengan `Math.ceil(unloaded * 2.0)` **setiap frame**. Karena pembulatan ke atas per frame, pemain di 60 FPS atau 120 FPS mendapatkan koin jauh lebih banyak dibanding 30 FPS untuk jumlah debu yang sama, serta tidak membedakan nilai debu Tier 1, 2, dan 3.
  - `this.save()` (`localStorage.setItem`) dipanggil **setiap frame** selama proses penyedotan (~60x/detik), yang berisiko menyebabkan *micro-stutter* di browser mobile.

#### 3. Konflik Sentuhan (Touch) Virtual Joystick vs Orbit Kamera
- `InputManager.ts` (baris 48) memasang listener `touchstart` & `touchmove` pada `#canvas-container` untuk menggerakkan Virtual Joystick.
- `CameraController.ts` (baris 128) **juga** memasang listener `touchstart` & `touchmove` pada elemen yang sama (`domElement = #canvas-container`) untuk memutar kamera (`yawOffset` & `pitchOffset`).
- **Dampak:** Di perangkat mobile/tablet, menggeser 1 jari untuk menyetir rover akan memutar kamera secara bersamaan, membuat kontrol sentuh tidak nyaman/sulit dikendalikan.

#### 4. Tabung Kaca 3D Tidak Berisi Saat Debug `setDust()` / Slider Tangki
- Di `Rover.ts` baris 1316–1326, `setDust(amount)` hanya mengubah `this.stats.currentDust` dan hanya mengosongkan `cart.tier1Dust/2/3` jika `currentDust <= 0.0001`.
- Saat tombol debug **50%**, **100%**, atau slider tangki di Tab Tangki (`HUD.ts` baris 431–465) digunakan, `tier1Dust`/`tier2Dust`/`tier3Dust` dan `layerOrder` pada cart tetap `0`. Akibatnya HUD menunjukkan 50%/100%, tetapi **visual debu di dalam tabung kaca 3D trailer tetap kosong**.
- Masalah serupa terjadi di `Rover.rebuildCarts()` (`Rover.ts` baris 764–786): mengubah jumlah cart atau skala tangki mereset seluruh `trailerCarts` menjadi kosong tanpa menyinkronkan ulang `stats.currentDust`.

---

### B. Bug Menengah (UI, Kontrol, & Performa/Memori)

#### 5. Dua Tab Pengaturan Muncul Bertumpuk Saat Awal Dibuka
- Di `index.html` baris 85, `#tab-upgrade` memiliki class `tab-pane active`.
- Namun di `index.html` baris 121, `#tab-probe` tertulis `<div id="tab-probe" class="tab-pane">` **tanpa class `hidden`** (berbeda dengan `#tab-camera`, `#tab-moon`, `#tab-tank`, `#tab-save` yang semuanya punya `hidden`).
- **Dampak:** Saat game pertama kali dibuka, konten Tab **Upgrade** dan Tab **Probe** tampil menumpuk bersamaan di panel kanan sampai pengguna mengklik salah satu tab.

#### 6. Kebocoran Memori GPU (WebGL Resource Leak) & GC Pressure
- **`Rover.rebuildCarts()` (`Rover.ts` baris 768–773):** Menghapus `cart.pivotGroup` dari parent tanpa memanggil `.dispose()` pada Geometry maupun Material yang dibuat di `buildSingleCart()`. Mengubah slider `cartCount`, `tankScale`, atau `tankLength` berulang kali membocorkan memori WebGL.
- **`BaseStation.update()` (`BaseStation.ts` baris 862–867):** Membuat 2 `new THREE.TubeGeometry(...)` **setiap frame** saat selang aktif terhubung (walaupun yang lama di-dispose, alokasi ~120 geometri/detik memicu beban *Garbage Collector* di mobile).

#### 7. Tombol Keyboard "Nyangkut" (*Stuck Key*) Saat Kehilangan Fokus
- `InputManager.ts` tidak memiliki listener `window.addEventListener('blur', ...)` atau `visibilitychange` untuk mereset `forward`, `backward`, `left`, `right` ke `false`. Jika pemain menahan tombol `W` lalu berpindah tab atau klik di luar jendela, rover terus melaju sendiri.

#### 8. Inkonsistensi `Moon.ts` & Banner Kemenangan (`HUD.ts`)
- **Duplikasi Palet:** Di `MOON_PALETTES` (`Moon.ts` baris 39 & 116, serta 83 & 160), palet `Crimson Mars` dan `Glacial Arctica` tertulis ganda.
- **`refillDirt()` menimpa Landing Pad:** `Moon.refillDirt()` (`Moon.ts` baris 1079–1092) mengisi `1.0` ke **seluruh** vertex termasuk area North Pole Landing Pad di bawah roket, dan memanggil `computeVertexNormals()` di CPU pada mesh Detail 7.
- **Victory Banner Prematur:** Di `HUD.ts` baris 933–943, ketika `cleanPct >= 98.0`, banner *"LEVEL SELESAI! Seluruh debu telah disetor ke roket"* langsung muncul di tengah jalan, meskipun tangki rover masih penuh dan pemain belum kembali ke roket (selain itu threshold di GDD adalah `85%`, bukan `98%`).

#### 9. Aset/Dependensi Tidak Terpakai & Dead Code
- `package.json` menyertakan `howler` dan `@types/howler`, tetapi `SoundManager.ts` tidak menggunakannya.
- `src/sdk/PokiSDK.ts` (`PokiWrapper`) belum diintegrasikan sama sekali.
- `BaseStation.ts` memiliki beberapa property/method yang tidak terpakai atau setengah jadi (misalnya kontrol suara mesin `engineOsc` / `engineGain` di `SoundManager.ts` tidak pernah di-trigger).

---

## 4. Evaluasi Kesiapan Menuju Game Loop Utuh

Karena proyek ini baru sebatas **validasi mekanik**, berikut celah utama yang harus dijembatani jika ingin melanjutkan ke versi game utuh:

1. **Pemisahan Mode Debug vs Mode Gameplay:** Panel 6-tab (`Probe`, `Kamera`, `Bulan`, `Tangki`, `JSON`) saat ini menyatu dengan UI utama dan bersaing dengan sistem *Upgrade*. Sebaiknya panel tuning dipindah ke *dev toggle* (misal tombol/flag `?debug=1`) agar HUD gameplay bersih.
2. **Penyatuan Sumber Kebenaran Stat Rover (*Single Source of Truth*):** Pisahkan dengan jelas antara *base config* (`ConfigManager`) dan *runtime progression stats* (`EconomySystem`), lalu pastikan `SweeperSystem` membaca dari `rover.stats` (bukan langsung `ConfigManager`).
3. **Alur Transisi Level (*Launch Flow*):** Tambahkan state machine sederhana (`PLAYING` -> `READY_TO_LAUNCH` -> `LAUNCHING_ANIMATION` -> `NEXT_MOON`) agar kemenangan tidak hanya memunculkan banner statis di tengah layar.
4. **Hapus atau Integrasikan Komponen Menggantung:** Putuskan apakah tetap memakai Web Audio API (hapus `howler` dari `package.json` untuk memperkecil proyek) dan kapan menyambungkan `PokiWrapper`.

---

## 5. Rekomendasi Urutan Perbaikan (Roadmap Singkat)

1. **Fase 1 — Perbaikan Bug Cepat (Quick Wins):**
   - Tambahkan class `hidden` pada `#tab-probe` di `index.html`.
   - Tambahkan reset input pada event `blur` di `InputManager.ts`, dan pisahkan area/kondisi *touch* antara `InputManager` (joystick) dan `CameraController` (orbit).
   - Perbaiki `Rover.setDust()` agar mengisi `tier1Dust` & `layerOrder` sehingga visual tabung 3D sinkron dengan HUD.
   - Hapus duplikat palet di `Moon.ts`.
2. **Fase 2 — Perbaikan Arsitektur Sistem:**
   - Ubah `SweeperSystem` agar membaca `rover.stats.sweeperWidth` dan `rover.stats.sweeperPower` (termasuk pengurangan slowdown penalty).
   - Perbaiki `Rover.applyConfig()` agar tidak menimpa stat hasil upgrade dari `EconomySystem`.
   - Perbaiki `EconomySystem.unloadDust()` (akumulator koin per tier tanpa `Math.ceil` per frame, dan `save()` hanya saat selesai setor / berkala).
   - Tambahkan `.dispose()` pada `Rover.rebuildCarts()` dan optimasi `TubeGeometry` di `BaseStation.ts`.
3. **Fase 3 — Membangun Game Loop:**
   - Implementasi *State Machine* (`GameState`), animasi peluncuran roket, *obstacle* (`ObstacleManager`), dan integrasi `PokiWrapper`.
