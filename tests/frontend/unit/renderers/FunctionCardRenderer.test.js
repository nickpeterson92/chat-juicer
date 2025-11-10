/**
 * FunctionCardRenderer Unit Tests
 */

import { MockDOMAdapter } from "@test-helpers/MockDOMAdapter.js";
import { beforeEach, describe, expect, it } from "vitest";
import {
  getFunctionIcon,
  markCardAsOld,
  renderFunctionCard,
  renderFunctionParams,
  toggleCardExpansion,
  updateCardArguments,
  updateCardResult,
  updateCardStatus,
} from "@/ui/renderers/function-card-renderer.js";

describe("FunctionCardRenderer", () => {
  let mockDOM;

  beforeEach(() => {
    mockDOM = new MockDOMAdapter();
  });

  describe("getFunctionIcon", () => {
    it("should return icon for known function", () => {
      expect(getFunctionIcon("list_directory")).toContain("svg");
      expect(getFunctionIcon("read_file")).toContain("svg");
      expect(getFunctionIcon("search_files")).toContain("svg");
    });

    it("should handle underscore variations", () => {
      expect(getFunctionIcon("list-directory")).toContain("svg");
      expect(getFunctionIcon("listdirectory")).toContain("svg");
    });

    it("should return default icon for unknown function", () => {
      const icon = getFunctionIcon("unknown_function");
      expect(icon).toContain("svg");
    });

    it("should be case insensitive", () => {
      expect(getFunctionIcon("LIST_DIRECTORY")).toContain("svg");
      expect(getFunctionIcon("List_Directory")).toContain("svg");
    });
  });

  describe("renderFunctionCard", () => {
    it("should render complete function card", () => {
      const callData = {
        id: "call-123",
        name: "read_file",
        status: "executing",
        args: { path: "test.txt" },
        result: null,
      };

      const card = renderFunctionCard(callData, mockDOM);

      expect(card).toBeDefined();
      expect(mockDOM.getAttribute(card, "id")).toBe("function-call-123");
      expect(mockDOM.hasClass(card, "function-call-card")).toBe(true);
    });

    it("should start collapsed by default", () => {
      const callData = {
        id: "call-456",
        name: "test_function",
        status: "pending",
        args: {},
      };

      const card = renderFunctionCard(callData, mockDOM, true);

      expect(mockDOM.getAttribute(card, "data-expanded")).toBe("false");
    });

    it("should support expanded initial state", () => {
      const callData = {
        id: "call-789",
        name: "test_function",
        status: "pending",
        args: {},
      };

      const card = renderFunctionCard(callData, mockDOM, false);

      expect(mockDOM.getAttribute(card, "data-expanded")).toBe("true");
    });

    it("should render header with all elements", () => {
      const callData = {
        id: "call-111",
        name: "read_file",
        status: "executing",
        args: { path: "test.txt" },
      };

      const card = renderFunctionCard(callData, mockDOM);
      const header = mockDOM.querySelector(card, ".function-header");

      expect(header).toBeDefined();
      expect(mockDOM.querySelector(header, ".function-icon")).toBeDefined();
      expect(mockDOM.querySelector(header, ".function-name")).toBeDefined();
      expect(mockDOM.querySelector(header, ".function-params")).toBeDefined();
      expect(mockDOM.querySelector(header, ".function-status")).toBeDefined();
      expect(mockDOM.querySelector(header, ".expand-button")).toBeDefined();
    });

    it("should render body with arguments", () => {
      const callData = {
        id: "call-222",
        name: "test",
        status: "pending",
        args: { key: "value" },
      };

      const card = renderFunctionCard(callData, mockDOM);
      const body = mockDOM.querySelector(card, ".function-body");

      expect(body).toBeDefined();
    });
  });

  describe("renderFunctionParams", () => {
    it("should render empty params", () => {
      expect(renderFunctionParams(null)).toBe("()");
      expect(renderFunctionParams({})).toBe("()");
    });

    it("should render single simple param", () => {
      const args = { path: "test.txt" };
      const params = renderFunctionParams(args);

      expect(params).toContain("path");
      expect(params).toContain("test.txt");
    });

    it("should render multiple params as keys only", () => {
      const args = { path: "test.txt", mode: "read", encoding: "utf8" };
      const params = renderFunctionParams(args);

      expect(params).toContain("path");
      expect(params).toContain("mode");
      expect(params).toContain("encoding");
    });

    it("should handle JSON string args", () => {
      const args = '{"path": "test.txt"}';
      const params = renderFunctionParams(args);

      expect(params).toContain("path");
    });

    it("should handle invalid JSON gracefully", () => {
      const args = "{invalid json}";
      const params = renderFunctionParams(args);

      expect(params).toBe("(...)");
    });
  });

  describe("updateCardStatus", () => {
    it("should update status text", () => {
      const callData = { id: "call-1", name: "test", status: "pending", args: {} };
      const card = renderFunctionCard(callData, mockDOM);

      updateCardStatus(card, "executing", mockDOM);

      const statusDiv = mockDOM.querySelector(card, ".function-status");
      expect(mockDOM.getTextContent(statusDiv)).toBe("executing");
    });

    it("should add success class on completion", () => {
      const callData = { id: "call-2", name: "test", status: "pending", args: {} };
      const card = renderFunctionCard(callData, mockDOM);

      updateCardStatus(card, "completed", mockDOM);

      expect(mockDOM.hasClass(card, "success")).toBe(true);
      expect(mockDOM.hasClass(card, "executing")).toBe(false);
    });

    it("should add error class on failure", () => {
      const callData = { id: "call-3", name: "test", status: "pending", args: {} };
      const card = renderFunctionCard(callData, mockDOM);

      updateCardStatus(card, "error", mockDOM);

      expect(mockDOM.hasClass(card, "error")).toBe(true);
      expect(mockDOM.hasClass(card, "executing")).toBe(false);
    });

    it("should add executing class for in-progress status", () => {
      const callData = { id: "call-4", name: "test", status: "pending", args: {} };
      const card = renderFunctionCard(callData, mockDOM);

      updateCardStatus(card, "streaming", mockDOM);

      expect(mockDOM.hasClass(card, "executing")).toBe(true);
    });
  });

  describe("updateCardResult", () => {
    it("should update result section", () => {
      const callData = { id: "call-5", name: "test", status: "pending", args: {} };
      const card = renderFunctionCard(callData, mockDOM);

      updateCardResult(card, { success: true, data: "result" }, mockDOM);

      const resultSection = mockDOM.querySelector(card, ".function-result");
      expect(resultSection).toBeDefined();
    });

    it("should handle string results", () => {
      const callData = { id: "call-6", name: "test", status: "pending", args: {} };
      const card = renderFunctionCard(callData, mockDOM);

      updateCardResult(card, "Simple result", mockDOM);

      const resultSection = mockDOM.querySelector(card, ".function-result");
      expect(resultSection).toBeDefined();
    });
  });

  describe("updateCardArguments", () => {
    it("should update arguments in header", () => {
      const callData = { id: "call-7", name: "test", status: "pending", args: {} };
      const card = renderFunctionCard(callData, mockDOM);

      updateCardArguments(card, { path: "new.txt" }, mockDOM);

      const paramsDiv = mockDOM.querySelector(card, ".function-params");
      const text = mockDOM.getTextContent(paramsDiv);
      expect(text).toContain("path");
    });

    it("should handle JSON string arguments", () => {
      const callData = { id: "call-8", name: "test", status: "pending", args: {} };
      const card = renderFunctionCard(callData, mockDOM);

      updateCardArguments(card, '{"key": "value"}', mockDOM);

      const paramsDiv = mockDOM.querySelector(card, ".function-params");
      expect(mockDOM.getTextContent(paramsDiv)).toContain("key");
    });
  });

  describe("toggleCardExpansion", () => {
    it("should toggle from collapsed to expanded", () => {
      const callData = { id: "call-9", name: "test", status: "pending", args: {} };
      const card = renderFunctionCard(callData, mockDOM, true);

      const newState = toggleCardExpansion(card, mockDOM);

      expect(newState).toBe(true);
      expect(mockDOM.getAttribute(card, "data-expanded")).toBe("true");
    });

    it("should toggle from expanded to collapsed", () => {
      const callData = { id: "call-10", name: "test", status: "pending", args: {} };
      const card = renderFunctionCard(callData, mockDOM, false);

      const newState = toggleCardExpansion(card, mockDOM);

      expect(newState).toBe(false);
      expect(mockDOM.getAttribute(card, "data-expanded")).toBe("false");
    });

    it("should update expand button icon", () => {
      const callData = { id: "call-11", name: "test", status: "pending", args: {} };
      const card = renderFunctionCard(callData, mockDOM, true);

      toggleCardExpansion(card, mockDOM);

      const expandBtn = mockDOM.querySelector(card, ".expand-button");
      expect(mockDOM.getInnerHTML(expandBtn)).toBe("▲");
    });
  });

  describe("markCardAsOld", () => {
    it("should add old class to card", () => {
      const callData = { id: "call-12", name: "test", status: "pending", args: {} };
      const card = renderFunctionCard(callData, mockDOM);

      markCardAsOld(card, mockDOM);

      expect(mockDOM.hasClass(card, "old")).toBe(true);
    });
  });
});
