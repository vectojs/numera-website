export interface LayoutContainer {
  clientWidth: number;
  clientHeight: number;
}

/** Logical scene size comes from the owning layout box, never canvas attributes. */
export function measureSceneContainer(container: LayoutContainer): {
  width: number;
  height: number;
} {
  return {
    width: Math.max(0, container.clientWidth),
    height: Math.max(0, container.clientHeight),
  };
}
