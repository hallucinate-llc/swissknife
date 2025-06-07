/**
 * Mock implementation of MCP Transport for testing
 */
import { MCPTransportType, MCPTransportOptions, MCPTransport } from '../../../src/services/mcp-transport.js';
/**
 * A mock implementation of MCPTransport for testing
 */
export declare class MockTransport implements MCPTransport {
    private options;
    private connected;
    private messageListeners;
    private disconnectListeners;
    private latency;
    private mockResponses;
    private messageLog;
    private shouldFailConnect;
    private shouldFailSend;
    private shouldFailReceive;
    constructor(options: MCPTransportOptions);
    /**
     * Set whether connect() should fail
     */
    setShouldFailConnect(shouldFail: boolean): void;
    /**
     * Set whether send() should fail
     */
    setShouldFailSend(shouldFail: boolean): void;
    /**
     * Set whether receive() should fail
     */
    setShouldFailReceive(shouldFail: boolean): void;
    /**
     * Set a mock response for a specific request
     */
    setMockResponse(requestId: string, response: any): void;
    /**
     * Get the log of messages that have been sent
     */
    getMessageLog(): any[];
    /**
     * Set the mock latency
     */
    setLatency(latencyMs: number): void;
    /**
     * Simulate receiving a message
     */
    simulateReceiveMessage(message: any): void;
    /**
     * Simulate disconnect
     */
    simulateDisconnect(): void;
    /**
     * Connect the transport
     */
    connect(): Promise<boolean>;
    /**
     * Disconnect the transport
     */
    disconnect(): Promise<void>;
    /**
     * Send a message
     */
    send(message: any): Promise<void>;
    /**
     * Receive a message
     */
    receive(): Promise<any>;
    /**
     * Check if connected
     */
    isConnected(): boolean;
    /**
     * Get the transport type
     */
    getType(): MCPTransportType;
    /**
     * Get the latency
     */
    getLatency(): number;
    /**
     * Add an event listener
     */
    on(event: 'message' | 'disconnect', listener: (...args: any[]) => void): void;
    /**
     * Remove an event listener
     */
    off(event: 'message' | 'disconnect', listener: (...args: any[]) => void): void;
    /**
     * Helper method to simulate delay
     */
    private delay;
}
