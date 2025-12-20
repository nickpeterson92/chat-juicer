/**
 * Bootstrap Validation System
 * Validates phase results to catch errors before propagation
 */

/**
 * Validation result
 * @typedef {Object} ValidationResult
 * @property {boolean} valid
 * @property {Array<string>} errors
 * @property {Array<string>} warnings
 */

/**
 * Validate phase result has required properties
 * @param {string} phaseName - Name of the phase
 * @param {Object} result - Phase result object
 * @param {Object} schema - Validation schema
 * @throws {Error} If required properties missing
 */
export function validatePhaseResult(phaseName, result, schema) {
  const errors = [];
  const warnings = [];

  // Check required properties
  if (schema.required) {
    for (const prop of schema.required) {
      if (!(prop in result) || result[prop] === null || result[prop] === undefined) {
        errors.push(`Missing required property: ${prop}`);
      }
    }
  }

  // Check optional properties (warn but don't fail)
  if (schema.optional) {
    for (const prop of schema.optional) {
      if (!(prop in result) || result[prop] === null || result[prop] === undefined) {
        warnings.push(`Optional property missing: ${prop}`);
      }
    }
  }

  // Check property types if specified
  if (schema.types) {
    for (const [prop, expectedType] of Object.entries(schema.types)) {
      if (prop in result && result[prop] !== null) {
        const actualType = typeof result[prop];
        if (actualType !== expectedType) {
          errors.push(`Property ${prop} has type ${actualType}, expected ${expectedType}`);
        }
      }
    }
  }

  // Check custom validators
  if (schema.validators) {
    for (const [prop, validator] of Object.entries(schema.validators)) {
      if (prop in result) {
        const validationResult = validator(result[prop]);
        if (!validationResult.valid) {
          errors.push(`Property ${prop} validation failed: ${validationResult.error}`);
        }
      }
    }
  }

  // Log warnings
  if (warnings.length > 0) {
    console.warn(`⚠️ Phase ${phaseName} validation warnings:`, warnings);
  }

  // Throw if errors
  if (errors.length > 0) {
    throw new Error(`Phase ${phaseName} validation failed:\n  - ${errors.join("\n  - ")}`);
  }

  console.log(`✅ Phase ${phaseName} validation passed`);
}

/**
 * Validate adapter interface
 */
export function validateAdapterInterface(adapter, requiredMethods) {
  return {
    valid: requiredMethods.every((method) => typeof adapter[method] === "function"),
    error: requiredMethods.find((method) => typeof adapter[method] !== "function")
      ? `Missing method: ${requiredMethods.find((method) => typeof adapter[method] !== "function")}`
      : null,
  };
}

/**
 * Validate DOM element exists
 */
export function validateDOMElement(elementId) {
  const element = document.getElementById(elementId);
  return {
    valid: element !== null,
    error: element ? null : `Element #${elementId} not found in DOM`,
  };
}

/**
 * Validate service interface
 */
export function validateServiceInterface(service, requiredMethods) {
  const missing = requiredMethods.filter((method) => typeof service[method] !== "function");
  return {
    valid: missing.length === 0,
    error: missing.length > 0 ? `Missing methods: ${missing.join(", ")}` : null,
  };
}
