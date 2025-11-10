/**
 * MockDOMAdapter - Mock implementation for testing
 *
 * Provides a testable mock of DOM operations that doesn't require a real DOM.
 * Tracks method calls for verification in tests.
 */

export class MockDOMAdapter {
  constructor() {
    this.elements = new Map();
    this.eventListeners = new Map();
    this.callLog = [];
    this._nextElementId = 1;
  }

  // ======================
  // Helper Methods
  // ======================

  /**
   * Log a method call for test verification
   * @private
   */
  _logCall(method, args) {
    this.callLog.push({ method, args, timestamp: Date.now() });
  }

  /**
   * Create a mock element with basic DOM-like structure
   * @private
   */
  _createMockElement(tagName) {
    const id = `mock-element-${this._nextElementId++}`;
    const element = {
      id: null,
      tagName: tagName.toUpperCase(),
      classList: new MockClassList(),
      style: {},
      attributes: new Map(),
      children: [],
      parentElement: null,
      innerHTML: "",
      textContent: "",
      _mockId: id,
    };
    this.elements.set(id, element);
    return element;
  }

  /**
   * Get all logged calls
   * @returns {Array} Call log
   */
  getCallLog() {
    return [...this.callLog];
  }

  /**
   * Clear call log
   */
  clearCallLog() {
    this.callLog = [];
  }

  /**
   * Register a mock element by selector
   * @param {string} selector - CSS selector
   * @param {object} element - Mock element
   */
  registerElement(selector, element) {
    this.elements.set(selector, element);
  }

  /**
   * Reset all mock state
   */
  reset() {
    this.elements.clear();
    this.eventListeners.clear();
    this.callLog = [];
    this._nextElementId = 1;
  }

  // ======================
  // DOM Query Methods
  // ======================

  querySelector(element, selector) {
    // Handle both querySelector(selector) and querySelector(element, selector)
    let searchRoot;
    let searchSelector;

    if (typeof element === "string") {
      // Called as querySelector(selector)
      searchSelector = element;
      this._logCall("querySelector", [searchSelector]);
      return this.elements.get(searchSelector) || null;
    } else {
      // Called as querySelector(element, selector)
      searchRoot = element;
      searchSelector = selector;
      this._logCall("querySelector", [searchRoot, searchSelector]);

      if (!searchRoot) return null;

      // Simple class selector search in children
      if (searchSelector.startsWith(".")) {
        const className = searchSelector.substring(1);
        return this._findInChildren(searchRoot, (el) => el.classList?.contains(className));
      }

      // Simple tag selector search in children
      return this._findInChildren(searchRoot, (el) => el.tagName === searchSelector.toUpperCase());
    }
  }

  /**
   * Find element in children recursively
   * @private
   */
  _findInChildren(parent, predicate) {
    if (!parent || !parent.children) return null;

    for (const child of parent.children) {
      if (predicate(child)) return child;
      const found = this._findInChildren(child, predicate);
      if (found) return found;
    }

    return null;
  }

  querySelectorAll(selector) {
    this._logCall("querySelectorAll", [selector]);
    const elements = Array.from(this.elements.values()).filter((el) => el && typeof el === "object" && el._mockId);
    return elements;
  }

  getElementById(id) {
    this._logCall("getElementById", [id]);
    return Array.from(this.elements.values()).find((el) => el?.id === id) || null;
  }

  // ======================
  // Element Creation
  // ======================

  createElement(tagName) {
    this._logCall("createElement", [tagName]);
    return this._createMockElement(tagName);
  }

  createTextNode(text) {
    this._logCall("createTextNode", [text]);
    return { nodeValue: text, nodeType: 3 };
  }

  // ======================
  // Attribute Methods
  // ======================

  setAttribute(element, name, value) {
    this._logCall("setAttribute", [element, name, value]);
    if (element?.attributes) {
      element.attributes.set(name, value);
      if (name === "id") element.id = value;
      if (name === "disabled") element.disabled = true;
      if (name === "placeholder") element.placeholder = value;
      if (name === "value") element.value = value;
    }
  }

  getAttribute(element, name) {
    this._logCall("getAttribute", [element, name]);
    return element?.attributes?.get(name) ?? null;
  }

  removeAttribute(element, name) {
    this._logCall("removeAttribute", [element, name]);
    if (element?.attributes) {
      element.attributes.delete(name);
      if (name === "disabled" && element) {
        element.disabled = false;
      }
    }
  }

  hasAttribute(element, name) {
    this._logCall("hasAttribute", [element, name]);
    return element?.attributes?.has(name) ?? false;
  }

  // ======================
  // Form Methods
  // ======================

  setValue(element, value) {
    this._logCall("setValue", [element, value]);
    if (element) {
      element.value = value;
    }
  }

  getValue(element) {
    this._logCall("getValue", [element]);
    return element?.value ?? "";
  }

  // ======================
  // Class Methods
  // ======================

  addClass(element, ...classNames) {
    this._logCall("addClass", [element, ...classNames]);
    element?.classList?.add(...classNames);
  }

  removeClass(element, className) {
    this._logCall("removeClass", [element, className]);
    element?.classList?.remove(className);
  }

  toggleClass(element, className) {
    this._logCall("toggleClass", [element, className]);
    return element?.classList?.toggle(className) ?? false;
  }

  hasClass(element, className) {
    this._logCall("hasClass", [element, className]);
    return element?.classList?.contains(className) ?? false;
  }

  // ======================
  // Content Methods
  // ======================

  setInnerHTML(element, html) {
    this._logCall("setInnerHTML", [element, html]);
    if (element) element.innerHTML = html;
  }

  getInnerHTML(element) {
    this._logCall("getInnerHTML", [element]);
    return element?.innerHTML ?? "";
  }

  setTextContent(element, text) {
    this._logCall("setTextContent", [element, text]);
    if (element) element.textContent = text;
  }

  getTextContent(element) {
    this._logCall("getTextContent", [element]);
    return element?.textContent ?? "";
  }

  // ======================
  // Tree Manipulation
  // ======================

  appendChild(parent, child) {
    this._logCall("appendChild", [parent, child]);
    if (parent && child) {
      if (!parent.children) parent.children = [];
      parent.children.push(child);
      child.parentElement = parent;
    }
  }

  removeChild(parent, child) {
    this._logCall("removeChild", [parent, child]);
    if (parent?.children) {
      const index = parent.children.indexOf(child);
      if (index > -1) {
        parent.children.splice(index, 1);
        if (child) child.parentElement = null;
      }
    }
  }

  remove(element) {
    this._logCall("remove", [element]);
    if (element?.parentElement) {
      this.removeChild(element.parentElement, element);
    }
  }

  insertBefore(parent, newElement, referenceElement) {
    this._logCall("insertBefore", [parent, newElement, referenceElement]);
    if (parent && newElement) {
      if (!parent.children) parent.children = [];
      const index = parent.children.indexOf(referenceElement);
      if (index > -1) {
        parent.children.splice(index, 0, newElement);
      } else {
        parent.children.push(newElement);
      }
      newElement.parentElement = parent;
    }
  }

  // ======================
  // Event Methods
  // ======================

  addEventListener(target, event, handler, options) {
    this._logCall("addEventListener", [target, event, handler, options]);
    const key = `${target?._mockId || "window"}_${event}`;
    if (!this.eventListeners.has(key)) {
      this.eventListeners.set(key, []);
    }
    this.eventListeners.get(key).push({ handler, options });
  }

  removeEventListener(target, event, handler, options) {
    this._logCall("removeEventListener", [target, event, handler, options]);
    const key = `${target?._mockId || "window"}_${event}`;
    const listeners = this.eventListeners.get(key);
    if (listeners) {
      const index = listeners.findIndex((l) => l.handler === handler);
      if (index > -1) listeners.splice(index, 1);
    }
  }

  /**
   * Simulate event dispatch (for testing)
   * @param {object} target - Target element
   * @param {string} event - Event name
   * @param {object} [eventData] - Event data
   */
  dispatchEvent(target, event, eventData = {}) {
    const key = `${target?._mockId || "window"}_${event}`;
    const listeners = this.eventListeners.get(key) || [];
    listeners.forEach(({ handler }) => {
      handler(eventData);
    });
  }

  // ======================
  // Style Methods
  // ======================

  getComputedStyle(element) {
    this._logCall("getComputedStyle", [element]);
    return element?.style || {};
  }

  setStyle(element, property, value) {
    this._logCall("setStyle", [element, property, value]);
    if (element?.style) {
      element.style[property] = value;
    }
  }

  getStyle(element, property) {
    this._logCall("getStyle", [element, property]);
    return element?.style?.[property] ?? "";
  }

  // ======================
  // Measurement Methods
  // ======================

  getBoundingClientRect(element) {
    this._logCall("getBoundingClientRect", [element]);
    return {
      top: 0,
      left: 0,
      right: 100,
      bottom: 100,
      width: 100,
      height: 100,
      x: 0,
      y: 0,
    };
  }

  // ======================
  // Focus Methods
  // ======================

  focus(element) {
    this._logCall("focus", [element]);
    if (element) element._focused = true;
  }

  blur(element) {
    this._logCall("blur", [element]);
    if (element) element._focused = false;
  }

  // ======================
  // Scroll Methods
  // ======================

  scrollIntoView(element, options) {
    this._logCall("scrollIntoView", [element, options]);
  }

  // ======================
  // Document/Window
  // ======================

  getBody() {
    this._logCall("getBody", []);
    if (!this.elements.has("body")) {
      this.elements.set("body", this._createMockElement("body"));
    }
    return this.elements.get("body");
  }

  getHead() {
    this._logCall("getHead", []);
    if (!this.elements.has("head")) {
      this.elements.set("head", this._createMockElement("head"));
    }
    return this.elements.get("head");
  }

  getDocument() {
    this._logCall("getDocument", []);
    return {
      body: this.getBody(),
      head: this.getHead(),
      querySelector: this.querySelector.bind(this),
      querySelectorAll: this.querySelectorAll.bind(this),
      getElementById: this.getElementById.bind(this),
      createElement: this.createElement.bind(this),
    };
  }

  getWindow() {
    this._logCall("getWindow", []);
    return { mockWindow: true };
  }

  // ======================
  // Timing Methods
  // ======================

  requestAnimationFrame(callback) {
    this._logCall("requestAnimationFrame", [callback]);
    // In tests, execute immediately
    const id = this._nextElementId++;
    setTimeout(() => callback(Date.now()), 0);
    return id;
  }

  cancelAnimationFrame(id) {
    this._logCall("cancelAnimationFrame", [id]);
  }

  setTimeout(callback, delay) {
    this._logCall("setTimeout", [callback, delay]);
    return globalThis.setTimeout(callback, delay);
  }

  clearTimeout(id) {
    this._logCall("clearTimeout", [id]);
    globalThis.clearTimeout(id);
  }

  // ======================
  // Selector Matching
  // ======================

  matches(element, selector) {
    this._logCall("matches", [element, selector]);
    // Simple mock - just check tagName
    if (selector.startsWith(".")) {
      return element?.classList?.contains(selector.slice(1)) ?? false;
    }
    if (selector.startsWith("#")) {
      return element?.id === selector.slice(1);
    }
    return element?.tagName?.toLowerCase() === selector.toLowerCase();
  }

  closest(element, selector) {
    this._logCall("closest", [element, selector]);
    let current = element;
    while (current) {
      if (this.matches(current, selector)) {
        return current;
      }
      current = current.parentElement;
    }
    return null;
  }
}

/**
 * MockClassList - Simple mock of DOMTokenList for classList
 */
class MockClassList {
  constructor() {
    this.classes = new Set();
  }

  add(className) {
    this.classes.add(className);
  }

  remove(className) {
    this.classes.delete(className);
  }

  toggle(className) {
    if (this.classes.has(className)) {
      this.classes.delete(className);
      return false;
    }
    this.classes.add(className);
    return true;
  }

  contains(className) {
    return this.classes.has(className);
  }

  toString() {
    return Array.from(this.classes).join(" ");
  }
}
