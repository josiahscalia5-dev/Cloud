// Third-person camera, framed like the reference screens: behind and above the boy, looking down
// the course, so he runs in the lower half of the screen while the platforms lead up and away into
// the world. It follows the course's heading (not the boy's facing), so when he turns left or right
// you see him turn, and it eases round the curves of the roads with him.
import * as THREE from "three";

const angleWrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export const CAM = { back: 6.3, up: 3.35, ahead: 9, lookUp: -0.25, lateral: 0.62, fov: 56 };

export class FollowCam {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0;
    this.ground = 0;
    this.focus = new THREE.Vector3();
    this.pos = new THREE.Vector3();
    this.first = true;
  }

  /**
   * boy: world position of his feet; ground: height of the surface he is on;
   * heading: yaw of the course here; center: course centre line near him; falling: stop following down.
   */
  update(dt, { boy, ground, heading, center, falling }) {
    const k = (rate) => (this.first ? 1 : 1 - Math.exp(-dt * rate));
    this.yaw += angleWrap(heading - this.yaw) * k(2.6);
    if (!falling) this.ground += (ground - this.ground) * k(3.2);
    const F = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const R = new THREE.Vector3(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
    // follow most of his sideways offset from the course centre, so lane changes show on screen
    const off = new THREE.Vector3().subVectors(boy, center);
    const lat = off.dot(R), along = off.dot(F);
    const focus = center.clone().addScaledVector(R, lat * CAM.lateral).addScaledVector(F, along);
    focus.y = this.ground;
    this.focus.lerp(focus, k(7));
    if (this.first) this.focus.copy(focus);
    const want = this.focus.clone().addScaledVector(F, -CAM.back).add(new THREE.Vector3(0, CAM.up, 0));
    this.pos.lerp(want, k(6));
    if (this.first) this.pos.copy(want);
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.focus.clone().addScaledVector(F, CAM.ahead).add(new THREE.Vector3(0, CAM.lookUp, 0)));
    this.first = false;
  }

  snap() { this.first = true; }
}
