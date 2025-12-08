# Message Queue Feature - Implementation Specification

## 1. Architecture Overview

### High-Level Design
The message queue will be implemented as a **dedicated service** (`MessageQueueService`) that integrates with the existing EventBus and AppState patterns. The queue will be **frontend-only** - the backend processes messages one at a time as it does now.

```
┌─────────────────────────────────────────────────────────────┐
│                      User Input                             │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│  InputArea Component                                        │
│  - Captures message                                         │
│  - Always enabled (no disable during processing)            │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│  MessageQueueService                                        │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ Queue Array: [{id, text, files, timestamp, status}]   │  │
│  └───────────────────────────────────────────────────────┘  │
│  - add(message) → queues message                            │
│  - process() → sends next if idle                           │
│  - edit(id, text) → updates queued message text             │
│  - remove(id) → cancels queued message                      │
│  - clear() → empties queue                                  │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│  AppState (state.js)                                        │
│  - python.status: 'idle' | 'busy_streaming' | ...           │
│  - queue.items: QueueItem[]                                 │
│  - queue.processingMessageId: string | null                 │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│  MessageService.sendMessage()                               │
│  - Sends to backend via IPC                                 │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│  Python Backend                                             │
│  - Processes one message at a time                          │
│  - Emits streaming events                                   │
│  - Emits assistant_done when complete                       │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌──────────────────────────────────────────────────────────────┐
│  EventBus Handler (message-handlers-v2.js)                   │
│  - On assistant_done: trigger processQueue()                 │
└──────────────────────────────────────────────────────────────┘
```

### Data Flow
1. User sends message → InputArea captures it
2. InputArea calls `MessageQueueService.add(message)`
3. MessageQueueService adds to queue array + publishes state update
4. MessageQueueService calls `process()` to attempt send
5. If `python.status === 'idle'`, dequeue and send via MessageService
6. Backend processes, streams response
7. On `assistant_done` event, handler calls `MessageQueueService.process()`
8. Process next queued message (if any exists)

---

## 2. State Design

### New State Properties in AppState

Add a new `queue` namespace to `AppState`:

```javascript
// electron/renderer/core/state.js
class AppState {
  constructor() {
    this.state = {
      // ... existing state ...

      queue: {
        items: [],  // QueueItem[] - array of queued messages
        processingMessageId: null,  // string | null - ID of message currently being processed
      }
    };
  }
}
```

### QueueItem Type Definition

```javascript
/**
 * @typedef {Object} QueueItem
 * @property {string} id - Unique identifier (crypto.randomUUID())
 * @property {string} text - Message text content
 * @property {Array} files - Array of file objects to send with message
 * @property {number} timestamp - Date.now() when queued
 * @property {'queued' | 'processing' | 'cancelled'} status - Current status
 */
```

### State Getters

Add convenience methods to AppState:

```javascript
// Check if queue has items
hasQueuedMessages() {
  return this.state.queue.items.length > 0;
}

// Get queue count
getQueueCount() {
  return this.state.queue.items.filter(i => i.status === 'queued').length;
}

// Get next queued message
getNextQueuedMessage() {
  return this.state.queue.items.find(i => i.status === 'queued');
}
```

---

## 3. Component Changes

### Files Requiring Modification

#### A. **Create New**: `electron/renderer/services/message-queue-service.js`
- **Purpose**: Core queue management logic
- **Responsibilities**:
  - Add messages to queue
  - Process queue when system is idle
  - Remove/cancel queued messages
  - Clear entire queue
  - Publish state updates via AppState

#### B. **Modify**: `electron/renderer/ui/components/input-area.js`
- **Changes**:
  - Remove logic that disables input during processing
  - Change send handler to call `MessageQueueService.add()` instead of direct `MessageService.sendMessage()`
  - Add visual indicator for queue count (badge on send button)
  - Keep input field always enabled

#### C. **Modify**: `electron/renderer/handlers/message-handlers-v2.js`
- **Changes**:
  - Update `assistant_done` handler to call `MessageQueueService.process()`
  - Add new handler for `queue_updated` event to refresh UI

#### D. **Modify**: `electron/renderer/ui/components/chat-container.js`
- **Changes**:
  - Render queued messages in chat with special styling
  - Add cancel button to each queued message
  - Wire cancel button to `MessageQueueService.remove(id)`

#### E. **Modify**: `electron/renderer/handlers/session-events.js`
- **Changes**:
  - On session switch, call `MessageQueueService.clear()`
  - Ensure queue is cleared when loading new session

#### F. **Modify**: `electron/renderer/services/index.js`
- **Changes**:
  - Export `MessageQueueService`

---

## 4. Queue Manager (MessageQueueService)

### Core Methods

```javascript
class MessageQueueService {

  /**
   * Add message to queue and attempt to process
   * @param {string} text - Message text
   * @param {Array} files - File attachments
   * @returns {string} - Queue item ID
   */
  add(text, files = []) {
    // 1. Create QueueItem with unique ID
    // 2. Add to AppState.state.queue.items
    // 3. Publish 'queue:added' event
    // 4. Call process() to attempt immediate send
    // 5. Return item ID
  }

  /**
   * Process next queued message if system is idle
   * @returns {boolean} - True if message was sent
   */
  async process() {
    // 1. Check if python.status === 'idle'
    // 2. Get next queued message via getNextQueuedMessage()
    // 3. If no message, return false
    // 4. Update item.status = 'processing'
    // 5. Update AppState.state.queue.processingMessageId = item.id
    // 6. Call MessageService.sendMessage(item.text, item.files)
    // 7. Remove item from queue (since it's now "in flight")
    // 8. Publish 'queue:processed' event
    // 9. Return true
  }

  /**
   * Edit a queued message's text
   * @param {string} id - Queue item ID
   * @param {string} newText - Updated message text
   * @returns {boolean} - True if edit was successful
   */
  edit(id, newText) {
    // 1. Find item in queue by id
    // 2. Validate item exists and status === 'queued' (can't edit processing)
    // 3. Update item.text = newText
    // 4. Publish 'queue:edited' event with { id, newText }
    // 5. Return true (or false if validation failed)
  }

  /**
   * Remove a queued message (cancel it)
   * @param {string} id - Queue item ID
   */
  remove(id) {
    // 1. Find item in queue
    // 2. Update item.status = 'cancelled'
    // 3. Remove from AppState.state.queue.items
    // 4. Publish 'queue:removed' event
  }

  /**
   * Clear entire queue (e.g., on session switch)
   */
  clear() {
    // 1. Set AppState.state.queue.items = []
    // 2. Set AppState.state.queue.processingMessageId = null
    // 3. Publish 'queue:cleared' event
  }

  /**
   * Get queue count for UI display
   * @returns {number}
   */
  getCount() {
    // Return count of items with status === 'queued'
  }
}
```

### Initialization

```javascript
// electron/renderer/services/message-queue-service.js
import { appState } from '../core/state.js';
import { eventBus } from '../core/event-bus.js';
import { sendMessage } from './message-service.js';

export const messageQueueService = new MessageQueueService(appState, eventBus, sendMessage);
```

---

## 5. UI/UX Specification

### Visual Design for Queued Messages

#### A. **Queue Indicator on Send Button**
- **Location**: Adjacent to send button in input area
- **Icon**: List-end icon (Lucide)
  ```svg
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M16 5H3"/><path d="M16 12H3"/><path d="M9 19H3"/>
    <path d="m16 16-3 3 3 3"/><path d="M21 5v12a2 2 0 0 1-2 2h-6"/>
  </svg>
  ```
- **Appearance**:
  - Icon with small count badge (e.g., "2") superscript
  - Color: `var(--color-text-secondary)`, brightens on hover
  - Count badge: `var(--color-brand-primary)` background, white text
- **Behavior**:
  - Only visible when queue count > 0
  - Animates in/out with fade + scale
  - Click opens queue panel/popover (optional enhancement)

#### B. **Queued Message Display in Chat**
- **Location**: Appears in chat container after user's last sent message
- **Appearance**:
  - Light gray background: `var(--color-surface-hover)`
  - Dashed border: `2px dashed var(--color-border-secondary)`
  - Opacity: 0.7 (slightly muted)
  - Small "Queued" label badge in top-right corner
  - Action buttons in top-right: Edit (pencil icon), Cancel (X icon)
    - Edit: hover shows blue, opens inline edit mode
    - Cancel: hover shows red, removes from queue
- **Layout**:
  ```
  ┌────────────────────────────────────────┐
  │  User Message (sent, normal)           │
  └────────────────────────────────────────┘

  ┌────────────────────────────────────────┐
  │ [Queued]            [✎ Edit] [X Cancel]│
  │                                        │
  │  Queued message text here...           │
  │                                        │
  └────────────────────────────────────────┘

  ┌────────────────────────────────────────┐
  │ [Queued]            [✎ Edit] [X Cancel]│
  │                                        │
  │  Another queued message...             │
  │                                        │
  └────────────────────────────────────────┘
  ```

#### C. **Inline Edit Mode**
- **Trigger**: Click edit button on queued message
- **Appearance**:
  - Message text becomes editable textarea
  - Border changes to solid `var(--color-brand-primary)`
  - Save (checkmark) and Cancel (X) buttons replace Edit/Cancel
- **Behavior**:
  - Enter or Save button: calls `MessageQueueService.edit(id, newText)`
  - Escape or Cancel button: reverts to original text
  - Cannot edit message that is currently processing

#### D. **Animation States**
- **Add to queue**: Fade in from bottom with slight slide up (200ms)
- **Processing**: Border changes from dashed to solid, opacity increases to 1.0
- **Cancel**: Fade out with slide down (150ms)
- **Clear queue**: All items fade out simultaneously

#### E. **Input Area Behavior**
- **Always Enabled**: Input field never disables, even during processing
- **Placeholder Text**:
  - Default: "Type a message..."
  - During processing: "Type another message... (1 queued)" (if queue has items)
- **Send Button**:
  - Always clickable
  - Shows queue badge when count > 0
  - Color remains consistent (no disabled state)

---

## 6. Event Flow

### Sequence Diagram: Happy Path (Queue → Process → Complete)

```
User         InputArea      QueueService     AppState     MessageService     Backend       EventBus
 │               │               │              │               │              │              │
 │─Type msg─────>│               │              │               │              │              │
 │               │               │              │               │              │              │
 │─Click send───>│               │              │               │              │              │
 │               │               │              │               │              │              │
 │               │──add(text)───>│              │               │              │              │
 │               │               │              │               │              │              │
 │               │               │──update─────>│               │              │              │
 │               │               │   queue.items                │              │              │
 │               │               │              │               │              │              │
 │               │               │─────────────────publish───────────────────────────────────>│
 │               │               │              │  'queue:added'                              │
 │               │               │              │               │              │              │
 │               │               │──process()──>│               │              │              │
 │               │               │              │               │              │              │
 │               │               │──check python.status         │              │              │
 │               │               │              │               │              │              │
 │               │               │  [if idle]   │               │              │              │
 │               │               │              │               │              │              │
 │               │               │──sendMessage────────────────>│              │              │
 │               │               │              │               │              │              │
 │               │               │              │               │──send IPC───>│              │
 │               │               │              │               │              │              │
 │               │               │              │               │              │──process────>│
 │               │               │              │               │              │              │
 │               │               │              │               │<─events──────│              │
 │               │               │              │               │  (streaming) │              │
 │               │               │              │               │              │              │
 │               │               │              │               │<─done────────│              │
 │               │               │              │               │              │              │
 │               │               │              │<─────────────IPC forward────────────────────│
 │               │               │              │  'assistant_done'                           │
 │               │               │              │               │              │              │
 │               │               │<─────────────────trigger 'assistant_done'──────────────────│
 │               │               │              │               │              │              │
 │               │               │──process()──>│               │              │              │
 │               │               │  (next msg)  │               │              │              │
 │               │               │              │               │              │              │
 │               │               │  [repeat if more queued]     │              │              │
```

### Sequence Diagram: Cancellation Flow

```
User         ChatContainer   QueueService     AppState       EventBus
 │               │               │              │              │
 │─Click [X]────>│               │              │              │
 │   cancel      │               │              │              │
 │               │               │              │              │
 │               │──remove(id)──>│              │              │
 │               │               │              │              │
 │               │               │──update─────>│              │
 │               │               │   remove item               │
 │               │               │              │              │
 │               │               │──publish───────────────────>│
 │               │               │  'queue:removed'            │
 │               │               │              │              │
 │               │<──event─────────────────────────────────────│
 │               │   'queue:removed'            │              │
 │               │               │              │              │
 │               │──remove from DOM             │              │
 │               │   (fade out animation)       │              │
```

---

## 7. Edge Cases & Handling

### A. **Session Switch During Queue**
- **Scenario**: User switches session while messages are queued
- **Handling**:
  - Call `MessageQueueService.clear()` in session switch handler
  - All queued messages removed immediately
  - UI updates to hide queue badges and queued message cards
- **Implementation**: Modify `electron/renderer/handlers/session-events.js` → `handleSessionSwitch()`

### B. **Error During Message Send**
- **Scenario**: Backend returns error while processing queued message
- **Handling**:
  - Error event received from backend
  - MessageQueueService marks current processing message as failed (optional: add to queue.items with status 'failed')
  - Call `process()` to attempt next message in queue
  - User sees error toast/notification for failed message
  - Queue continues processing
- **Implementation**: Add error handler in `message-handlers-v2.js` → check for `processingMessageId` and handle accordingly

### C. **Rapid Multiple Sends (10+ messages)**
- **Scenario**: User rapidly clicks send 10+ times or pastes many messages
- **Handling**:
  - **Option 1 (Recommended)**: No limit, allow unlimited queue depth
    - Pro: User flexibility, no arbitrary constraints
    - Con: Potential UI clutter
  - **Option 2**: Soft limit with warning
    - Show toast after 5 messages: "You have 5 messages queued"
    - Continue accepting messages but warn user
  - **UI Consideration**: Queued messages scroll in chat container (normal scroll behavior handles this)
- **Implementation**: Add optional limit check in `MessageQueueService.add()`

### D. **Queue Persistence Across App Restart**
- **Scenario**: User closes app with messages in queue
- **Decision**: **Do NOT persist queue** (simplest implementation)
  - Queue is ephemeral, cleared on app close
  - User sees queued messages disappear on restart
  - Rationale: Avoids complexity, stale queue issues, and unexpected sends on restart
- **Alternative** (if requested later): Persist to localStorage with timestamp check on load

### E. **File Attachments in Queue**
- **Scenario**: Queued message has file attachments
- **Handling**:
  - Store file objects in `QueueItem.files` array
  - Display file count/names in queued message card UI
  - When processing, pass files to `MessageService.sendMessage(text, files)`
  - Files remain in memory until queue item is processed/cancelled
- **Edge Case**: File becomes unavailable (deleted/moved) before send
  - Show error toast: "File no longer available"
  - Allow user to cancel/re-send without file

### F. **Backend Crashes/Disconnects During Queue**
- **Scenario**: Python backend crashes while queue has messages
- **Handling**:
  - Connection status component shows disconnected state
  - Queue remains intact (does not clear)
  - On reconnect, call `MessageQueueService.process()` to resume
  - Health check (5-min interval) triggers reconnect logic
- **Implementation**: Add reconnect handler in `connection-status.js` → call `messageQueueService.process()`

### G. **Duplicate Prevention**
- **Scenario**: User double-clicks send button quickly
- **Handling**:
  - No special handling needed - each click creates separate queue item
  - Alternative: Add debounce (100ms) to send button click handler if this becomes issue
  - Each message gets unique ID, so no true "duplicate" concern

---

## 8. File-by-File Changes

### NEW FILE: `electron/renderer/services/message-queue-service.js`

**Exports**: `messageQueueService` (singleton instance)

**Responsibilities**:
- Manage queue array in AppState
- Add/remove/clear queue items
- Process queue when system is idle
- Publish events via EventBus

**Key Methods**:
- `add(text, files)` → string (returns queue item ID)
- `process()` → Promise<boolean>
- `edit(id, newText)` → boolean (edit queued message text)
- `remove(id)` → void
- `clear()` → void
- `getCount()` → number

**Dependencies**:
- `core/state.js` (AppState)
- `core/event-bus.js` (EventBus)
- `./message-service.js` (sendMessage function)

**Integration Points**:
- Subscribe to AppState `python.status` changes
- Publish events: `queue:added`, `queue:processed`, `queue:removed`, `queue:cleared`

---

### MODIFY: `electron/renderer/ui/components/input-area.js`

**Changes**:

1. **Import MessageQueueService**:
   ```javascript
   import { messageQueueService } from '../../services/message-queue-service.js';
   ```

2. **Remove Input Disable Logic**:
   - Delete any code that disables input/textarea during `python.status === 'busy_streaming'`
   - Input field remains always enabled

3. **Update Send Handler**:
   - Change from: `messageService.sendMessage(text, files)`
   - Change to: `messageQueueService.add(text, files)`
   - Clear input field immediately after adding to queue

4. **Add Queue Count Badge**:
   - Subscribe to AppState `queue.items` changes
   - Render badge on send button when count > 0
   - Update badge text with queue count

5. **Update Placeholder Text** (optional):
   - Change placeholder based on queue count
   - Example: "Type another message... (2 queued)"

---

### MODIFY: `electron/renderer/handlers/message-handlers-v2.js`

**Changes**:

1. **Import MessageQueueService**:
   ```javascript
   import { messageQueueService } from '../services/message-queue-service.js';
   ```

2. **Update `assistant_done` Handler**:
   ```javascript
   createHandler('assistant_done', async (data) => {
     // ... existing logic (set python.status = 'idle') ...

     // NEW: Process next queued message
     await messageQueueService.process();
   });
   ```

3. **Add Queue Event Handlers** (optional, for debugging/logging):
   ```javascript
   createHandler('queue:added', (data) => {
     // Log or handle queue addition
   });

   createHandler('queue:processed', (data) => {
     // Log or handle queue processing
   });
   ```

---

### MODIFY: `electron/renderer/ui/components/chat-container.js`

**Changes**:

1. **Import MessageQueueService**:
   ```javascript
   import { messageQueueService } from '../../services/message-queue-service.js';
   ```

2. **Subscribe to Queue State**:
   - Subscribe to AppState `queue.items` changes
   - Re-render when queue updates

3. **Render Queued Messages**:
   - After last user/assistant message, render each queued message
   - Apply special styling (dashed border, opacity, "Queued" badge)
   - Add cancel button (X icon) to each queued message

4. **Cancel Button Handler**:
   - On click: `messageQueueService.remove(queueItem.id)`
   - Animate removal (fade out)

5. **Scroll Behavior**:
   - Ensure queued messages are visible (auto-scroll to bottom when added)
   - Use existing `scroll-utils.js` patterns

---

### MODIFY: `electron/renderer/handlers/session-events.js`

**Changes**:

1. **Import MessageQueueService**:
   ```javascript
   import { messageQueueService } from '../services/message-queue-service.js';
   ```

2. **Update Session Switch Handler**:
   ```javascript
   async function handleSessionSwitch(sessionId) {
     // ... existing session switch logic ...

     // NEW: Clear queue on session switch
     messageQueueService.clear();

     // ... continue with session load ...
   }
   ```

3. **Update Session Delete Handler** (if exists):
   - If deleting active session, call `messageQueueService.clear()`

---

### MODIFY: `electron/renderer/services/index.js`

**Changes**:

1. **Export MessageQueueService**:
   ```javascript
   export { messageQueueService } from './message-queue-service.js';
   ```

---

### MODIFY: `electron/renderer/core/state.js`

**Changes**:

1. **Add Queue State**:
   ```javascript
   constructor() {
     this.state = {
       // ... existing state ...

       queue: {
         items: [],  // QueueItem[]
         processingMessageId: null,  // string | null
       }
     };
   }
   ```

2. **Add Convenience Methods** (optional):
   ```javascript
   hasQueuedMessages() {
     return this.state.queue.items.length > 0;
   }

   getQueueCount() {
     return this.state.queue.items.filter(i => i.status === 'queued').length;
   }

   getNextQueuedMessage() {
     return this.state.queue.items.find(i => i.status === 'queued');
   }
   ```

---

## 9. Testing Strategy

### Unit Tests

#### A. **MessageQueueService Tests**
- **Test**: `add()` creates unique queue items
  - Assert: Each item has unique ID
  - Assert: Items added in order to AppState
- **Test**: `process()` only sends when idle
  - Mock: `python.status === 'busy_streaming'`
  - Assert: process() returns false, no message sent
- **Test**: `process()` sends next queued message when idle
  - Setup: Add 2 messages to queue
  - Mock: `python.status === 'idle'`
  - Assert: First message sent, removed from queue
- **Test**: `remove()` cancels queued message
  - Setup: Add 3 messages
  - Remove: Middle message by ID
  - Assert: Queue has 2 items, correct item removed
- **Test**: `clear()` empties queue
  - Setup: Add 5 messages
  - Call: clear()
  - Assert: Queue is empty array

#### B. **InputArea Component Tests**
- **Test**: Send button adds message to queue
  - Mock: messageQueueService.add()
  - Assert: add() called with correct text and files
- **Test**: Queue count badge displays correctly
  - Setup: Set AppState.queue.items to 3 items
  - Assert: Badge visible with "3"
- **Test**: Input field never disables
  - Mock: python.status = 'busy_streaming'
  - Assert: Input field enabled attribute is true

#### C. **ChatContainer Component Tests**
- **Test**: Queued messages render with correct styling
  - Setup: Add 2 queued items to AppState
  - Assert: 2 message cards with dashed border, "Queued" badge
- **Test**: Cancel button removes message from queue
  - Setup: Render queued message
  - Click: Cancel button
  - Assert: messageQueueService.remove() called with correct ID

### Integration Tests

#### D. **Queue Processing Flow**
- **Test**: Messages process sequentially
  - Add 3 messages to queue
  - Mock: Backend completes first message
  - Assert: Second message sent automatically
  - Mock: Backend completes second message
  - Assert: Third message sent automatically
- **Test**: Queue clears on session switch
  - Add messages to queue
  - Trigger session switch event
  - Assert: Queue is empty

### Manual Testing Scenarios

#### E. **User Flow Tests**
1. **Happy Path**: Send 3 messages while agent is busy, verify they process in order
2. **Cancellation**: Queue 2 messages, cancel one, verify other still processes
3. **Session Switch**: Queue messages, switch session, verify queue clears
4. **Rapid Send**: Click send 10+ times rapidly, verify all messages queue
5. **File Attachments**: Queue message with file, verify file uploads correctly
6. **Error Recovery**: Trigger backend error, verify queue continues processing

### Edge Case Tests

#### F. **Stress Tests**
- **Test**: Queue 100 messages, verify no performance degradation
- **Test**: Queue messages with large file attachments (10+ MB)
- **Test**: Switch sessions repeatedly with queued messages

---

## 10. Implementation Phases

### Phase 1: Core Queue Logic (MVP)
- Create `MessageQueueService` with add/process/clear
- Add queue state to AppState
- Wire up `assistant_done` handler to call process()
- Update InputArea to call queue instead of direct send
- **Goal**: Basic queueing works, no UI indicators yet

### Phase 2: UI Indicators
- Add queue count badge to send button
- Render queued messages in chat container
- Add "Queued" label badge to queued messages
- Implement basic styling (dashed border, opacity)
- **Goal**: User can see queued messages

### Phase 3: Cancellation & Polish
- Add cancel button to queued messages
- Implement remove() functionality
- Add animations (fade in/out, slide)
- Handle session switch (clear queue)
- **Goal**: Full feature parity with spec

### Phase 4: Edge Cases & Testing
- Handle errors during queue processing
- Add file attachment support in queue
- Write unit tests for all queue operations
- Manual testing of all scenarios
- **Goal**: Production-ready, robust feature

---

## 11. Configuration & Constants

### New Constants (add to `electron/renderer/config/constants.js`)

```javascript
// Queue configuration
export const QUEUE_CONFIG = {
  MAX_QUEUE_SIZE: -1,  // -1 = unlimited, or set to number for limit
  ANIMATION_DURATION_MS: 200,  // Fade in/out duration
  BADGE_UPDATE_DEBOUNCE_MS: 50,  // Debounce badge updates
};

// Queue UI styling classes
export const QUEUE_CLASSES = {
  QUEUED_MESSAGE: 'queued-message',
  QUEUED_BADGE: 'queued-badge',
  QUEUE_COUNT_BADGE: 'queue-count-badge',
  CANCEL_BUTTON: 'queue-cancel-btn',
};
```

---

## 12. Success Metrics

The feature is complete when:

1. User can send multiple messages without waiting for responses
2. Messages process in FIFO order automatically
3. Queue count visible on send button when items queued
4. Queued messages display in chat with distinct styling
5. User can cancel individual queued messages
6. Queue clears on session switch
7. Input field remains enabled at all times
8. No errors or race conditions in queue processing
9. All unit tests pass
10. Manual testing scenarios complete successfully

---

## Summary

This specification provides a **clean, minimal implementation** that:

- **Follows existing patterns**: EventBus, services, handlers, AppState pub/sub
- **Non-invasive**: New service module, minimal changes to existing code
- **Type-safe**: Clear QueueItem structure, explicit state management
- **User-friendly**: Always-enabled input, clear visual feedback, cancellation support
- **Robust**: Handles edge cases (session switch, errors, rapid sends)
- **Testable**: Well-defined units with clear responsibilities

The queue is **frontend-only** with no backend changes required. The backend continues processing messages one at a time as it does today. The queue simply automates the "send next message when ready" flow that users would otherwise do manually.
