import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthService } from "../../../../src/frontend/renderer/services/auth-service.js";

describe("AuthService", () => {
  let authService;
  let mockIpcAdapter;
  let mockAppState;
  let mockEventBus;

  beforeEach(() => {
    mockIpcAdapter = {
      authGetTokens: vi.fn(),
      authStoreTokens: vi.fn(),
      authLogin: vi.fn(),
      authRegister: vi.fn(),
      authRefresh: vi.fn(),
      authLogout: vi.fn(),
    };

    mockAppState = {
      setState: vi.fn(),
      getState: vi.fn(),
      subscribe: vi.fn(),
    };

    mockEventBus = {
      emit: vi.fn(),
      on: vi.fn(),
    };

    authService = new AuthService({
      ipcAdapter: mockIpcAdapter,
      appState: mockAppState,
      eventBus: mockEventBus,
    });
  });

  describe("initialize", () => {
    it("should return true if valid tokens are found", async () => {
      // Mock valid token that hasn't expired
      const futureDate = Math.floor(Date.now() / 1000) + 3600;
      const payload = btoa(JSON.stringify({ sub: "123", exp: futureDate }));
      const mockToken = `header.${payload}.signature`;

      mockIpcAdapter.authGetTokens.mockResolvedValue({
        accessToken: mockToken,
        refreshToken: "refresh",
        user: { id: "123", email: "test@example.com" },
      });

      mockIpcAdapter.authStoreTokens.mockResolvedValue(true);

      const result = await authService.initialize();

      expect(result).toBe(true);
      expect(mockAppState.setState).toHaveBeenCalledWith("auth.isAuthenticated", true);
      expect(mockAppState.setState).toHaveBeenCalledWith("auth.user", expect.any(Object));
    });

    it("should return false if no tokens are found", async () => {
      mockIpcAdapter.authGetTokens.mockResolvedValue(null);

      const result = await authService.initialize();

      expect(result).toBe(false);
      // We don't check for false here because _setTokens wasn't called,
      // and initial state is assumed to be false.
      // But _clearTokens isn't called either on start if result is null.
    });

    it("should return false and clear tokens if token is expired", async () => {
      // Mock expired token
      const pastDate = Math.floor(Date.now() / 1000) - 3600;
      const payload = btoa(JSON.stringify({ sub: "123", exp: pastDate }));
      const mockToken = `header.${payload}.signature`;

      mockIpcAdapter.authGetTokens.mockResolvedValue({
        accessToken: mockToken,
        refreshToken: "refresh",
      });

      const result = await authService.initialize();

      expect(result).toBe(false);
      expect(mockIpcAdapter.authLogout).toHaveBeenCalled();
    });
  });

  describe("login", () => {
    it("should store tokens and update state on successful login", async () => {
      const futureDate = Math.floor(Date.now() / 1000) + 3600;
      const payload = btoa(JSON.stringify({ sub: "123", exp: futureDate }));
      const mockToken = `header.${payload}.signature`;

      const mockResponse = {
        access_token: mockToken,
        refresh_token: "refresh",
        user: { id: "123", email: "test@example.com" },
      };

      mockIpcAdapter.authLogin.mockResolvedValue(mockResponse);
      mockIpcAdapter.authStoreTokens.mockResolvedValue(true);

      const user = await authService.login("test@example.com", "password");

      expect(user.email).toBe("test@example.com");
      expect(mockIpcAdapter.authStoreTokens).toHaveBeenCalled();
      expect(mockAppState.setState).toHaveBeenCalledWith("auth.isAuthenticated", true);
      expect(mockEventBus.emit).toHaveBeenCalledWith("auth:login", expect.any(Object));
    });

    it("should throw error on failed login", async () => {
      mockIpcAdapter.authLogin.mockResolvedValue({ error: "Invalid credentials" });

      await expect(authService.login("test@example.com", "password")).rejects.toThrow("Invalid credentials");
    });
  });

  describe("logout", () => {
    it("should clear state and call IPC logout", async () => {
      await authService.logout();

      expect(mockAppState.setState).toHaveBeenCalledWith("auth.isAuthenticated", false);
      expect(mockAppState.setState).toHaveBeenCalledWith("auth.user", null);
      expect(mockIpcAdapter.authLogout).toHaveBeenCalled();
      expect(mockEventBus.emit).toHaveBeenCalledWith("auth:logout");
    });
  });
});
