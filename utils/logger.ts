const isBrowser = typeof window !== "undefined"; // ✅ Check if in the browser

const NAMESPACE = isBrowser ? "CLIENT" : "SERVER",
  getDate = () => new Date().toLocaleString(),
  info = (message: any, ...optionalParams: any[]) => {
    console.info(`[${getDate()}] [${NAMESPACE}]`, message, ...optionalParams);
  },
  warn = (message: any, ...optionalParams: any[]) => {
    console.warn(`[${getDate()}] [${NAMESPACE}]`, message, ...optionalParams);
  },
  error = (message: any, ...optionalParams: any[]) => {
    console.error(`[${getDate()}] [${NAMESPACE}]`, message, ...optionalParams);
  },
  /**A slightly more intuitive logger for messages */
  logger = { info, warn, error };

export default logger;
