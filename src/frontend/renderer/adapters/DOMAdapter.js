/**
 * DOMAdapter - Abstraction layer for DOM operations
 *
 * This adapter provides a testable interface for all DOM manipulations,
 * allowing us to mock DOM operations in unit tests without requiring a real browser.
 *
 * @interface IDOMAdapter
 */

/**
 * Real DOM implementation of the adapter
 * Used in production Electron renderer process
 */
export class DOMAdapter {
  /**
   * Query DOM element by selector
   * @param {string} selector - CSS selector
   * @returns {HTMLElement | null} Element or null if not found
   */
  querySelector(selector) {
    return document.querySelector(selector);
  }

  /**
   * Query all DOM elements by selector
   * @param {string} selector - CSS selector
   * @returns {NodeList} NodeList of matching elements
   */
  querySelectorAll(selector) {
    return document.querySelectorAll(selector);
  }

  /**
   * Get element by ID
   * @param {string} id - Element ID
   * @returns {HTMLElement | null} Element or null if not found
   */
  getElementById(id) {
    return document.getElementById(id);
  }

  /**
   * Create a new DOM element
   * @param {string} tagName - HTML tag name
   * @returns {HTMLElement} Created element
   */
  createElement(tagName) {
    return document.createElement(tagName);
  }

  /**
   * Create a text node
   * @param {string} text - Text content
   * @returns {Text} Text node
   */
  createTextNode(text) {
    return document.createTextNode(text);
  }

  /**
   * Set element attribute
   * @param {HTMLElement} element - Target element
   * @param {string} name - Attribute name
   * @param {string} value - Attribute value
   */
  setAttribute(element, name, value) {
    element.setAttribute(name, value);
  }

  /**
   * Get element attribute
   * @param {HTMLElement} element - Target element
   * @param {string} name - Attribute name
   * @returns {string | null} Attribute value or null
   */
  getAttribute(element, name) {
    return element.getAttribute(name);
  }

  /**
   * Remove element attribute
   * @param {HTMLElement} element - Target element
   * @param {string} name - Attribute name
   */
  removeAttribute(element, name) {
    element.removeAttribute(name);
  }

  /**
   * Add CSS class(es) to element
   * @param {HTMLElement} element - Target element
   * @param {...string} classNames - Class name(s) to add
   */
  addClass(element, ...classNames) {
    element.classList.add(...classNames);
  }

  /**
   * Remove CSS class from element
   * @param {HTMLElement} element - Target element
   * @param {string} className - Class name to remove
   */
  removeClass(element, className) {
    element.classList.remove(className);
  }

  /**
   * Toggle CSS class on element
   * @param {HTMLElement} element - Target element
   * @param {string} className - Class name to toggle
   * @returns {boolean} True if class is now present
   */
  toggleClass(element, className) {
    return element.classList.toggle(className);
  }

  /**
   * Check if element has CSS class
   * @param {HTMLElement} element - Target element
   * @param {string} className - Class name to check
   * @returns {boolean} True if class is present
   */
  hasClass(element, className) {
    return element.classList.contains(className);
  }

  /**
   * Set element innerHTML
   * @param {HTMLElement} element - Target element
   * @param {string} html - HTML content
   */
  setInnerHTML(element, html) {
    element.innerHTML = html;
  }

  /**
   * Get element innerHTML
   * @param {HTMLElement} element - Target element
   * @returns {string} HTML content
   */
  getInnerHTML(element) {
    return element.innerHTML;
  }

  /**
   * Set element textContent
   * @param {HTMLElement} element - Target element
   * @param {string} text - Text content
   */
  setTextContent(element, text) {
    element.textContent = text;
  }

  /**
   * Get element textContent
   * @param {HTMLElement} element - Target element
   * @returns {string} Text content
   */
  getTextContent(element) {
    return element.textContent;
  }

  /**
   * Append child element
   * @param {HTMLElement} parent - Parent element
   * @param {HTMLElement | Text} child - Child element or text node
   */
  appendChild(parent, child) {
    parent.appendChild(child);
  }

  /**
   * Remove child element
   * @param {HTMLElement} parent - Parent element
   * @param {HTMLElement} child - Child element to remove
   */
  removeChild(parent, child) {
    parent.removeChild(child);
  }

  /**
   * Remove element from DOM
   * @param {HTMLElement} element - Element to remove
   */
  remove(element) {
    element.remove();
  }

  /**
   * Insert element before reference
   * @param {HTMLElement} parent - Parent element
   * @param {HTMLElement} newElement - New element to insert
   * @param {HTMLElement} referenceElement - Reference element
   */
  insertBefore(parent, newElement, referenceElement) {
    parent.insertBefore(newElement, referenceElement);
  }

  /**
   * Add event listener to element
   * @param {HTMLElement | Window | Document} target - Target element
   * @param {string} event - Event name
   * @param {Function} handler - Event handler
   * @param {boolean | AddEventListenerOptions} [options] - Event options
   */
  addEventListener(target, event, handler, options) {
    target.addEventListener(event, handler, options);
  }

  /**
   * Remove event listener from element
   * @param {HTMLElement | Window | Document} target - Target element
   * @param {string} event - Event name
   * @param {Function} handler - Event handler
   * @param {boolean | EventListenerOptions} [options] - Event options
   */
  removeEventListener(target, event, handler, options) {
    target.removeEventListener(event, handler, options);
  }

  /**
   * Get computed style of element
   * @param {HTMLElement} element - Target element
   * @returns {CSSStyleDeclaration} Computed style
   */
  getComputedStyle(element) {
    return window.getComputedStyle(element);
  }

  /**
   * Set inline style property
   * @param {HTMLElement} element - Target element
   * @param {string} property - CSS property name
   * @param {string} value - CSS property value
   */
  setStyle(element, property, value) {
    element.style[property] = value;
  }

  /**
   * Get inline style property
   * @param {HTMLElement} element - Target element
   * @param {string} property - CSS property name
   * @returns {string} CSS property value
   */
  getStyle(element, property) {
    return element.style[property];
  }

  /**
   * Get element bounding rectangle
   * @param {HTMLElement} element - Target element
   * @returns {DOMRect} Bounding rectangle
   */
  getBoundingClientRect(element) {
    return element.getBoundingClientRect();
  }

  /**
   * Scroll element into view
   * @param {HTMLElement} element - Target element
   * @param {ScrollIntoViewOptions} [options] - Scroll options
   */
  scrollIntoView(element, options) {
    element.scrollIntoView(options);
  }

  /**
   * Focus on element
   * @param {HTMLElement} element - Target element
   */
  focus(element) {
    element.focus();
  }

  /**
   * Blur element
   * @param {HTMLElement} element - Target element
   */
  blur(element) {
    element.blur();
  }

  /**
   * Get document body
   * @returns {HTMLElement} Document body
   */
  getBody() {
    return document.body;
  }

  /**
   * Get document head
   * @returns {HTMLElement} Document head
   */
  getHead() {
    return document.head;
  }

  /**
   * Get document
   * @returns {Document} Document object
   */
  getDocument() {
    return document;
  }

  /**
   * Get window
   * @returns {Window} Window object
   */
  getWindow() {
    return window;
  }

  /**
   * Request animation frame
   * @param {FrameRequestCallback} callback - Callback function
   * @returns {number} Request ID
   */
  requestAnimationFrame(callback) {
    return window.requestAnimationFrame(callback);
  }

  /**
   * Cancel animation frame
   * @param {number} id - Request ID to cancel
   */
  cancelAnimationFrame(id) {
    window.cancelAnimationFrame(id);
  }

  /**
   * Set timeout
   * @param {Function} callback - Callback function
   * @param {number} delay - Delay in milliseconds
   * @returns {number} Timeout ID
   */
  setTimeout(callback, delay) {
    return window.setTimeout(callback, delay);
  }

  /**
   * Clear timeout
   * @param {number} id - Timeout ID to clear
   */
  clearTimeout(id) {
    window.clearTimeout(id);
  }

  /**
   * Check if element matches selector
   * @param {HTMLElement} element - Target element
   * @param {string} selector - CSS selector
   * @returns {boolean} True if element matches
   */
  matches(element, selector) {
    return element.matches(selector);
  }

  /**
   * Find closest ancestor matching selector
   * @param {HTMLElement} element - Starting element
   * @param {string} selector - CSS selector
   * @returns {HTMLElement | null} Closest matching ancestor or null
   */
  closest(element, selector) {
    return element.closest(selector);
  }
}

// Export singleton instance for convenience
export const domAdapter = new DOMAdapter();
