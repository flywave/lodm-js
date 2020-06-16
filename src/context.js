import config from './config';

const contexts = [];

function getContext(gl) {
  let c = null;
  if (!gl.isTexture) throw 'wrong';
  contexts.forEach((g) => {
    if (g.gl === gl) c = g;
  });
  if (c) return c;
  c = {
    gl,
    meshes: [],
    frame: 0,
    cacheSize: 0,
    candidates: [],
    pending: 0,
    targetFps: config.targetFps,
    targetError: config.targetError,
    currentError: config.targetError,
  };
  contexts.push(c);
  return c;
}

export {contexts, getContext};
