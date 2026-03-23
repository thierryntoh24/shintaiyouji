/**
 * @file HomeControl.ts
 */

import maplibregl from "maplibre-gl";

/**
 * Options for the HomeControl.
 */
export interface HomeControlOptions {
  /**
   * Called when the control is clicked.
   */
  onClick: () => void;

  /**
   * Returns whether the map is currently at "home".
   */
  isActive: () => boolean;
}

/**
 * Custom MapLibre control that triggers a "fly to home" action
 * and visually indicates when the map is already at home.
 */
export class HomeControl implements maplibregl.IControl {
  private container!: HTMLDivElement;
  private button!: HTMLButtonElement;
  private map!: maplibregl.Map;

  constructor(private options: HomeControlOptions) {}

  /**
   * Called when the control is added to the map.
   */
  onAdd(map: maplibregl.Map): HTMLElement {
    this.map = map;

    this.container = document.createElement("div");
    this.container.className = "maplibregl-ctrl maplibregl-ctrl-group";

    this.button = document.createElement("button");
    this.button.type = "button";
    this.button.title = "Fly home";
    this.button.className = "flex items-center justify-center";

    this.button.innerHTML = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" id="Home--Streamline-Solar" height="16" width="16">
  <desc>
    Home Streamline Icon: https://streamlinehq.com
  </desc>
  <path fill-rule="evenodd" clip-rule="evenodd" d="M2.5192 7.82274C2 8.77128 2 9.91549 2 12.2039v1.5211c0 3.9008 0 5.8513 1.17157 7.0631C4.34315 22 6.22876 22 10 22h4c3.7712 0 5.6569 0 6.8284 -1.2119C22 19.5763 22 17.6258 22 13.725v-1.5211c0 -2.28841 0 -3.43262 -0.5192 -4.38116 -0.5192 -0.94853 -1.4677 -1.53723 -3.3648 -2.71462l-2 -1.24125C14.1106 2.62229 13.1079 2 12 2c-1.1079 0 -2.11061 0.62229 -4.11597 1.86687l-2 1.24126C3.98695 6.28551 3.0384 6.87421 2.5192 7.82274ZM9 17.25c-0.41421 0 -0.75 0.3358 -0.75 0.75s0.33579 0.75 0.75 0.75h6c0.4142 0 0.75 -0.3358 0.75 -0.75s-0.3358 -0.75 -0.75 -0.75H9Z" fill="#000000" stroke-width="1"></path>
</svg>`;

    this.button.onclick = () => {
      this.options.onClick();
      this.updateActiveState();
    };

    this.container.appendChild(this.button);

    // Update active state when map moves
    this.map.on("moveend", this.updateActiveState);

    // Initial state
    this.updateActiveState();

    return this.container;
  }

  /**
   * Called when the control is removed.
   */
  onRemove(): void {
    this.map.off("moveend", this.updateActiveState);
    this.container.remove();
  }

  /**
   * Updates the visual active state.
   */
  private updateActiveState = () => {
    const isActive = this.options.isActive();

    this.button.classList.toggle("bg-primary", isActive);
    this.button.classList.toggle("text-primary-foreground", isActive);
    this.button.classList.toggle("opacity-70", !isActive);
  };
}
