/**
 * FunctionCallService Unit Tests
 * Updated for AppState integration (Phase 2 migration)
 */

import { MockStorageAdapter } from "@test-helpers/MockStorageAdapter.js";
import { beforeEach, describe, expect, it } from "vitest";
import { AppState, BoundedMap } from "@/core/state.js";
import { CallStatus, FunctionCallService } from "@/services/function-call-service.js";

describe("FunctionCallService", () => {
  let functionCallService;
  let mockStorage;
  let appState;

  beforeEach(() => {
    mockStorage = new MockStorageAdapter();
    appState = new AppState();

    functionCallService = new FunctionCallService({
      storageAdapter: mockStorage,
      appState: appState,
    });
  });

  describe("constructor", () => {
    it("should initialize with storage adapter", () => {
      expect(functionCallService.storage).toBe(mockStorage);
    });

    it("should initialize with appState", () => {
      expect(functionCallService.appState).toBe(appState);
    });

    it("should throw error if appState not provided", () => {
      expect(() => new FunctionCallService({ storageAdapter: mockStorage })).toThrow(
        "FunctionCallService requires appState in constructor"
      );
    });

    it("should throw error if storage adapter is missing", () => {
      expect(() => new FunctionCallService({ appState })).toThrow(
        "FunctionCallService requires storageAdapter in constructor"
      );
    });

    it("should use AppState for call tracking", () => {
      const activeCalls = appState.getState("functions.activeCalls");
      const argumentsBuffer = appState.getState("functions.argumentsBuffer");
      const completedCalls = appState.getState("functions.completedCalls");

      expect(activeCalls).toBeInstanceOf(BoundedMap);
      expect(argumentsBuffer).toBeInstanceOf(BoundedMap);
      expect(completedCalls).toBeInstanceOf(BoundedMap);
    });
  });

  describe("createCall", () => {
    it("should create new call", () => {
      const call = functionCallService.createCall("call-1", "getWeather", { city: "SF" });

      expect(call.id).toBe("call-1");
      expect(call.name).toBe("getWeather");
      expect(call.status).toBe(CallStatus.PENDING);
      expect(call.timestamp).toBeGreaterThan(0);
    });

    it("should stringify object arguments", () => {
      const call = functionCallService.createCall("call-1", "getWeather", { city: "SF" });

      expect(call.args).toBe('{"city":"SF"}');
    });

    it("should keep string arguments as-is", () => {
      const call = functionCallService.createCall("call-1", "getWeather", '{"city":"SF"}');

      expect(call.args).toBe('{"city":"SF"}');
    });

    it("should throw on missing call ID", () => {
      expect(() => functionCallService.createCall("", "getWeather")).toThrow();
    });

    it("should throw on missing function name", () => {
      expect(() => functionCallService.createCall("call-1", "")).toThrow();
    });

    it("should add call to active calls", () => {
      functionCallService.createCall("call-1", "getWeather");

      expect(functionCallService.hasCall("call-1")).toBe(true);
    });
  });

  describe("updateCallStatus", () => {
    it("should update call status", () => {
      functionCallService.createCall("call-1", "getWeather");

      const updated = functionCallService.updateCallStatus("call-1", CallStatus.STREAMING);

      expect(updated.status).toBe(CallStatus.STREAMING);
    });

    it("should return null for non-existent call", () => {
      const updated = functionCallService.updateCallStatus("non-existent", CallStatus.COMPLETED);

      expect(updated).toBeNull();
    });

    it("should set endTime for terminal statuses", () => {
      functionCallService.createCall("call-1", "getWeather");

      const updated = functionCallService.updateCallStatus("call-1", CallStatus.COMPLETED);

      expect(updated.endTime).toBeDefined();
      expect(updated.duration).toBeGreaterThanOrEqual(0);
    });

    it("should move to completed calls on completion", () => {
      functionCallService.createCall("call-1", "getWeather");

      functionCallService.updateCallStatus("call-1", CallStatus.COMPLETED);

      const completed = functionCallService.getCompletedCalls();
      expect(completed).toHaveLength(1);
      expect(completed[0].id).toBe("call-1");
    });

    it("should limit completed calls to 100", () => {
      // Create and complete 150 calls
      for (let i = 0; i < 150; i++) {
        functionCallService.createCall(`call-${i}`, "test");
        functionCallService.updateCallStatus(`call-${i}`, CallStatus.COMPLETED);
      }

      const completedCalls = appState.getState("functions.completedCalls");
      expect(completedCalls.size).toBeLessThanOrEqual(100);
    });
  });

  describe("appendArgumentsDelta", () => {
    it("should append arguments delta", () => {
      functionCallService.createCall("call-1", "getWeather");

      const args = functionCallService.appendArgumentsDelta("call-1", '{"city":');

      expect(args).toBe('{"city":');
    });

    it("should accumulate multiple deltas", () => {
      functionCallService.createCall("call-1", "getWeather");

      functionCallService.appendArgumentsDelta("call-1", '{"city":');
      functionCallService.appendArgumentsDelta("call-1", '"SF"');
      const args = functionCallService.appendArgumentsDelta("call-1", "}");

      expect(args).toBe('{"city":"SF"}');
    });

    it("should update call status to STREAMING", () => {
      functionCallService.createCall("call-1", "getWeather");

      functionCallService.appendArgumentsDelta("call-1", '{"city":');

      const call = functionCallService.getCall("call-1");
      expect(call.status).toBe(CallStatus.STREAMING);
    });

    it("should handle non-existent call", () => {
      const args = functionCallService.appendArgumentsDelta("non-existent", "data");

      expect(args).toBe("data");
    });
  });

  describe("finalizeArguments", () => {
    it("should parse JSON arguments", () => {
      functionCallService.createCall("call-1", "getWeather");
      functionCallService.appendArgumentsDelta("call-1", '{"city":"SF"}');

      const parsed = functionCallService.finalizeArguments("call-1");

      expect(parsed).toEqual({ city: "SF" });
    });

    it("should handle invalid JSON gracefully", () => {
      functionCallService.createCall("call-1", "getWeather");
      functionCallService.appendArgumentsDelta("call-1", "{invalid json}");

      const parsed = functionCallService.finalizeArguments("call-1");

      expect(parsed).toBe("{invalid json}");
    });

    it("should clear arguments buffer", () => {
      functionCallService.createCall("call-1", "getWeather");
      functionCallService.appendArgumentsDelta("call-1", '{"city":"SF"}');

      functionCallService.finalizeArguments("call-1");

      const argumentsBuffer = appState.getState("functions.argumentsBuffer");
      expect(argumentsBuffer.has("call-1")).toBe(false);
    });

    it("should handle non-existent call", () => {
      const parsed = functionCallService.finalizeArguments("non-existent");

      expect(parsed).toEqual({});
    });
  });

  describe("setCallResult", () => {
    it("should set call result", () => {
      functionCallService.createCall("call-1", "getWeather");

      const updated = functionCallService.setCallResult("call-1", { temp: 72 });

      expect(updated.result).toEqual({ temp: 72 });
      expect(updated.status).toBe(CallStatus.COMPLETED);
    });

    it("should calculate duration", () => {
      functionCallService.createCall("call-1", "getWeather");

      const updated = functionCallService.setCallResult("call-1", { temp: 72 });

      expect(updated.duration).toBeGreaterThanOrEqual(0);
    });

    it("should return null for non-existent call", () => {
      const updated = functionCallService.setCallResult("non-existent", {});

      expect(updated).toBeNull();
    });
  });

  describe("setCallError", () => {
    it("should set call error", () => {
      functionCallService.createCall("call-1", "getWeather");

      const updated = functionCallService.setCallError("call-1", "Network error");

      expect(updated.error).toBe("Network error");
      expect(updated.status).toBe(CallStatus.ERROR);
    });

    it("should return null for non-existent call", () => {
      const updated = functionCallService.setCallError("non-existent", "Error");

      expect(updated).toBeNull();
    });
  });

  describe("getCall", () => {
    it("should get active call", () => {
      functionCallService.createCall("call-1", "getWeather");

      const call = functionCallService.getCall("call-1");

      expect(call).toBeDefined();
      expect(call.id).toBe("call-1");
    });

    it("should get completed call", () => {
      functionCallService.createCall("call-1", "getWeather");
      functionCallService.setCallResult("call-1", {});

      const call = functionCallService.getCall("call-1");

      expect(call).toBeDefined();
      expect(call.status).toBe(CallStatus.COMPLETED);
    });

    it("should return null for non-existent call", () => {
      const call = functionCallService.getCall("non-existent");

      expect(call).toBeNull();
    });
  });

  describe("getActiveCalls", () => {
    it("should return all active calls", () => {
      functionCallService.createCall("call-1", "getWeather");
      functionCallService.createCall("call-2", "getTime");

      const active = functionCallService.getActiveCalls();

      expect(active).toHaveLength(2);
    });

    it("should not include completed calls", () => {
      functionCallService.createCall("call-1", "getWeather");
      functionCallService.createCall("call-2", "getTime");
      functionCallService.setCallResult("call-1", {});

      const active = functionCallService.getActiveCalls();

      expect(active).toHaveLength(1);
      expect(active[0].id).toBe("call-2");
    });
  });

  describe("getCompletedCalls", () => {
    it("should return completed calls", () => {
      functionCallService.createCall("call-1", "getWeather");
      functionCallService.setCallResult("call-1", {});

      const completed = functionCallService.getCompletedCalls();

      expect(completed).toHaveLength(1);
      expect(completed[0].id).toBe("call-1");
    });

    it("should return most recent first", () => {
      functionCallService.createCall("call-1", "getWeather");
      functionCallService.createCall("call-2", "getTime");
      functionCallService.setCallResult("call-1", {});
      functionCallService.setCallResult("call-2", {});

      const completed = functionCallService.getCompletedCalls();

      expect(completed[0].id).toBe("call-2");
      expect(completed[1].id).toBe("call-1");
    });

    it("should limit returned calls", () => {
      for (let i = 0; i < 30; i++) {
        functionCallService.createCall(`call-${i}`, "test");
        functionCallService.setCallResult(`call-${i}`, {});
      }

      const completed = functionCallService.getCompletedCalls(10);

      expect(completed).toHaveLength(10);
    });
  });

  describe("hasCall", () => {
    it("should return true for active call", () => {
      functionCallService.createCall("call-1", "getWeather");

      expect(functionCallService.hasCall("call-1")).toBe(true);
    });

    it("should return true for completed call", () => {
      functionCallService.createCall("call-1", "getWeather");
      functionCallService.setCallResult("call-1", {});

      expect(functionCallService.hasCall("call-1")).toBe(true);
    });

    it("should return false for non-existent call", () => {
      expect(functionCallService.hasCall("non-existent")).toBe(false);
    });
  });

  describe("removeCall", () => {
    it("should remove active call", () => {
      functionCallService.createCall("call-1", "getWeather");

      const removed = functionCallService.removeCall("call-1");

      expect(removed).toBe(true);
      expect(functionCallService.hasCall("call-1")).toBe(false);
    });

    it("should remove completed call", () => {
      functionCallService.createCall("call-1", "getWeather");
      functionCallService.setCallResult("call-1", {});

      const removed = functionCallService.removeCall("call-1");

      expect(removed).toBe(true);
      expect(functionCallService.hasCall("call-1")).toBe(false);
    });

    it("should return false for non-existent call", () => {
      const removed = functionCallService.removeCall("non-existent");

      expect(removed).toBe(false);
    });
  });

  describe("clearActiveCalls", () => {
    it("should clear all active calls", () => {
      functionCallService.createCall("call-1", "getWeather");
      functionCallService.createCall("call-2", "getTime");

      functionCallService.clearActiveCalls();

      expect(functionCallService.getActiveCalls()).toHaveLength(0);
    });

    it("should not clear completed calls", () => {
      functionCallService.createCall("call-1", "getWeather");
      functionCallService.setCallResult("call-1", {});

      functionCallService.clearActiveCalls();

      expect(functionCallService.getCompletedCalls()).toHaveLength(1);
    });
  });

  describe("clearCompletedCalls", () => {
    it("should clear all completed calls", () => {
      functionCallService.createCall("call-1", "getWeather");
      functionCallService.setCallResult("call-1", {});

      functionCallService.clearCompletedCalls();

      expect(functionCallService.getCompletedCalls()).toHaveLength(0);
    });

    it("should not clear active calls", () => {
      functionCallService.createCall("call-1", "getWeather");

      functionCallService.clearCompletedCalls();

      expect(functionCallService.getActiveCalls()).toHaveLength(1);
    });
  });

  describe("getCallStats", () => {
    it("should return call statistics", () => {
      functionCallService.createCall("call-1", "getWeather");
      functionCallService.createCall("call-2", "getTime");
      functionCallService.setCallResult("call-1", {});
      functionCallService.setCallError("call-2", "Error");

      const stats = functionCallService.getCallStats();

      expect(stats.active).toBe(0);
      expect(stats.completed).toBe(1);
      expect(stats.errors).toBe(1);
      expect(stats.cancelled).toBe(0);
      expect(stats.avgDuration).toBeGreaterThanOrEqual(0);
    });

    it("should compute average duration when completed calls exist", () => {
      functionCallService.createCall("call-1", "getWeather");
      functionCallService.createCall("call-2", "getTime");

      functionCallService.updateCallStatus("call-1", CallStatus.COMPLETED);
      functionCallService.updateCallStatus("call-2", CallStatus.ERROR);

      const stats = functionCallService.getCallStats();

      expect(stats.avgDuration).toBeGreaterThanOrEqual(0);
      expect(stats.completed + stats.errors).toBe(2);
    });

    it("should calculate duration when startTime precedes completion", () => {
      const call = functionCallService.createCall("call-3", "slowOp");
      call.startTime = Date.now() - 50;

      functionCallService.updateCallStatus("call-3", CallStatus.COMPLETED);

      const stats = functionCallService.getCallStats();

      expect(stats.avgDuration).toBeGreaterThan(0);
    });
  });

  describe("getCallDuration", () => {
    it("should return duration for completed call", () => {
      functionCallService.createCall("call-1", "getWeather");
      functionCallService.setCallResult("call-1", {});

      const duration = functionCallService.getCallDuration("call-1");

      expect(duration).toBeGreaterThanOrEqual(0);
    });

    it("should return current duration for active call", () => {
      functionCallService.createCall("call-1", "getWeather");

      const duration = functionCallService.getCallDuration("call-1");

      expect(duration).toBeGreaterThanOrEqual(0);
    });

    it("should return null for non-existent call", () => {
      const duration = functionCallService.getCallDuration("non-existent");

      expect(duration).toBeNull();
    });
  });

  describe("isCallStale", () => {
    it("should return false for recent call", () => {
      functionCallService.createCall("call-1", "getWeather");

      const stale = functionCallService.isCallStale("call-1", 10000);

      expect(stale).toBe(false);
    });

    it("should return false for completed call", () => {
      functionCallService.createCall("call-1", "getWeather");
      functionCallService.setCallResult("call-1", {});

      const stale = functionCallService.isCallStale("call-1");

      expect(stale).toBe(false);
    });

    it("should return false for non-existent call", () => {
      const stale = functionCallService.isCallStale("non-existent");

      expect(stale).toBe(false);
    });
  });

  describe("reset", () => {
    it("should reset all service state", () => {
      functionCallService.createCall("call-1", "getWeather");
      functionCallService.createCall("call-2", "getTime");
      functionCallService.setCallResult("call-1", {});

      functionCallService.reset();

      expect(functionCallService.getActiveCalls()).toHaveLength(0);
      expect(functionCallService.getCompletedCalls()).toHaveLength(0);
    });
  });
});
