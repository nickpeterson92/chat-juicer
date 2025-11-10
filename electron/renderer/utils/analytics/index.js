/**
 * Analytics Utilities Exports
 * Centralized exports for analytics system
 */

export {
  AnalyticsAdapter,
  AnalyticsBackend,
  ConsoleAnalyticsBackend,
  ElectronIPCAnalyticsBackend,
  globalAnalytics,
  LocalStorageAnalyticsBackend,
  track,
  trackError,
  trackPageView,
  trackTiming,
} from "./analytics-adapter.js";
