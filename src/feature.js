import {readFloat32, readUint32, readUint64} from './util';

class Feature {
  constructor(data) {
    const {type, id, sphere, box} = data;
    this.type = type;
    this.id = id;
    this.sphere = sphere;
    this.box = box;

    this.context = null;
  }
};

function readFeature(view) {
  const data = {};
  data.type = readUint32(view);
  data.id = readUint64(view);
  data.sphere = [
    readFloat32(view), readFloat32(view), readFloat32(view), readFloat32(view)
  ];
  data.box = [
    readFloat32(view), readFloat32(view), readFloat32(view), readFloat32(view),
    readFloat32(view), readFloat32(view)
  ];
  return new Feature(data);
}

export {readFeature, Feature};