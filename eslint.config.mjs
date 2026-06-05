const browserGlobals = {
  AbortController: "readonly",
  Blob: "readonly",
  CSS: "readonly",
  CustomEvent: "readonly",
  Event: "readonly",
  FileReader: "readonly",
  FormData: "readonly",
  BarcodeDetector: "readonly",
  HTMLElement: "readonly",
  HTMLCanvasElement: "readonly",
  HTMLInputElement: "readonly",
  IDBKeyRange: "readonly",
  Image: "readonly",
  ImageData: "readonly",
  IntersectionObserver: "readonly",
  L: "readonly",
  MutationObserver: "readonly",
  OffscreenCanvas: "readonly",
  ResizeObserver: "readonly",
  URL: "readonly",
  URLSearchParams: "readonly",
  Worker: "readonly",
  alert: "readonly",
  atob: "readonly",
  btoa: "readonly",
  cancelAnimationFrame: "readonly",
  clearInterval: "readonly",
  clearTimeout: "readonly",
  confirm: "readonly",
  console: "readonly",
  crypto: "readonly",
  createImageBitmap: "readonly",
  devicePixelRatio: "readonly",
  document: "readonly",
  fetch: "readonly",
  history: "readonly",
  indexedDB: "readonly",
  localStorage: "readonly",
  location: "readonly",
  navigator: "readonly",
  performance: "readonly",
  prompt: "readonly",
  requestAnimationFrame: "readonly",
  screen: "readonly",
  self: "readonly",
  sessionStorage: "readonly",
  setInterval: "readonly",
  setTimeout: "readonly",
  window: "readonly"
};

const gridWildScriptGlobals = {
  GRID_SIZE_M: "readonly",
  lastFix: "writable",
  map: "readonly",
  osmtogeojson: "readonly"
};

const nodeGlobals = {
  Buffer: "readonly",
  __dirname: "readonly",
  __filename: "readonly",
  clearInterval: "readonly",
  clearTimeout: "readonly",
  console: "readonly",
  exports: "writable",
  fetch: "readonly",
  module: "writable",
  process: "readonly",
  require: "readonly",
  setInterval: "readonly",
  setTimeout: "readonly",
  URL: "readonly",
  URLSearchParams: "readonly"
};

const basicRules = {
  "no-dupe-args": "error",
  "no-dupe-keys": "error",
  "no-redeclare": ["warn", { builtinGlobals: false }],
  "no-undef": "warn"
};

export default [
  {
    ignores: [".netlify/**", "assets/**", "node_modules/**", "supabase/**", "js/unused/**"]
  },
  {
    files: ["js/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
      globals: {
        ...browserGlobals,
        ...gridWildScriptGlobals
      }
    },
    rules: basicRules
  },
  {
    files: ["netlify/functions/**/*.js", "scripts/**/*.js", "*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: nodeGlobals
    },
    rules: basicRules
  },
  {
    files: ["eslint.config.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        console: "readonly"
      }
    },
    rules: basicRules
  }
];
