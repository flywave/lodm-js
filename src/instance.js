import {readFloat32, readUint32} from './util';

class Instance {
    constructor(data) {
      const {node, id, mat4} = data;
      this.node = node;
      this.id = id;
      this.mat4 = mat4;
  
      this.context = null;
    }
  };
  
  function readInstance(view) {
    const data = {};
    data.node = readUint32(view);
    data.id = readUint32(view);
    data.mat4 = [
      readFloat32(view), readFloat32(view), readFloat32(view), readFloat32(view),
      readFloat32(view), readFloat32(view), readFloat32(view), readFloat32(view),
      readFloat32(view), readFloat32(view), readFloat32(view), readFloat32(view),
      readFloat32(view), readFloat32(view), readFloat32(view), readFloat32(view)
    ];
    return new Instance(data);
  }
  
  export {readInstance, Instance};