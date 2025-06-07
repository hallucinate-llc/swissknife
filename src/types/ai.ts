import { CID, Status, TaskID } from './common.js';
import { StorageProvider } from './storage.js'; 
import { TaskManager } from '../tasks/manager.js'; 
import { InferenceExecutor } from '../ml/inference/executor.js'; 
import { z, ZodType } from 'zod'; 

/**
 * Represents the input parameters for an AI model generation request.
 */
export interface ModelGenerateInput {
  prompt: string;
  temperature?: number;
  maxTokens?: number;
  stopSequences?: string[];
  taskId?: TaskID; 
  userId?: string;
  messages?: AgentMessage[]; // Added for chat history
  availableTools?: Tool[]; // Added for tool selection
  pattern?: ThinkingPattern; // Added for structured thinking
}

/**
 * Represents the output from an AI model generation request.
 */
export interface ModelGenerateOutput {
  content: string; 
  status: Status; 
  modelUsed?: string; 
  usage?: { 
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  cost?: number; 
  error?: string; 
}

/**
 * Options for constructing a Model class instance.
 */
export interface ModelOptions {
  id: string;
  name: string;
  provider: string;
  parameters?: Record<string, any>;
  metadata?: Record<string, any>;
}

export enum ModelProvider {
  OPENAI = "openai",
  ANTHROPIC = "anthropic",
  GOOSE = "goose", // For custom/local models like 'goose'
  VERTEX = "vertex", // For Google Vertex AI
  BEDROCK = "bedrock", // For AWS Bedrock
  CUSTOM = "custom", // For other local or self-hosted models
  UNKNOWN = "unknown",
}

/**
 * Interface defining the contract for AI model providers.
 */
export interface IModel { // Renamed from Model to IModel
  readonly id: string; 
  getName(): string; // Added for logging/identification
  getProvider(): string; // Added for consistency
  generate(input: ModelGenerateInput): Promise<ModelGenerateOutput>;
  // Optional method to retrieve the latest token usage metrics
  getLastUsageMetrics?(): Promise<{
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  }>;
  // Potentially other methods like getParameters, setParameter if part of general contract
}

/**
 * Represents the input arguments for a Tool execution.
 * Defined by the tool's specific Zod input schema.
 */
export type ToolInput<T extends ZodType = ZodType> = z.infer<T>;

/**
 * Represents the output/result from a Tool execution.
 */
export type ToolOutput = string | Record<string, any> | Buffer; 

/**
 * Represents the context provided to a Tool during execution.
 */
export interface ToolExecutionContext {
  config: import('../config/manager.js').ConfigManager;  // Fixed to use ConfigManager
  storage: StorageProvider;
  taskManager: TaskManager; 
  taskId?: TaskID;
  userId?: string;
  callTool?: (toolName: string, input: Record<string, any>) => Promise<ToolOutput>; // Input type changed
  inferenceExecutor?: InferenceExecutor; 
}

/**
 * Interface defining the contract for Tools that the AI Agent can use.
 * Uses Zod for input schema definition and validation.
 */
export interface Tool<T extends ZodType = ZodType> {
  readonly name: string;
  readonly description: string;
  /**
   * Zod schema definition for the expected input arguments.
   * Used for validation and potentially by the AI model for formatting requests.
   */
  readonly inputSchema: T; 

  /**
   * Executes the tool's logic.
   * @param input The input arguments, validated against inputSchema by the ToolExecutor.
   * @param context Execution context providing access to resources.
   * @returns A promise resolving to the tool's output.
   */
  execute(input: ToolInput<T>, context: ToolExecutionContext): Promise<ToolOutput>;
}

/**
 * Represents the context available to the AI Agent during its operation.
 */
export interface AgentContext {
  config: import('../config/manager.js').ConfigManager; // Use ConfigManager directly
  storage: StorageProvider;
  // Add other shared resources or state needed by the agent
}

/**
 * Thinking pattern types supported by the AI system
 */
export enum ThinkingPattern {
  Direct = 'direct',            // Simple, direct thinking
  ChainOfThought = 'chain',     // Sequential, step-by-step thinking
  GraphOfThought = 'graph',     // Branching, interconnected thinking paths
  TreeOfThoughts = 'tree'       // Tree-structured exploration of options
}

/**
 * Options for configuring an Agent
 */
export interface AgentOptions {
  /** Model to use for generating responses */
  model: IModel; // Changed to IModel
  /** Maximum tokens to generate in responses */
  maxTokens?: number;
  /** Temperature setting for response generation */
  temperature?: number;
  /** Priority for agent tasks in the task system */
  priority?: number;
  /** Tools available to the agent */
  tools?: Tool[];
  /** Task manager for creating agent tasks */
  taskManager?: TaskManager;
  /** Default thinking pattern to use */
  defaultThinkingPattern?: ThinkingPattern;
  /** Whether to stream responses */
  stream?: boolean;
}

/**
 * Message in an agent conversation
 */
export interface AgentMessage {
  /** Role of the message sender (user or assistant) */
  role: 'user' | 'assistant' | 'system';
  /** Content of the message */
  content: string;
  /** Unique ID for the message */
  id: string;
  /** ID of the conversation this message belongs to */
  conversationId: string;
  /** Timestamp when the message was created */
  timestamp: string;
  /** Optional thinking process for assistant messages */
  thinking?: ThinkingResult;
  /** Optional tool results for assistant messages */
  toolResults?: ToolCallResult[];
  /** Optional token usage statistics */
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  /** Optional error if message processing failed */
  error?: string;
}

/**
 * Result of the agent's thinking process
 */
export interface ThinkingResult {
  /** Thinking pattern used */
  pattern: ThinkingPattern;
  /** Individual thinking steps */
  steps?: Array<{
    /** Step content */
    content: string;
    /** Step type or label */
    type?: string;
  }>;
  /** Summary of the thinking process */
  summary?: string;
  /** Error encountered during thinking */
  error?: string;
  /** Timestamp when thinking was performed */
  timestamp: string;
  /** Time taken for thinking in milliseconds */
  elapsedTimeMs?: number;
}

/**
 * Represents a tool that should be called
 */
export interface ToolCall {
  /** Name of the tool to call */
  toolName: string;
  /** Arguments to pass to the tool */
  args: Record<string, any>;
  /** Optional reason for calling this tool */
  reason?: string;
}

/**
 * Result of executing a tool
 */
export interface ToolCallResult {
  /** Name of the tool that was called */
  toolName: string;
  /** Arguments that were passed to the tool */
  args: Record<string, any>;
  /** Result returned by the tool */
  result: any;
  /** Whether the tool execution succeeded */
  success: boolean;
  /** Error message if the tool execution failed */
  error?: string;
  /** Timestamp when the tool was executed */
  timestamp: string;
}

/**
 * Result of tool selection by the model
 */
export interface ToolSelectionResult {
  /** Tools that should be called */
  toolCalls: ToolCall[];
  /** Reasoning for the tool selection */
  reasoning?: string;
}

// --- Added for Model Definitions ---

/**
 * Represents the configuration for a single model variant within a provider.
 * This is used for defining models, which are then instantiated into Model class instances.
 */
export interface ModelDefinition {
  id: string;                 // Unique ID for the model, e.g., "gpt-3.5-turbo"
  name: string;               // Human-readable name, e.g., "GPT-3.5 Turbo"
  provider: string;           // Provider ID string, should match a ModelProvider enum value
  parameters?: Record<string, any>; // Default parameters like maxTokens, temperature
  metadata?: Record<string, any>;   // Other metadata like capabilities, source, context window size
  // Deprecated fields that should be moved to parameters or metadata:
  // maxTokens?: number; (move to parameters)
  // capabilities?: Record<string, any>; (move to metadata)
  // source?: string; (move to metadata)
}

/**
 * Represents the definition of a model provider and its available models.
 */
export interface ProviderDefinition {
  id: string;                 // Unique ID for the provider, e.g., "openai"
  name: string;               // Human-readable name, e.g., "OpenAI"
  baseURL?: string;            // Base API URL for the provider
  envVar?: string;             // Environment variable for the API key
  defaultModel?: string;       // ID of the default model for this provider
  models: ModelDefinition[];  // List of model definitions offered by this provider
}
