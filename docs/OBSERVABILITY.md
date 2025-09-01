# Chat Juicer Observability Guide

## Overview
This document describes the comprehensive observability strategy for Chat Juicer, including logging, metrics, and monitoring.

## Architecture

```
┌─────────────────┐
│  Electron Main  │──────logs────▶┌──────────────┐
│    (logger.js)  │               │              │
└─────────────────┘               │  Log Files   │
                                  │              │
┌─────────────────┐               │ • app.log    │
│Electron Renderer│──────logs────▶│ • error.log  │
│   (logger.js)   │               │ • perf.log   │
└─────────────────┘               │ • conv.jsonl │
                                  │              │
┌─────────────────┐               └──────────────┘
│  Python Backend │──────logs────▶      ⬇
│   (logger.py)   │               Terminal/Console
└─────────────────┘              (Dev Environment)
```

## Log Levels

| Level | Use Case | Example |
|-------|----------|---------|
| ERROR | Failures requiring attention | Connection lost, API errors |
| WARN | Potential issues | Slow response, retry needed |
| INFO | Key business events | Message sent, function called |
| DEBUG | Development details | State changes, flow control |
| TRACE | Verbose debugging | Every method call |
| METRIC | Performance data | Response time, memory usage |

## Environment Configuration

```bash
# Log level control
LOG_LEVEL=INFO          # ERROR, WARN, INFO, DEBUG, TRACE

# Output format
LOG_FORMAT=pretty       # pretty (dev) or json (prod)

# Destination
LOG_DESTINATION=console # console, file, or both

# Feature flags
LOG_CONVERSATIONS=true  # Log full conversations
LOG_ANALYTICS=true      # Log user analytics
LOG_METRICS=true        # Log performance metrics

# File paths (optional)
LOG_DIR=./logs          # Directory for log files
LOG_FILE=app.log        # Main log file name
```

## Key Metrics Tracked

### Performance Metrics
- **Message Latency**: Time from user input to first response token
- **Response Generation**: Total time to complete response
- **Function Call Duration**: Time for each function execution
- **IPC Communication**: Message passing between processes

### System Health
- **Memory Usage**: RSS, Heap, External memory
- **Process Lifecycle**: Starts, restarts, crashes
- **Connection Stability**: WebSocket/stream health
- **Error Rates**: Errors per conversation turn

### User Experience
- **Conversation Metrics**: Messages per session, session duration
- **Interaction Patterns**: Common queries, feature usage
- **Error Recovery**: Retry success rates
- **Response Quality**: Token usage, function call patterns

## Usage Examples

### Python Backend (logger.py)

```python
from logger import logger

# Basic logging
logger.info("Starting chat session")
logger.error("API connection failed", error_code=500, endpoint="openai")

# Performance tracking
with logger.timer("api_call"):
    response = make_api_call()

# Correlation tracking
with logger.correlation() as correlation_id:
    logger.info("Processing request", user_id=user_id)
    # All logs within this context share correlation_id

# Metrics
logger.metric("response_tokens", 150, unit="tokens")

# Conversation logging
logger.log_conversation_turn(
    user_input="What's the weather?",
    response="It's 70°F and sunny",
    function_calls=["get_weather"],
    duration_ms=1250,
    tokens_used=45
)
```

### Electron (logger.js)

```javascript
const Logger = require('./logger');
const logger = new Logger('main-process');

// Basic logging
logger.info('Application started');
logger.error('Python process crashed', { exitCode: 1 });

// Performance tracking
const timerId = logger.startTimer('python_startup');
// ... start python process ...
logger.endTimer(timerId);

// IPC logging
logger.logIPC('send', 'user-input', message);

// System health monitoring
setInterval(() => {
  logger.logSystemHealth();
}, 60000); // Every minute

// User interaction tracking
logger.logUserInteraction('send_message', { 
  messageLength: 50,
  hasAttachment: false 
});
```

## Log Rotation

For production environments, implement log rotation:

```bash
# Using logrotate (Linux/Mac)
/path/to/logs/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
}
```

## Monitoring & Alerting

### Local Development
- Colored terminal output with emojis for visual scanning
- Real-time log tailing: `tail -f logs/app.log`
- JSON parsing: `jq . logs/conversations.jsonl`

### Production
- Parse JSON logs for structured queries
- Set up alerts for ERROR level logs
- Monitor metrics for anomalies
- Track conversation quality metrics

## Analysis Tools

### Conversation Analysis
```bash
# Count messages per session
jq '.session_id' logs/conversations.jsonl | sort | uniq -c

# Average response time
jq '.duration_ms' logs/conversations.jsonl | awk '{sum+=$1} END {print sum/NR}'

# Error frequency
grep ERROR logs/app.log | wc -l
```

### Performance Analysis
```bash
# Extract metrics
grep METRIC logs/app.log | jq '.value'

# Memory usage over time
grep memory_rss_mb logs/app.log | jq '[.timestamp, .value]'
```

## Best Practices

1. **Use Correlation IDs**: Track requests across all components
2. **Log at the Right Level**: INFO for production, DEBUG for development
3. **Include Context**: Always add relevant metadata to logs
4. **Measure Everything**: If it's important, add a metric
5. **Sample High-Volume Events**: Avoid log flooding
6. **Secure Sensitive Data**: Never log passwords, tokens, or PII
7. **Monitor Log Size**: Implement rotation and cleanup policies

## Troubleshooting

### Common Issues

**Issue**: Logs not appearing
- Check LOG_LEVEL environment variable
- Verify LOG_DESTINATION setting
- Ensure log directory exists and is writable

**Issue**: Performance impact from logging
- Reduce LOG_LEVEL to INFO or WARN
- Enable log sampling for high-frequency events
- Use async logging for file output

**Issue**: Log files growing too large
- Implement log rotation
- Reduce conversation logging
- Archive old logs to compressed storage

## Future Enhancements

1. **OpenTelemetry Integration**: Full distributed tracing
2. **Cloud Logging**: Integration with CloudWatch/Datadog
3. **Real-time Dashboard**: Grafana/Kibana visualization
4. **Anomaly Detection**: ML-based error pattern detection
5. **Session Replay**: Reconstruct user sessions from logs