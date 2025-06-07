/**
 * Stub for ink-testing-library
 * 
 * This provides a minimal implementation of the ink testing library
 * for tests that depend on it.
 */

import React from 'react';

/**
 * Mock render function for ink components
 * 
 * @param {React.ReactElement} component Component to render
 * @param {Object} options Render options
 * @returns {Object} Render result with helper methods
 */
export function render(component, options = {}) {
  // Create a minimal implementation that captures props and renders to string
  
  const renderResult = {
    frames: [''],
    lastFrame: '',
    stdin: {
      write: jest.fn(),
    },
    clear: jest.fn(),
    unmount: jest.fn(),
    cleanup: jest.fn(),
    rerender: jest.fn(),
    waitUntilExit: jest.fn().mockResolvedValue(undefined),
    debug: jest.fn(),
    
    // Extract text content (very simplified)
    toString() {
      return this.lastFrame;
    }
  };
  
  // Simulate rendering by converting component to a string representation
  const updateOutput = (comp = component) => {
    try {
      // This is a very simplified approach - in reality we'd need 
      // to properly traverse the React element tree
      let output = '';
      
      // Very basic rendering of some common elements
      const renderNode = (node) => {
        if (!node) return '';
        
        // React fragment
        if (node.type === React.Fragment) {
          return (node.props.children || [])
            .filter(Boolean)
            .map(renderNode)
            .join('');
        }
        
        // Text node
        if (typeof node === 'string' || typeof node === 'number') {
          return String(node);
        }
        
        // Component with children
        if (node.props && node.props.children) {
          if (Array.isArray(node.props.children)) {
            return node.props.children
              .filter(Boolean)
              .map(renderNode)
              .join('');
          }
          return renderNode(node.props.children);
        }
        
        return '';
      };
      
      output = renderNode(comp);
      renderResult.lastFrame = output;
      renderResult.frames.push(output);
    } catch (error) {
      renderResult.lastFrame = `[Error rendering component: ${error.message}]`;
    }
  };
  
  // Initial render
  updateOutput();
  
  // Override rerender to update output
  renderResult.rerender = (newComponent) => {
    updateOutput(newComponent);
  };
  
  return renderResult;
}

/**
 * Create a private stream for testing
 * 
 * @returns {Object} Stream object
 */
export function createStreams() {
  return {
    stdin: { write: jest.fn() },
    stdout: { 
      write: jest.fn(),
      columns: 80,
      rows: 24,
      on: jest.fn()
    }
  };
}