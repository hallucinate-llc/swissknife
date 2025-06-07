import { TrafficManager } from '../../../../src/services/mcp-traffic-manager';
import { ServerRegistry } from '../../../../src/services/mcp-registry';
import { VersionedServerConfig } from '../../../../src/types/mcp'; // Assuming this type exists
import { connectToServer } from '../../../../src/services/mcpClient'; // Assuming this function exists

const waitFor = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Unit tests for the TrafficManager component
 */

// Mock the registry
jest.mock('../../../../src/services/mcp-registry', () => {
    const mockRegistry = {
        initialize: jest.fn().mockResolvedValue(undefined),
        getActiveServerVersions: jest.fn(),
        getServerVersion: jest.fn(),
        updateTrafficPercentage: jest.fn().mockReturnValue(true),
        getInstance: jest.fn()
    };
    return {
        ServerRegistry: {
            getInstance: jest.fn().mockReturnValue(mockRegistry)
        }
    };
});

// Mock the connectToServer function
jest.mock('../../../../src/services/mcpClient', () => ({
    connectToServer: jest.fn()
}));

// Mock the logging utilities
jest.mock('../../../../src/utils/log', () => ({
    logEvent: jest.fn(),
    logError: jest.fn()
}));


describe('TrafficManager', () => {
  afterEach(() => jest.clearAllTimers());
  jest.setTimeout(120000);

    let trafficManager: TrafficManager;
    let mockRegistry: jest.Mocked<ServerRegistry>;

    beforeEach(() => {
        jest.clearAllMocks();
        // Get the singleton instance
        trafficManager = TrafficManager.getInstance();
        mockRegistry = ServerRegistry.getInstance() as jest.Mocked<ServerRegistry>;
        // Force re-initialization
        // @ts-ignore - accessing private field for testing
        trafficManager.initialized = false;
    });

    it('should return the same instance (singleton pattern)', () => {
        const instance1 = TrafficManager.getInstance();
        const instance2 = TrafficManager.getInstance();
        expect(instance1).toBe(instance2);
    });

    it('should initialize and ensure registry is initialized', async () => {
        await trafficManager.initialize();
        expect(mockRegistry.initialize).toHaveBeenCalled();
        // @ts-ignore - accessing private field for testing
        expect(trafficManager.initialized).toBe(true);
    });

    it('should throw if methods are called before initialization', async () => {
        await expect(trafficManager.getClientForRequest('test-server'))
            .rejects.toThrow('TrafficManager not initialized');
    });

    describe('getClientForRequest', () => {
        beforeEach(async () => {
            // Initialize the manager
            await trafficManager.initialize();
        });

        it('should return null if no active servers are available', async () => {
            mockRegistry.getActiveServerVersions.mockReturnValue([]);
            const client = await trafficManager.getClientForRequest('test-server');
            expect(client).toBeNull();
            expect(mockRegistry.getActiveServerVersions).toHaveBeenCalledWith('test-server');
        });

        it('should select a server based on traffic allocation', async () => {
            // Mock two active servers
            const mockServers: VersionedServerConfig[] = [
                {
                    version: '1.0.0',
                    status: 'blue',
                    trafficPercentage: 80,
                    type: 'stdio',
                    command: 'echo',
                    args: ['blue']
                },
                {
                    version: '2.0.0',
                    status: 'green',
                    trafficPercentage: 20,
                    type: 'stdio',
                    command: 'echo',
                    args: ['green']
                }
            ];
            mockRegistry.getActiveServerVersions.mockReturnValue(mockServers);

            // Mock successful connection
            const mockClient = {};
            (connectToServer as jest.Mock).mockResolvedValue(mockClient);

            // Request client multiple times and count selections
            const selections = { '1.0.0': 0, '2.0.0': 0 };
            const iterations = 100;
            for (let i = 0; i < iterations; i++) {
                // Clear the cache each time to force selection
                // @ts-ignore - accessing private method for testing
                trafficManager.clearCache();
                const client = await trafficManager.getClientForRequest('test-server');

                // Check which server was selected by examining the connection call
                const lastCall = (connectToServer as jest.Mock).mock.calls.length - 1;
                const serverConfigArg = (connectToServer as jest.Mock).mock.calls[lastCall][0];

                if (serverConfigArg.version === '1.0.0') {
                    selections['1.0.0']++;
                } else if (serverConfigArg.version === '2.0.0') {
                    selections['2.0.0']++;
                }
            }

            // Check roughly 80/20 distribution
            // Allow some variance because it's random
            expect(selections['1.0.0']).toBeGreaterThan(iterations * 0.7); // ~80%
            expect(selections['2.0.0']).toBeLessThan(iterations * 0.3); // ~20%
        });

        it('should filter servers based on version constraint', async () => {
            // Mock multiple active servers
            const mockServers: VersionedServerConfig[] = [
                {
                    version: '1.0.0',
                    status: 'blue',
                    trafficPercentage: 50,
                    type: 'stdio',
                    command: 'echo',
                    args: ['v1']
                },
                {
                    version: '1.5.0',
                    status: 'green',
                    trafficPercentage: 30,
                    type: 'stdio',
                    command: 'echo',
                    args: ['v1.5']
                },
                {
                    version: '2.0.0',
                    status: 'green',
                    trafficPercentage: 20,
                    type: 'stdio',
                    command: 'echo',
                    args: ['v2']
                }
            ];
            mockRegistry.getActiveServerVersions.mockReturnValue(mockServers);

            // Mock successful connection
            const mockClient = {};
            (connectToServer as jest.Mock).mockResolvedValue(mockClient);

            // Request with >=1.5.0 constraint
            await trafficManager.getClientForRequest('test-server', '>=1.5.0');

            // Check which servers were selected (should be 1.5.0 or 2.0.0)
            const calls = (connectToServer as jest.Mock).mock.calls;
            const selectedVersions = calls.map(call => call[0].version);

            expect(selectedVersions).not.toContain('1.0.0');
            expect(selectedVersions).toEqual(expect.arrayContaining(['1.5.0', '2.0.0']));
        });

        it('should cache client connections', async () => {
            // Mock a single active server
            const mockServer: VersionedServerConfig = {
                version: '1.0.0',
                status: 'blue',
                trafficPercentage: 100,
                type: 'stdio',
                command: 'echo',
                args: ['blue']
            };
            mockRegistry.getActiveServerVersions.mockReturnValue([mockServer]);

            // Mock successful connection
            const mockClient = {};
            (connectToServer as jest.Mock).mockResolvedValue(mockClient);

            // First request should create connection
            const client1 = await trafficManager.getClientForRequest('test-server');
            expect(connectToServer).toHaveBeenCalledTimes(1);

            // Second request should use cached connection
            const client2 = await trafficManager.getClientForRequest('test-server');
            expect(connectToServer).toHaveBeenCalledTimes(1); // Still 1 call

            // Both should return the same client
            expect(client1).toBe(client2);
        });
    });

    describe('Traffic shifting', () => {
        beforeEach(async () => {
            // Initialize the manager
            await trafficManager.initialize();

            // Mock server versions
            mockRegistry.getServerVersion.mockImplementation((name: string, version: string) => {
                if (name === 'test-server') {
                    if (version === '1.0.0') {
                        return {
                            version: '1.0.0',
                            status: 'blue',
                            trafficPercentage: 80,
                            type: 'stdio',
                            command: 'echo',
                            args: ['blue']
                        } as VersionedServerConfig;
                    } else if (version === '2.0.0') {
                        return {
                            version: '2.0.0',
                            status: 'green',
                            trafficPercentage: 20,
                            type: 'stdio',
                            command: 'echo',
                            args: ['green']
                        } as VersionedServerConfig;
                    }
                }
                return null;
            });
        });

        it('should gradually shift traffic between versions', async () => {
            // Speed up test by using small interval
            const stepSize = 20;
            const stepInterval = 10; // 10ms between steps

            // Mock Date.now for predictable behavior
            const realDateNow = Date.now;
            let currentTime = 1600000000000;
            global.Date.now = jest.fn(() => currentTime);

            // Start shift from 20% to 100%
            const shiftPromise = trafficManager.shiftTraffic(
                'test-server',
                '1.0.0', // from
                '2.0.0', // to
                100, // target
                stepSize,
                stepInterval
            );

            // Advance time and let traffic shift steps execute
            // Need to advance time and wait for all promises
            currentTime += stepInterval;
            await new Promise(resolve => setTimeout(resolve, stepInterval * 2));
            currentTime += stepInterval;
            await new Promise(resolve => setTimeout(resolve, stepInterval * 2));
            currentTime += stepInterval;
            await new Promise(resolve => setTimeout(resolve, stepInterval * 2));
            currentTime += stepInterval;
            await new Promise(resolve => setTimeout(resolve, stepInterval * 2));


            // Wait for shift to complete
            const result = await shiftPromise;
            expect(result).toBe(true);

            // Should have updated traffic percentages for each step
            // From 20% to 100% in steps of 20% = 5 updates
            // (including initial state)
            expect(mockRegistry.updateTrafficPercentage).toHaveBeenCalledTimes(8); // Initial + 4 steps + final

            // Final call should set target to 100%
            const calls = mockRegistry.updateTrafficPercentage.mock.calls;
            expect(calls[calls.length - 2][1]).toBe('2.0.0');
            expect(calls[calls.length - 2][2]).toBe(100);


            // Restore Date.now
            global.Date.now = realDateNow;
        });

        it('should set traffic distribution immediately', async () => {
            const distribution = {
                '1.0.0': 40,
                '2.0.0': 60
            };

            const result = trafficManager.setTrafficDistribution('test-server', distribution);
            expect(result).toBe(true);

            expect(mockRegistry.updateTrafficPercentage).toHaveBeenCalledTimes(2);

            // Check calls to update traffic
            const calls = mockRegistry.updateTrafficPercentage.mock.calls;
            const v1Calls = calls.filter(call => call[1] === '1.0.0');
            const v2Calls = calls.filter(call => call[1] === '2.0.0');

            expect(v1Calls.length).toBe(1);
            expect(v2Calls.length).toBe(1);
            expect(v1Calls[0][2]).toBe(40);
            expect(v2Calls[0][2]).toBe(60);
        });
    });

    describe('Version constraint matching', () => {
        beforeEach(async () => {
            await trafficManager.initialize();
        });

        const testCases = [
            // Exact matches
            { version: '1.0.0', constraint: '1.0.0', expected: true },
            { version: '1.0.0', constraint: '2.0.0', expected: false },

            // Greater than
            { version: '2.0.0', constraint: '>1.0.0', expected: true },
            { version: '1.0.0', constraint: '>1.0.0', expected: false },
            { version: '0.9.0', constraint: '>1.0.0', expected: false },

            // Greater than or equal
            { version: '2.0.0', constraint: '>=1.0.0', expected: true },
            { version: '1.0.0', constraint: '>=1.0.0', expected: true },
            { version: '0.9.0', constraint: '>=1.0.0', expected: false },

            // Less than
            { version: '0.9.0', constraint: '<1.0.0', expected: true },
            { version: '1.0.0', constraint: '<1.0.0', expected: false },
            { version: '1.1.0', constraint: '<1.0.0', expected: false },

            // Less than or equal
            { version: '0.9.0', constraint: '<=1.0.0', expected: true },
            { version: '1.0.0', constraint: '<=1.0.0', expected: true },
            { version: '1.1.0', constraint: '<=1.0.0', expected: false },

            // Tilde ranges (~)
            { version: '1.2.3', constraint: '~1.2.0', expected: true },
            { version: '1.2.0', constraint: '~1.2.0', expected: true },
            { version: '1.3.0', constraint: '~1.2.0', expected: false },
            { version: '2.0.0', constraint: '~1.2.0', expected: false },

            // Caret ranges (^)
            { version: '1.2.3', constraint: '^1.0.0', expected: true },
            { version: '1.9.9', constraint: '^1.0.0', expected: true },
            { version: '2.0.0', constraint: '^1.0.0', expected: false },
            { version: '0.9.0', constraint: '^1.0.0', expected: false },
        ];

        testCases.forEach(({ version, constraint, expected }) => {
            it(`should ${expected ? 'match' : 'not match'} version ${version} with constraint ${constraint}`, () => {
                // @ts-ignore - accessing private method for testing
                const result = trafficManager.matchesVersionConstraint(version, constraint);
                expect(result).toBe(expected);
            });
        });
    });
});
