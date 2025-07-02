import * as React from 'react.js.js.js.js.js';
import type { Command, LocalJSXCommand } from '../types/command.js.js.js.js.js.js.js.js.js.js.js'; // Updated import path
import { ModelSelector } from '../components/ModelSelector.js.js.js.js.js.js.js.js.js.js.js'; // Assuming .js extension
import { enableConfigs } from '../utils/config.js.js.js.js.js.js.js.js.js.js.js'; // Assuming .js extension

const modelCommand: LocalJSXCommand = {
  name: 'model',
  description: 'Change your AI provider and model settings',
  options: [], // No options for this command
  isEnabled: true,
  isHidden: false,
  type: 'local-jsx',
  userFacingName(): string {
    return this.name;
  },
  async handler(args, onDone, context) { // Renamed call to handler, args is unused
    enableConfigs();
    // context.abortController?.abort?.(); // Removed: abortController not in context type
    return (
      <ModelSelector
        onDone={() => {
          onDone();
        }}
      />
    );
  },
} satisfies Command;

export default modelCommand;

// Note: The exported 'help' variable is removed as description covers it.
