import { useState, useEffect } from "react";

// Define the return type for the hook
interface MediaQueries {
  isDesktopOrLaptop: boolean;
  isBigScreen: boolean;
  isTabletOrMobile: boolean;
  isTablet: boolean;
  isMobile: boolean;
  isPortrait: boolean;
  isLandscape: boolean;
  isRetina: boolean;
}

/**
 * Custom hook to get device/media state. \
 * Returns various screen states such as mobile/tablet/desktop and orientation.
 * @usage
 * ```js
 *const {
     isMobile,
     isTablet,
     isDesktopOrLaptop,
     isPortrait,
     isLandscape,
     isBigScreen,
     isRetina,
     isTabletOrMobile,
  } = useMediaQueries();
    ```
 */
export function useMediaQueries(): MediaQueries {
  const [media, setMedia] = useState<MediaQueries>({
    isMobile: false,
    isTablet: false,
    isTabletOrMobile: false,
    isDesktopOrLaptop: false,
    isBigScreen: false,
    isPortrait: false,
    isLandscape: false,
    isRetina: false,
  });

  useEffect(() => {
    const updateMedia = () => {
      const width = window.innerWidth;
      const isPortrait = window.matchMedia("(orientation: portrait)").matches;
      const isLandscape = window.matchMedia("(orientation: landscape)").matches;
      const isRetina = window.matchMedia(
        "(min-resolution: 2dppx), (min-resolution: 192dpi)",
      ).matches;

      setMedia({
        isMobile: width <= 768,
        isTablet: width > 768 && width <= 1224,
        isTabletOrMobile: width < 1224,
        isDesktopOrLaptop: width > 1224,
        isBigScreen: width > 1824,
        isPortrait,
        isLandscape,
        isRetina,
      });
    };

    updateMedia(); // Set initial state
    window.addEventListener("resize", updateMedia);
    return () => window.removeEventListener("resize", updateMedia);
  }, []);

  return media;
}
