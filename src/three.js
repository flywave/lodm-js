import {Box3, BufferAttribute, BufferGeometry, DataTexture, Mesh, MeshBasicMaterial, MeshLambertMaterial, MeshPhongMaterial, MeshPhysicalMaterial, RGBFormat, Sphere, Vector2, Vector3, VertexColors} from 'three';

import {refreshCache, Renderable} from './control';
import {LambertMaterial, Material, materialMod, PbrMaterial, PhongMaterial} from './material';

function convertMaterial(m) {
  const texture = new DataTexture(new Uint8Array([1, 1, 1]), 1, 1, RGBFormat);
  texture.needsUpdate = true;

  if (m instanceof PhongMaterial) {
    let ret = null;
    if (m.mode & materialMod.TEXTURE) {
      ret = new MeshPhongMaterial({
        color: m.color.hex(),
        opacity: m.opacity,
        specular: m.specular.hex(),
        shininess: m.shininess,
        map: texture
      });
    } else {
      ret = new MeshPhongMaterial({
        color: m.color.hex(),
        opacity: m.opacity,
        specular: m.specular.hex(),
        shininess: m.shininess,
      });
    }
    return ret;
  } else if (m instanceof LambertMaterial) {
    let ret = null;
    if (m.mode & materialMod.TEXTURE) {
      ret = new MeshLambertMaterial({
        color: m.color.hex(),
        opacity: m.opacity,
        emissive: m.emissive.hex(),
        map: texture
      });
    } else {
      ret = new MeshLambertMaterial({
        color: m.color.hex(),
        opacity: m.opacity,
        emissive: m.emissive.hex(),
      });
    }
    return ret;
  } else if (m instanceof PbrMaterial) {
    let ret = null;
    if (m.mode & materialMod.TEXTURE) {
      ret = new MeshPhysicalMaterial({
        color: m.color.hex(),
        opacity: m.opacity,
        roughness: m.roughness,
        metalness: m.metallic,
        reflectivity: m.reflectance,
        clearCoat: m.clearcoatThickness,
        clearCoatRoughness: m.clearcoatRoughness,
        map: texture
      });
    } else {
      ret = new MeshPhysicalMaterial({
        color: m.color.hex(),
        opacity: m.opacity,
        roughness: m.roughness,
        metalness: m.metallic,
        reflectivity: m.reflectance,
        clearCoat: m.clearcoatThickness,
        clearCoatRoughness: m.clearcoatRoughness,
      });
    }
    return ret;
  } else if (m instanceof Material) {
    let ret = null;
    if (m.mode & materialMod.TEXTURE) {
      ret = new MeshBasicMaterial(
          {color: m.color.hex(), opacity: m.opacity, map: texture});
    } else {
      ret = new MeshBasicMaterial({
        color: m.color.hex(),
        opacity: m.opacity,
      });
    }
    return ret;
  } else
    throw 'material error!';
}

function cacheMaterialAttr(m, context) {
  if (m.program === undefined) return;
  const program = m.program.program;
  if (m instanceof MeshBasicMaterial) {
    m.attr = {
      viewMatrix: context.getUniformLocation(program, 'viewMatrix'),
      modelViewMatrix: context.getUniformLocation(program, 'modelViewMatrix'),
      normalMatrix: context.getUniformLocation(program, 'normalMatrix'),
      modelMatrix: context.getUniformLocation(program, 'modelMatrix'),
      uvTransform: context.getUniformLocation(program, 'uvTransform'),
      position: context.getAttribLocation(program, 'position'),
      normal: context.getAttribLocation(program, 'normal'),
      color: context.getUniformLocation(program, 'diffuse'),
      uv: context.getAttribLocation(program, 'uv'),
      size: context.getUniformLocation(program, 'size'),
      map: context.getUniformLocation(program, 'map'),
      opacity: context.getUniformLocation(program, 'opacity'),
    };
  } else if (m instanceof MeshPhysicalMaterial) {
    m.attr = {
      viewMatrix: context.getUniformLocation(program, 'viewMatrix'),
      modelViewMatrix: context.getUniformLocation(program, 'modelViewMatrix'),
      normalMatrix: context.getUniformLocation(program, 'normalMatrix'),
      modelMatrix: context.getUniformLocation(program, 'modelMatrix'),
      uvTransform: context.getUniformLocation(program, 'uvTransform'),
      position: context.getAttribLocation(program, 'position'),
      normal: context.getAttribLocation(program, 'normal'),
      color: context.getUniformLocation(program, 'diffuse'),
      uv: context.getAttribLocation(program, 'uv'),
      size: context.getUniformLocation(program, 'size'),
      map: context.getUniformLocation(program, 'map'),
      roughness: context.getUniformLocation(program, 'roughness'),
      metalness: context.getUniformLocation(program, 'metalness'),
      reflectivity: context.getUniformLocation(program, 'reflectivity'),
      clearCoat: context.getUniformLocation(program, 'clearCoat'),
      clearCoatRoughness:
          context.getUniformLocation(program, 'clearCoatRoughness'),
    };
  } else if (m instanceof MeshLambertMaterial) {
    m.attr = {
      viewMatrix: context.getUniformLocation(program, 'viewMatrix'),
      modelViewMatrix: context.getUniformLocation(program, 'modelViewMatrix'),
      normalMatrix: context.getUniformLocation(program, 'normalMatrix'),
      modelMatrix: context.getUniformLocation(program, 'modelMatrix'),
      uvTransform: context.getUniformLocation(program, 'uvTransform'),
      position: context.getAttribLocation(program, 'position'),
      normal: context.getAttribLocation(program, 'normal'),
      color: context.getUniformLocation(program, 'diffuse'),
      uv: context.getAttribLocation(program, 'uv'),
      size: context.getUniformLocation(program, 'size'),
      map: context.getUniformLocation(program, 'map'),
      emissive: context.getUniformLocation(program, 'emissive'),
      opacity: context.getUniformLocation(program, 'opacity'),
    };
  } else if (m instanceof MeshPhongMaterial) {
    m.attr = {
      viewMatrix: context.getUniformLocation(program, 'viewMatrix'),
      modelViewMatrix: context.getUniformLocation(program, 'modelViewMatrix'),
      normalMatrix: context.getUniformLocation(program, 'normalMatrix'),
      modelMatrix: context.getUniformLocation(program, 'modelMatrix'),
      uvTransform: context.getUniformLocation(program, 'uvTransform'),
      position: context.getAttribLocation(program, 'position'),
      normal: context.getAttribLocation(program, 'normal'),
      color: context.getUniformLocation(program, 'diffuse'),
      uv: context.getAttribLocation(program, 'uv'),
      size: context.getUniformLocation(program, 'size'),
      map: context.getUniformLocation(program, 'map'),
      emissive: context.getUniformLocation(program, 'emissive'),
      specular: context.getUniformLocation(program, 'specular'),
      shininess: context.getUniformLocation(program, 'shininess'),
      opacity: context.getUniformLocation(program, 'opacity'),
    };
  }

  return m.attr;
}

function MultiMaterial(materials) {
  if (materials === undefined) materials = [];

  materials.isMultiMaterial = true;
  materials.materials = materials;
  materials.clone = function() {
    return materials.slice();
  };
  materials.needsUpdate = true;

  return materials;
}

export default class LodMesh extends Mesh {
  constructor(url, onLoad, onUpdate, renderer, material) {
    if (onLoad !== null && typeof (onLoad) === 'object')
      throw 'constructor error.';

    const gl = renderer.context;
    const geometry = new BufferGeometry();

    geometry.center = function() {
      throw 'unsupported!';
    };

    const positions = new Float32Array(3);
    geometry.addAttribute('position', new BufferAttribute(positions, 3));

    super(geometry, undefined);

    if (!material) this.autoMaterial = true;

    this.frustumCulled = false;

    const mesh = this;
    const instance = this.instance = new Renderable(gl);
    instance.open(url);
    instance.onLoad = function() {
      const c = instance.mesh.sphere.center;
      const center = new Vector3(c[0], c[1], c[2]);
      const {radius} = instance.mesh.sphere;

      geometry.boundingSphere = new Sphere(center, radius);
      geometry.boundingBox = mesh.computeBoundingBox();

      let materials = MultiMaterial();

      const mtl_geometry = new BufferGeometry();

      let mtl_mesh = new Mesh(mtl_geometry, materials);
      mtl_mesh.renderOrder = -100;

      let baseMaterial = null;

      if (mesh.autoMaterial)
        baseMaterial = new MeshLambertMaterial({color: 0x836FFF});
      else
        baseMaterial = mesh.material;

      if (this.mesh.vertex.normal) {
        const normals = new Float32Array(3);
        geometry.addAttribute('normal', new BufferAttribute(normals, 3));
      }

      if (this.mesh.vertex.color) {
        const colors = new Float32Array(4);
        geometry.addAttribute('color', new BufferAttribute(colors, 4));
        if (mesh.autoMaterial)
          baseMaterial = new MeshLambertMaterial({vertexColors: VertexColors});
      }

      if (this.mesh.vertex.texCoord) {
        const uv = new Float32Array(2);
        geometry.addAttribute('uv', new BufferAttribute(uv, 2));
        if (mesh.autoMaterial) {
          const texture =
              new DataTexture(new Uint8Array([1, 1, 1]), 1, 1, RGBFormat);
          texture.needsUpdate = true;
          baseMaterial =
              new MeshLambertMaterial({color: 0xffffff, map: texture});
        }
      }

      materials.push(baseMaterial);
      mtl_geometry.addGroup(0, 0, 0);

      for (let i = 0; i < instance.mesh.materialsCount; i++) {
        mtl_geometry.addGroup(0, 0, i + 1);
        materials.push(convertMaterial(instance.mesh.materials[i]));
      }

      mesh._mtl_inited = false;
      mesh.mtl_mesh = mtl_mesh;
      mesh.add(mtl_mesh);

      if (onLoad) onLoad();
    };
    instance.onUpdate = onUpdate;

    this.onAfterRender = function(
        renderer_,
        scene,
        camera,
        geometry,
        material,
        group,
    ) {
      if (!instance.isReady) return;
      let s = new Vector2();
      s = renderer_.getSize(s);
      instance.updateView(
          [0, 0, s.width, s.height],
          camera.projectionMatrix.elements,
          mesh.modelViewMatrix.elements,
      );

      const module = this;
      const mtl_mesh = this.mtl_mesh;

      if (!mesh._mtl_inited) {
        mesh._mtl_inited = true;
        mesh.remove(mtl_mesh);
      }

      instance.useMaterial = (m) => {
        let mtl = null;

        if (m != -1) {
          mtl = mtl_mesh.material[m + 1];
        } else {
          mtl = mtl_mesh.material[0];
        }

        renderer_.context.useProgram(mtl.program.program);

        if (mtl.attr === undefined) {
          cacheMaterialAttr(mtl, renderer_.context);
        }

        module.updateMatrixWorld(true);
        module.modelViewMatrix.multiplyMatrices(
            camera.matrixWorldInverse, module.matrixWorld);

        if (mtl.attr.viewMatrix !== null) {
          gl.uniformMatrix4fv(
              mtl.attr.viewMatrix, false, camera.matrixWorldInverse.toArray());
        }

        if (mtl.attr.modelViewMatrix !== null) {
          gl.uniformMatrix4fv(
              mtl.attr.modelViewMatrix, false, module.modelViewMatrix.elements);
        }

        if (mtl.attr.normalMatrix !== null) {
          gl.uniformMatrix3fv(
              mtl.attr.normalMatrix, false, module.normalMatrix.elements);
        }

        if (mtl.attr.modelMatrix !== null) {
          gl.uniformMatrix4fv(
              mtl.attr.modelMatrix, false, module.matrixWorld.elements);
        }

        if (mtl.color && mtl.attr.color !== null) {
          gl.uniform3f(mtl.attr.color, mtl.color.r, mtl.color.g, mtl.color.b);
        }

        if (mtl.emissive && mtl.attr.emissive !== null) {
          gl.uniform3f(
              mtl.attr.emissive, mtl.emissive.r, mtl.emissive.g,
              mtl.emissive.b);
        }

        if (mtl.specular && mtl.attr.specular !== null) {
          gl.uniform3f(
              mtl.attr.specular, mtl.specular.r, mtl.specular.g,
              mtl.specular.b);
        }

        if (mtl.shininess && mtl.attr.shininess !== null) {
          gl.uniform1f(mtl.attr.shininess, mtl.shininess);
        }

        if (mtl.opacity && mtl.attr.opacity !== null) {
          gl.uniform1f(mtl.attr.opacity, mtl.opacity);
        }

        if (mtl.roughness && mtl.attr.roughness !== null) {
          gl.uniform1f(mtl.attr.roughness, mtl.roughness);
        }

        if (mtl.metalness && mtl.attr.metalness !== null) {
          gl.uniform1f(mtl.attr.metalness, mtl.metalness);
        }

        if (mtl.clearCoat && mtl.attr.clearCoat !== null) {
          gl.uniform1f(mtl.attr.clearCoat, mtl.clearCoat);
        }

        if (mtl.clearCoatRoughness && mtl.attr.clearCoatRoughness !== null) {
          gl.uniform1f(mtl.attr.clearCoatRoughness, mtl.clearCoatRoughness);
        }

        return mtl;
      };

      instance.attributes = instance.useMaterial(-1).attr;
      instance.mode = instance.attributes.size ? 'POINT' : 'FACE';

      instance.render();

      if (module.material.program !== undefined) {
        renderer_.context.useProgram(module.material.program.program);
      }

      refreshCache(renderer_.context);
    };
  }

  computeBoundingBox() {
    const {instance} = this;
    const lodm = instance.mesh;
    if (!lodm.sphere) return null;


    const min = new Vector3(+Infinity, +Infinity, +Infinity);
    const max = new Vector3(-Infinity, -Infinity, -Infinity);

    const array = new Float32Array(lodm.sink - 1);

    const count = 0;
    for (let i = 0; i < lodm.sink; i++) {
      const patch = lodm.nfirstpatch[i];
      if (lodm.patches[patch * 4] !== lodm.sink) continue;
      const x = lodm.nspheres[i * 5];
      const y = lodm.nspheres[i * 5 + 1];
      const z = lodm.nspheres[i * 5 + 2];
      const r = lodm.nspheres[i * 5 + 4];
      if (x - r < min.x) min.x = x - r;
      if (y - r < min.y) min.y = y - r;
      if (z - r < min.z) min.z = z - r;
      if (x - r > max.x) max.x = x + r;
      if (y - r > max.y) max.y = y + r;
      if (z - r > max.z) max.z = z + r;
    }
    return new Box3(min, max);
  }

  raycast(raycaster, intersects) {
    const {instance} = this;
    const lodm = instance.mesh;
    if (!lodm.sphere) return;
    const sp = lodm.sphere;
    const c = sp.center;
    const center = new Vector3(c[0], c[1], c[2]);
    const sphere = new Sphere(center, sp.radius);
    sphere.applyMatrix4(this.matrixWorld);

    if (raycaster.ray.intersectsSphere(sphere) === false) return;

    if (!lodm.sink) return;

    let distance = -1.0;
    for (let i = 0; i < lodm.sink; i++) {
      const patch = lodm.nfirstpatch[i];
      if (lodm.patches[patch * 4] !== lodm.sink) continue;
      const x = lodm.nspheres[i * 5];
      const y = lodm.nspheres[i * 5 + 1];
      const z = lodm.nspheres[i * 5 + 2];
      const r = lodm.nspheres[i * 5 + 4];
      const sphere1 = new Sphere(new Vector3(x, y, z), r);
      sphere1.applyMatrix4(this.matrixWorld);
      if (raycaster.ray.intersectsSphere(sphere1) !== false) {
        const d = sphere1.center.lengthSq();
        if (distance === -1.0 || d < distance) distance = d;
      }
    }
    if (distance === -1.0) return;

    intersects.push({distance, object: this});
  }
}
