// src/ai/models/openai-model.ts

import { BaseModel, IModel, ModelCapabilities, ModelGenerateInput, ModelGenerateOutput, ModelOptions } from './model.js';
import { AgentMessage, ThinkingPattern, ThinkingResult, ToolCallResult, ToolSelectionResult, Status } from '../../types/ai.js';
import { ConfigurationManager } from '../../config/manager.js';
import { logger } from '../../utils/logger.js';

/**
 * OpenAI API response for chat completions
 */
interface OpenAIChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
      tool_calls?: Array<{
        id: string;
        type: string;
        function: {
          name: string;
          arguments: string;
        };
      }>;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Options for configuring the OpenAI model
 */
export interface OpenAIModelOptions {
  apiKey?: string;
  apiUrl?: string;
  modelName?: string;
}

/**
 * Implementation of the Model interface for OpenAI models
 */
export class OpenAIModel extends BaseModel {
  private apiKey: string;
  private apiUrl: string;
  private configManager: ConfigurationManager;
  
  constructor(options: ModelOptions, openaiOptions: OpenAIModelOptions = {}) {
    super(options); // Pass ModelOptions to BaseModel constructor
    
    this.configManager = ConfigurationManager.getInstance();
    
    // Get API key from openaiOptions, config, or environment variable
    this.apiKey = openaiOptions.apiKey || 
      this.configManager.get<string>('ai.openai.apiKey') || 
      process.env.OPENAI_API_KEY || 
      '';
      
    if (!this.apiKey) {
      logger.warn('No OpenAI API key provided. The model will not function correctly.');
    }
    
    this.apiUrl = openaiOptions.apiUrl || 
      this.configManager.get<string>('ai.openai.apiUrl', 'https://api.openai.com/v1');
      
    logger.debug(`OpenAIModel initialized for model ${this.name}`); // Use this.name from BaseModel
  }
  
  /**
   * Generates a response to a message using the OpenAI API
   */
  async generate(input: ModelGenerateInput): Promise<ModelGenerateOutput> {
    // Call the super.generate method first to handle common logic and usage tracking
    const baseOutput = await super.generate(input);

    try {
      // Format messages for the OpenAI API
      const messages = this.formatMessagesForAPI(input.prompt, input.messages || []);
      
      // Make API call
      const response = await this.callOpenAIAPI(messages, input);
      
      // Extract and return content
      const content = response.choices[0]?.message?.content || '';
      
      // Log token usage for cost tracking
      if (response.usage) {
        logger.debug(`Token usage: ${JSON.stringify(response.usage)}`);
      }
      
      return {
        ...baseOutput, // Include base output properties
        content: content,
        status: baseOutput.status, // Assuming status is handled by BaseModel or remains COMPLETED
        modelUsed: this.id,
        usage: response.usage ? {
          promptTokens: response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens,
        } : baseOutput.usage,
        cost: baseOutput.cost, // Assuming cost is handled by BaseModel or calculated here
      };
    } catch (error) {
      logger.error('Error generating response with OpenAI:', error);
      return {
        ...baseOutput,
        status: Status.FAILED,
        error: `Failed to generate response: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
  
  /**
   * Generates structured thinking using the OpenAI API
   */
  async generateStructuredThinking(
    prompt: string,
    options: ModelGenerateInput = {}
  ): Promise<ThinkingResult> {
    const startTime = Date.now();
    const pattern = options.pattern || ThinkingPattern.GraphOfThought;
    
    try {
      // Create a system message based on the thinking pattern
      const systemMessage = this.getThinkingSystemPrompt(pattern);
      
      // Format messages for the API
      const messages = [
        { role: 'system', content: systemMessage },
        { role: 'user', content: prompt }
      ];
      
      // Make API call with structured output format
      const response = await this.callOpenAIAPI(messages, {
        ...options,
        structuredOutput: true,
        structuredOutputFormat: {
          steps: [{ content: 'string', type: 'string' }],
          summary: 'string'
        }
      });
      
      // Extract and parse the structured thinking result
      const content = response.choices[0]?.message?.content || '{}';
      let parsedThinking;
      
      try {
        parsedThinking = JSON.parse(content);
      } catch (parseError) {
        // If parsing fails, create a basic structure from the raw content
        parsedThinking = {
          steps: [{ content, type: 'thinking' }],
          summary: content.slice(0, 100) + (content.length > 100 ? '...' : '')
        };
      }
      
      const elapsedTime = Date.now() - startTime;
      
      return {
        pattern,
        steps: parsedThinking.steps || [],
        summary: parsedThinking.summary || '',
        timestamp: new Date().toISOString(),
        elapsedTimeMs: elapsedTime
      };
    } catch (error) {
      logger.error('Error generating structured thinking with OpenAI:', error);
      
      // Return a simplified thinking result on error
      return {
        pattern,
        steps: [],
        summary: 'Error during thinking analysis',
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
        elapsedTimeMs: Date.now() - startTime
      };
    }
  }
  
  /**
   * Determines which tools should be called for a user request
   */
  async generateToolSelection(
    prompt: string,
    options: ModelGenerateInput = {}
  ): Promise<ToolSelectionResult> {
    if (!options.availableTools || options.availableTools.length === 0) {
      return { toolCalls: [] };
    }
    
    try {
      // Create a system message for tool selection
      const systemMessage = `
You are an assistant that helps determine which tools to use to respond to a user's message.
You have access to the following tools:

${options.availableTools.map(tool => {
  return `Tool: ${tool.name}
Description: ${tool.description}
Parameters: ${tool.parameters.map(p => `${p.name} (${p.type}${p.required ? ', required' : ''}): ${p.description}`).join(', ')}`;
}).join('\n\n')}

Analyze the user's message and determine which tools should be called, if any.
If no tools are needed, respond with an empty list.
When suggesting tool calls, provide the tool name and the arguments as a properly formatted JSON object.
`;
      
      // Format messages for the API
      const messages = [
        { role: 'system', content: systemMessage },
        { role: 'user', content: prompt }
      ];
      
      // Make API call with tool calling functionality enabled
      const response = await this.callOpenAIAPI(messages, {
        ...options,
        enableToolCalling: true,
        tools: options.availableTools.map(tool => ({
          type: 'function',
          function: {
            name: tool.name,
            description: tool.description,
            parameters: {
              type: 'object',
              properties: (tool.parameters as any[]).reduce((acc: Record<string, any>, param: any) => {
                acc[param.name] = {
                  type: param.type,
                  description: param.description
                };
                return acc;
              }, {} as Record<string, any>),
              required: (tool.parameters as any[]).filter((p: any) => p.required).map((p: any) => p.name)
            }
          }
        }))
      });
      
      // Extract tool calls from the response
      const toolCalls = response.choices[0]?.message?.tool_calls || [];
      
      // Format tool calls for our internal structure
      const formattedToolCalls = toolCalls.map((toolCall: any) => {
        try {
          const args = JSON.parse(toolCall.function.arguments);
          return {
            toolName: toolCall.function.name,
            args
          };
        } catch (error) {
          logger.error(`Error parsing tool arguments for ${toolCall.function.name}:`, error);
          return {
            toolName: toolCall.function.name,
            args: {},
            error: `Failed to parse arguments: ${error instanceof Error ? error.message : String(error)}`
          };
        }
      });
      
      return {
        toolCalls: formattedToolCalls,
        reasoning: response.choices[0]?.message?.content || 'No explicit reasoning provided.'
      };
    } catch (error) {
      logger.error('Error generating tool selection with OpenAI:', error);
      return { toolCalls: [] };
    }
  }
  
  /**
   * Generates a response that incorporates tool results
   */
  async generateResponseWithToolResults(
    message: string,
    history: AgentMessage[] = [],
    toolResults: ToolCallResult[],
    options: ModelGenerateInput = {}
  ): Promise<string> {
    try {
      // Format messages for the OpenAI API, including tool results
      const messages = this.formatMessagesForAPIWithToolResults(message, history, toolResults);
      
      // Make API call
      const response = await this.callOpenAIAPI(messages, options);
      
      // Extract and return content
      return response.choices[0]?.message?.content || '';
    } catch (error) {
      logger.error('Error generating response with tool results:', error);
      throw new Error(`Failed to generate response with tool results: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Calls the OpenAI API with formatted messages
   * @private
   */
  private async callOpenAIAPI(
    messages: Array<{role: string, content: string}>,
    options: ModelGenerateInput & {
      structuredOutput?: boolean,
      structuredOutputFormat?: any,
      enableToolCalling?: boolean,
      tools?: any[]
    } = {}
  ): Promise<OpenAIChatResponse> {
    // Prepare request body
    const requestBody: Record<string, any> = {
      model: this.id,
      messages,
      temperature: options.temperature !== undefined ? options.temperature : 0.7,
      max_tokens: options.maxTokens || 1000
    };
    
    // Add stop sequences if provided
    if (options.stopSequences) {
      requestBody.stop = options.stopSequences;
    }
    
    // Add response format for structured output
    if (options.structuredOutput && options.structuredOutputFormat) {
      requestBody.response_format = { type: 'json_object', schema: options.structuredOutputFormat };
    }
    
    // Add tools if tool calling is enabled
    if (options.enableToolCalling && options.tools) {
      requestBody.tools = options.tools;
      requestBody.tool_choice = 'auto';
    }
    
    // Make the API call
    const response = await fetch(`${this.apiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(requestBody)
    });
    
    // Check for errors
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
    }
    
    // Parse and return response
    const data = await response.json();
    return data as OpenAIChatResponse;
  }
  
  /**
   * Formats messages for the OpenAI API
   * @private
   */
  private formatMessagesForAPI(
    message: string,
    history: AgentMessage[] = []
  ): Array<{role: string, content: string}> {
    // Start with system message for context
    const messages: Array<{role: string, content: string}> = [
      {
        role: 'system',
        content: 'You are a helpful AI assistant. Provide clear, concise, and accurate responses to user queries.'
      }
    ];
    
    // Add conversation history
    for (const msg of history) {
      messages.push({
        role: msg.role,
        content: msg.content
      });
    }
    
    // Add the current message
    messages.push({
      role: 'user',
      content: message
    });
    
    return messages;
  }
  
  /**
   * Formats messages for the OpenAI API including tool results
   * @private
   */
  private formatMessagesForAPIWithToolResults(
    message: string,
    history: AgentMessage[] = [],
    toolResults: ToolCallResult[] = []
  ): Array<{role: string, content: string}> {
    // Start with basic message formatting
    const messages = this.formatMessagesForAPI(message, history);
    
    // Add tool results as an assistant message
    const toolResultsContent = toolResults.map(result => {
      return `Tool: ${result.toolName}
Arguments: ${JSON.stringify(result.args)}
Result: ${JSON.stringify(result.result)}
Success: ${result.success}${result.error ? `\nError: ${result.error}` : ''}`;
    }).join('\n\n');
    
    if (toolResultsContent) {
      messages.push({
        role: 'assistant',
        content: `I executed the following tools based on your request:\n\n${toolResultsContent}\n\nHere's my analysis and response based on these results:`
      });
    }
    
    return messages;
  }
  
  /**
   * Gets the appropriate system prompt for different thinking patterns
   * @private
   */
  private getThinkingSystemPrompt(pattern: ThinkingPattern): string {
    switch (pattern) {
      case ThinkingPattern.GraphOfThought:
        return `
You are an analytical thinking engine that processes complex questions and problems.
Use a Graph-of-Thought approach to break down the user's message:
1. Identify the core intent and objectives
2. Break down complex requests into component parts
3. Identify dependencies between different parts
4. Consider multiple approaches to solving the problem
5. Evaluate strengths and weaknesses of different approaches
6. Form a clear plan of action

Provide your analysis in JSON format with:
- "steps": An array of thinking steps, each with "content" and "type"
- "summary": A concise summary of your analysis
`;

      case ThinkingPattern.ChainOfThought:
        return `
You are an analytical thinking engine that processes questions and problems step by step.
Use a Chain-of-Thought approach to analyze the user's message:
1. Identify the main request or question
2. Break it down step-by-step
3. Reason through your thinking process sequentially
4. Reach a conclusion based on your reasoning steps

Provide your analysis in JSON format with:
- "steps": An array of thinking steps, each with "content" and "type"
- "summary": A concise summary of your analysis
`;

      case ThinkingPattern.Direct:
      default:
        return `
Identify the core intent of the user's message and any key requirements.
Be direct and straightforward.

Provide your analysis in JSON format with:
- "steps": An array with a single thinking step
- "summary": A concise summary of the user's intent
`;
    }
  }
}
