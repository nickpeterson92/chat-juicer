/**
 * Type Definitions for Bootstrap System
 * JSDoc type definitions for phase results and dependencies
 */

/**
 * @typedef {Object} AdapterPhaseResult
 * @property {DOMAdapter} domAdapter - DOM manipulation abstraction
 * @property {IPCAdapter} ipcAdapter - IPC communication abstraction
 * @property {StorageAdapter} storageAdapter - Local storage abstraction
 * @property {EventBus} eventBus - Global event bus instance
 */

/**
 * @typedef {Object} StateDomPhaseResult
 * @property {AppState} appState - Application state instance
 * @property {Object} elements - DOM elements from dom-manager
 * @property {Object} sessionState - Session state from session-service
 */

/**
 * @typedef {Object} ServicesPhaseResult
 * @property {MessageService} messageService - Message handling service
 * @property {FileService} fileService - File upload service
 * @property {FunctionCallService} functionCallService - Function call service
 * @property {SessionService} sessionService - Session management service
 */

/**
 * @typedef {Object} ComponentsPhaseResult
 * @property {ChatContainer} chatContainer - Chat display component
 * @property {InputArea|null} inputArea - Chat input component
 * @property {FilePanel} filePanel - File management component
 * @property {Function} sendMessage - Message sending callback
 */

/**
 * @typedef {Object} EventHandlersPhaseResult
 * @property {Function} cleanup - Cleanup function to remove all listeners
 */

/**
 * @typedef {Object} PluginsPhaseResult
 * @property {PluginRegistry} pluginRegistry - Plugin registry instance
 * @property {DebugDashboard} debugDashboard - Debug dashboard (dev mode only)
 * @property {Array} pluginResults - Installation results for each plugin
 * @property {Object} app - Complete app instance
 */

/**
 * @typedef {Object} DataLoadingPhaseResult
 * @property {Array} sessions - Loaded sessions
 * @property {Object} modelConfig - Cached model configuration
 */
