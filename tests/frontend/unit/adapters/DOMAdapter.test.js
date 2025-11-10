/**
 * DOMAdapter Unit Tests
 *
 * Tests the real DOMAdapter using Happy-DOM environment
 */

import { DOMAdapter } from "@adapters/DOMAdapter.js";
import { beforeEach, describe, expect, it } from "vitest";

describe("DOMAdapter", () => {
  let adapter;
  let testElement;

  beforeEach(() => {
    adapter = new DOMAdapter();
    // Clean up any existing test elements
    document.body.innerHTML = "";
    testElement = null;
  });

  describe("Element Creation", () => {
    it("should create element with correct tag name", () => {
      const div = adapter.createElement("div");
      expect(div).toBeDefined();
      expect(div.tagName).toBe("DIV");
    });

    it("should create text node with content", () => {
      const text = adapter.createTextNode("Hello World");
      expect(text).toBeDefined();
      expect(text.nodeValue).toBe("Hello World");
    });

    it("should create multiple different elements", () => {
      const div = adapter.createElement("div");
      const span = adapter.createElement("span");
      const button = adapter.createElement("button");

      expect(div.tagName).toBe("DIV");
      expect(span.tagName).toBe("SPAN");
      expect(button.tagName).toBe("BUTTON");
    });
  });

  describe("Element Querying", () => {
    beforeEach(() => {
      document.body.innerHTML = `
        <div id="test-container" class="container">
          <span class="test-span">Hello</span>
          <button id="test-button">Click</button>
        </div>
      `;
    });

    it("should query element by ID", () => {
      const element = adapter.getElementById("test-button");
      expect(element).toBeDefined();
      expect(element.tagName).toBe("BUTTON");
    });

    it("should query element by selector", () => {
      const element = adapter.querySelector(".test-span");
      expect(element).toBeDefined();
      expect(element.tagName).toBe("SPAN");
    });

    it("should query all elements by selector", () => {
      const elements = adapter.querySelectorAll("div, span, button");
      expect(elements.length).toBeGreaterThan(0);
    });

    it("should return null for non-existent ID", () => {
      const element = adapter.getElementById("does-not-exist");
      expect(element).toBeNull();
    });
  });

  describe("Attributes", () => {
    beforeEach(() => {
      testElement = adapter.createElement("div");
    });

    it("should set and get attribute", () => {
      adapter.setAttribute(testElement, "data-test", "value");
      const value = adapter.getAttribute(testElement, "data-test");
      expect(value).toBe("value");
    });

    it("should remove attribute", () => {
      adapter.setAttribute(testElement, "data-test", "value");
      adapter.removeAttribute(testElement, "data-test");
      const value = adapter.getAttribute(testElement, "data-test");
      expect(value).toBeNull();
    });

    it("should return null for non-existent attribute", () => {
      const value = adapter.getAttribute(testElement, "does-not-exist");
      expect(value).toBeNull();
    });
  });

  describe("CSS Classes", () => {
    beforeEach(() => {
      testElement = adapter.createElement("div");
    });

    it("should add class", () => {
      adapter.addClass(testElement, "test-class");
      expect(adapter.hasClass(testElement, "test-class")).toBe(true);
    });

    it("should remove class", () => {
      adapter.addClass(testElement, "test-class");
      adapter.removeClass(testElement, "test-class");
      expect(adapter.hasClass(testElement, "test-class")).toBe(false);
    });

    it("should toggle class on and off", () => {
      const added = adapter.toggleClass(testElement, "test-class");
      expect(added).toBe(true);
      expect(adapter.hasClass(testElement, "test-class")).toBe(true);

      const removed = adapter.toggleClass(testElement, "test-class");
      expect(removed).toBe(false);
      expect(adapter.hasClass(testElement, "test-class")).toBe(false);
    });

    it("should handle multiple classes", () => {
      adapter.addClass(testElement, "class1");
      adapter.addClass(testElement, "class2");
      adapter.addClass(testElement, "class3");

      expect(adapter.hasClass(testElement, "class1")).toBe(true);
      expect(adapter.hasClass(testElement, "class2")).toBe(true);
      expect(adapter.hasClass(testElement, "class3")).toBe(true);
    });
  });

  describe("Content Manipulation", () => {
    beforeEach(() => {
      testElement = adapter.createElement("div");
    });

    it("should set and get innerHTML", () => {
      const html = "<span>Test</span>";
      adapter.setInnerHTML(testElement, html);
      expect(adapter.getInnerHTML(testElement)).toBe(html);
    });

    it("should set and get textContent", () => {
      const text = "Hello World";
      adapter.setTextContent(testElement, text);
      expect(adapter.getTextContent(testElement)).toBe(text);
    });

    it("should clear content when setting empty string", () => {
      adapter.setTextContent(testElement, "Initial");
      adapter.setTextContent(testElement, "");
      expect(adapter.getTextContent(testElement)).toBe("");
    });
  });

  describe("DOM Tree Manipulation", () => {
    let parent;
    let child;

    beforeEach(() => {
      parent = adapter.createElement("div");
      child = adapter.createElement("span");
    });

    it("should append child", () => {
      adapter.appendChild(parent, child);
      expect(parent.children.length).toBe(1);
      expect(parent.children[0]).toBe(child);
    });

    it("should remove child", () => {
      adapter.appendChild(parent, child);
      adapter.removeChild(parent, child);
      expect(parent.children.length).toBe(0);
    });

    it("should remove element from parent", () => {
      adapter.appendChild(parent, child);
      adapter.getBody().appendChild(parent);
      adapter.remove(child);
      expect(parent.children.length).toBe(0);
    });

    it("should insert before reference element", () => {
      const child1 = adapter.createElement("span");
      const child2 = adapter.createElement("span");
      const child3 = adapter.createElement("span");

      adapter.appendChild(parent, child1);
      adapter.appendChild(parent, child3);
      adapter.insertBefore(parent, child2, child3);

      expect(parent.children.length).toBe(3);
      expect(parent.children[1]).toBe(child2);
    });
  });

  describe("Event Handling", () => {
    let element;
    let eventFired;

    beforeEach(() => {
      element = adapter.createElement("button");
      eventFired = false;
    });

    it("should add event listener", () => {
      const handler = () => {
        eventFired = true;
      };
      adapter.addEventListener(element, "click", handler);
      element.click();
      expect(eventFired).toBe(true);
    });

    it("should remove event listener", () => {
      const handler = () => {
        eventFired = true;
      };
      adapter.addEventListener(element, "click", handler);
      adapter.removeEventListener(element, "click", handler);
      element.click();
      expect(eventFired).toBe(false);
    });

    it("should handle multiple listeners for same event", () => {
      let count = 0;
      const handler1 = () => {
        count++;
      };
      const handler2 = () => {
        count++;
      };

      adapter.addEventListener(element, "click", handler1);
      adapter.addEventListener(element, "click", handler2);
      element.click();

      expect(count).toBe(2);
    });
  });

  describe("Styles", () => {
    beforeEach(() => {
      testElement = adapter.createElement("div");
    });

    it("should set and get inline style", () => {
      adapter.setStyle(testElement, "color", "red");
      expect(adapter.getStyle(testElement, "color")).toBe("red");
    });

    it("should get computed style", () => {
      adapter.getBody().appendChild(testElement);
      const computed = adapter.getComputedStyle(testElement);
      expect(computed).toBeDefined();
    });
  });

  describe("Focus Management", () => {
    let input;

    beforeEach(() => {
      input = adapter.createElement("input");
      adapter.getBody().appendChild(input);
    });

    it("should focus element", () => {
      adapter.focus(input);
      expect(document.activeElement).toBe(input);
    });

    it("should blur element", () => {
      adapter.focus(input);
      adapter.blur(input);
      expect(document.activeElement).not.toBe(input);
    });
  });

  describe("Document and Window Access", () => {
    it("should get body", () => {
      const body = adapter.getBody();
      expect(body).toBe(document.body);
    });

    it("should get head", () => {
      const head = adapter.getHead();
      expect(head).toBe(document.head);
    });

    it("should get document", () => {
      const doc = adapter.getDocument();
      expect(doc).toBe(document);
    });

    it("should get window", () => {
      const win = adapter.getWindow();
      expect(win).toBe(window);
    });
  });

  describe("Timing Functions", () => {
    it("should request animation frame", () => {
      return new Promise((resolve) => {
        const id = adapter.requestAnimationFrame(() => {
          expect(true).toBe(true);
          resolve();
        });
        // Happy-DOM returns objects for IDs, browser returns numbers
        expect(id).toBeDefined();
      });
    });

    it("should set timeout", () => {
      return new Promise((resolve) => {
        const id = adapter.setTimeout(() => {
          expect(true).toBe(true);
          resolve();
        }, 10);
        // Happy-DOM returns objects for IDs, browser returns numbers
        expect(id).toBeDefined();
      });
    });

    it("should clear timeout", () => {
      return new Promise((resolve) => {
        let fired = false;
        const id = adapter.setTimeout(() => {
          fired = true;
        }, 50);
        adapter.clearTimeout(id);

        setTimeout(() => {
          expect(fired).toBe(false);
          resolve();
        }, 100);
      });
    });
  });

  describe("Selector Matching", () => {
    beforeEach(() => {
      document.body.innerHTML = `
        <div id="parent" class="container">
          <span class="child">Text</span>
        </div>
      `;
      testElement = document.querySelector(".child");
    });

    it("should match element against selector", () => {
      expect(adapter.matches(testElement, "span")).toBe(true);
      expect(adapter.matches(testElement, ".child")).toBe(true);
      expect(adapter.matches(testElement, "div")).toBe(false);
    });

    it("should find closest ancestor", () => {
      const parent = adapter.closest(testElement, ".container");
      expect(parent).toBeDefined();
      expect(parent.id).toBe("parent");
    });

    it("should return null if no matching ancestor", () => {
      const notFound = adapter.closest(testElement, ".does-not-exist");
      expect(notFound).toBeNull();
    });
  });

  describe("Measurements", () => {
    beforeEach(() => {
      testElement = adapter.createElement("div");
      adapter.getBody().appendChild(testElement);
    });

    it("should get bounding client rect", () => {
      const rect = adapter.getBoundingClientRect(testElement);
      expect(rect).toBeDefined();
      expect(rect).toHaveProperty("top");
      expect(rect).toHaveProperty("left");
      expect(rect).toHaveProperty("width");
      expect(rect).toHaveProperty("height");
    });

    it("should scroll into view", () => {
      // Just verify it doesn't throw
      expect(() => {
        adapter.scrollIntoView(testElement);
      }).not.toThrow();
    });
  });
});
