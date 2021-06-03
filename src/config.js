const glP = WebGLRenderingContext.prototype;

const attrGlMap = [
  glP.NONE,
  glP.BYTE,
  glP.UNSIGNED_BYTE,
  glP.SHORT,
  glP.UNSIGNED_SHORT,
  glP.INT,
  glP.UNSIGNED_INT,
  glP.FLOAT,
  glP.DOUBLE,
];
const attrSizeMap = [0, 1, 1, 2, 2, 4, 4, 4, 8];

const targetError = 2.0;
const targetFps = 15;
const maxPending = 3;
const maxBlocked = 3;
const maxReqAttempt = 2;
const maxCacheSize = 512 * (1 << 20);
const drawBudget = 5 * (1 << 20);

const Debug = {
  nodes: false,
  draw: false,
};

const config = {
  padding: 256,
  nodeSize: 44,
  instanceSize: 72,
  patchSize: 20,
  textureSize: 40,
  materialSize: 52,
  featureSize: 56,
  magic: 0x6D6C7766,
  attrGlMap,
  attrSizeMap,
  targetError,
  targetFps,
  maxPending,
  maxBlocked,
  maxReqAttempt,
  maxCacheSize,
  drawBudget,
  debug: Debug,
};

export default config;
