import {readFloat32, readUint32, readUint64} from './util';

class Feature {
  constructor(data) {
    const {type, id, node, sphere, box} = data;
    this.type = type;
    this.id = id;
    this.node = node;
    this.sphere = sphere;
    this.box = box;

    this.context = null;
  }
};

function readFeature(view) {
  const data = {};
  data.type = readUint32(view);
  data.id = readUint32(view);
  data.node = readUint32(view);
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