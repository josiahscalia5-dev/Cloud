// Dev lab: renders the boy on a block so his model and animation can be checked frame by frame.
// Driven from scripts (window.lab), not shipped in the app.
import * as THREE from "three";
import { Boy } from "../level1/boy.js";

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xb9c8ff);
const hemi = new THREE.HemisphereLight(0xdfe8ff, 0xb59ad6, 1.35);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0dc, 2.3);
sun.position.set(-3, 6, -5);
scene.add(sun);
const rim = new THREE.DirectionalLight(0xe0d4ff, 1.2);
rim.position.set(2, 3, 6);
scene.add(rim);

const floor = new THREE.Mesh(new THREE.BoxGeometry(6, 0.4, 30), new THREE.MeshStandardMaterial({ color: 0x7ad07a, roughness: 0.8 }));
floor.position.set(0, -0.2, 10);
scene.add(floor);
// stripes so sliding feet would be visible
for (let i = 0; i < 30; i++) {
  const s = new THREE.Mesh(new THREE.BoxGeometry(6, 0.01, 0.05), new THREE.MeshBasicMaterial({ color: 0x3a8a3a }));
  s.position.set(0, 0.002, i);
  scene.add(s);
}

const boy = new Boy();
scene.add(boy.root);
const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 200);

function size(w, h) { renderer.setSize(w, h, false); renderer.domElement.style.width = w + "px"; renderer.domElement.style.height = h + "px"; camera.aspect = w / h; camera.updateProjectionMatrix(); boy.m.inkMat.uniforms.uRes.value.set(w, h); }
size(innerWidth, innerHeight);

const lab = {
  THREE, scene, boy, camera, renderer,
  size,
  /** Orbit camera around a target: yaw 0 = behind the boy (looking along +Z). */
  cam(yawDeg = 0, pitchDeg = 12, dist = 3.2, target = boy.root.position.clone().add(new THREE.Vector3(0, 0.75, 0)), fov = 40) {
    const y = THREE.MathUtils.degToRad(yawDeg), p = THREE.MathUtils.degToRad(pitchDeg);
    camera.fov = fov; camera.updateProjectionMatrix();
    camera.position.set(target.x - Math.sin(y) * Math.cos(p) * dist, target.y + Math.sin(p) * dist, target.z - Math.cos(y) * Math.cos(p) * dist);
    camera.lookAt(target);
  },
  render() { renderer.render(scene, camera); },
  reset(yaw = 0) { boy.teleport(new THREE.Vector3(0, 0, 0), yaw); },
  /** Advance with the root moving at `v` m/s along heading `yaw` (radians). */
  run(seconds, v, yaw = 0, dt = 1 / 60) {
    for (let t = 0; t < seconds; t += dt) {
      boy.root.rotation.y = yaw;
      boy.root.position.x += Math.sin(yaw) * v * dt;
      boy.root.position.z += Math.cos(yaw) * v * dt;
      boy.update(dt);
    }
  },
  idle(seconds, dt = 1 / 60) { for (let t = 0; t < seconds; t += dt) boy.update(dt); },
  setPose(mode, t, opts) { if (boy.mode !== mode) boy.setMode(mode, opts || {}); boy.modeT = t; boy.update(1 / 60); },
};
window.lab = lab;
document.body.dataset.ready = "1";
