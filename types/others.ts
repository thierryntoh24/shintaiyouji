import { title } from "process";

export const STATUS_MESSAGES = {
  locating: {
    title: "Locating you…",
    description:
      "Please allow location access so we can calculate your true solar time.",
    instruction:
      "Accept the browser location permission prompt. We'll use a random location if access isn't granted",
  },

  syncing: {
    title: "Synchronizing clock…",
    description: "Checking network time to correct any system clock drift.",
    instruction: "This usually takes a moment.",
  },

  ready: {
    title: "Ready",
    description: "Location and time are synchronized.",
  },

  geocoding: {
    title: "Fetching location data",
    description: "Fetching additional data about your location.",
  },

  error: {
    title: "Something went wrong",
    description: "Unable to determine location or synchronize time.",
  },
};
