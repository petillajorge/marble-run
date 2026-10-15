# 3D Marble Run Simulator & Builder

An interactive 3D Marble Run simulator and custom track builder built with **Three.js**, **Rapier3D physics (WASM)**, and **TypeScript**.

Play directly in your browser with real-time rigid body dynamics, customizable marbles, custom track pieces (loops, funnels, curves, splitters), and race modes!

---

## 🌟 Features

- **Interactive 3D Track Builder**: Drag and drop track pieces, rotate, adjust, and construct custom marble runs.
- **Realistic WASM Physics**: Powered by `@dimforge/rapier3d-compat` for high-performance 3D rigid body collisions, gravity, friction, and continuous contact detection.
- **Multiple Track Pieces**:
  - Start & Finish Gates with animated releasing barriers
  - Straights, Slopes (Up/Down), 90° Curves
  - 360° Vertical Loops & Funnel Bowls
  - Dynamic Splitter Paddles & Geometry Splitters
- **Marble Customization**: Customize marble primary/secondary colors and patterns (Stripes, Polka Dots, Swirls, Solid).
- **Race Mode & AI Competitors**: Race player marble against AI marbles with live leaderboard, automatic finish detection, and victory celebrations.
- **Dynamic Camera Controls**: Leader camera, player-focused camera, free orbit controls, and marble switcher.
- **Save / Load / Export / Import**: Save tracks locally to browser storage or export/import track configurations as JSON.

---

## 🛠️ Tech Stack

- **3D Engine**: [Three.js](https://threejs.org/)
- **Physics Engine**: [Rapier.js WASM (@dimforge/rapier3d-compat)](https://rapier.rs/)
- **Build Tool**: [Vite](https://vitejs.dev/)
- **Language**: TypeScript
- **Styling**: Tailwind CSS

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- `npm`

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/username/3d-marble-run.git
   cd 3d-marble-run
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run development server:
   ```bash
   npm run dev
   ```

4. Open `http://localhost:5173` in your browser.

---

## 📦 Building and Deployment

To generate static production files for deployment (e.g., GitHub Pages):

```bash
npm run build
```

To preview the production build locally:

```bash
npm run preview
```

### GitHub Pages Deployment

This repository includes a GitHub Actions workflow (`.github/workflows/deploy.yml`) that automatically builds and deploys the app to GitHub Pages whenever changes are pushed to the `main` branch.

---

## 🎮 How to Play

1. **Builder Mode**:
   - Select track pieces from the left panel to place them on the grid.
   - Click a placed piece to drag it, rotate it (+90° / -90°), or delete it.
   - Load pre-made preset tracks using the **Preset 1** or **Preset 2** buttons.
2. **Race Mode**:
   - Switch to **Race Mode** using the top menu.
   - Customize your marble's colors and patterns.
   - Click **Start Race** to trigger the countdown and open the start gate!
   - Watch the race with the leader camera or switch camera modes using the HUD.

---

## 📄 License

MIT
