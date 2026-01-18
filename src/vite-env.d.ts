/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare module '*?worker&inline' {
  const workerConstructor: {
    new (): Worker;
  };
  export default workerConstructor;
}
