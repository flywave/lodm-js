import Color from 'color';
import {readFloat32, readUint8, readUint16} from './util';

class Material {
  constructor(data) {
    const {type, color, opacity, mode} = data;
    this.type = type;
    this.color = color;
    this.opacity = opacity;
    this.mode = mode;
  }
};

class LambertMaterial extends Material {
  constructor(data) {
    super(data);
    const {ambient, emissive} = data;
    this.ambient = ambient;
    this.emissive = emissive;
  }
};

class PhongMaterial extends LambertMaterial {
  constructor(data) {
    super(data);
    const {specular, shininess} = data;
    this.specular = specular;
    this.shininess = shininess;
  }
};

class PbrMaterial extends Material {
  constructor(data) {
    super(data);
    const {
      metallic,
      roughness,
      reflectance,
      clearcoatThickness,
      clearcoatRoughness,
      anisotropy,
      anisotropyRotation
    } = data;
    this.metallic = metallic;
    this.roughness = roughness;
    this.reflectance = reflectance;
    this.clearcoatThickness = clearcoatThickness;
    this.clearcoatRoughness = clearcoatRoughness;
    this.anisotropy = anisotropy;
    this.anisotropyRotation = anisotropyRotation;
  }
};

const materialMap = {
  BASE: 0,
  LAMBERT: 1,
  PHONG: 2,
  PBR: 3
};


const materialMod = {
  COLOR: 1,
  TEXTURE: 2,
  BUMP: 4
};

function readMaterial(view) {
  const data = {};
  
  data.type = readUint16(view);
  data.mode = readUint16(view);

  data.color = Color.rgb(readUint8(view), readUint8(view), readUint8(view));
  data.ambient = Color.rgb(readUint8(view), readUint8(view), readUint8(view));
  data.emissive = Color.rgb(readUint8(view), readUint8(view), readUint8(view));
  data.specular = Color.rgb(readUint8(view), readUint8(view), readUint8(view));

  data.opacity = readFloat32(view);

  data.shininess = readFloat32(view);

  data.metallic = readFloat32(view);
  data.roughness = readFloat32(view);
  data.reflectance = readFloat32(view);

  data.clearcoatThickness = readFloat32(view);
  data.clearcoatRoughness = readFloat32(view);

  data.anisotropy = readFloat32(view);
  data.anisotropyRotation = readFloat32(view);

  switch (data.type) {
    case materialMap.BASE:
      return new Material(data);
    case materialMap.LAMBERT:
      return new LambertMaterial(data);
    case materialMap.PHONG:
      return new PhongMaterial(data);
    case materialMap.PBR:
      return new PbrMaterial(data);
    default:
      throw 'not support this material!';
  }
}

export {
  materialMap,
  materialMod,
  Material,
  LambertMaterial,
  PhongMaterial,
  PbrMaterial,
  readMaterial
};