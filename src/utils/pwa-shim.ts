export function registerSW() {
  return () => {};
}

export function useRegisterSW() {
  return {
    needRefresh: [false, () => {}],
    updateServiceWorker: () => {},
  };
}
