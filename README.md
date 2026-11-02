# SpatialMapper 3D

A browser-based tool for measuring physical spaces and reconstructing them in 3D. Scan with a webcam, upload a photo, or load a demo scene, then measure distances and volumes directly on the 3D mesh.

**Live demo:** https://YOUR-USERNAME.github.io/spatialmapper-3d/

## Features

- **Webcam and photo input:** capture a frame or upload a room photo
- **Depth-based 3D mesh:** a pseudo-depth surface generated from image luminance
- **Measurement tools:** 3D line ruler and bounding box volumes
- **AI object detection:** optional API integration, with a demo fallback
- **Render modes:** texture, depth heatmap, wireframe, point cloud
- **Units and calibration:** meters, centimeters, feet and inches, plus a scale multiplier
- **Camera presets:** 3D, top blueprint, front and side views
- **Export:** `.OBJ` mesh, `.PLY` point cloud, and a JSON measurement report

## Tech Stack

- HTML, CSS, JavaScript (no build step)
- [Three.js](https://threejs.org/) r128 + OrbitControls
- [Tailwind CSS](https://tailwindcss.com/) (CDN)
- [Font Awesome](https://fontawesome.com/) 6.4

## Project Structure

```
spatialmapper-3d/
├── index.html
├── css/
│   └── style.css
└── js/
    ├── app.js
    └── tailwind-config.js
```

## Getting Started

```bash
git clone https://github.com/YOUR-USERNAME/spatialmapper-3d.git
cd spatialmapper-3d
python -m http.server 8000
```

Then open http://localhost:8000. The webcam only works on `localhost` or HTTPS, so avoid opening `index.html` directly from the file system. An internet connection is required for the CDN libraries.

## Usage

1. **Scan & Input:** start the camera, upload a photo, or pick a demo scene.
2. **Adjust:** change the render mode, depth scale, grid density, units, and scale multiplier.
3. **Measures:** pick *Line Distance* or *3D Box*, then click points on the mesh.
4. **Export:** download the mesh, point cloud, or JSON report from the header.

**Controls:** left-drag to orbit, right-drag to pan, scroll to zoom, click the mesh to place points.

## Configuration

The AI Auto-Detect button sends the current frame to an endpoint set in `js/app.js` (`runSpatialAIAnalysis`). The default URL is a placeholder. Replace it with your own detection API, or leave it to use the built-in demo bounding boxes.

## Limitations

- Depth is estimated from image brightness, not true depth sensing, so measurements are approximate.
- For real-world accuracy, use the **Reference Scaling Multiplier** to calibrate against a known object.

## Roadmap

- Real depth estimation (e.g. a monocular depth model)
- Save and load scan sessions
- Mobile touch improvements

## License

MIT. See [LICENSE](LICENSE).