/**
 * Test Analytics Flow
 * Quick verification that analytics events flow correctly through the plugin system
 *
 * Run in browser console after app loads:
 * > import('/renderer/plugins/test-analytics-flow.js').then(m => m.testAnalyticsFlow())
 */

export function testAnalyticsFlow() {
  console.log("🧪 Testing Analytics Flow...\n");

  const app = window.app;
  if (!app) {
    console.error("❌ window.app not found!");
    return;
  }

  const { eventBus, analytics } = app;
  if (!eventBus || !analytics) {
    console.error("❌ EventBus or Analytics not initialized!");
    return;
  }

  console.log("✅ App initialized with EventBus and Analytics");

  // Test 1: Emit analytics event via EventBus
  console.log("\n📊 Test 1: Emitting analytics:event via EventBus...");
  eventBus.emit("analytics:event", {
    category: "test",
    action: "analytics_flow_test",
    label: "integration_test",
    value: 42,
    metadata: { source: "test-script" },
  });
  console.log("✅ Event emitted (check console for backend log)");

  // Test 2: Check if AnalyticsBridgePlugin is installed
  console.log("\n🔌 Test 2: Checking installed plugins...");
  const plugins = app.pluginRegistry?.getAllPlugins();
  const bridgePlugin = plugins?.find((p) => p.name === "analytics-bridge");
  if (bridgePlugin) {
    console.log("✅ AnalyticsBridgePlugin is installed:", bridgePlugin.getMetadata());
  } else {
    console.error("❌ AnalyticsBridgePlugin not found!");
  }

  // Test 3: Check metrics bridge
  console.log("\n📈 Test 3: Checking MetricsBridgePlugin...");
  const metricsPlugin = plugins?.find((p) => p.name === "metrics-bridge");
  if (metricsPlugin) {
    console.log("✅ MetricsBridgePlugin is installed:", metricsPlugin.getMetadata());
  } else {
    console.error("❌ MetricsBridgePlugin not found!");
  }

  // Test 4: Emit performance metric
  console.log("\n⏱️  Test 4: Emitting performance:metric via EventBus...");
  eventBus.emit("performance:metric", {
    name: "test_metric",
    value: 123.45,
    unit: "ms",
    metadata: { source: "test-script" },
  });
  console.log("✅ Metric emitted (check app.metrics for recorded data)");

  // Test 5: Direct analytics call
  console.log("\n📞 Test 5: Direct analytics.track() call...");
  analytics.track("test", "direct_call", "test_label", 999);
  console.log("✅ Direct call complete");

  console.log("\n🎉 All tests complete!");
  console.log("\n📋 Summary:");
  console.log(`   - Plugins installed: ${plugins?.length || 0}`);
  console.log(`   - Analytics bridge: ${bridgePlugin ? "✅" : "❌"}`);
  console.log(`   - Metrics bridge: ${metricsPlugin ? "✅" : "❌"}`);
  console.log(`   - EventBus listeners: ${eventBus.listenerCount("analytics:event")}`);
  console.log(`   - Performance listeners: ${eventBus.listenerCount("performance:metric")}`);

  return {
    success: !!bridgePlugin && !!metricsPlugin,
    plugins: plugins?.map((p) => p.name),
    analyticsListeners: eventBus.listenerCount("analytics:event"),
    metricsListeners: eventBus.listenerCount("performance:metric"),
  };
}

// Auto-run if DEV mode and window.app exists
if (import.meta.env?.DEV && typeof window !== "undefined") {
  window.addEventListener("load", () => {
    // Wait for app to be fully initialized
    setTimeout(() => {
      if (window.app?.eventBus) {
        console.log("🚀 Auto-running analytics flow test...");
        testAnalyticsFlow();
      }
    }, 2000);
  });
}
