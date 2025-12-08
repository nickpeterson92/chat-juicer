# File Explorer Navigation Implementation

## Table of Contents
- [Overview](#overview)
- [Architecture](#architecture)
- [Phased Implementation](#phased-implementation)
- [Technical Details](#technical-details)
- [UI/UX Specifications](#uiux-specifications)
- [Testing Strategy](#testing-strategy)
- [Migration Notes](#migration-notes)

---

## Overview

### What We're Building

Add hierarchical file explorer navigation to the File Panel's **Output tab only**, allowing users to:

- Click folders to drill down and view contents
- Navigate back through breadcrumb segments
- Visually distinguish folders from files
- Maintain current flat list behavior for Sources tab

### Why This Matters

**Current Pain Point**: Files in nested folders (e.g., `output/code/figure_1.png`) display with full path as filename, creating visual clutter and poor UX. Users cannot intuitively browse nested output structures.

**Solution Benefits**:
- **Discoverability**: Users can explore folder hierarchies naturally
- **Clarity**: Files show only their name, not full path
- **Flexibility**: Supports AI-generated folder structures (code/, images/, reports/)
- **Scalability**: Handles deep nesting without UI degradation

### Design Philosophy

**Principle**: Progressive enhancement with minimal breaking changes.

- Output tab gains explorer capabilities
- Sources tab remains unchanged (flat list is appropriate for uploads)
- Backend API already supports this (no changes needed)
- State management stays within FilePanel (no global pollution)

---

## Architecture

### Component Responsibilities

```
┌─────────────────────────────────────────────────────────┐
│              FilePanel Component                         │
│  - Tab switching (sources/output)                        │
│  - Session context management                            │
│  - NEW: Current directory state (output tab only)        │
│  - NEW: Breadcrumb navigation state                      │
└─────────────────────────────────────────────────────────┘
                          ↓ Calls
┌─────────────────────────────────────────────────────────┐
│            file-manager.js                               │
│  - loadFilesIntoState(directory, listType)              │
│  - renderFileList(files, container, options)            │
│  - NEW: renderBreadcrumb(currentPath, onNavigate)       │
│  - NEW: createFolderItem(folder, onClick)               │
│  - createFileItem(file, ...)                            │
└─────────────────────────────────────────────────────────┘
                          ↓ Uses
┌─────────────────────────────────────────────────────────┐
│         Backend: file_operations.py                      │
│  - list_directory(path) → FileInfo[]                     │
│    - Already returns type: "folder" | "file"             │
│    - Already returns file_count for folders              │
│    - Already sorted: folders first, then files           │
└─────────────────────────────────────────────────────────┘
```

### State Management

**FilePanel Class** (electron/renderer/ui/components/file-panel.js):

```javascript
export class FilePanel {
  constructor(...) {
    // Existing state
    this.currentSessionId = null;

    // NEW: Track current subdirectory for Output tab
    this.currentOutputPath = ""; // Relative path from output/ root
  }
}
```

**Why This Design**:
- Minimal state surface area (single string property)
- State isolated to FilePanel (no AppState pollution)
- Easy to serialize/restore if needed
- Clear ownership (FilePanel owns navigation state)

### Data Flow

```
User clicks folder
       ↓
FilePanel.navigateToFolder(folderName)
       ↓
Update this.currentOutputPath += "/folderName"
       ↓
Call loadFiles(fullPath, container)
       ↓
Backend returns FileInfo[] for subdirectory
       ↓
Render breadcrumb + folder/file list
```

**Navigation Back**:
```
User clicks breadcrumb segment
       ↓
FilePanel.navigateToBreadcrumb(segmentIndex)
       ↓
Reconstruct path from segments[0..segmentIndex]
       ↓
Update this.currentOutputPath
       ↓
Reload files for new path
```

---

## Phased Implementation

### Phase 1: State & Backend Integration (Foundation)
**Goal**: Add state management and wire up folder navigation without UI changes.

**Deliverables**:
1. Add `currentOutputPath` to FilePanel
2. Add `navigateToFolder(folderName)` method
3. Add `navigateToBreadcrumb(segmentIndex)` method
4. Add `getFullOutputPath()` helper
5. Modify `switchTab()` to reset `currentOutputPath` when switching to Sources
6. Add unit tests for path manipulation

**Files Modified**:
- `electron/renderer/ui/components/file-panel.js` (add state + navigation methods)

**Testing**:
- Unit tests for path concatenation logic
- Unit tests for breadcrumb segment calculation
- Manual test: Verify state updates correctly on navigation

**Success Criteria**:
- FilePanel can track subdirectory state
- Path manipulation logic is robust and tested
- No visual changes yet (foundation only)

**Estimated Complexity**: Low (1-2 hours)

---

### Phase 2: Folder UI & Breadcrumb Navigation
**Goal**: Add folder visual distinction, click handlers, and breadcrumb UI.

**Deliverables**:
1. Create `createFolderItem()` function in file-manager.js
2. Create `renderBreadcrumb()` function in file-manager.js
3. Modify `renderFileList()` to distinguish folders vs files
4. Add breadcrumb container to files-container DOM
5. Wire up folder click → FilePanel.navigateToFolder()
6. Wire up breadcrumb click → FilePanel.navigateToBreadcrumb()
7. Add CSS classes for folder items and breadcrumb

**Files Modified**:
- `electron/renderer/managers/file-manager.js` (folder rendering + breadcrumb)
- `electron/renderer/ui/components/file-panel.js` (event wiring)
- `ui/input.css` (breadcrumb + folder styles)

**New Functions**:

```javascript
// file-manager.js
export function createFolderItem(folder, onClick) {
  const folderItem = document.createElement("div");
  folderItem.className = "file-item folder-item";

  const icon = document.createElement("span");
  icon.className = "file-icon";
  icon.innerHTML = getFolderIcon(); // New helper

  const name = document.createElement("span");
  name.className = "file-name";
  name.textContent = folder.name;

  const count = document.createElement("span");
  count.className = "folder-count";
  count.textContent = `${folder.file_count} items`;

  folderItem.onclick = () => onClick(folder.name);

  folderItem.appendChild(icon);
  folderItem.appendChild(name);
  folderItem.appendChild(count);
  return folderItem;
}

export function renderBreadcrumb(currentPath, container, onNavigate) {
  const breadcrumbContainer = document.createElement("div");
  breadcrumbContainer.className = "breadcrumb-nav";

  // Root segment (always present)
  const rootSegment = createBreadcrumbSegment("Output", 0, onNavigate);
  breadcrumbContainer.appendChild(rootSegment);

  // Path segments
  if (currentPath) {
    const segments = currentPath.split("/").filter(Boolean);
    segments.forEach((segment, index) => {
      const separator = document.createElement("span");
      separator.className = "breadcrumb-separator";
      separator.textContent = "/";

      const segmentEl = createBreadcrumbSegment(segment, index + 1, onNavigate);

      breadcrumbContainer.appendChild(separator);
      breadcrumbContainer.appendChild(segmentEl);
    });
  }

  container.prepend(breadcrumbContainer);
}

function createBreadcrumbSegment(text, index, onNavigate) {
  const segment = document.createElement("button");
  segment.className = "breadcrumb-segment";
  segment.textContent = text;
  segment.onclick = () => onNavigate(index);
  return segment;
}
```

**Testing**:
- Manual test: Click folder → verify navigation
- Manual test: Click breadcrumb → verify back navigation
- Visual test: Verify folder icon and file count display
- Edge case: Empty folders render correctly
- Edge case: Deep nesting (5+ levels) renders correctly

**Success Criteria**:
- Users can click folders to drill down
- Breadcrumb shows current path with clickable segments
- Folders visually distinct from files
- Navigation state persists until tab switch

**Estimated Complexity**: Medium (3-4 hours)

---

### Phase 3: Polish & Edge Cases
**Goal**: Handle edge cases, add animations, improve UX.

**Deliverables**:
1. Add loading state during navigation
2. Add keyboard navigation (Enter on folder, Backspace to go up)
3. Handle empty folders gracefully
4. Add folder hover states
5. Smooth scroll to top on navigation
6. Preserve scroll position on back navigation (optional enhancement)
7. Add aria-labels for accessibility
8. Handle long folder names with ellipsis
9. Add integration tests

**Files Modified**:
- `electron/renderer/managers/file-manager.js` (loading states, keyboard handlers)
- `electron/renderer/ui/components/file-panel.js` (scroll management)
- `ui/input.css` (animations, transitions, responsive styles)

**Testing**:
- Keyboard navigation test
- Long filename truncation test
- Performance test with 100+ files
- Accessibility audit with screen reader
- Integration test: Full navigation flow

**Success Criteria**:
- No visual jank during navigation
- Loading states prevent confusion
- Keyboard navigation works smoothly
- Accessible to screen reader users
- Performs well with large directories

**Estimated Complexity**: Medium (3-4 hours)

---

## Technical Details

### Phase 1: FilePanel State Management

**File**: `electron/renderer/ui/components/file-panel.js`

```javascript
export class FilePanel {
  constructor(panelElement, toggleButton, filesContainer, refreshButton, sourcesTab, outputTab, options = {}) {
    // ... existing code ...

    // NEW: Track current directory for Output tab navigation
    this.currentOutputPath = ""; // Relative path from output/ root (e.g., "code" or "code/python")
  }

  /**
   * Navigate into a folder (Output tab only)
   * @param {string} folderName - Name of folder to enter
   */
  async navigateToFolder(folderName) {
    if (!folderName) return;

    // Append folder to current path
    this.currentOutputPath = this.currentOutputPath
      ? `${this.currentOutputPath}/${folderName}`
      : folderName;

    // Reload files for new path
    await this.loadOutputFiles();
  }

  /**
   * Navigate to breadcrumb segment (Output tab only)
   * @param {number} segmentIndex - Index of breadcrumb segment (0 = root)
   */
  async navigateToBreadcrumb(segmentIndex) {
    if (segmentIndex === 0) {
      // Navigate to root
      this.currentOutputPath = "";
    } else {
      // Reconstruct path up to segment
      const segments = this.currentOutputPath.split("/").filter(Boolean);
      this.currentOutputPath = segments.slice(0, segmentIndex).join("/");
    }

    await this.loadOutputFiles();
  }

  /**
   * Get full path for current output directory
   * @returns {string} Full path including session ID
   */
  getFullOutputPath() {
    const basePath = `data/files/${this.currentSessionId}/output`;
    return this.currentOutputPath
      ? `${basePath}/${this.currentOutputPath}`
      : basePath;
  }

  /**
   * Load files for output directory (respects currentOutputPath)
   */
  async loadOutputFiles() {
    if (!this.currentSessionId) return;

    const fullPath = this.getFullOutputPath();

    try {
      await loadFiles(fullPath, this.filesContainer, {
        isOutput: true,
        currentPath: this.currentOutputPath,
        onFolderClick: (folderName) => this.navigateToFolder(folderName),
        onBreadcrumbClick: (index) => this.navigateToBreadcrumb(index),
      });
    } catch (error) {
      console.error("Failed to load output files", error);
    }
  }

  /**
   * Switch tab (sources/output)
   * MODIFIED: Reset currentOutputPath when switching tabs
   */
  async switchTab(tab) {
    const tabs = [this.sourcesTab, this.outputTab].filter(Boolean);
    let directory = tab.dataset.directory;

    // Update active tab styling
    for (const t of tabs) {
      t.classList.remove("active");
    }
    tab.classList.add("active");

    // Only load files if there's an active session
    if (!this.currentSessionId) {
      return;
    }

    // Reset output navigation when switching away from Output tab
    if (directory === "sources") {
      this.currentOutputPath = "";
    }

    // Use session-specific directories
    if (directory === "sources") {
      directory = `data/files/${this.currentSessionId}/sources`;
      // Sources: Use standard flat list rendering
      await loadFiles(directory, this.filesContainer);
    } else if (directory === "output") {
      // Output: Use explorer navigation
      await this.loadOutputFiles();
    }
  }
}
```

**Testing Phase 1**:

```javascript
// tests/ui/components/file-panel.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FilePanel } from '../../../electron/renderer/ui/components/file-panel.js';

describe('FilePanel - Navigation State', () => {
  let filePanel;
  let mockContainer;

  beforeEach(() => {
    mockContainer = document.createElement('div');
    filePanel = new FilePanel(
      document.createElement('div'),
      null,
      mockContainer,
      null,
      document.createElement('button'),
      document.createElement('button')
    );
    filePanel.currentSessionId = 'test-session';
  });

  it('should initialize with empty output path', () => {
    expect(filePanel.currentOutputPath).toBe("");
  });

  it('should navigate into folder', async () => {
    await filePanel.navigateToFolder('code');
    expect(filePanel.currentOutputPath).toBe('code');

    await filePanel.navigateToFolder('python');
    expect(filePanel.currentOutputPath).toBe('code/python');
  });

  it('should navigate to breadcrumb root', async () => {
    filePanel.currentOutputPath = 'code/python';
    await filePanel.navigateToBreadcrumb(0);
    expect(filePanel.currentOutputPath).toBe("");
  });

  it('should navigate to breadcrumb segment', async () => {
    filePanel.currentOutputPath = 'code/python/utils';
    await filePanel.navigateToBreadcrumb(1); // Navigate to "code"
    expect(filePanel.currentOutputPath).toBe('code');
  });

  it('should construct full output path correctly', () => {
    filePanel.currentOutputPath = 'code/python';
    expect(filePanel.getFullOutputPath()).toBe(
      'data/files/test-session/output/code/python'
    );
  });

  it('should reset path when switching to sources tab', async () => {
    filePanel.currentOutputPath = 'code/python';
    const sourcesTab = filePanel.sourcesTab;
    sourcesTab.dataset.directory = 'sources';

    await filePanel.switchTab(sourcesTab);
    expect(filePanel.currentOutputPath).toBe("");
  });
});
```

---

### Phase 2: Folder Rendering & Breadcrumb UI

**File**: `electron/renderer/managers/file-manager.js`

```javascript
/**
 * Create a folder item element with navigation capability
 * @param {Object} folder - Folder FileInfo object
 * @param {Function} onClick - Callback when folder is clicked
 * @returns {HTMLElement}
 */
export function createFolderItem(folder, onClick) {
  const folderItem = document.createElement("div");
  folderItem.className = "file-item folder-item";
  folderItem.setAttribute("role", "button");
  folderItem.setAttribute("tabindex", "0");
  folderItem.setAttribute("aria-label", `Open ${folder.name} folder, ${folder.file_count} items`);

  const folderIcon = document.createElement("span");
  folderIcon.className = "file-icon folder-icon";
  folderIcon.innerHTML = getFolderIcon();

  const folderName = document.createElement("span");
  folderName.className = "file-name folder-name";
  folderName.textContent = folder.name;
  folderName.title = folder.name;

  const itemCount = document.createElement("span");
  itemCount.className = "folder-count";
  itemCount.textContent = `${folder.file_count || 0} items`;

  // Click and keyboard handlers
  const handleOpen = () => onClick(folder.name);
  folderItem.onclick = handleOpen;
  folderItem.onkeydown = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleOpen();
    }
  };

  folderItem.appendChild(folderIcon);
  folderItem.appendChild(folderName);
  folderItem.appendChild(itemCount);

  return folderItem;
}

/**
 * Get folder icon SVG
 * @returns {string} SVG markup for folder icon
 */
export function getFolderIcon() {
  const strokeColor = getComputedStyle(document.documentElement)
    .getPropertyValue('--color-text-secondary').trim();

  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${strokeColor}" stroke-width="2">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
  </svg>`;
}

/**
 * Render breadcrumb navigation at top of container
 * @param {string} currentPath - Current relative path (e.g., "code/python")
 * @param {HTMLElement} container - Container to render breadcrumb into
 * @param {Function} onNavigate - Callback when breadcrumb segment clicked
 */
export function renderBreadcrumb(currentPath, container, onNavigate) {
  // Remove existing breadcrumb if present
  const existingBreadcrumb = container.querySelector('.breadcrumb-nav');
  if (existingBreadcrumb) {
    existingBreadcrumb.remove();
  }

  const breadcrumbContainer = document.createElement("div");
  breadcrumbContainer.className = "breadcrumb-nav";
  breadcrumbContainer.setAttribute("role", "navigation");
  breadcrumbContainer.setAttribute("aria-label", "File path");

  // Root segment (Output/)
  const rootSegment = createBreadcrumbSegment("Output", 0, onNavigate, true);
  breadcrumbContainer.appendChild(rootSegment);

  // Path segments
  if (currentPath) {
    const segments = currentPath.split("/").filter(Boolean);
    segments.forEach((segment, index) => {
      const separator = document.createElement("span");
      separator.className = "breadcrumb-separator";
      separator.textContent = "/";
      separator.setAttribute("aria-hidden", "true");

      const isLast = index === segments.length - 1;
      const segmentEl = createBreadcrumbSegment(
        segment,
        index + 1,
        onNavigate,
        isLast
      );

      breadcrumbContainer.appendChild(separator);
      breadcrumbContainer.appendChild(segmentEl);
    });
  }

  container.prepend(breadcrumbContainer);
}

/**
 * Create a single breadcrumb segment
 * @param {string} text - Display text
 * @param {number} index - Segment index (0 = root)
 * @param {Function} onNavigate - Click handler
 * @param {boolean} isActive - Whether this is the current segment
 * @returns {HTMLElement}
 */
function createBreadcrumbSegment(text, index, onNavigate, isActive = false) {
  const segment = document.createElement("button");
  segment.className = `breadcrumb-segment ${isActive ? 'active' : ''}`;
  segment.textContent = text;
  segment.setAttribute("aria-current", isActive ? "location" : "false");

  if (!isActive) {
    segment.onclick = () => onNavigate(index);
  } else {
    // Active segment not clickable
    segment.disabled = true;
  }

  return segment;
}

/**
 * Render a file list into a container element
 * MODIFIED: Add breadcrumb rendering for Output tab with explorer options
 */
export function renderFileList(files, container, options = {}) {
  if (!container) {
    console.error("[FileManager] renderFileList: container is required");
    return;
  }

  const {
    directory = "sources",
    isOutput = false,
    isWelcomePage = false,
    isLoading = false,
    error = null,
    onDelete = null,
    // NEW: Explorer options for Output tab
    currentPath = "",
    onFolderClick = null,
    onBreadcrumbClick = null,
  } = options;

  // Loading state
  if (isLoading) {
    container.innerHTML = `<div class="files-loading">${MSG_LOADING_FILES}</div>`;
    return;
  }

  // Error state
  if (error) {
    container.innerHTML = `<div class="files-error">${MSG_FILES_ERROR.replace("{error}", error)}</div>`;
    return;
  }

  // Clear container
  container.innerHTML = "";

  // Render breadcrumb for Output tab with explorer mode
  if (isOutput && onBreadcrumbClick) {
    renderBreadcrumb(currentPath, container, onBreadcrumbClick);
  }

  // Empty state
  if (!files || files.length === 0) {
    renderEmptyState(container, { directory, isOutput, isWelcomePage });
    return;
  }

  // Render files and folders
  files.forEach((file) => {
    let fileItem;

    if (file.type === "folder" && onFolderClick) {
      // Render as clickable folder
      fileItem = createFolderItem(file, onFolderClick);
    } else {
      // Render as regular file
      fileItem = createFileItem(file, directory, container, onDelete);
    }

    container.appendChild(fileItem);
  });
}
```

**CSS Additions** (`ui/input.css`):

```css
/* Breadcrumb Navigation */
.breadcrumb-nav {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.75rem 0;
  margin-bottom: 0.5rem;
  border-bottom: 1px solid var(--color-border-secondary);
  flex-wrap: wrap;
}

.breadcrumb-segment {
  background: transparent;
  border: none;
  padding: 0.25rem 0.5rem;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
}

.breadcrumb-segment:hover:not(:disabled) {
  background: var(--color-surface-hover);
  color: var(--color-text-primary);
}

.breadcrumb-segment.active {
  color: var(--color-text-primary);
  font-weight: 600;
  cursor: default;
}

.breadcrumb-segment:disabled {
  cursor: default;
}

.breadcrumb-separator {
  color: var(--color-text-secondary);
  font-size: 0.875rem;
  user-select: none;
}

/* Folder Items */
.folder-item {
  cursor: pointer !important;
  transition: all 0.15s ease;
}

.folder-item:hover {
  background: var(--color-surface-hover);
  border-color: var(--color-brand-primary);
}

.folder-item .file-icon {
  color: var(--color-text-secondary);
}

.folder-name {
  font-weight: 500;
}

.folder-count {
  margin-left: auto;
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  padding: 0.125rem 0.5rem;
  background: var(--color-surface-2);
  border-radius: 0.375rem;
}

/* File items should not have delete button visible for folders */
.folder-item .file-delete-btn {
  display: none;
}
```

---

### Phase 3: Polish & Edge Cases

**Loading States**:

```javascript
// file-manager.js - Add to renderFileList
if (isLoading) {
  const loadingContainer = document.createElement("div");
  loadingContainer.className = "files-loading-container";
  loadingContainer.innerHTML = `
    <div class="files-loading-spinner"></div>
    <div class="files-loading">${MSG_LOADING_FILES}</div>
  `;
  container.appendChild(loadingContainer);
  return;
}
```

**Keyboard Navigation**:

```javascript
// file-panel.js - Add keyboard handler
setupKeyboardNavigation() {
  this.filesContainer.addEventListener('keydown', (e) => {
    // Backspace to go up one level (when not in input)
    if (e.key === 'Backspace' && e.target.classList.contains('folder-item')) {
      e.preventDefault();
      if (this.currentOutputPath) {
        const segments = this.currentOutputPath.split('/').filter(Boolean);
        this.navigateToBreadcrumb(segments.length - 1);
      }
    }
  });
}
```

**Long Filename Truncation**:

```css
/* input.css additions */
.file-name, .folder-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0; /* Allow flex item to shrink below content size */
}

.file-item {
  max-width: 100%;
  gap: 0.75rem;
}
```

**Accessibility Enhancements**:

```javascript
// Announce navigation to screen readers
function announceNavigation(folderName) {
  const announcement = document.createElement('div');
  announcement.setAttribute('role', 'status');
  announcement.setAttribute('aria-live', 'polite');
  announcement.className = 'sr-only'; // Screen reader only
  announcement.textContent = `Entered ${folderName} folder`;
  document.body.appendChild(announcement);
  setTimeout(() => announcement.remove(), 1000);
}
```

---

## UI/UX Specifications

### Visual Design

**Folder Item**:
```
┌────────────────────────────────────────────┐
│ 📁  code                      12 items      │  ← Hover: light blue background
└────────────────────────────────────────────┘
```

**File Item** (unchanged):
```
┌────────────────────────────────────────────┐
│ 📄  report.pdf      1.2 MB         [🗑]    │
└────────────────────────────────────────────┘
```

**Breadcrumb Navigation**:
```
┌────────────────────────────────────────────┐
│ Output / code / python                      │
│ ─────   ────   ──────                      │
│   ↑      ↑       ↑                         │
│ Root    L1      L2 (current)               │
└────────────────────────────────────────────┘
```

### Interaction Patterns

**Folder Click**:
1. User clicks folder
2. Show loading spinner briefly (if >100ms)
3. Animate fade-out current list
4. Load new directory
5. Animate fade-in new list + breadcrumb

**Breadcrumb Click**:
1. User clicks breadcrumb segment
2. Instant navigation (no loading needed, already in history)
3. Smooth scroll to top
4. Update breadcrumb highlight

**Empty Folder**:
```
┌────────────────────────────────────────────┐
│ Output / code / empty-folder                │
│ ─────────────────────────────────────────  │
│                                             │
│           📁                                │
│    This folder is empty                    │
│                                             │
└────────────────────────────────────────────┘
```

### Color Palette

Uses existing Chat Juicer semantic tokens:

- Breadcrumb text: `--color-text-secondary`
- Breadcrumb active: `--color-text-primary`
- Breadcrumb hover: `--color-surface-hover`
- Folder icon: `--color-text-secondary`
- Folder name: `--color-text-primary`
- Folder count badge: `--color-surface-2` background
- Folder hover: `--color-surface-hover` + `--color-brand-primary` border

### Responsive Behavior

- Breadcrumb wraps on narrow panels (already handled by flexbox)
- Long folder names truncate with ellipsis
- Item count badge hides on <300px width (optional media query)

---

## Testing Strategy

### Unit Tests (Phase 1)

**File**: `tests/ui/components/file-panel.test.js`

```javascript
describe('FilePanel - Navigation State', () => {
  it('should initialize with empty output path');
  it('should navigate into folder');
  it('should navigate into nested folder');
  it('should navigate to breadcrumb root');
  it('should navigate to breadcrumb segment');
  it('should construct full output path correctly');
  it('should handle empty folder names gracefully');
  it('should reset path when switching to sources tab');
});
```

### Integration Tests (Phase 2)

**File**: `tests/integration/file-explorer.test.js`

```javascript
describe('File Explorer Integration', () => {
  it('should render breadcrumb for output tab');
  it('should not render breadcrumb for sources tab');
  it('should navigate through folder hierarchy');
  it('should navigate back through breadcrumb');
  it('should maintain state during tab switch to Output');
  it('should reset state when switching away from Output');
  it('should handle folder with special characters');
  it('should handle deeply nested paths (10+ levels)');
});
```

### Manual Testing Checklist

**Phase 2**:
- [ ] Click folder → verify navigation
- [ ] Click breadcrumb → verify back navigation
- [ ] Switch tabs → verify state reset
- [ ] Open empty folder → verify empty state message
- [ ] Navigate deep (5+ levels) → verify breadcrumb wraps correctly
- [ ] Long folder names → verify ellipsis truncation
- [ ] Light/dark theme → verify colors adapt

**Phase 3**:
- [ ] Keyboard navigation (Enter on folder, Backspace to go up)
- [ ] Screen reader announces folder navigation
- [ ] Loading spinner shows for slow directories
- [ ] Smooth scroll to top on navigation
- [ ] Performance with 100+ files in directory
- [ ] Accessibility: Tab through folders, activate with Enter/Space

### Performance Testing

**Benchmark Targets**:
- Navigation latency: <100ms
- Breadcrumb render: <16ms (1 frame)
- Folder list render (50 items): <50ms
- Memory: No leaks over 100 navigations

**Testing Methodology**:
```javascript
// Use Chrome DevTools Performance profiler
console.time('navigate-to-folder');
await filePanel.navigateToFolder('code');
console.timeEnd('navigate-to-folder');
// Target: <100ms
```

---

## Migration Notes

### Backwards Compatibility

**Guaranteed**:
- Sources tab behavior unchanged (flat list)
- Existing file operations (open, delete) work identically
- AppState API unchanged (no global state added)
- IPC protocol unchanged (no backend changes)

**Breaking Changes**: None

### Rollback Strategy

If Phase 2 introduces issues:

1. **Immediate Rollback**: Comment out breadcrumb rendering in `renderFileList()`
2. **Partial Rollback**: Remove folder click handlers, treat folders as files
3. **Full Rollback**: Revert FilePanel to Phase 1 state (navigation methods remain, just unused)

**Safe Rollback Points**:
- After Phase 1: State management added but unused (zero risk)
- After Phase 2: Breadcrumb rendering can be disabled via feature flag

### Feature Flag (Optional)

Add environment-based feature flag:

```javascript
// config/constants.js
export const FEATURE_FILE_EXPLORER = import.meta.env.DEV ||
  window.__CHAT_JUICER_DEBUG__?.fileExplorer === true;

// file-manager.js
if (FEATURE_FILE_EXPLORER && isOutput && onBreadcrumbClick) {
  renderBreadcrumb(currentPath, container, onBreadcrumbClick);
}
```

### Data Migration

**Not Required**: This is purely a UI enhancement. No database or file system changes needed.

### Session Persistence (Future Enhancement)

If we want to persist navigation state across app restarts:

```javascript
// file-panel.js
setSession(sessionId) {
  this.currentSessionId = sessionId;

  // Restore saved output path for this session
  const savedPath = localStorage.getItem(`outputPath:${sessionId}`);
  if (savedPath) {
    this.currentOutputPath = savedPath;
  }
}

// Save output path on navigation
async navigateToFolder(folderName) {
  // ... existing code ...

  // Persist to localStorage
  if (this.currentSessionId) {
    localStorage.setItem(
      `outputPath:${this.currentSessionId}`,
      this.currentOutputPath
    );
  }
}
```

**Decision**: Defer to future enhancement. Start with session-scoped state only.

---

## Implementation Checklist

### Phase 1: Foundation (1-2 hours)
- [x] Add `currentOutputPath` property to FilePanel
- [x] Add `navigateToFolder()` method
- [x] Add `navigateToBreadcrumb()` method
- [x] Add `getFullOutputPath()` helper
- [x] Modify `switchTab()` to reset path
- [x] Add unit tests for path manipulation
- [x] Manual test state updates

### Phase 2: UI & Navigation (3-4 hours)
- [x] Create `createFolderItem()` function
- [x] Create `getFolderIcon()` helper
- [x] Create `renderBreadcrumb()` function
- [x] Create `createBreadcrumbSegment()` helper
- [x] Modify `renderFileList()` to accept explorer options
- [x] Wire folder clicks to `navigateToFolder()`
- [x] Wire breadcrumb clicks to `navigateToBreadcrumb()`
- [x] Add CSS for breadcrumb navigation
- [x] Add CSS for folder items
- [x] Manual test folder navigation
- [x] Manual test breadcrumb navigation
- [x] Visual test in light/dark themes

### Phase 3: Polish (3-4 hours)
- [ ] Add loading states during navigation
- [ ] Add keyboard navigation (Enter/Backspace)
- [ ] Handle empty folders gracefully
- [ ] Add folder hover states
- [ ] Smooth scroll to top on navigation
- [ ] Add aria-labels for accessibility
- [ ] Long filename truncation
- [ ] Screen reader announcements
- [ ] Integration tests
- [ ] Performance testing
- [ ] Accessibility audit

### Documentation
- [ ] Update CLAUDE.md with new FilePanel API
- [ ] Add JSDoc comments to new functions
- [ ] Create example usage in code comments
- [ ] Update architecture diagrams (if applicable)

---

## Success Metrics

**Functional**:
- Users can navigate folder hierarchies in Output tab
- Breadcrumb navigation works reliably
- Sources tab unchanged
- No regressions in existing file operations

**Performance**:
- Navigation <100ms
- No memory leaks
- Smooth animations (60fps)

**Usability**:
- Intuitive folder vs file distinction
- Clear breadcrumb path
- Keyboard accessible
- Screen reader compatible

**Code Quality**:
- 80%+ test coverage for new code
- Zero console errors
- Passes accessibility audit
- No new ESLint warnings

---

## Future Enhancements (Out of Scope)

**Potential additions for later iterations**:

1. **Folder Actions**: Right-click context menu (rename, delete folder)
2. **Folder Icons**: Custom icons based on folder name (e.g., 🐍 for `python/`)
3. **Search**: Filter files/folders in current directory
4. **Breadcrumb Overflow**: Collapse middle segments on very deep paths
5. **Quick Navigation**: Jump to root with Alt+Home
6. **Path Copy**: Copy current path to clipboard
7. **Session Persistence**: Remember last viewed folder per session
8. **Folder Preview**: Show first 3 file names on hover
9. **Sort Options**: Sort by name/date/size/type
10. **View Modes**: List view vs grid view for folders

**Decision**: Focus on core navigation first. Evaluate enhancements based on user feedback.

---

## Conclusion

This implementation adds intuitive file explorer navigation to the Output tab while maintaining the simplicity of the Sources tab. The phased approach ensures we can validate each layer before moving forward, with clear rollback points if issues arise.

**Key Strengths**:
- Minimal state surface area (single string property)
- No backend changes required
- Clear separation of concerns
- Backwards compatible
- Accessible and keyboard-friendly
- Testable architecture

**Risk Mitigation**:
- Phase 1 adds state foundation with zero UI changes (safe)
- Phase 2 is purely additive (can be disabled via feature flag)
- Phase 3 polish is incremental (can ship without it)

**Timeline Estimate**: 7-10 hours total development + 2-3 hours testing = 10-13 hours end-to-end.
