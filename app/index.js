import './index.css';

import { AmbientLight, Color, DirectionalLight, Fog, PerspectiveCamera, Scene, Vector3, WebGLRenderer, Mesh, BoxBufferGeometry, MeshPhongMaterial } from 'three';
import TrackballControls from 'three-trackballcontrols';

import LodMesh from '../src/three';

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);

  controls.handleResize();
  controls.update();
  renderer.render(scene, camera);
}

var redraw = true;

function animate() {
  requestAnimationFrame(animate);

  controls.update();
  if (redraw) {
    renderer.render(scene, camera);
  }
  redraw = false;
}

const camera = new PerspectiveCamera(
  30, window.innerWidth / window.innerHeight, 0.001, 100);
camera.position.z = 3;

const scene = new Scene();

scene.fog = new Fog(0x050505, 2000, 3500);
scene.add(new AmbientLight(0xaaaaaa));
scene.background = new Color(0xaaaaaa);

const light1 = new DirectionalLight(0xffffff, 1.0);
light1.position.set(1, 1, -1);
scene.add(light1);

const light2 = new DirectionalLight(0xffffff, 1.0);
light2.position.set(-1, -1, 1);
scene.add(light2);

const renderer = new WebGLRenderer({ antialias: false });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.autoClear = false;

const container = document.getElementById('container');
container.appendChild(renderer.domElement);

const controls = new TrackballControls(camera, container);
controls.target.set(0, 0, -1);
controls.rotateSpeed = 10.0;
controls.zoomSpeed = 1.5;
controls.panSpeed = 0.8;
controls.noZoom = false;
controls.noPan = false;
controls.staticMoving = true;
controls.dynamicDampingFactor = 0.3;
controls.keys = [65, 83, 68];
controls.addEventListener('change', function () {
  redraw = true;
});

function onMeshLoad() {
  var s = 1 / lm_obj.geometry.boundingSphere.radius;
  var target = new Vector3();
  var p = lm_obj.geometry.boundingBox.getCenter(target).negate();
  lm_obj.position.set(p.x * s, p.y * s, p.y * s);
  lm_obj.scale.set(s, s, s);
  redraw = true;
}

function getURLParameter(name) {
  return decodeURIComponent((new RegExp(
    '[?|&]' + name + '=' +
    '([^&;]+?)(&|#|;|$)')
    .exec(location.search) ||
    [null, ''])[1]
    .replace(/\+/g, '%20')) ||
    null;
}

const model = getURLParameter('model') || 'assets/build.lm';

const lm_obj = new LodMesh(model, onMeshLoad, function () {
  redraw = true;
}, renderer);
scene.add(lm_obj);

window.addEventListener('resize', onWindowResize, false);

animate();