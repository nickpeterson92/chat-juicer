/**
 * Phase 3.5: Authentication Gate
 *
 * This phase runs after services are initialized but before components.
 * It checks for stored auth tokens and shows the auth modal if not authenticated.
 */

import { AuthService } from "../../services/auth-service.js";
import { AuthModal } from "../../ui/components/auth-modal.js";

/**
 * Initialize authentication and gate the application until authenticated
 *
 * @param {object} options - Phase options
 * @param {object} options.ipcAdapter - IPC adapter for main process communication
 * @param {object} options.eventBus - Event bus for auth events
 * @param {object} options.appState - Application state
 * @returns {Promise<object>} Auth phase result
 */
export async function initializeAuth({ ipcAdapter, eventBus, appState }) {
  // Create auth service
  const authService = new AuthService({ ipcAdapter, appState, eventBus });

  // Try to restore session from stored tokens
  let hasValidSession = false;
  try {
    hasValidSession = await authService.initialize();
  } catch (error) {
    console.error("[Auth Phase] Failed to initialize auth:", error);
    // Continue - will show modal
  }

  if (hasValidSession) {
    appState.setState("auth.isLoading", false);

    return {
      isAuthenticated: true,
      authService,
      authModal: null,
      waitForAuth: () => Promise.resolve(authService.user),
    };
  }

  // No valid session - prepare to show auth modal
  appState.setState("auth.isLoading", false);

  const authModal = new AuthModal({ authService, eventBus });

  return {
    isAuthenticated: false,
    authService,
    authModal,
    /**
     * Wait for user to authenticate
     * Shows the modal and resolves when login/register completes
     * @returns {Promise<object>} User info
     */
    waitForAuth: () =>
      new Promise((resolve) => {
        authModal.show();
        eventBus.once("auth:login", ({ user }) => {
          authModal.hide();
          resolve(user);
        });
      }),
  };
}
