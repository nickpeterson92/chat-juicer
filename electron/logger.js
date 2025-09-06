/**
 * Structured logging system for Chat Juicer Electron app
 * Provides unified logging across main and renderer processes
 */

const fs = require("node:fs");
const path = require("node:path");
const { app } = require("electron");
const util = require("node:util");

class Logger {
  constructor(component = "electron", options = {}) {
    this.component = component;
    this.sessionId = this.generateSessionId();
    this.correlationId = null;

    // Log levels - MUST be defined before parseLevel is called
    this.levels = {
      ERROR: 0,
      WARN: 1,
      INFO: 2,
      DEBUG: 3,
      TRACE: 4,
      METRIC: 5,
    };

    // Configuration from environment or defaults
    this.level = this.parseLevel(process.env.LOG_LEVEL || options.level || "INFO");
    this.format = process.env.LOG_FORMAT || (process.env.NODE_ENV === "production" ? "json" : "pretty");
    this.destination = process.env.LOG_DESTINATION || "console";

    // Performance tracking
    this.metrics = new Map();
    this.timers = new Map();

    // Async write queue for non-blocking file I/O
    this.writeQueue = [];
    this.isWriting = false;
    this.writeInterval = null;
    this.maxQueueSize = 1000; // Maximum logs to queue
    this.flushIntervalMs = 100; // Flush every 100ms

    // Setup file logging if needed
    if (this.destination === "file" || this.destination === "both") {
      this.logDir = app ? app.getPath("logs") : "./logs";
      this.ensureLogDirectory();
      this.setupAsyncWriting();
      this.setupLogRotation();
    }
  }

  parseLevel(level) {
    return this.levels[level.toUpperCase()] || this.levels.INFO;
  }

  generateSessionId() {
    return Math.random().toString(36).substring(2, 10);
  }

  ensureLogDirectory() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  formatMessage(level, message, metadata = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      component: this.component,
      sessionId: this.sessionId,
      correlationId: this.correlationId,
      message,
      ...metadata,
    };

    if (this.format === "json") {
      return `__LOG__${JSON.stringify(entry)}__LOG__`;
    }

    // Pretty format for development
    const emoji =
      {
        ERROR: "❌",
        WARN: "⚠️",
        INFO: "📝",
        DEBUG: "🔍",
        TRACE: "🔬",
        METRIC: "📊",
      }[level] || "•";

    let output = `${emoji} [${level}]`;
    if (this.correlationId) {
      output += ` [${this.correlationId.substring(0, 8)}]`;
    }
    output += ` ${message}`;

    if (Object.keys(metadata).length > 0) {
      output += `\n${util.inspect(metadata, { colors: true, depth: 3 })}`;
    }

    return output;
  }

  output(formatted, level) {
    if (this.destination === "console" || this.destination === "both") {
      if (level === "ERROR") {
        console.error(formatted);
      } else {
        console.log(formatted);
      }
    }

    if (this.destination === "file" || this.destination === "both") {
      // Queue for async writing instead of blocking
      this.queueWrite({
        file: "app.log",
        content: `${formatted}\n`,
        level: level,
      });

      // Also queue errors to separate file
      if (level === "ERROR") {
        this.queueWrite({
          file: "error.log",
          content: `${formatted}\n`,
          level: level,
        });
      }
    }
  }

  // Queue log entry for async writing
  queueWrite(entry) {
    // Drop old logs if queue is full to prevent memory issues
    if (this.writeQueue.length >= this.maxQueueSize) {
      this.writeQueue.shift(); // Remove oldest
      console.warn("Log queue full, dropping oldest entry");
    }

    this.writeQueue.push(entry);

    // Trigger immediate flush if queue is getting large
    if (this.writeQueue.length > this.maxQueueSize / 2) {
      this.flushQueue();
    }
  }

  // Setup async writing with batching
  setupAsyncWriting() {
    // Periodic flush
    this.writeInterval = setInterval(() => {
      this.flushQueue();
    }, this.flushIntervalMs);

    // Ensure logs are flushed on exit
    process.on("exit", () => {
      this.flushQueueSync(); // Final sync flush on exit
    });

    process.on("SIGINT", () => {
      this.flushQueueSync();
      process.exit();
    });
  }

  // Async batch write (fire-and-forget, non-blocking)
  flushQueue() {
    if (this.isWriting || this.writeQueue.length === 0) {
      return;
    }

    this.isWriting = true;
    const batch = this.writeQueue.splice(0, Math.min(100, this.writeQueue.length)); // Process up to 100 at a time

    // Group by file for efficiency
    const fileGroups = {};
    batch.forEach((entry) => {
      if (!fileGroups[entry.file]) {
        fileGroups[entry.file] = [];
      }
      fileGroups[entry.file].push(entry.content);
    });

    // Write each file asynchronously (fire-and-forget)
    const writes = Object.entries(fileGroups).map(([file, contents]) => {
      const filePath = path.join(this.logDir, file);
      const content = contents.join("");
      return fs.promises.appendFile(filePath, content).catch((err) => {
        console.error(`Failed to write to ${file}:`, err);
      });
    });

    // Fire and forget - don't await, just handle completion
    Promise.all(writes)
      .then(() => {
        this.isWriting = false;
      })
      .catch(() => {
        this.isWriting = false; // Ensure flag is reset even on error
      });
  }

  // Synchronous flush for exit scenarios
  flushQueueSync() {
    if (this.writeQueue.length === 0) return;

    const fileGroups = {};
    this.writeQueue.forEach((entry) => {
      if (!fileGroups[entry.file]) {
        fileGroups[entry.file] = [];
      }
      fileGroups[entry.file].push(entry.content);
    });

    Object.entries(fileGroups).forEach(([file, contents]) => {
      const filePath = path.join(this.logDir, file);
      const content = contents.join("");
      try {
        fs.appendFileSync(filePath, content);
      } catch (err) {
        console.error(`Failed to write to ${file}:`, err);
      }
    });

    this.writeQueue = [];
  }

  // Setup log rotation
  setupLogRotation() {
    const maxLogSize = 10 * 1024 * 1024; // 10MB
    const checkInterval = 60 * 60 * 1000; // Check every hour

    this.rotationInterval = setInterval(() => {
      this.checkAndRotateLogs(maxLogSize);
    }, checkInterval);

    // Initial check
    this.checkAndRotateLogs(maxLogSize);
  }

  checkAndRotateLogs(maxSize) {
    const files = ["app.log", "error.log"];

    // Non-blocking rotation check
    files.forEach((file) => {
      const filePath = path.join(this.logDir, file);

      fs.promises
        .stat(filePath)
        .then((stats) => {
          if (stats.size > maxSize) {
            // Rotate the log
            const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
            const rotatedPath = path.join(this.logDir, `${file}.${timestamp}`);

            // Non-blocking rename
            fs.promises
              .rename(filePath, rotatedPath)
              .then(() => {
                // Clean up old rotated logs (keep last 5)
                this.cleanupOldLogs(file);
              })
              .catch((err) => {
                console.error(`Error rotating ${file}:`, err);
              });
          }
        })
        .catch((err) => {
          // File doesn't exist yet, ignore
          if (err.code !== "ENOENT") {
            console.error(`Error checking log rotation for ${file}:`, err);
          }
        });
    });
  }

  cleanupOldLogs(baseFileName) {
    // Non-blocking cleanup
    fs.promises
      .readdir(this.logDir)
      .then((files) => {
        const rotatedFiles = files
          .filter((f) => f.startsWith(`${baseFileName}.`))
          .sort()
          .reverse();

        // Keep only the 5 most recent
        const deletions = [];
        for (let i = 5; i < rotatedFiles.length; i++) {
          deletions.push(fs.promises.unlink(path.join(this.logDir, rotatedFiles[i])).catch(() => {}));
        }

        // Fire and forget deletions
        if (deletions.length > 0) {
          Promise.all(deletions).catch(() => {});
        }
      })
      .catch((err) => {
        console.error("Error cleaning up old logs:", err);
      });
  }

  // Cleanup on logger destruction
  destroy() {
    if (this.writeInterval) {
      clearInterval(this.writeInterval);
      this.writeInterval = null;
    }

    if (this.rotationInterval) {
      clearInterval(this.rotationInterval);
      this.rotationInterval = null;
    }

    // Final flush
    this.flushQueueSync();
  }

  shouldLog(level) {
    return this.levels[level] <= this.level;
  }

  error(message, metadata = {}) {
    if (this.shouldLog("ERROR")) {
      this.output(this.formatMessage("ERROR", message, metadata), "ERROR");
    }
  }

  warn(message, metadata = {}) {
    if (this.shouldLog("WARN")) {
      this.output(this.formatMessage("WARN", message, metadata), "WARN");
    }
  }

  info(message, metadata = {}) {
    if (this.shouldLog("INFO")) {
      this.output(this.formatMessage("INFO", message, metadata), "INFO");
    }
  }

  debug(message, metadata = {}) {
    if (this.shouldLog("DEBUG")) {
      this.output(this.formatMessage("DEBUG", message, metadata), "DEBUG");
    }
  }

  trace(message, metadata = {}) {
    if (this.shouldLog("TRACE")) {
      this.output(this.formatMessage("TRACE", message, metadata), "TRACE");
    }
  }

  metric(name, value, unit = null, tags = {}) {
    const metricData = {
      metric_name: name,
      value,
      unit,
      ...tags,
    };

    if (this.shouldLog("METRIC")) {
      this.output(this.formatMessage("METRIC", `Metric: ${name}`, metricData), "METRIC");
    }

    // Store for aggregation
    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }
    this.metrics.get(name).push({ value, timestamp: Date.now() });
  }

  // Start timing an operation
  startTimer(operation, metadata = {}) {
    const id = `${operation}_${Date.now()}`;
    this.timers.set(id, {
      operation,
      start: performance.now(),
      metadata,
    });
    this.debug(`Starting ${operation}`, metadata);
    return id;
  }

  // End timing and log metric
  endTimer(timerId) {
    const timer = this.timers.get(timerId);
    if (!timer) {
      this.warn(`Timer ${timerId} not found`);
      return;
    }

    const duration = performance.now() - timer.start;
    this.timers.delete(timerId);

    this.metric(`${timer.operation}_duration_ms`, duration, "ms", timer.metadata);
    this.debug(`Completed ${timer.operation}`, {
      duration_ms: duration,
      ...timer.metadata,
    });

    return duration;
  }

  // Set correlation ID for request tracking
  setCorrelation(id = null) {
    this.correlationId = id || this.generateSessionId();
    return this.correlationId;
  }

  // Log IPC communication
  logIPC(direction, channel, data, metadata = {}) {
    const ipcData = {
      type: "ipc",
      direction, // 'send' or 'receive'
      channel,
      dataSize: JSON.stringify(data).length,
      ...metadata,
    };

    this.debug(`IPC ${direction}: ${channel}`, ipcData);
  }

  // Log Python process events
  logPythonProcess(event, metadata = {}) {
    const processData = {
      type: "python_process",
      event,
      pid: metadata.pid,
      ...metadata,
    };

    this.info(`Python process: ${event}`, processData);
  }

  // Log user interactions
  logUserInteraction(action, metadata = {}) {
    const interactionData = {
      type: "user_interaction",
      action,
      timestamp: Date.now(),
      ...metadata,
    };

    this.info(`User action: ${action}`, interactionData);

    // Save to analytics file
    if (process.env.LOG_ANALYTICS === "true") {
      const analyticsFile = path.join(this.logDir || "./logs", "analytics.jsonl");
      fs.appendFileSync(analyticsFile, `${JSON.stringify(interactionData)}\n`);
    }
  }

  // Log conversation metrics
  logConversation(userInput, response, metadata = {}) {
    const conversationData = {
      type: "conversation",
      userInputLength: userInput.length,
      responseLength: response.length,
      ...metadata,
    };

    this.info("Conversation turn", conversationData);

    // Save full conversation if enabled
    if (process.env.LOG_CONVERSATIONS === "true") {
      const convFile = path.join(this.logDir || "./logs", "conversations.jsonl");
      fs.appendFileSync(
        convFile,
        `${JSON.stringify({
          timestamp: new Date().toISOString(),
          sessionId: this.sessionId,
          correlationId: this.correlationId,
          userInput,
          response,
          ...conversationData,
        })}\n`
      );
    }
  }

  // System health monitoring
  logSystemHealth() {
    const used = process.memoryUsage();
    const health = {
      type: "system_health",
      memory: {
        rss: Math.round(used.rss / 1024 / 1024), // MB
        heapTotal: Math.round(used.heapTotal / 1024 / 1024),
        heapUsed: Math.round(used.heapUsed / 1024 / 1024),
        external: Math.round(used.external / 1024 / 1024),
      },
      uptime: process.uptime(),
      platform: process.platform,
      nodeVersion: process.version,
    };

    this.metric("memory_rss_mb", health.memory.rss, "MB");
    this.metric("memory_heap_used_mb", health.memory.heapUsed, "MB");
    this.debug("System health check", health);

    return health;
  }

  // Aggregate and report metrics
  getMetricsSummary() {
    const summary = {};

    for (const [name, values] of this.metrics.entries()) {
      const nums = values.map((v) => v.value);
      summary[name] = {
        count: nums.length,
        min: Math.min(...nums),
        max: Math.max(...nums),
        avg: nums.reduce((a, b) => a + b, 0) / nums.length,
        last: nums[nums.length - 1],
      };
    }

    return summary;
  }
}

// Export for use in both main and renderer processes
module.exports = Logger;
