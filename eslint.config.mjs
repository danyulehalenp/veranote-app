import js from "@eslint/js";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import reactHooksPlugin from "eslint-plugin-react-hooks";

const browserGlobals = {
  AbortController: "readonly",
  AbortSignal: "readonly",
  Blob: "readonly",
  CustomEvent: "readonly",
  DOMException: "readonly",
  Event: "readonly",
  EventListener: "readonly",
  EventSource: "readonly",
  File: "readonly",
  FormData: "readonly",
  Headers: "readonly",
  HTMLButtonElement: "readonly",
  HTMLDivElement: "readonly",
  HTMLDetailsElement: "readonly",
  HTMLElement: "readonly",
  HTMLFormElement: "readonly",
  HTMLInputElement: "readonly",
  HTMLSelectElement: "readonly",
  HTMLTextAreaElement: "readonly",
  MediaRecorder: "readonly",
  MediaStream: "readonly",
  MediaStreamConstraints: "readonly",
  MessageEvent: "readonly",
  MouseEvent: "readonly",
  PointerEvent: "readonly",
  React: "readonly",
  Request: "readonly",
  RequestInfo: "readonly",
  RequestInit: "readonly",
  Response: "readonly",
  ScrollIntoViewOptions: "readonly",
  Storage: "readonly",
  TextEncoder: "readonly",
  URL: "readonly",
  URLSearchParams: "readonly",
  Window: "readonly",
  btoa: "readonly",
  clearTimeout: "readonly",
  console: "readonly",
  crypto: "readonly",
  document: "readonly",
  fetch: "readonly",
  localStorage: "readonly",
  navigator: "readonly",
  requestAnimationFrame: "readonly",
  structuredClone: "readonly",
  setInterval: "readonly",
  setTimeout: "readonly",
  clearInterval: "readonly",
  window: "readonly"
};

const nodeGlobals = {
  AbortController: "readonly",
  AbortSignal: "readonly",
  Buffer: "readonly",
  NodeJS: "readonly",
  ReadableStream: "readonly",
  TextEncoder: "readonly",
  URL: "readonly",
  __dirname: "readonly",
  clearTimeout: "readonly",
  console: "readonly",
  crypto: "readonly",
  fetch: "readonly",
  module: "readonly",
  process: "readonly",
  require: "readonly",
  setInterval: "readonly",
  clearInterval: "readonly",
  setTimeout: "readonly"
};

const testGlobals = {
  afterAll: "readonly",
  afterEach: "readonly",
  beforeAll: "readonly",
  beforeEach: "readonly",
  describe: "readonly",
  expect: "readonly",
  it: "readonly",
  test: "readonly",
  vi: "readonly"
};

export default [
  js.configs.recommended,
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "dist/**",
      "coverage/**",
      "desktop-overlay/dist/**",
      "marketing-site/.next/**",
      "test-results/**",
      ".tmp-*/**",
      "lib/note/generate-notes.js"
    ]
  },
  {
    files: ["**/*.{js,jsx,mjs,ts,tsx}"],
    languageOptions: {
      globals: {
        ...browserGlobals,
        ...nodeGlobals,
        ...testGlobals
      }
    },
    plugins: {
      "react-hooks": reactHooksPlugin
    },
    rules: {
      "no-constant-binary-expression": "off",
      "no-constant-condition": "off",
      "no-control-regex": "off",
      "no-unused-vars": "off",
      "no-useless-assignment": "off",
      "no-useless-escape": "off",
      "preserve-caught-error": "off"
    }
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: {
          jsx: true
        },
        sourceType: "module"
      }
    },
    plugins: {
      "@typescript-eslint": tsPlugin
    },
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["warn", {
        argsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
        varsIgnorePattern: "^_"
      }]
    }
  }
];
